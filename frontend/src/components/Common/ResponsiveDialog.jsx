import React from 'react';
import { Dialog } from '@mui/material';
import { useIsMobile } from '../../hooks/useBreakpoint';

/**
 * Dialog that goes fullScreen on phones so wide forms/tables remain usable.
 * Pass fullScreen explicitly to override (true/false).
 */
export default function ResponsiveDialog({ fullScreen, PaperProps, children, ...props }) {
  const isMobile = useIsMobile();
  const resolvedFullScreen = fullScreen ?? isMobile;

  return (
    <Dialog
      {...props}
      fullScreen={resolvedFullScreen}
      PaperProps={{
        ...PaperProps,
        sx: {
          borderRadius: resolvedFullScreen ? 0 : (PaperProps?.sx?.borderRadius ?? 1.5),
          m: resolvedFullScreen ? 0 : PaperProps?.sx?.m,
          maxHeight: resolvedFullScreen ? '100%' : PaperProps?.sx?.maxHeight,
          ...PaperProps?.sx,
        },
      }}
    >
      {children}
    </Dialog>
  );
}
