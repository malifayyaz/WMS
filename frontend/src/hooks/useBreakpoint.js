import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';

/** True below the `sm` breakpoint (phones, < 600px). */
export function useIsMobile() {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.down('sm'));
}

/** True below the `md` breakpoint (phones + small tablets, < 900px). */
export function useIsCompact() {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.down('md'));
}
