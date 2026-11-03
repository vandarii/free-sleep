import moment from 'moment-timezone';
import { formatTemperature } from '@lib/temperatureConversions.ts';
import type { DecisionReason } from '@api/autopilot.ts';
import type { AutopilotStage } from '@api/settingsSchema.ts';

export const STAGE_LABELS: Record<AutopilotStage, string> = {
  falling: 'Falling asleep',
  deep: 'Deep sleep',
  rem: 'REM',
  wake: 'Wake-up',
};

export const SHORT_STAGE_LABELS: Record<AutopilotStage, string> = {
  falling: 'Falling',
  deep: 'Deep',
  rem: 'REM',
  wake: 'Wake',
};

// Each reason gets a color and a marker shape so the chart doesn't rely on color alone
type ReasonStyle = { label: string; color: string; shape: 'circle' | 'diamond' | 'square' | 'triangle' };

export const REASON_STYLES: Record<DecisionReason, ReasonStyle> = {
  stage: { label: 'Stage change', color: '#8a8a8a', shape: 'circle' },
  room: { label: 'Room temperature', color: '#77cba5', shape: 'diamond' },
  wake: { label: 'Wake warm-up', color: '#f0b45a', shape: 'triangle' },
  nap: { label: 'Nap', color: '#8baef4', shape: 'square' },
};

export const COLD_COLOR = '#8baef4';
export const WARM_COLOR = '#f0a070';

export const formatTemp = (temperatureF: number | null | undefined, isCelsius: boolean) =>
  temperatureF === null || temperatureF === undefined ? '—' : formatTemperature(temperatureF, isCelsius);

// Offsets are stored in °F; show them as a signed delta in the user's unit
export const formatOffset = (offsetF: number, isCelsius: boolean) => {
  const value = isCelsius ? Math.round((offsetF * 5 / 9) * 2) / 2 : offsetF;
  const sign = value > 0 ? '+' : value < 0 ? '−' : '±';
  return `${sign}${Math.abs(value)}°${isCelsius ? 'C' : 'F'}`;
};

export const formatRoom = (roomC: number | null | undefined, isCelsius: boolean) => {
  if (roomC === null || roomC === undefined) return '—';
  return isCelsius ? `${roomC.toFixed(1)}°C` : `${Math.round(roomC * 9 / 5 + 32)}°F`;
};

export const formatClock = (unixSeconds: number) => moment.unix(unixSeconds).format('HH:mm');

export const formatDuration = (seconds: number) => {
  const totalMinutes = Math.max(0, Math.round(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${String(minutes).padStart(2, '0')}m` : `${minutes}m`;
};
