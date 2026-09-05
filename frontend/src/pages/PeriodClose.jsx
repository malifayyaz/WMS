import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Stepper,
  Step,
  StepLabel,
  Card,
  CardContent,
  Alert,
  TextField,
  Button,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Checkbox,
  FormControlLabel,
  Tabs,
  Tab,
  LinearProgress,
  Grid,
  Chip,
  IconButton,
  Snackbar,
  Divider,
  Stack,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  ToggleButton,
  ToggleButtonGroup,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Backdrop,
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import LockResetIcon from '@mui/icons-material/LockReset';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import BackupIcon from '@mui/icons-material/Backup';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DownloadIcon from '@mui/icons-material/Download';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';

import { usePermissions } from '../hooks/usePermissions';
import AccessDeniedSnackbar from '../components/Common/AccessDeniedSnackbar';
import {
  periodCloseAPI,
  openingBalanceAPI,
  customersAPI,
  suppliersAPI,
  personalPaymentsAPI,
} from '../services/api';
import { formatCurrency, formatDate } from '../utils/formatters';

const SECTION_TABS = [
  { key: 'Cash', label: 'Cash' },
  { key: 'Bank', label: 'Bank' },
  { key: 'ShipletCoil', label: 'Shiplet Coil' },
  { key: 'PatriCoil', label: 'Patri Coil' },
  { key: 'Annealing', label: 'Annealing' },
  { key: 'Customer', label: 'Customers' },
  { key: 'Supplier', label: 'Suppliers' },
  { key: 'ProcessingCustomer', label: 'Processing' },
  { key: 'ReadyStock', label: 'Ready Stock' },
  { key: 'Cheque', label: 'Cheques' },
  { key: 'PersonalPayment', label: 'Personal Payments' },
];

const DEFAULT_BANKS = ['MBL', 'UBL', 'Faisal Bank'];
const WIRE_NUMBERS = Array.from({ length: 20 }, (_, i) => i + 1);

export default function PeriodClose() {
  const navigate = useNavigate();
  const { isAdmin, isViewer } = usePermissions();

  const [accessDenied, setAccessDenied] = useState(false);
  const [activeStep, setActiveStep] = useState(0);

  // Step 1 State
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [closeDate, setCloseDate] = useState(todayStr);
  const [password, setPassword] = useState('');
  const [notes, setNotes] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [step1Error, setStep1Error] = useState('');

  // Step 2 State
  const [confirmed, setConfirmed] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [executingPhase, setExecutingPhase] = useState(1);
  const [closeResult, setCloseResult] = useState(null);
  const [step2Error, setStep2Error] = useState('');

  // Step 3 State
  const [activeTab, setActiveTab] = useState(0);
  const [openings, setOpenings] = useState({});
  const [summary, setSummary] = useState(null);
  const [loadingOpenings, setLoadingOpenings] = useState(false);

  // Entities for Selection
  const [customerList, setCustomerList] = useState([]);
  const [supplierList, setSupplierList] = useState([]);
  const [personalPaymentCategories, setPersonalPaymentCategories] = useState([]);
  const [customerFilter, setCustomerFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');

  // Local Form States
  const [cashAmount, setCashAmount] = useState('');
  const [bankBalances, setBankBalances] = useState({ MBL: '', UBL: '', 'Faisal Bank': '' });
  const [customBanks, setCustomBanks] = useState([]);
  const [customBankName, setCustomBankName] = useState('');
  const [customBankBalance, setCustomBankBalance] = useState('');

  // Lot form for Shiplet and Patri
  const [shipletForm, setShipletForm] = useState({ supplierName: '', weightKg: '', ratePerKg: '', bundles: '' });
  const [patriForm, setPatriForm] = useState({ supplierName: '', weightKg: '', ratePerKg: '', bundles: '' });

  // Annealing form
  const [annealingForm, setAnnealingForm] = useState({ coilType: 'Shiplet Coil', weightKg: '', bundles: '', notes: '' });

  // Ready Stock form
  const [readyStockForm, setReadyStockForm] = useState({ wireNumber: 1, weightKg: '', ratePerKg: '' });

  // Cheque form
  const [chequeForm, setChequeForm] = useState({
    chequeType: 'Receivable',
    partyName: '',
    chequeNumber: '',
    bankName: '',
    amount: '',
    dueDate: todayStr,
  });

  // Snack notifications
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'info' });

  // Guard: viewer cannot access
  useEffect(() => {
    if (isViewer) {
      setAccessDenied(true);
      const timer = setTimeout(() => navigate('/dashboard'), 2000);
      return () => clearTimeout(timer);
    }
  }, [isViewer, navigate]);

  // Load Reference Data
  const loadReferenceData = useCallback(async () => {
    try {
      const [cRes, sRes, pRes] = await Promise.all([
        customersAPI.getAll({ limit: 1000 }),
        suppliersAPI.getAll({ limit: 1000 }),
        personalPaymentsAPI.getAll().catch(() => ({ data: { data: [] } })),
      ]);
      setCustomerList(cRes.data.data || []);
      setSupplierList(sRes.data.data || []);
      setPersonalPaymentCategories(pRes.data.data || []);
    } catch (err) {
      console.error('Failed to load reference parties:', err);
    }
  }, []);

  // Load Openings & Summary
  const refreshOpenings = useCallback(async () => {
    setLoadingOpenings(true);
    try {
      const [oRes, sRes] = await Promise.all([
        openingBalanceAPI.getAll(),
        openingBalanceAPI.getSummary(),
      ]);
      const data = oRes.data.data || {};
      setOpenings(data);
      setSummary(sRes.data.data || null);

      // Populate Cash
      if (data.Cash && data.Cash.length > 0) {
        setCashAmount(data.Cash[0].cashAmount ?? '');
      }

      // Populate Bank
      if (data.Bank && data.Bank.length > 0) {
        const banksObj = { MBL: '', UBL: '', 'Faisal Bank': '' };
        const customs = [];
        data.Bank.forEach((b) => {
          if (DEFAULT_BANKS.includes(b.bankAccount)) {
            banksObj[b.bankAccount] = b.bankAmount ?? '';
          } else {
            customs.push({ name: b.bankAccount, balance: b.bankAmount ?? '', id: b._id });
          }
        });
        setBankBalances(banksObj);
        setCustomBanks(customs);
      }
    } catch (err) {
      console.error('Error refreshing openings:', err);
    } finally {
      setLoadingOpenings(false);
    }
  }, []);

  useEffect(() => {
    loadReferenceData();
    refreshOpenings();
  }, [loadReferenceData, refreshOpenings]);

  // Handle Preview
  const handlePreviewImpact = async () => {
    if (!closeDate) {
      setStep1Error('Please select a closing date');
      return;
    }
    setPreviewLoading(true);
    setStep1Error('');
    try {
      const res = await periodCloseAPI.preview(closeDate);
      setPreviewData(res.data.data);
    } catch (err) {
      setStep1Error(err.response?.data?.message || 'Failed to preview impact');
    } finally {
      setPreviewLoading(false);
    }
  };

  // Handle Step 1 Verification
  const handleVerifyPassword = async () => {
    if (!password) {
      setStep1Error('Closing password is required');
      return;
    }
    setVerifyLoading(true);
    setStep1Error('');
    try {
      await periodCloseAPI.validatePassword({ password });
      setActiveStep(1);
    } catch (err) {
      setStep1Error(err.response?.data?.message || 'Incorrect closing password');
    } finally {
      setVerifyLoading(false);
    }
  };

  // Handle Step 2 Execute with sequential progress simulation
  const handleExecuteClose = async () => {
    if (!confirmed) return;
    setExecuting(true);
    setStep2Error('');

    // Sequential phase messages
    setExecutingPhase(1);
    const p1 = setTimeout(() => setExecutingPhase(2), 1100);
    const p2 = setTimeout(() => setExecutingPhase(3), 2200);
    const p3 = setTimeout(() => setExecutingPhase(4), 3300);

    try {
      const res = await periodCloseAPI.execute({
        closeDate,
        password,
        notes,
      });
      clearTimeout(p1);
      clearTimeout(p2);
      clearTimeout(p3);
      setCloseResult(res.data.data);
      refreshOpenings();
      setSnack({
        open: true,
        message: 'Period closed successfully! You may now download backup and start fresh.',
        severity: 'success',
      });
    } catch (err) {
      clearTimeout(p1);
      clearTimeout(p2);
      clearTimeout(p3);
      setStep2Error(err.response?.data?.message || 'Failed to execute period close');
    } finally {
      setExecuting(false);
    }
  };

  // Handle Download Backup
  const handleDownloadBackup = async (filename) => {
    if (!filename) return;
    try {
      const res = await periodCloseAPI.downloadBackup(filename);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      setSnack({ open: true, message: 'Failed to download backup file', severity: 'error' });
    }
  };

  // Generic Save Opening
  const handleSaveOpening = async (payload) => {
    try {
      await openingBalanceAPI.upsert(payload);
      setSnack({ open: true, message: 'Opening balance saved & applied', severity: 'success' });
      refreshOpenings();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Failed to save', severity: 'error' });
    }
  };

  // Generic Delete Opening
  const handleDeleteOpening = async (id) => {
    try {
      await openingBalanceAPI.delete(id);
      setSnack({ open: true, message: 'Opening balance deleted and reversed', severity: 'info' });
      refreshOpenings();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Failed to delete', severity: 'error' });
    }
  };

  // Tab Badge: whether section has data
  const hasSectionData = (tabKey) => {
    const list = openings[tabKey];
    return Array.isArray(list) && list.length > 0;
  };

  const completedSectionsCount = summary?.sectionsCompleted?.length || 0;

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', p: { xs: 1, sm: 3 } }}>
      <AccessDeniedSnackbar open={accessDenied} onClose={() => setAccessDenied(false)} />

      {/* Stepper Header */}
      <Card sx={{ mb: 3, p: 2 }}>
        <Stepper activeStep={activeStep} alternativeLabel>
          <Step>
            <StepLabel>Select Date & Verify</StepLabel>
          </Step>
          <Step>
            <StepLabel>Review & Confirm</StepLabel>
          </Step>
          <Step>
            <StepLabel>Enter Opening Balances</StepLabel>
          </Step>
        </Stepper>
      </Card>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* STEP 1: SELECT DATE & VERIFY                                   */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeStep === 0 && (
        <Card sx={{ p: { xs: 2, sm: 4 }, border: '1px solid #FFCDD2' }}>
          <Box display="flex" alignItems="center" gap={1.5} mb={1}>
            <LockResetIcon color="error" sx={{ fontSize: 36 }} />
            <Box>
              <Typography variant="h5" fontWeight={700} color="error.main">
                Period Close & Fresh Start
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Archive existing records into an automatic Excel backup and start fresh from your chosen date.
              </Typography>
            </Box>
          </Box>

          <Alert severity="error" sx={{ mt: 2, mb: 3 }}>
            <strong>Caution:</strong> Records from the selected date onwards will be permanently deleted.
            A complete Excel backup of all collections will be generated and saved before any deletion occurs.
          </Alert>

          {step1Error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {step1Error}
            </Alert>
          )}

          <Grid container spacing={3}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="date"
                label="Start fresh from this date"
                value={closeDate}
                onChange={(e) => setCloseDate(e.target.value)}
                inputProps={{ max: todayStr }}
                InputLabelProps={{ shrink: true }}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6} display="flex" alignItems="center">
              <Button
                variant="outlined"
                color="error"
                fullWidth
                sx={{ height: 54 }}
                onClick={handlePreviewImpact}
                disabled={previewLoading}
                startIcon={previewLoading ? <CircularProgress size={20} /> : <WarningAmberIcon />}
              >
                {previewLoading ? 'Analyzing Database...' : 'Preview Impact'}
              </Button>
            </Grid>
          </Grid>

          {/* Preview impact table */}
          {previewData && (
            <Card variant="outlined" sx={{ mt: 3, p: 2, bgcolor: '#FFF5F5', borderColor: '#FFCDD2' }}>
              <Typography variant="subtitle1" fontWeight={700} color="error.dark" gutterBottom>
                Records that will be permanently deleted (from {closeDate} onwards):
              </Typography>
              <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#FFEBEE' }}>
                      <TableCell><strong>Collection / Category</strong></TableCell>
                      <TableCell align="right"><strong>Records Count</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    <TableRow><TableCell>Orders</TableCell><TableCell align="right">{previewData.willDelete.orders}</TableCell></TableRow>
                    <TableRow><TableCell>Transactions</TableCell><TableCell align="right">{previewData.willDelete.transactions}</TableCell></TableRow>
                    <TableRow><TableCell>Expenses</TableCell><TableCell align="right">{previewData.willDelete.expenses}</TableCell></TableRow>
                    <TableRow><TableCell>Raw Materials (Coils)</TableCell><TableCell align="right">{previewData.willDelete.rawMaterials}</TableCell></TableRow>
                    <TableRow><TableCell>Annealing Records</TableCell><TableCell align="right">{previewData.willDelete.annealingRecords}</TableCell></TableRow>
                    <TableRow><TableCell>Job Works (Processing)</TableCell><TableCell align="right">{previewData.willDelete.jobWorks}</TableCell></TableRow>
                    <TableRow><TableCell>Worker Ledger Entries</TableCell><TableCell align="right">{previewData.willDelete.workerLedgerEntries}</TableCell></TableRow>
                    <TableRow><TableCell>Consumption Materials</TableCell><TableCell align="right">{previewData.willDelete.consumptionMaterials}</TableCell></TableRow>
                    <TableRow><TableCell>Ready Stock (Finished Wire)</TableCell><TableCell align="right">{previewData.willDelete.readyStock}</TableCell></TableRow>
                    <TableRow><TableCell>Personal Payments</TableCell><TableCell align="right">{previewData.willDelete.personalPayments}</TableCell></TableRow>
                    <TableRow><TableCell>Activity Logs</TableCell><TableCell align="right">{previewData.willDelete.activityLogs}</TableCell></TableRow>
                    <TableRow sx={{ bgcolor: '#FFCDD2' }}>
                      <TableCell><strong>Total Records to be Deleted</strong></TableCell>
                      <TableCell align="right">
                        <Typography variant="h6" fontWeight={800} color="error.dark">
                          {previewData.willDelete.total}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>

              <Box display="flex" alignItems="center" gap={1} color="success.dark">
                <CheckCircleIcon color="success" fontSize="small" />
                <Typography variant="body2" fontWeight={600}>
                  A complete Excel workbook containing all existing records across all 14 sheets will be created prior to deletion.
                </Typography>
              </Box>
            </Card>
          )}

          <Divider sx={{ my: 3 }} />

          <Grid container spacing={3}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="password"
                label="Closing Password"
                placeholder="Enter special closing password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Optional Notes / Reason for Close"
                placeholder="e.g., Financial Year Close, Audit Reset"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Grid>
          </Grid>

          <Box display="flex" justifyContent="flex-end" mt={3}>
            <Button
              variant="contained"
              color="error"
              size="large"
              disabled={verifyLoading || !password}
              onClick={handleVerifyPassword}
              endIcon={verifyLoading ? <CircularProgress size={20} color="inherit" /> : <ArrowForwardIcon />}
            >
              Verify Password & Continue
            </Button>
          </Box>
        </Card>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* STEP 2: REVIEW & CONFIRM                                       */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeStep === 1 && !closeResult && (
        <Card sx={{ p: { xs: 2, sm: 4 } }}>
          <Typography variant="h5" fontWeight={700} gutterBottom color="error.main">
            Step 2: Review & Confirm Impact
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Carefully inspect the actions that will be performed for closing date <strong>{closeDate}</strong>.
          </Typography>

          {step2Error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {step2Error}
            </Alert>
          )}

          <Stack spacing={2.5}>
            {/* 1. Deletion Alert */}
            <Alert severity="error" icon={<DeleteForeverIcon fontSize="large" />}>
              <Typography variant="subtitle1" fontWeight={700}>
                1. Permanent Data Purge
              </Typography>
              <Typography variant="body2">
                All records created on or after <strong>{closeDate}</strong> ({previewData?.willDelete?.total ?? 'Selected'} total records)
                will be permanently deleted across all transactional modules.
              </Typography>
            </Alert>

            {/* 2. Backup Alert */}
            <Alert severity="success" icon={<BackupIcon fontSize="large" />}>
              <Typography variant="subtitle1" fontWeight={700}>
                2. Automated Full Excel Backup
              </Typography>
              <Typography variant="body2">
                A full snapshot of every record in the database will be saved to the server at{' '}
                <code>backend/backups/WMS_Backup_[date].xlsx</code> with 14 separate collection worksheets.
              </Typography>
            </Alert>

            {/* 3. Balances Zeroed */}
            <Alert severity="warning" icon={<WarningAmberIcon fontSize="large" />}>
              <Typography variant="subtitle1" fontWeight={700}>
                3. Balances Zeroed & System Fresh Start
              </Typography>
              <Box component="ul" sx={{ m: 0, pl: 2, mt: 0.5 }}>
                <li>All customer balances and payment histories &rarr; reset to 0</li>
                <li>All supplier balances and purchase totals &rarr; reset to 0</li>
                <li>All raw material coil current stock &rarr; reset to 0 kg</li>
                <li>All daily cash & bank account opening balances &rarr; cleared</li>
                <li>All worker balances & advance totals &rarr; reset to 0</li>
                <li>Reports & Balance Sheet &rarr; will show fresh 0 figures until opening balances are entered</li>
              </Box>
            </Alert>

            {/* Confirmation checkbox */}
            <Card variant="outlined" sx={{ p: 2, bgcolor: '#FFEBEE', borderColor: '#EF5350' }}>
              <FormControlLabel
                control={
                  <Checkbox
                    color="error"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                }
                label={
                  <Typography variant="body1" fontWeight={700} color="error.dark">
                    I understand this action cannot be undone. I have verified the start date is {closeDate} and wish to proceed.
                  </Typography>
                }
              />
            </Card>

            <Box display="flex" justifyContent="space-between" mt={2}>
              <Button
                variant="outlined"
                startIcon={<ArrowBackIcon />}
                onClick={() => setActiveStep(0)}
                disabled={executing}
              >
                Go Back
              </Button>
              <Button
                variant="contained"
                color="error"
                size="large"
                disabled={!confirmed || executing}
                onClick={handleExecuteClose}
                startIcon={executing ? <CircularProgress size={20} color="inherit" /> : <DeleteForeverIcon />}
              >
                Execute Period Close
              </Button>
            </Box>
          </Stack>

          {/* Full Screen Loading Overlay */}
          <Backdrop
            sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.drawer + 1, flexDirection: 'column', gap: 2 }}
            open={executing}
          >
            <CircularProgress color="inherit" size={60} thickness={4} />
            <Typography variant="h5" fontWeight={700}>
              Executing Period Close
            </Typography>
            <Card sx={{ p: 2, minWidth: 320, textAlign: 'center', bgcolor: 'rgba(0,0,0,0.85)', color: '#fff' }}>
              {executingPhase === 1 && <Typography variant="body1">Step 1/4: Creating full Excel backup across 14 sheets...</Typography>}
              {executingPhase === 2 && <Typography variant="body1">Step 2/4: Deleting records from {closeDate} onwards...</Typography>}
              {executingPhase === 3 && <Typography variant="body1">Step 3/4: Resetting customer, supplier, stock, and bank balances...</Typography>}
              {executingPhase === 4 && <Typography variant="body1">Step 4/4: Finalizing period close audit records...</Typography>}
            </Card>
          </Backdrop>
        </Card>
      )}

      {/* Execution Success Screen */}
      {activeStep === 1 && closeResult && (
        <Card sx={{ p: { xs: 2, sm: 4 }, textAlign: 'center', border: '2px solid #66BB6A' }}>
          <CheckCircleIcon sx={{ fontSize: 72, color: 'success.main', mb: 1 }} />
          <Typography variant="h4" fontWeight={800} color="success.dark" gutterBottom>
            Period Closed Successfully!
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            Fresh start initialized from <strong>{formatDate(closeResult.closeDate)}</strong>.
          </Typography>

          <Alert severity="success" sx={{ maxWidth: 600, mx: 'auto', mb: 3, textAlign: 'left' }}>
            <strong>Backup Generated:</strong> <code>{closeResult.backupFilename}</code>
            <br />
            <strong>Total Records Deleted:</strong> {Object.values(closeResult.deletedCounts || {}).reduce((s, c) => s + c, 0)} records.
          </Alert>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center">
            {closeResult.backupFilename && (
              <Button
                variant="outlined"
                color="success"
                size="large"
                startIcon={<DownloadIcon />}
                onClick={() => handleDownloadBackup(closeResult.backupFilename)}
              >
                Download Excel Backup
              </Button>
            )}
            <Button
              variant="contained"
              color="success"
              size="large"
              endIcon={<ArrowForwardIcon />}
              onClick={() => setActiveStep(2)}
            >
              Proceed to Opening Balances
            </Button>
          </Stack>
        </Card>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* STEP 3: ENTER OPENING BALANCES                                 */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeStep === 2 && (
        <Card sx={{ p: { xs: 1.5, sm: 3 } }}>
          {/* Progress Header */}
          <Box sx={{ mb: 3 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
              <Typography variant="h6" fontWeight={700}>
                Opening Balances Entry
              </Typography>
              <Chip
                label={`${completedSectionsCount} of 11 Sections Completed`}
                color={completedSectionsCount === 11 ? 'success' : 'warning'}
                variant="filled"
                sx={{ fontWeight: 700 }}
              />
            </Box>
            <LinearProgress
              variant="determinate"
              value={(completedSectionsCount / 11) * 100}
              sx={{ height: 8, borderRadius: 4 }}
              color={completedSectionsCount === 11 ? 'success' : 'primary'}
            />
          </Box>

          {/* Section Tabs */}
          <Tabs
            value={activeTab}
            onChange={(_, val) => setActiveTab(val)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}
          >
            {SECTION_TABS.map((tab, idx) => {
              const hasData = hasSectionData(tab.key);
              return (
                <Tab
                  key={tab.key}
                  label={
                    <Box display="flex" alignItems="center" gap={0.5}>
                      <span>{tab.label}</span>
                      {hasData && <CheckCircleIcon sx={{ fontSize: 16, color: 'success.main' }} />}
                    </Box>
                  }
                />
              );
            })}
          </Tabs>

          {loadingOpenings && <LinearProgress sx={{ mb: 2 }} />}

          {/* TAB 0: CASH */}
          {activeTab === 0 && (
            <Card variant="outlined" sx={{ p: 3, maxWidth: 500 }}>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                Opening Cash in Hand
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Enter the physical cash available at the factory/office on the opening date.
              </Typography>
              <TextField
                fullWidth
                type="number"
                label="Opening Cash (Rs.)"
                value={cashAmount}
                onChange={(e) => setCashAmount(e.target.value)}
                sx={{ mb: 2 }}
              />
              <Button
                variant="contained"
                color="primary"
                onClick={() => handleSaveOpening({ section: 'Cash', cashAmount: Number(cashAmount) || 0 })}
              >
                Save Opening Cash
              </Button>
            </Card>
          )}

          {/* TAB 1: BANK */}
          {activeTab === 1 && (
            <Box>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                Bank Accounts Opening Balances
              </Typography>
              <Grid container spacing={2} sx={{ mb: 3 }}>
                {DEFAULT_BANKS.map((bName) => (
                  <Grid item xs={12} sm={4} key={bName}>
                    <Card variant="outlined" sx={{ p: 2 }}>
                      <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                        {bName} Bank
                      </Typography>
                      <TextField
                        fullWidth
                        size="small"
                        type="number"
                        label="Opening Balance (Rs.)"
                        value={bankBalances[bName] || ''}
                        onChange={(e) =>
                          setBankBalances((prev) => ({ ...prev, [bName]: e.target.value }))
                        }
                        sx={{ mb: 1.5 }}
                      />
                      <Button
                        size="small"
                        variant="contained"
                        onClick={() =>
                          handleSaveOpening({
                            section: 'Bank',
                            bankAccount: bName,
                            bankAmount: Number(bankBalances[bName]) || 0,
                          })
                        }
                      >
                        Save {bName}
                      </Button>
                    </Card>
                  </Grid>
                ))}
              </Grid>

              {/* Custom Bank Accounts */}
              {customBanks.length > 0 && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                    Other Bank Accounts:
                  </Typography>
                  <Stack spacing={1}>
                    {customBanks.map((cb) => (
                      <Card key={cb.name} variant="outlined" sx={{ p: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Typography variant="body2" fontWeight={600}>
                          {cb.name}: {formatCurrency(cb.balance)}
                        </Typography>
                        <IconButton size="small" color="error" onClick={() => handleDeleteOpening(cb.id)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Card>
                    ))}
                  </Stack>
                </Box>
              )}

              {/* Add Custom Bank Form */}
              <Card variant="outlined" sx={{ p: 2, maxWidth: 500 }}>
                <Typography variant="body2" fontWeight={700} gutterBottom>
                  Add Another Bank Account
                </Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <TextField
                    size="small"
                    label="Bank / Account Name"
                    value={customBankName}
                    onChange={(e) => setCustomBankName(e.target.value)}
                  />
                  <TextField
                    size="small"
                    type="number"
                    label="Opening Balance"
                    value={customBankBalance}
                    onChange={(e) => setCustomBankBalance(e.target.value)}
                  />
                  <Button
                    variant="outlined"
                    onClick={() => {
                      if (!customBankName) return;
                      handleSaveOpening({
                        section: 'Bank',
                        bankAccount: customBankName,
                        bankAmount: Number(customBankBalance) || 0,
                      });
                      setCustomBankName('');
                      setCustomBankBalance('');
                    }}
                  >
                    Add
                  </Button>
                </Stack>
              </Card>
            </Box>
          )}

          {/* TAB 2: SHIPLET COIL */}
          {activeTab === 2 && (
            <Box>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                Shiplet Coil Opening Stock Lots
              </Typography>
              {/* Form */}
              <Card variant="outlined" sx={{ p: 2, mb: 3, bgcolor: '#FAFAFA' }}>
                <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                  Add Opening Lot
                </Typography>
                <Grid container spacing={1.5} alignItems="center">
                  <Grid item xs={12} sm={3}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Supplier Name"
                      value={shipletForm.supplierName}
                      onChange={(e) => setShipletForm((f) => ({ ...f, supplierName: e.target.value }))}
                    />
                  </Grid>
                  <Grid item xs={6} sm={2}>
                    <TextField
                      fullWidth
                      size="small"
                      type="number"
                      label="Weight (kg)"
                      value={shipletForm.weightKg}
                      onChange={(e) => setShipletForm((f) => ({ ...f, weightKg: e.target.value }))}
                      required
                    />
                  </Grid>
                  <Grid item xs={6} sm={2}>
                    <TextField
                      fullWidth
                      size="small"
                      type="number"
                      label="Rate / kg"
                      value={shipletForm.ratePerKg}
                      onChange={(e) => setShipletForm((f) => ({ ...f, ratePerKg: e.target.value }))}
                      required
                    />
                  </Grid>
                  <Grid item xs={6} sm={2}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Total Value"
                      value={formatCurrency((Number(shipletForm.weightKg) || 0) * (Number(shipletForm.ratePerKg) || 0))}
                      disabled
                    />
                  </Grid>
                  <Grid item xs={6} sm={1.5}>
                    <TextField
                      fullWidth
                      size="small"
                      type="number"
                      label="Bundles"
                      value={shipletForm.bundles}
                      onChange={(e) => setShipletForm((f) => ({ ...f, bundles: e.target.value }))}
                    />
                  </Grid>
                  <Grid item xs={12} sm={1.5}>
                    <Button
                      fullWidth
                      variant="contained"
                      onClick={() => {
                        const w = Number(shipletForm.weightKg);
                        const r = Number(shipletForm.ratePerKg);
                        if (!w || !r) return;
                        handleSaveOpening({
                          section: 'ShipletCoil',
                          coilCategory: 'Shiplet Coil',
                          supplierName: shipletForm.supplierName || 'Opening Stock',
                          weightKg: w,
                          ratePerKg: r,
                          totalValue: w * r,
                          bundles: Number(shipletForm.bundles) || 0,
                        });
                        setShipletForm({ supplierName: '', weightKg: '', ratePerKg: '', bundles: '' });
                      }}
                    >
                      Save Lot
                    </Button>
                  </Grid>
                </Grid>
              </Card>

              {/* Table */}
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'grey.100' }}>
                      <TableCell>Supplier</TableCell>
                      <TableCell align="right">Weight (kg)</TableCell>
                      <TableCell align="right">Rate / kg</TableCell>
                      <TableCell align="right">Total Value</TableCell>
                      <TableCell align="right">Bundles</TableCell>
                      <TableCell align="center">Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(openings.ShipletCoil || []).length === 0 ? (
                      <TableRow><TableCell colSpan={6} align="center">No Shiplet Coil opening lots recorded.</TableCell></TableRow>
                    ) : (
                      (openings.ShipletCoil || []).map((lot) => (
                        <TableRow key={lot._id}>
                          <TableCell>{lot.supplierName || 'Opening Stock'}</TableCell>
                          <TableCell align="right">{lot.weightKg} kg</TableCell>
                          <TableCell align="right">{formatCurrency(lot.ratePerKg)}</TableCell>
                          <TableCell align="right">{formatCurrency(lot.totalValue)}</TableCell>
                          <TableCell align="right">{lot.bundles}</TableCell>
                          <TableCell align="center">
                            <IconButton size="small" color="error" onClick={() => handleDeleteOpening(lot._id)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
              <Typography variant="subtitle2" sx={{ mt: 1.5, fontWeight: 700 }}>
                Total Shiplet Coil Opening Stock:{' '}
                {(openings.ShipletCoil || []).reduce((s, l) => s + (l.weightKg || 0), 0)} kg —{' '}
                {formatCurrency((openings.ShipletCoil || []).reduce((s, l) => s + (l.totalValue || 0), 0))} value
              </Typography>
            </Box>
          )}

          {/* TAB 3: PATRI COIL */}
          {activeTab === 3 && (
            <Box>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                Patri Coil Opening Stock Lots
              </Typography>
              {/* Form */}
              <Card variant="outlined" sx={{ p: 2, mb: 3, bgcolor: '#FAFAFA' }}>
                <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                  Add Opening Lot
                </Typography>
                <Grid container spacing={1.5} alignItems="center">
                  <Grid item xs={12} sm={3}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Supplier Name"
                      value={patriForm.supplierName}
                      onChange={(e) => setPatriForm((f) => ({ ...f, supplierName: e.target.value }))}
                    />
                  </Grid>
                  <Grid item xs={6} sm={2}>
                    <TextField
                      fullWidth
                      size="small"
                      type="number"
                      label="Weight (kg)"
                      value={patriForm.weightKg}
                      onChange={(e) => setPatriForm((f) => ({ ...f, weightKg: e.target.value }))}
                      required
                    />
                  </Grid>
                  <Grid item xs={6} sm={2}>
                    <TextField
                      fullWidth
                      size="small"
                      type="number"
                      label="Rate / kg"
                      value={patriForm.ratePerKg}
                      onChange={(e) => setPatriForm((f) => ({ ...f, ratePerKg: e.target.value }))}
                      required
                    />
                  </Grid>
                  <Grid item xs={6} sm={2}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Total Value"
                      value={formatCurrency((Number(patriForm.weightKg) || 0) * (Number(patriForm.ratePerKg) || 0))}
                      disabled
                    />
                  </Grid>
                  <Grid item xs={6} sm={1.5}>
                    <TextField
                      fullWidth
                      size="small"
                      type="number"
                      label="Bundles"
                      value={patriForm.bundles}
                      onChange={(e) => setPatriForm((f) => ({ ...f, bundles: e.target.value }))}
                    />
                  </Grid>
                  <Grid item xs={12} sm={1.5}>
                    <Button
                      fullWidth
                      variant="contained"
                      onClick={() => {
                        const w = Number(patriForm.weightKg);
                        const r = Number(patriForm.ratePerKg);
                        if (!w || !r) return;
                        handleSaveOpening({
                          section: 'PatriCoil',
                          coilCategory: 'Patri Coil',
                          supplierName: patriForm.supplierName || 'Opening Stock',
                          weightKg: w,
                          ratePerKg: r,
                          totalValue: w * r,
                          bundles: Number(patriForm.bundles) || 0,
                        });
                        setPatriForm({ supplierName: '', weightKg: '', ratePerKg: '', bundles: '' });
                      }}
                    >
                      Save Lot
                    </Button>
                  </Grid>
                </Grid>
              </Card>

              {/* Table */}
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'grey.100' }}>
                      <TableCell>Supplier</TableCell>
                      <TableCell align="right">Weight (kg)</TableCell>
                      <TableCell align="right">Rate / kg</TableCell>
                      <TableCell align="right">Total Value</TableCell>
                      <TableCell align="right">Bundles</TableCell>
                      <TableCell align="center">Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(openings.PatriCoil || []).length === 0 ? (
                      <TableRow><TableCell colSpan={6} align="center">No Patri Coil opening lots recorded.</TableCell></TableRow>
                    ) : (
                      (openings.PatriCoil || []).map((lot) => (
                        <TableRow key={lot._id}>
                          <TableCell>{lot.supplierName || 'Opening Stock'}</TableCell>
                          <TableCell align="right">{lot.weightKg} kg</TableCell>
                          <TableCell align="right">{formatCurrency(lot.ratePerKg)}</TableCell>
                          <TableCell align="right">{formatCurrency(lot.totalValue)}</TableCell>
                          <TableCell align="right">{lot.bundles}</TableCell>
                          <TableCell align="center">
                            <IconButton size="small" color="error" onClick={() => handleDeleteOpening(lot._id)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
              <Typography variant="subtitle2" sx={{ mt: 1.5, fontWeight: 700 }}>
                Total Patri Coil Opening Stock:{' '}
                {(openings.PatriCoil || []).reduce((s, l) => s + (l.weightKg || 0), 0)} kg —{' '}
                {formatCurrency((openings.PatriCoil || []).reduce((s, l) => s + (l.totalValue || 0), 0))} value
              </Typography>
            </Box>
          )}

          {/* TAB 4: ANNEALING */}
          {activeTab === 4 && (
            <Box>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                Annealing Bhatti Stock Opening
              </Typography>
              <Card variant="outlined" sx={{ p: 2, mb: 3, bgcolor: '#FAFAFA', maxWidth: 600 }}>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Coil Type</InputLabel>
                      <Select
                        label="Coil Type"
                        value={annealingForm.coilType}
                        onChange={(e) => setAnnealingForm((f) => ({ ...f, coilType: e.target.value }))}
                      >
                        <MenuItem value="Shiplet Coil">Shiplet Coil</MenuItem>
                        <MenuItem value="Patri Coil">Patri Coil</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <TextField
                      fullWidth
                      size="small"
                      type="number"
                      label="Weight (kg)"
                      value={annealingForm.weightKg}
                      onChange={(e) => setAnnealingForm((f) => ({ ...f, weightKg: e.target.value }))}
                    />
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <TextField
                      fullWidth
                      size="small"
                      type="number"
                      label="Bundles"
                      value={annealingForm.bundles}
                      onChange={(e) => setAnnealingForm((f) => ({ ...f, bundles: e.target.value }))}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Notes"
                      value={annealingForm.notes}
                      onChange={(e) => setAnnealingForm((f) => ({ ...f, notes: e.target.value }))}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <Button
                      variant="contained"
                      onClick={() => {
                        const w = Number(annealingForm.weightKg);
                        if (!w) return;
                        handleSaveOpening({
                          section: 'Annealing',
                          annealingCoilType: annealingForm.coilType,
                          annealingWeightKg: w,
                          annealingBundles: Number(annealingForm.bundles) || 0,
                          referenceName: annealingForm.notes,
                        });
                        setAnnealingForm({ coilType: 'Shiplet Coil', weightKg: '', bundles: '', notes: '' });
                      }}
                    >
                      Save Annealing Opening
                    </Button>
                  </Grid>
                </Grid>
              </Card>

              {/* Table */}
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'grey.100' }}>
                      <TableCell>Coil Type</TableCell>
                      <TableCell align="right">Weight (kg)</TableCell>
                      <TableCell align="right">Bundles</TableCell>
                      <TableCell>Notes</TableCell>
                      <TableCell align="center">Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(openings.Annealing || []).length === 0 ? (
                      <TableRow><TableCell colSpan={5} align="center">No Annealing openings recorded.</TableCell></TableRow>
                    ) : (
                      (openings.Annealing || []).map((ann) => (
                        <TableRow key={ann._id}>
                          <TableCell>{ann.annealingCoilType}</TableCell>
                          <TableCell align="right">{ann.annealingWeightKg} kg</TableCell>
                          <TableCell align="right">{ann.annealingBundles}</TableCell>
                          <TableCell>{ann.referenceName || '-'}</TableCell>
                          <TableCell align="center">
                            <IconButton size="small" color="error" onClick={() => handleDeleteOpening(ann._id)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}

          {/* TAB 5: CUSTOMERS */}
          {activeTab === 5 && (
            <Box>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="subtitle1" fontWeight={700}>
                  Customer Balances
                </Typography>
                <TextField
                  size="small"
                  placeholder="Filter customers..."
                  value={customerFilter}
                  onChange={(e) => setCustomerFilter(e.target.value)}
                  InputProps={{ startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1 }} /> }}
                />
              </Box>

              <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 480 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Customer Name</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>Balance Type</TableCell>
                      <TableCell align="right">Amount (Rs.)</TableCell>
                      <TableCell align="center">Status</TableCell>
                      <TableCell align="center">Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {customerList
                      .filter((c) => c.name.toLowerCase().includes(customerFilter.toLowerCase()))
                      .map((c) => {
                        const existing = (openings.Customer || []).find((o) => String(o.referenceId) === String(c._id));
                        return (
                          <CustomerRowItem
                            key={c._id}
                            customer={c}
                            existing={existing}
                            onSave={handleSaveOpening}
                            onDelete={handleDeleteOpening}
                          />
                        );
                      })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}

          {/* TAB 6: SUPPLIERS */}
          {activeTab === 6 && (
            <Box>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="subtitle1" fontWeight={700}>
                  Supplier Balances
                </Typography>
                <TextField
                  size="small"
                  placeholder="Filter suppliers..."
                  value={supplierFilter}
                  onChange={(e) => setSupplierFilter(e.target.value)}
                  InputProps={{ startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1 }} /> }}
                />
              </Box>

              <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 480 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Supplier Name</TableCell>
                      <TableCell>Company</TableCell>
                      <TableCell>Balance Type</TableCell>
                      <TableCell align="right">Amount (Rs.)</TableCell>
                      <TableCell align="center">Status</TableCell>
                      <TableCell align="center">Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {supplierList
                      .filter((s) => s.name.toLowerCase().includes(supplierFilter.toLowerCase()))
                      .map((s) => {
                        const existing = (openings.Supplier || []).find((o) => String(o.referenceId) === String(s._id));
                        return (
                          <SupplierRowItem
                            key={s._id}
                            supplier={s}
                            existing={existing}
                            onSave={handleSaveOpening}
                            onDelete={handleDeleteOpening}
                          />
                        );
                      })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}

          {/* TAB 7: PROCESSING (JOB WORK) */}
          {activeTab === 7 && (
            <Box>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                Processing Customers (Job Work Coil & Dues)
              </Typography>
              <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 480 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Customer Name</TableCell>
                      <TableCell align="right">Outstanding Weight (kg)</TableCell>
                      <TableCell align="right">Amount Due (Rs.)</TableCell>
                      <TableCell align="center">Status</TableCell>
                      <TableCell align="center">Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {customerList.map((c) => {
                      const existing = (openings.ProcessingCustomer || []).find((o) => String(o.referenceId) === String(c._id));
                      return (
                        <ProcessingRowItem
                          key={c._id}
                          customer={c}
                          existing={existing}
                          onSave={handleSaveOpening}
                          onDelete={handleDeleteOpening}
                        />
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}

          {/* TAB 8: READY STOCK */}
          {activeTab === 8 && (
            <Box>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                Finished Wire Ready Stock Opening
              </Typography>
              <Card variant="outlined" sx={{ p: 2, mb: 3, bgcolor: '#FAFAFA', maxWidth: 600 }}>
                <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                  Add Ready Stock Entry
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={4}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Wire Number</InputLabel>
                      <Select
                        label="Wire Number"
                        value={readyStockForm.wireNumber}
                        onChange={(e) => setReadyStockForm((f) => ({ ...f, wireNumber: e.target.value }))}
                      >
                        {WIRE_NUMBERS.map((wn) => (
                          <MenuItem key={wn} value={wn}>Wire #{wn}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={6} sm={4}>
                    <TextField
                      fullWidth
                      size="small"
                      type="number"
                      label="Weight (kg)"
                      value={readyStockForm.weightKg}
                      onChange={(e) => setReadyStockForm((f) => ({ ...f, weightKg: e.target.value }))}
                      required
                    />
                  </Grid>
                  <Grid item xs={6} sm={4}>
                    <TextField
                      fullWidth
                      size="small"
                      type="number"
                      label="Rate / kg (opt)"
                      value={readyStockForm.ratePerKg}
                      onChange={(e) => setReadyStockForm((f) => ({ ...f, ratePerKg: e.target.value }))}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <Button
                      variant="contained"
                      onClick={() => {
                        const w = Number(readyStockForm.weightKg);
                        if (!w) return;
                        handleSaveOpening({
                          section: 'ReadyStock',
                          wireNumber: Number(readyStockForm.wireNumber),
                          wireWeightKg: w,
                          wireRatePerKg: Number(readyStockForm.ratePerKg) || 0,
                        });
                        setReadyStockForm({ wireNumber: 1, weightKg: '', ratePerKg: '' });
                      }}
                    >
                      Save Wire Stock
                    </Button>
                  </Grid>
                </Grid>
              </Card>

              {/* Table */}
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'grey.100' }}>
                      <TableCell>Wire Number</TableCell>
                      <TableCell align="right">Weight (kg)</TableCell>
                      <TableCell align="right">Rate / kg</TableCell>
                      <TableCell align="right">Estimated Value</TableCell>
                      <TableCell align="center">Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(openings.ReadyStock || []).length === 0 ? (
                      <TableRow><TableCell colSpan={5} align="center">No Ready Stock recorded.</TableCell></TableRow>
                    ) : (
                      (openings.ReadyStock || []).map((rs) => (
                        <TableRow key={rs._id}>
                          <TableCell>Wire #{rs.wireNumber}</TableCell>
                          <TableCell align="right">{rs.wireWeightKg} kg</TableCell>
                          <TableCell align="right">{formatCurrency(rs.wireRatePerKg || 0)}</TableCell>
                          <TableCell align="right">{formatCurrency((rs.wireWeightKg || 0) * (rs.wireRatePerKg || 0))}</TableCell>
                          <TableCell align="center">
                            <IconButton size="small" color="error" onClick={() => handleDeleteOpening(rs._id)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
              <Typography variant="subtitle2" sx={{ mt: 1.5, fontWeight: 700 }}>
                Total Ready Stock: {(openings.ReadyStock || []).reduce((s, r) => s + (r.wireWeightKg || 0), 0)} kg
              </Typography>
            </Box>
          )}

          {/* TAB 9: CHEQUES */}
          {activeTab === 9 && (
            <Box>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                Outstanding Cheques
              </Typography>
              <Card variant="outlined" sx={{ p: 2, mb: 3, bgcolor: '#FAFAFA' }}>
                <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                  Add Outstanding Cheque
                </Typography>
                <Grid container spacing={1.5}>
                  <Grid item xs={12} sm={2}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Type</InputLabel>
                      <Select
                        label="Type"
                        value={chequeForm.chequeType}
                        onChange={(e) => setChequeForm((f) => ({ ...f, chequeType: e.target.value }))}
                      >
                        <MenuItem value="Receivable">Receivable (Money In)</MenuItem>
                        <MenuItem value="Payable">Payable (Money Out)</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={3}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Party Name"
                      value={chequeForm.partyName}
                      onChange={(e) => setChequeForm((f) => ({ ...f, partyName: e.target.value }))}
                    />
                  </Grid>
                  <Grid item xs={6} sm={2}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Cheque Number"
                      value={chequeForm.chequeNumber}
                      onChange={(e) => setChequeForm((f) => ({ ...f, chequeNumber: e.target.value }))}
                    />
                  </Grid>
                  <Grid item xs={6} sm={2}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Bank Name"
                      value={chequeForm.bankName}
                      onChange={(e) => setChequeForm((f) => ({ ...f, bankName: e.target.value }))}
                    />
                  </Grid>
                  <Grid item xs={6} sm={1.5}>
                    <TextField
                      fullWidth
                      size="small"
                      type="number"
                      label="Amount"
                      value={chequeForm.amount}
                      onChange={(e) => setChequeForm((f) => ({ ...f, amount: e.target.value }))}
                    />
                  </Grid>
                  <Grid item xs={6} sm={1.5}>
                    <TextField
                      fullWidth
                      size="small"
                      type="date"
                      label="Due Date"
                      value={chequeForm.dueDate}
                      onChange={(e) => setChequeForm((f) => ({ ...f, dueDate: e.target.value }))}
                      InputLabelProps={{ shrink: true }}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <Button
                      variant="contained"
                      onClick={() => {
                        const a = Number(chequeForm.amount);
                        if (!a || !chequeForm.partyName) return;
                        handleSaveOpening({
                          section: 'Cheque',
                          chequeType: chequeForm.chequeType,
                          chequePartyName: chequeForm.partyName,
                          chequeNumber: chequeForm.chequeNumber,
                          chequeBankName: chequeForm.bankName,
                          chequeAmount: a,
                          chequeDueDate: chequeForm.dueDate,
                        });
                        setChequeForm({
                          chequeType: 'Receivable',
                          partyName: '',
                          chequeNumber: '',
                          bankName: '',
                          amount: '',
                          dueDate: todayStr,
                        });
                      }}
                    >
                      Save Cheque
                    </Button>
                  </Grid>
                </Grid>
              </Card>

              {/* Cheque list */}
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'grey.100' }}>
                      <TableCell>Type</TableCell>
                      <TableCell>Party Name</TableCell>
                      <TableCell>Cheque #</TableCell>
                      <TableCell>Bank</TableCell>
                      <TableCell align="right">Amount</TableCell>
                      <TableCell>Due Date</TableCell>
                      <TableCell align="center">Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(openings.Cheque || []).length === 0 ? (
                      <TableRow><TableCell colSpan={7} align="center">No outstanding cheques recorded.</TableCell></TableRow>
                    ) : (
                      (openings.Cheque || []).map((ch) => (
                        <TableRow key={ch._id}>
                          <TableCell>
                            <Chip
                              label={ch.chequeType}
                              size="small"
                              color={ch.chequeType === 'Receivable' ? 'success' : 'error'}
                            />
                          </TableCell>
                          <TableCell>{ch.chequePartyName}</TableCell>
                          <TableCell>{ch.chequeNumber}</TableCell>
                          <TableCell>{ch.chequeBankName}</TableCell>
                          <TableCell align="right">{formatCurrency(ch.chequeAmount)}</TableCell>
                          <TableCell>{formatDate(ch.chequeDueDate)}</TableCell>
                          <TableCell align="center">
                            <IconButton size="small" color="error" onClick={() => handleDeleteOpening(ch._id)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}

          {/* TAB 10: PERSONAL PAYMENTS */}
          {activeTab === 10 && (
            <Box>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                Personal Payments (Committees / Investments / Loans)
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                These are carried forward as personal receivables or funds contributed to date.
              </Typography>

              <Grid container spacing={2}>
                {personalPaymentCategories.map((cat) => {
                  const existing = (openings.PersonalPayment || []).find(
                    (o) => String(o.referenceId) === String(cat._id) || o.personalCategoryName === cat.categoryName
                  );
                  return (
                    <PersonalPaymentCardItem
                      key={cat._id}
                      category={cat}
                      existing={existing}
                      onSave={handleSaveOpening}
                      onDelete={handleDeleteOpening}
                    />
                  );
                })}
              </Grid>
            </Box>
          )}
        </Card>
      )}

      {/* Snackbar feedback */}
      <Snackbar
        open={snack.open}
        autoHideDuration={4000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
      >
        <Alert severity={snack.severity}>{snack.message}</Alert>
      </Snackbar>
    </Box>
  );
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENTS FOR CLEAN ROW / CARD RENDERING
// ─────────────────────────────────────────────────────────────

function CustomerRowItem({ customer, existing, onSave, onDelete }) {
  const [bType, setBType] = useState(existing?.balanceType || 'none');
  const [amount, setAmount] = useState(existing?.balanceAmount ?? '');

  useEffect(() => {
    if (existing) {
      setBType(existing.balanceType || 'none');
      setAmount(existing.balanceAmount ?? '');
    }
  }, [existing]);

  const handleSave = () => {
    onSave({
      section: 'Customer',
      referenceId: customer._id,
      referenceName: customer.name,
      balanceType: bType,
      balanceAmount: Number(amount) || 0,
    });
  };

  return (
    <TableRow>
      <TableCell>
        <Typography variant="body2" fontWeight={600}>{customer.name}</Typography>
      </TableCell>
      <TableCell>
        <Chip label={customer.customerType || 'Ledger'} size="small" variant="outlined" />
      </TableCell>
      <TableCell>
        <ToggleButtonGroup
          size="small"
          value={bType}
          exclusive
          onChange={(_, val) => val && setBType(val)}
        >
          <ToggleButton value="debit" color="success">Debit (Owes Us)</ToggleButton>
          <ToggleButton value="credit" color="error">Credit (We Owe)</ToggleButton>
          <ToggleButton value="none">None</ToggleButton>
        </ToggleButtonGroup>
      </TableCell>
      <TableCell align="right" sx={{ width: 160 }}>
        <TextField
          size="small"
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          disabled={bType === 'none'}
        />
      </TableCell>
      <TableCell align="center">
        {existing ? <Chip label="Saved" size="small" color="success" /> : <Typography variant="caption" color="text.secondary">Not Entered</Typography>}
      </TableCell>
      <TableCell align="center">
        <Button size="small" variant="contained" onClick={handleSave}>
          Save
        </Button>
      </TableCell>
    </TableRow>
  );
}

function SupplierRowItem({ supplier, existing, onSave, onDelete }) {
  const [bType, setBType] = useState(existing?.balanceType || 'none');
  const [amount, setAmount] = useState(existing?.balanceAmount ?? '');

  useEffect(() => {
    if (existing) {
      setBType(existing.balanceType || 'none');
      setAmount(existing.balanceAmount ?? '');
    }
  }, [existing]);

  const handleSave = () => {
    onSave({
      section: 'Supplier',
      referenceId: supplier._id,
      referenceName: supplier.name,
      balanceType: bType,
      balanceAmount: Number(amount) || 0,
    });
  };

  return (
    <TableRow>
      <TableCell>
        <Typography variant="body2" fontWeight={600}>{supplier.name}</Typography>
      </TableCell>
      <TableCell>
        <Typography variant="caption" color="text.secondary">{supplier.companyName || '-'}</Typography>
      </TableCell>
      <TableCell>
        <ToggleButtonGroup
          size="small"
          value={bType}
          exclusive
          onChange={(_, val) => val && setBType(val)}
        >
          <ToggleButton value="credit" color="error">Credit (We Owe)</ToggleButton>
          <ToggleButton value="debit" color="success">Debit (Advance)</ToggleButton>
          <ToggleButton value="none">None</ToggleButton>
        </ToggleButtonGroup>
      </TableCell>
      <TableCell align="right" sx={{ width: 160 }}>
        <TextField
          size="small"
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          disabled={bType === 'none'}
        />
      </TableCell>
      <TableCell align="center">
        {existing ? <Chip label="Saved" size="small" color="success" /> : <Typography variant="caption" color="text.secondary">Not Entered</Typography>}
      </TableCell>
      <TableCell align="center">
        <Button size="small" variant="contained" onClick={handleSave}>
          Save
        </Button>
      </TableCell>
    </TableRow>
  );
}

function ProcessingRowItem({ customer, existing, onSave, onDelete }) {
  const [weight, setWeight] = useState(existing?.processingWeightKg ?? '');
  const [amountDue, setAmountDue] = useState(existing?.processingAmountDue ?? '');

  useEffect(() => {
    if (existing) {
      setWeight(existing.processingWeightKg ?? '');
      setAmountDue(existing.processingAmountDue ?? '');
    }
  }, [existing]);

  const handleSave = () => {
    onSave({
      section: 'ProcessingCustomer',
      referenceId: customer._id,
      referenceName: customer.name,
      processingWeightKg: Number(weight) || 0,
      processingAmountDue: Number(amountDue) || 0,
    });
  };

  return (
    <TableRow>
      <TableCell>
        <Typography variant="body2" fontWeight={600}>{customer.name}</Typography>
      </TableCell>
      <TableCell align="right" sx={{ width: 160 }}>
        <TextField
          size="small"
          type="number"
          placeholder="Weight (kg)"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
        />
      </TableCell>
      <TableCell align="right" sx={{ width: 160 }}>
        <TextField
          size="small"
          type="number"
          placeholder="Amount Due"
          value={amountDue}
          onChange={(e) => setAmountDue(e.target.value)}
        />
      </TableCell>
      <TableCell align="center">
        {existing ? <Chip label="Saved" size="small" color="success" /> : <Typography variant="caption" color="text.secondary">Not Entered</Typography>}
      </TableCell>
      <TableCell align="center">
        <Button size="small" variant="contained" onClick={handleSave}>
          Save
        </Button>
      </TableCell>
    </TableRow>
  );
}

function PersonalPaymentCardItem({ category, existing, onSave, onDelete }) {
  const [contributed, setContributed] = useState(existing?.personalAmountContributed ?? (category.totalContributed || ''));
  const [expected, setExpected] = useState(existing?.personalExpectedLumpSum ?? (category.expectedLumpSum || ''));

  const handleSave = () => {
    onSave({
      section: 'PersonalPayment',
      referenceId: category._id,
      personalCategoryName: category.categoryName,
      personalAmountContributed: Number(contributed) || 0,
      personalExpectedLumpSum: Number(expected) || 0,
    });
  };

  return (
    <Grid item xs={12} sm={6} md={4}>
      <Card variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" fontWeight={700} gutterBottom>
          {category.categoryName}
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
          Type: {category.categoryType} &bull; Direction: {category.paymentDirection || 'Receivable'}
        </Typography>
        <Stack spacing={1.5}>
          <TextField
            size="small"
            type="number"
            label="Amount Contributed So Far"
            value={contributed}
            onChange={(e) => setContributed(e.target.value)}
          />
          <TextField
            size="small"
            type="number"
            label="Expected Lump Sum"
            value={expected}
            onChange={(e) => setExpected(e.target.value)}
          />
          <Box display="flex" justifyContent="space-between" alignItems="center">
            {existing && <Chip label="Saved" size="small" color="success" />}
            <Button size="small" variant="contained" onClick={handleSave}>
              Save
            </Button>
          </Box>
        </Stack>
      </Card>
    </Grid>
  );
}
