import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  CardActions,
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
  LinearProgress,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Stack,
  useTheme,
  Alert,
  Divider,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import SavingsIcon from '@mui/icons-material/Savings';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import CallReceivedIcon from '@mui/icons-material/CallReceived';
import CallMadeIcon from '@mui/icons-material/CallMade';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HistoryIcon from '@mui/icons-material/History';
import PaymentIcon from '@mui/icons-material/Payment';
import { personalPaymentsAPI } from '../services/api';
import { formatCurrency, formatDate } from '../utils/formatters';
import ResponsiveDialog from '../components/Common/ResponsiveDialog';
import ConfirmDialog from '../components/Common/ConfirmDialog';
import AccessDeniedSnackbar from '../components/Common/AccessDeniedSnackbar';
import PageToolbar from '../components/Common/PageToolbar';
import { usePermissions } from '../hooks/usePermissions';

export default function PersonalPayments() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const { isViewer } = usePermissions();
  const [accessDenied, setAccessDenied] = useState(false);
  const requireAdmin = (fn) => (...args) => {
    if (isViewer) {
      setAccessDenied(true);
      return;
    }
    return fn(...args);
  };

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({
    totalActiveCount: 0,
    receivableCount: 0,
    payableCount: 0,
    totalReceivableLumpSum: 0,
    totalReceivableContributed: 0,
    totalReceivableRemaining: 0,
    totalPayableLumpSum: 0,
    totalPayableRepaid: 0,
    totalPayableRemaining: 0,
    upcomingReceive: null,
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [directionTab, setDirectionTab] = useState(0); // 0: All, 1: Receivables, 2: Payables

  // Category Dialog (Create / Edit)
  const [categoryDialog, setCategoryDialog] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryForm, setCategoryForm] = useState({
    categoryName: '',
    paymentDirection: 'Receivable',
    categoryType: 'Committee',
    personName: '',
    expectedLumpSum: '',
    monthlyAmount: '',
    expectedReceiveDate: '',
    notes: '',
  });

  // Payment Dialog
  const [paymentDialog, setPaymentDialog] = useState(false);
  const [activeCategory, setActiveCategory] = useState(null);
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    paymentDate: new Date().toISOString().slice(0, 10),
    paymentMethod: 'Cash',
    chequeNumber: '',
    bankName: '',
    paidBy: '',
    note: '',
  });

  // Payment History Dialog
  const [historyDialog, setHistoryDialog] = useState(false);
  const [historyCategory, setHistoryCategory] = useState(null);

  // Confirm delete
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, id: null, title: '', message: '' });
  const [deletePaymentConfirm, setDeletePaymentConfirm] = useState({ open: false, catId: null, paymentId: null });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let direction = 'All';
      if (directionTab === 1) direction = 'Receivable';
      if (directionTab === 2) direction = 'Payable';

      const res = await personalPaymentsAPI.getAll({
        search: searchTerm,
        direction,
      });
      setItems(res.data.data || []);
      setSummary(res.data.summary || {});
    } catch (err) {
      console.error('Failed to fetch personal payments:', err);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, directionTab]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Open Category Dialog
  const openAddCategory = () => {
    setEditingCategory(null);
    setCategoryForm({
      categoryName: '',
      paymentDirection: directionTab === 2 ? 'Payable' : 'Receivable',
      categoryType: directionTab === 2 ? 'Loan Taken' : 'Committee',
      personName: '',
      expectedLumpSum: '',
      monthlyAmount: '',
      expectedReceiveDate: '',
      notes: '',
    });
    setCategoryDialog(true);
  };

  const openEditCategory = (cat) => {
    setEditingCategory(cat);
    setCategoryForm({
      categoryName: cat.categoryName || '',
      paymentDirection: cat.paymentDirection || 'Receivable',
      categoryType: cat.categoryType || 'Committee',
      personName: cat.personName || '',
      expectedLumpSum: String(cat.expectedLumpSum || ''),
      monthlyAmount: String(cat.monthlyAmount || ''),
      expectedReceiveDate: cat.expectedReceiveDate ? new Date(cat.expectedReceiveDate).toISOString().slice(0, 10) : '',
      notes: cat.notes || '',
    });
    setCategoryDialog(true);
  };

  const handleSaveCategory = async () => {
    if (!categoryForm.categoryName.trim() || !categoryForm.expectedLumpSum) {
      alert('Please fill in Category Name and Target / Lump Sum Amount');
      return;
    }
    try {
      if (editingCategory) {
        await personalPaymentsAPI.update(editingCategory._id, categoryForm);
      } else {
        await personalPaymentsAPI.create(categoryForm);
      }
      setCategoryDialog(false);
      fetchData();
    } catch (err) {
      console.error('Error saving category:', err);
      alert(err.response?.data?.message || 'Error saving category');
    }
  };

  // Open Payment Dialog
  const openAddPayment = (cat) => {
    setActiveCategory(cat);
    setPaymentForm({
      amount: cat.monthlyAmount ? String(cat.monthlyAmount) : '',
      paymentDate: new Date().toISOString().slice(0, 10),
      paymentMethod: 'Cash',
      chequeNumber: '',
      bankName: '',
      paidBy: '',
      note: '',
    });
    setPaymentDialog(true);
  };

  const handleSavePayment = async () => {
    if (!paymentForm.amount || Number(paymentForm.amount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }
    try {
      await personalPaymentsAPI.addPayment(activeCategory._id, paymentForm);
      setPaymentDialog(false);
      fetchData();
    } catch (err) {
      console.error('Error adding payment:', err);
      alert(err.response?.data?.message || 'Error recording payment');
    }
  };

  // Open History Dialog
  const openHistory = (cat) => {
    setHistoryCategory(cat);
    setHistoryDialog(true);
  };

  // Delete Category
  const handleDeleteCategory = async () => {
    try {
      await personalPaymentsAPI.delete(deleteConfirm.id);
      setDeleteConfirm({ open: false, id: null, title: '', message: '' });
      fetchData();
    } catch (err) {
      console.error('Error deleting category:', err);
      alert('Failed to delete category');
    }
  };

  // Delete Payment
  const handleDeletePayment = async () => {
    try {
      await personalPaymentsAPI.deletePayment(deletePaymentConfirm.catId, deletePaymentConfirm.paymentId);
      setDeletePaymentConfirm({ open: false, catId: null, paymentId: null });
      // Update local history category
      if (historyCategory) {
        const updatedPayments = historyCategory.payments.filter((p) => p._id !== deletePaymentConfirm.paymentId);
        setHistoryCategory({ ...historyCategory, payments: updatedPayments });
      }
      fetchData();
    } catch (err) {
      console.error('Error deleting payment:', err);
    }
  };

  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 } }}>
      <PageToolbar
        title="Personal Payments & Loans"
        actions={
          <Stack direction="row" spacing={1} alignItems="center">
            <Button
              variant="outlined"
              size="small"
              startIcon={<RefreshIcon />}
              onClick={fetchData}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              Refresh
            </Button>
            <Button
              variant="contained"
              size="small"
              startIcon={<AddIcon />}
              onClick={requireAdmin(openAddCategory)}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              New Category / Loan
            </Button>
          </Stack>
        }
      />

      {/* Top 3 KPI Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {/* Personal Receivables (Committees / Savings / Loans Given) */}
        <Grid item xs={12} sm={6} md={4}>
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              borderRadius: 2,
              border: '1px solid',
              borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : '#A7F3D0',
              bgcolor: isDark ? 'rgba(16, 185, 129, 0.08)' : '#ECFDF5',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              height: '100%',
            }}
          >
            <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
              <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', color: 'success.main', letterSpacing: 0.5 }}>
                Personal Receivables (To Receive)
              </Typography>
              <CallReceivedIcon sx={{ color: 'success.main', fontSize: 20 }} />
            </Stack>
            <Typography variant="h5" sx={{ fontWeight: 800, color: 'success.dark', letterSpacing: '-0.02em', my: 0.5 }}>
              {formatCurrency(summary.totalReceivableLumpSum || 0)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Contributed: {formatCurrency(summary.totalReceivableContributed || 0)} · Remaining: {formatCurrency(summary.totalReceivableRemaining || 0)}
            </Typography>
          </Paper>
        </Grid>

        {/* Personal Payables (Loans Taken / Liabilities) */}
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
                Personal Payables (Loans Taken)
              </Typography>
              <CallMadeIcon sx={{ color: 'error.main', fontSize: 20 }} />
            </Stack>
            <Typography variant="h5" sx={{ fontWeight: 800, color: 'error.dark', letterSpacing: '-0.02em', my: 0.5 }}>
              {formatCurrency(summary.totalPayableLumpSum || 0)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Repaid: {formatCurrency(summary.totalPayableRepaid || 0)} · Remaining: {formatCurrency(summary.totalPayableRemaining || 0)}
            </Typography>
          </Paper>
        </Grid>

        {/* Active Categories Count & Upcoming Return */}
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
                Active Categories
              </Typography>
              <SavingsIcon sx={{ color: '#8B5CF6', fontSize: 20 }} />
            </Stack>
            <Typography variant="h5" sx={{ fontWeight: 800, color: '#6D28D9', letterSpacing: '-0.02em', my: 0.5 }}>
              {summary.totalActiveCount || 0} Active
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {summary.upcomingReceive
                ? `Next: ${summary.upcomingReceive.categoryName} (${formatDate(summary.upcomingReceive.expectedReceiveDate)})`
                : 'No upcoming due dates'}
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Filter and Direction Tabs */}
      <Paper elevation={0} sx={{ p: 2, mb: 3, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center" justifyContent="space-between">
          <Tabs
            value={directionTab}
            onChange={(_, val) => setDirectionTab(val)}
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
            <Tab label="All Categories" />
            <Tab label={`Receivables (${summary.receivableCount || 0})`} />
            <Tab label={`Payables / Loans (${summary.payableCount || 0})`} />
          </Tabs>

          <TextField
            size="small"
            placeholder="Search category, person, type..."
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
      ) : items.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 2, border: '1px dashed', borderColor: 'divider' }}>
          <SavingsIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1, opacity: 0.5 }} />
          <Typography variant="h6" color="text.secondary">
            No personal payment or loan categories found
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Track committees, gold savings, investments, or personal loans taken and given.
          </Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={requireAdmin(openAddCategory)}>
            Add New Category
          </Button>
        </Paper>
      ) : (
        <Grid container spacing={2.5}>
          {items.map((item) => {
            const isPayable = item.paymentDirection === 'Payable';
            const progress = item.expectedLumpSum > 0
              ? Math.min(100, Math.round(((item.totalContributed || 0) / item.expectedLumpSum) * 100))
              : 0;

            const recentPayments = (item.payments || []).slice(-3).reverse();

            return (
              <Grid item xs={12} md={6} lg={4} key={item._id}>
                <Card
                  elevation={0}
                  sx={{
                    borderRadius: 2.5,
                    border: '1px solid',
                    borderColor: 'divider',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    height: '100%',
                    transition: 'all 0.2s',
                    '&:hover': {
                      boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                      borderColor: isPayable ? 'error.light' : 'success.light',
                    },
                  }}
                >
                  <CardContent sx={{ pb: 1 }}>
                    {/* Header: Title & Badges */}
                    <Box display="flex" alignItems="flex-start" justifyContent="space-between" mb={1} gap={1}>
                      <Box>
                        <Typography variant="subtitle1" fontWeight={800} color="text.primary" sx={{ lineHeight: 1.2 }}>
                          {item.categoryName}
                        </Typography>
                        {item.personName && (
                          <Typography variant="caption" color="text.secondary">
                            Person: <strong>{item.personName}</strong>
                          </Typography>
                        )}
                      </Box>
                      <Stack direction="row" spacing={0.5} flexWrap="wrap" justifyContent="flex-end">
                        <Chip
                          size="small"
                          label={isPayable ? 'Payable (Loan)' : 'Receivable'}
                          color={isPayable ? 'error' : 'success'}
                          variant="filled"
                          sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700 }}
                        />
                        <Chip
                          size="small"
                          label={item.status}
                          color={item.status === 'Active' ? 'primary' : item.status === 'Completed' ? 'info' : 'default'}
                          variant="outlined"
                          sx={{ height: 20, fontSize: '0.65rem' }}
                        />
                      </Stack>
                    </Box>

                    {/* Progress Bar & Amount */}
                    <Box sx={{ mt: 2, mb: 1.5 }}>
                      <Box display="flex" justifyContent="space-between" alignItems="baseline" mb={0.5}>
                        <Typography variant="body2" color="text.secondary">
                          {isPayable ? 'Repaid so far:' : 'Contributed so far:'}
                        </Typography>
                        <Typography variant="subtitle2" fontWeight={800} color={isPayable ? 'error.main' : 'success.main'}>
                          {formatCurrency(item.totalContributed || 0)} / {formatCurrency(item.expectedLumpSum || 0)}
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={progress}
                        color={isPayable ? 'error' : 'success'}
                        sx={{ height: 8, borderRadius: 4, bgcolor: isDark ? 'rgba(255,255,255,0.1)' : '#F1F5F9' }}
                      />
                      <Box display="flex" justifyContent="space-between" mt={0.5}>
                        <Typography variant="caption" color="text.secondary">
                          {progress}% {isPayable ? 'Repaid' : 'Completed'}
                        </Typography>
                        <Typography variant="caption" fontWeight={700} color={item.remainingToContribute > 0 ? 'warning.main' : 'success.main'}>
                          {item.remainingToContribute > 0 ? `${formatCurrency(item.remainingToContribute)} remaining` : 'Fully Paid'}
                        </Typography>
                      </Box>
                    </Box>

                    <Divider sx={{ my: 1 }} />

                    {/* Stats Grid */}
                    <Grid container spacing={1} sx={{ mb: 1.5 }}>
                      {item.monthlyAmount > 0 && (
                        <Grid item xs={6}>
                          <Typography variant="caption" color="text.secondary" display="block">
                            Installment:
                          </Typography>
                          <Typography variant="body2" fontWeight={700}>
                            {formatCurrency(item.monthlyAmount)} / mo
                          </Typography>
                        </Grid>
                      )}
                      <Grid item xs={6}>
                        <Typography variant="caption" color="text.secondary" display="block">
                          {isPayable ? 'Due Date:' : 'Expected Return:'}
                        </Typography>
                        <Typography variant="body2" fontWeight={700}>
                          {item.expectedReceiveDate ? formatDate(item.expectedReceiveDate) : '—'}
                        </Typography>
                      </Grid>
                    </Grid>

                    {/* Recent Payments Mini Table */}
                    <Box sx={{ mt: 1, p: 1, bgcolor: isDark ? 'rgba(255,255,255,0.02)' : '#F8FAFC', borderRadius: 1.5 }}>
                      <Box display="flex" justifyContent="space-between" alignItems="center" mb={0.5}>
                        <Typography variant="caption" fontWeight={700} color="text.secondary">
                          Recent Payments ({item.payments?.length || 0})
                        </Typography>
                        {item.payments?.length > 0 && (
                          <Button size="small" onClick={() => openHistory(item)} sx={{ p: 0, fontSize: '0.7rem', textTransform: 'none' }}>
                            View All
                          </Button>
                        )}
                      </Box>

                      {recentPayments.length === 0 ? (
                        <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic', display: 'block', py: 0.5 }}>
                          No payments recorded yet
                        </Typography>
                      ) : (
                        recentPayments.map((p) => (
                          <Box key={p._id} display="flex" justifyContent="space-between" alignItems="center" py={0.25}>
                            <Typography variant="caption" color="text.secondary">
                              {formatDate(p.paymentDate)} · {p.paymentMethod}
                            </Typography>
                            <Typography variant="caption" fontWeight={700} color="text.primary">
                              {formatCurrency(p.amount)}
                            </Typography>
                          </Box>
                        ))
                      )}
                    </Box>
                  </CardContent>

                  {/* Actions */}
                  <CardActions sx={{ p: 1.5, pt: 0, justifyContent: 'space-between' }}>
                    <Button
                      size="small"
                      variant="contained"
                      color={isPayable ? 'error' : 'success'}
                      startIcon={<AddIcon sx={{ fontSize: 14 }} />}
                      onClick={requireAdmin(() => openAddPayment(item))}
                      sx={{ textTransform: 'none', fontSize: '0.75rem', fontWeight: 700 }}
                    >
                      Add Payment
                    </Button>

                    <Stack direction="row" spacing={0.5}>
                      <Tooltip title="View all payments">
                        <IconButton size="small" onClick={() => openHistory(item)}>
                          <HistoryIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Edit category">
                        <IconButton size="small" onClick={requireAdmin(() => openEditCategory(item))}>
                          <EditIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete category">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={requireAdmin(() =>
                            setDeleteConfirm({
                              open: true,
                              id: item._id,
                              title: `Delete ${item.categoryName}?`,
                              message: 'This will remove or cancel this category.',
                            })
                          )}
                        >
                          <DeleteIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </CardActions>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}

      {/* CREATE / EDIT CATEGORY DIALOG */}
      <ResponsiveDialog
        open={categoryDialog}
        onClose={() => setCategoryDialog(false)}
        title={editingCategory ? 'Edit Category / Loan' : 'Add New Category or Loan'}
        maxWidth="sm"
      >
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Category / Loan Name"
              placeholder="e.g. Committee Jan 2026, Gold Savings, Loan from Aslam"
              value={categoryForm.categoryName}
              onChange={(e) => setCategoryForm({ ...categoryForm, categoryName: e.target.value })}
              fullWidth
              required
            />

            <Grid container spacing={2}>
              <Grid item xs={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>Payment Direction</InputLabel>
                  <Select
                    value={categoryForm.paymentDirection}
                    onChange={(e) =>
                      setCategoryForm({
                        ...categoryForm,
                        paymentDirection: e.target.value,
                        categoryType: e.target.value === 'Payable' ? 'Loan Taken' : 'Committee',
                      })
                    }
                    label="Payment Direction"
                  >
                    <MenuItem value="Receivable">Receivable (To Receive / Committee)</MenuItem>
                    <MenuItem value="Payable">Payable (Loan Taken / Liability)</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>Category Type</InputLabel>
                  <Select
                    value={categoryForm.categoryType}
                    onChange={(e) => setCategoryForm({ ...categoryForm, categoryType: e.target.value })}
                    label="Category Type"
                  >
                    <MenuItem value="Committee">Committee</MenuItem>
                    <MenuItem value="Savings">Savings</MenuItem>
                    <MenuItem value="Investment">Investment</MenuItem>
                    <MenuItem value="Loan Taken">Loan Taken (Payable)</MenuItem>
                    <MenuItem value="Loan Given">Loan Given (Receivable)</MenuItem>
                    <MenuItem value="Other">Other</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>

            <TextField
              label="Person / Holder Name (Optional)"
              placeholder="e.g. Committee Organizer, Lender Name, Borrower"
              value={categoryForm.personName}
              onChange={(e) => setCategoryForm({ ...categoryForm, personName: e.target.value })}
              fullWidth
              size="small"
            />

            <Grid container spacing={2}>
              <Grid item xs={6}>
                <TextField
                  label="Target / Expected Lump Sum Amount"
                  type="number"
                  placeholder="e.g. 500000"
                  value={categoryForm.expectedLumpSum}
                  onChange={(e) => setCategoryForm({ ...categoryForm, expectedLumpSum: e.target.value })}
                  fullWidth
                  required
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  label="Monthly Installment (Optional)"
                  type="number"
                  placeholder="e.g. 50000"
                  value={categoryForm.monthlyAmount}
                  onChange={(e) => setCategoryForm({ ...categoryForm, monthlyAmount: e.target.value })}
                  fullWidth
                />
              </Grid>
            </Grid>

            <TextField
              label="Expected Return / Due Date"
              type="date"
              value={categoryForm.expectedReceiveDate}
              onChange={(e) => setCategoryForm({ ...categoryForm, expectedReceiveDate: e.target.value })}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />

            <TextField
              label="Notes / Description"
              value={categoryForm.notes}
              onChange={(e) => setCategoryForm({ ...categoryForm, notes: e.target.value })}
              fullWidth
              multiline
              rows={2}
              placeholder="Additional details, bank info, or terms..."
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCategoryDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveCategory}>
            {editingCategory ? 'Save Changes' : 'Create Category'}
          </Button>
        </DialogActions>
      </ResponsiveDialog>

      {/* ADD PAYMENT DIALOG */}
      <ResponsiveDialog
        open={paymentDialog}
        onClose={() => setPaymentDialog(false)}
        title={activeCategory ? `Add Payment — ${activeCategory.categoryName}` : 'Add Payment'}
        maxWidth="xs"
      >
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Payment Amount (Rs.)"
              type="number"
              value={paymentForm.amount}
              onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
              fullWidth
              autoFocus
              required
            />

            <TextField
              label="Payment Date"
              type="date"
              value={paymentForm.paymentDate}
              onChange={(e) => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />

            <FormControl fullWidth size="small">
              <InputLabel>Payment Method</InputLabel>
              <Select
                value={paymentForm.paymentMethod}
                onChange={(e) => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })}
                label="Payment Method"
              >
                <MenuItem value="Cash">Cash</MenuItem>
                <MenuItem value="Bank Transfer">Bank Transfer</MenuItem>
                <MenuItem value="Cheque">Cheque</MenuItem>
              </Select>
            </FormControl>

            {paymentForm.paymentMethod === 'Cheque' && (
              <>
                <TextField
                  label="Cheque Number"
                  value={paymentForm.chequeNumber}
                  onChange={(e) => setPaymentForm({ ...paymentForm, chequeNumber: e.target.value })}
                  fullWidth
                  size="small"
                />
                <TextField
                  label="Cheque Bank Name"
                  value={paymentForm.bankName}
                  onChange={(e) => setPaymentForm({ ...paymentForm, bankName: e.target.value })}
                  fullWidth
                  size="small"
                />
              </>
            )}

            <TextField
              label="Paid By (Person / Account)"
              placeholder="e.g. Faisal, Fayyaz, Office Till"
              value={paymentForm.paidBy}
              onChange={(e) => setPaymentForm({ ...paymentForm, paidBy: e.target.value })}
              fullWidth
              size="small"
            />

            <TextField
              label="Note (Optional)"
              value={paymentForm.note}
              onChange={(e) => setPaymentForm({ ...paymentForm, note: e.target.value })}
              fullWidth
              size="small"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPaymentDialog(false)}>Cancel</Button>
          <Button variant="contained" color="success" onClick={handleSavePayment}>
            Record Payment
          </Button>
        </DialogActions>
      </ResponsiveDialog>

      {/* PAYMENT HISTORY DIALOG */}
      <ResponsiveDialog
        open={historyDialog}
        onClose={() => setHistoryDialog(false)}
        title={historyCategory ? `Payment History — ${historyCategory.categoryName}` : 'Payment History'}
        maxWidth="md"
      >
        <DialogContent dividers>
          {historyCategory && (
            <>
              <Box display="flex" justifyContent="space-between" mb={2} p={1.5} bgcolor="action.hover" borderRadius={1.5}>
                <Typography variant="body2">
                  Total Target: <strong>{formatCurrency(historyCategory.expectedLumpSum || 0)}</strong>
                </Typography>
                <Typography variant="body2">
                  Contributed: <strong style={{ color: '#10B981' }}>{formatCurrency(historyCategory.totalContributed || 0)}</strong>
                </Typography>
                <Typography variant="body2">
                  Remaining: <strong style={{ color: '#F59E0B' }}>{formatCurrency(historyCategory.remainingToContribute || 0)}</strong>
                </Typography>
              </Box>

              <TableContainer sx={{ maxHeight: 360 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'action.hover' }}>
                      <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Amount</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Method</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Paid By</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Note</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(!historyCategory.payments || historyCategory.payments.length === 0) ? (
                      <TableRow>
                        <TableCell colSpan={6} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                          No payments recorded yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      historyCategory.payments.map((p) => (
                        <TableRow key={p._id} hover>
                          <TableCell>{formatDate(p.paymentDate)}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700, color: 'success.main' }}>
                            {formatCurrency(p.amount)}
                          </TableCell>
                          <TableCell>
                            <Chip size="small" label={p.paymentMethod} variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
                            {p.chequeNumber && (
                              <Typography variant="caption" display="block" color="text.secondary">
                                #{p.chequeNumber} ({p.bankName})
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell>{p.paidBy || '—'}</TableCell>
                          <TableCell sx={{ color: 'text.secondary' }}>{p.note || '—'}</TableCell>
                          <TableCell align="right">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={requireAdmin(() =>
                                setDeletePaymentConfirm({
                                  open: true,
                                  catId: historyCategory._id,
                                  paymentId: p._id,
                                })
                              )}
                            >
                              <DeleteIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryDialog(false)}>Close</Button>
        </DialogActions>
      </ResponsiveDialog>

      {/* Delete Category Confirm Dialog */}
      <ConfirmDialog
        open={deleteConfirm.open}
        title={deleteConfirm.title}
        message={deleteConfirm.message}
        onConfirm={handleDeleteCategory}
        onCancel={() => setDeleteConfirm({ open: false, id: null, title: '', message: '' })}
      />

      {/* Delete Payment Confirm Dialog */}
      <ConfirmDialog
        open={deletePaymentConfirm.open}
        title="Delete Payment Entry?"
        message="Are you sure you want to remove this payment entry? The category totals will be recalculated."
        onConfirm={handleDeletePayment}
        onCancel={() => setDeletePaymentConfirm({ open: false, catId: null, paymentId: null })}
      />

      <AccessDeniedSnackbar
        open={accessDenied}
        onClose={() => setAccessDenied(false)}
        message="Access Denied: Viewers cannot perform this action."
      />
    </Box>
  );
}
