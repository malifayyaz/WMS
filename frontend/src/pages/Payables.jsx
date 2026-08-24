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
  Tabs,
  Tab,
  CircularProgress,
  Stack,
  useTheme,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import CallMadeIcon from '@mui/icons-material/CallMade';
import FactoryIcon from '@mui/icons-material/Factory';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import BusinessIcon from '@mui/icons-material/Business';
import { payablesAPI, suppliersAPI } from '../services/api';
import { formatCurrency, formatDate } from '../utils/formatters';
import LedgerDialog from '../components/Common/LedgerDialog';
import ExportButtons from '../components/Common/ExportButtons';
import PageToolbar from '../components/Common/PageToolbar';

export default function Payables() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    suppliers: [],
    rawMaterials: [],
    rawMaterialsBySupplier: [],
    totals: {
      totalSupplierDue: 0,
      totalRawMaterialDue: 0,
      grandTotalPayables: 0,
    },
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [currentTab, setCurrentTab] = useState(0);

  // Ledger dialog state
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState(null);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await payablesAPI.getSummary({ search: searchTerm });
      setData(res.data.data || {});
    } catch (err) {
      console.error('Failed to fetch payables summary:', err);
    } finally {
      setLoading(false);
    }
  }, [searchTerm]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const handleOpenLedger = (supplier) => {
    setSelectedSupplier(supplier);
    setLedgerOpen(true);
  };

  const totals = data.totals || {};
  const suppliers = data.suppliers || [];
  const rawMaterials = data.rawMaterials || [];
  const rawMaterialsBySupplier = data.rawMaterialsBySupplier || [];

  // Export definitions
  const supplierExportColumns = [
    { id: 'Name', label: 'Supplier Name' },
    { id: 'Company', label: 'Company' },
    { id: 'Contact', label: 'Contact Number' },
    { id: 'Due', label: 'Amount Due (Rs.)' },
    { id: 'Since', label: 'Last Activity' },
  ];

  const exportRows = suppliers.map((s) => ({
    Name: s.name || '',
    Company: s.companyName || '—',
    Contact: s.contactNumber || '—',
    Due: s.totalAmountDue || 0,
    Since: s.sinceDate ? formatDate(s.sinceDate) : '—',
  }));

  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 } }}>
      {/* Page Title and Actions */}
      <PageToolbar
        title="Payables (Kharch / Dues)"
        actions={
          <Stack direction="row" spacing={1} alignItems="center">
            <ExportButtons data={exportRows} columns={supplierExportColumns} fileName="Payables_Summary" />
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

      {/* Top 3 KPI Metrics Banner */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {/* Grand Total Payables */}
        <Grid item xs={12} sm={6} md={4}>
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              borderRadius: 2,
              border: '1px solid',
              borderColor: isDark ? 'rgba(239, 68, 68, 0.3)' : '#FCA5A5',
              bgcolor: isDark ? 'rgba(239, 68, 68, 0.08)' : '#FEF2F2',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              height: '100%',
            }}
          >
            <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
              <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', color: 'error.main', letterSpacing: 0.5 }}>
                Total Payables
              </Typography>
              <CallMadeIcon sx={{ color: 'error.main', fontSize: 20 }} />
            </Stack>
            <Typography variant="h5" sx={{ fontWeight: 800, color: 'error.dark', letterSpacing: '-0.02em', my: 0.5 }}>
              {formatCurrency(totals.grandTotalPayables || 0)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Total amount owed to all suppliers
            </Typography>
          </Paper>
        </Grid>

        {/* Supplier Accounts Due */}
        <Grid item xs={12} sm={6} md={4}>
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
                Supplier Ledgers
              </Typography>
              <FactoryIcon sx={{ color: '#D97706', fontSize: 20 }} />
            </Stack>
            <Typography variant="h5" sx={{ fontWeight: 800, color: '#D97706', letterSpacing: '-0.02em', my: 0.5 }}>
              {formatCurrency(totals.totalSupplierDue || 0)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {suppliers.length} supplier account{suppliers.length !== 1 ? 's' : ''} with payable balance
            </Typography>
          </Paper>
        </Grid>

        {/* Raw Material Coil Dues */}
        <Grid item xs={12} sm={6} md={4}>
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
                Raw Material Lots Due
              </Typography>
              <Inventory2Icon sx={{ color: '#3B82F6', fontSize: 20 }} />
            </Stack>
            <Typography variant="h5" sx={{ fontWeight: 800, color: '#2563EB', letterSpacing: '-0.02em', my: 0.5 }}>
              {formatCurrency(totals.totalRawMaterialDue || 0)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {rawMaterials.length} purchase lot{rawMaterials.length !== 1 ? 's' : ''} with pending amount
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
            <Tab label={`All Payables (${suppliers.length})`} />
            <Tab label={`Supplier Accounts (${suppliers.length})`} />
            <Tab label={`Raw Material Lots (${rawMaterials.length})`} />
          </Tabs>

          <TextField
            size="small"
            placeholder="Search supplier, company, or material..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                </InputAdornment>
              ),
            }}
            sx={{ width: { xs: '100%', sm: 300 } }}
          />
        </Stack>
      </Paper>

      {loading ? (
        <Box display="flex" justifyContent="center" py={8}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          {/* TAB 0: All or TAB 1: Supplier Accounts */}
          {(currentTab === 0 || currentTab === 1) && (
            <Paper elevation={0} sx={{ mb: 3, border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
              <Box sx={{ p: 2, bgcolor: isDark ? 'rgba(255,255,255,0.03)' : '#F8FAFC', borderBottom: '1px solid', borderColor: 'divider' }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography variant="subtitle1" fontWeight={700}>
                    Supplier Account Balances (We Owe)
                  </Typography>
                  <Chip
                    label={`Total: ${formatCurrency(totals.totalSupplierDue || 0)}`}
                    color="error"
                    size="small"
                    sx={{ fontWeight: 700 }}
                  />
                </Stack>
              </Box>

              <TableContainer sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'action.hover' }}>
                      <TableCell sx={{ fontWeight: 700 }}>Supplier Name</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Company</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Contact</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Total Purchased</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Total Paid</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: 'error.main' }}>Amount Due</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Last Activity</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {suppliers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                          No supplier payable balances found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      suppliers.map((s) => (
                        <TableRow key={s._id} hover>
                          <TableCell sx={{ fontWeight: 700 }}>{s.name}</TableCell>
                          <TableCell sx={{ color: 'text.secondary' }}>{s.companyName || '—'}</TableCell>
                          <TableCell sx={{ color: 'text.secondary' }}>{s.contactNumber || '—'}</TableCell>
                          <TableCell align="right">{formatCurrency(s.totalAmountPurchased || 0)}</TableCell>
                          <TableCell align="right" sx={{ color: 'success.main' }}>{formatCurrency(s.totalAmountPaid || 0)}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 800, color: 'error.main' }}>
                            {formatCurrency(s.totalAmountDue || 0)}
                          </TableCell>
                          <TableCell sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
                            {s.sinceDate ? formatDate(s.sinceDate) : '—'}
                          </TableCell>
                          <TableCell align="right">
                            <Button
                              size="small"
                              variant="outlined"
                              color="error"
                              startIcon={<MenuBookIcon sx={{ fontSize: 14 }} />}
                              onClick={() => handleOpenLedger(s)}
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

          {/* TAB 0: All or TAB 2: Raw Material Purchase Lots */}
          {(currentTab === 0 || currentTab === 2) && (
            <Paper elevation={0} sx={{ mb: 3, border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
              <Box sx={{ p: 2, bgcolor: isDark ? 'rgba(255,255,255,0.03)' : '#F8FAFC', borderBottom: '1px solid', borderColor: 'divider' }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography variant="subtitle1" fontWeight={700}>
                    Raw Material Purchase Dues (By Lot)
                  </Typography>
                  <Chip
                    label={`Lots Total: ${formatCurrency(totals.totalRawMaterialDue || 0)}`}
                    color="info"
                    size="small"
                    sx={{ fontWeight: 700 }}
                  />
                </Stack>
              </Box>

              <TableContainer sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'action.hover' }}>
                      <TableCell sx={{ fontWeight: 700 }}>Supplier</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Category</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Material</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Weight (kg)</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Rate (Rs.)</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Total Cost</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Paid</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: 'error.main' }}>Due</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Purchase Date</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rawMaterials.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                          No raw material purchase dues found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      rawMaterials.map((rm) => (
                        <TableRow key={rm._id} hover>
                          <TableCell sx={{ fontWeight: 700 }}>
                            {rm.supplierId?.name || rm.supplierName || 'Unknown Supplier'}
                          </TableCell>
                          <TableCell>
                            <Chip size="small" label={rm.coilCategory || 'Shiplet Coil'} variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
                          </TableCell>
                          <TableCell>{rm.materialType}</TableCell>
                          <TableCell align="right">{rm.weightInKg} kg</TableCell>
                          <TableCell align="right">{formatCurrency(rm.ratePerKg)}</TableCell>
                          <TableCell align="right">{formatCurrency(rm.totalAmount || 0)}</TableCell>
                          <TableCell align="right" sx={{ color: 'success.main' }}>{formatCurrency(rm.amountPaid || 0)}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 800, color: 'error.main' }}>
                            {formatCurrency(rm.amountDue || 0)}
                          </TableCell>
                          <TableCell sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
                            {rm.purchaseDate ? formatDate(rm.purchaseDate) : '—'}
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

      {/* Supplier Ledger Dialog */}
      {selectedSupplier && (
        <LedgerDialog
          open={ledgerOpen}
          onClose={() => {
            setLedgerOpen(false);
            setSelectedSupplier(null);
          }}
          title={`Ledger — ${selectedSupplier.name}`}
          fetchLedger={(params) => suppliersAPI.getLedger(selectedSupplier._id, params)}
          partyType="Supplier"
          linked={!!selectedSupplier.linkedCustomerId}
        />
      )}
    </Box>
  );
}
