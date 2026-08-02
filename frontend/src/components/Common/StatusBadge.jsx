import React from 'react';
import { Chip } from '@mui/material';

const statusColor = { Outer: 'primary', 'In Process': 'warning', Done: 'success' };

export default function StatusBadge({ status }) {
  return <Chip label={status || '—'} color={statusColor[status] || 'default'} size="small" />;
}
