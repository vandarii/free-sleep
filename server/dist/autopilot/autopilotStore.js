
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="35eecfb3-954b-5943-abcc-58479a0e5fa8")}catch(e){}}();
import { prisma } from '../db/prisma.js';
// Ambient readings are stored in 5-minute buckets
const AMBIENT_BUCKET_SECONDS = 300;
const toSession = (record) => ({
    id: record.id,
    side: record.side,
    startedAt: record.started_at,
    endedAt: record.ended_at,
    endReason: record.end_reason,
    startSource: record.start_source,
    isNap: record.is_nap,
    napRequested: record.nap_requested,
    wakeAt: record.wake_at,
    dryRun: record.dry_run,
});
const toDecision = (record) => ({
    id: record.id,
    sessionId: record.session_id,
    timestamp: record.timestamp,
    stage: record.stage,
    targetF: record.target_f,
    setF: record.set_f,
    reason: record.reason,
    detail: record.detail,
    dryRun: record.dry_run,
});
const toAmbient = (record) => ({
    timestamp: record.timestamp,
    hubAmbC: record.hub_amb_c,
    coverAmbC: record.cover_amb_c,
    humidity: record.humidity,
    leftBodyC: record.left_body_c,
    rightBodyC: record.right_body_c,
});
export const getActiveSession = async (side) => {
    const record = await prisma.sleep_sessions.findFirst({
        where: { side, ended_at: null },
        orderBy: { started_at: 'desc' },
    });
    return record ? toSession(record) : null;
};
export const getLastEndedSession = async (side) => {
    const record = await prisma.sleep_sessions.findFirst({
        where: { side, ended_at: { not: null } },
        orderBy: { ended_at: 'desc' },
    });
    return record ? toSession(record) : null;
};
export const createSession = async (input) => {
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
export const closeSession = async (id, endedAt, endReason, isNap) => {
    const record = await prisma.sleep_sessions.update({
        where: { id },
        data: { ended_at: endedAt, end_reason: endReason, is_nap: isNap },
    });
    return toSession(record);
};
// A resumed session goes back to its original nap intent; the duration-based nap
// classification is recalculated when it ends again
export const reopenSession = async (id) => {
    const existing = await prisma.sleep_sessions.findUniqueOrThrow({ where: { id } });
    const record = await prisma.sleep_sessions.update({
        where: { id },
        data: { ended_at: null, end_reason: null, is_nap: existing.nap_requested },
    });
    return toSession(record);
};
export const listSessions = async (side, limit) => {
    const records = await prisma.sleep_sessions.findMany({
        where: side ? { side } : {},
        orderBy: { started_at: 'desc' },
        take: limit,
    });
    return records.map(toSession);
};
export const getSession = async (id) => {
    const record = await prisma.sleep_sessions.findUnique({ where: { id } });
    return record ? toSession(record) : null;
};
export const insertDecision = async (input) => {
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
export const getLastDecision = async (sessionId) => {
    const record = await prisma.autopilot_decisions.findFirst({
        where: { session_id: sessionId },
        orderBy: { timestamp: 'desc' },
    });
    return record ? toDecision(record) : null;
};
export const listDecisions = async (sessionId) => {
    const records = await prisma.autopilot_decisions.findMany({
        where: { session_id: sessionId },
        orderBy: { timestamp: 'asc' },
    });
    return records.map(toDecision);
};
export const upsertAmbient = async (reading) => {
    const timestamp = reading.timestamp - (reading.timestamp % AMBIENT_BUCKET_SECONDS);
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
export const getLatestAmbient = async (maxAgeSeconds, now) => {
    const record = await prisma.ambient.findFirst({
        where: { timestamp: { gte: now - maxAgeSeconds } },
        orderBy: { timestamp: 'desc' },
    });
    return record ? toAmbient(record) : null;
};
export const listAmbient = async (startTime, endTime) => {
    const records = await prisma.ambient.findMany({
        where: { timestamp: { gte: startTime, lte: endTime } },
        orderBy: { timestamp: 'asc' },
    });
    return records.map(toAmbient);
};
//# sourceMappingURL=autopilotStore.js.map
//# debugId=35eecfb3-954b-5943-abcc-58479a0e5fa8
