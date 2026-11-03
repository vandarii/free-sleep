import axios from './api';
import { useQuery } from '@tanstack/react-query';
import type {
  AutopilotDecision,
  AutopilotSideStatus,
  AutopilotStatus,
  AmbientRecord,
  DecisionReason,
  SessionDetail,
  SleepSession,
  StartSessionBody,
} from '../../../server/src/autopilot/autopilotSchema';
import type { Side } from './schedulesSchema';

export type { AutopilotDecision, AutopilotSideStatus, AutopilotStatus, AmbientRecord, DecisionReason, SessionDetail, SleepSession };

export const useAutopilotStatus = () => useQuery<AutopilotStatus>({
  queryKey: ['useAutopilotStatus'],
  queryFn: async () => {
    const response = await axios.get<AutopilotStatus>('/autopilot/status');
    return response.data;
  },
  refetchInterval: 30_000,
});

export const useAutopilotSessions = (side: Side, limit = 14) => useQuery<SleepSession[]>({
  queryKey: ['useAutopilotSessions', side, limit],
  queryFn: async () => {
    const response = await axios.get<SleepSession[]>(`/autopilot/sessions?side=${side}&limit=${limit}`);
    return response.data;
  },
});

export const useAutopilotSession = (id?: number) => useQuery<SessionDetail>({
  queryKey: ['useAutopilotSession', id],
  queryFn: async () => {
    const response = await axios.get<SessionDetail>(`/autopilot/sessions/${id}`);
    return response.data;
  },
  enabled: id !== undefined,
  refetchInterval: 60_000,
});

export const startSleepSession = (body: StartSessionBody) => axios.post<SleepSession>('/autopilot/session/start', body);

export const endSleepSession = (side: Side) => axios.post<SleepSession>('/autopilot/session/end', { side });

export const resumeSleepSession = (side: Side) => axios.post<SleepSession>('/autopilot/session/resume', { side });
