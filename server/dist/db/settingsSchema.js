
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="3b846a0a-b21b-5ea2-b13d-dd57306a8739")}catch(e){}}();
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
// Parts of the time-based temperature curve. These are positions on a schedule, not detected sleep stages
export const AUTOPILOT_STAGES = ['entry', 'cooling', 'easing', 'steady', 'wake'];
export const AutopilotStageSchema = z.enum(AUTOPILOT_STAGES);
const AutopilotTemperature = z.number().min(60).max(100);
const AutopilotSideSettingsSchema = z.object({
    enabled: z.boolean(),
    // Log decisions without changing the temperature
    dryRun: z.boolean(),
    // Where the curve settles for the rest of the session
    baseTemperatureF: AutopilotTemperature,
    // Neutral temperature for getting into bed, cold entry is the least supported start
    entryTemperatureF: AutopilotTemperature,
    // How far below base the early part of the session goes
    earlyCoolF: z.number().min(0).max(10),
    // Rise over the last 30 minutes before an optional wake time
    wakeRiseF: z.number().min(0).max(6),
    napTemperatureF: AutopilotTemperature,
    // Room compensation never moves further than this from the curve when the room is warm
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
//# debugId=3b846a0a-b21b-5ea2-b13d-dd57306a8739
