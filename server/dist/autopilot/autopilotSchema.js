// WARNING! - The app imports these types directly, keep them compatible with app/src/api/autopilot.ts

!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="a985f459-42fe-5fd5-b938-43c683a256e8")}catch(e){}}();
import { z } from 'zod';
export const SideParamSchema = z.enum(['left', 'right']);
export const StartSessionSchema = z.object({
    side: SideParamSchema,
    // Unix seconds, optional per-session wake time
    wakeAt: z.number().int().positive().optional(),
    nap: z.boolean().optional(),
}).strict();
export const SideBodySchema = z.object({
    side: SideParamSchema,
}).strict();
// Posted by the biometrics stream every 5 minutes
export const AmbientReadingSchema = z.object({
    timestamp: z.number().int().positive(),
    hubAmbC: z.number().min(-20).max(70).nullable().optional(),
    coverAmbC: z.number().min(-20).max(70).nullable().optional(),
    humidity: z.number().min(0).max(100).nullable().optional(),
    leftBodyC: z.number().min(-20).max(70).nullable().optional(),
    rightBodyC: z.number().min(-20).max(70).nullable().optional(),
}).strict();
//# sourceMappingURL=autopilotSchema.js.map
//# debugId=a985f459-42fe-5fd5-b938-43c683a256e8
