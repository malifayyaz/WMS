import React, { useState, useEffect } from 'react';
import {
  Box, Button, TextField, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  IconButton, Dialog, DialogTitle, DialogContent, DialogActions, Snackbar, Alert, CircularProgress,
  FormControl, InputLabel, Select, MenuItem, Tabs, Tab, Card, CardContent, Typography, Grid, Chip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { rawMaterialsAPI, suppliersAPI } from '../services/api';
import { formatCurrency, formatDate } from '../utils/formatters';
import ConfirmDialog from '../components/Common/ConfirmDialog';

const paymentMethods = ['Cash', 'Bank Transfer', 'Cheque'];
const COIL_CATEGORIES = ['Shiplet Coil', 'Patri Coil'];
const toInputDate = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '');

export default function RawMaterials() {
  const [list, setList] = useState([]);
  const [summary, setSummary] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    supplierId: '', coilCategory: 'Shiplet Coil', materialType: '', weightInKg: '', ratePerKg: '',
    amountPaid: 0, paymentMethod: 'Cash', paidBy: '', purchaseDate: '', notes: '',
  });
  const [editingId, setEditingId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, id: null });
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' });

  const categoryFilter = tab === 1 ? 'Shiplet Coil' : tab === 2 ? 'Patri Coil' : '';

  const fetchList = async () => {
    setLoading(true);
    try {
      const params = categoryFilter ? { coilCategory: categoryFilter } : {};
      const [res, supRes, sumRes] = await Promise.all([
        rawMaterialsAPI.getAll(params), suppliersAPI.getAll(), rawMaterialsAPI.getStockSummary(),
      ]);
      setList(res.data.data || []);
      setSuppliers(supRes.data.data || []);
      setSummary(sumRes.data.data || []);
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Failed to load', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchList(); }, [tab]);

  const handleOpenAdd = (coilCategory = 'Shiplet Coil') => {
    setForm({
      supplierId: suppliers[0]?._id || '', coilCategory, materialType: coilCategory,
      weightInKg: '', ratePerKg: '', amountPaid: 0, paymentMethod: 'Cash', paidBy: '',
      purchaseDate: new Date().toISOString().slice(0, 10), notes: '',
    });
    setEditingId(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (row) => {
    setForm({
      supplierId: row.supplierId?._id || row.supplierId,
      coilCategory: row.coilCategory || 'Shiplet Coil',
      materialType: row.materialType,
      weightInKg: row.weightInKg,
      ratePerKg: row.ratePerKg,
      amountPaid: row.amountPaid || 0,
      paymentMethod: row.paymentMethod || 'Cash',
      paidBy: row.paidBy || '',
      purchaseDate: toInputDate(row.purchaseDate),
      notes: row.notes || '',
    });
    setEditingId(row._id);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.supplierId || !form.coilCategory || !form.weightInKg || !form.ratePerKg) {
      setSnack({ open: true, message: 'Supplier, coil category, weight and rate required', severity: 'error' });
      return;
    }
    const payload = {
      ...form,
      materialType: form.materialType || form.coilCategory,
      weightInKg: Number(form.weightInKg),
      ratePerKg: Number(form.ratePerKg),
      amountPaid: Number(form.amountPaid) || 0,
      purchaseDate: form.purchaseDate || undefined,
    };
    try {
      let msg;
      if (editingId) {
        await rawMaterialsAPI.update(editingId, payload);
        msg = 'Updated';
      } else {
        const res = await rawMaterialsAPI.create(payload);
        msg = res.data.message || 'Recorded';
      }
      setSnack({ open: true, message: msg, severity: 'success' });
      setDialogOpen(false);
      fetchList();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Error', severity: 'error' });
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm.id) return;
    try {
      await rawMaterialsAPI.delete(deleteConfirm.id);
      setSnack({ open: true, message: 'Deleted', severity: 'success' });
      setDeleteConfirm({ open: false, id: null });
      fetchList();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Error', severity: 'error' });
    }
  };

  return (
    <Box>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        {summary.map((s) => (
          <Grid item xs={12} sm={6} key={s.coilCategory}>
            <Card>
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary">{s.coilCategory}</Typography>
                <Typography variant="h5" fontWeight={700}>{s.totalStock} kg</Typography>
                <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
                  Serves: {Array.isArray(s.wiresServed) ? s.wiresServed.join(', ') : s.wiresServed}
                </Typography>
                {s.lowStock && <Chip label="Low stock" color="warning" size="small" sx={{ mt: 1 }} />}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="All Coils" />
        <Tab label="Shiplet Coil (#1–#19)" />
        <Tab label="Patri Coil (#20 Binding)" />
      </Tabs>

      <Box display="flex" justifyContent="flex-end" gap={1} mb={2}>
        <Button
          variant="outlined"
          color="warning"
          onClick={async () => {
            try {
              const res = await rawMaterialsAPI.reconcilePending();
              const d = res.data.data;
              const total = (d.shiplet?.fulfilled || 0) + (d.patri?.fulfilled || 0);
              setSnack({
                open: true,
                message: total > 0
                  ? `Reconciled: ${total} pending order(s) fulfilled from current stock`
                  : 'No pending orders to reconcile — all orders are up to date',
                severity: total > 0 ? 'success' : 'info',
              });
              fetchList();
            } catch {
              setSnack({ open: true, message: 'Reconciliation failed', severity: 'error' });
            }
          }}
        >
          Reconcile Pending Orders
        </Button>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenAdd(categoryFilter || 'Shiplet Coil')}>
          Add Purchase
        </Button>
      </Box>

      {loading ? (
        <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Supplier</TableCell>
                <TableCell>Coil Category</TableCell>
                <TableCell align="right">Weight (kg)</TableCell>
                <TableCell align="right">Rate</TableCell>
                <TableCell align="right">Total</TableCell>
                <TableCell align="right">Stock</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {list.map((row) => (
                <TableRow key={row._id}>
                  <TableCell>{formatDate(row.purchaseDate)}</TableCell>
                  <TableCell>{row.supplierName || row.supplierId?.name}</TableCell>
                  <TableCell>{row.coilCategory}</TableCell>
                  <TableCell align="right">{row.weightInKg}</TableCell>
                  <TableCell align="right">{formatCurrency(row.ratePerKg)}</TableCell>
                  <TableCell align="right">{formatCurrency(row.totalAmount)}</TableCell>
                  <TableCell align="right">{row.currentStock}</TableCell>
                  <TableCell align="right">
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
        <DialogTitle>{editingId ? 'Edit Purchase' : 'Record Coil Purchase'}</DialogTitle>
        <DialogContent>
          <FormControl fullWidth margin="dense">
            <InputLabel>Coil Category</InputLabel>
            <Select value={form.coilCategory} onChange={(e) => setForm((f) => ({ ...f, coilCategory: e.target.value, materialType: e.target.value }))} label="Coil Category">
              {COIL_CATEGORIES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
            </Select>
          </FormControl>
          <Alert severity="info" sx={{ mt: 1, mb: 1 }}>
            {form.coilCategory === 'Patri Coil' ? 'Used for Binding Wire #20 only' : 'Used for Wire #1 through #19'}
          </Alert>
          <FormControl fullWidth margin="dense">
            <InputLabel>Supplier</InputLabel>
            <Select value={form.supplierId} onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value }))} label="Supplier">
              {suppliers.map((s) => (<MenuItem key={s._id} value={s._id}>{s.name}</MenuItem>))}
            </Select>
          </FormControl>
          <TextField fullWidth type="number" label="Weight (kg)" value={form.weightInKg} onChange={(e) => setForm((f) => ({ ...f, weightInKg: e.target.value }))} margin="dense" required />
          <TextField fullWidth type="number" label="Rate per kg" value={form.ratePerKg} onChange={(e) => setForm((f) => ({ ...f, ratePerKg: e.target.value }))} margin="dense" required />
          <TextField fullWidth type="number" label="Amount Paid" value={form.amountPaid} onChange={(e) => setForm((f) => ({ ...f, amountPaid: e.target.value }))} margin="dense" />
          <TextField fullWidth type="date" label="Purchase Date" value={form.purchaseDate} onChange={(e) => setForm((f) => ({ ...f, purchaseDate: e.target.value }))} margin="dense" InputLabelProps={{ shrink: true }} />
          <FormControl fullWidth margin="dense">
            <InputLabel>Payment Method</InputLabel>
            <Select value={form.paymentMethod} onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value }))} label="Payment Method">
              {paymentMethods.map((m) => (<MenuItem key={m} value={m}>{m}</MenuItem>))}
            </Select>
          </FormControl>
          <TextField fullWidth label="Paid By" value={form.paidBy} onChange={(e) => setForm((f) => ({ ...f, paidBy: e.target.value }))} margin="dense" />
          <TextField fullWidth label="Notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} margin="dense" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>Save</Button>
        </DialogActions>
      </Dialog>
      <ConfirmDialog open={deleteConfirm.open} title="Delete Purchase" message="Are you sure?" onConfirm={handleDelete} onCancel={() => setDeleteConfirm({ open: false, id: null })} />
      <Snackbar open={snack.open} autoHideDuration={6000} onClose={() => setSnack((p) => ({ ...p, open: false }))}>
        <Alert severity={snack.severity}>{snack.message}</Alert>
      </Snackbar>
    </Box>
  );
}
