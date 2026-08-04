import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Snackbar,
  Alert,
  CircularProgress,
  Card,
  CardContent,
  Skeleton,
  IconButton,
  Tooltip,
  TextField,
} from '@mui/material';
import AutoAwesome from '@mui/icons-material/AutoAwesome';
import Refresh from '@mui/icons-material/Refresh';
import StatCards from '../components/Dashboard/StatCards';
import DashboardCharts from '../components/Dashboard/DashboardCharts';
import { dashboardAPI, aiAPI } from '../services/api';

function localDateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDisplayDate(yyyyMmDd) {
  if (!yyyyMmDd) return '';
  const [y, m, d] = yyyyMmDd.split('-');
  return `${d}/${m}/${y}`;
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [charts, setCharts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'info' });
  const [aiSummary, setAiSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryDate, setSummaryDate] = useState(localDateKey());

  const todayKey = localDateKey();
  const isToday = summaryDate === todayKey;

  const fetchDailySummary = async (date = summaryDate) => {
    setSummaryLoading(true);
    try {
      const response = await aiAPI.getDailySummary(date);
      setAiSummary(response.data.data);
    } catch {
      setAiSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      setSummaryLoading(true);
      try {
        const response = await aiAPI.getDailySummary(summaryDate);
        if (mounted) setAiSummary(response.data.data);
      } catch {
        if (mounted) setAiSummary(null);
      } finally {
        if (mounted) setSummaryLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [summaryDate]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [sRes, cRes] = await Promise.all([dashboardAPI.getStats(), dashboardAPI.getCharts()]);
        if (mounted) {
          setStats(sRes.data.data);
          setCharts(cRes.data.data);
        }
      } catch (err) {
        if (mounted) setSnack({ open: true, message: err.response?.data?.message || 'Failed to load dashboard', severity: 'error' });
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const generatedAtLabel = (() => {
    if (!aiSummary?.generatedAt) return '';
    try {
      return new Date(aiSummary.generatedAt).toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  })();

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Card
        sx={{
          background: 'linear-gradient(135deg, #E8F5E9 0%, #C8E6C9 100%)',
          borderRadius: 3,
          border: '1px solid #A5D6A7',
          mb: 3,
        }}
      >
        <CardContent>
          <Box
            display="flex"
            justifyContent="space-between"
            alignItems="center"
            mb={1.5}
            flexWrap="wrap"
            gap={1}
          >
            <Box display="flex" alignItems="center" gap={1}>
              <AutoAwesome sx={{ color: '#2E7D32' }} />
              <Typography variant="h6" fontWeight={700}>
                {isToday ? "Today's Business Summary" : `Business Summary — ${formatDisplayDate(summaryDate)}`}
              </Typography>
            </Box>
            <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
              <TextField
                type="date"
                size="small"
                label="Date"
                value={summaryDate}
                onChange={(e) => setSummaryDate(e.target.value || todayKey)}
                inputProps={{ max: todayKey }}
                InputLabelProps={{ shrink: true }}
                sx={{ width: 160, bgcolor: 'rgba(255,255,255,0.55)', borderRadius: 1 }}
              />
              {generatedAtLabel && (
                <Typography variant="caption" color="text.secondary">
                  {generatedAtLabel}
                </Typography>
              )}
              <Tooltip title="Refresh">
                <IconButton
                  size="small"
                  onClick={() => fetchDailySummary(summaryDate)}
                  disabled={summaryLoading}
                >
                  <Refresh fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
          {summaryLoading ? (
            <>
              <Skeleton variant="text" width="100%" />
              <Skeleton variant="text" width="95%" />
              <Skeleton variant="text" width="80%" />
            </>
          ) : aiSummary?.summary ? (
            <Typography variant="body1">{aiSummary.summary}</Typography>
          ) : (
            <Typography color="text.secondary">
              Business summary unavailable for this date
            </Typography>
          )}
        </CardContent>
      </Card>

      {stats?.lowStockAlertsCount > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Low stock alert: {stats.lowStockAlertsCount} material(s) below 1000 kg. Check Raw Materials / Low Stock.
        </Alert>
      )}
      <Typography variant="h6" gutterBottom>Overview</Typography>
      <StatCards stats={stats} />
      <Typography variant="h6" sx={{ mt: 3 }} gutterBottom>Charts</Typography>
      <Box sx={{ mt: 2 }}>
        <DashboardCharts charts={charts} />
      </Box>
      <Snackbar open={snack.open} autoHideDuration={6000} onClose={() => setSnack((p) => ({ ...p, open: false }))}>
        <Alert severity={snack.severity}>{snack.message}</Alert>
      </Snackbar>
    </Box>
  );
}
