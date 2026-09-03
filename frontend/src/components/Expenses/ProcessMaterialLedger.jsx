import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Tabs,
  Tab,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Card,
  CardContent,
  Chip,
  Button,
  IconButton,
  Collapse,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  Stack,
} from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import PaymentIcon from '@mui/icons-material/Payment';
import { consumptionAPI } from '../../services/api';
import { formatCurrency, formatDate } from '../../utils/formatters';

const MATERIAL_TABS = ['Acid', 'Dye', 'Soap', 'Stationery'];

export default function ProcessMaterialLedger({ startDate, endDate, onDataChanged }) {
  const [materialTab, setMaterialTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [ledger, setLedger] = useState({ summary: {}, records: [] });
  const [expandedRows, setExpandedRows] = useState({});
  const [payDialog, setPayDialog] = useState({ open: false, record: null });
  const [payForm, setPayForm] = useState({
    amount: '',
    paymentMethod: 'Cash',
    paidBy: '',
    note: '',
  });
  const [submittingPay, setSubmittingPay] = useState(false);
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' });

  const activeMaterial = MATERIAL_TABS[materialTab];

  const fetchLedger = useCallback(async () => {
    setLoading(true);
    try {
      const params = { materialType: activeMaterial };
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      const res = await consumptionAPI.getLedger(params);
      setLedger(res.data.data || { summary: {}, records: [] });
    } catch (err) {
      setSnack({
        open: true,
        message: err.response?.data?.message || 'Failed to load material ledger',
        severity: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [activeMaterial, startDate, endDate]);

  useEffect(() => {
    fetchLedger();
  }, [fetchLedger]);

  const toggleRow = (id) => {
    setExpandedRows((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const openPayDialog = (record) => {
    setPayDialog({ open: true, record });
    setPayForm({
      amount: record.amountDue || '',
      paymentMethod: 'Cash',
      paidBy: '',
      note: '',
    });
  };

  const handleRecordPayment = async () => {
    if (!payDialog.record) return;
    const amount = Number(payForm.amount);
    if (!amount || amount <= 0) {
      setSnack({ open: true, message: 'Valid payment amount is required', severity: 'error' });
      return;
    }
    if (amount > (payDialog.record.amountDue || 0)) {
      setSnack({
        open: true,
        message: `Amount cannot exceed outstanding due of Rs. ${payDialog.record.amountDue}`,
        severity: 'error',
      });
      return;
    }

    setSubmittingPay(true);
    try {
      await consumptionAPI.addPayment(payDialog.record._id, {
        amount,
        paymentMethod: payForm.paymentMethod,
        paidBy: payForm.paidBy,
        note: payForm.note,
      });
      setSnack({ open: true, message: 'Payment recorded successfully', severity: 'success' });
      setPayDialog({ open: false, record: null });
      fetchLedger();
      if (onDataChanged) onDataChanged();
    } catch (err) {
      setSnack({
        open: true,
        message: err.response?.data?.message || 'Failed to record payment',
        severity: 'error',
      });
    } finally {
      setSubmittingPay(false);
    }
  };

  const summary = ledger.summary || {};
  const records = ledger.records || [];

  const totalQty = records.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);
  const totalAmount = records.reduce((sum, r) => sum + (Number(r.totalCost) || 0), 0);
  const totalPaid = records.reduce((sum, r) => sum + (Number(r.amountPaid) || 0), 0);
  const totalDue = records.reduce((sum, r) => sum + (Number(r.amountDue) || 0), 0);

  const getStatusChip = (status, due) => {
    if (status === 'Paid' || (due !== undefined && due <= 0)) {
      return <Chip size="small" label="Paid" color="success" variant="outlined" />;
    }
    if (status === 'Partial') {
      return <Chip size="small" label="Partial" color="warning" variant="outlined" />;
    }
    return <Chip size="small" label="Unpaid" color="error" variant="outlined" />;
  };

  return (
    <Box sx={{ mt: 1 }}>
      {/* Material Type Tabs */}
      <Tabs
        value={materialTab}
        onChange={(_, v) => setMaterialTab(v)}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        {MATERIAL_TABS.map((name) => (
          <Tab key={name} label={`${name} Ledger`} />
        ))}
      </Tabs>

      {/* Summary Cards */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3 }}>
        <Card sx={{ flex: 1, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
          <CardContent>
            <Typography variant="caption" color="text.secondary">
              Total Purchased ({activeMaterial})
            </Typography>
            <Typography variant="h6" fontWeight={700} sx={{ mt: 0.5 }}>
              {formatCurrency(summary.totalPurchasedAmount ?? totalAmount)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Quantity: {(summary.totalPurchasedQuantity ?? totalQty).toLocaleString()}{' '}
              {['Acid', 'Soap'].includes(activeMaterial) ? 'kg' : 'pcs'}
            </Typography>
          </CardContent>
        </Card>

        <Card sx={{ flex: 1, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
          <CardContent>
            <Typography variant="caption" color="text.secondary">
              Total Paid
            </Typography>
            <Typography variant="h6" fontWeight={700} color="success.main" sx={{ mt: 0.5 }}>
              {formatCurrency(summary.totalPaid ?? totalPaid)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Settled payments
            </Typography>
          </CardContent>
        </Card>

        <Card
          sx={{
            flex: 1,
            bgcolor: (summary.totalDue ?? totalDue) > 0 ? 'rgba(211, 47, 47, 0.04)' : 'background.paper',
            border: '1px solid',
            borderColor: (summary.totalDue ?? totalDue) > 0 ? 'error.light' : 'divider',
          }}
        >
          <CardContent>
            <Typography variant="caption" color="text.secondary">
              Total Outstanding Due
            </Typography>
            <Typography
              variant="h6"
              fontWeight={700}
              color={(summary.totalDue ?? totalDue) > 0 ? 'error.main' : 'text.primary'}
              sx={{ mt: 0.5 }}
            >
              {formatCurrency(summary.totalDue ?? totalDue)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Payable to vendors
            </Typography>
          </CardContent>
        </Card>
      </Stack>

      {/* Ledger Table */}
      {loading ? (
        <Box display="flex" justifyContent="center" p={4}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.100' }}>
                <TableCell sx={{ width: 48 }} />
                <TableCell>Date</TableCell>
                <TableCell>Supplier / Vendor</TableCell>
                <TableCell align="right">Qty</TableCell>
                <TableCell align="right">Rate</TableCell>
                <TableCell align="right">Total Cost</TableCell>
                <TableCell align="right">Paid</TableCell>
                <TableCell align="right">Due</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {records.map((row) => {
                const isExpanded = !!expandedRows[row._id];
                const history = row.paymentHistory || [];
                const due = Number(row.amountDue ?? (row.totalCost || 0) - (row.amountPaid || 0));

                return (
                  <React.Fragment key={row._id}>
                    <TableRow hover sx={{ '& > *': { borderBottom: 'unset' } }}>
                      <TableCell>
                        <IconButton
                          size="small"
                          onClick={() => toggleRow(row._id)}
                          title="View payment history"
                        >
                          {isExpanded ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                        </IconButton>
                      </TableCell>
                      <TableCell>{formatDate(row.purchaseDate)}</TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={500}>
                          {row.supplierName || '—'}
                        </Typography>
                        {row.supplierContact && (
                          <Typography variant="caption" color="text.secondary">
                            {row.supplierContact}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        {(row.quantity || 0).toLocaleString()} {row.unit || ''}
                      </TableCell>
                      <TableCell align="right">
                        {row.costPerUnit ? formatCurrency(row.costPerUnit) : '—'}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>
                        {formatCurrency(row.totalCost || 0)}
                      </TableCell>
                      <TableCell align="right" sx={{ color: 'success.main', fontWeight: 600 }}>
                        {formatCurrency(row.amountPaid || 0)}
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{ color: due > 0 ? 'error.main' : 'text.secondary', fontWeight: due > 0 ? 700 : 400 }}
                      >
                        {formatCurrency(due)}
                      </TableCell>
                      <TableCell>{getStatusChip(row.paymentStatus, due)}</TableCell>
                      <TableCell align="right">
                        {due > 0 && (
                          <Button
                            size="small"
                            variant="outlined"
                            color="success"
                            startIcon={<PaymentIcon />}
                            onClick={() => openPayDialog(row)}
                          >
                            Pay
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>

                    {/* Expandable Payment History Sub-Table */}
                    <TableRow>
                      <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={10}>
                        <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                          <Box sx={{ margin: 1, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                            <Typography variant="subtitle2" gutterBottom component="div" fontWeight={600}>
                              Payment History for this Purchase
                            </Typography>
                            {history.length > 0 ? (
                              <Table size="small">
                                <TableHead>
                                  <TableRow>
                                    <TableCell>Payment Date</TableCell>
                                    <TableCell align="right">Amount</TableCell>
                                    <TableCell>Method</TableCell>
                                    <TableCell>Paid By</TableCell>
                                    <TableCell>Note</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {history.map((ph, phIdx) => (
                                    <TableRow key={ph._id || phIdx}>
                                      <TableCell>{formatDate(ph.paymentDate)}</TableCell>
                                      <TableCell align="right" sx={{ fontWeight: 600, color: 'success.main' }}>
                                        {formatCurrency(ph.amount)}
                                      </TableCell>
                                      <TableCell>{ph.paymentMethod || 'Cash'}</TableCell>
                                      <TableCell>{ph.paidBy || '—'}</TableCell>
                                      <TableCell>{ph.note || '—'}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            ) : (
                              <Typography variant="caption" color="text.secondary">
                                No payment installments recorded yet.
                              </Typography>
                            )}
                            {row.notes && (
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                                Purchase notes: {row.notes}
                              </Typography>
                            )}
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </React.Fragment>
                );
              })}

              {records.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10}>
                    <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 3 }}>
                      No {activeMaterial} purchases recorded for selected dates.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}

              {/* Running Totals Row */}
              {records.length > 0 && (
                <TableRow sx={{ bgcolor: 'grey.100', fontWeight: 700 }}>
                  <TableCell />
                  <TableCell colSpan={2} sx={{ fontWeight: 700 }}>
                    Total ({records.length} purchases)
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    {totalQty.toLocaleString()}
                  </TableCell>
                  <TableCell />
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    {formatCurrency(totalAmount)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, color: 'success.main' }}>
                    {formatCurrency(totalPaid)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, color: totalDue > 0 ? 'error.main' : 'inherit' }}>
                    {formatCurrency(totalDue)}
                  </TableCell>
                  <TableCell colSpan={2} />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Pay Dialog */}
      <Dialog
        open={payDialog.open}
        onClose={() => !submittingPay && setPayDialog({ open: false, record: null })}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Record Payment — {payDialog.record?.materialType || 'Process Material'}</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            Outstanding due:{' '}
            <strong>
              Rs. {Number(payDialog.record?.amountDue || 0).toLocaleString()}
            </strong>
          </Alert>
          <TextField
            fullWidth
            type="number"
            label="Payment Amount"
            value={payForm.amount}
            onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))}
            margin="dense"
            required
            autoFocus
            inputProps={{ max: payDialog.record?.amountDue }}
          />
          <FormControl fullWidth margin="dense">
            <InputLabel>Payment Method</InputLabel>
            <Select
              value={payForm.paymentMethod}
              label="Payment Method"
              onChange={(e) => setPayForm((f) => ({ ...f, paymentMethod: e.target.value }))}
            >
              <MenuItem value="Cash">Cash</MenuItem>
              <MenuItem value="Bank Transfer">Bank Transfer</MenuItem>
              <MenuItem value="Cheque">Cheque</MenuItem>
            </Select>
          </FormControl>
          <TextField
            fullWidth
            label="Paid By"
            value={payForm.paidBy}
            onChange={(e) => setPayForm((f) => ({ ...f, paidBy: e.target.value }))}
            margin="dense"
          />
          <TextField
            fullWidth
            label="Note (optional)"
            value={payForm.note}
            onChange={(e) => setPayForm((f) => ({ ...f, note: e.target.value }))}
            margin="dense"
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setPayDialog({ open: false, record: null })}
            disabled={submittingPay}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleRecordPayment}
            disabled={submittingPay}
          >
            {submittingPay ? 'Recording...' : 'Record Payment'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
