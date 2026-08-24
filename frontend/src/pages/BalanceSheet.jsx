import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Grid,
  Paper,
  Button,
  IconButton,
  Chip,
  Divider,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  CircularProgress,
  useTheme,
  Collapse,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Tooltip,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import RefreshIcon from '@mui/icons-material/Refresh';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import PrintIcon from '@mui/icons-material/Print';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import CallReceivedIcon from '@mui/icons-material/CallReceived';
import CallMadeIcon from '@mui/icons-material/CallMade';
import InventoryIcon from '@mui/icons-material/Inventory';
import SavingsIcon from '@mui/icons-material/Savings';
import { balanceSheetAPI } from '../services/api';
import { formatCurrency, formatDate } from '../utils/formatters';
import PageToolbar from '../components/Common/PageToolbar';

export default function BalanceSheet() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [dateMode, setDateMode] = useState('current'); // 'current', 'asOf', 'range'
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10));
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));

  // Bank breakdown collapse state
  const [bankExpanded, setBankExpanded] = useState(false);

  const fetchBalanceSheet = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (dateMode === 'asOf') {
        params.date = asOfDate;
      } else if (dateMode === 'range') {
        params.startDate = startDate;
        params.endDate = endDate;
      }
      const res = await balanceSheetAPI.get(params);
      setData(res.data.data || null);
    } catch (err) {
      console.error('Failed to fetch balance sheet:', err);
    } finally {
      setLoading(false);
    }
  }, [dateMode, asOfDate, startDate, endDate]);

  useEffect(() => {
    fetchBalanceSheet();
  }, [fetchBalanceSheet]);

  const handlePrint = () => {
    window.print();
  };

  const assets = data?.assets || {};
  const liabilities = data?.liabilities || {};
  const equity = data?.equity || {};

  const netWorth = equity.netWorth || 0;
  const isPositiveWorth = netWorth >= 0;

  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 }, '@media print': { p: 0 } }}>
      {/* Top Page Toolbar */}
      <Box sx={{ '@media print': { display: 'none' } }}>
        <PageToolbar
          title="Balance Sheet &amp; Financial Position"
          actions={
            <Stack direction="row" spacing={1} alignItems="center">
              <Button
                variant="outlined"
                size="small"
                startIcon={<PrintIcon />}
                onClick={handlePrint}
                sx={{ textTransform: 'none', fontWeight: 600 }}
              >
                Print / PDF
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<RefreshIcon />}
                onClick={fetchBalanceSheet}
                sx={{ textTransform: 'none', fontWeight: 600 }}
              >
                Refresh
              </Button>
            </Stack>
          }
        />

        {/* Date Filter Controls */}
        <Paper elevation={0} sx={{ p: 2, mb: 3, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center" justifyContent="space-between">
            <ToggleButtonGroup
              value={dateMode}
              exclusive
              onChange={(_, val) => val && setDateMode(val)}
              size="small"
              sx={{
                '& .MuiToggleButton-root': {
                  textTransform: 'none',
                  fontWeight: 600,
                  px: 2,
                },
              }}
            >
              <ToggleButton value="current">Current / Live Position</ToggleButton>
              <ToggleButton value="asOf">As of Date</ToggleButton>
              <ToggleButton value="range">Date Range</ToggleButton>
            </ToggleButtonGroup>

            {dateMode === 'asOf' && (
              <Stack direction="row" spacing={1.5} alignItems="center">
                <TextField
                  type="date"
                  size="small"
                  label="As of Date"
                  value={asOfDate}
                  onChange={(e) => setAsOfDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
                <Button variant="contained" size="small" onClick={fetchBalanceSheet} sx={{ textTransform: 'none' }}>
                  Generate
                </Button>
              </Stack>
            )}

            {dateMode === 'range' && (
              <Stack direction="row" spacing={1.5} alignItems="center">
                <TextField
                  type="date"
                  size="small"
                  label="From"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  type="date"
                  size="small"
                  label="To"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
                <Button variant="contained" size="small" onClick={fetchBalanceSheet} sx={{ textTransform: 'none' }}>
                  Generate
                </Button>
              </Stack>
            )}
          </Stack>
        </Paper>
      </Box>

      {loading ? (
        <Box display="flex" justifyContent="center" py={10}>
          <CircularProgress />
        </Box>
      ) : !data ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">No balance sheet data available.</Typography>
        </Paper>
      ) : (
        <>
          {/* Top 3 Prominent KPI Summary Cards */}
          <Grid container spacing={2.5} sx={{ mb: 3 }}>
            {/* Total Assets Card */}
            <Grid item xs={12} md={4}>
              <Paper
                elevation={0}
                sx={{
                  p: 3,
                  borderRadius: 2.5,
                  border: '1px solid',
                  borderColor: isDark ? 'rgba(59, 130, 246, 0.3)' : '#BFDBFE',
                  bgcolor: isDark ? 'rgba(59, 130, 246, 0.08)' : '#EFF6FF',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  height: '100%',
                }}
              >
                <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
                  <Typography variant="overline" sx={{ fontWeight: 800, color: 'primary.main', letterSpacing: 0.8 }}>
                    Total Assets
                  </Typography>
                  <AccountBalanceIcon sx={{ color: 'primary.main', fontSize: 24 }} />
                </Stack>
                <Typography variant="h4" sx={{ fontWeight: 900, color: 'primary.dark', letterSpacing: '-0.02em', my: 0.5 }}>
                  {formatCurrency(assets.totalAssets || 0)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Cash + Banks + Receivables + Stock Inventory
                </Typography>
              </Paper>
            </Grid>

            {/* Total Liabilities Card */}
            <Grid item xs={12} md={4}>
              <Paper
                elevation={0}
                sx={{
                  p: 3,
                  borderRadius: 2.5,
                  border: '1px solid',
                  borderColor: isDark ? 'rgba(239, 68, 68, 0.3)' : '#FECACA',
                  bgcolor: isDark ? 'rgba(239, 68, 68, 0.08)' : '#FEF2F2',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  height: '100%',
                }}
              >
                <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
                  <Typography variant="overline" sx={{ fontWeight: 800, color: 'error.main', letterSpacing: 0.8 }}>
                    Total Liabilities
                  </Typography>
                  <CallMadeIcon sx={{ color: 'error.main', fontSize: 24 }} />
                </Stack>
                <Typography variant="h4" sx={{ fontWeight: 900, color: 'error.dark', letterSpacing: '-0.02em', my: 0.5 }}>
                  {formatCurrency(liabilities.totalLiabilities || 0)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Supplier Payables + Personal Loans
                </Typography>
              </Paper>
            </Grid>

            {/* Net Worth Card */}
            <Grid item xs={12} md={4}>
              <Paper
                elevation={0}
                sx={{
                  p: 3,
                  borderRadius: 2.5,
                  border: '2px solid',
                  borderColor: isPositiveWorth
                    ? isDark ? '#059669' : '#10B981'
                    : isDark ? '#DC2626' : '#EF4444',
                  bgcolor: isPositiveWorth
                    ? isDark ? 'rgba(16, 185, 129, 0.12)' : '#ECFDF5'
                    : isDark ? 'rgba(239, 68, 68, 0.12)' : '#FEF2F2',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  height: '100%',
                }}
              >
                <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
                  <Typography
                    variant="overline"
                    sx={{ fontWeight: 800, color: isPositiveWorth ? 'success.dark' : 'error.dark', letterSpacing: 0.8 }}
                  >
                    Net Worth (Assets − Liabilities)
                  </Typography>
                  {isPositiveWorth ? (
                    <CheckCircleIcon sx={{ color: 'success.main', fontSize: 24 }} />
                  ) : (
                    <WarningIcon sx={{ color: 'error.main', fontSize: 24 }} />
                  )}
                </Stack>
                <Typography
                  variant="h4"
                  sx={{
                    fontWeight: 900,
                    color: isPositiveWorth ? 'success.dark' : 'error.dark',
                    letterSpacing: '-0.02em',
                    my: 0.5,
                  }}
                >
                  {formatCurrency(netWorth)}
                </Typography>
                <Typography variant="caption" color="text.secondary" fontWeight={600}>
                  {isPositiveWorth ? 'Positive Financial Position' : 'Deficit Position'}
                </Typography>
              </Paper>
            </Grid>
          </Grid>

          {/* Traditional 2-Column Balance Sheet (Assets Left, Liabilities Right) */}
          <Grid container spacing={3} sx={{ mb: 3 }}>
            {/* ══════════ LEFT COLUMN: ASSETS ══════════ */}
            <Grid item xs={12} md={6}>
              <Paper
                elevation={0}
                sx={{
                  p: 2.5,
                  borderRadius: 2.5,
                  border: '1px solid',
                  borderColor: 'divider',
                  borderLeft: '5px solid #10B981',
                  bgcolor: 'background.paper',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <Box>
                  <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
                    <Typography variant="h6" fontWeight={800} color="text.primary" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <AccountBalanceIcon sx={{ color: 'success.main' }} />
                      ASSETS (Aamad / Assets)
                    </Typography>
                    <Chip label="Assets" color="success" size="small" sx={{ fontWeight: 700 }} />
                  </Box>

                  {/* 1. Liquid Assets */}
                  <Box sx={{ mb: 2.5 }}>
                    <Typography variant="subtitle2" fontWeight={800} color="primary.main" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, mb: 1 }}>
                      1. Liquid Assets
                    </Typography>
                    <TableContainer>
                      <Table size="small">
                        <TableBody>
                          <TableRow hover>
                            <TableCell sx={{ py: 1, border: 0 }}>Cash in Hand (Physical Till / Safe)</TableCell>
                            <TableCell align="right" sx={{ py: 1, border: 0, fontWeight: 700 }}>
                              {formatCurrency(assets.cashInHand || 0)}
                            </TableCell>
                          </TableRow>

                          <TableRow hover>
                            <TableCell sx={{ py: 1, border: 0 }}>
                              <Box display="flex" alignItems="center" gap={0.5}>
                                <span>Bank Balances (All Accounts)</span>
                                <IconButton size="small" onClick={() => setBankExpanded(!bankExpanded)} sx={{ p: 0.25 }}>
                                  {bankExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                                </IconButton>
                              </Box>
                            </TableCell>
                            <TableCell align="right" sx={{ py: 1, border: 0, fontWeight: 700 }}>
                              {formatCurrency(assets.bankBalance || 0)}
                            </TableCell>
                          </TableRow>

                          {/* Bank Accounts Collapse Breakdown */}
                          <TableRow>
                            <TableCell colSpan={2} sx={{ p: 0, border: 0 }}>
                              <Collapse in={bankExpanded} timeout="auto" unmountOnExit>
                                <Box sx={{ p: 1.5, my: 0.5, bgcolor: isDark ? 'rgba(255,255,255,0.03)' : '#F8FAFC', borderRadius: 1.5 }}>
                                  {(assets.bankAccounts || []).map((acct) => (
                                    <Box key={acct.accountKey || acct.accountLabel} display="flex" justifyContent="space-between" py={0.5}>
                                      <Typography variant="caption" color="text.secondary">
                                        {acct.accountLabel || acct.bankAccount}
                                      </Typography>
                                      <Typography variant="caption" fontWeight={700}>
                                        {formatCurrency(acct.balance || 0)}
                                      </Typography>
                                    </Box>
                                  ))}
                                </Box>
                              </Collapse>
                            </TableCell>
                          </TableRow>

                          {/* Liquid Subtotal */}
                          <TableRow sx={{ bgcolor: isDark ? 'rgba(59, 130, 246, 0.08)' : '#EFF6FF' }}>
                            <TableCell sx={{ py: 1, fontWeight: 700, color: 'primary.dark' }}>
                              Subtotal — Liquid Assets
                            </TableCell>
                            <TableCell align="right" sx={{ py: 1, fontWeight: 800, color: 'primary.dark' }}>
                              {formatCurrency(assets.totalLiquidAssets || 0)}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Box>

                  <Divider sx={{ my: 2 }} />

                  {/* 2. Receivables */}
                  <Box sx={{ mb: 2.5 }}>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                      <Typography variant="subtitle2" fontWeight={800} color="primary.main" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        2. Receivables (Dues to Receive)
                      </Typography>
                      <Button
                        size="small"
                        endIcon={<ArrowForwardIcon sx={{ fontSize: 12 }} />}
                        onClick={() => navigate('/receivables')}
                        sx={{ textTransform: 'none', fontSize: '0.7rem', p: 0 }}
                      >
                        View All
                      </Button>
                    </Box>

                    <TableContainer>
                      <Table size="small">
                        <TableBody>
                          <TableRow hover>
                            <TableCell sx={{ py: 1, border: 0 }}>
                              From Customer Accounts ({assets.customerCount || 0} customers)
                            </TableCell>
                            <TableCell align="right" sx={{ py: 1, border: 0, fontWeight: 700 }}>
                              {formatCurrency(assets.customerReceivables || 0)}
                            </TableCell>
                          </TableRow>

                          <TableRow hover>
                            <TableCell sx={{ py: 1, border: 0 }}>
                              Processing Work Labour Dues ({assets.processingCount || 0} customers)
                            </TableCell>
                            <TableCell align="right" sx={{ py: 1, border: 0, fontWeight: 700 }}>
                              {formatCurrency(assets.processingReceivables || 0)}
                            </TableCell>
                          </TableRow>

                          <TableRow hover>
                            <TableCell sx={{ py: 1, border: 0 }}>
                              Personal (Committees &amp; Savings Expected)
                            </TableCell>
                            <TableCell align="right" sx={{ py: 1, border: 0, fontWeight: 700 }}>
                              {formatCurrency(assets.personalReceivables || 0)}
                            </TableCell>
                          </TableRow>

                          {/* Receivables Subtotal */}
                          <TableRow sx={{ bgcolor: isDark ? 'rgba(59, 130, 246, 0.08)' : '#EFF6FF' }}>
                            <TableCell sx={{ py: 1, fontWeight: 700, color: 'primary.dark' }}>
                              Subtotal — Receivables
                            </TableCell>
                            <TableCell align="right" sx={{ py: 1, fontWeight: 800, color: 'primary.dark' }}>
                              {formatCurrency(assets.totalReceivables || 0)}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Box>

                  <Divider sx={{ my: 2 }} />

                  {/* 3. Stock & Inventory */}
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="subtitle2" fontWeight={800} color="primary.main" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, mb: 1 }}>
                      3. Stock &amp; Inventory Value
                    </Typography>

                    <TableContainer>
                      <Table size="small">
                        <TableBody>
                          <TableRow hover>
                            <TableCell sx={{ py: 1, border: 0 }}>
                              Raw Material Stock Value ({assets.rawMaterialWeightKg || 0} kg coil)
                            </TableCell>
                            <TableCell align="right" sx={{ py: 1, border: 0, fontWeight: 700 }}>
                              {formatCurrency(assets.rawMaterialValue || 0)}
                            </TableCell>
                          </TableRow>

                          <TableRow hover>
                            <TableCell sx={{ py: 1, border: 0 }}>
                              Ready Stock (Finished Wire Value) ({assets.totalReadyStockKg || 0} kg)
                            </TableCell>
                            <TableCell align="right" sx={{ py: 1, border: 0, fontWeight: 700 }}>
                              {formatCurrency(assets.readyStockValue || 0)}
                            </TableCell>
                          </TableRow>

                          {/* Inventory Subtotal */}
                          <TableRow sx={{ bgcolor: isDark ? 'rgba(59, 130, 246, 0.08)' : '#EFF6FF' }}>
                            <TableCell sx={{ py: 1, fontWeight: 700, color: 'primary.dark' }}>
                              Subtotal — Inventory
                            </TableCell>
                            <TableCell align="right" sx={{ py: 1, fontWeight: 800, color: 'primary.dark' }}>
                              {formatCurrency(assets.totalInventoryValue || 0)}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Box>
                </Box>

                {/* TOTAL ASSETS FOOTER */}
                <Box
                  sx={{
                    p: 2,
                    mt: 3,
                    borderRadius: 2,
                    bgcolor: isDark ? '#064E3B' : '#DCFCE7',
                    border: '1px solid',
                    borderColor: '#10B981',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Typography variant="subtitle1" fontWeight={900} color={isDark ? '#A7F3D0' : '#065F46'}>
                    TOTAL ASSETS
                  </Typography>
                  <Typography variant="h5" fontWeight={900} color={isDark ? '#A7F3D0' : '#065F46'}>
                    {formatCurrency(assets.totalAssets || 0)}
                  </Typography>
                </Box>
              </Paper>
            </Grid>

            {/* ══════════ RIGHT COLUMN: LIABILITIES ══════════ */}
            <Grid item xs={12} md={6}>
              <Paper
                elevation={0}
                sx={{
                  p: 2.5,
                  borderRadius: 2.5,
                  border: '1px solid',
                  borderColor: 'divider',
                  borderLeft: '5px solid #EF4444',
                  bgcolor: 'background.paper',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <Box>
                  <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
                    <Typography variant="h6" fontWeight={800} color="text.primary" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CallMadeIcon sx={{ color: 'error.main' }} />
                      LIABILITIES (Kharch / Payables)
                    </Typography>
                    <Chip label="Liabilities" color="error" size="small" sx={{ fontWeight: 700 }} />
                  </Box>

                  {/* 1. Supplier & Trade Payables */}
                  <Box sx={{ mb: 2.5 }}>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                      <Typography variant="subtitle2" fontWeight={800} color="error.main" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        1. Supplier &amp; Trade Payables
                      </Typography>
                      <Button
                        size="small"
                        endIcon={<ArrowForwardIcon sx={{ fontSize: 12 }} />}
                        onClick={() => navigate('/payables')}
                        sx={{ textTransform: 'none', fontSize: '0.7rem', p: 0 }}
                      >
                        View All
                      </Button>
                    </Box>

                    <TableContainer>
                      <Table size="small">
                        <TableBody>
                          <TableRow hover>
                            <TableCell sx={{ py: 1, border: 0 }}>
                              To Supplier Accounts ({liabilities.supplierCount || 0} suppliers)
                            </TableCell>
                            <TableCell align="right" sx={{ py: 1, border: 0, fontWeight: 700, color: 'error.main' }}>
                              {formatCurrency(liabilities.supplierPayables || 0)}
                            </TableCell>
                          </TableRow>

                          <TableRow hover>
                            <TableCell sx={{ py: 1, border: 0 }}>
                              Raw Material Purchase Dues (Lot details)
                            </TableCell>
                            <TableCell align="right" sx={{ py: 1, border: 0, fontWeight: 700 }}>
                              {formatCurrency(liabilities.rawMaterialDues || 0)}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Box>

                  <Divider sx={{ my: 2 }} />

                  {/* 2. Personal Loans Taken & Liabilities */}
                  <Box sx={{ mb: 2.5 }}>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                      <Typography variant="subtitle2" fontWeight={800} color="error.main" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        2. Personal Loans &amp; Liabilities
                      </Typography>
                      <Button
                        size="small"
                        endIcon={<ArrowForwardIcon sx={{ fontSize: 12 }} />}
                        onClick={() => navigate('/personal-payments')}
                        sx={{ textTransform: 'none', fontSize: '0.7rem', p: 0 }}
                      >
                        View All
                      </Button>
                    </Box>

                    <TableContainer>
                      <Table size="small">
                        <TableBody>
                          <TableRow hover>
                            <TableCell sx={{ py: 1, border: 0 }}>
                              Personal Loans Taken (To Repay)
                            </TableCell>
                            <TableCell align="right" sx={{ py: 1, border: 0, fontWeight: 700, color: 'error.main' }}>
                              {formatCurrency(liabilities.personalPayables || 0)}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Box>
                </Box>

                {/* TOTAL LIABILITIES FOOTER */}
                <Box
                  sx={{
                    p: 2,
                    mt: 3,
                    borderRadius: 2,
                    bgcolor: isDark ? '#7F1D1D' : '#FEE2E2',
                    border: '1px solid',
                    borderColor: '#EF4444',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Typography variant="subtitle1" fontWeight={900} color={isDark ? '#FECACA' : '#991B1B'}>
                    TOTAL LIABILITIES
                  </Typography>
                  <Typography variant="h5" fontWeight={900} color={isDark ? '#FECACA' : '#991B1B'}>
                    {formatCurrency(liabilities.totalLiabilities || 0)}
                  </Typography>
                </Box>
              </Paper>
            </Grid>
          </Grid>

          {/* ══════════ FULL WIDTH: NET POSITION / EQUITY ══════════ */}
          <Paper
            elevation={0}
            sx={{
              p: 3,
              borderRadius: 2.5,
              border: '1px solid',
              borderColor: 'divider',
              borderLeft: '5px solid #6366F1',
              bgcolor: 'background.paper',
            }}
          >
            <Typography variant="h6" fontWeight={800} color="text.primary" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              <SavingsIcon sx={{ color: '#6366F1' }} />
              NET POSITION &amp; EQUITY
            </Typography>

            <Grid container spacing={3}>
              <Grid item xs={12} md={4}>
                <Box sx={{ p: 2, bgcolor: isDark ? 'rgba(255,255,255,0.02)' : '#F8FAFC', borderRadius: 2 }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={700} display="block">
                    Cumulative Business Net Profit
                  </Typography>
                  <Typography variant="h6" fontWeight={800} color={equity.cumulativeProfit >= 0 ? 'success.main' : 'error.main'}>
                    {formatCurrency(equity.cumulativeProfit || 0)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Total factory earnings to date
                  </Typography>
                </Box>
              </Grid>

              <Grid item xs={12} md={4}>
                <Box sx={{ p: 2, bgcolor: isDark ? 'rgba(255,255,255,0.02)' : '#F8FAFC', borderRadius: 2 }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={700} display="block">
                    Total Self Expenses (Withdrawn)
                  </Typography>
                  <Typography variant="h6" fontWeight={800} color="warning.main">
                    {formatCurrency(equity.totalSelfExpenses || 0)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Faisal + Fayyaz + Mutual withdrawals
                  </Typography>
                </Box>
              </Grid>

              <Grid item xs={12} md={4}>
                <Box
                  sx={{
                    p: 2,
                    bgcolor: isPositiveWorth
                      ? isDark ? 'rgba(16, 185, 129, 0.15)' : '#DCFCE7'
                      : isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEE2E2',
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: isPositiveWorth ? '#10B981' : '#EF4444',
                  }}
                >
                  <Typography variant="caption" color="text.secondary" fontWeight={700} display="block">
                    Current Net Standing (Net Worth)
                  </Typography>
                  <Typography variant="h5" fontWeight={900} color={isPositiveWorth ? 'success.dark' : 'error.dark'}>
                    {formatCurrency(netWorth)}
                  </Typography>
                  <Typography variant="caption" fontWeight={600} color={isPositiveWorth ? 'success.dark' : 'error.dark'}>
                    {isPositiveWorth
                      ? `Standing strong at +${formatCurrency(netWorth)}`
                      : `Deficit of ${formatCurrency(Math.abs(netWorth))}`}
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          </Paper>
        </>
      )}
    </Box>
  );
}
