import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Button,
  Paper,
  Typography,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Tabs,
  Tab,
  Chip,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Snackbar,
  CircularProgress,
  Divider,
  IconButton,
  Tooltip,
  Stack,
  Card,
  CardContent,
  Grid,
  InputAdornment,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import PaymentIcon from '@mui/icons-material/Payment';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import SearchIcon from '@mui/icons-material/Search';
import HowToVoteIcon from '@mui/icons-material/HowToVote';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';

import { chequesAPI, customersAPI, suppliersAPI, workersAPI } from '../services/api';
import { formatCurrency, formatDate } from '../utils/formatters';
import ConfirmDialog from '../components/Common/ConfirmDialog';
import AccessDeniedSnackbar from '../components/Common/AccessDeniedSnackbar';
import ResponsiveDialog from '../components/Common/ResponsiveDialog';
import PageToolbar from '../components/Common/PageToolbar';
import { usePermissions } from '../hooks/usePermissions';
import { useIsMobile } from '../hooks/useBreakpoint';

const BANK_SUGGESTIONS = ['MBL', 'UBL', 'Faisal Bank', 'HBL', 'MCB', 'Allied Bank', 'Bank Alfalah', 'Askari Bank', 'Standard Chartered', 'Other'];
const OUR_BANKS = ['MBL', 'UBL', 'Faisal Bank', 'Other'];

const STATUS_COLORS = {
  'In Hand': 'primary',
  'Deposited': 'success',
  'Endorsed': 'warning',
  'Issued': 'info',
  'Cleared': 'success',
  'Bounced': 'error',
  'Returned': 'default',
  'Cancelled': 'default',
};

const defaultReceiveForm = {
  chequeNumber: '',
  bankName: 'MBL',
  bankNameOther: '',
  amount: '',
  chequeDate: new Date().toISOString().slice(0, 10),
  receivedDate: new Date().toISOString().slice(0, 10),
  partyType: 'Customer',
  customerId: '',
  partyName: '',
  notes: '',
  handledBy: '',
};

const defaultIssueForm = {
  chequeType: 'Company Cheque',
  chequeNumber: '',
  bankName: 'MBL',
  bankNameOther: '',
  amount: '',
  chequeDate: new Date().toISOString().slice(0, 10),
  issueDate: new Date().toISOString().slice(0, 10),
  recipientType: 'Supplier',
  supplierId: '',
  workerId: '',
  partyName: '',
  notes: '',
  handledBy: '',
};

export default function Cheques() {
  const { isViewer } = usePermissions();
  const isMobile = useIsMobile();
  const [accessDenied, setAccessDenied] = useState(false);

  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [cheques, setCheques] = useState([]);
  const [summary, setSummary] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [workers, setWorkers] = useState([]);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Dialogs
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false);
  const [issueDialogOpen, setIssueDialogOpen] = useState(false);
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [endorseDialogOpen, setEndorseDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // Selected item for actions
  const [activeCheque, setActiveCheque] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, id: null, chequeNumber: '' });
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' });

  // Form states
  const [receiveForm, setReceiveForm] = useState(defaultReceiveForm);
  const [issueForm, setIssueForm] = useState(defaultIssueForm);
  const [depositForm, setDepositForm] = useState({ bankAccount: 'MBL', bankAccountOtherName: '', depositDate: new Date().toISOString().slice(0, 10), notes: '' });
  const [endorseForm, setEndorseForm] = useState({ recipientType: 'Supplier', supplierId: '', partyName: '', endorsedDate: new Date().toISOString().slice(0, 10), notes: '' });
  const [statusForm, setStatusForm] = useState({ status: 'Cleared', notes: '' });
  const [editForm, setEditForm] = useState({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (searchQuery) params.search = searchQuery;

      const [listRes, sumRes, custRes, supRes, workRes] = await Promise.all([
        chequesAPI.getAll(params),
        chequesAPI.getSummary({ startDate, endDate }),
        customersAPI.getAll(),
        suppliersAPI.getAll(),
        workersAPI.getAll(),
      ]);

      setCheques(listRes.data.data || []);
      setSummary(sumRes.data.data || null);
      setCustomers(custRes.data.data || []);
      setSuppliers(supRes.data.data || []);
      setWorkers(workRes.data.data || []);
    } catch {
      setSnack({ open: true, message: 'Failed to load cheques data', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, startDate, endDate, searchQuery]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filtered lists for each tab
  const inHandCheques = useMemo(() => {
    return cheques.filter((c) => c.direction === 'Received' && c.status === 'In Hand');
  }, [cheques]);

  const allReceivedCheques = useMemo(() => {
    return cheques.filter((c) => c.direction === 'Received');
  }, [cheques]);

  const issuedCheques = useMemo(() => {
    return cheques.filter((c) => c.direction === 'Issued');
  }, [cheques]);

  const endorsedCheques = useMemo(() => {
    return cheques.filter((c) => c.status === 'Endorsed');
  }, [cheques]);

  // Handlers for Receive Cheque
  const handleOpenReceive = () => {
    if (isViewer) { setAccessDenied(true); return; }
    setReceiveForm({
      ...defaultReceiveForm,
      chequeDate: new Date().toISOString().slice(0, 10),
      receivedDate: new Date().toISOString().slice(0, 10),
    });
    setReceiveDialogOpen(true);
  };

  const handleSaveReceive = async () => {
    if (!receiveForm.chequeNumber.trim()) {
      setSnack({ open: true, message: 'Cheque number is required', severity: 'error' });
      return;
    }
    const amt = Number(receiveForm.amount);
    if (!amt || amt <= 0) {
      setSnack({ open: true, message: 'Valid amount is required', severity: 'error' });
      return;
    }
    const bank = receiveForm.bankName === 'Other' ? receiveForm.bankNameOther.trim() : receiveForm.bankName;
    if (!bank) {
      setSnack({ open: true, message: 'Bank name is required', severity: 'error' });
      return;
    }

    let pName = receiveForm.partyName.trim();
    let pId = undefined;
    if (receiveForm.partyType === 'Customer' && receiveForm.customerId) {
      const cust = customers.find((c) => String(c._id) === String(receiveForm.customerId));
      if (cust) {
        pName = cust.name;
        pId = cust._id;
      }
    }

    try {
      await chequesAPI.create({
        chequeNumber: receiveForm.chequeNumber.trim(),
        chequeType: 'Customer Cheque',
        direction: 'Received',
        bankName: bank,
        amount: amt,
        chequeDate: receiveForm.chequeDate,
        receivedDate: receiveForm.receivedDate,
        status: 'In Hand',
        receivedFrom: {
          partyType: receiveForm.partyType,
          partyId: pId,
          partyName: pName || 'Customer',
        },
        notes: receiveForm.notes,
        handledBy: receiveForm.handledBy,
      });

      setReceiveDialogOpen(false);
      setSnack({ open: true, message: `Customer Cheque #${receiveForm.chequeNumber} recorded in hand`, severity: 'success' });
      fetchData();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Failed to save cheque', severity: 'error' });
    }
  };

  // Handlers for Issue Cheque
  const handleOpenIssue = () => {
    if (isViewer) { setAccessDenied(true); return; }
    setIssueForm({
      ...defaultIssueForm,
      chequeDate: new Date().toISOString().slice(0, 10),
      issueDate: new Date().toISOString().slice(0, 10),
    });
    setIssueDialogOpen(true);
  };

  const handleSaveIssue = async () => {
    if (!issueForm.chequeNumber.trim()) {
      setSnack({ open: true, message: 'Cheque number is required', severity: 'error' });
      return;
    }
    const amt = Number(issueForm.amount);
    if (!amt || amt <= 0) {
      setSnack({ open: true, message: 'Valid amount is required', severity: 'error' });
      return;
    }
    const bank = issueForm.bankName === 'Other' ? issueForm.bankNameOther.trim() : issueForm.bankName;
    if (!bank) {
      setSnack({ open: true, message: 'Bank name is required', severity: 'error' });
      return;
    }

    let pName = issueForm.partyName.trim();
    let pId = undefined;
    let pType = issueForm.recipientType;

    if (issueForm.recipientType === 'Supplier' && issueForm.supplierId) {
      const sup = suppliers.find((s) => String(s._id) === String(issueForm.supplierId));
      if (sup) {
        pName = sup.name;
        pId = sup._id;
      }
    } else if (issueForm.recipientType === 'Worker' && issueForm.workerId) {
      const w = workers.find((item) => String(item._id) === String(issueForm.workerId));
      if (w) {
        pName = w.name;
        pId = w._id;
      }
    }

    try {
      await chequesAPI.create({
        chequeNumber: issueForm.chequeNumber.trim(),
        chequeType: issueForm.chequeType,
        direction: 'Issued',
        bankName: bank,
        amount: amt,
        chequeDate: issueForm.chequeDate,
        issueDate: issueForm.issueDate,
        status: 'Issued',
        givenTo: {
          partyType: pType,
          partyId: pId,
          partyName: pName || 'Payee',
        },
        notes: issueForm.notes,
        handledBy: issueForm.handledBy,
      });

      setIssueDialogOpen(false);
      setSnack({ open: true, message: `${issueForm.chequeType} #${issueForm.chequeNumber} issued successfully`, severity: 'success' });
      fetchData();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Failed to issue cheque', severity: 'error' });
    }
  };

  // Handlers for Deposit Cheque
  const handleOpenDeposit = (cheque) => {
    if (isViewer) { setAccessDenied(true); return; }
    setActiveCheque(cheque);
    setDepositForm({
      bankAccount: 'MBL',
      bankAccountOtherName: '',
      depositDate: new Date().toISOString().slice(0, 10),
      notes: '',
    });
    setDepositDialogOpen(true);
  };

  const handleSaveDeposit = async () => {
    if (!activeCheque) return;
    if (depositForm.bankAccount === 'Other' && !depositForm.bankAccountOtherName.trim()) {
      setSnack({ open: true, message: 'Please write the bank name for Other', severity: 'error' });
      return;
    }

    try {
      await chequesAPI.deposit(activeCheque._id, {
        bankAccount: depositForm.bankAccount,
        bankAccountOtherName: depositForm.bankAccountOtherName.trim(),
        depositDate: depositForm.depositDate,
        notes: depositForm.notes,
      });

      setDepositDialogOpen(false);
      setSnack({
        open: true,
        message: `Cheque #${activeCheque.chequeNumber} deposited to ${depositForm.bankAccount === 'Other' ? depositForm.bankAccountOtherName : depositForm.bankAccount}`,
        severity: 'success',
      });
      fetchData();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Failed to deposit cheque', severity: 'error' });
    }
  };

  // Handlers for Endorse Cheque
  const handleOpenEndorse = (cheque) => {
    if (isViewer) { setAccessDenied(true); return; }
    setActiveCheque(cheque);
    setEndorseForm({
      recipientType: 'Supplier',
      supplierId: '',
      partyName: '',
      endorsedDate: new Date().toISOString().slice(0, 10),
      notes: '',
    });
    setEndorseDialogOpen(true);
  };

  const handleSaveEndorse = async () => {
    if (!activeCheque) return;
    let pName = endorseForm.partyName.trim();
    let pId = undefined;

    if (endorseForm.recipientType === 'Supplier' && endorseForm.supplierId) {
      const sup = suppliers.find((s) => String(s._id) === String(endorseForm.supplierId));
      if (sup) {
        pName = sup.name;
        pId = sup._id;
      }
    }

    if (!pName) {
      setSnack({ open: true, message: 'Please select or enter the recipient name', severity: 'error' });
      return;
    }

    try {
      await chequesAPI.endorse(activeCheque._id, {
        givenTo: {
          partyType: endorseForm.recipientType,
          partyId: pId,
          partyName: pName,
        },
        endorsedDate: endorseForm.endorsedDate,
        notes: endorseForm.notes,
      });

      setEndorseDialogOpen(false);
      setSnack({ open: true, message: `Cheque #${activeCheque.chequeNumber} endorsed to ${pName}`, severity: 'success' });
      fetchData();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Failed to endorse cheque', severity: 'error' });
    }
  };

  // Status Change Dialog
  const handleOpenStatus = (cheque) => {
    if (isViewer) { setAccessDenied(true); return; }
    setActiveCheque(cheque);
    setStatusForm({
      status: cheque.status === 'Issued' ? 'Cleared' : (cheque.status === 'In Hand' ? 'Bounced' : cheque.status),
      notes: '',
    });
    setStatusDialogOpen(true);
  };

  const handleSaveStatus = async () => {
    if (!activeCheque) return;
    try {
      await chequesAPI.updateStatus(activeCheque._id, {
        status: statusForm.status,
        notes: statusForm.notes,
      });
      setStatusDialogOpen(false);
      setSnack({ open: true, message: `Cheque #${activeCheque.chequeNumber} status updated to ${statusForm.status}`, severity: 'success' });
      fetchData();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Failed to update status', severity: 'error' });
    }
  };

  // Edit Cheque Dialog
  const handleOpenEdit = (cheque) => {
    if (isViewer) { setAccessDenied(true); return; }
    setActiveCheque(cheque);
    setEditForm({
      chequeNumber: cheque.chequeNumber,
      bankName: cheque.bankName,
      amount: String(cheque.amount),
      chequeDate: cheque.chequeDate ? new Date(cheque.chequeDate).toISOString().slice(0, 10) : '',
      chequeType: cheque.chequeType,
      status: cheque.status,
      partyName: cheque.direction === 'Received' ? (cheque.receivedFrom?.partyName || '') : (cheque.givenTo?.partyName || ''),
      notes: cheque.notes || '',
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!activeCheque) return;
    try {
      const amt = Number(editForm.amount);
      if (!amt || amt <= 0) {
        setSnack({ open: true, message: 'Valid amount is required', severity: 'error' });
        return;
      }

      await chequesAPI.update(activeCheque._id, {
        chequeNumber: editForm.chequeNumber,
        bankName: editForm.bankName,
        amount: amt,
        chequeDate: editForm.chequeDate,
        chequeType: editForm.chequeType,
        status: editForm.status,
        notes: editForm.notes,
      });

      setEditDialogOpen(false);
      setSnack({ open: true, message: 'Cheque updated successfully', severity: 'success' });
      fetchData();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Failed to update cheque', severity: 'error' });
    }
  };

  // Delete Cheque
  const handleDelete = async () => {
    if (!deleteConfirm.id) return;
    try {
      await chequesAPI.delete(deleteConfirm.id);
      setDeleteConfirm({ open: false, id: null, chequeNumber: '' });
      setSnack({ open: true, message: 'Cheque deleted successfully', severity: 'success' });
      fetchData();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Failed to delete cheque', severity: 'error' });
    }
  };

  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 }, maxWidth: 1400, mx: 'auto' }}>
      <PageToolbar
        title="Cheque Management"
        subtitle="Maintain customer cheques in hand, endorsed cheques, and company/personal issued cheques"
        actions={
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <Button
              variant="contained"
              color="primary"
              startIcon={<AddIcon />}
              onClick={handleOpenReceive}
              sx={{ fontWeight: 600, textTransform: 'none', px: 2.5 }}
            >
              Receive Customer Cheque
            </Button>
            <Button
              variant="outlined"
              color="secondary"
              startIcon={<PaymentIcon />}
              onClick={handleOpenIssue}
              sx={{ fontWeight: 600, textTransform: 'none', px: 2 }}
            >
              Issue Cheque (Our Cheque)
            </Button>
          </Stack>
        }
      />

      {/* KPI Metrics Banner */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {/* Card 1: Customer Cheques In Hand */}
        <Grid item xs={12} sm={6} md={3}>
          <Card
            sx={{
              p: 2,
              borderRadius: 3,
              background: 'linear-gradient(135deg, rgba(25, 118, 210, 0.15), rgba(25, 118, 210, 0.04))',
              border: '1px solid rgba(25, 118, 210, 0.3)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
            }}
          >
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Cheques In Hand
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 800, color: 'primary.main', mt: 0.5 }}>
                  {formatCurrency(summary?.inHand?.totalAmount ?? 0)}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                  {summary?.inHand?.count ?? 0} active customer cheque{summary?.inHand?.count === 1 ? '' : 's'}
                </Typography>
              </Box>
              <Box sx={{ p: 1.5, borderRadius: 2.5, bgcolor: 'primary.main', color: 'white', display: 'flex' }}>
                <AccountBalanceWalletIcon fontSize="medium" />
              </Box>
            </Stack>
          </Card>
        </Grid>

        {/* Card 2: Total Received Till Now */}
        <Grid item xs={12} sm={6} md={3}>
          <Card
            sx={{
              p: 2,
              borderRadius: 3,
              background: 'linear-gradient(135deg, rgba(46, 125, 50, 0.15), rgba(46, 125, 50, 0.04))',
              border: '1px solid rgba(46, 125, 50, 0.3)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
            }}
          >
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Total Received
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 800, color: 'success.main', mt: 0.5 }}>
                  {formatCurrency(summary?.received?.totalAmount ?? 0)}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                  {summary?.received?.count ?? 0} cheques received from customers
                </Typography>
              </Box>
              <Box sx={{ p: 1.5, borderRadius: 2.5, bgcolor: 'success.main', color: 'white', display: 'flex' }}>
                <TrendingUpIcon fontSize="medium" />
              </Box>
            </Stack>
          </Card>
        </Grid>

        {/* Card 3: Endorsed / Passed to Suppliers */}
        <Grid item xs={12} sm={6} md={3}>
          <Card
            sx={{
              p: 2,
              borderRadius: 3,
              background: 'linear-gradient(135deg, rgba(237, 108, 2, 0.15), rgba(237, 108, 2, 0.04))',
              border: '1px solid rgba(237, 108, 2, 0.3)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
            }}
          >
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Passed to Suppliers
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 800, color: 'warning.main', mt: 0.5 }}>
                  {formatCurrency(summary?.endorsed?.totalAmount ?? 0)}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                  {summary?.endorsed?.count ?? 0} customer cheques endorsed
                </Typography>
              </Box>
              <Box sx={{ p: 1.5, borderRadius: 2.5, bgcolor: 'warning.main', color: 'white', display: 'flex' }}>
                <SwapHorizIcon fontSize="medium" />
              </Box>
            </Stack>
          </Card>
        </Grid>

        {/* Card 4: Our Issued Cheques */}
        <Grid item xs={12} sm={6} md={3}>
          <Card
            sx={{
              p: 2,
              borderRadius: 3,
              background: 'linear-gradient(135deg, rgba(156, 39, 176, 0.15), rgba(156, 39, 176, 0.04))',
              border: '1px solid rgba(156, 39, 176, 0.3)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
            }}
          >
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Our Issued Cheques
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 800, color: 'secondary.main', mt: 0.5 }}>
                  {formatCurrency(summary?.issuedTotal?.totalAmount ?? 0)}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                  {summary?.issuedCompany?.count ?? 0} Company · {summary?.issuedPersonal?.count ?? 0} Personal
                </Typography>
              </Box>
              <Box sx={{ p: 1.5, borderRadius: 2.5, bgcolor: 'secondary.main', color: 'white', display: 'flex' }}>
                <PaymentIcon fontSize="medium" />
              </Box>
            </Stack>
          </Card>
        </Grid>
      </Grid>

      {/* Main Panel */}
      <Paper sx={{ borderRadius: 3, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
        {/* Search & Filters */}
        <Box sx={{ p: 2, borderBottom: '1px solid rgba(255,255,255,0.08)', bgcolor: 'background.paper' }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={4} md={4}>
              <TextField
                fullWidth
                size="small"
                placeholder="Search Cheque #, Bank, Customer, Supplier..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
            <Grid item xs={6} sm={4} md={2.5}>
              <FormControl fullWidth size="small">
                <InputLabel>Status</InputLabel>
                <Select
                  value={statusFilter}
                  label="Status"
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <MenuItem value="">All Statuses</MenuItem>
                  <MenuItem value="In Hand">In Hand</MenuItem>
                  <MenuItem value="Deposited">Deposited</MenuItem>
                  <MenuItem value="Endorsed">Endorsed</MenuItem>
                  <MenuItem value="Issued">Issued</MenuItem>
                  <MenuItem value="Cleared">Cleared</MenuItem>
                  <MenuItem value="Bounced">Bounced</MenuItem>
                  <MenuItem value="Returned">Returned</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} sm={2} md={2.5}>
              <TextField
                fullWidth
                size="small"
                type="date"
                label="From Date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={6} sm={2} md={2.5}>
              <TextField
                fullWidth
                size="small"
                type="date"
                label="To Date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            {(searchQuery || statusFilter || startDate || endDate) && (
              <Grid item xs={6} sm={12} md={0.5}>
                <Button
                  size="small"
                  onClick={() => { setSearchQuery(''); setStatusFilter(''); setStartDate(''); setEndDate(''); }}
                  sx={{ textTransform: 'none' }}
                >
                  Clear
                </Button>
              </Grid>
            )}
          </Grid>
        </Box>

        {/* Navigation Tabs */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
          <Tabs
            value={tab}
            onChange={(_, val) => setTab(val)}
            variant={isMobile ? 'scrollable' : 'standard'}
            scrollButtons="auto"
          >
            <Tab
              label={
                <Stack direction="row" spacing={1} alignItems="center">
                  <span>In-Hand Cheques</span>
                  <Chip
                    size="small"
                    label={inHandCheques.length}
                    color="primary"
                    sx={{ height: 20, fontSize: '0.75rem', fontWeight: 700 }}
                  />
                </Stack>
              }
            />
            <Tab
              label={
                <Stack direction="row" spacing={1} alignItems="center">
                  <span>Customer Cheques (All)</span>
                  <Chip
                    size="small"
                    label={allReceivedCheques.length}
                    variant="outlined"
                    sx={{ height: 20, fontSize: '0.75rem' }}
                  />
                </Stack>
              }
            />
            <Tab
              label={
                <Stack direction="row" spacing={1} alignItems="center">
                  <span>Our Issued Cheques</span>
                  <Chip
                    size="small"
                    label={issuedCheques.length}
                    variant="outlined"
                    sx={{ height: 20, fontSize: '0.75rem' }}
                  />
                </Stack>
              }
            />
            <Tab
              label={
                <Stack direction="row" spacing={1} alignItems="center">
                  <span>Endorsed / Transferred</span>
                  <Chip
                    size="small"
                    label={endorsedCheques.length}
                    variant="outlined"
                    sx={{ height: 20, fontSize: '0.75rem' }}
                  />
                </Stack>
              }
            />
          </Tabs>
        </Box>

        {/* Table Content */}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
            <CircularProgress />
          </Box>
        ) : (
          <TableContainer>
            <Table size={isMobile ? 'small' : 'medium'}>
              <TableHead sx={{ bgcolor: 'rgba(255,255,255,0.03)' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Cheque #</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Bank</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Amount</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>
                    {tab === 2 ? 'Issued To' : (tab === 3 ? 'Endorsement Route' : 'Customer / Party')}
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Cheque Date</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Type / Category</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {/* Select list based on active tab */}
                {(tab === 0 ? inHandCheques : (tab === 1 ? allReceivedCheques : (tab === 2 ? issuedCheques : endorsedCheques))).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                      <Typography variant="body1" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                        No cheques found in this view.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  (tab === 0 ? inHandCheques : (tab === 1 ? allReceivedCheques : (tab === 2 ? issuedCheques : endorsedCheques))).map((row) => (
                    <TableRow key={row._id} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                      {/* Cheque # */}
                      <TableCell sx={{ fontWeight: 700, color: 'primary.light' }}>
                        {row.chequeNumber}
                      </TableCell>

                      {/* Bank */}
                      <TableCell>
                        <Chip
                          size="small"
                          label={row.bankName}
                          variant="outlined"
                          sx={{ fontWeight: 600, fontSize: '0.8rem' }}
                        />
                      </TableCell>

                      {/* Amount */}
                      <TableCell sx={{ fontWeight: 700, fontSize: '1rem', color: '#E8EDF3' }}>
                        {formatCurrency(row.amount)}
                      </TableCell>

                      {/* Party */}
                      <TableCell>
                        {tab === 3 ? (
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              From: {row.receivedFrom?.partyName || 'Customer'}
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'warning.light', display: 'flex', alignItems: 'center', gap: 0.5, fontWeight: 600 }}>
                              → Given to: {row.givenTo?.partyName || 'Supplier'}
                            </Typography>
                          </Box>
                        ) : tab === 2 ? (
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {row.givenTo?.partyName || 'Payee'}
                          </Typography>
                        ) : (
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {row.receivedFrom?.partyName || 'Customer'}
                            </Typography>
                            {row.status === 'Endorsed' && (
                              <Typography variant="caption" sx={{ color: 'warning.light' }}>
                                (Passed to {row.givenTo?.partyName})
                              </Typography>
                            )}
                            {row.status === 'Deposited' && row.depositBankAccount && (
                              <Typography variant="caption" sx={{ color: 'success.light' }}>
                                (Deposited to {row.depositBankAccount})
                              </Typography>
                            )}
                          </Box>
                        )}
                      </TableCell>

                      {/* Cheque Date */}
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {row.chequeDate ? formatDate(row.chequeDate) : '-'}
                      </TableCell>

                      {/* Cheque Type */}
                      <TableCell>
                        <Typography variant="caption" sx={{ fontWeight: 600, color: row.chequeType === 'Personal Cheque' ? 'secondary.light' : 'text.secondary' }}>
                          {row.chequeType}
                        </Typography>
                      </TableCell>

                      {/* Status */}
                      <TableCell>
                        <Chip
                          size="small"
                          label={row.status}
                          color={STATUS_COLORS[row.status] || 'default'}
                          sx={{ fontWeight: 700, fontSize: '0.75rem' }}
                        />
                      </TableCell>

                      {/* Actions */}
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        <Stack direction="row" spacing={0.5} justifyContent="flex-end" alignItems="center">
                          {/* If In Hand: Quick Deposit & Quick Endorse */}
                          {row.status === 'In Hand' && (
                            <>
                              <Tooltip title="Deposit to our Bank Account">
                                <Button
                                  size="small"
                                  variant="contained"
                                  color="success"
                                  startIcon={<AccountBalanceIcon fontSize="small" />}
                                  onClick={() => handleOpenDeposit(row)}
                                  sx={{ textTransform: 'none', py: 0.3, px: 1, fontSize: '0.75rem', fontWeight: 600 }}
                                >
                                  Deposit
                                </Button>
                              </Tooltip>
                              <Tooltip title="Pass / Endorse to Supplier or Expense">
                                <Button
                                  size="small"
                                  variant="contained"
                                  color="warning"
                                  startIcon={<SwapHorizIcon fontSize="small" />}
                                  onClick={() => handleOpenEndorse(row)}
                                  sx={{ textTransform: 'none', py: 0.3, px: 1, fontSize: '0.75rem', fontWeight: 600 }}
                                >
                                  Pass / Endorse
                                </Button>
                              </Tooltip>
                            </>
                          )}

                          {/* If Issued: Mark Cleared / Bounced */}
                          {row.direction === 'Issued' && row.status === 'Issued' && (
                            <Tooltip title="Update clearance status">
                              <Button
                                size="small"
                                variant="outlined"
                                color="success"
                                startIcon={<CheckCircleIcon fontSize="small" />}
                                onClick={() => handleOpenStatus(row)}
                                sx={{ textTransform: 'none', py: 0.3, px: 1, fontSize: '0.75rem' }}
                              >
                                Clear / Status
                              </Button>
                            </Tooltip>
                          )}

                          {/* Edit */}
                          <Tooltip title="Edit Cheque">
                            <IconButton size="small" onClick={() => handleOpenEdit(row)} sx={{ color: 'primary.light' }}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>

                          {/* Delete */}
                          <Tooltip title="Delete Cheque">
                            <IconButton
                              size="small"
                              onClick={() => {
                                if (isViewer) { setAccessDenied(true); return; }
                                setDeleteConfirm({ open: true, id: row._id, chequeNumber: row.chequeNumber });
                              }}
                              sx={{ color: 'error.light' }}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* DIALOG 1: Receive Customer Cheque */}
      <ResponsiveDialog
        open={receiveDialogOpen}
        onClose={() => setReceiveDialogOpen(false)}
        title="Receive Customer Cheque"
        maxWidth="sm"
      >
        <DialogContent dividers>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Select Customer</InputLabel>
              <Select
                value={receiveForm.customerId}
                label="Select Customer"
                onChange={(e) => setReceiveForm({ ...receiveForm, customerId: e.target.value, partyType: 'Customer' })}
              >
                <MenuItem value=""><em>-- Custom / Free-Text Party --</em></MenuItem>
                {customers.map((c) => (
                  <MenuItem key={c._id} value={c._id}>
                    {c.name} {c.totalAmountDue > 0 ? `(Due: ${formatCurrency(c.totalAmountDue)})` : ''}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {!receiveForm.customerId && (
              <TextField
                fullWidth
                size="small"
                label="Customer / Party Name"
                value={receiveForm.partyName}
                onChange={(e) => setReceiveForm({ ...receiveForm, partyName: e.target.value })}
                placeholder="Enter party name"
              />
            )}

            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  size="small"
                  label="Cheque Number *"
                  value={receiveForm.chequeNumber}
                  onChange={(e) => setReceiveForm({ ...receiveForm, chequeNumber: e.target.value })}
                  placeholder="e.g. 12345678"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  label="Amount (Rs.) *"
                  value={receiveForm.amount}
                  onChange={(e) => setReceiveForm({ ...receiveForm, amount: e.target.value })}
                />
              </Grid>
            </Grid>

            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>Drawer Bank *</InputLabel>
                  <Select
                    value={receiveForm.bankName}
                    label="Drawer Bank *"
                    onChange={(e) => setReceiveForm({ ...receiveForm, bankName: e.target.value })}
                  >
                    {BANK_SUGGESTIONS.map((b) => (
                      <MenuItem key={b} value={b}>{b}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                {receiveForm.bankName === 'Other' ? (
                  <TextField
                    fullWidth
                    size="small"
                    label="Bank Name *"
                    value={receiveForm.bankNameOther}
                    onChange={(e) => setReceiveForm({ ...receiveForm, bankNameOther: e.target.value })}
                    placeholder="Enter bank name"
                  />
                ) : (
                  <TextField
                    fullWidth
                    size="small"
                    type="date"
                    label="Cheque Date (Maturity) *"
                    value={receiveForm.chequeDate}
                    onChange={(e) => setReceiveForm({ ...receiveForm, chequeDate: e.target.value })}
                    InputLabelProps={{ shrink: true }}
                  />
                )}
              </Grid>
            </Grid>

            {receiveForm.bankName === 'Other' && (
              <TextField
                fullWidth
                size="small"
                type="date"
                label="Cheque Date (Maturity) *"
                value={receiveForm.chequeDate}
                onChange={(e) => setReceiveForm({ ...receiveForm, chequeDate: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            )}

            <TextField
              fullWidth
              size="small"
              type="date"
              label="Received Date"
              value={receiveForm.receivedDate}
              onChange={(e) => setReceiveForm({ ...receiveForm, receivedDate: e.target.value })}
              InputLabelProps={{ shrink: true }}
            />

            <TextField
              fullWidth
              size="small"
              label="Notes / Description"
              value={receiveForm.notes}
              onChange={(e) => setReceiveForm({ ...receiveForm, notes: e.target.value })}
              multiline
              rows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setReceiveDialogOpen(false)} sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveReceive} sx={{ textTransform: 'none', fontWeight: 600 }}>
            Save Received Cheque
          </Button>
        </DialogActions>
      </ResponsiveDialog>

      {/* DIALOG 2: Issue Company / Personal Cheque */}
      <ResponsiveDialog
        open={issueDialogOpen}
        onClose={() => setIssueDialogOpen(false)}
        title="Issue Cheque (Our Cheque)"
        maxWidth="sm"
      >
        <DialogContent dividers>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Cheque Category</InputLabel>
              <Select
                value={issueForm.chequeType}
                label="Cheque Category"
                onChange={(e) => setIssueForm({ ...issueForm, chequeType: e.target.value })}
              >
                <MenuItem value="Company Cheque">Company Cheque (Business Bank Account)</MenuItem>
                <MenuItem value="Personal Cheque">Personal Cheque (Personal Account)</MenuItem>
              </Select>
            </FormControl>

            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>Our Bank Account *</InputLabel>
                  <Select
                    value={issueForm.bankName}
                    label="Our Bank Account *"
                    onChange={(e) => setIssueForm({ ...issueForm, bankName: e.target.value })}
                  >
                    {OUR_BANKS.map((b) => (
                      <MenuItem key={b} value={b}>{b}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                {issueForm.bankName === 'Other' ? (
                  <TextField
                    fullWidth
                    size="small"
                    label="Bank / Account Name *"
                    value={issueForm.bankNameOther}
                    onChange={(e) => setIssueForm({ ...issueForm, bankNameOther: e.target.value })}
                    placeholder="Enter account name"
                  />
                ) : (
                  <TextField
                    fullWidth
                    size="small"
                    label="Cheque Number *"
                    value={issueForm.chequeNumber}
                    onChange={(e) => setIssueForm({ ...issueForm, chequeNumber: e.target.value })}
                    placeholder="e.g. 0987654"
                  />
                )}
              </Grid>
            </Grid>

            {issueForm.bankName === 'Other' && (
              <TextField
                fullWidth
                size="small"
                label="Cheque Number *"
                value={issueForm.chequeNumber}
                onChange={(e) => setIssueForm({ ...issueForm, chequeNumber: e.target.value })}
                placeholder="e.g. 0987654"
              />
            )}

            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  label="Amount (Rs.) *"
                  value={issueForm.amount}
                  onChange={(e) => setIssueForm({ ...issueForm, amount: e.target.value })}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>Payee Type</InputLabel>
                  <Select
                    value={issueForm.recipientType}
                    label="Payee Type"
                    onChange={(e) => setIssueForm({ ...issueForm, recipientType: e.target.value })}
                  >
                    <MenuItem value="Supplier">Supplier</MenuItem>
                    <MenuItem value="Worker">Worker</MenuItem>
                    <MenuItem value="Expense">Expense / Other</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>

            {issueForm.recipientType === 'Supplier' && (
              <FormControl fullWidth size="small">
                <InputLabel>Select Supplier</InputLabel>
                <Select
                  value={issueForm.supplierId}
                  label="Select Supplier"
                  onChange={(e) => setIssueForm({ ...issueForm, supplierId: e.target.value })}
                >
                  <MenuItem value=""><em>-- Custom Payee Name --</em></MenuItem>
                  {suppliers.map((s) => (
                    <MenuItem key={s._id} value={s._id}>
                      {s.name} {s.totalAmountDue > 0 ? `(Payable: ${formatCurrency(s.totalAmountDue)})` : ''}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            {issueForm.recipientType === 'Worker' && (
              <FormControl fullWidth size="small">
                <InputLabel>Select Worker</InputLabel>
                <Select
                  value={issueForm.workerId}
                  label="Select Worker"
                  onChange={(e) => setIssueForm({ ...issueForm, workerId: e.target.value })}
                >
                  {workers.map((w) => (
                    <MenuItem key={w._id} value={w._id}>{w.name} ({w.role || 'Worker'})</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            {(!issueForm.supplierId && !issueForm.workerId) && (
              <TextField
                fullWidth
                size="small"
                label="Payee / Recipient Name"
                value={issueForm.partyName}
                onChange={(e) => setIssueForm({ ...issueForm, partyName: e.target.value })}
                placeholder="Name of person / vendor"
              />
            )}

            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  size="small"
                  type="date"
                  label="Cheque Date (Maturity)"
                  value={issueForm.chequeDate}
                  onChange={(e) => setIssueForm({ ...issueForm, chequeDate: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  size="small"
                  type="date"
                  label="Issue Date"
                  value={issueForm.issueDate}
                  onChange={(e) => setIssueForm({ ...issueForm, issueDate: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
            </Grid>

            <TextField
              fullWidth
              size="small"
              label="Notes"
              value={issueForm.notes}
              onChange={(e) => setIssueForm({ ...issueForm, notes: e.target.value })}
              multiline
              rows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setIssueDialogOpen(false)} sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button variant="contained" color="secondary" onClick={handleSaveIssue} sx={{ textTransform: 'none', fontWeight: 600 }}>
            Issue Cheque
          </Button>
        </DialogActions>
      </ResponsiveDialog>

      {/* DIALOG 3: Deposit Cheque to Bank */}
      <ResponsiveDialog
        open={depositDialogOpen}
        onClose={() => setDepositDialogOpen(false)}
        title="Deposit Customer Cheque to Bank"
        maxWidth="xs"
      >
        <DialogContent dividers>
          {activeCheque && (
            <Stack spacing={2.5} sx={{ pt: 1 }}>
              <Alert severity="info" sx={{ py: 0.5 }}>
                Depositing <strong>Cheque #{activeCheque.chequeNumber}</strong> ({activeCheque.bankName}) for <strong>{formatCurrency(activeCheque.amount)}</strong> from <strong>{activeCheque.receivedFrom?.partyName}</strong>.
              </Alert>

              <FormControl fullWidth size="small">
                <InputLabel>Deposit Into Bank Account *</InputLabel>
                <Select
                  value={depositForm.bankAccount}
                  label="Deposit Into Bank Account *"
                  onChange={(e) => setDepositForm({ ...depositForm, bankAccount: e.target.value })}
                >
                  {OUR_BANKS.map((b) => (
                    <MenuItem key={b} value={b}>{b}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              {depositForm.bankAccount === 'Other' && (
                <TextField
                  fullWidth
                  size="small"
                  label="Bank / Account Name *"
                  value={depositForm.bankAccountOtherName}
                  onChange={(e) => setDepositForm({ ...depositForm, bankAccountOtherName: e.target.value })}
                />
              )}

              <TextField
                fullWidth
                size="small"
                type="date"
                label="Deposit Date *"
                value={depositForm.depositDate}
                onChange={(e) => setDepositForm({ ...depositForm, depositDate: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />

              <TextField
                fullWidth
                size="small"
                label="Notes"
                value={depositForm.notes}
                onChange={(e) => setDepositForm({ ...depositForm, notes: e.target.value })}
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setDepositDialogOpen(false)} sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button variant="contained" color="success" onClick={handleSaveDeposit} sx={{ textTransform: 'none', fontWeight: 600 }}>
            Confirm Deposit
          </Button>
        </DialogActions>
      </ResponsiveDialog>

      {/* DIALOG 4: Endorse / Pass Cheque to Supplier */}
      <ResponsiveDialog
        open={endorseDialogOpen}
        onClose={() => setEndorseDialogOpen(false)}
        title="Pass / Endorse Cheque to Supplier"
        maxWidth="sm"
      >
        <DialogContent dividers>
          {activeCheque && (
            <Stack spacing={2.5} sx={{ pt: 1 }}>
              <Alert severity="warning" sx={{ py: 0.5 }}>
                Passing in-hand <strong>Cheque #{activeCheque.chequeNumber}</strong> ({activeCheque.bankName}, <strong>{formatCurrency(activeCheque.amount)}</strong>) to pay a supplier or expense.
              </Alert>

              <FormControl fullWidth size="small">
                <InputLabel>Recipient Type</InputLabel>
                <Select
                  value={endorseForm.recipientType}
                  label="Recipient Type"
                  onChange={(e) => setEndorseForm({ ...endorseForm, recipientType: e.target.value })}
                >
                  <MenuItem value="Supplier">Supplier</MenuItem>
                  <MenuItem value="Expense">Expense / Other</MenuItem>
                </Select>
              </FormControl>

              {endorseForm.recipientType === 'Supplier' && (
                <FormControl fullWidth size="small">
                  <InputLabel>Select Supplier *</InputLabel>
                  <Select
                    value={endorseForm.supplierId}
                    label="Select Supplier *"
                    onChange={(e) => setEndorseForm({ ...endorseForm, supplierId: e.target.value })}
                  >
                    <MenuItem value=""><em>-- Custom Payee Name --</em></MenuItem>
                    {suppliers.map((s) => (
                      <MenuItem key={s._id} value={s._id}>
                        {s.name} {s.totalAmountDue > 0 ? `(Due: ${formatCurrency(s.totalAmountDue)})` : ''}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}

              {!endorseForm.supplierId && (
                <TextField
                  fullWidth
                  size="small"
                  label="Recipient Name *"
                  value={endorseForm.partyName}
                  onChange={(e) => setEndorseForm({ ...endorseForm, partyName: e.target.value })}
                  placeholder="Enter supplier or payee name"
                />
              )}

              <TextField
                fullWidth
                size="small"
                type="date"
                label="Endorsement Date *"
                value={endorseForm.endorsedDate}
                onChange={(e) => setEndorseForm({ ...endorseForm, endorsedDate: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />

              <TextField
                fullWidth
                size="small"
                label="Notes"
                value={endorseForm.notes}
                onChange={(e) => setEndorseForm({ ...endorseForm, notes: e.target.value })}
                placeholder="Reason or invoice reference"
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setEndorseDialogOpen(false)} sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button variant="contained" color="warning" onClick={handleSaveEndorse} sx={{ textTransform: 'none', fontWeight: 600 }}>
            Confirm Endorsement
          </Button>
        </DialogActions>
      </ResponsiveDialog>

      {/* DIALOG 5: Status Update Dialog */}
      <ResponsiveDialog
        open={statusDialogOpen}
        onClose={() => setStatusDialogOpen(false)}
        title="Update Cheque Status"
        maxWidth="xs"
      >
        <DialogContent dividers>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Status</InputLabel>
              <Select
                value={statusForm.status}
                label="Status"
                onChange={(e) => setStatusForm({ ...statusForm, status: e.target.value })}
              >
                <MenuItem value="Cleared">Cleared (Successfully Cleared)</MenuItem>
                <MenuItem value="Bounced">Bounced (Dishonoured)</MenuItem>
                <MenuItem value="Returned">Returned</MenuItem>
                <MenuItem value="Cancelled">Cancelled</MenuItem>
                <MenuItem value="In Hand">Revert to In Hand</MenuItem>
              </Select>
            </FormControl>

            <TextField
              fullWidth
              size="small"
              label="Reason / Notes"
              value={statusForm.notes}
              onChange={(e) => setStatusForm({ ...statusForm, notes: e.target.value })}
              placeholder="e.g. Cleared on 14th Feb"
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setStatusDialogOpen(false)} sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveStatus} sx={{ textTransform: 'none', fontWeight: 600 }}>
            Update Status
          </Button>
        </DialogActions>
      </ResponsiveDialog>

      {/* DIALOG 6: Edit Cheque Dialog */}
      <ResponsiveDialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        title={`Edit Cheque #${editForm.chequeNumber || ''}`}
        maxWidth="sm"
      >
        <DialogContent dividers>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  size="small"
                  label="Cheque Number"
                  value={editForm.chequeNumber || ''}
                  onChange={(e) => setEditForm({ ...editForm, chequeNumber: e.target.value })}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  size="small"
                  label="Bank Name"
                  value={editForm.bankName || ''}
                  onChange={(e) => setEditForm({ ...editForm, bankName: e.target.value })}
                />
              </Grid>
            </Grid>

            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  label="Amount (Rs.)"
                  value={editForm.amount || ''}
                  onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  size="small"
                  type="date"
                  label="Cheque Date"
                  value={editForm.chequeDate || ''}
                  onChange={(e) => setEditForm({ ...editForm, chequeDate: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
            </Grid>

            <FormControl fullWidth size="small">
              <InputLabel>Status</InputLabel>
              <Select
                value={editForm.status || 'In Hand'}
                label="Status"
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
              >
                <MenuItem value="In Hand">In Hand</MenuItem>
                <MenuItem value="Deposited">Deposited</MenuItem>
                <MenuItem value="Endorsed">Endorsed</MenuItem>
                <MenuItem value="Issued">Issued</MenuItem>
                <MenuItem value="Cleared">Cleared</MenuItem>
                <MenuItem value="Bounced">Bounced</MenuItem>
                <MenuItem value="Returned">Returned</MenuItem>
                <MenuItem value="Cancelled">Cancelled</MenuItem>
              </Select>
            </FormControl>

            <TextField
              fullWidth
              size="small"
              label="Notes"
              value={editForm.notes || ''}
              onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
              multiline
              rows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setEditDialogOpen(false)} sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveEdit} sx={{ textTransform: 'none', fontWeight: 600 }}>
            Save Changes
          </Button>
        </DialogActions>
      </ResponsiveDialog>

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        open={deleteConfirm.open}
        title="Delete Cheque"
        message={`Are you sure you want to delete Cheque #${deleteConfirm.chequeNumber}? This action cannot be undone.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm({ open: false, id: null, chequeNumber: '' })}
      />

      {/* Feedback Snackbars */}
      <Snackbar
        open={snack.open}
        autoHideDuration={4000}
        onClose={() => setSnack({ ...snack, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity={snack.severity} onClose={() => setSnack({ ...snack, open: false })}>
          {snack.message}
        </Alert>
      </Snackbar>

      <AccessDeniedSnackbar open={accessDenied} onClose={() => setAccessDenied(false)} />
    </Box>
  );
}
