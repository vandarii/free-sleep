import { Box, Typography } from '@mui/material';
import type { AutopilotDecision } from '@api/autopilot.ts';
import { formatClock, formatTemp, REASON_STYLES, STAGE_LABELS } from './autopilotFormat.ts';

type DecisionRowProps = {
  decision: AutopilotDecision;
  previous?: AutopilotDecision;
  // Last temperature of a collapsed run of decisions (the wake ramp)
  finalF?: number;
  isCelsius: boolean;
};

export default function DecisionRow({ decision, previous, finalF, isCelsius }: DecisionRowProps) {
  const shownF = finalF ?? decision.setF;
  const delta = previous ? shownF - previous.setF : 0;
  const style = REASON_STYLES[decision.reason];
  const usesStageLabel = decision.reason === 'stage' || decision.reason === 'schedule';
  const label = decision.detail ?? (usesStageLabel ? STAGE_LABELS[decision.stage] : style.label);
  const deltaColor = delta < 0 ? 'info.main' : delta > 0 ? 'warning.main' : 'text.primary';
  return (
    <Box sx={ { display: 'flex', alignItems: 'center', gap: 1.25, py: 1, borderBottom: '1px solid', borderColor: 'divider' } }>
      <Box component="span" sx={ { width: 8, height: 8, borderRadius: '50%', bgcolor: style.color, flexShrink: 0 } }/>
      <Typography variant="caption" sx={ { color: 'text.secondary', width: 40, flexShrink: 0 } }>{ formatClock(decision.timestamp) }</Typography>
      <Typography variant="body2" sx={ { flexGrow: 1, minWidth: 0 } }>{ label }</Typography>
      <Typography variant="body2" sx={ { fontWeight: 600, color: deltaColor } }>
        { finalF !== undefined ? `${formatTemp(decision.setF, isCelsius)} → ` : '' }{ formatTemp(shownF, isCelsius) }
      </Typography>
    </Box>
  );
}
