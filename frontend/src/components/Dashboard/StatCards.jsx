import React from 'react';
import { Grid, Card, CardContent, Typography, Box } from '@mui/material';
import { formatCurrency } from '../../utils/formatters';

const StatCard = ({ title, value, icon, color = 'primary.main', isCurrency = true }) => (
  <Card>
    <CardContent>
      <Typography color="text.secondary" variant="body2" gutterBottom>
        {title}
      </Typography>
      <Typography variant="h5" fontWeight={700} color={color}>
        {isCurrency && typeof value === 'number' ? formatCurrency(value) : value}
      </Typography>
      {icon && <Box sx={{ mt: 1, color }}>{icon}</Box>}
    </CardContent>
  </Card>
);

export default function StatCards({ stats }) {
  if (!stats) return null;
  return (
    <Grid container spacing={2}>
      <Grid item xs={12} sm={6} md={3}>
        <StatCard title="Main Gross Profit (Month)" value={stats.monthMainGrossProfit} color={stats.monthMainGrossProfit >= 0 ? 'success.main' : 'error.main'} />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <StatCard title="Processing Labour (Month)" value={stats.monthProcessingLabour} color="info.main" />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <StatCard title="Combined Gross (Month)" value={stats.monthCombinedGrossProfit} color={stats.monthCombinedGrossProfit >= 0 ? 'success.main' : 'error.main'} />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <StatCard title="Net Profit (Month)" value={stats.monthFinalNetProfit} color={stats.monthFinalNetProfit >= 0 ? 'success.main' : 'error.main'} />
      </Grid>

      <Grid item xs={12} sm={6} md={3}>
        <StatCard title="Cash Closing Today" value={stats.cashClosingToday} />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <StatCard title="Current Bank Balance" value={stats.bankBalance} />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <StatCard title="Sales Today" value={`${Number(stats.todaySalesKg || 0).toFixed(1)} kg / ${stats.todaySalesBundles || 0} bundles`} color="success.main" isCurrency={false} />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <StatCard title="Purchases Today" value={`${Number(stats.todayPurchasesKg || 0).toFixed(1)} kg / ${stats.todayPurchaseBundles || 0} bundles`} color="info.main" isCurrency={false} />
      </Grid>

      <Grid item xs={12} sm={6} md={3}>
        <StatCard title="Pending at Annealing" value={`${Number(stats.annealingPendingKg || 0).toFixed(1)} kg / ${stats.annealingPendingBundles || 0} bundles`} color="warning.main" isCurrency={false} />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <StatCard title="Processing WIP" value={`${Number(stats.processingRemainingKg || 0).toFixed(1)} kg`} color="info.main" isCurrency={false} />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <StatCard title="Pending from Customers" value={stats.pendingFromCustomers} color="warning.main" />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <StatCard title="Pending to Suppliers" value={stats.pendingToSuppliers} color="warning.main" />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <StatCard title="Manufacturing Orders In Process" value={stats.activeOrdersInProcess} isCurrency={false} />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <StatCard title="Low Stock (kg)" value={`${stats.lowStockTotalKg || 0} kg`} color="error.main" isCurrency={false} />
      </Grid>
    </Grid>
  );
}
