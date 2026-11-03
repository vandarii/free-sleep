import { useEffect, useState } from 'react';
import moment from 'moment-timezone';
import { DeepPartial } from 'ts-essentials';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import ShowChartOutlinedIcon from '@mui/icons-material/ShowChartOutlined';
import PageContainer from '../PageContainer.tsx';
import PageHeader from '@components/PageHeader.tsx';
import SideControl from '@components/SideControl.tsx';
import ErrorBoundary from '@components/ErrorBoundary.tsx';
import Section from '../SettingsPage/Section.tsx';
import { useAppStore } from '@state/appStore.tsx';
import { postSettings, useSettings } from '@api/settings.ts';
import { Settings } from '@api/settingsSchema.ts';
import { useAutopilotSession, useAutopilotSessions, useAutopilotStatus } from '@api/autopilot.ts';
import SessionCard from './SessionCard.tsx';
import SessionHistory from './SessionHistory.tsx';
import AutopilotSettings from './AutopilotSettings.tsx';
import TemperaturePlan from './TemperaturePlan.tsx';

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
        <TemperaturePlan autopilot={ autopilot } bodyClock={ sideStatus?.bodyClock } stage={ sideStatus?.stage } isCelsius={ isCelsius }/>
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
