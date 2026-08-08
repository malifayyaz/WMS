import React from 'react';
import { Box } from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import dayjs from 'dayjs';

function toDateValue(dateStr) {
  if (!dateStr) return null;
  const parsed = dayjs(dateStr);
  return parsed.isValid() ? parsed : null;
}

function toDateString(value) {
  if (!value || !value.isValid?.()) return '';
  return value.format('YYYY-MM-DD');
}

export default function DateRangePicker({ startDate, endDate, onStartChange, onEndChange }) {
  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box
        display="flex"
        gap={2}
        flexWrap="wrap"
        sx={{ width: { xs: '100%', sm: 'auto' }, '& .MuiFormControl-root': { width: { xs: '100%', sm: 'auto' }, minWidth: { sm: 160 } } }}
      >
        <DatePicker
          label="Start Date"
          value={toDateValue(startDate)}
          onChange={(d) => onStartChange(toDateString(d))}
          slotProps={{ textField: { size: 'small', fullWidth: true } }}
        />
        <DatePicker
          label="End Date"
          value={toDateValue(endDate)}
          onChange={(d) => onEndChange(toDateString(d))}
          slotProps={{ textField: { size: 'small', fullWidth: true } }}
        />
      </Box>
    </LocalizationProvider>
  );
}
