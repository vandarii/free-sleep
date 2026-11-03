// Autopilot control loop. Runs on its own interval instead of node-schedule, because
// jobScheduler cancels every scheduled job whenever settings change.
import logger from '../logger.js';
import settingsDB from '../db/settings.js';
import { Side } from '../db/schedulesSchema.js';
import { AutopilotSideStatus, AutopilotStatus } from './autopilotSchema.js';
import { getActiveSession, getLastDecision, getLastEndedSession, getLatestAmbient } from './autopilotStore.js';
import { getAbsentSince } from './presenceTracker.js';
import {
  endActiveSession,
  getControllerState,
  nowSeconds,
  RESUME_WINDOW_SECONDS,
  runControllerStep,
  withSideLock,
} from './sessionManager.js';
import { AMBIENT_MAX_AGE_SECONDS, planTemperature, roomTemperatureC } from './stages.js';

const TICK_MS = 60_000;
const SIDES: Side[] = ['left', 'right'];

let interval: NodeJS.Timeout | undefined;

const tickSide = (side: Side, now: number) => withSideLock(side, async () => {
  const session = await getActiveSession(side);
  if (!session) return;
  const sideSettings = settingsDB.data[side];
  const settings = sideSettings.autopilot;

  // Ending checks run even if Autopilot was disabled mid-session, so nothing is left running
  const absentSince = getAbsentSince(side, now);
  if (absentSince !== null) {
    const absenceStart = Math.max(absentSince, session.startedAt);
    if (now - absenceStart >= settings.autoEndAbsentMinutes * 60) {
      await endActiveSession({ side, reason: 'out_of_bed', endedAt: absenceStart });
      return;
    }
  }
  if (now - session.startedAt >= settings.maxSessionHours * 3600) {
    await endActiveSession({ side, reason: 'max_length' });
    return;
  }
  if (!settings.enabled || sideSettings.awayMode) return;
  await runControllerStep(side, settings, session, now);
});

export const tickAutopilot = async () => {
  try {
    await settingsDB.read();
    const now = nowSeconds();
    for (const side of SIDES) await tickSide(side, now);
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error), 'autopilot tick failed');
  }
};

export const startAutopilot = () => {
  if (interval) return;
  logger.info('Starting Autopilot controller...');
  interval = setInterval(() => void tickAutopilot(), TICK_MS);
  void tickAutopilot();
};

export const stopAutopilot = () => {
  if (interval) clearInterval(interval);
  interval = undefined;
};

const getSideStatus = async (side: Side, now: number): Promise<AutopilotSideStatus> => {
  const settings = settingsDB.data[side].autopilot;
  const [session, lastSession, ambient] = await Promise.all([
    getActiveSession(side),
    getLastEndedSession(side),
    getLatestAmbient(AMBIENT_MAX_AGE_SECONDS, now),
  ]);
  const roomC = roomTemperatureC(ambient, settings);
  const lastDecision = session ? await getLastDecision(session.id) : null;
  const plan = session
    ? planTemperature({ settings, startedAt: session.startedAt, now, wakeAt: session.wakeAt, isNap: session.isNap, roomC })
    : null;
  const canResume = !session && lastSession?.endedAt != null && now - lastSession.endedAt <= RESUME_WINDOW_SECONDS;

  return {
    enabled: settings.enabled,
    dryRun: settings.dryRun,
    session,
    stage: plan?.stage ?? null,
    stageTargetF: plan?.stageTargetF ?? null,
    setF: getControllerState(side).lastSetF ?? lastDecision?.setF ?? null,
    roomC: roomC === null ? null : Math.round(roomC * 10) / 10,
    humidity: ambient?.humidity ?? null,
    absentSince: session ? getAbsentSince(side, now) : null,
    lastDecision,
    lastSession,
    canResume,
  };
};

export const getAutopilotStatus = async (): Promise<AutopilotStatus> => {
  await settingsDB.read();
  const now = nowSeconds();
  const [left, right] = await Promise.all([getSideStatus('left', now), getSideStatus('right', now)]);
  return { left, right };
};
