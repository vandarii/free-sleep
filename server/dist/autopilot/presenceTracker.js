// Presence must last this long before it cancels a running absence

!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="2b8e8534-7ad5-5ff7-87eb-fd9e61935107")}catch(e){}}();
export const PRESENCE_BLIP_SECONDS = 120;
const presence = {
    left: { present: null, presentSince: null, absentSince: null },
    right: { present: null, presentSince: null, absentSince: null },
};
const nowSeconds = () => Math.floor(Date.now() / 1000);
export const recordPresence = (side, present, at = nowSeconds()) => {
    const state = presence[side];
    if (present) {
        if (state.present !== true)
            state.presentSince = at;
    }
    else if (state.present !== false) {
        const heldPresence = state.presentSince !== null && at - state.presentSince >= PRESENCE_BLIP_SECONDS;
        // A real (non-blip) presence ends the old absence, so a new one starts now
        if (heldPresence || state.absentSince === null)
            state.absentSince = at;
        state.presentSince = null;
    }
    state.present = present;
};
// Unix seconds when the current continuous absence began, or null if present/unknown
export const getAbsentSince = (side, at = nowSeconds()) => {
    const state = presence[side];
    if (state.present === true && state.presentSince !== null && at - state.presentSince >= PRESENCE_BLIP_SECONDS) {
        state.absentSince = null;
    }
    return state.absentSince;
};
// Only used by tests
export const resetPresence = () => {
    for (const side of ['left', 'right']) {
        presence[side] = { present: null, presentSince: null, absentSince: null };
    }
};
//# sourceMappingURL=presenceTracker.js.map
//# debugId=2b8e8534-7ad5-5ff7-87eb-fd9e61935107
