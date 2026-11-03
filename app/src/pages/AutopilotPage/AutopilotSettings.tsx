import { DeepPartial } from 'ts-essentials';
import { Box, Divider, Switch, Typography } from '@mui/material';
import { AutopilotSideSettings, Settings, SideSettings } from '@api/settingsSchema.ts';
import type { Side } from '@state/appStore.tsx';
import SettingToggle from '../SettingsPage/SettingToggle.tsx';
import SettingsHint from '../SettingsPage/SettingsHint.tsx';
import { formatOffset, formatTemp } from './autopilotFormat.ts';
import Stepper from './SettingStepper.tsx';

type AutopilotSettingsProps = {
  side: Side;
  sideSettings?: SideSettings;
  isCelsius: boolean;
  disabled: boolean;
  updateSettings: (settings: DeepPartial<Settings>) => void;
};

// Limits for the app's controls; the server enforces 60-100°F while someone is in bed
const SOFT_MIN_F = 65;
const SOFT_MAX_F = 95;

const SLEEP_TAP = { type: 'sleepSession' } as const;
const DEFAULT_TRIPLE_TAP = { type: 'temperature', change: 'increment', amount: 1 } as const;

export default function AutopilotSettings({ side, sideSettings, isCelsius, disabled, updateSettings }: AutopilotSettingsProps) {
  const autopilot = sideSettings?.autopilot;
  if (!autopilot) return null;

  const update = (partial: DeepPartial<AutopilotSideSettings>) => updateSettings({ [side]: { autopilot: partial } });
  const tripleTapStartsSleep = sideSettings?.taps.tripleTap.type === 'sleepSession';
  const room = autopilot.roomCompensation;
  const celsiusStep = 0.5;

  return (
    <Box sx={ { display: 'flex', flexDirection: 'column', gap: 1.5 } }>
      <SettingToggle
        label="Autopilot"
        control={ <Switch disabled={ disabled } checked={ autopilot.enabled } onChange={ event => update({ enabled: event.target.checked }) }/> }
      >
        While on, this side's power and temperature schedules are paused. Alarms still run.
      </SettingToggle>
      <SettingToggle
        label="Dry run"
        control={ <Switch disabled={ disabled } checked={ autopilot.dryRun } onChange={ event => update({ dryRun: event.target.checked }) }/> }
      >
        Logs what Autopilot would do without changing the temperature. Applies to sessions started after the change.
      </SettingToggle>
      <SettingToggle
        label="Triple-tap starts or ends sleep"
        control={
          <Switch
            disabled={ disabled }
            checked={ tripleTapStartsSleep }
            onChange={ event => updateSettings({ [side]: { taps: { tripleTap: event.target.checked ? SLEEP_TAP : DEFAULT_TRIPLE_TAP } } }) }
          />
        }
      />

      <Divider/>
      <Typography variant="overline" sx={ { color: 'text.secondary' } }>Temperature curve</Typography>
      <Stepper
        label="Getting into bed"
        hint="Held for 15 minutes, then a slow ramp down"
        value={ formatTemp(autopilot.entryTemperatureF, isCelsius) }
        canDecrement={ autopilot.entryTemperatureF > SOFT_MIN_F }
        canIncrement={ autopilot.entryTemperatureF < SOFT_MAX_F }
        disabled={ disabled }
        onChange={ direction => update({ entryTemperatureF: autopilot.entryTemperatureF + direction }) }
      />
      <Stepper
        label="Base temperature"
        hint="Where the bed settles for the rest of the sleep"
        value={ formatTemp(autopilot.baseTemperatureF, isCelsius) }
        canDecrement={ autopilot.baseTemperatureF > SOFT_MIN_F }
        canIncrement={ autopilot.baseTemperatureF < SOFT_MAX_F }
        disabled={ disabled }
        onChange={ direction => update({ baseTemperatureF: autopilot.baseTemperatureF + direction }) }
      />
      <Stepper
        label="Early cooling"
        hint="Below base for about the first 3 hours"
        value={ formatOffset(-autopilot.earlyCoolF, isCelsius) }
        canDecrement={ autopilot.earlyCoolF > 0 }
        canIncrement={ autopilot.earlyCoolF < 10 }
        disabled={ disabled }
        onChange={ direction => update({ earlyCoolF: autopilot.earlyCoolF - direction }) }
      />
      <Stepper
        label="Wake-up warm-up"
        hint="Only with a wake time, comfort rather than alertness"
        value={ formatOffset(autopilot.wakeRiseF, isCelsius) }
        canDecrement={ autopilot.wakeRiseF > 0 }
        canIncrement={ autopilot.wakeRiseF < 6 }
        disabled={ disabled }
        onChange={ direction => update({ wakeRiseF: autopilot.wakeRiseF + direction }) }
      />
      <Stepper
        label="Nap"
        value={ formatTemp(autopilot.napTemperatureF, isCelsius) }
        canDecrement={ autopilot.napTemperatureF > SOFT_MIN_F }
        canIncrement={ autopilot.napTemperatureF < SOFT_MAX_F }
        disabled={ disabled }
        onChange={ direction => update({ napTemperatureF: autopilot.napTemperatureF + direction }) }
      />
      <SettingsHint>
        The bed follows a slow schedule rather than reacting to sleep stages, which can't be detected reliably.
        Early cooling is limited to −2°F until there are 4 sessions to estimate your body clock, and when REM is likely early on.
      </SettingsHint>

      <Divider/>
      <Typography variant="overline" sx={ { color: 'text.secondary' } }>Room compensation</Typography>
      <SettingToggle
        label="Adjust for room temperature"
        control={
          <Switch
            disabled={ disabled }
            checked={ room.enabled }
            onChange={ event => update({ roomCompensation: { enabled: event.target.checked } }) }
          />
        }
      >
        A room warmer than the reference cools the bed 1°F per °C. Below 18°C it warms a little. Off by default,
        because the pod's room sensor reads unreliably while the pod runs.
      </SettingToggle>
      <Stepper
        label="Reference room temperature"
        value={ `${room.referenceC.toFixed(1)}°C` }
        canDecrement={ room.referenceC > 10 }
        canIncrement={ room.referenceC < 35 }
        disabled={ disabled || !room.enabled }
        onChange={ direction => update({ roomCompensation: { referenceC: room.referenceC + direction * celsiusStep } }) }
      />
      <Stepper
        label="Sensor calibration"
        hint="Added to the pod's room reading"
        value={ `${room.calibrationOffsetC > 0 ? '+' : ''}${room.calibrationOffsetC.toFixed(1)}°C` }
        canDecrement={ room.calibrationOffsetC > -10 }
        canIncrement={ room.calibrationOffsetC < 10 }
        disabled={ disabled || !room.enabled }
        onChange={ direction => update({ roomCompensation: { calibrationOffsetC: room.calibrationOffsetC + direction * celsiusStep } }) }
      />

      <Divider/>
      <Typography variant="overline" sx={ { color: 'text.secondary' } }>Limits and safety</Typography>
      <Stepper
        label="Max adjustment"
        hint="From the stage target"
        value={ formatOffset(autopilot.maxAdjustmentF, isCelsius).replace('+', '±') }
        canDecrement={ autopilot.maxAdjustmentF > 0 }
        canIncrement={ autopilot.maxAdjustmentF < 10 }
        disabled={ disabled }
        onChange={ direction => update({ maxAdjustmentF: autopilot.maxAdjustmentF + direction }) }
      />
      <Stepper
        label="Min time between changes"
        value={ `${autopilot.minMinutesBetweenChanges} min` }
        canDecrement={ autopilot.minMinutesBetweenChanges > 5 }
        canIncrement={ autopilot.minMinutesBetweenChanges < 120 }
        disabled={ disabled }
        onChange={ direction => update({ minMinutesBetweenChanges: autopilot.minMinutesBetweenChanges + direction * 5 }) }
      />
      <Stepper
        label="End when out of bed for"
        hint="The session end is set back to when you got up"
        value={ `${autopilot.autoEndAbsentMinutes} min` }
        canDecrement={ autopilot.autoEndAbsentMinutes > 10 }
        canIncrement={ autopilot.autoEndAbsentMinutes < 240 }
        disabled={ disabled }
        onChange={ direction => update({ autoEndAbsentMinutes: autopilot.autoEndAbsentMinutes + direction * 10 }) }
      />
      <Stepper
        label="Max session length"
        value={ `${autopilot.maxSessionHours} h` }
        canDecrement={ autopilot.maxSessionHours > 2 }
        canIncrement={ autopilot.maxSessionHours < 24 }
        disabled={ disabled }
        onChange={ direction => update({ maxSessionHours: autopilot.maxSessionHours + direction }) }
      />
      <Stepper
        label="Count as a nap if shorter than"
        value={ `${autopilot.napMaxMinutes} min` }
        canDecrement={ autopilot.napMaxMinutes > 0 }
        canIncrement={ autopilot.napMaxMinutes < 240 }
        disabled={ disabled }
        onChange={ direction => update({ napMaxMinutes: autopilot.napMaxMinutes + direction * 10 }) }
      />
    </Box>
  );
}
