import { useEffect, useState } from 'react';
import moment from 'moment-timezone';
import { DeepPartial } from 'ts-essentials';
import { Box, Typography } from '@mui/material';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import ShowChartOutlinedIcon from '@mui/icons-material/ShowChartOutlined';
import PageContainer from '../PageContainer.tsx';
import PageHeader from '@components/PageHeader.tsx';
import SideControl from '@components/SideControl.tsx';
import ErrorBoundary from '@components/ErrorBoundary.tsx';
import Section from '../SettingsPage/Section.tsx';
import { useAppStore } from '@state/appStore.tsx';
import { postSettings, useSettings } from '@api/settings.ts';
import { AUTOPILOT_STAGES, Settings } from '@api/settingsSchema.ts';
import { useAutopilotSession, useAutopilotSessions, useAutopilotStatus } from '@api/autopilot.ts';
import SessionCard from './SessionCard.tsx';
import SessionHistory from './SessionHistory.tsx';
import AutopilotSettings from './AutopilotSettings.tsx';
import { COLD_COLOR, formatOffset, formatTemp, SHORT_STAGE_LABELS, WARM_COLOR } from './autopilotFormat.ts';

export default function AutopilotPage() {
  const { side, isUpdating, setIsUpdating } = useAppStore();
  const { data: settings, refetch: refetchSettings } = useSettings();
  const { data: status, refetch: refetchStatus } = useAutopilotStatus();
  const { data: sessions, refetch: refetchSessions } = useAutopilotSessions(side);
  const [selectedId, setSelectedId] = useState<number>();
  const sessionId = selectedId ?? sessions?.[0]?.id;
  const { data: detail, refetch: refetchDetail } = useAutopilotSession(sessionId);
  const isCelsius = settings?.temperatureFormat === 'celsius';
  const sideSettings = settings?.[side];
  const sideStatus = status?.[side];
  const now = moment().unix();

  // A different side has different sessions
  useEffect(() => setSelectedId(undefined), [side]);

  const refreshAll = () => {
    void refetchStatus();
    void refetchSessions();
    if (sessionId !== undefined) void refetchDetail();
  };

  const updateSettings = (partial: DeepPartial<Settings>) => {
    setIsUpdating(true);
    postSettings(partial)
      .then(() => Promise.all([refetchSettings(), refetchStatus()]))
      .catch(error => console.error(error))
      .finally(() => setIsUpdating(false));
  };

  const autopilot = sideSettings?.autopilot;

  return (
    <PageContainer sx={ { maxWidth: 760 } }>
      <PageHeader title="Autopilot"/>
      <SideControl/>

      <ErrorBoundary componentName="Sleep session">
        <SessionCard side={ side } status={ sideStatus } sideSettings={ sideSettings } isCelsius={ isCelsius } onChanged={ refreshAll }/>
      </ErrorBoundary>

      { autopilot && (
        <Box>
          <Typography variant="overline" sx={ { color: 'text.secondary' } }>
            Tonight's plan · base { formatTemp(autopilot.baseTemperatureF, isCelsius) }
          </Typography>
          <Box sx={ { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 1 } }>
            { AUTOPILOT_STAGES.map(stage => {
              const offset = autopilot.stageOffsetsF[stage];
              const isCurrent = sideStatus?.session && !sideStatus.session.isNap && sideStatus.stage === stage;
              return (
                <Box
                  key={ stage }
                  sx={ {
                    border: '1px solid', borderColor: isCurrent ? 'text.primary' : 'divider', borderRadius: 2,
                    p: 1.25, display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0,
                  } }
                >
                  <Typography variant="caption" sx={ { color: 'text.secondary' } }>{ SHORT_STAGE_LABELS[stage] }</Typography>
                  <Typography sx={ { fontSize: 17, fontWeight: 600 } }>
                    { formatTemp(Math.min(110, Math.max(55, autopilot.baseTemperatureF + offset)), isCelsius) }
                  </Typography>
                  <Typography variant="caption" sx={ { color: offset > 0 ? WARM_COLOR : COLD_COLOR } }>
                    { formatOffset(offset, isCelsius) }
                  </Typography>
                </Box>
              );
            }) }
          </Box>
        </Box>
      ) }

      <ErrorBoundary componentName="Sleep sessions">
        <Section title="Nights" icon={ <ShowChartOutlinedIcon/> }>
          <SessionHistory
            sessions={ sessions }
            selectedId={ sessionId }
            onSelect={ setSelectedId }
            detail={ detail?.session.side === side ? detail : undefined }
            isCelsius={ isCelsius }
            now={ now }
          />
        </Section>
      </ErrorBoundary>

      <ErrorBoundary componentName="Autopilot settings">
        <Section title="Autopilot settings" icon={ <TuneOutlinedIcon/> }>
          <AutopilotSettings
            side={ side }
            sideSettings={ sideSettings }
            isCelsius={ isCelsius }
            disabled={ isUpdating }
            updateSettings={ updateSettings }
          />
        </Section>
      </ErrorBoundary>
    </PageContainer>
  );
}
