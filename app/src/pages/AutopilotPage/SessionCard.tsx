import { useEffect, useState } from 'react';
import moment from 'moment-timezone';
import { isAxiosError } from 'axios';
import { Alert, Box, Button, Card, CardContent, Chip, IconButton, TextField, Typography } from '@mui/material';
import BedtimeOutlinedIcon from '@mui/icons-material/BedtimeOutlined';
import CloseIcon from '@mui/icons-material/Close';
import type { AutopilotSideStatus } from '@api/autopilot.ts';
import { endSleepSession, resumeSleepSession, startSleepSession } from '@api/autopilot.ts';
import type { SideSettings } from '@api/settingsSchema.ts';
import type { Side } from '@state/appStore.tsx';
import { formatClock, formatDuration, formatRoom, formatTemp, STAGE_LABELS } from './autopilotFormat.ts';
import Metric from './SessionMetric.tsx';

type SessionCardProps = {
  side: Side;
  status?: AutopilotSideStatus;
  sideSettings?: SideSettings;
  isCelsius: boolean;
  onChanged: () => void;
};

const WAKE_HINT = 'The bed warms up over the last 30 minutes before this time';
const NO_WAKE_HINT = 'Leave empty to sleep without a wake-up warm-up';
const BIG_BUTTON_SX = { minHeight: 52, fontSize: 16 };

const END_REASON_LABELS: Record<string, string> = {
  out_of_bed: 'you were out of bed',
  max_length: 'it reached the maximum length',
  tap: 'of a triple tap',
  manual: 'it was ended from the app',
};

const endReasonLabel = (reason: string | null) => END_REASON_LABELS[reason ?? ''] ?? 'it was ended';

const errorMessage = (error: unknown) => {
  if (isAxiosError(error)) return String(error.response?.data?.error ?? error.message);
  return error instanceof Error ? error.message : String(error);
};

// Next occurrence of a HH:mm wake time, as Unix seconds
const nextWakeAt = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  const wake = moment().hours(hours).minutes(minutes).seconds(0);
  if (wake.isBefore(moment())) wake.add(1, 'day');
  return wake.unix();
};

const useNow = () => {
  const [now, setNow] = useState(() => moment().unix());
  useEffect(() => {
    const timer = setInterval(() => setNow(moment().unix()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
};

export default function SessionCard({ side, status, sideSettings, isCelsius, onChanged }: SessionCardProps) {
  const [wakeTime, setWakeTime] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const now = useNow();
  const session = status?.session;
  const autopilot = sideSettings?.autopilot;

  const run = (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(undefined);
    action()
      .then(onChanged)
      .catch(actionError => setError(errorMessage(actionError)))
      .finally(() => setBusy(false));
  };

  const start = (nap: boolean) => run(() => startSleepSession({
    side,
    nap,
    ...(wakeTime && !nap ? { wakeAt: nextWakeAt(wakeTime) } : {}),
  }));

  if (!session) {
    const lastSession = status?.lastSession;
    return (
      <Card>
        <CardContent sx={ { display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'stretch' } }>
          <Box sx={ { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, textAlign: 'center', py: 1 } }>
            <BedtimeOutlinedIcon sx={ { fontSize: 32, color: 'info.main' } }/>
            <Typography variant="h5" component="h2">Ready when you are</Typography>
            <Typography variant="body2" sx={ { color: 'text.secondary', maxWidth: 420 } }>
              Autopilot only controls this side during a sleep session. Start one when you go to bed.
            </Typography>
          </Box>

          { !autopilot?.enabled && (
            <Alert severity="info">Autopilot is off for this side. Turn it on in Autopilot settings below.</Alert>
          ) }

          { status?.canResume && lastSession?.endedAt && (
            <Alert
              severity="warning"
              action={
                <Button color="inherit" size="small" disabled={ busy } onClick={ () => run(() => resumeSleepSession(side)) }>Resume</Button>
              }
            >
              Your session ended at { formatClock(lastSession.endedAt) } because { endReasonLabel(lastSession.endReason) }.
            </Alert>
          ) }

          <TextField
            label="Wake me at (optional)"
            type="time"
            value={ wakeTime }
            onChange={ event => setWakeTime(event.target.value) }
            disabled={ busy || !autopilot?.enabled }
            slotProps={ {
              inputLabel: { shrink: true },
              input: {
                endAdornment: wakeTime ? (
                  <IconButton aria-label="Clear wake time" size="small" onClick={ () => setWakeTime('') }>
                    <CloseIcon fontSize="small"/>
                  </IconButton>
                ) : undefined,
              },
            } }
            helperText={ wakeTime ? WAKE_HINT : NO_WAKE_HINT }
          />

          <Button variant="contained" size="large" disabled={ busy || !autopilot?.enabled } onClick={ () => start(false) } sx={ BIG_BUTTON_SX }>
            Start sleep
          </Button>
          <Button variant="outlined" disabled={ busy || !autopilot?.enabled } onClick={ () => start(true) }>
            Start nap
          </Button>
          { error && <Alert severity="error">{ error }</Alert> }
        </CardContent>
      </Card>
    );
  }

  const elapsed = now - session.startedAt;
  const absentSince = status?.absentSince;
  const autoEndAt = absentSince && autopilot ? Math.max(absentSince, session.startedAt) + autopilot.autoEndAbsentMinutes * 60 : null;
  const lastDecision = status?.lastDecision;

  return (
    <Card>
      <CardContent sx={ { display: 'flex', flexDirection: 'column', gap: 2 } }>
        <Box sx={ { display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' } }>
          <Box component="span" sx={ { width: 8, height: 8, borderRadius: '50%', bgcolor: 'success.main' } }/>
          <Typography variant="body2" sx={ { color: 'success.main' } }>
            { session.isNap ? 'Napping' : 'Sleeping' } · { formatDuration(elapsed) }
          </Typography>
          { session.dryRun && <Chip size="small" color="warning" label="Dry run" sx={ { ml: 'auto' } }/> }
        </Box>

        <Box sx={ { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 2 } }>
          <Box>
            <Typography variant="caption" sx={ { color: 'text.secondary' } }>
              { session.isNap ? 'Nap' : `${STAGE_LABELS[status?.stage ?? 'falling']} (estimated)` }
            </Typography>
            <Typography sx={ { fontSize: 44, fontWeight: 600, letterSpacing: '-0.04em', lineHeight: 1.1 } }>
              { formatTemp(status?.setF, isCelsius) }
            </Typography>
          </Box>
          <Box sx={ { textAlign: 'right' } }>
            <Typography variant="caption" sx={ { color: 'text.secondary' } }>Stage target</Typography>
            <Typography sx={ { color: 'info.main' } }>{ formatTemp(status?.stageTargetF, isCelsius) }</Typography>
          </Box>
        </Box>

        <Box sx={ { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 } }>
          <Metric label="Room" value={ formatRoom(status?.roomC, isCelsius) } sub="pod sensor"/>
          <Metric label="Humidity" value={ status?.humidity != null ? `${Math.round(status.humidity)}%` : '—' } sub="cover sensor"/>
        </Box>

        { lastDecision && (
          <Box sx={ { border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5 } }>
            <Typography variant="body2">
              { session.dryRun ? 'Would set' : 'Set' } { formatTemp(lastDecision.setF, isCelsius) } at { formatClock(lastDecision.timestamp) }
            </Typography>
            <Typography variant="caption" sx={ { color: 'text.secondary' } }>
              { lastDecision.detail ?? STAGE_LABELS[lastDecision.stage] }
            </Typography>
          </Box>
        ) }

        { autoEndAt && (
          <Alert severity="info">
            Out of bed since { formatClock(absentSince!) }. The session ends automatically at { formatClock(autoEndAt) } unless you come back.
          </Alert>
        ) }

        { session.wakeAt && (
          <Typography variant="body2" sx={ { color: 'text.secondary', textAlign: 'center' } }>
            Wake at { formatClock(session.wakeAt) } · warm-up starts { formatClock(session.wakeAt - 30 * 60) }
          </Typography>
        ) }

        <Button variant="outlined" size="large" disabled={ busy } onClick={ () => run(() => endSleepSession(side)) } sx={ BIG_BUTTON_SX }>
          End sleep
        </Button>
        { error && <Alert severity="error">{ error }</Alert> }
      </CardContent>
    </Card>
  );
}
