// Prisma access for Autopilot sessions, decisions and ambient readings
import { ambient as AmbientRow, autopilot_decisions as DecisionRow, sleep_sessions as SessionRow } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { Side } from '../db/schedulesSchema.js';
import { AutopilotStage } from '../db/settingsSchema.js';
import {
  AmbientReading,
  AmbientRecord,
  AutopilotDecision,
  DecisionReason,
  SessionEndReason,
  SessionSource,
  SleepSession,
} from './autopilotSchema.js';

// Ambient readings are stored in 5-minute buckets
const AMBIENT_BUCKET_SECONDS = 300;

const toSession = (record: SessionRow): SleepSession => ({
  id: record.id,
  side: record.side as Side,
  startedAt: record.started_at,
  endedAt: record.ended_at,
  endReason: record.end_reason as SessionEndReason | null,
  startSource: record.start_source as SessionSource,
  isNap: record.is_nap,
  napRequested: record.nap_requested,
  wakeAt: record.wake_at,
  dryRun: record.dry_run,
});

const toDecision = (record: DecisionRow): AutopilotDecision => ({
  id: record.id,
  sessionId: record.session_id,
  timestamp: record.timestamp,
  stage: record.stage as AutopilotDecision['stage'],
  targetF: record.target_f,
  setF: record.set_f,
  reason: record.reason as DecisionReason,
  detail: record.detail,
  dryRun: record.dry_run,
});

const toAmbient = (record: AmbientRow): AmbientRecord => ({
  timestamp: record.timestamp,
  hubAmbC: record.hub_amb_c,
  coverAmbC: record.cover_amb_c,
  humidity: record.humidity,
  leftBodyC: record.left_body_c,
  rightBodyC: record.right_body_c,
  externalRoomC: record.external_room_c,
});

export const getActiveSession = async (side: Side) => {
  const record = await prisma.sleep_sessions.findFirst({
    where: { side, ended_at: null },
    orderBy: { started_at: 'desc' },
  });
  return record ? toSession(record) : null;
};

export const getLastEndedSession = async (side: Side) => {
  const record = await prisma.sleep_sessions.findFirst({
    where: { side, ended_at: { not: null } },
    orderBy: { ended_at: 'desc' },
  });
  return record ? toSession(record) : null;
};

type CreateSessionInput = {
  side: Side;
  startedAt: number;
  startSource: SessionSource;
  isNap: boolean;
  wakeAt: number | null;
  dryRun: boolean;
};

export const createSession = async (input: CreateSessionInput) => {
  const record = await prisma.sleep_sessions.create({
    data: {
      side: input.side,
      started_at: input.startedAt,
      start_source: input.startSource,
      is_nap: input.isNap,
      nap_requested: input.isNap,
      wake_at: input.wakeAt,
      dry_run: input.dryRun,
    },
  });
  return toSession(record);
};

export const closeSession = async (id: number, endedAt: number, endReason: SessionEndReason, isNap: boolean) => {
  const record = await prisma.sleep_sessions.update({
    where: { id },
    data: { ended_at: endedAt, end_reason: endReason, is_nap: isNap },
  });
  return toSession(record);
};

// A resumed session goes back to its original nap intent; the duration-based nap
// classification is recalculated when it ends again
export const reopenSession = async (id: number) => {
  const existing = await prisma.sleep_sessions.findUniqueOrThrow({ where: { id } });
  const record = await prisma.sleep_sessions.update({
    where: { id },
    data: { ended_at: null, end_reason: null, is_nap: existing.nap_requested },
  });
  return toSession(record);
};

export const listSessions = async (side: Side | undefined, limit: number) => {
  const records = await prisma.sleep_sessions.findMany({
    where: side ? { side } : {},
    orderBy: { started_at: 'desc' },
    take: limit,
  });
  return records.map(toSession);
};

// Full sleep sessions that ended within a time range, for the body clock estimate
export const listSleepSessionsBetween = async (side: Side, startTime: number, endTime: number) => {
  const records = await prisma.sleep_sessions.findMany({
    where: { side, is_nap: false, ended_at: { not: null, gte: startTime, lte: endTime } },
    orderBy: { started_at: 'desc' },
  });
  return records.map(toSession);
};

export const getSession = async (id: number) => {
  const record = await prisma.sleep_sessions.findUnique({ where: { id } });
  return record ? toSession(record) : null;
};

type DecisionInput = {
  sessionId: number;
  timestamp: number;
  stage: AutopilotStage;
  targetF: number;
  setF: number;
  reason: DecisionReason;
  detail: string | null;
  dryRun: boolean;
};

export const insertDecision = async (input: DecisionInput) => {
  const record = await prisma.autopilot_decisions.create({
    data: {
      session_id: input.sessionId,
      timestamp: input.timestamp,
      stage: input.stage,
      target_f: input.targetF,
      set_f: input.setF,
      reason: input.reason,
      detail: input.detail,
      dry_run: input.dryRun,
    },
  });
  return toDecision(record);
};

export const getLastDecision = async (sessionId: number) => {
  const record = await prisma.autopilot_decisions.findFirst({
    where: { session_id: sessionId },
    orderBy: { timestamp: 'desc' },
  });
  return record ? toDecision(record) : null;
};

export const listDecisions = async (sessionId: number) => {
  const records = await prisma.autopilot_decisions.findMany({
    where: { session_id: sessionId },
    orderBy: { timestamp: 'asc' },
  });
  return records.map(toDecision);
};

const toBucket = (timestamp: number) => timestamp - (timestamp % AMBIENT_BUCKET_SECONDS);

export const upsertAmbient = async (reading: AmbientReading) => {
  const timestamp = toBucket(reading.timestamp);
  const data = {
    hub_amb_c: reading.hubAmbC ?? null,
    cover_amb_c: reading.coverAmbC ?? null,
    humidity: reading.humidity ?? null,
    left_body_c: reading.leftBodyC ?? null,
    right_body_c: reading.rightBodyC ?? null,
  };
  await prisma.ambient.upsert({
    where: { timestamp },
    create: { timestamp, ...data },
    update: data,
  });
};

// Stored next to the pod's readings so the two can be compared later
export const upsertExternalRoom = async (temperatureC: number, now: number) => {
  const timestamp = toBucket(now);
  await prisma.ambient.upsert({
    where: { timestamp },
    create: { timestamp, external_room_c: temperatureC },
    update: { external_room_c: temperatureC },
  });
};

export const getLatestExternalRoomC = async (maxAgeSeconds: number, now: number) => {
  const record = await prisma.ambient.findFirst({
    where: { timestamp: { gte: now - maxAgeSeconds }, external_room_c: { not: null } },
    orderBy: { timestamp: 'desc' },
  });
  return record?.external_room_c ?? null;
};

// The newest row from the pod's own sensors; rows holding only an external reading don't count
export const getLatestAmbient = async (maxAgeSeconds: number, now: number) => {
  const record = await prisma.ambient.findFirst({
    where: {
      timestamp: { gte: now - maxAgeSeconds },
      OR: [{ hub_amb_c: { not: null } }, { cover_amb_c: { not: null } }],
    },
    orderBy: { timestamp: 'desc' },
  });
  return record ? toAmbient(record) : null;
};

export const listAmbient = async (startTime: number, endTime: number) => {
  const records = await prisma.ambient.findMany({
    where: { timestamp: { gte: startTime, lte: endTime } },
    orderBy: { timestamp: 'asc' },
  });
  return records.map(toAmbient);
};
