import React from 'react';
import { Snackbar, Alert } from '@mui/material';

export default function AccessDeniedSnackbar({
  open,
  onClose,
  message = 'Access Denied: This action is restricted to admins only.',
}) {
  return (
    <Snackbar
      open={open}
      autoHideDuration={4000}
      onClose={onClose}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
    >
      <Alert severity="warning" variant="filled" onClose={onClose}>
        {message}
      </Alert>
    </Snackbar>
  );
}
