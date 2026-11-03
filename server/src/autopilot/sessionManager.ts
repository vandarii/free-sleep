// Starts, ends and resumes Autopilot sleep sessions, and drives the pod while one is active
import moment from 'moment-timezone';
import logger from '../logger.js';
import settingsDB from '../db/settings.js';
import servicesDB from '../db/services.js';
import { Side } from '../db/schedulesSchema.js';
import { AutopilotSideSettings } from '../db/settingsSchema.js';
import { updateDeviceStatus } from '../routes/deviceStatus/updateDeviceStatus.js';
import { executeAnalyzeSleep } from '../jobs/analyzeSleep.js';
import { BodyClock, SessionEndReason, SessionSource, SleepSession } from './autopilotSchema.js';
import { coolDepthForSession, estimateTemperatureMinimumHour, MIN_SESSIONS_FOR_ESTIMATE } from './bodyClock.js';
import {
  closeSession,
  createSession,
  getActiveSession,
  getLastDecision,
  getLastEndedSession,
  getLatestAmbient,
  getLatestExternalRoomC,
  insertDecision,
  listSleepSessionsBetween,
  reopenSession,
} from './autopilotStore.js';
import {
  AMBIENT_MAX_AGE_SECONDS,
  describeDecision,
  planTemperature,
  resolveRoom,
  shouldApply,
  TemperaturePlan,
} from './stages.js';

// An auto-ended session can be resumed from the app for this long
export const RESUME_WINDOW_SECONDS = 15 * 60;
// The pod powers a side off after 12 hours, so re-assert power well before that
const POWER_REFRESH_SECONDS = 10 * 60 * 60;
const BODY_CLOCK_WINDOW_SECONDS = 14 * 24 * 60 * 60;
// "Get bed ready" turns itself off if no session starts
const PREPARE_BED_SECONDS = 60 * 60;

export class AutopilotError extends Error {
  public status: number;

  constructor(message: string, status = 409) {
    super(message);
    this.status = status;
  }
}

type ControllerState = {
  sessionId: number | null;
  lastTargetF: number | null;
  lastSetF: number | null;
  lastChangeAt: number | null;
  lastPowerOnAt: number | null;
};

const emptyState = (): ControllerState => ({
  sessionId: null,
  lastTargetF: null,
  lastSetF: null,
  lastChangeAt: null,
  lastPowerOnAt: null,
});

const controllerState: Record<Side, ControllerState> = { left: emptyState(), right: emptyState() };

// Serializes start/end/tick per side so a tap and a timer can't race each other
const sideLocks: Record<Side, Promise<unknown>> = { left: Promise.resolve(), right: Promise.resolve() };
export const withSideLock = <T>(side: Side, task: () => Promise<T>): Promise<T> => {
  const next = sideLocks[side].then(task, task);
  sideLocks[side] = next.catch(() => undefined);
  return next;
};

export const nowSeconds = () => Math.floor(Date.now() / 1000);

const getSideSettings = async (side: Side) => {
  await settingsDB.read();
  return settingsDB.data[side];
};

const setPower = async (side: Side, isOn: boolean) => {
  await updateDeviceStatus({ [side]: { isOn } });
};

const runSleepAnalysis = async (session: SleepSession) => {
  await servicesDB.read();
  if (!servicesDB.data.biometrics.enabled || session.endedAt === null) return;
  executeAnalyzeSleep(
    session.side,
    moment.unix(session.startedAt).toISOString(),
    moment.unix(session.endedAt).add(5, 'minutes').toISOString(),
  );
};

// Restores controller memory after a server restart from the last logged decision
const hydrateState = async (side: Side, session: SleepSession) => {
  const state = controllerState[side];
  if (state.sessionId === session.id) return state;
  const lastDecision = await getLastDecision(session.id);
  controllerState[side] = {
    sessionId: session.id,
    lastTargetF: lastDecision?.targetF ?? null,
    lastSetF: lastDecision?.setF ?? null,
    lastChangeAt: lastDecision?.timestamp ?? null,
    lastPowerOnAt: null,
  };
  return controllerState[side];
};

const hourOfDay = (unixSeconds: number, timeZone: string) => {
  const time = moment.unix(unixSeconds).tz(timeZone);
  return time.hours() + time.minutes() / 60;
};

// Estimates the body clock from the two weeks of full sleep sessions before a moment in time
export const getBodyClock = async (side: Side, before: number): Promise<BodyClock> => {
  const sessions = await listSleepSessionsBetween(side, before - BODY_CLOCK_WINDOW_SECONDS, before);
  const midSleepHours = sessions.map(session =>
    hourOfDay((session.startedAt + (session.endedAt ?? session.startedAt)) / 2, settingsDB.data.timeZone));
  return {
    temperatureMinimumHour: estimateTemperatureMinimumHour(midSleepHours),
    sessionCount: sessions.length,
    sessionsNeeded: MIN_SESSIONS_FOR_ESTIMATE,
  };
};

// One control step: plan the temperature, then apply it (or log it in dry run)
export const runControllerStep = async (
  side: Side,
  settings: AutopilotSideSettings,
  session: SleepSession,
  now: number,
): Promise<TemperaturePlan> => {
  const state = await hydrateState(side, session);
  const [ambient, externalRoomC] = await Promise.all([
    getLatestAmbient(AMBIENT_MAX_AGE_SECONDS, now),
    getLatestExternalRoomC(AMBIENT_MAX_AGE_SECONDS, now),
  ]);
  const bodyClock = await getBodyClock(side, session.startedAt);
  const plan = planTemperature({
    settings,
    startedAt: session.startedAt,
    now,
    coolDepthF: coolDepthForSession(
      settings.earlyCoolF,
      hourOfDay(session.startedAt, settingsDB.data.timeZone),
      bodyClock.temperatureMinimumHour,
    ),
    wakeAt: session.wakeAt,
    isNap: session.isNap,
    roomC: resolveRoom(ambient, externalRoomC, settings).roomC,
  });

  const apply = shouldApply({
    plan,
    lastTargetF: state.lastTargetF,
    lastSetF: state.lastSetF,
    lastChangeAt: state.lastChangeAt,
    now,
    minMinutesBetweenChanges: settings.minMinutesBetweenChanges,
  });

  if (apply) {
    if (!session.dryRun) {
      const refreshPower = state.lastPowerOnAt === null || now - state.lastPowerOnAt >= POWER_REFRESH_SECONDS;
      await updateDeviceStatus({ [side]: { targetTemperatureF: plan.desiredF, ...(refreshPower ? { isOn: true } : {}) } });
      if (refreshPower) state.lastPowerOnAt = now;
    }
    await insertDecision({
      sessionId: session.id,
      timestamp: now,
      stage: plan.stage,
      targetF: plan.stageTargetF,
      setF: plan.desiredF,
      ...describeDecision(plan, state.lastTargetF),
      dryRun: session.dryRun,
    });
    state.lastTargetF = plan.stageTargetF;
    state.lastSetF = plan.desiredF;
    state.lastChangeAt = now;
  }
  return plan;
};

type StartOptions = {
  side: Side;
  source: SessionSource;
  wakeAt?: number;
  nap?: boolean;
};

export const startSession = ({ side, source, wakeAt, nap }: StartOptions) => withSideLock(side, async () => {
  const sideSettings = await getSideSettings(side);
  if (!sideSettings.autopilot.enabled) throw new AutopilotError(`Autopilot is disabled for the ${side} side`);
  if (sideSettings.awayMode) throw new AutopilotError(`The ${side} side is in away mode`);

  const existing = await getActiveSession(side);
  if (existing) return existing;

  const now = nowSeconds();
  if (wakeAt !== undefined && wakeAt <= now) throw new AutopilotError('Wake time must be in the future', 400);

  const session = await createSession({
    side,
    startedAt: now,
    startSource: source,
    isNap: nap ?? false,
    wakeAt: wakeAt ?? null,
    dryRun: sideSettings.autopilot.dryRun,
  });
  logger.info(`Autopilot: started ${session.isNap ? 'nap' : 'sleep session'} #${session.id} on ${side} (${source})`);

  controllerState[side] = { ...emptyState(), sessionId: session.id };
  if (!session.dryRun) {
    await setPower(side, true);
    controllerState[side].lastPowerOnAt = now;
  }
  await runControllerStep(side, sideSettings.autopilot, session, now);
  return session;
});

type EndOptions = {
  side: Side;
  reason: SessionEndReason;
  // Backdated end time, e.g. when the person actually left the bed
  endedAt?: number;
};

// Must be called inside the side lock
const endActiveSession = async ({ side, reason, endedAt }: EndOptions) => {
  const session = await getActiveSession(side);
  if (!session) return null;

  const sideSettings = await getSideSettings(side);
  const endTime = Math.max(session.startedAt, endedAt ?? nowSeconds());
  const durationMinutes = (endTime - session.startedAt) / 60;
  const isNap = session.napRequested || durationMinutes < sideSettings.autopilot.napMaxMinutes;
  const closed = await closeSession(session.id, endTime, reason, isNap);
  logger.info(`Autopilot: ended session #${session.id} on ${side} (${reason}), ${Math.round(durationMinutes)} min`);

  controllerState[side] = emptyState();
  if (!session.dryRun) await setPower(side, false);
  if (!closed.isNap) await runSleepAnalysis(closed);
  return closed;
};

export const endSession = (options: EndOptions) => withSideLock(options.side, () => endActiveSession(options));

// Warms the side to the entry temperature before bed. It needs no session, and the pod
// turns it off after an hour if no session takes over.
export const prepareBed = (side: Side) => withSideLock(side, async () => {
  const sideSettings = await getSideSettings(side);
  const { enabled, dryRun, entryTemperatureF } = sideSettings.autopilot;
  if (!enabled) throw new AutopilotError(`Autopilot is disabled for the ${side} side`);
  if (dryRun) throw new AutopilotError('Dry run does not change the temperature');
  if (sideSettings.awayMode) throw new AutopilotError(`The ${side} side is in away mode`);
  if (await getActiveSession(side)) throw new AutopilotError('A session is already running');
  await updateDeviceStatus({ [side]: { isOn: true, targetTemperatureF: entryTemperatureF, secondsRemaining: PREPARE_BED_SECONDS } });
  logger.info(`Autopilot: preparing ${side} side at ${entryTemperatureF}°F`);
});

// Triple-tap behaviour: start when idle, end when a session is running
export const toggleSession = (side: Side, source: SessionSource) => withSideLock(side, async () => {
  const active = await getActiveSession(side);
  if (active) return endActiveSession({ side, reason: source === 'tap' ? 'tap' : 'manual' });
  return null;
}).then(async (ended) => ended ?? startSession({ side, source }));

// Re-opens a session that ended within the resume window (e.g. a mistaken auto-end)
export const resumeSession = (side: Side) => withSideLock(side, async () => {
  if (await getActiveSession(side)) throw new AutopilotError('A session is already running');
  const last = await getLastEndedSession(side);
  if (!last?.endedAt || nowSeconds() - last.endedAt > RESUME_WINDOW_SECONDS) {
    throw new AutopilotError('No recently ended session to resume');
  }
  const session = await reopenSession(last.id);
  logger.info(`Autopilot: resumed session #${session.id} on ${side}`);
  controllerState[side] = { ...emptyState(), sessionId: session.id };
  if (!session.dryRun) {
    await setPower(side, true);
    controllerState[side].lastPowerOnAt = nowSeconds();
  }
  return session;
});

export const getControllerState = (side: Side) => controllerState[side];
export { endActiveSession };
