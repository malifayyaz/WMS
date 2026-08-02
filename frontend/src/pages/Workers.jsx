import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  IconButton,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import { workersAPI } from '../services/api';
import { formatCurrency, formatDate } from '../utils/formatters';
import ConfirmDialog from '../components/Common/ConfirmDialog';

const defaultWorkerForm = {
  name: '',
  phone: '',
  role: '',
  active: true,
  openingBalance: '',
  notes: '',
};

const defaultEntryForm = {
  entryType: 'SalaryDue',
  amount: '',
  paymentMethod: 'Cash',
  date: new Date().toISOString().slice(0, 10),
  notes: '',
  addedBy: '',
};

export default function Workers() {
  const [workers, setWorkers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedWorkerId, setSelectedWorkerId] = useState('');
  const [ledger, setLedger] = useState(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [workerDialogOpen, setWorkerDialogOpen] = useState(false);
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [workerForm, setWorkerForm] = useState(defaultWorkerForm);
  const [entryForm, setEntryForm] = useState(defaultEntryForm);
  const [editingWorkerId, setEditingWorkerId] = useState(null);
  const [editingEntryId, setEditingEntryId] = useState(null);
  const [deleteWorkerConfirm, setDeleteWorkerConfirm] = useState({ open: false, id: null });
  const [deleteEntryConfirm, setDeleteEntryConfirm] = useState({ open: false, id: null });
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' });

  const fetchWorkers = async () => {
    setLoading(true);
    try {
      const res = await workersAPI.getAll(search ? { search } : {});
      const rows = res.data.data || [];
      setWorkers(rows);
      setSelectedWorkerId((prev) => prev || rows[0]?._id || '');
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Failed to load workers', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const fetchLedger = async (workerId) => {
    if (!workerId) {
      setLedger(null);
      return;
    }
    setLedgerLoading(true);
    try {
      const res = await workersAPI.getLedger(workerId);
      setLedger(res.data.data || null);
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Failed to load worker ledger', severity: 'error' });
      setLedger(null);
    } finally {
      setLedgerLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkers();
  }, [search]);

  useEffect(() => {
    fetchLedger(selectedWorkerId);
  }, [selectedWorkerId]);

  const selectedWorker = useMemo(
    () => workers.find((worker) => worker._id === selectedWorkerId) || null,
    [workers, selectedWorkerId]
  );

  const openAddWorker = () => {
    setEditingWorkerId(null);
    setWorkerForm(defaultWorkerForm);
    setWorkerDialogOpen(true);
  };

  const openEditWorker = (worker) => {
    setEditingWorkerId(worker._id);
    setWorkerForm({
      name: worker.name || '',
      phone: worker.phone || '',
      role: worker.role || '',
      active: worker.active !== false,
      openingBalance: worker.openingBalance ? String(worker.openingBalance) : '',
      notes: worker.notes || '',
    });
    setWorkerDialogOpen(true);
  };

  const openAddEntry = () => {
    setEditingEntryId(null);
    setEntryForm({ ...defaultEntryForm, date: new Date().toISOString().slice(0, 10) });
    setEntryDialogOpen(true);
  };

  const openEditEntry = (entry) => {
    setEditingEntryId(entry._id);
    setEntryForm({
      entryType: entry.entryType,
      amount: entry.amount != null ? String(entry.amount) : '',
      paymentMethod: entry.paymentMethod || 'Cash',
      date: entry.date ? new Date(entry.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      notes: entry.notes || '',
      addedBy: entry.addedBy || '',
    });
    setEntryDialogOpen(true);
  };

  const handleSaveWorker = async () => {
    if (!workerForm.name.trim()) {
      setSnack({ open: true, message: 'Worker name is required', severity: 'error' });
      return;
    }
    try {
      const payload = {
        ...workerForm,
        openingBalance: Number(workerForm.openingBalance) || 0,
      };
      if (editingWorkerId) {
        await workersAPI.update(editingWorkerId, payload);
      } else {
        await workersAPI.create(payload);
      }
      setSnack({ open: true, message: editingWorkerId ? 'Worker updated' : 'Worker created', severity: 'success' });
      setWorkerDialogOpen(false);
      fetchWorkers();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Error saving worker', severity: 'error' });
    }
  };

  const handleSaveEntry = async () => {
    if (!selectedWorkerId) return;
    if (!entryForm.amount || Number(entryForm.amount) <= 0) {
      setSnack({ open: true, message: 'Amount must be greater than 0', severity: 'error' });
      return;
    }
    try {
      const payload = {
        ...entryForm,
        amount: Number(entryForm.amount),
        paymentMethod: ['Payment', 'Advance'].includes(entryForm.entryType) ? entryForm.paymentMethod : undefined,
      };
      if (editingEntryId) {
        await workersAPI.updateEntry(selectedWorkerId, editingEntryId, payload);
      } else {
        await workersAPI.createEntry(selectedWorkerId, payload);
      }
      setSnack({ open: true, message: editingEntryId ? 'Ledger entry updated' : 'Ledger entry saved', severity: 'success' });
      setEntryDialogOpen(false);
      fetchWorkers();
      fetchLedger(selectedWorkerId);
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Error saving ledger entry', severity: 'error' });
    }
  };

  const handleDeleteWorker = async () => {
    try {
      await workersAPI.delete(deleteWorkerConfirm.id);
      setSnack({ open: true, message: 'Worker deleted', severity: 'success' });
      setDeleteWorkerConfirm({ open: false, id: null });
      if (selectedWorkerId === deleteWorkerConfirm.id) setSelectedWorkerId('');
      fetchWorkers();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Error deleting worker', severity: 'error' });
    }
  };

  const handleDeleteEntry = async () => {
    try {
      await workersAPI.deleteEntry(selectedWorkerId, deleteEntryConfirm.id);
      setSnack({ open: true, message: 'Ledger entry deleted', severity: 'success' });
      setDeleteEntryConfirm({ open: false, id: null });
      fetchWorkers();
      fetchLedger(selectedWorkerId);
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Error deleting ledger entry', severity: 'error' });
    }
  };

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>
        Workers use a running ledger. Salary payments and advances create linked Labour expenses automatically, while old Labour expense rows stay unchanged.
      </Alert>

      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} flexWrap="wrap" gap={1}>
        <TextField size="small" placeholder="Search workers..." value={search} onChange={(e) => setSearch(e.target.value)} sx={{ minWidth: 220 }} />
        <Button variant="contained" startIcon={<AddIcon />} onClick={openAddWorker}>Add Worker</Button>
      </Box>

      <Box display="grid" gridTemplateColumns={{ xs: '1fr', lg: '380px 1fr' }} gap={2}>
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>Workers</Typography>
          {loading ? (
            <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Role</TableCell>
                    <TableCell align="right">Remaining</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {workers.map((worker) => (
                    <TableRow
                      key={worker._id}
                      hover
                      selected={selectedWorkerId === worker._id}
                      onClick={() => setSelectedWorkerId(worker._id)}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell>
                        <Typography fontWeight={600}>{worker.name}</Typography>
                        <Typography variant="caption" color="text.secondary">{worker.phone || '—'}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{worker.role || '—'}</Typography>
                        <Chip size="small" sx={{ mt: 0.5 }} label={worker.active ? 'Active' : 'Inactive'} color={worker.active ? 'success' : 'default'} variant="outlined" />
                      </TableCell>
                      <TableCell align="right">
                        <Typography fontWeight={700} color={(worker.summary?.remaining || 0) > 0 ? 'error.main' : 'success.main'}>
                          {formatCurrency(worker.summary?.remaining || 0)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <IconButton size="small" onClick={(e) => { e.stopPropagation(); setSelectedWorkerId(worker._id); }}><MenuBookIcon fontSize="small" /></IconButton>
                        <IconButton size="small" onClick={(e) => { e.stopPropagation(); openEditWorker(worker); }}><EditIcon fontSize="small" /></IconButton>
                        <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); setDeleteWorkerConfirm({ open: true, id: worker._id }); }}><DeleteIcon fontSize="small" /></IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!workers.length && (
                    <TableRow>
                      <TableCell colSpan={4}>
                        <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>No workers recorded yet.</Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>

        <Paper sx={{ p: 2 }}>
          {!selectedWorker ? (
            <Typography color="text.secondary">Select a worker to view the running ledger.</Typography>
          ) : ledgerLoading ? (
            <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>
          ) : (
            <>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} flexWrap="wrap" gap={1}>
                <Box>
                  <Typography variant="h6">{selectedWorker.name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {selectedWorker.role || 'No role'}{selectedWorker.phone ? ` · ${selectedWorker.phone}` : ''}
                  </Typography>
                </Box>
                <Button variant="contained" startIcon={<AddIcon />} onClick={openAddEntry}>Add Ledger Entry</Button>
              </Box>

              <Box display="flex" gap={2} flexWrap="wrap" mb={2}>
                <Paper sx={{ p: 1.5, minWidth: 150 }} variant="outlined">
                  <Typography variant="caption" color="text.secondary">Opening</Typography>
                  <Typography fontWeight={700}>{formatCurrency(ledger?.openingBalance || 0)}</Typography>
                </Paper>
                <Paper sx={{ p: 1.5, minWidth: 150 }} variant="outlined">
                  <Typography variant="caption" color="text.secondary">Salary Due</Typography>
                  <Typography fontWeight={700}>{formatCurrency(ledger?.summary?.salaryDue || 0)}</Typography>
                </Paper>
                <Paper sx={{ p: 1.5, minWidth: 150 }} variant="outlined">
                  <Typography variant="caption" color="text.secondary">Payments</Typography>
                  <Typography fontWeight={700}>{formatCurrency(ledger?.summary?.payments || 0)}</Typography>
                </Paper>
                <Paper sx={{ p: 1.5, minWidth: 150 }} variant="outlined">
                  <Typography variant="caption" color="text.secondary">Advances</Typography>
                  <Typography fontWeight={700}>{formatCurrency(ledger?.summary?.advances || 0)}</Typography>
                </Paper>
                <Paper sx={{ p: 1.5, minWidth: 150 }} variant="outlined">
                  <Typography variant="caption" color="text.secondary">Remaining</Typography>
                  <Typography fontWeight={700} color={(ledger?.summary?.remaining || 0) > 0 ? 'error.main' : 'success.main'}>
                    {formatCurrency(ledger?.summary?.remaining || 0)}
                  </Typography>
                </Paper>
              </Box>

              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Date</TableCell>
                      <TableCell>Entry</TableCell>
                      <TableCell>Notes</TableCell>
                      <TableCell>Payment</TableCell>
                      <TableCell align="right">Amount</TableCell>
                      <TableCell align="right">Balance After</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(ledger?.entries || []).map((entry) => (
                      <TableRow key={entry._id}>
                        <TableCell>{formatDate(entry.date)}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={entry.entryType === 'SalaryDue'
                              ? 'Salary Due'
                              : entry.entryType === 'Payment'
                                ? 'Payment'
                                : entry.entryType === 'Advance'
                                  ? 'Advance'
                                  : 'Adjustment'}
                            color={entry.entryType === 'SalaryDue' ? 'warning' : entry.entryType === 'Payment' ? 'success' : entry.entryType === 'Advance' ? 'secondary' : 'default'}
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>{entry.notes || '—'}</TableCell>
                        <TableCell>{entry.paymentMethod || '—'}</TableCell>
                        <TableCell align="right">{formatCurrency(entry.amount)}</TableCell>
                        <TableCell align="right">{formatCurrency(entry.balanceAfter)}</TableCell>
                        <TableCell align="right">
                          <IconButton size="small" onClick={() => openEditEntry(entry)}><EditIcon fontSize="small" /></IconButton>
                          <IconButton size="small" color="error" onClick={() => setDeleteEntryConfirm({ open: true, id: entry._id })}><DeleteIcon fontSize="small" /></IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!(ledger?.entries || []).length && (
                      <TableRow>
                        <TableCell colSpan={7}>
                          <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>No ledger entries yet.</Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </Paper>
      </Box>

      <Dialog open={workerDialogOpen} onClose={() => setWorkerDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingWorkerId ? 'Edit Worker' : 'Add Worker'}</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="Name" value={workerForm.name} onChange={(e) => setWorkerForm((f) => ({ ...f, name: e.target.value }))} margin="dense" required />
          <TextField fullWidth label="Phone" value={workerForm.phone} onChange={(e) => setWorkerForm((f) => ({ ...f, phone: e.target.value }))} margin="dense" />
          <TextField fullWidth label="Role" value={workerForm.role} onChange={(e) => setWorkerForm((f) => ({ ...f, role: e.target.value }))} margin="dense" />
          <FormControl fullWidth margin="dense">
            <InputLabel>Status</InputLabel>
            <Select value={workerForm.active ? 'active' : 'inactive'} label="Status" onChange={(e) => setWorkerForm((f) => ({ ...f, active: e.target.value === 'active' }))}>
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="inactive">Inactive</MenuItem>
            </Select>
          </FormControl>
          <TextField fullWidth type="number" label="Opening Balance" value={workerForm.openingBalance} onChange={(e) => setWorkerForm((f) => ({ ...f, openingBalance: e.target.value }))} margin="dense" helperText="Starting remaining amount before this ledger begins" />
          <TextField fullWidth label="Notes" value={workerForm.notes} onChange={(e) => setWorkerForm((f) => ({ ...f, notes: e.target.value }))} margin="dense" multiline minRows={2} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setWorkerDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveWorker}>Save</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={entryDialogOpen} onClose={() => setEntryDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingEntryId ? 'Edit Worker Ledger Entry' : 'Add Worker Ledger Entry'}</DialogTitle>
        <DialogContent>
          <FormControl fullWidth margin="dense">
            <InputLabel>Entry Type</InputLabel>
            <Select value={entryForm.entryType} label="Entry Type" onChange={(e) => setEntryForm((f) => ({ ...f, entryType: e.target.value }))}>
              <MenuItem value="SalaryDue">Salary Due</MenuItem>
              <MenuItem value="Payment">Payment</MenuItem>
              <MenuItem value="Advance">Advance</MenuItem>
              <MenuItem value="Adjustment">Adjustment</MenuItem>
            </Select>
          </FormControl>
          {['Payment', 'Advance'].includes(entryForm.entryType) && (
            <Alert severity="info" sx={{ my: 1 }}>
              This entry will create a linked Labour expense automatically.
            </Alert>
          )}
          <TextField fullWidth type="number" label="Amount" value={entryForm.amount} onChange={(e) => setEntryForm((f) => ({ ...f, amount: e.target.value }))} margin="dense" required />
          {['Payment', 'Advance'].includes(entryForm.entryType) && (
            <FormControl fullWidth margin="dense">
              <InputLabel>Payment Method</InputLabel>
              <Select value={entryForm.paymentMethod} label="Payment Method" onChange={(e) => setEntryForm((f) => ({ ...f, paymentMethod: e.target.value }))}>
                <MenuItem value="Cash">Cash</MenuItem>
                <MenuItem value="Bank Transfer">Bank Transfer</MenuItem>
                <MenuItem value="Cheque">Cheque</MenuItem>
              </Select>
            </FormControl>
          )}
          <TextField fullWidth type="date" label="Date" value={entryForm.date} onChange={(e) => setEntryForm((f) => ({ ...f, date: e.target.value }))} margin="dense" InputLabelProps={{ shrink: true }} />
          <TextField fullWidth label="Added By" value={entryForm.addedBy} onChange={(e) => setEntryForm((f) => ({ ...f, addedBy: e.target.value }))} margin="dense" />
          <TextField fullWidth label="Notes" value={entryForm.notes} onChange={(e) => setEntryForm((f) => ({ ...f, notes: e.target.value }))} margin="dense" multiline minRows={2} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEntryDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveEntry}>Save</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={deleteWorkerConfirm.open}
        title="Delete Worker"
        message="Delete this worker? Workers with ledger entries cannot be deleted."
        onConfirm={handleDeleteWorker}
        onCancel={() => setDeleteWorkerConfirm({ open: false, id: null })}
      />
      <ConfirmDialog
        open={deleteEntryConfirm.open}
        title="Delete Worker Ledger Entry"
        message="Delete this ledger entry? Any linked Labour expense will also be deleted."
        onConfirm={handleDeleteEntry}
        onCancel={() => setDeleteEntryConfirm({ open: false, id: null })}
      />
      <Snackbar open={snack.open} autoHideDuration={6000} onClose={() => setSnack((s) => ({ ...s, open: false }))}>
        <Alert severity={snack.severity}>{snack.message}</Alert>
      </Snackbar>
    </Box>
  );
}
