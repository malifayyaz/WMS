import React from 'react';
import { DialogTitle, DialogContent, DialogContentText, DialogActions, Button } from '@mui/material';
import ResponsiveDialog from './ResponsiveDialog';
import { useIsMobile } from '../../hooks/useBreakpoint';

export default function ConfirmDialog({ open, title, message, onConfirm, onCancel, confirmText = 'Delete', confirmColor = 'error' }) {
  const isMobile = useIsMobile();
  return (
    <ResponsiveDialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{message}</DialogContentText>
      </DialogContent>
      <DialogActions sx={{ flexDirection: { xs: 'column-reverse', sm: 'row' }, gap: 1, px: 2, pb: 2 }}>
        <Button onClick={onCancel} fullWidth={isMobile}>Cancel</Button>
        <Button onClick={onConfirm} color={confirmColor} variant="contained" fullWidth={isMobile}>{confirmText}</Button>
      </DialogActions>
    </ResponsiveDialog>
  );
}
