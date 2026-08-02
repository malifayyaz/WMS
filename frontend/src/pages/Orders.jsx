import React, { useState, useEffect } from 'react';
import {
  Box, Button, TextField, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  IconButton, Dialog, DialogTitle, DialogContent, DialogActions, Snackbar, Alert, CircularProgress,
  FormControl, InputLabel, Select, MenuItem, Chip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { ordersAPI, customersAPI, configAPI, rawMaterialsAPI } from '../services/api';
import { formatCurrency, formatDate } from '../utils/formatters';
import StatusBadge from '../components/Common/StatusBadge';
import ConfirmDialog from '../components/Common/ConfirmDialog';

const statuses = ['Outer', 'In Process', 'Done'];
const paymentMethods = ['Cash', 'Bank Transfer', 'Cheque'];
const toInputDate = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '');
const defaultCoilCategoryForWire = (wireNumber) => (Number(wireNumber) === 20 ? 'Patri Coil' : 'Shiplet Coil');

export default function Orders() {
  const [list, setList] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [wires, setWires] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [stockPreview, setStockPreview] = useState(null);
  const [form, setForm] = useState({
    customerId: '', wireNumber: '', coilCategory: '', wireSize: '', initialWeightKg: '', ratePerKg: '',
    amountPaid: 0, paymentMethod: 'Cash', soldBy: '', orderDate: '', notes: '',
  });
  const [editingId, setEditingId] = useState(null);
  const [weightDialog, setWeightDialog] = useState({ open: false, order: null, finalWeightKg: '' });
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, id: null });
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' });

  const fetchList = async () => {
    setLoading(true);
    try {
      const params = statusFilter ? { status: statusFilter } : {};
      const [res, custRes, wireRes] = await Promise.all([
        ordersAPI.getAll(params), customersAPI.getAll(), configAPI.getWires(),
      ]);
      setList(res.data.data || []);
      setCustomers(custRes.data.data || []);
      setWires(wireRes.data.data?.wires || []);
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Failed to load', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchList(); }, [statusFilter]);

  const loadStockPreview = async (wireNumber, weightKg, coilCategory) => {
    if (!wireNumber || !weightKg) { setStockPreview(null); return; }
    try {
      const res = await ordersAPI.checkStock({ wireNumber, weightKg, coilCategory });
      setStockPreview(res.data.data);
    } catch { setStockPreview(null); }
  };

  useEffect(() => {
    if (!editingId && form.wireNumber && form.initialWeightKg && form.coilCategory) {
      loadStockPreview(form.wireNumber, form.initialWeightKg, form.coilCategory);
    }
  }, [form.wireNumber, form.initialWeightKg, form.coilCategory, editingId]);

  const selectedWire = wires.find((w) => w.number === Number(form.wireNumber));
  const selectedCustomer = customers.find((c) => c._id === form.customerId);
  const isDailyCustomer = selectedCustomer?.customerType === 'Daily';
  const orderTotal = Number(form.initialWeightKg || 0) * Number(form.ratePerKg || 0);

  const ledgerCustomersOnly = customers.filter((c) => c.customerType !== 'Daily');

  const handleOpenAdd = () => {
    setForm({
      customerId: ledgerCustomersOnly[0]?._id || '', wireNumber: '', coilCategory: '', wireSize: '', initialWeightKg: '',
      ratePerKg: '', amountPaid: 0, paymentMethod: 'Cash', soldBy: '',
      orderDate: new Date().toISOString().slice(0, 10), notes: '',
    });
    setStockPreview(null);
    setEditingId(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (row) => {
    setForm({
      customerId: row.customerId?._id || row.customerId,
      wireNumber: row.wireNumber || '',
      coilCategory: row.coilCategory || defaultCoilCategoryForWire(row.wireNumber),
      wireSize: row.wireSize || '',
      initialWeightKg: row.initialWeightKg,
      ratePerKg: row.ratePerKg,
      amountPaid: row.amountPaid || 0,
      paymentMethod: row.paymentMethod || 'Cash',
      soldBy: row.soldBy || '',
      orderDate: toInputDate(row.orderDate),
      notes: row.notes || '',
    });
    setStockPreview(null);
    setEditingId(row._id);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.customerId || !form.wireNumber || !form.initialWeightKg || !form.ratePerKg) {
      setSnack({ open: true, message: 'Customer, wire, weight and rate required', severity: 'error' });
      return;
    }
    const payload = {
      customerId: form.customerId,
      wireNumber: Number(form.wireNumber),
      coilCategory: form.coilCategory,
      wireSize: form.wireSize,
      initialWeightKg: Number(form.initialWeightKg),
      ratePerKg: Number(form.ratePerKg),
      amountPaid: Number(form.amountPaid) || 0,
      paymentMethod: form.paymentMethod,
      soldBy: form.soldBy,
      orderDate: form.orderDate || undefined,
      notes: form.notes,
    };
    try {
      if (editingId) {
        await ordersAPI.update(editingId, payload);
        setSnack({ open: true, message: 'Updated', severity: 'success' });
      } else {
        const res = await ordersAPI.create(payload);
        const warnings = res.data.warnings || [];
        setSnack({
          open: true,
          message: warnings.length ? `Order created — ${warnings.join('; ')}` : 'Order created',
          severity: warnings.length ? 'warning' : 'success',
        });
      }
      setDialogOpen(false);
      fetchList();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Error', severity: 'error' });
    }
  };

  const handleStatusChange = async (orderId, status) => {
    try {
      await ordersAPI.updateStatus(orderId, status);
      setSnack({ open: true, message: 'Status updated', severity: 'success' });
      fetchList();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Error', severity: 'error' });
    }
  };

  const handleFinalWeight = async () => {
    if (!weightDialog.order || !weightDialog.finalWeightKg) return;
    try {
      await ordersAPI.updateFinalWeight(weightDialog.order._id, { finalWeightKg: Number(weightDialog.finalWeightKg) });
      setSnack({ open: true, message: 'Final weight updated', severity: 'success' });
      setWeightDialog({ open: false, order: null, finalWeightKg: '' });
      fetchList();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Error', severity: 'error' });
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm.id) return;
    try {
      await ordersAPI.delete(deleteConfirm.id);
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
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Status</InputLabel>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} label="Status">
            <MenuItem value="">All</MenuItem>
            {statuses.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </Select>
        </FormControl>
        <Box display="flex" gap={1}>
          <Button
            variant="outlined"
            color="warning"
            size="small"
            startIcon={<WarningAmberIcon />}
            title="Deduct pending order weights from available coil stock and clear stale alerts"
            onClick={async () => {
              try {
                const res = await rawMaterialsAPI.reconcilePending();
                setSnack({ open: true, message: res.data.message, severity: 'success' });
                fetchList();
              } catch {
                setSnack({ open: true, message: 'Reconcile failed', severity: 'error' });
              }
            }}
          >
            Fix Stock Alerts
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenAdd}>Add Order</Button>
        </Box>
      </Box>
      {loading ? (
        <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Customer</TableCell>
                <TableCell>Wire</TableCell>
                <TableCell>Coil</TableCell>
                <TableCell align="right">Weight (kg)</TableCell>
                <TableCell align="right">Total</TableCell>
                <TableCell>Stock</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {list.map((row) => (
                <TableRow key={row._id}>
                  <TableCell>{formatDate(row.orderDate)}</TableCell>
                  <TableCell>{row.customerName || row.customerId?.name}</TableCell>
                  <TableCell>{row.wireType} {row.wireSize ? `(${row.wireSize})` : ''}</TableCell>
                  <TableCell>{row.coilCategory || '—'}</TableCell>
                  <TableCell align="right">{row.finalWeightKg ?? row.initialWeightKg}</TableCell>
                  <TableCell align="right">{formatCurrency(row.totalAmount)}</TableCell>
                  <TableCell>
                    {row.lowStockAlert && (
                      <Chip icon={<WarningAmberIcon />} label={row.stockPendingKg > 0 ? `${row.stockPendingKg} kg pending` : 'Low stock'} color="warning" size="small" />
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={row.orderStatus} />
                    {row.orderStatus === 'Outer' && (
                      <Button size="small" sx={{ ml: 1 }} onClick={() => handleStatusChange(row._id, 'In Process')}>In Process</Button>
                    )}
                    {row.orderStatus === 'In Process' && (
                      <>
                        <Button size="small" sx={{ ml: 1 }} onClick={() => setWeightDialog({ open: true, order: row, finalWeightKg: row.initialWeightKg })}>Set Final Weight</Button>
                        <Button size="small" onClick={() => handleStatusChange(row._id, 'Done')}>Done</Button>
                      </>
                    )}
                  </TableCell>
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
        <DialogTitle>{editingId ? 'Edit Order' : 'Add Order'}</DialogTitle>
        <DialogContent>
          <FormControl fullWidth margin="dense">
            <InputLabel>Customer</InputLabel>
            <Select value={form.customerId} onChange={(e) => setForm((f) => ({ ...f, customerId: e.target.value }))} label="Customer">
              {ledgerCustomersOnly.map((c) => (
                <MenuItem key={c._id} value={c._id}>{c.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          {ledgerCustomersOnly.length === 0 && (
            <Alert severity="info" sx={{ mt: 1 }}>
              Daily customers are recorded in Daily Book → Daily Customers tab.
            </Alert>
          )}
          {isDailyCustomer && (
            <Alert severity="info" sx={{ mt: 1 }}>
              Daily customer — full cash payment. No credit/debit tracking.
            </Alert>
          )}
          <FormControl fullWidth margin="dense" required>
            <InputLabel>Wire Number</InputLabel>
            <Select
              value={form.wireNumber}
              onChange={(e) => setForm((f) => ({
                ...f,
                wireNumber: e.target.value,
                coilCategory: defaultCoilCategoryForWire(e.target.value),
              }))}
              label="Wire Number"
            >
              {wires.map((w) => <MenuItem key={w.number} value={w.number}>{w.name} — {w.coilCategory}</MenuItem>)}
            </Select>
          </FormControl>
          {selectedWire && (
            <Alert severity="info" sx={{ mt: 1 }}>
              Default coil is <strong>{selectedWire.coilCategory}</strong>, but you can change it below.
            </Alert>
          )}
          <FormControl fullWidth margin="dense" required>
            <InputLabel>Coil Category</InputLabel>
            <Select
              value={form.coilCategory}
              onChange={(e) => setForm((f) => ({ ...f, coilCategory: e.target.value }))}
              label="Coil Category"
            >
              <MenuItem value="Shiplet Coil">Shiplet Coil</MenuItem>
              <MenuItem value="Patri Coil">Patri Coil</MenuItem>
            </Select>
          </FormControl>
          {stockPreview && !editingId && (
            <Alert severity={stockPreview.lowStock ? 'warning' : 'success'} sx={{ mt: 1 }}>
              {stockPreview.coilCategory}: {stockPreview.availableKg} kg available
              {stockPreview.shortfallKg > 0 && ` — ${stockPreview.shortfallKg} kg short (order still allowed)`}
            </Alert>
          )}
          <TextField fullWidth label="Wire Size (optional)" value={form.wireSize} onChange={(e) => setForm((f) => ({ ...f, wireSize: e.target.value }))} margin="dense" />
          <TextField fullWidth type="number" label="Initial Weight (kg)" value={form.initialWeightKg} onChange={(e) => setForm((f) => ({ ...f, initialWeightKg: e.target.value }))} margin="dense" required />
          <TextField fullWidth type="number" label="Rate per kg" value={form.ratePerKg} onChange={(e) => setForm((f) => ({ ...f, ratePerKg: e.target.value }))} margin="dense" required />
          {!isDailyCustomer && (
            <TextField fullWidth type="number" label="Amount Paid" value={form.amountPaid} onChange={(e) => setForm((f) => ({ ...f, amountPaid: e.target.value }))} margin="dense" />
          )}
          {isDailyCustomer && orderTotal > 0 && (
            <TextField fullWidth label="Amount Paid" value={orderTotal} margin="dense" InputProps={{ readOnly: true }} helperText="Full amount — daily cash customer" />
          )}
          <TextField fullWidth type="date" label="Order Date" value={form.orderDate} onChange={(e) => setForm((f) => ({ ...f, orderDate: e.target.value }))} margin="dense" InputLabelProps={{ shrink: true }} />
          <FormControl fullWidth margin="dense">
            <InputLabel>Payment Method</InputLabel>
            <Select value={form.paymentMethod} onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value }))} label="Payment Method">
              {paymentMethods.map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField fullWidth label="Sold By" value={form.soldBy} onChange={(e) => setForm((f) => ({ ...f, soldBy: e.target.value }))} margin="dense" />
          <TextField fullWidth label="Notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} margin="dense" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>Save</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={weightDialog.open} onClose={() => setWeightDialog({ open: false, order: null, finalWeightKg: '' })}>
        <DialogTitle>Update Final Weight (after heating)</DialogTitle>
        <DialogContent>
          <TextField fullWidth type="number" label="Final Weight (kg)" value={weightDialog.finalWeightKg} onChange={(e) => setWeightDialog((p) => ({ ...p, finalWeightKg: e.target.value }))} margin="dense" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setWeightDialog({ open: false, order: null, finalWeightKg: '' })}>Cancel</Button>
          <Button variant="contained" onClick={handleFinalWeight}>Update</Button>
        </DialogActions>
      </Dialog>
      <ConfirmDialog open={deleteConfirm.open} title="Delete Order" message="Are you sure?" onConfirm={handleDelete} onCancel={() => setDeleteConfirm({ open: false, id: null })} />
      <Snackbar open={snack.open} autoHideDuration={8000} onClose={() => setSnack((p) => ({ ...p, open: false }))}>
        <Alert severity={snack.severity}>{snack.message}</Alert>
      </Snackbar>
    </Box>
  );
}
