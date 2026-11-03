import { useTheme } from '@mui/material';
import type { AutopilotDecision } from '@api/autopilot.ts';
import { REASON_STYLES } from './autopilotFormat.ts';

// One decision marker; the shape encodes the reason so color is not the only cue
export default function ChartMarker({ decision, cx, cy }: { decision: AutopilotDecision; cx: number; cy: number }) {
  const { color, shape } = REASON_STYLES[decision.reason];
  const theme = useTheme();
  const ring = { stroke: theme.palette.background.paper, strokeWidth: 2, fill: color };
  if (shape === 'diamond') return <polygon points={ `${cx},${cy - 6} ${cx + 6},${cy} ${cx},${cy + 6} ${cx - 6},${cy}` } { ...ring }/>;
  if (shape === 'square') return <rect x={ cx - 5 } y={ cy - 5 } width={ 10 } height={ 10 } rx={ 2 } { ...ring }/>;
  if (shape === 'triangle') return <polygon points={ `${cx},${cy - 6} ${cx + 6},${cy + 5} ${cx - 6},${cy + 5}` } { ...ring }/>;
  return <circle cx={ cx } cy={ cy } r={ 4.5 } { ...ring }/>;
}
