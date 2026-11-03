// Sleep usually starts within this long of a session starting

!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="2ad0ef12-6c28-5372-8896-782eb6788bdb")}catch(e){}}();
export const ONSET_DELAY_MINUTES = 10;
// How long the entry temperature holds after the session starts
export const ENTRY_HOLD_MINUTES = 15;
// Schedule changes move no faster than this
export const RAMP_MINUTES_PER_F = 7.5;
// Measured from estimated sleep onset
export const COOL_HOLD_END_MINUTES = 180;
export const EASE_END_MINUTES = 270;
export const WAKE_RAMP_MINUTES = 30;
export const WAKE_MAX_F = 80;
export const WAKE_MAX_ABOVE_BASE_F = 6;
// Room deviations smaller than this are ignored, so normal drift doesn't cause changes
export const ROOM_DEADBAND_C = 1;
// How many °F the bed moves per °C the room is warmer than the reference
export const ROOM_F_PER_C = 1;
// Cold rooms barely change sleep under bedding, so the cold side reacts late and weakly
export const COLD_ROOM_THRESHOLD_C = 18;
export const COLD_ROOM_F_PER_C = 0.5;
export const COLD_ROOM_MAX_F = 2;
// Hard limits while someone is in bed, tighter than the pod's 55-110°F range
const MIN_TEMP_F = 60;
const MAX_TEMP_F = 100;
export const clampTemperatureF = (temperatureF) => Math.min(MAX_TEMP_F, Math.max(MIN_TEMP_F, Math.round(temperatureF)));
const interpolate = (from, to, progress) => from + (to - from) * Math.min(1, Math.max(0, progress));
// Entry hold, slow ramp down to base minus coolDepthF, hold until 3 h after onset,
// then drift up to base by 4.5 h after onset and stay there
export const scheduleAt = ({ settings, startedAt, now, coolDepthF }) => {
    const { entryTemperatureF: entryF, baseTemperatureF: baseF } = settings;
    const coolF = baseF - coolDepthF;
    const minutes = (now - startedAt) / 60;
    const rampEnd = ENTRY_HOLD_MINUTES + Math.abs(entryF - coolF) * RAMP_MINUTES_PER_F;
    const holdEnd = ONSET_DELAY_MINUTES + COOL_HOLD_END_MINUTES;
    const easeEnd = ONSET_DELAY_MINUTES + EASE_END_MINUTES;
    if (minutes < ENTRY_HOLD_MINUTES)
        return { stage: 'entry', temperatureF: clampTemperatureF(entryF) };
    if (minutes < rampEnd) {
        const progress = (minutes - ENTRY_HOLD_MINUTES) / (rampEnd - ENTRY_HOLD_MINUTES);
        return { stage: 'cooling', temperatureF: clampTemperatureF(interpolate(entryF, coolF, progress)) };
    }
    if (minutes < holdEnd)
        return { stage: 'cooling', temperatureF: clampTemperatureF(coolF) };
    if (minutes < easeEnd) {
        const progress = (minutes - holdEnd) / (easeEnd - holdEnd);
        return { stage: 'easing', temperatureF: clampTemperatureF(interpolate(coolF, baseF, progress)) };
    }
    return { stage: 'steady', temperatureF: clampTemperatureF(baseF) };
};
// Comfort warm-up from wherever the curve is 30 minutes before the wake time. It stops at the wake time
export const wakeRampF = (input, wakeAt) => {
    const { settings, now } = input;
    const rampStart = wakeAt - WAKE_RAMP_MINUTES * 60;
    const startF = scheduleAt({ ...input, now: rampStart }).temperatureF;
    const capF = Math.min(WAKE_MAX_F, settings.baseTemperatureF + WAKE_MAX_ABOVE_BASE_F);
    const endF = Math.max(startF, Math.min(startF + settings.wakeRiseF, capF));
    return clampTemperatureF(interpolate(startF, endF, (now - rampStart) / (WAKE_RAMP_MINUTES * 60)));
};
// Ambient readings older than this are ignored for room compensation
export const AMBIENT_MAX_AGE_SECONDS = 15 * 60;
// A trusted external sensor wins whenever it's fresh. Otherwise fall back to the hub, then the cover.
// The pod's sensors read unreliably while the pod runs, and calibration only applies to them.
export const resolveRoom = (ambient, externalRoomC, settings) => {
    if (externalRoomC !== null)
        return { roomC: externalRoomC, source: 'external' };
    const raw = ambient?.hubAmbC ?? ambient?.coverAmbC ?? null;
    if (raw === null)
        return { roomC: null, source: null };
    return { roomC: raw + settings.roomCompensation.calibrationOffsetC, source: 'pod' };
};
// A warm room cools the bed, since heat is the main threat to sleep.
// A cold room only warms the bed a little, and only when it is really cold.
export const roomAdjustmentF = (settings, roomC) => {
    if (!settings.roomCompensation.enabled || roomC === null)
        return 0;
    if (roomC < COLD_ROOM_THRESHOLD_C) {
        return Math.min(COLD_ROOM_MAX_F, Math.round((COLD_ROOM_THRESHOLD_C - roomC) * COLD_ROOM_F_PER_C));
    }
    const deviationC = roomC - settings.roomCompensation.referenceC;
    if (deviationC < ROOM_DEADBAND_C)
        return 0;
    return Math.max(-settings.maxAdjustmentF, Math.round(-deviationC * ROOM_F_PER_C));
};
// Works out what the bed should be set to right now, and why
export const planTemperature = ({ settings, startedAt, now, coolDepthF, wakeAt, isNap, roomC }) => {
    if (isNap) {
        const napF = clampTemperatureF(settings.napTemperatureF);
        return { stage: 'steady', stageTargetF: napF, desiredF: napF, reason: 'nap', detail: 'Nap temperature' };
    }
    const schedule = { settings, startedAt, now, coolDepthF };
    if (wakeAt && now >= wakeAt - WAKE_RAMP_MINUTES * 60) {
        const rampF = wakeRampF(schedule, wakeAt);
        return { stage: 'wake', stageTargetF: rampF, desiredF: rampF, reason: 'wake', detail: 'Wake warm-up' };
    }
    const { stage, temperatureF } = scheduleAt(schedule);
    const adjustmentF = roomAdjustmentF(settings, roomC);
    if (adjustmentF === 0 || roomC === null) {
        return { stage, stageTargetF: temperatureF, desiredF: temperatureF, reason: 'schedule', detail: null };
    }
    const direction = adjustmentF < 0 ? 'warm' : 'cold';
    return {
        stage,
        stageTargetF: temperatureF,
        desiredF: clampTemperatureF(temperatureF + adjustmentF),
        reason: 'room',
        detail: `Room ${direction} at ${roomC.toFixed(1)} °C`,
    };
};
// The reason logged for an applied change. If the schedule moved, that is the reason;
// otherwise only the room can have changed the temperature.
export const describeDecision = (plan, lastTargetF) => {
    if (plan.reason === 'wake' || plan.reason === 'nap')
        return { reason: plan.reason, detail: plan.detail };
    if (plan.stageTargetF !== lastTargetF)
        return { reason: 'schedule', detail: plan.detail };
    return { reason: 'room', detail: plan.detail ?? 'Room back to normal' };
};
// Schedule steps apply as they come, the curve is already slow. Changes caused only
// by the room are rate limited so the bed doesn't oscillate.
export const shouldApply = ({ plan, lastTargetF, lastSetF, lastChangeAt, now, minMinutesBetweenChanges }) => {
    if (lastSetF === null || lastTargetF === null)
        return true;
    if (plan.desiredF === lastSetF)
        return false;
    if (plan.stageTargetF !== lastTargetF)
        return true;
    if (lastChangeAt === null)
        return true;
    return now - lastChangeAt >= minMinutesBetweenChanges * 60;
};
//# sourceMappingURL=stages.js.map
//# debugId=2ad0ef12-6c28-5372-8896-782eb6788bdb
