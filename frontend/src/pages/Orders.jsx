import React, { useState, useEffect } from 'react';
import {
  Box, Button, TextField, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  IconButton, DialogTitle, DialogContent, DialogActions, Snackbar, Alert, CircularProgress,
  FormControl, InputLabel, Select, MenuItem, Chip, Typography, TablePagination, Stack,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { ordersAPI, customersAPI, configAPI, rawMaterialsAPI, aiAPI } from '../services/api';
import { formatCurrency, formatDate } from '../utils/formatters';
import StatusBadge from '../components/Common/StatusBadge';
import ConfirmDialog from '../components/Common/ConfirmDialog';
import AccessDeniedSnackbar from '../components/Common/AccessDeniedSnackbar';
import ResponsiveDialog from '../components/Common/ResponsiveDialog';
import PageToolbar from '../components/Common/PageToolbar';
import { usePermissions } from '../hooks/usePermissions';
import { useIsMobile } from '../hooks/useBreakpoint';

const statuses = ['Outer', 'In Process', 'Done'];
const paymentMethods = ['Cash', 'Bank Transfer', 'Cheque'];
const toInputDate = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '');
const defaultCoilCategoryForWire = (wireNumber) => (Number(wireNumber) === 20 ? 'Patri Coil' : 'Shiplet Coil');

export default function Orders() {
  const { isViewer } = usePermissions();
  const isMobile = useIsMobile();
  const [accessDenied, setAccessDenied] = useState(false);
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
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [parseText, setParseText] = useState('');
  const [parsing, setParsing] = useState(false);

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

  useEffect(() => { setPage(0); fetchList(); }, [statusFilter]);

  const pagedList = list.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

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

  const handleOpenAdd = () => {
    setForm({
      customerId: customers[0]?._id || '', wireNumber: '', coilCategory: '', wireSize: '', initialWeightKg: '',
      ratePerKg: '', amountPaid: 0, paymentMethod: 'Cash', soldBy: '',
      orderDate: new Date().toISOString().slice(0, 10), notes: '',
    });
    setStockPreview(null);
    setEditingId(null);
    setParseText('');
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

  const handleParseOrder = async () => {
    if (!parseText.trim()) return;
    setParsing(true);
    try {
      const res = await aiAPI.parseOrder(parseText.trim());
      const parsed = res.data.data || {};
      setForm((f) => ({
        ...f,
        ...(parsed.customerName
          ? {
              customerId:
                customers.find((c) => c.name?.toLowerCase() === String(parsed.customerName).toLowerCase())?._id
                || f.customerId,
            }
          : {}),
        wireNumber: parsed.wireNumber != null ? String(parsed.wireNumber) : f.wireNumber,
        coilCategory: parsed.wireNumber != null
          ? defaultCoilCategoryForWire(parsed.wireNumber)
          : f.coilCategory,
        initialWeightKg: parsed.weightKg != null ? String(parsed.weightKg) : f.initialWeightKg,
        ratePerKg: parsed.ratePerKg != null ? String(parsed.ratePerKg) : f.ratePerKg,
      }));
      setSnack({
        open: true,
        message: res.data.message || 'Parsed order details — review before saving',
        severity: 'success',
      });
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Could not parse order text', severity: 'error' });
    } finally {
      setParsing(false);
    }
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
    if (isViewer) { setAccessDenied(true); return; }
    try {
      await ordersAPI.updateStatus(orderId, status);
      setSnack({ open: true, message: 'Status updated', severity: 'success' });
      fetchList();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Error', severity: 'error' });
    }
  };

  const handleFinalWeight = async () => {
    if (isViewer) { setAccessDenied(true); return; }
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

  const renderOrderActions = (row) => (
    <>
      {row.orderStatus === 'Outer' && (
        <Button size="small" fullWidth={isMobile} onClick={() => handleStatusChange(row._id, 'In Process')}>In Process</Button>
      )}
      {row.orderStatus === 'In Process' && (
        <>
          <Button
            size="small"
            fullWidth={isMobile}
            onClick={() => {
              if (isViewer) { setAccessDenied(true); return; }
              setWeightDialog({ open: true, order: row, finalWeightKg: row.initialWeightKg });
            }}
          >
            Set Final Weight
          </Button>
          <Button size="small" fullWidth={isMobile} onClick={() => handleStatusChange(row._id, 'Done')}>Done</Button>
        </>
      )}
      <Stack direction="row" spacing={0.5} justifyContent={isMobile ? 'stretch' : 'flex-end'} sx={{ width: isMobile ? '100%' : 'auto' }}>
        <IconButton
          size="small"
          onClick={() => {
            if (isViewer) { setAccessDenied(true); return; }
            handleOpenEdit(row);
          }}
        >
          <EditIcon />
        </IconButton>
        <IconButton
          size="small"
          color="error"
          onClick={() => {
            if (isViewer) { setAccessDenied(true); return; }
            setDeleteConfirm({ open: true, id: row._id });
          }}
        >
          <DeleteIcon />
        </IconButton>
      </Stack>
    </>
  );

  return (
    <Box>
      <PageToolbar>
        <FormControl size="small" sx={{ width: { xs: '100%', sm: 'auto' }, minWidth: { xs: 0, sm: 160 } }}>
          <InputLabel>Status</InputLabel>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} label="Status">
            <MenuItem value="">All</MenuItem>
            {statuses.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </Select>
        </FormControl>
        <Box display="flex" gap={1} flexWrap="wrap" sx={{ width: { xs: '100%', sm: 'auto' } }}>
          <Button
            variant="outlined"
            color="warning"
            size="small"
            fullWidth={isMobile}
            startIcon={<WarningAmberIcon />}
            title="Deduct pending order weights from available coil stock and clear stale alerts"
            onClick={async () => {
              if (isViewer) { setAccessDenied(true); return; }
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
          <Button
            variant="contained"
            fullWidth={isMobile}
            startIcon={<AddIcon />}
            onClick={() => {
              if (isViewer) { setAccessDenied(true); return; }
              handleOpenAdd();
            }}
          >
            Add Order
          </Button>
        </Box>
      </PageToolbar>
      {loading ? (
        <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
      ) : isMobile ? (
        <Stack spacing={1.5}>
          {list.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>No orders found.</Typography>
          )}
          {pagedList.map((row) => (
            <Paper key={row._id} variant="outlined" sx={{ p: 1.5 }}>
              <Typography fontWeight={700}>{row.customerName || row.customerId?.name}</Typography>
              <Typography variant="body2" color="text.secondary">{formatDate(row.orderDate)} · {row.wireType} {row.wireSize ? `(${row.wireSize})` : ''}</Typography>
              <Box display="flex" justifyContent="space-between" mt={1} flexWrap="wrap" gap={0.5}>
                <Typography variant="caption">Weight: <strong>{row.finalWeightKg ?? row.initialWeightKg} kg</strong></Typography>
                <Typography variant="caption">Total: <strong>{formatCurrency(row.totalAmount)}</strong></Typography>
              </Box>
              <Box mt={1} mb={1} display="flex" gap={1} flexWrap="wrap" alignItems="center">
                <StatusBadge status={row.orderStatus} />
                {row.lowStockAlert && (
                  <Chip icon={<WarningAmberIcon />} label={row.stockPendingKg > 0 ? `${row.stockPendingKg} kg pending` : 'Low stock'} color="warning" size="small" />
                )}
              </Box>
              <Stack spacing={1}>
                {renderOrderActions(row)}
              </Stack>
            </Paper>
          ))}
          <TablePagination
            component="div"
            count={list.length}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
            rowsPerPageOptions={[25, 50, 100]}
          />
        </Stack>
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
              {list.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9}>
                    <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>No orders found.</Typography>
                  </TableCell>
                </TableRow>
              )}
              {pagedList.map((row) => (
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
                        <Button
                          size="small"
                          sx={{ ml: 1 }}
                          onClick={() => {
                            if (isViewer) { setAccessDenied(true); return; }
                            setWeightDialog({ open: true, order: row, finalWeightKg: row.initialWeightKg });
                          }}
                        >
                          Set Final Weight
                        </Button>
                        <Button size="small" onClick={() => handleStatusChange(row._id, 'Done')}>Done</Button>
                      </>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <IconButton
                      size="small"
                      onClick={() => {
                        if (isViewer) { setAccessDenied(true); return; }
                        handleOpenEdit(row);
                      }}
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => {
                        if (isViewer) { setAccessDenied(true); return; }
                        setDeleteConfirm({ open: true, id: row._id });
                      }}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePagination
            component="div"
            count={list.length}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
            rowsPerPageOptions={[25, 50, 100]}
          />
        </TableContainer>
      )}
      <ResponsiveDialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingId ? 'Edit Order' : 'Add Order'}</DialogTitle>
        <DialogContent>
          {!editingId && (
            <Box display="flex" gap={1} alignItems="flex-start" mb={1}>
              <TextField
                fullWidth
                size="small"
                label="Parse from text (optional)"
                placeholder="e.g. sell 500kg wire 12 to Ali @ 280"
                value={parseText}
                onChange={(e) => setParseText(e.target.value)}
                margin="dense"
              />
              <Button
                variant="outlined"
                sx={{ mt: 1, whiteSpace: 'nowrap' }}
                disabled={parsing || !parseText.trim()}
                onClick={handleParseOrder}
              >
                {parsing ? '…' : 'Parse'}
              </Button>
            </Box>
          )}
          <FormControl fullWidth margin="dense">
            <InputLabel>Customer</InputLabel>
            <Select value={form.customerId} onChange={(e) => setForm((f) => ({ ...f, customerId: e.target.value }))} label="Customer">
              {customers.map((c) => (
                <MenuItem key={c._id} value={c._id}>
                  {c.name}{c.customerType === 'Daily' ? ' (Daily)' : ''}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
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
          <TextField
            fullWidth
            type="number"
            label="Amount Paid"
            value={form.amountPaid}
            onChange={(e) => setForm((f) => ({ ...f, amountPaid: e.target.value }))}
            margin="dense"
            helperText="Default 0 for credit / partial payment"
          />
          {orderTotal > 0 && (
            <TextField
              fullWidth
              label="Amount Due"
              value={formatCurrency(Math.max(0, orderTotal - (Number(form.amountPaid) || 0)))}
              margin="dense"
              InputProps={{ readOnly: true }}
              helperText={
                Number(form.amountPaid) >= orderTotal
                  ? 'Fully paid'
                  : Number(form.amountPaid) > 0
                    ? 'Partial payment'
                    : 'Full credit — unpaid'
              }
            />
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
      </ResponsiveDialog>
      <ResponsiveDialog open={weightDialog.open} onClose={() => setWeightDialog({ open: false, order: null, finalWeightKg: '' })}>
        <DialogTitle>Update Final Weight (after heating)</DialogTitle>
        <DialogContent>
          <TextField fullWidth type="number" label="Final Weight (kg)" value={weightDialog.finalWeightKg} onChange={(e) => setWeightDialog((p) => ({ ...p, finalWeightKg: e.target.value }))} margin="dense" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setWeightDialog({ open: false, order: null, finalWeightKg: '' })}>Cancel</Button>
          <Button variant="contained" onClick={handleFinalWeight}>Update</Button>
        </DialogActions>
      </ResponsiveDialog>
      <ConfirmDialog open={deleteConfirm.open} title="Delete Order" message="Are you sure?" onConfirm={handleDelete} onCancel={() => setDeleteConfirm({ open: false, id: null })} />
      <Snackbar open={snack.open} autoHideDuration={8000} onClose={() => setSnack((p) => ({ ...p, open: false }))}>
        <Alert severity={snack.severity}>{snack.message}</Alert>
      </Snackbar>
      <AccessDeniedSnackbar
        open={accessDenied}
        onClose={() => setAccessDenied(false)}
        message="Access Denied: Viewers cannot perform this action. Please contact the admin."
      />
    </Box>
  );
}
