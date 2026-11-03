
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="f1842199-0299-504e-a8c8-e2336af2b787")}catch(e){}}();
import { z } from 'zod';
import { TIME_ZONES } from './timeZones.js';
import { TimeSchema } from './schedulesSchema.js';
export const TEMPERATURES = ['celsius', 'fahrenheit'];
const Temperatures = z.enum(TEMPERATURES);
const TemperatureTapConfig = z.object({
    type: z.literal('temperature'),
    change: z.enum(['increment', 'decrement']),
    amount: z.number().min(0).max(10),
});
const AlarmTapConfig = z.object({
    type: z.literal('alarm'),
    behavior: z.enum(['snooze', 'dismiss']),
    snoozeDuration: z.number().min(60).max(600),
    inactiveAlarmBehavior: z.enum(['power', 'none'])
});
// Starts a sleep session when none is active, otherwise ends it (Autopilot)
const SleepSessionTapConfig = z.object({
    type: z.literal('sleepSession'),
});
export const TapConfig = z.discriminatedUnion('type', [
    TemperatureTapConfig,
    AlarmTapConfig,
    SleepSessionTapConfig,
]);
export const AUTOPILOT_STAGES = ['falling', 'deep', 'rem', 'wake'];
export const AutopilotStageSchema = z.enum(AUTOPILOT_STAGES);
const StageOffset = z.number().min(-20).max(20);
const AutopilotSideSettingsSchema = z.object({
    enabled: z.boolean(),
    // Log decisions without changing the temperature
    dryRun: z.boolean(),
    baseTemperatureF: z.number().min(55).max(110),
    // Offsets are relative to baseTemperatureF
    stageOffsetsF: z.object({
        falling: StageOffset,
        deep: StageOffset,
        rem: StageOffset,
        wake: StageOffset,
    }),
    napTemperatureF: z.number().min(55).max(110),
    // Live adjustments never move further than this from the stage target
    maxAdjustmentF: z.number().min(0).max(10),
    minMinutesBetweenChanges: z.number().min(5).max(120),
    // Continuous absence that ends a session, backdated to when the absence began
    autoEndAbsentMinutes: z.number().min(10).max(240),
    maxSessionHours: z.number().min(2).max(24),
    // Sessions shorter than this are classified as naps when they end
    napMaxMinutes: z.number().min(0).max(240),
    roomCompensation: z.object({
        enabled: z.boolean(),
        referenceC: z.number().min(10).max(35),
        calibrationOffsetC: z.number().min(-10).max(10),
    }),
});
export const GestureSchema = z.enum(['doubleTap', 'tripleTap', 'quadTap']);
const SideSettingsSchema = z.object({
    name: z.string().min(1).max(20),
    awayMode: z.boolean(),
    scheduleOverrides: z.object({
        temperatureSchedules: z.object({
            disabled: z.boolean(),
            expiresAt: z.string(),
        }),
        alarm: z.object({
            disabled: z.boolean(),
            timeOverride: z.string(),
            expiresAt: z.string(),
        })
    }),
    taps: z.object({
        doubleTap: TapConfig,
        tripleTap: TapConfig,
        quadTap: TapConfig,
    }),
    autopilot: AutopilotSideSettingsSchema,
}).strict();
export const SettingsSchema = z.object({
    id: z.string(),
    timeZone: z.enum(TIME_ZONES),
    left: SideSettingsSchema,
    right: SideSettingsSchema,
    primePodDaily: z.object({
        enabled: z.boolean(),
        time: TimeSchema,
    }),
    temperatureFormat: Temperatures,
    rebootDaily: z.boolean(),
}).strict();
//# sourceMappingURL=settingsSchema.js.map
//# debugId=f1842199-0299-504e-a8c8-e2336af2b787
