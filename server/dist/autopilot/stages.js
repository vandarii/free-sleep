
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="a715bf3b-4c16-519c-8a04-e0c5c54f9395")}catch(e){}}();
export const FALLING_ASLEEP_MINUTES = 30;
export const DEEP_SLEEP_END_MINUTES = 180;
export const WAKE_RAMP_MINUTES = 30;
// Room deviations smaller than this are ignored, so normal drift doesn't cause changes
export const ROOM_DEADBAND_C = 1;
// How many °F the bed moves per °C the room is off from the reference
export const ROOM_F_PER_C = 1;
const MIN_TEMP_F = 55;
const MAX_TEMP_F = 110;
export const clampTemperatureF = (temperatureF) => Math.min(MAX_TEMP_F, Math.max(MIN_TEMP_F, Math.round(temperatureF)));
// Stages are estimated from time since the session started; the wake stage
// takes over for the last WAKE_RAMP_MINUTES before an optional wake time.
export const resolveStage = ({ startedAt, now, wakeAt }) => {
    if (wakeAt && now >= wakeAt - WAKE_RAMP_MINUTES * 60)
        return 'wake';
    const elapsedMinutes = (now - startedAt) / 60;
    if (elapsedMinutes < FALLING_ASLEEP_MINUTES)
        return 'falling';
    if (elapsedMinutes < DEEP_SLEEP_END_MINUTES)
        return 'deep';
    return 'rem';
};
export const stageTargetF = (settings, stage) => clampTemperatureF(settings.baseTemperatureF + settings.stageOffsetsF[stage]);
// Linear warm-up from the REM target to the wake target over the ramp window
export const wakeRampF = (settings, now, wakeAt) => {
    const remF = stageTargetF(settings, 'rem');
    const wakeF = stageTargetF(settings, 'wake');
    const rampStart = wakeAt - WAKE_RAMP_MINUTES * 60;
    const progress = Math.min(1, Math.max(0, (now - rampStart) / (WAKE_RAMP_MINUTES * 60)));
    return clampTemperatureF(remF + (wakeF - remF) * progress);
};
// Ambient readings older than this are ignored for room compensation
export const AMBIENT_MAX_AGE_SECONDS = 15 * 60;
// The hub sensor is the default room reference; the cover sensor is the fallback
export const roomTemperatureC = (ambient, settings) => {
    const raw = ambient?.hubAmbC ?? ambient?.coverAmbC ?? null;
    if (raw === null)
        return null;
    return raw + settings.roomCompensation.calibrationOffsetC;
};
// A warmer room cools the bed and a colder room warms it, outside a small deadband
export const roomAdjustmentF = (settings, roomC) => {
    if (!settings.roomCompensation.enabled || roomC === null)
        return 0;
    const deviationC = roomC - settings.roomCompensation.referenceC;
    if (Math.abs(deviationC) < ROOM_DEADBAND_C)
        return 0;
    const adjustment = Math.round(-deviationC * ROOM_F_PER_C);
    return Math.max(-settings.maxAdjustmentF, Math.min(settings.maxAdjustmentF, adjustment));
};
// Works out what the bed should be set to right now, and why
export const planTemperature = ({ settings, startedAt, now, wakeAt, isNap, roomC }) => {
    if (isNap) {
        const napF = clampTemperatureF(settings.napTemperatureF);
        return { stage: 'falling', stageTargetF: napF, desiredF: napF, reason: 'nap', detail: 'Nap temperature' };
    }
    const stage = resolveStage({ startedAt, now, wakeAt });
    if (stage === 'wake' && wakeAt) {
        const rampF = wakeRampF(settings, now, wakeAt);
        return { stage, stageTargetF: stageTargetF(settings, 'wake'), desiredF: rampF, reason: 'wake', detail: 'Wake warm-up' };
    }
    const targetF = stageTargetF(settings, stage);
    const adjustmentF = roomAdjustmentF(settings, roomC);
    if (adjustmentF === 0 || roomC === null) {
        return { stage, stageTargetF: targetF, desiredF: targetF, reason: 'stage', detail: null };
    }
    const direction = adjustmentF < 0 ? 'warm' : 'cool';
    return {
        stage,
        stageTargetF: targetF,
        desiredF: clampTemperatureF(targetF + adjustmentF),
        reason: 'room',
        detail: `Room ${direction} at ${roomC.toFixed(1)} °C`,
    };
};
// The reason logged for an applied change. A new stage always reads as a stage change,
// and returning to the stage target within a stage says so instead of repeating the stage.
export const describeDecision = (plan, lastStage) => {
    if (plan.reason === 'wake' || plan.reason === 'nap')
        return { reason: plan.reason, detail: plan.detail };
    if (plan.stage !== lastStage)
        return { reason: 'stage', detail: plan.detail };
    if (plan.reason === 'stage')
        return { reason: 'stage', detail: 'Back to stage target' };
    return { reason: plan.reason, detail: plan.detail };
};
// Stage changes and wake ramp steps apply immediately; room adjustments are
// rate-limited so the bed doesn't oscillate.
export const shouldApply = ({ plan, lastStage, lastSetF, lastChangeAt, now, minMinutesBetweenChanges }) => {
    if (lastSetF === null || lastStage === null)
        return true;
    if (plan.desiredF === lastSetF)
        return false;
    if (plan.stage !== lastStage)
        return true;
    if (plan.reason === 'wake' || plan.reason === 'nap')
        return true;
    if (lastChangeAt === null)
        return true;
    return now - lastChangeAt >= minMinutesBetweenChanges * 60;
};
//# sourceMappingURL=stages.js.map
//# debugId=a715bf3b-4c16-519c-8a04-e0c5c54f9395
