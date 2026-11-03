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
  baseTemperatureF: 68,
  stageOffsetsF: { falling: -2, deep: -5, rem: -2, wake: 4 },
  napTemperatureF: 66,
  maxAdjustmentF: 4,
  minMinutesBetweenChanges: 20,
  autoEndAbsentMinutes: 60,
  maxSessionHours: 14,
  napMaxMinutes: 90,
  roomCompensation: { enabled: true, referenceC: 22, calibrationOffsetC: 0 },
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
  addDecision(session.id, at(0), { stage: 'falling', targetF: 66, setF: 66, reason: 'stage', detail: null });
  addDecision(session.id, at(30), { stage: 'deep', targetF: 63, setF: 63, reason: 'stage', detail: null });
  addDecision(session.id, at(95), { stage: 'deep', targetF: 63, setF: 62, reason: 'room', detail: 'Room warm at 23.4 °C' });
  addDecision(session.id, at(140), { stage: 'deep', targetF: 63, setF: 63, reason: 'stage', detail: 'Back to stage target' });
  addDecision(session.id, at(180), { stage: 'rem', targetF: 66, setF: 66, reason: 'stage', detail: null });
  addDecision(session.id, at(210), { stage: 'rem', targetF: 66, setF: 68, reason: 'room', detail: 'Room cool at 19.8 °C' });
  addDecision(session.id, at(300), { stage: 'rem', targetF: 66, setF: 67, reason: 'room', detail: 'Room cool at 20.6 °C' });
  for (let step = 0; step <= 6; step++) {
    addDecision(session.id, at(480 + step * 5), {
      stage: 'wake', targetF: 72, setF: 66 + step, reason: 'wake', detail: 'Wake warm-up',
    });
  }
  for (let time = start; time <= end; time += 300) {
    const minutes = (time - start) / 60;
    const roomC = minutes < 150 ? 23.2 : minutes < 330 ? 20 : 21.2;
    ambient.push({ timestamp: time, hubAmbC: roomC, coverAmbC: roomC + 2, humidity: 48, leftBodyC: 31.5, rightBodyC: 30.5 });
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
  const elapsedMinutes = session ? (nowSeconds() - session.startedAt) / 60 : 0;
  const stage = !session ? null : elapsedMinutes < 30 ? 'falling' : elapsedMinutes < 180 ? 'deep' : 'rem';
  const stageTargetF = stage ? settings.baseTemperatureF + settings.stageOffsetsF[stage] : null;
  return {
    enabled: settings.enabled,
    dryRun: settings.dryRun,
    session,
    stage,
    stageTargetF,
    setF: lastDecision?.setF ?? stageTargetF,
    roomC: latestAmbient().hubAmbC,
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
  const targetF = nap ? settings.napTemperatureF : settings.baseTemperatureF + settings.stageOffsetsF.falling;
  addDecision(session.id, now, {
    stage: 'falling', targetF, setF: targetF, reason: nap ? 'nap' : 'stage', detail: nap ? 'Nap temperature' : null,
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
