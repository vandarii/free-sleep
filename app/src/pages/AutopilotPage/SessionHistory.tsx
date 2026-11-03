import moment from 'moment-timezone';
import { Box, Card, CardContent, Chip, List, ListItemButton, Typography } from '@mui/material';
import type { AutopilotDecision, SessionDetail, SleepSession } from '@api/autopilot.ts';
import NightChart from './NightChart.tsx';
import { formatClock, formatDuration } from './autopilotFormat.ts';
import DecisionRow from './DecisionRow.tsx';

type SessionHistoryProps = {
  sessions?: SleepSession[];
  selectedId?: number;
  onSelect: (id: number) => void;
  detail?: SessionDetail;
  isCelsius: boolean;
  now: number;
};

const sessionTitle = (session: SleepSession) => {
  const start = moment.unix(session.startedAt);
  return `${start.format('ddd D MMM')} · ${start.format('HH:mm')}–${session.endedAt ? formatClock(session.endedAt) : 'now'}`;
};

type DecisionListRow = { decision: AutopilotDecision; previous?: AutopilotDecision; finalF?: number };

// The wake ramp logs one decision per degree; show it as a single row with its final temperature
const collapseWakeRamp = (decisions: AutopilotDecision[]): DecisionListRow[] => {
  const rows: DecisionListRow[] = [];
  decisions.forEach((decision, index) => {
    const lastRow = rows[rows.length - 1];
    if (decision.reason === 'wake' && lastRow?.decision.reason === 'wake') {
      lastRow.finalF = decision.setF;
      return;
    }
    rows.push({ decision, previous: decisions[index - 1] });
  });
  return rows;
};

export default function SessionHistory({ sessions, selectedId, onSelect, detail, isCelsius, now }: SessionHistoryProps) {
  if (!sessions || sessions.length === 0) {
    return (
      <Card>
        <CardContent>
          <Typography variant="body2" sx={ { color: 'text.secondary' } }>
            No sleep sessions yet. Your first night will show up here with a chart of every adjustment.
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent sx={ { display: 'flex', flexDirection: 'column', gap: 2 } }>
        { detail && (
          <>
            <Box sx={ { display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' } }>
              <Typography variant="h6" component="h3">{ sessionTitle(detail.session) }</Typography>
              { detail.session.isNap && <Chip size="small" label="Nap"/> }
              { detail.session.dryRun && <Chip size="small" color="warning" label="Dry run"/> }
            </Box>
            <NightChart detail={ detail } isCelsius={ isCelsius } now={ now }/>
            <Box>
              <Typography variant="overline" sx={ { color: 'text.secondary' } }>Why it changed</Typography>
              { collapseWakeRamp(detail.decisions).map(({ decision, previous, finalF }) => (
                <DecisionRow key={ decision.id } decision={ decision } previous={ previous } finalF={ finalF } isCelsius={ isCelsius }/>
              )) }
            </Box>
          </>
        ) }
        <Box>
          <Typography variant="overline" sx={ { color: 'text.secondary' } }>Recent sessions</Typography>
          <List disablePadding>
            { sessions.map(session => (
              <ListItemButton
                key={ session.id }
                selected={ session.id === selectedId }
                onClick={ () => onSelect(session.id) }
                sx={ { borderRadius: 1, display: 'flex', justifyContent: 'space-between', gap: 1 } }
              >
                <Typography variant="body2">{ sessionTitle(session) }</Typography>
                <Typography variant="caption" sx={ { color: 'text.secondary', flexShrink: 0 } }>
                  { session.isNap ? 'Nap · ' : '' }{ formatDuration((session.endedAt ?? now) - session.startedAt) }
                </Typography>
              </ListItemButton>
            )) }
          </List>
        </Box>
      </CardContent>
    </Card>
  );
}
