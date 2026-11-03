// Tracks continuous bed absence per side for Autopilot's auto-end.
// The biometrics stream reports presence with a ~10 second tolerance, so a person
// lying still flips between present and absent a lot. Short presence blips do not
// reset an absence that is already running.
import type { Side } from '../db/schedulesSchema.js';

// Presence must last this long before it cancels a running absence
export const PRESENCE_BLIP_SECONDS = 120;

type SidePresence = {
  present: boolean | null;
  presentSince: number | null;
  absentSince: number | null;
};

const presence: Record<Side, SidePresence> = {
  left: { present: null, presentSince: null, absentSince: null },
  right: { present: null, presentSince: null, absentSince: null },
};

const nowSeconds = () => Math.floor(Date.now() / 1000);

export const recordPresence = (side: Side, present: boolean, at = nowSeconds()) => {
  const state = presence[side];
  if (present) {
    if (state.present !== true) state.presentSince = at;
  } else if (state.present !== false) {
    const heldPresence = state.presentSince !== null && at - state.presentSince >= PRESENCE_BLIP_SECONDS;
    // A real (non-blip) presence ends the old absence, so a new one starts now
    if (heldPresence || state.absentSince === null) state.absentSince = at;
    state.presentSince = null;
  }
  state.present = present;
};

// Unix seconds when the current continuous absence began, or null if present/unknown
export const getAbsentSince = (side: Side, at = nowSeconds()): number | null => {
  const state = presence[side];
  if (state.present === true && state.presentSince !== null && at - state.presentSince >= PRESENCE_BLIP_SECONDS) {
    state.absentSince = null;
  }
  return state.absentSince;
};

// Only used by tests
export const resetPresence = () => {
  for (const side of ['left', 'right'] as Side[]) {
    presence[side] = { present: null, presentSince: null, absentSince: null };
  }
};
