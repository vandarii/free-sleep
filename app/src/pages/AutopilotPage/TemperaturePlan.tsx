import { Box, Typography } from '@mui/material';
import type { AutopilotDecision, AutopilotSideStatus } from '@api/autopilot.ts';
import type { AutopilotSideSettings } from '@api/settingsSchema.ts';
import { CAUTIOUS_COOL_F } from '../../../../server/src/autopilot/bodyClock';
import { formatTemp } from './autopilotFormat.ts';

type TemperaturePlanProps = {
  autopilot: AutopilotSideSettings;
  bodyClock?: AutopilotSideStatus['bodyClock'];
  stage?: AutopilotDecision['stage'] | null;
  isCelsius: boolean;
};

const clockLabel = (hour: number) => {
  const wholeHour = Math.floor(hour);
  const minutes = Math.round((hour - wholeHour) * 60);
  return `${String(wholeHour).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
};

export default function TemperaturePlan({ autopilot, bodyClock, stage, isCelsius }: TemperaturePlanProps) {
  const { baseTemperatureF: baseF, earlyCoolF, entryTemperatureF: entryF, wakeRiseF } = autopilot;
  const isClockKnown = bodyClock?.temperatureMinimumHour != null;
  const coolDepthF = isClockKnown ? earlyCoolF : Math.min(earlyCoolF, CAUTIOUS_COOL_F);
  const steps = [
    { key: 'entry', label: 'Get in', temperatureF: entryF, stages: ['entry'] },
    { key: 'cool', label: 'Early', temperatureF: baseF - coolDepthF, stages: ['cooling'] },
    { key: 'base', label: 'Later', temperatureF: baseF, stages: ['easing', 'steady'] },
    { key: 'wake', label: 'Wake', temperatureF: Math.min(baseF + wakeRiseF, 80, baseF + 6), stages: ['wake'] },
  ];

  return (
    <Box>
      <Typography variant="overline" sx={ { color: 'text.secondary' } }>The plan</Typography>
      <Box sx={ { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 1 } }>
        { steps.map(step => (
          <Box
            key={ step.key }
            sx={ {
              border: '1px solid', borderColor: stage && step.stages.includes(stage) ? 'text.primary' : 'divider', borderRadius: 2,
              p: 1.25, display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0,
            } }
          >
            <Typography variant="caption" sx={ { color: 'text.secondary' } }>{ step.label }</Typography>
            <Typography sx={ { fontSize: 17, fontWeight: 600 } }>{ formatTemp(step.temperatureF, isCelsius) }</Typography>
          </Box>
        )) }
      </Box>
      { bodyClock && (
        <Typography variant="caption" component="p" sx={ { color: 'text.secondary', mt: 1 } }>
          { isClockKnown
            ? `Body clock estimate: coldest point around ${clockLabel(bodyClock.temperatureMinimumHour!)}, give or take 2-3 hours`
            : `Learning your body clock: ${bodyClock.sessionCount} of ${bodyClock.sessionsNeeded} sessions` }
        </Typography>
      ) }
    </Box>
  );
}
