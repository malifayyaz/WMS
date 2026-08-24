import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Grid,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  InputAdornment,
  Chip,
  Button,
  IconButton,
  Tooltip,
  Tabs,
  Tab,
  CircularProgress,
  Stack,
  useTheme,
  Alert,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import CallReceivedIcon from '@mui/icons-material/CallReceived';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import PrecisionManufacturingIcon from '@mui/icons-material/PrecisionManufacturing';
import SavingsIcon from '@mui/icons-material/Savings';
import PersonIcon from '@mui/icons-material/Person';
import { receivablesAPI, customersAPI } from '../services/api';
import { formatCurrency, formatDate } from '../utils/formatters';
import LedgerDialog from '../components/Common/LedgerDialog';
import ExportButtons from '../components/Common/ExportButtons';
import PageToolbar from '../components/Common/PageToolbar';

export default function Receivables() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    customers: [],
    processingCustomers: [],
    processingDeliveries: [],
    personalPayments: [],
    totals: {
      totalCustomerDue: 0,
      totalProcessingDue: 0,
      totalBusinessReceivables: 0,
      totalPersonalLumpSum: 0,
      totalPersonalContributed: 0,
      grandTotalReceivables: 0,
    },
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [currentTab, setCurrentTab] = useState(0);

  // Ledger dialog state
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [selectedParty, setSelectedParty] = useState(null);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await receivablesAPI.getSummary({ search: searchTerm });
      setData(res.data.data || {});
    } catch (err) {
      console.error('Failed to fetch receivables summary:', err);
    } finally {
      setLoading(false);
    }
  }, [searchTerm]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const handleOpenLedger = (party) => {
    setSelectedParty(party);
    setLedgerOpen(true);
  };

  const totals = data.totals || {};
  const customers = data.customers || [];
  const processingCustomers = data.processingCustomers || [];
  const processingDeliveries = data.processingDeliveries || [];
  const personalPayments = data.personalPayments || [];

  // Export definitions
  const customerExportColumns = [
    { id: 'Name', label: 'Customer Name' },
    { id: 'Type', label: 'Type' },
    { id: 'Contact', label: 'Contact Number' },
    { id: 'Due', label: 'Amount Due (Rs.)' },
    { id: 'Since', label: 'Last Activity' },
  ];

  const exportRows = customers.map((c) => ({
    Name: c.name || '',
    Type: c.customerType || 'Ledger',
    Contact: c.contactNumber || '—',
    Due: c.totalAmountDue || 0,
    Since: c.sinceDate ? formatDate(c.sinceDate) : '—',
  }));

  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 } }}>
      {/* Page Title and Actions */}
      <PageToolbar
        title="Receivables (Aamad / Dues)"
        actions={
          <Stack direction="row" spacing={1} alignItems="center">
            <ExportButtons data={exportRows} columns={customerExportColumns} fileName="Receivables_Summary" />
            <Button
              variant="outlined"
              size="small"
              startIcon={<RefreshIcon />}
              onClick={fetchSummary}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              Refresh
            </Button>
          </Stack>
        }
      />

      {/* Top 4 KPI Metrics Banner */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {/* Grand Total */}
        <Grid item xs={12} sm={6} md={3}>
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'primary.light',
              bgcolor: isDark ? 'rgba(59, 130, 246, 0.08)' : '#EFF6FF',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              height: '100%',
            }}
          >
            <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
              <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', color: 'primary.main', letterSpacing: 0.5 }}>
                Total Receivables
              </Typography>
              <CallReceivedIcon sx={{ color: 'primary.main', fontSize: 20 }} />
            </Stack>
            <Typography variant="h5" sx={{ fontWeight: 800, color: 'primary.dark', letterSpacing: '-0.02em', my: 0.5 }}>
              {formatCurrency(totals.grandTotalReceivables || 0)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              All money owed to business &amp; personal
            </Typography>
          </Paper>
        </Grid>

        {/* Customer Accounts */}
        <Grid item xs={12} sm={6} md={3}>
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              height: '100%',
            }}
          >
            <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
              <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', color: 'text.secondary', letterSpacing: 0.5 }}>
                Customer Accounts
              </Typography>
              <PersonIcon sx={{ color: 'success.main', fontSize: 20 }} />
            </Stack>
            <Typography variant="h5" sx={{ fontWeight: 800, color: 'success.main', letterSpacing: '-0.02em', my: 0.5 }}>
              {formatCurrency(totals.totalCustomerDue || 0)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {customers.length} customer account{customers.length !== 1 ? 's' : ''} with balance
            </Typography>
          </Paper>
        </Grid>

        {/* Processing Labour Due */}
        <Grid item xs={12} sm={6} md={3}>
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              height: '100%',
            }}
          >
            <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
              <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', color: 'text.secondary', letterSpacing: 0.5 }}>
                Processing Work
              </Typography>
              <PrecisionManufacturingIcon sx={{ color: 'warning.main', fontSize: 20 }} />
            </Stack>
            <Typography variant="h5" sx={{ fontWeight: 800, color: 'warning.dark', letterSpacing: '-0.02em', my: 0.5 }}>
              {formatCurrency(totals.totalProcessingDue || 0)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {processingCustomers.length} job work customer{processingCustomers.length !== 1 ? 's' : ''}
            </Typography>
          </Paper>
        </Grid>

        {/* Personal Committees / Savings */}
        <Grid item xs={12} sm={6} md={3}>
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              height: '100%',
            }}
          >
            <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
              <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', color: 'text.secondary', letterSpacing: 0.5 }}>
                Personal Receivables
              </Typography>
              <SavingsIcon sx={{ color: '#8B5CF6', fontSize: 20 }} />
            </Stack>
            <Typography variant="h5" sx={{ fontWeight: 800, color: '#6D28D9', letterSpacing: '-0.02em', my: 0.5 }}>
              {formatCurrency(totals.totalPersonalLumpSum || 0)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Contributed: {formatCurrency(totals.totalPersonalContributed || 0)}
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Filter and Tab Section */}
      <Paper elevation={0} sx={{ p: 2, mb: 3, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center" justifyContent="space-between">
          <Tabs
            value={currentTab}
            onChange={(_, val) => setCurrentTab(val)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              '& .MuiTab-root': {
                textTransform: 'none',
                fontWeight: 700,
                fontSize: '0.85rem',
                minHeight: 40,
              },
            }}
          >
            <Tab label={`All Dues (${customers.length + processingCustomers.length})`} />
            <Tab label={`Customer Accounts (${customers.length})`} />
            <Tab label={`Processing Work (${processingCustomers.length})`} />
            {personalPayments.length > 0 && <Tab label={`Personal (${personalPayments.length})`} />}
          </Tabs>

          <TextField
            size="small"
            placeholder="Search party by name or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                </InputAdornment>
              ),
            }}
            sx={{ width: { xs: '100%', sm: 280 } }}
          />
        </Stack>
      </Paper>

      {loading ? (
        <Box display="flex" justifyContent="center" py={8}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          {/* TAB 0: All Dues or TAB 1: Customer Accounts */}
          {(currentTab === 0 || currentTab === 1) && (
            <Paper elevation={0} sx={{ mb: 3, border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
              <Box sx={{ p: 2, bgcolor: isDark ? 'rgba(255,255,255,0.03)' : '#F8FAFC', borderBottom: '1px solid', borderColor: 'divider' }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography variant="subtitle1" fontWeight={700}>
                    Customer Account Balances
                  </Typography>
                  <Chip
                    label={`Total: ${formatCurrency(totals.totalCustomerDue || 0)}`}
                    color="success"
                    size="small"
                    sx={{ fontWeight: 700 }}
                  />
                </Stack>
              </Box>

              <TableContainer sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'action.hover' }}>
                      <TableCell sx={{ fontWeight: 700 }}>Customer Name</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Type</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Contact</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Total Purchased</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Total Paid</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: 'error.main' }}>Amount Due</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Last Activity</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {customers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                          No customer balance dues found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      customers.map((c) => (
                        <TableRow key={c._id} hover>
                          <TableCell sx={{ fontWeight: 700 }}>{c.name}</TableCell>
                          <TableCell>
                            <Chip size="small" label={c.customerType || 'Ledger'} variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
                          </TableCell>
                          <TableCell sx={{ color: 'text.secondary' }}>{c.contactNumber || '—'}</TableCell>
                          <TableCell align="right">{formatCurrency(c.totalAmountPurchased || 0)}</TableCell>
                          <TableCell align="right" sx={{ color: 'success.main' }}>{formatCurrency(c.totalAmountPaid || 0)}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 800, color: 'error.main' }}>
                            {formatCurrency(c.totalAmountDue || 0)}
                          </TableCell>
                          <TableCell sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
                            {c.sinceDate ? formatDate(c.sinceDate) : '—'}
                          </TableCell>
                          <TableCell align="right">
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={<MenuBookIcon sx={{ fontSize: 14 }} />}
                              onClick={() => handleOpenLedger(c)}
                              sx={{ textTransform: 'none', fontSize: '0.75rem', fontWeight: 600, py: 0.25 }}
                            >
                              View Ledger
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          )}

          {/* TAB 0: All Dues or TAB 2: Processing Work */}
          {(currentTab === 0 || currentTab === 2) && (
            <Paper elevation={0} sx={{ mb: 3, border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
              <Box sx={{ p: 2, bgcolor: isDark ? 'rgba(255,255,255,0.03)' : '#F8FAFC', borderBottom: '1px solid', borderColor: 'divider' }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography variant="subtitle1" fontWeight={700}>
                    Processing Work / Job Work Labour Dues
                  </Typography>
                  <Chip
                    label={`Labour Total: ${formatCurrency(totals.totalProcessingDue || 0)}`}
                    color="warning"
                    size="small"
                    sx={{ fontWeight: 700 }}
                  />
                </Stack>
              </Box>

              <TableContainer sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'action.hover' }}>
                      <TableCell sx={{ fontWeight: 700 }}>Processing Customer</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Contact</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Total Billed</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Total Paid</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: 'warning.dark' }}>Labour Due</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Last Activity</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {processingCustomers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                          No processing work dues found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      processingCustomers.map((c) => (
                        <TableRow key={c._id} hover>
                          <TableCell sx={{ fontWeight: 700 }}>{c.name}</TableCell>
                          <TableCell sx={{ color: 'text.secondary' }}>{c.contactNumber || '—'}</TableCell>
                          <TableCell align="right">{formatCurrency(c.totalAmountPurchased || 0)}</TableCell>
                          <TableCell align="right" sx={{ color: 'success.main' }}>{formatCurrency(c.totalAmountPaid || 0)}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 800, color: 'warning.dark' }}>
                            {formatCurrency(c.totalAmountDue || 0)}
                          </TableCell>
                          <TableCell sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
                            {c.sinceDate ? formatDate(c.sinceDate) : '—'}
                          </TableCell>
                          <TableCell align="right">
                            <Button
                              size="small"
                              variant="outlined"
                              color="warning"
                              startIcon={<MenuBookIcon sx={{ fontSize: 14 }} />}
                              onClick={() => handleOpenLedger(c)}
                              sx={{ textTransform: 'none', fontSize: '0.75rem', fontWeight: 600, py: 0.25 }}
                            >
                              View Ledger
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          )}

          {/* TAB 3: Personal Committees / Savings */}
          {(currentTab === 3 || (currentTab === 0 && personalPayments.length > 0)) && (
            <Paper elevation={0} sx={{ mb: 3, border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
              <Box sx={{ p: 2, bgcolor: isDark ? 'rgba(255,255,255,0.03)' : '#F8FAFC', borderBottom: '1px solid', borderColor: 'divider' }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography variant="subtitle1" fontWeight={700}>
                    Personal Committees &amp; Savings (Expected Lump Sum)
                  </Typography>
                  <Chip
                    label={`Expected: ${formatCurrency(totals.totalPersonalLumpSum || 0)}`}
                    color="secondary"
                    size="small"
                    sx={{ fontWeight: 700 }}
                  />
                </Stack>
              </Box>

              <TableContainer sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'action.hover' }}>
                      <TableCell sx={{ fontWeight: 700 }}>Category Name</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Type</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Contributed</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Remaining</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: 'primary.main' }}>Expected Lump Sum</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Expected Date</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {personalPayments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                          No active personal payment categories found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      personalPayments.map((p) => (
                        <TableRow key={p._id} hover>
                          <TableCell sx={{ fontWeight: 700 }}>{p.categoryName}</TableCell>
                          <TableCell>
                            <Chip size="small" label={p.categoryType || 'Committee'} variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
                          </TableCell>
                          <TableCell align="right" sx={{ color: 'success.main', fontWeight: 600 }}>{formatCurrency(p.totalContributed || 0)}</TableCell>
                          <TableCell align="right" sx={{ color: 'text.secondary' }}>{formatCurrency(p.remainingToContribute || 0)}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 800, color: 'primary.main' }}>
                            {formatCurrency(p.expectedLumpSum || 0)}
                          </TableCell>
                          <TableCell sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
                            {p.expectedReceiveDate ? formatDate(p.expectedReceiveDate) : '—'}
                          </TableCell>
                          <TableCell>
                            <Chip size="small" label={p.status || 'Active'} color="success" sx={{ height: 20, fontSize: '0.7rem' }} />
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          )}
        </>
      )}

      {/* Customer Ledger Dialog */}
      {selectedParty && (
        <LedgerDialog
          open={ledgerOpen}
          onClose={() => {
            setLedgerOpen(false);
            setSelectedParty(null);
          }}
          title={`Ledger — ${selectedParty.name}`}
          fetchLedger={(params) => customersAPI.getLedger(selectedParty._id, params)}
          partyType="Customer"
          linked={!!selectedParty.linkedSupplierId && selectedParty.customerType === 'Processing'}
          primaryRole={selectedParty.customerType === 'Processing' ? 'processing' : 'customer'}
        />
      )}
    </Box>
  );
}
