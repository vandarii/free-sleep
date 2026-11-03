import moment from 'moment-timezone';
import type { AutopilotSideSettings, Settings } from '@api/settingsSchema.ts';
import type {
  AmbientRecord,
  AutopilotDecision,
  AutopilotSideStatus,
  AutopilotStatus,
  SessionDetail,
  SleepSession,
} from '@api/autopilot.ts';

type Side = 'left' | 'right';

export const createAutopilotSettings = (enabled = true): AutopilotSideSettings => ({
  enabled,
  dryRun: true,
  baseTemperatureF: 72,
  entryTemperatureF: 76,
  earlyCoolF: 3,
  wakeRiseF: 4,
  napTemperatureF: 72,
  maxAdjustmentF: 4,
  minMinutesBetweenChanges: 20,
  autoEndAbsentMinutes: 60,
  maxSessionHours: 14,
  napMaxMinutes: 90,
  roomCompensation: { enabled: false, referenceC: 20, calibrationOffsetC: 0 },
});

const sessions: SleepSession[] = [];
const decisions: AutopilotDecision[] = [];
const ambient: AmbientRecord[] = [];
let nextSessionId = 1;
let nextDecisionId = 1;

const nowSeconds = () => moment().unix();

type DecisionFields = Pick<AutopilotDecision, 'stage' | 'targetF' | 'setF' | 'reason' | 'detail'>;

const addDecision = (sessionId: number, timestamp: number, partial: DecisionFields) => {
  decisions.push({ id: nextDecisionId++, sessionId, timestamp, dryRun: true, ...partial });
};

// Builds a believable past night: stage changes, a cold-room warm-up and a wake ramp
const seedNight = (side: Side, nightsAgo: number) => {
  const start = moment().subtract(nightsAgo, 'days').startOf('day').subtract(20, 'minutes').unix();
  const end = start + 8.5 * 3600;
  const session: SleepSession = {
    id: nextSessionId++, side, startedAt: start, endedAt: end, endReason: 'manual', startSource: 'tap',
    isNap: false, napRequested: false, wakeAt: end, dryRun: true,
  };
  sessions.push(session);
  const at = (minutes: number) => start + minutes * 60;
  addDecision(session.id, at(0), { stage: 'entry', targetF: 76, setF: 76, reason: 'schedule', detail: null });
  for (let step = 1; step <= 6; step++) {
    const targetF = 76 - step;
    addDecision(session.id, at(15 + step * 7.5), { stage: 'cooling', targetF, setF: targetF, reason: 'schedule', detail: null });
  }
  for (let step = 1; step <= 2; step++) {
    const targetF = 70 + step;
    addDecision(session.id, at(190 + step * 45), { stage: 'easing', targetF, setF: targetF, reason: 'schedule', detail: null });
  }
  addDecision(session.id, at(340), { stage: 'steady', targetF: 72, setF: 69, reason: 'room', detail: 'Room warm at 23.4 °C' });
  addDecision(session.id, at(400), { stage: 'steady', targetF: 72, setF: 72, reason: 'room', detail: 'Room back to normal' });
  for (let step = 1; step <= 4; step++) {
    const targetF = 72 + step;
    addDecision(session.id, at(480 + step * 7.5), { stage: 'wake', targetF, setF: targetF, reason: 'wake', detail: 'Wake warm-up' });
  }
  for (let time = start; time <= end; time += 300) {
    const minutes = (time - start) / 60;
    const roomC = minutes < 150 ? 23.2 : minutes < 330 ? 20 : 21.2;
    ambient.push({
      timestamp: time, hubAmbC: roomC, coverAmbC: roomC + 2, humidity: 48, leftBodyC: 31.5, rightBodyC: 30.5, externalRoomC: null,
    });
  }
};

seedNight('left', 0);
seedNight('left', 1);
seedNight('right', 0);

const latestAmbient = () => ({ hubAmbC: 22.6, humidity: 47 });

const activeSession = (side: Side) => sessions.find(session => session.side === side && session.endedAt === null) ?? null;

const lastEndedSession = (side: Side) => sessions
  .filter(session => session.side === side && session.endedAt !== null)
  .sort((first, second) => (second.endedAt ?? 0) - (first.endedAt ?? 0))[0] ?? null;

const sideStatus = (side: Side, settings: AutopilotSideSettings): AutopilotSideStatus => {
  const session = activeSession(side);
  const sessionDecisions = session ? decisions.filter(decision => decision.sessionId === session.id) : [];
  const lastDecision = sessionDecisions[sessionDecisions.length - 1] ?? null;
  return {
    enabled: settings.enabled,
    dryRun: settings.dryRun,
    session,
    stage: lastDecision?.stage ?? null,
    stageTargetF: lastDecision?.targetF ?? null,
    setF: lastDecision?.setF ?? null,
    bodyClock: { temperatureMinimumHour: null, sessionCount: 2, sessionsNeeded: 4 },
    roomC: latestAmbient().hubAmbC,
    roomSource: 'pod',
    humidity: latestAmbient().humidity,
    absentSince: null,
    lastDecision,
    lastSession: lastEndedSession(side),
    canResume: false,
  };
};

export const getAutopilotStatus = (settings: Settings): AutopilotStatus => ({
  left: sideStatus('left', settings.left.autopilot),
  right: sideStatus('right', settings.right.autopilot),
});

export const listAutopilotSessions = (side?: Side) => sessions
  .filter(session => !side || session.side === side)
  .sort((first, second) => second.startedAt - first.startedAt);

export const getAutopilotSessionDetail = (id: number): SessionDetail | null => {
  const session = sessions.find(candidate => candidate.id === id);
  if (!session) return null;
  const end = session.endedAt ?? nowSeconds();
  return {
    session,
    decisions: decisions.filter(decision => decision.sessionId === id),
    ambient: ambient.filter(record => record.timestamp >= session.startedAt && record.timestamp <= end),
  };
};

export const startAutopilotSession = (side: Side, settings: AutopilotSideSettings, nap = false, wakeAt?: number) => {
  const existing = activeSession(side);
  if (existing) return existing;
  const now = nowSeconds();
  const session: SleepSession = {
    id: nextSessionId++, side, startedAt: now, endedAt: null, endReason: null, startSource: 'manual',
    isNap: nap, napRequested: nap, wakeAt: wakeAt ?? null, dryRun: settings.dryRun,
  };
  sessions.push(session);
  const targetF = nap ? settings.napTemperatureF : settings.entryTemperatureF;
  addDecision(session.id, now, {
    stage: nap ? 'steady' : 'entry', targetF, setF: targetF, reason: nap ? 'nap' : 'schedule', detail: nap ? 'Nap temperature' : null,
  });
  return session;
};

export const endAutopilotSession = (side: Side) => {
  const session = activeSession(side);
  if (!session) return null;
  session.endedAt = nowSeconds();
  session.endReason = 'manual';
  return session;
};
