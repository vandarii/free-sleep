import { DeepPartial } from 'ts-essentials';
import { Box, Divider, Switch, Typography } from '@mui/material';
import { AUTOPILOT_STAGES, AutopilotSideSettings, Settings, SideSettings } from '@api/settingsSchema.ts';
import type { Side } from '@state/appStore.tsx';
import SettingToggle from '../SettingsPage/SettingToggle.tsx';
import SettingsHint from '../SettingsPage/SettingsHint.tsx';
import { formatOffset, formatTemp, STAGE_LABELS } from './autopilotFormat.ts';
import Stepper from './SettingStepper.tsx';

type AutopilotSettingsProps = {
  side: Side;
  sideSettings?: SideSettings;
  isCelsius: boolean;
  disabled: boolean;
  updateSettings: (settings: DeepPartial<Settings>) => void;
};

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
      <Typography variant="overline" sx={ { color: 'text.secondary' } }>Stages</Typography>
      <Stepper
        label="Base temperature"
        value={ formatTemp(autopilot.baseTemperatureF, isCelsius) }
        canDecrement={ autopilot.baseTemperatureF > 55 }
        canIncrement={ autopilot.baseTemperatureF < 110 }
        disabled={ disabled }
        onChange={ direction => update({ baseTemperatureF: autopilot.baseTemperatureF + direction }) }
      />
      { AUTOPILOT_STAGES.map(stage => {
        const offset = autopilot.stageOffsetsF[stage];
        return (
          <Stepper
            key={ stage }
            label={ STAGE_LABELS[stage] }
            hint={ `${formatOffset(offset, isCelsius)} from base` }
            value={ formatTemp(Math.min(110, Math.max(55, autopilot.baseTemperatureF + offset)), isCelsius) }
            canDecrement={ offset > -20 }
            canIncrement={ offset < 20 }
            disabled={ disabled }
            onChange={ direction => update({ stageOffsetsF: { [stage]: offset + direction } }) }
          />
        );
      }) }
      <Stepper
        label="Nap"
        value={ formatTemp(autopilot.napTemperatureF, isCelsius) }
        canDecrement={ autopilot.napTemperatureF > 55 }
        canIncrement={ autopilot.napTemperatureF < 110 }
        disabled={ disabled }
        onChange={ direction => update({ napTemperatureF: autopilot.napTemperatureF + direction }) }
      />
      <SettingsHint>
        Falling asleep: first 30 min. Deep sleep: until 3 h. REM: the rest of the night. Wake-up: the last 30 min before your wake time.
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
        A room warmer than the reference cools the bed, a colder one warms it (1°F per °C, ignoring the first 1°C).
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
