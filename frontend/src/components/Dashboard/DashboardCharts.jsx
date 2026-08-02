import React from 'react';
import { Grid, Card, CardContent, Typography, Table, TableBody, TableCell, TableRow, TableHead } from '@mui/material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { formatCurrency, formatDate } from '../../utils/formatters';

const COLORS = ['#5A8AAF', '#3D9A6A', '#D97706'];

export default function DashboardCharts({ charts }) {
  if (!charts) return null;
  const { monthlyRevenueVsExpenses, ordersByStatus, topCustomers, recentTransactions } = charts;

  const pieData = ordersByStatus
    ? Object.entries(ordersByStatus).map(([name, value]) => ({ name, value }))
    : [];

  return (
    <Grid container spacing={2}>
      <Grid item xs={12} md={8}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>Monthly Profit Breakdown (Last 6 Months)</Typography>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyRevenueVsExpenses || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis tickFormatter={(v) => `Rs.${v / 1000}k`} />
                <Tooltip formatter={(v) => formatCurrency(v)} />
                <Legend />
                <Bar dataKey="mainGross" fill="#5A8AAF" name="Main Gross" />
                <Bar dataKey="processingLabour" fill="#3D9A6A" name="Processing Labour" />
                <Bar dataKey="expenses" fill="#DC4C4C" name="Expenses" />
                <Bar dataKey="netProfit" fill="#D97706" name="Final Net" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </Grid>
      <Grid item xs={12} md={4}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>Orders by Status</Typography>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </Grid>
      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>Top 5 Customers by Revenue</Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Customer</TableCell>
                  <TableCell align="right">Purchased</TableCell>
                  <TableCell align="right">Due</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(topCustomers || []).map((c) => (
                  <TableRow key={c._id}>
                    <TableCell>{c.name}</TableCell>
                    <TableCell align="right">{formatCurrency(c.totalAmountPurchased)}</TableCell>
                    <TableCell align="right">{formatCurrency(c.totalAmountDue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </Grid>
      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>Recent Transactions</Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell align="right">Amount</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(recentTransactions || []).map((t) => (
                  <TableRow key={t._id}>
                    <TableCell>{formatDate(t.transactionDate)}</TableCell>
                    <TableCell>{t.transactionType}</TableCell>
                    <TableCell>{t.description || t.relatedName || '-'}</TableCell>
                    <TableCell align="right">{formatCurrency(t.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
}
