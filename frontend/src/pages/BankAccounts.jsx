import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Button, Paper, Typography, Table, TableHead, TableBody,
  TableRow, TableCell, TableContainer, Tabs, Tab, Chip, Dialog,
  DialogTitle, DialogContent, DialogActions, TextField, FormControl,
  InputLabel, Select, MenuItem, Alert, Snackbar, CircularProgress,
  Divider, IconButton, Tooltip, Checkbox, FormControlLabel,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import { transactionsAPI, customersAPI, suppliersAPI } from '../services/api';
import { formatCurrency, formatDate } from '../utils/formatters';
import ConfirmDialog from '../components/Common/ConfirmDialog';

const BANK_ACCOUNTS = ['MBL', 'UBL', 'Faisal Bank', 'Other'];

const defaultForm = {
  transactionType: 'Money In',
  amount: '',
  personType: 'free',
  relatedId: '',
  relatedName: '',
  bankAccount: 'MBL',
  bankAccountOtherName: '',
  bankAccountNumber: '',
  description: '',
  transactionDate: new Date().toISOString().slice(0, 10),
  recordAsExpense: false,
  expenseGroup: 'Manufacturing',
  expenseCategory: 'Annealing',
};

const defaultOpeningForm = {
  bankAccount: 'MBL',
  bankAccountOtherName: '',
  openingBalance: '',
  asOfDate: new Date().toISOString().slice(0, 10),
  note: '',
};

const BANK_EXPENSE_TREE = {
  Labour: ['Labour Salary', 'Labour Advance', 'Labour Tea', 'Labour Food', 'Petrol Labour', 'Miscellaneous'],
  Rental: ['Coil Rental', 'Wire Rental', 'Miscellaneous'],
  Operations: ['Weight Scale Payment', 'Hardware Maintenance', 'Electricity', 'Office Expense', 'Miscellaneous'],
  Manufacturing: ['Annealing', 'Miscellaneous'],
  'Process Material': ['Acid', 'Dye', 'Soap', 'Stationary', 'Miscellaneous'],
  'Self Expense': ['Fayyaz Expense', 'Faisal Expense', 'Mutual Expense'],
};

function accountDisplayName(bankAccount, otherName) {
  if (bankAccount === 'Other') return otherName || 'Other';
  return bankAccount || 'MBL';
}

export default function BankAccounts() {
  const [tab, setTab] = useState(0);
  const [persons, setPersons] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [bankBook, setBankBook] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filterPerson, setFilterPerson] = useState('');
  const [filterAccount, setFilterAccount] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [openingDialogOpen, setOpeningDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [openingForm, setOpeningForm] = useState(defaultOpeningForm);
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, id: null });
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (filterAccount) params.bankAccount = filterAccount;
      const [personsRes, bookRes, custRes, supRes] = await Promise.all([
        transactionsAPI.getBankPersons(),
        transactionsAPI.getBankBook(params),
        customersAPI.getAll(),
        suppliersAPI.getAll(),
      ]);
      setPersons(personsRes.data.data || []);
      setAccounts(personsRes.data.accounts || []);
      setBankBook(bookRes.data.data || null);
      setCustomers(custRes.data.data || []);
      setSuppliers(supRes.data.data || []);
    } catch {
      setSnack({ open: true, message: 'Failed to load bank data', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, filterAccount]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openAdd = () => {
    setEditingId(null);
    setForm({ ...defaultForm, transactionDate: new Date().toISOString().slice(0, 10) });
    setDialogOpen(true);
  };

  const openOpeningDialog = (account) => {
    setOpeningForm({
      bankAccount: account.bankAccount || 'MBL',
      bankAccountOtherName: account.bankAccountOtherName || '',
      openingBalance: account.openingBalance != null ? String(account.openingBalance) : '',
      asOfDate: account.asOfDate ? new Date(account.asOfDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      note: account.note || '',
    });
    setOpeningDialogOpen(true);
  };

  const openEdit = (row) => {
    setEditingId(row._id);
    setForm({
      transactionType: row.transactionType,
      amount: String(row.amount),
      personType: row.relatedId ? (row.relatedTo === 'Customer' ? 'customer' : 'supplier') : 'free',
      relatedId: row.relatedId ? String(row.relatedId) : '',
      relatedName: row.relatedName || '',
      bankAccount: row.bankAccount || 'MBL',
      bankAccountOtherName: row.bankAccountOtherName || '',
      bankAccountNumber: row.bankAccountNumber || '',
      description: row.description || '',
      transactionDate: row.date ? new Date(row.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      recordAsExpense: !!(row.expenseCategory || row.linkedExpenseId),
      expenseGroup: row.expenseGroup || 'Manufacturing',
      expenseCategory: row.expenseCategory || 'Annealing',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!Number(form.amount) || Number(form.amount) <= 0) {
      setSnack({ open: true, message: 'Valid amount required', severity: 'error' });
      return;
    }
    if (form.personType !== 'free' && !form.relatedId) {
      setSnack({ open: true, message: 'Please select a customer or supplier', severity: 'error' });
      return;
    }
    if (form.bankAccount === 'Other' && !form.bankAccountOtherName?.trim()) {
      setSnack({ open: true, message: 'Please write the bank / account name for Other', severity: 'error' });
      return;
    }
    try {
      const payload = {
        transactionType: form.transactionType,
        amount: Number(form.amount),
        paymentMethod: 'Bank Transfer',
        sourceType: 'Manual',
        bankAccount: form.bankAccount,
        bankAccountOtherName: form.bankAccount === 'Other' ? form.bankAccountOtherName.trim() : undefined,
        bankAccountNumber: form.bankAccountNumber || undefined,
        description: form.description || undefined,
        transactionDate: form.transactionDate,
      };
      if (form.personType === 'customer') {
        payload.relatedTo = 'Customer';
        payload.relatedId = form.relatedId;
        const c = customers.find((x) => x._id === form.relatedId);
        payload.relatedName = c?.name || form.relatedName;
      } else if (form.personType === 'supplier') {
        payload.relatedTo = 'Supplier';
        payload.relatedId = form.relatedId;
        const s = suppliers.find((x) => x._id === form.relatedId);
        payload.relatedName = s?.name || form.relatedName;
      } else {
        payload.relatedTo = 'Other';
        payload.relatedName = form.relatedName || undefined;
      }
      if (form.transactionType === 'Money Out') {
        if (form.recordAsExpense) {
          if (!form.expenseGroup || !form.expenseCategory) {
            setSnack({ open: true, message: 'Select expense group and category', severity: 'error' });
            return;
          }
          payload.recordAsExpense = true;
          payload.expenseGroup = form.expenseGroup;
          payload.expenseCategory = form.expenseCategory;
        } else if (editingId) {
          payload.recordAsExpense = false;
        }
      }
      if (editingId) {
        const res = await transactionsAPI.update(editingId, payload);
        setSnack({ open: true, message: res.data.message || 'Transfer updated', severity: 'success' });
      } else {
        const res = await transactionsAPI.create(payload);
        setSnack({ open: true, message: res.data.message || 'Transfer recorded', severity: 'success' });
      }
      setDialogOpen(false);
      fetchData();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Error saving', severity: 'error' });
    }
  };

  const handleDelete = async () => {
    try {
      await transactionsAPI.delete(deleteConfirm.id);
      setSnack({ open: true, message: 'Transfer deleted', severity: 'success' });
      setDeleteConfirm({ open: false, id: null });
      fetchData();
    } catch {
      setSnack({ open: true, message: 'Delete failed', severity: 'error' });
    }
  };

  const handleSaveOpening = async () => {
    if (openingForm.bankAccount === 'Other' && !openingForm.bankAccountOtherName.trim()) {
      setSnack({ open: true, message: 'Please write the bank / account name for Other', severity: 'error' });
      return;
    }
    if (!openingForm.asOfDate) {
      setSnack({ open: true, message: 'Opening date required', severity: 'error' });
      return;
    }
    try {
      const res = await transactionsAPI.setBankOpening({
        bankAccount: openingForm.bankAccount,
        bankAccountOtherName: openingForm.bankAccount === 'Other'
          ? openingForm.bankAccountOtherName.trim()
          : undefined,
        openingBalance: Number(openingForm.openingBalance) || 0,
        asOfDate: openingForm.asOfDate,
        note: openingForm.note || '',
      });
      setSnack({ open: true, message: res.data.message || 'Bank opening balance saved', severity: 'success' });
      setOpeningDialogOpen(false);
      fetchData();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Error saving opening balance', severity: 'error' });
    }
  };

  // Ensure all 4 categories always show (even with 0 balance)
  const accountCards = BANK_ACCOUNTS.map((acct) => {
    const found = accounts.find((a) => a.bankAccount === acct);
    return found || { bankAccount: acct, label: acct, totalIn: 0, totalOut: 0, balance: 0 };
  });

  const allTimeBalance = accountCards.reduce((s, a) => s + a.balance, 0);
  const allTimeIn = accountCards.reduce((s, a) => s + a.totalIn, 0);
  const allTimeOut = accountCards.reduce((s, a) => s + a.totalOut, 0);

  const filteredTxns = (bankBook?.transactions || []).filter((t) => {
    if (!filterPerson) return true;
    return (t.relatedName || '').toLowerCase().includes(filterPerson.toLowerCase())
      || String(t.relatedId || '') === filterPerson;
  });

  const ledgerCustomers = customers.filter((c) => c.customerType === 'Ledger');
  const processingCustomers = customers.filter((c) => c.customerType === 'Processing');

  return (
    <Box>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={3} flexWrap="wrap" gap={2}>
        <Box display="flex" alignItems="center" gap={1}>
          <AccountBalanceIcon color="primary" sx={{ fontSize: 32 }} />
          <Typography variant="h5" fontWeight={700}>Bank Accounts</Typography>
        </Box>
        <Box display="flex" gap={1} flexWrap="wrap" alignItems="center">
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Account</InputLabel>
            <Select value={filterAccount} label="Account" onChange={(e) => setFilterAccount(e.target.value)}>
              <MenuItem value="">All Accounts</MenuItem>
              {BANK_ACCOUNTS.map((a) => (
                <MenuItem key={a} value={a}>{a === 'Other' ? 'Any Other' : `${a} Account`}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField size="small" type="date" label="From" value={startDate} onChange={(e) => setStartDate(e.target.value)} InputLabelProps={{ shrink: true }} />
          <TextField size="small" type="date" label="To" value={endDate} onChange={(e) => setEndDate(e.target.value)} InputLabelProps={{ shrink: true }} />
          {(startDate || endDate || filterAccount) && (
            <Button size="small" variant="outlined" onClick={() => { setStartDate(''); setEndDate(''); setFilterAccount(''); }}>Clear</Button>
          )}
          <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>Add Bank Transfer</Button>
        </Box>
      </Box>

      {loading ? (
        <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>
      ) : (
        <>
          <Box display="flex" gap={2} mb={3} flexWrap="wrap">
            {accountCards.map((a) => (
              <Paper
                key={a.bankAccount}
                sx={{
                  flex: 1,
                  minWidth: 160,
                  p: 2,
                  borderTop: 4,
                  borderColor: a.balance >= 0 ? 'primary.main' : 'error.main',
                  cursor: 'pointer',
                  bgcolor: filterAccount === a.bankAccount ? 'action.selected' : undefined,
                }}
                onClick={() => setFilterAccount(filterAccount === a.bankAccount ? '' : a.bankAccount)}
              >
                <Typography variant="subtitle2" fontWeight={700}>
                  {a.bankAccount === 'Other' ? 'Any Other' : `${a.bankAccount} Account`}
                </Typography>
                <Typography variant="h5" fontWeight={700} color={a.balance >= 0 ? 'primary.main' : 'error.main'}>
                  {formatCurrency(a.balance)}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block">
                  In {formatCurrency(a.totalIn)} · Out {formatCurrency(a.totalOut)}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block">
                  Opening {formatCurrency(a.openingBalance || 0)}
                  {a.asOfDate ? ` as of ${formatDate(a.asOfDate)}` : ''}
                </Typography>
                <Button
                  size="small"
                  sx={{ mt: 1, px: 0 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    openOpeningDialog(a);
                  }}
                >
                  Set opening balance
                </Button>
              </Paper>
            ))}
            <Paper sx={{ flex: 1, minWidth: 160, p: 2, borderTop: 4, borderColor: 'grey.500' }}>
              <Typography variant="subtitle2" fontWeight={700}>All Accounts</Typography>
              <Typography variant="h5" fontWeight={700} color={allTimeBalance >= 0 ? 'primary.main' : 'error.main'}>
                {formatCurrency(allTimeBalance)}
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block">
                In {formatCurrency(allTimeIn)} · Out {formatCurrency(allTimeOut)}
              </Typography>
            </Paper>
          </Box>

          <Paper sx={{ mb: 2 }}>
            <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
              <Tab label="By Person" />
              <Tab label="All Transactions" />
            </Tabs>

            {tab === 0 && (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>#</TableCell>
                      <TableCell>Person / Party</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell align="right" sx={{ color: 'success.main' }}>Total In</TableCell>
                      <TableCell align="right" sx={{ color: 'error.main' }}>Total Out</TableCell>
                      <TableCell align="right">Net</TableCell>
                      <TableCell>Txns</TableCell>
                      <TableCell>Last Date</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {persons.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8}>
                          <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>No bank transfers recorded yet.</Typography>
                        </TableCell>
                      </TableRow>
                    )}
                    {persons.map((p, i) => (
                      <TableRow key={p.key} hover>
                        <TableCell>{i + 1}</TableCell>
                        <TableCell><strong>{p.name}</strong></TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={p.relatedTo === 'Other' ? 'Other' : p.relatedTo}
                            variant="outlined"
                            color={p.relatedTo === 'Customer' ? 'primary' : p.relatedTo === 'Supplier' ? 'secondary' : 'default'}
                          />
                        </TableCell>
                        <TableCell align="right" sx={{ color: 'success.main', fontWeight: 600 }}>{formatCurrency(p.totalIn)}</TableCell>
                        <TableCell align="right" sx={{ color: 'error.main', fontWeight: 600 }}>{formatCurrency(p.totalOut)}</TableCell>
                        <TableCell align="right">
                          <Typography fontWeight={700} color={p.net > 0 ? 'success.main' : p.net < 0 ? 'error.main' : 'text.secondary'}>
                            {formatCurrency(Math.abs(p.net))}
                          </Typography>
                        </TableCell>
                        <TableCell>{p.txCount}</TableCell>
                        <TableCell>{p.lastDate ? formatDate(p.lastDate) : '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            {tab === 1 && (
              <>
                <Box px={2} pt={2} pb={1} display="flex" gap={1} alignItems="center">
                  <TextField size="small" label="Filter by person" value={filterPerson} onChange={(e) => setFilterPerson(e.target.value)} sx={{ width: 220 }} />
                  {filterAccount && (
                    <Chip size="small" color="info" label={filterAccount === 'Other' ? 'Any Other' : `${filterAccount} Account`} onDelete={() => setFilterAccount('')} />
                  )}
                </Box>
                <Divider />
                {bankBook && (
                  <Box px={2} py={1.5} bgcolor="action.hover">
                    <Typography variant="body2" fontWeight={600}>
                      Opening Balance: {formatCurrency(bankBook.openingBalance || 0)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Running balances below start from this opening amount.
                    </Typography>
                  </Box>
                )}
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Date</TableCell>
                        <TableCell>Account</TableCell>
                        <TableCell>Direction</TableCell>
                        <TableCell align="right">Amount</TableCell>
                        <TableCell>Person / Party</TableCell>
                        <TableCell>Description</TableCell>
                        <TableCell>Expense</TableCell>
                        <TableCell align="right">Balance</TableCell>
                        <TableCell align="right">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredTxns.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={9}>
                            <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>No transactions found.</Typography>
                          </TableCell>
                        </TableRow>
                      )}
                      {filteredTxns.map((t) => {
                        const isIn = t.transactionType === 'Money In';
                        return (
                          <TableRow key={t._id} hover>
                            <TableCell>{formatDate(t.date)}</TableCell>
                            <TableCell>
                              <Chip size="small" label={accountDisplayName(t.bankAccount, t.bankAccountOtherName)} variant="outlined" />
                            </TableCell>
                            <TableCell>
                              <Chip
                                size="small"
                                label={isIn ? '+ In' : '− Out'}
                                color={isIn ? 'success' : 'error'}
                                variant="outlined"
                                icon={isIn ? <TrendingUpIcon /> : <TrendingDownIcon />}
                              />
                            </TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700, color: isIn ? 'success.main' : 'error.main' }}>
                              {isIn ? '+' : '−'}{formatCurrency(t.amount)}
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2">{t.relatedName || '—'}</Typography>
                              {t.relatedTo && t.relatedTo !== 'Other' && (
                                <Typography variant="caption" color="text.secondary">{t.relatedTo}</Typography>
                              )}
                            </TableCell>
                            <TableCell>{t.description || '—'}</TableCell>
                            <TableCell>
                              {t.expenseCategory
                                ? <Chip size="small" label={`${t.expenseGroup || 'Expense'} / ${t.expenseCategory}`} color="warning" variant="outlined" />
                                : '—'}
                            </TableCell>
                            <TableCell align="right">
                              <Typography fontWeight={700} color={t.balance >= 0 ? 'primary.main' : 'error.main'}>
                                {formatCurrency(t.balance)}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Tooltip title="Edit">
                                <IconButton size="small" onClick={() => openEdit(t)} sx={{ mr: 0.5 }}><EditIcon fontSize="small" /></IconButton>
                              </Tooltip>
                              <Tooltip title="Delete">
                                <IconButton size="small" color="error" onClick={() => setDeleteConfirm({ open: true, id: t._id })}><DeleteIcon fontSize="small" /></IconButton>
                              </Tooltip>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              </>
            )}
          </Paper>
        </>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingId ? 'Edit Bank Transfer' : 'Add Bank Transfer'}</DialogTitle>
        <DialogContent>
          <FormControl fullWidth margin="dense" required>
            <InputLabel>Bank Account</InputLabel>
            <Select
              value={form.bankAccount}
              label="Bank Account"
              onChange={(e) => setForm((f) => ({ ...f, bankAccount: e.target.value }))}
            >
              {BANK_ACCOUNTS.map((a) => (
                <MenuItem key={a} value={a}>{a === 'Other' ? 'Any Other' : `${a} Account`}</MenuItem>
              ))}
            </Select>
          </FormControl>
          {form.bankAccount === 'Other' && (
            <TextField
              fullWidth
              label="Write bank / account name"
              value={form.bankAccountOtherName}
              onChange={(e) => setForm((f) => ({ ...f, bankAccountOtherName: e.target.value }))}
              margin="dense"
              required
              placeholder="e.g. HBL, JazzCash, EasyPaisa"
            />
          )}
          <FormControl fullWidth margin="dense" required>
            <InputLabel>Direction</InputLabel>
            <Select
              value={form.transactionType}
              label="Direction"
              onChange={(e) => setForm((f) => ({
                ...f,
                transactionType: e.target.value,
                recordAsExpense: e.target.value === 'Money Out' ? f.recordAsExpense : false,
              }))}
            >
              <MenuItem value="Money In">Money In — Received</MenuItem>
              <MenuItem value="Money Out">Money Out — Sent</MenuItem>
            </Select>
          </FormControl>
          <TextField fullWidth type="number" label="Amount (Rs.)" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} margin="dense" required />
          <FormControl fullWidth margin="dense">
            <InputLabel>Person / Party Type</InputLabel>
            <Select value={form.personType} label="Person / Party Type" onChange={(e) => setForm((f) => ({ ...f, personType: e.target.value, relatedId: '', relatedName: '' }))}>
              <MenuItem value="free">Free Text (any person)</MenuItem>
              <MenuItem value="customer">Customer</MenuItem>
              <MenuItem value="supplier">Supplier</MenuItem>
            </Select>
          </FormControl>
          {form.personType === 'free' && (
            <TextField fullWidth label="Person / Company Name" value={form.relatedName} onChange={(e) => setForm((f) => ({ ...f, relatedName: e.target.value }))} margin="dense" />
          )}
          {form.personType === 'customer' && (
            <FormControl fullWidth margin="dense" required>
              <InputLabel>Customer</InputLabel>
              <Select value={form.relatedId} label="Customer" onChange={(e) => setForm((f) => ({ ...f, relatedId: e.target.value }))}>
                {[...ledgerCustomers, ...processingCustomers].map((c) => <MenuItem key={c._id} value={c._id}>{c.name}</MenuItem>)}
              </Select>
            </FormControl>
          )}
          {form.personType === 'supplier' && (
            <FormControl fullWidth margin="dense" required>
              <InputLabel>Supplier</InputLabel>
              <Select value={form.relatedId} label="Supplier" onChange={(e) => setForm((f) => ({ ...f, relatedId: e.target.value }))}>
                {suppliers.map((s) => <MenuItem key={s._id} value={s._id}>{s.name}</MenuItem>)}
              </Select>
            </FormControl>
          )}
          <TextField fullWidth label="Account Number (optional)" value={form.bankAccountNumber} onChange={(e) => setForm((f) => ({ ...f, bankAccountNumber: e.target.value }))} margin="dense" inputProps={{ style: { fontFamily: 'monospace' } }} />
          <TextField fullWidth label="Description / Reference" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} margin="dense" />
          <TextField fullWidth type="date" label="Date" value={form.transactionDate} onChange={(e) => setForm((f) => ({ ...f, transactionDate: e.target.value }))} margin="dense" InputLabelProps={{ shrink: true }} />
          {form.transactionType === 'Money Out' && (
            <>
              <FormControlLabel
                sx={{ mt: 1 }}
                control={<Checkbox checked={form.recordAsExpense} onChange={(e) => setForm((f) => ({ ...f, recordAsExpense: e.target.checked }))} />}
                label="Record as factory / self expense"
              />
              {form.recordAsExpense && (
                <>
                  <Alert severity="info" sx={{ my: 1 }}>Appears in Expenses. Deducted from bank only — not cash in hand.</Alert>
                  <FormControl fullWidth margin="dense" required>
                    <InputLabel>Expense Group</InputLabel>
                    <Select
                      value={form.expenseGroup}
                      label="Expense Group"
                      onChange={(e) => {
                        const g = e.target.value;
                        setForm((f) => ({ ...f, expenseGroup: g, expenseCategory: BANK_EXPENSE_TREE[g]?.[0] || 'Miscellaneous' }));
                      }}
                    >
                      {Object.keys(BANK_EXPENSE_TREE).map((g) => <MenuItem key={g} value={g}>{g}</MenuItem>)}
                    </Select>
                  </FormControl>
                  <FormControl fullWidth margin="dense" required>
                    <InputLabel>Expense Category</InputLabel>
                    <Select value={form.expenseCategory} label="Expense Category" onChange={(e) => setForm((f) => ({ ...f, expenseCategory: e.target.value }))}>
                      {(BANK_EXPENSE_TREE[form.expenseGroup] || []).map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                    </Select>
                  </FormControl>
                </>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" color={form.transactionType === 'Money In' ? 'success' : 'error'} onClick={handleSave}>
            {editingId ? 'Update' : form.transactionType === 'Money In' ? 'Record Received' : 'Record Sent'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openingDialogOpen} onClose={() => setOpeningDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Set Bank Opening Balance</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 1 }}>
            This does not change old transactions. Balances after the selected date are calculated from this opening.
          </Alert>
          <FormControl fullWidth margin="dense" required>
            <InputLabel>Bank Account</InputLabel>
            <Select
              value={openingForm.bankAccount}
              label="Bank Account"
              onChange={(e) => setOpeningForm((f) => ({ ...f, bankAccount: e.target.value }))}
            >
              {BANK_ACCOUNTS.map((a) => (
                <MenuItem key={a} value={a}>{a === 'Other' ? 'Any Other' : `${a} Account`}</MenuItem>
              ))}
            </Select>
          </FormControl>
          {openingForm.bankAccount === 'Other' && (
            <TextField
              fullWidth
              label="Write bank / account name"
              value={openingForm.bankAccountOtherName}
              onChange={(e) => setOpeningForm((f) => ({ ...f, bankAccountOtherName: e.target.value }))}
              margin="dense"
              required
            />
          )}
          <TextField
            fullWidth
            type="number"
            label="Opening Balance (Rs.)"
            value={openingForm.openingBalance}
            onChange={(e) => setOpeningForm((f) => ({ ...f, openingBalance: e.target.value }))}
            margin="dense"
          />
          <TextField
            fullWidth
            type="date"
            label="As Of Date"
            value={openingForm.asOfDate}
            onChange={(e) => setOpeningForm((f) => ({ ...f, asOfDate: e.target.value }))}
            margin="dense"
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            fullWidth
            label="Note"
            value={openingForm.note}
            onChange={(e) => setOpeningForm((f) => ({ ...f, note: e.target.value }))}
            margin="dense"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpeningDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveOpening}>Save Opening</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={deleteConfirm.open}
        title="Delete Bank Transfer"
        message="Delete this bank transfer? Linked balances will be reversed."
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm({ open: false, id: null })}
      />
      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack((s) => ({ ...s, open: false }))}>
        <Alert severity={snack.severity} onClose={() => setSnack((s) => ({ ...s, open: false }))}>{snack.message}</Alert>
      </Snackbar>
    </Box>
  );
}
