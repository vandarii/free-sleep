
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="d5957231-dfd0-5664-a8d2-86592153ce2a")}catch(e){}}();
import express from 'express';
import { z } from 'zod';
import logger from '../../logger.js';
import { AmbientReadingSchema, ExternalRoomSchema, SideBodySchema, SideParamSchema, StartSessionSchema, } from '../../autopilot/autopilotSchema.js';
import { getAutopilotStatus } from '../../autopilot/controller.js';
import { getSession, listAmbient, listDecisions, listSessions, upsertAmbient, upsertExternalRoom } from '../../autopilot/autopilotStore.js';
import { AutopilotError, endSession, nowSeconds, prepareBed, resumeSession, startSession } from '../../autopilot/sessionManager.js';
const router = express.Router();
const respondInvalid = (res, error) => {
    res.status(400).json({ error: 'Invalid request data', details: error.errors });
};
// Turns AutopilotError into a clean status code, everything else goes to the central handler
const handleError = (error, res, next) => {
    if (error instanceof AutopilotError) {
        res.status(error.status).json({ error: error.message });
        return;
    }
    next(error);
};
router.get('/autopilot/status', async (_req, res, next) => {
    try {
        res.json(await getAutopilotStatus());
    }
    catch (error) {
        handleError(error, res, next);
    }
});
router.post('/autopilot/session/start', async (req, res, next) => {
    const parsed = StartSessionSchema.safeParse(req.body);
    if (!parsed.success)
        return respondInvalid(res, parsed.error);
    try {
        const { side, wakeAt, nap } = parsed.data;
        res.json(await startSession({ side, wakeAt, nap, source: 'manual' }));
    }
    catch (error) {
        handleError(error, res, next);
    }
});
router.post('/autopilot/session/end', async (req, res, next) => {
    const parsed = SideBodySchema.safeParse(req.body);
    if (!parsed.success)
        return respondInvalid(res, parsed.error);
    try {
        const session = await endSession({ side: parsed.data.side, reason: 'manual' });
        if (!session)
            return res.status(409).json({ error: 'No session is running' });
        res.json(session);
    }
    catch (error) {
        handleError(error, res, next);
    }
});
router.post('/autopilot/session/resume', async (req, res, next) => {
    const parsed = SideBodySchema.safeParse(req.body);
    if (!parsed.success)
        return respondInvalid(res, parsed.error);
    try {
        res.json(await resumeSession(parsed.data.side));
    }
    catch (error) {
        handleError(error, res, next);
    }
});
router.post('/autopilot/prepare', async (req, res, next) => {
    const parsed = SideBodySchema.safeParse(req.body);
    if (!parsed.success)
        return respondInvalid(res, parsed.error);
    try {
        await prepareBed(parsed.data.side);
        res.status(204).end();
    }
    catch (error) {
        handleError(error, res, next);
    }
});
const SessionsQuerySchema = z.object({
    side: SideParamSchema.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(30),
});
router.get('/autopilot/sessions', async (req, res, next) => {
    const parsed = SessionsQuerySchema.safeParse(req.query);
    if (!parsed.success)
        return respondInvalid(res, parsed.error);
    try {
        res.json(await listSessions(parsed.data.side, parsed.data.limit));
    }
    catch (error) {
        handleError(error, res, next);
    }
});
router.get('/autopilot/sessions/:id', async (req, res, next) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id))
        return res.status(400).json({ error: 'Invalid session id' });
    try {
        const session = await getSession(id);
        if (!session)
            return res.status(404).json({ error: 'Session not found' });
        const endTime = session.endedAt ?? nowSeconds();
        const [decisions, ambient] = await Promise.all([
            listDecisions(id),
            listAmbient(session.startedAt - 300, endTime),
        ]);
        const detail = { session, decisions, ambient };
        res.json(detail);
    }
    catch (error) {
        handleError(error, res, next);
    }
});
// Posted by biometrics/stream/ambient_reporter.py
router.post('/autopilot/ambient', async (req, res, next) => {
    const parsed = AmbientReadingSchema.safeParse(req.body);
    if (!parsed.success) {
        logger.warn('Invalid ambient reading', parsed.error.errors);
        return respondInvalid(res, parsed.error);
    }
    try {
        await upsertAmbient(parsed.data);
        res.status(204).end();
    }
    catch (error) {
        handleError(error, res, next);
    }
});
// Pushed by a trusted room sensor, e.g. a Home Assistant automation
router.post('/autopilot/room', async (req, res, next) => {
    const parsed = ExternalRoomSchema.safeParse(req.body);
    if (!parsed.success)
        return respondInvalid(res, parsed.error);
    try {
        await upsertExternalRoom(parsed.data.temperatureC, nowSeconds());
        res.status(204).end();
    }
    catch (error) {
        handleError(error, res, next);
    }
});
export default router;
//# sourceMappingURL=autopilot.js.map
//# debugId=d5957231-dfd0-5664-a8d2-86592153ce2a
