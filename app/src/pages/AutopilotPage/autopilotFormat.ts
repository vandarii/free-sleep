import moment from 'moment-timezone';
import { formatTemperature } from '@lib/temperatureConversions.ts';
import type { AutopilotDecision, DecisionReason } from '@api/autopilot.ts';

// Includes the stage names logged before the time-based curve, so old sessions still read well
export const STAGE_LABELS: Record<AutopilotDecision['stage'], string> = {
  entry: 'Getting into bed',
  cooling: 'Early cooling',
  easing: 'Easing to base',
  steady: 'Steady',
  wake: 'Wake-up',
  falling: 'Falling asleep',
  deep: 'Deep sleep',
  rem: 'REM',
};

export const SHORT_STAGE_LABELS: Record<AutopilotDecision['stage'], string> = {
  entry: 'Entry',
  cooling: 'Cool',
  easing: 'Ease',
  steady: 'Steady',
  wake: 'Wake',
  falling: 'Falling',
  deep: 'Deep',
  rem: 'REM',
};

// Each reason gets a color and a marker shape so the chart doesn't rely on color alone
type ReasonStyle = { label: string; color: string; shape: 'circle' | 'diamond' | 'square' | 'triangle' };

export const REASON_STYLES: Record<DecisionReason, ReasonStyle> = {
  schedule: { label: 'Schedule change', color: '#8a8a8a', shape: 'circle' },
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
