import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
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
import { annealingPersonAPI } from '../services/api';
import { formatCurrency, formatDate } from '../utils/formatters';
import ConfirmDialog from '../components/Common/ConfirmDialog';
import AccessDeniedSnackbar from '../components/Common/AccessDeniedSnackbar';
import ResponsiveDialog from '../components/Common/ResponsiveDialog';
import PageToolbar from '../components/Common/PageToolbar';
import { useIsMobile } from '../hooks/useBreakpoint';
import { usePermissions } from '../hooks/usePermissions';

const defaultPersonForm = {
  name: '',
  contactNumber: '',
  openingBalance: '',
  openingBalanceType: 'none',
};

const defaultEntryForm = {
  isIncreaseDue: true, // true = Bill, false = Payment
  amount: '',
  paymentMethod: 'Cash',
  paymentDate: new Date().toISOString().slice(0, 10),
  note: '',
  paidBy: '',
};

export default function AnnealingPersons() {
  const { isViewer } = usePermissions();
  const isMobile = useIsMobile();
  const [accessDenied, setAccessDenied] = useState(false);
  const [persons, setPersons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPersonId, setSelectedPersonId] = useState('');
  
  const [personDialogOpen, setPersonDialogOpen] = useState(false);
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  
  const [personForm, setPersonForm] = useState(defaultPersonForm);
  const [entryForm, setEntryForm] = useState(defaultEntryForm);
  
  const [editingPersonId, setEditingPersonId] = useState(null);
  const [deletePersonConfirm, setDeletePersonConfirm] = useState({ open: false, id: null });
  
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' });

  const fetchPersons = async () => {
    setLoading(true);
    try {
      const res = await annealingPersonAPI.getAll();
      const rows = res.data.data || [];
      setPersons(rows);
      if (!selectedPersonId && rows.length > 0) {
        setSelectedPersonId(rows[0]._id);
      }
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Failed to load annealing persons', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPersons();
  }, []);

  const selectedPerson = useMemo(
    () => persons.find((p) => p._id === selectedPersonId) || null,
    [persons, selectedPersonId]
  );

  const openAddPerson = () => {
    setEditingPersonId(null);
    setPersonForm(defaultPersonForm);
    setPersonDialogOpen(true);
  };

  const openEditPerson = (person) => {
    setEditingPersonId(person._id);
    setPersonForm({
      name: person.name || '',
      contactNumber: person.contactNumber || '',
      openingBalance: person.openingBalance ? String(person.openingBalance) : '',
      openingBalanceType: person.openingBalanceType || 'none',
    });
    setPersonDialogOpen(true);
  };

  const openAddEntry = () => {
    setEntryForm({ ...defaultEntryForm, paymentDate: new Date().toISOString().slice(0, 10) });
    setEntryDialogOpen(true);
  };

  const handleSavePerson = async () => {
    if (!personForm.name.trim()) {
      setSnack({ open: true, message: 'Name is required', severity: 'error' });
      return;
    }
    try {
      const payload = {
        ...personForm,
        openingBalance: Number(personForm.openingBalance) || 0,
      };
      if (editingPersonId) {
        await annealingPersonAPI.update(editingPersonId, payload);
      } else {
        await annealingPersonAPI.create(payload);
      }
      setSnack({ open: true, message: editingPersonId ? 'Person updated' : 'Person created', severity: 'success' });
      setPersonDialogOpen(false);
      fetchPersons();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Error saving person', severity: 'error' });
    }
  };

  const handleSaveEntry = async () => {
    if (!selectedPersonId) return;
    if (!entryForm.amount || Number(entryForm.amount) <= 0) {
      setSnack({ open: true, message: 'Amount must be greater than 0', severity: 'error' });
      return;
    }
    try {
      const payload = {
        ...entryForm,
        amount: Number(entryForm.amount),
        paymentMethod: entryForm.isIncreaseDue ? undefined : entryForm.paymentMethod,
      };
      await annealingPersonAPI.addPayment(selectedPersonId, payload);
      setSnack({ open: true, message: 'Ledger entry saved', severity: 'success' });
      setEntryDialogOpen(false);
      fetchPersons();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Error saving ledger entry', severity: 'error' });
    }
  };

  const handleDeletePerson = async () => {
    try {
      await annealingPersonAPI.delete(deletePersonConfirm.id);
      setSnack({ open: true, message: 'Person deleted', severity: 'success' });
      setDeletePersonConfirm({ open: false, id: null });
      if (selectedPersonId === deletePersonConfirm.id) setSelectedPersonId('');
      fetchPersons();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Error deleting person', severity: 'error' });
    }
  };

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>
        Manage annealing ledgers. Add bills for money owed, and record payments.
      </Alert>

      <PageToolbar>
        <Box sx={{ flexGrow: 1 }} />
        <Button
          variant="contained"
          fullWidth={isMobile}
          startIcon={<AddIcon />}
          onClick={() => {
            if (isViewer) { setAccessDenied(true); return; }
            openAddPerson();
          }}
        >
          Add Person
        </Button>
      </PageToolbar>

      <Box display="grid" gridTemplateColumns={{ xs: '1fr', lg: '380px 1fr' }} gap={2}>
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>Annealing Persons</Typography>
          {loading ? (
            <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell align="right">Amount Due</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {persons.map((person) => (
                    <TableRow
                      key={person._id}
                      hover
                      selected={selectedPersonId === person._id}
                      onClick={() => setSelectedPersonId(person._id)}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell>
                        <Typography fontWeight={600}>{person.name}</Typography>
                        <Typography variant="caption" color="text.secondary">{person.contactNumber || '—'}</Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography fontWeight={700} color={person.totalAmountDue > 0 ? 'error.main' : 'success.main'}>
                          {formatCurrency(person.totalAmountDue)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        <IconButton
                          size={isMobile ? 'medium' : 'small'}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isViewer) { setAccessDenied(true); return; }
                            openEditPerson(person);
                          }}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size={isMobile ? 'medium' : 'small'}
                          color="error"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isViewer) { setAccessDenied(true); return; }
                            setDeletePersonConfirm({ open: true, id: person._id });
                          }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!persons.length && (
                    <TableRow>
                      <TableCell colSpan={3}>
                        <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>No persons recorded yet.</Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>

        <Paper sx={{ p: 2 }}>
          {!selectedPerson ? (
            <Typography color="text.secondary">Select a person to view their ledger.</Typography>
          ) : (
            <>
              <Box
                display="flex"
                flexDirection={{ xs: 'column', sm: 'row' }}
                justifyContent="space-between"
                alignItems={{ xs: 'stretch', sm: 'center' }}
                mb={2}
                gap={1}
              >
                <Box>
                  <Typography variant="h6">{selectedPerson.name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {selectedPerson.contactNumber || 'No contact info'}
                  </Typography>
                </Box>
                <Button
                  variant="contained"
                  fullWidth={isMobile}
                  startIcon={<AddIcon />}
                  onClick={() => {
                    if (isViewer) { setAccessDenied(true); return; }
                    openAddEntry();
                  }}
                >
                  Add Ledger Entry
                </Button>
              </Box>

              <Box display="flex" gap={1.5} flexWrap="wrap" mb={2}>
                <Paper sx={{ p: 1.5, minWidth: { xs: 'calc(50% - 6px)', sm: 150 }, flex: { xs: '1 1 40%', sm: '0 0 auto' } }} variant="outlined">
                  <Typography variant="caption" color="text.secondary">Total Amount Paid</Typography>
                  <Typography fontWeight={700}>{formatCurrency(selectedPerson.totalAmountPaid)}</Typography>
                </Paper>
                <Paper sx={{ p: 1.5, minWidth: { xs: 'calc(50% - 6px)', sm: 150 }, flex: { xs: '1 1 40%', sm: '0 0 auto' } }} variant="outlined">
                  <Typography variant="caption" color="text.secondary">Total Amount Due</Typography>
                  <Typography fontWeight={700} color={selectedPerson.totalAmountDue > 0 ? 'error.main' : 'success.main'}>
                    {formatCurrency(selectedPerson.totalAmountDue)}
                  </Typography>
                </Paper>
              </Box>

              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Date</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>Notes</TableCell>
                      <TableCell>Method</TableCell>
                      <TableCell align="right">Amount</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(selectedPerson.paymentHistory || []).slice().reverse().map((entry, index) => (
                      <TableRow key={index}>
                        <TableCell>{formatDate(entry.paymentDate)}</TableCell>
                        <TableCell>
                          {entry.paymentMethod === 'Cash' && entry.note?.includes('Bill') ? 'Bill Added' : 'Payment'}
                        </TableCell>
                        <TableCell>{entry.note || '—'}</TableCell>
                        <TableCell>{entry.paymentMethod || '—'}</TableCell>
                        <TableCell align="right">{formatCurrency(entry.amount)}</TableCell>
                      </TableRow>
                    ))}
                    {!(selectedPerson.paymentHistory || []).length && (
                      <TableRow>
                        <TableCell colSpan={5}>
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

      <ResponsiveDialog open={personDialogOpen} onClose={() => setPersonDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingPersonId ? 'Edit Person' : 'Add Person'}</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="Name" value={personForm.name} onChange={(e) => setPersonForm((f) => ({ ...f, name: e.target.value }))} margin="dense" required />
          <TextField fullWidth label="Contact Number" value={personForm.contactNumber} onChange={(e) => setPersonForm((f) => ({ ...f, contactNumber: e.target.value }))} margin="dense" />
          
          {!editingPersonId && (
            <>
              <TextField fullWidth type="number" label="Opening Balance" value={personForm.openingBalance} onChange={(e) => setPersonForm((f) => ({ ...f, openingBalance: e.target.value }))} margin="dense" />
              <FormControl fullWidth margin="dense">
                <InputLabel>Balance Type</InputLabel>
                <Select value={personForm.openingBalanceType} label="Balance Type" onChange={(e) => setPersonForm((f) => ({ ...f, openingBalanceType: e.target.value }))}>
                  <MenuItem value="none">None / Zero</MenuItem>
                  <MenuItem value="credit">Credit (I owe them)</MenuItem>
                  <MenuItem value="debit">Debit (They owe me)</MenuItem>
                </Select>
              </FormControl>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPersonDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSavePerson}>Save</Button>
        </DialogActions>
      </ResponsiveDialog>

      <ResponsiveDialog open={entryDialogOpen} onClose={() => setEntryDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Ledger Entry</DialogTitle>
        <DialogContent>
          <FormControl fullWidth margin="dense">
            <InputLabel>Entry Type</InputLabel>
            <Select value={entryForm.isIncreaseDue ? 'bill' : 'payment'} label="Entry Type" onChange={(e) => setEntryForm((f) => ({ ...f, isIncreaseDue: e.target.value === 'bill' }))}>
              <MenuItem value="bill">Add Bill (Money owed to them)</MenuItem>
              <MenuItem value="payment">Record Payment (Money paid to them)</MenuItem>
            </Select>
          </FormControl>
          <TextField fullWidth type="number" label="Amount" value={entryForm.amount} onChange={(e) => setEntryForm((f) => ({ ...f, amount: e.target.value }))} margin="dense" required />
          
          {!entryForm.isIncreaseDue && (
            <FormControl fullWidth margin="dense">
              <InputLabel>Payment Method</InputLabel>
              <Select value={entryForm.paymentMethod} label="Payment Method" onChange={(e) => setEntryForm((f) => ({ ...f, paymentMethod: e.target.value }))}>
                <MenuItem value="Cash">Cash</MenuItem>
                <MenuItem value="Bank Transfer">Bank Transfer</MenuItem>
                <MenuItem value="Cheque">Cheque</MenuItem>
              </Select>
            </FormControl>
          )}
          
          <TextField fullWidth type="date" label="Date" value={entryForm.paymentDate} onChange={(e) => setEntryForm((f) => ({ ...f, paymentDate: e.target.value }))} margin="dense" InputLabelProps={{ shrink: true }} />
          <TextField fullWidth label="Paid By" value={entryForm.paidBy} onChange={(e) => setEntryForm((f) => ({ ...f, paidBy: e.target.value }))} margin="dense" />
          <TextField fullWidth label="Notes" value={entryForm.note} onChange={(e) => setEntryForm((f) => ({ ...f, note: e.target.value }))} margin="dense" multiline minRows={2} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEntryDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveEntry}>Save</Button>
        </DialogActions>
      </ResponsiveDialog>

      <ConfirmDialog
        open={deletePersonConfirm.open}
        title="Delete Person"
        message="Delete this annealing person and all ledger history?"
        onConfirm={handleDeletePerson}
        onCancel={() => setDeletePersonConfirm({ open: false, id: null })}
      />
      
      <Snackbar open={snack.open} autoHideDuration={6000} onClose={() => setSnack((s) => ({ ...s, open: false }))}>
        <Alert severity={snack.severity}>{snack.message}</Alert>
      </Snackbar>
      <AccessDeniedSnackbar
        open={accessDenied}
        onClose={() => setAccessDenied(false)}
        message="Access Denied: Viewers cannot perform this action."
      />
    </Box>
  );
}
