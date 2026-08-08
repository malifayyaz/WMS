import React, { useState, useEffect } from 'react';
import {
  Box, Card, CardContent, Typography, Table, TableBody, TableCell, TableRow, TableHead,
  Alert, CircularProgress, Snackbar,
} from '@mui/material';
import { rawMaterialsAPI } from '../services/api';

export default function LowStockAlerts() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [snackOpen, setSnackOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    rawMaterialsAPI.getLowStock()
      .then((res) => {
        if (!mounted) return;
        setData(res.data.data || []);
        setError('');
      })
      .catch((err) => {
        if (!mounted) return;
        setData([]);
        setError(err.response?.data?.message || 'Failed to load low stock alerts');
        setSnackOpen(true);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={280} p={4}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Alert severity="warning" sx={{ mb: 2 }}>
        Coil stock below 1000 kg is shown here. Orders can still be placed — fulfil when stock arrives.
      </Alert>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
      )}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Low Coil Stock</Typography>
          {data.length === 0 && !error ? (
            <Typography color="text.secondary">No low stock at the moment.</Typography>
          ) : data.length === 0 && error ? (
            <Typography color="text.secondary">Could not load stock alerts.</Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Coil Category</TableCell>
                  <TableCell>Wires Served</TableCell>
                  <TableCell align="right">Current Stock (kg)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.map((row) => (
                  <TableRow key={row.coilCategory}>
                    <TableCell>{row.coilCategory}</TableCell>
                    <TableCell>{row.wiresServed}</TableCell>
                    <TableCell align="right">{row.totalStock}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Snackbar open={snackOpen} autoHideDuration={6000} onClose={() => setSnackOpen(false)}>
        <Alert severity="error" onClose={() => setSnackOpen(false)}>{error}</Alert>
      </Snackbar>
    </Box>
  );
}
