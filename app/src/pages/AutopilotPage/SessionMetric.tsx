import { Box, Typography } from '@mui/material';

export default function SessionMetric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Box sx={ { border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5, minWidth: 0 } }>
      <Typography variant="caption" sx={ { color: 'text.secondary' } }>{ label }</Typography>
      <Typography sx={ { fontSize: 18, fontWeight: 600 } }>{ value }</Typography>
      { sub && <Typography variant="caption" sx={ { color: 'text.secondary' } }>{ sub }</Typography> }
    </Box>
  );
}
