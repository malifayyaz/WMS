import React, { useRef } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Button,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Paper,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import PrintIcon from '@mui/icons-material/Print';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import { format, subDays, startOfWeek, endOfWeek } from 'date-fns';
import { formatDayDate } from '../../utils/formatters';

export default function DailyBookHeader({
  entryDate,
  setEntryDate,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
}) {
  const dateInputRef = useRef(null);

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const isDateRange = Boolean(startDate && endDate);

  // Determine active quick filter selection
  const getActiveFilter = () => {
    if (isDateRange) {
      const now = new Date();
      const weekStartStr = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      const weekEndStr = format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      if (startDate === weekStartStr && (endDate === weekEndStr || endDate === todayStr)) {
        return 'week';
      }
      return 'custom';
    }
    if (entryDate === todayStr) return 'today';
    const yesterdayStr = format(subDays(new Date(), 1), 'yyyy-MM-dd');
    if (entryDate === yesterdayStr) return 'yesterday';
    return 'custom';
  };

  const handlePrevDay = () => {
    let d;
    if (entryDate && /^\d{4}-\d{2}-\d{2}$/.test(entryDate)) {
      const [y, m, day] = entryDate.split('-').map(Number);
      d = new Date(y, m - 1, day);
    } else {
      d = new Date();
    }
    const prev = subDays(d, 1);
    setStartDate('');
    setEndDate('');
    setEntryDate(format(prev, 'yyyy-MM-dd'));
  };

  const handleNextDay = () => {
    let d;
    if (entryDate && /^\d{4}-\d{2}-\d{2}$/.test(entryDate)) {
      const [y, m, day] = entryDate.split('-').map(Number);
      d = new Date(y, m - 1, day);
    } else {
      d = new Date();
    }
    const next = subDays(d, -1);
    setStartDate('');
    setEndDate('');
    setEntryDate(format(next, 'yyyy-MM-dd'));
  };

  const handleFilterChange = (_, value) => {
    if (!value) return;
    const now = new Date();
    if (value === 'today') {
      setStartDate('');
      setEndDate('');
      setEntryDate(todayStr);
    } else if (value === 'yesterday') {
      setStartDate('');
      setEndDate('');
      setEntryDate(format(subDays(now, 1), 'yyyy-MM-dd'));
    } else if (value === 'week') {
      const s = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      const e = todayStr;
      setStartDate(s);
      setEndDate(e);
      setEntryDate(todayStr);
    } else if (value === 'custom') {
      if (dateInputRef.current) {
        if (typeof dateInputRef.current.showPicker === 'function') {
          dateInputRef.current.showPicker();
        } else {
          dateInputRef.current.focus();
        }
      }
    }
  };

  const handleCustomDateChange = (e) => {
    const val = e.target.value;
    if (val) {
      setStartDate('');
      setEndDate('');
      setEntryDate(val);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      <style>{`
        @media print {
          /* Hide non-essential layout chrome */
          nav, header, aside, .MuiDrawer-root, .no-print, [role="navigation"], .ai-assistant-drawer {
            display: none !important;
          }
          body {
            background: #ffffff !important;
            color: #000000 !important;
            font-size: 12pt !important;
          }
          main {
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
          }
          .MuiPaper-root {
            box-shadow: none !important;
            border: 1px solid #cccccc !important;
          }
          .print-header {
            display: block !important;
            margin-bottom: 20px;
            text-align: center;
          }
        }
        @media screen {
          .print-header {
            display: none;
          }
        }
      `}</style>

      {/* Hidden print header */}
      <Box className="print-header">
        <Typography variant="h5" fontWeight={700}>
          Wire Manufacturing Management System — Daily Book
        </Typography>
        <Typography variant="subtitle1">
          {isDateRange
            ? `Period: ${startDate} to ${endDate}`
            : `Date: ${formatDayDate(entryDate)}`}
        </Typography>
      </Box>

      {/* Main interactive header */}
      <Paper
        elevation={0}
        className="no-print"
        sx={{
          p: { xs: 1.5, sm: 2 },
          mb: 2,
          borderRadius: 2.5,
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          alignItems: { xs: 'stretch', md: 'center' },
          justifyContent: 'space-between',
          gap: 2,
        }}
      >
        {/* Left Side: Title & Date Navigation Arrows */}
        <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
          <Typography variant="h6" fontWeight={700} sx={{ mr: 1, letterSpacing: -0.2 }}>
            Daily Book
          </Typography>

          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              bgcolor: 'action.hover',
              borderRadius: 2,
              p: 0.25,
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Tooltip title="Previous Day">
              <IconButton size="small" onClick={handlePrevDay} sx={{ color: 'text.primary' }}>
                <ChevronLeftIcon fontSize="small" />
              </IconButton>
            </Tooltip>

            <Typography
              variant="subtitle2"
              fontWeight={700}
              sx={{
                px: 1.5,
                minWidth: { xs: 130, sm: 190 },
                textAlign: 'center',
                userSelect: 'none',
                color: 'text.primary',
              }}
            >
              {isDateRange
                ? `${startDate} → ${endDate}`
                : formatDayDate(entryDate)}
            </Typography>

            <Tooltip title="Next Day">
              <IconButton size="small" onClick={handleNextDay} sx={{ color: 'text.primary' }}>
                <ChevronRightIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </Stack>

        {/* Right Side: Quick Date Pills & Print Button */}
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <ToggleButtonGroup
            value={getActiveFilter()}
            exclusive
            onChange={handleFilterChange}
            size="small"
            sx={{
              '& .MuiToggleButton-root': {
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.8rem',
                px: 1.25,
                py: 0.5,
                borderRadius: 1.5,
                borderColor: 'divider',
                '&.Mui-selected': {
                  bgcolor: 'primary.main',
                  color: 'primary.contrastText',
                  '&:hover': {
                    bgcolor: 'primary.dark',
                  },
                },
              },
            }}
          >
            <ToggleButton value="today">Today</ToggleButton>
            <ToggleButton value="yesterday">Yesterday</ToggleButton>
            <ToggleButton value="week">This Week</ToggleButton>
            <ToggleButton value="custom">
              <Stack direction="row" spacing={0.5} alignItems="center">
                <CalendarMonthIcon sx={{ fontSize: 16 }} />
                <span>Custom</span>
              </Stack>
            </ToggleButton>
          </ToggleButtonGroup>

          {/* Hidden native date input triggered by Custom button */}
          <input
            ref={dateInputRef}
            type="date"
            value={entryDate || todayStr}
            onChange={handleCustomDateChange}
            style={{
              position: 'absolute',
              opacity: 0,
              width: 0,
              height: 0,
              pointerEvents: 'none',
            }}
          />

          <Button
            variant="outlined"
            size="small"
            startIcon={<PrintIcon />}
            onClick={handlePrint}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: 1.5,
              px: 1.5,
              borderColor: 'divider',
              color: 'text.primary',
              '&:hover': {
                borderColor: 'primary.main',
                bgcolor: 'action.hover',
              },
            }}
          >
            Print Day
          </Button>
        </Stack>
      </Paper>
    </>
  );
}
