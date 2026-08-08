import React from 'react';
import { Stack } from '@mui/material';

/**
 * Responsive page header row: stacks actions under search/filters on narrow screens.
 */
export default function PageToolbar({ children, sx, ...props }) {
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      spacing={1.5}
      useFlexGap
      flexWrap="wrap"
      alignItems={{ xs: 'stretch', sm: 'center' }}
      justifyContent="space-between"
      sx={{ mb: 2, width: '100%', ...sx }}
      {...props}
    >
      {children}
    </Stack>
  );
}
