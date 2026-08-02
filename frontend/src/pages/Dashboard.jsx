import React, { useState, useEffect } from 'react';
import { Box, Typography, Snackbar, Alert, CircularProgress } from '@mui/material';
import StatCards from '../components/Dashboard/StatCards';
import DashboardCharts from '../components/Dashboard/DashboardCharts';
import { dashboardAPI } from '../services/api';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [charts, setCharts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'info' });

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

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
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
