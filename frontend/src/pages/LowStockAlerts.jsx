import React, { useState, useEffect } from 'react';
import { Box, Card, CardContent, Typography, Table, TableBody, TableCell, TableRow, TableHead, Alert, CircularProgress } from '@mui/material';
import { rawMaterialsAPI } from '../services/api';

export default function LowStockAlerts() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    rawMaterialsAPI.getLowStock().then((res) => {
      setData(res.data.data || []);
    }).catch(() => setData([])).finally(() => setLoading(false));
  }, []);

  if (loading) return <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>;

  return (
    <Box>
      <Alert severity="warning" sx={{ mb: 2 }}>
        Coil stock below 1000 kg is shown here. Orders can still be placed — fulfil when stock arrives.
      </Alert>
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Low Coil Stock</Typography>
          {data.length === 0 ? (
            <Typography color="text.secondary">No low stock at the moment.</Typography>
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
    </Box>
  );
}
