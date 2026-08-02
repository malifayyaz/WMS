import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Button,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
  Alert,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import { suppliersAPI } from '../services/api';
import { formatCurrency } from '../utils/formatters';
import ConfirmDialog from '../components/Common/ConfirmDialog';
import ExportButtons from '../components/Common/ExportButtons';
import LedgerDialog from '../components/Common/LedgerDialog';

const supplierExportColumns = [
  { id: 'Name', label: 'Name' },
  { id: 'Contact', label: 'Contact' },
  { id: 'Company', label: 'Company' },
  { id: 'Address', label: 'Address' },
  { id: 'Total Purchased', label: 'Total Purchased' },
  { id: 'Paid', label: 'Paid' },
  { id: 'Due', label: 'Due' },
];

function toSupplierExportRows(rows) {
  return rows.map((row) => ({
    Name: row.name || '',
    Contact: row.contactNumber || '',
    Company: row.companyName || '',
    Address: row.address || '',
    'Total Purchased': formatCurrency(row.totalAmountPurchased),
    Paid: formatCurrency(row.totalAmountPaid),
    Due: formatCurrency(row.totalAmountDue),
  }));
}

const defaultSupplier = {
  name: '',
  contactNumber: '',
  companyName: '',
  address: '',
  materialTypes: [],
  openingBalance: '',
  openingBalanceDate: new Date().toISOString().slice(0, 10),
  openingBalanceType: 'none',
};

export default function Suppliers() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(defaultSupplier);
  const [editingId, setEditingId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, id: null });
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' });
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [ledgerSupplier, setLedgerSupplier] = useState(null);

  const fetchList = async () => {
    setLoading(true);
    try {
      const res = await suppliersAPI.getAll(search ? { search } : {});
      setList(res.data.data || []);
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Failed to load', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
  }, [search]);

  const handleOpenAdd = () => {
    setForm(defaultSupplier);
    setEditingId(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (row) => {
    setForm({
      name: row.name,
      contactNumber: row.contactNumber || '',
      companyName: row.companyName || '',
      address: row.address || '',
      materialTypes: row.materialTypes || [],
      openingBalance: row.openingBalance || '',
      openingBalanceDate: row.openingBalanceDate
        ? new Date(row.openingBalanceDate).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10),
      openingBalanceType: row.openingBalanceType || 'none',
    });
    setEditingId(row._id);
    setDialogOpen(true);
  };

  const handleOpenLedger = (row) => {
    setLedgerSupplier(row);
    setLedgerOpen(true);
  };

  const fetchLedger = useCallback(
    (params) => suppliersAPI.getLedger(ledgerSupplier._id, params),
    [ledgerSupplier]
  );

  const handleSave = async () => {
    if (!form.name.trim()) {
      setSnack({ open: true, message: 'Name is required', severity: 'error' });
      return;
    }
    try {
      const payload = {
        ...form,
        openingBalance: form.openingBalanceType !== 'none' && form.openingBalance
          ? Number(form.openingBalance)
          : 0,
      };
      if (editingId) await suppliersAPI.update(editingId, payload);
      else await suppliersAPI.create(payload);
      setSnack({ open: true, message: editingId ? 'Updated' : 'Created', severity: 'success' });
      setDialogOpen(false);
      fetchList();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Error', severity: 'error' });
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm.id) return;
    try {
      await suppliersAPI.delete(deleteConfirm.id);
      setSnack({ open: true, message: 'Deleted', severity: 'success' });
      setDeleteConfirm({ open: false, id: null });
      fetchList();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Error', severity: 'error' });
    }
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} flexWrap="wrap" gap={1}>
        <TextField size="small" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} sx={{ minWidth: 200 }} />
        <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
          {list.length > 0 && (
            <ExportButtons
              data={toSupplierExportRows(list)}
              columns={supplierExportColumns}
              filename="suppliers"
              title="Suppliers List"
            />
          )}
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenAdd}>Add Supplier</Button>
        </Box>
      </Box>
      {loading ? (
        <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Contact</TableCell>
                <TableCell>Company</TableCell>
                <TableCell align="right">Purchased</TableCell>
                <TableCell align="right">Paid</TableCell>
                <TableCell align="right">Due</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {list.map((row) => (
                <TableRow key={row._id}>
                  <TableCell>{row.name}</TableCell>
                  <TableCell>{row.contactNumber}</TableCell>
                  <TableCell>{row.companyName}</TableCell>
                  <TableCell align="right">{formatCurrency(row.totalAmountPurchased)}</TableCell>
                  <TableCell align="right">{formatCurrency(row.totalAmountPaid)}</TableCell>
                  <TableCell align="right">{formatCurrency(row.totalAmountDue)}</TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => handleOpenLedger(row)} title="View Ledger"><MenuBookIcon /></IconButton>
                    <IconButton size="small" onClick={() => handleOpenEdit(row)}><EditIcon /></IconButton>
                    <IconButton size="small" color="error" onClick={() => setDeleteConfirm({ open: true, id: row._id })}><DeleteIcon /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingId ? 'Edit Supplier' : 'Add Supplier'}</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} margin="dense" required />
          <TextField fullWidth label="Contact Number" value={form.contactNumber} onChange={(e) => setForm((f) => ({ ...f, contactNumber: e.target.value }))} margin="dense" />
          <TextField fullWidth label="Company Name" value={form.companyName} onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))} margin="dense" />
          <TextField fullWidth label="Address" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} margin="dense" />
          <FormControl fullWidth margin="dense">
            <InputLabel>Opening Balance Type</InputLabel>
            <Select
              value={form.openingBalanceType}
              onChange={(e) => setForm((f) => ({ ...f, openingBalanceType: e.target.value, openingBalance: e.target.value === 'none' ? '' : f.openingBalance }))}
              label="Opening Balance Type"
            >
              <MenuItem value="none">None — No opening balance</MenuItem>
              <MenuItem value="credit">Debit — We owe supplier</MenuItem>
              <MenuItem value="debit">Credit — They owe us (advance paid)</MenuItem>
            </Select>
          </FormControl>
          {form.openingBalanceType !== 'none' && (
            <>
              <TextField
                fullWidth
                type="number"
                label="Opening Balance"
                value={form.openingBalance}
                onChange={(e) => setForm((f) => ({ ...f, openingBalance: e.target.value }))}
                margin="dense"
                helperText="Amount owed to supplier before you start recording transactions"
              />
              <TextField
                fullWidth
                type="date"
                label="Opening Balance Date"
                value={form.openingBalanceDate}
                onChange={(e) => setForm((f) => ({ ...f, openingBalanceDate: e.target.value }))}
                margin="dense"
                InputLabelProps={{ shrink: true }}
              />
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>Save</Button>
        </DialogActions>
      </Dialog>
      {ledgerSupplier && (
        <LedgerDialog
          open={ledgerOpen}
          onClose={() => { setLedgerOpen(false); setLedgerSupplier(null); }}
          title={`Ledger — ${ledgerSupplier.name}`}
          fetchLedger={fetchLedger}
          partyType="Supplier"
          linked={!!ledgerSupplier.linkedCustomerId}
          primaryRole="supplier"
        />
      )}
      <ConfirmDialog open={deleteConfirm.open} title="Delete Supplier" message="Are you sure you want to delete this supplier?" onConfirm={handleDelete} onCancel={() => setDeleteConfirm({ open: false, id: null })} />
      <Snackbar open={snack.open} autoHideDuration={6000} onClose={() => setSnack((p) => ({ ...p, open: false }))}>
        <Alert severity={snack.severity}>{snack.message}</Alert>
      </Snackbar>
    </Box>
  );
}
