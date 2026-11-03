import { Box, IconButton, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';

type StepperProps = {
  label: string;
  value: string;
  hint?: string;
  canDecrement: boolean;
  canIncrement: boolean;
  disabled: boolean;
  onChange: (direction: 1 | -1) => void;
};

export default function SettingStepper({ label, value, hint, canDecrement, canIncrement, disabled, onChange }: StepperProps) {
  return (
    <Box sx={ { display: 'flex', alignItems: 'center', gap: 1, minHeight: 44 } }>
      <Box sx={ { flexGrow: 1, minWidth: 0 } }>
        <Typography sx={ { fontSize: 13, fontWeight: 500 } }>{ label }</Typography>
        { hint && <Typography variant="caption" sx={ { color: 'text.secondary' } }>{ hint }</Typography> }
      </Box>
      <IconButton aria-label={ `Decrease ${label}` } size="small" disabled={ disabled || !canDecrement } onClick={ () => onChange(-1) }>
        <RemoveIcon fontSize="small"/>
      </IconButton>
      <Typography sx={ { fontSize: 14, fontWeight: 600, width: 72, textAlign: 'center' } }>{ value }</Typography>
      <IconButton aria-label={ `Increase ${label}` } size="small" disabled={ disabled || !canIncrement } onClick={ () => onChange(1) }>
        <AddIcon fontSize="small"/>
      </IconButton>
    </Box>
  );
}
