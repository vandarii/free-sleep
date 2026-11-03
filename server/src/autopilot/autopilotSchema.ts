// WARNING! - The app imports these types directly, keep them compatible with app/src/api/autopilot.ts
import { z } from 'zod';
import { AutopilotStage } from '../db/settingsSchema.js';

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

export type StartSessionBody = z.infer<typeof StartSessionSchema>;
export type AmbientReading = z.infer<typeof AmbientReadingSchema>;

export type SessionEndReason = 'manual' | 'tap' | 'api' | 'out_of_bed' | 'max_length';
export type SessionSource = 'manual' | 'tap' | 'api';
export type DecisionReason = 'stage' | 'room' | 'wake' | 'nap';

export type SleepSession = {
  id: number;
  side: 'left' | 'right';
  startedAt: number;
  endedAt: number | null;
  endReason: SessionEndReason | null;
  startSource: SessionSource;
  isNap: boolean;
  napRequested: boolean;
  wakeAt: number | null;
  dryRun: boolean;
};

export type AutopilotDecision = {
  id: number;
  sessionId: number;
  timestamp: number;
  stage: AutopilotStage;
  targetF: number;
  setF: number;
  reason: DecisionReason;
  detail: string | null;
  dryRun: boolean;
};

export type AmbientRecord = {
  timestamp: number;
  hubAmbC: number | null;
  coverAmbC: number | null;
  humidity: number | null;
  leftBodyC: number | null;
  rightBodyC: number | null;
};

export type AutopilotSideStatus = {
  enabled: boolean;
  dryRun: boolean;
  session: SleepSession | null;
  stage: AutopilotStage | null;
  stageTargetF: number | null;
  setF: number | null;
  roomC: number | null;
  humidity: number | null;
  absentSince: number | null;
  lastDecision: AutopilotDecision | null;
  // Most recent ended session, used to offer "resume" after an auto-end
  lastSession: SleepSession | null;
  canResume: boolean;
};

export type AutopilotStatus = {
  left: AutopilotSideStatus;
  right: AutopilotSideStatus;
};

export type SessionDetail = {
  session: SleepSession;
  decisions: AutopilotDecision[];
  ambient: AmbientRecord[];
};
