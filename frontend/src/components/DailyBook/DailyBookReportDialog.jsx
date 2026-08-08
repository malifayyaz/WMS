import React, { useState, useEffect } from 'react';
import {
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Grid,
  Divider,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import TableChartIcon from '@mui/icons-material/TableChart';
import { reportsAPI } from '../../services/api';
import { formatCurrency, formatDate } from '../../utils/formatters';
import DateRangePicker from '../Common/DateRangePicker';
import ResponsiveDialog from '../Common/ResponsiveDialog';
import { exportDailyBookReportExcel, exportDailyBookReportPdf } from '../../utils/dailyBookReportExport';
import { useIsMobile } from '../../hooks/useBreakpoint';

const dense = { py: 0.4, px: 1, fontSize: '0.75rem' };
const head = { ...dense, fontWeight: 700, bgcolor: 'grey.100' };

function MoneyColumn({ title, rows, total, color }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, height: '100%' }}>
      <Typography variant="subtitle2" fontWeight={700} color={color} gutterBottom>
        {title}
      </Typography>
      <TableContainer sx={{ maxHeight: 220, overflowX: 'auto' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={head}>Description</TableCell>
              <TableCell sx={head}>Method</TableCell>
              <TableCell sx={head} align="right">Amount</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(rows || []).map((r, i) => (
              <TableRow key={i}>
                <TableCell sx={{ ...dense, whiteSpace: 'normal' }}>
                  {r.description || r.relatedName || '—'}
                  {r.isAtm && (
                    <Typography component="span" variant="caption" color="warning.main" sx={{ ml: 0.5 }}>
                      ATM
                    </Typography>
                  )}
                </TableCell>
                <TableCell sx={dense}>{r.paymentMethod || '—'}</TableCell>
                <TableCell sx={dense} align="right">{formatCurrency(r.amount)}</TableCell>
              </TableRow>
            ))}
            {!(rows || []).length && (
              <TableRow>
                <TableCell colSpan={3} sx={dense}>
                  <Typography variant="caption" color="text.secondary">None</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <Divider sx={{ my: 1 }} />
      <Typography variant="body2" fontWeight={700} align="right">
        Total: {formatCurrency(total || 0)}
      </Typography>
    </Paper>
  );
}

function SimpleList({ title, headers, rows, empty = 'None' }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, height: '100%' }}>
      <Typography variant="subtitle2" fontWeight={700} gutterBottom>{title}</Typography>
      <TableContainer sx={{ maxHeight: 200, overflowX: 'auto' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              {headers.map((h) => (
                <TableCell key={h} sx={head} align={h === 'Amount' || h === 'Kg' || h === 'Bundles' ? 'right' : 'left'}>
                  {h}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((cells, i) => (
              <TableRow key={i}>
                {cells.map((c, j) => (
                  <TableCell key={j} sx={{ ...dense, whiteSpace: 'normal' }} align={typeof c === 'number' || String(c).startsWith('Rs') ? 'right' : 'left'}>
                    {c}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={headers.length} sx={dense}>
                  <Typography variant="caption" color="text.secondary">{empty}</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}

function DayReportBody({ day }) {
  const sm = day.stockMovements || {};
  const an = day.annealing || {};
  const pr = day.processing || {};
  return (
    <Box>
      <Box
        display="flex"
        gap={2}
        flexWrap="wrap"
        mb={2}
        sx={{ bgcolor: 'grey.50', border: '1px solid', borderColor: 'divider', borderRadius: 1, px: 1.5, py: 1 }}
      >
        <Typography variant="body2">Opening: <strong>{formatCurrency(day.cash?.openingBalance || 0)}</strong></Typography>
        <Typography variant="body2">+ In: <strong>{formatCurrency(day.cash?.totalIn || 0)}</strong></Typography>
        <Typography variant="body2">− Out: <strong>{formatCurrency(day.cash?.totalOut || 0)}</strong></Typography>
        <Typography variant="body2">Closing: <strong>{formatCurrency(day.cash?.closingBalance || 0)}</strong></Typography>
        <Typography variant="body2" color="info.main">
          Bank: {formatCurrency(day.bankSummary?.openingBalance || 0)} → {formatCurrency(day.bankSummary?.closingBalance || 0)}
        </Typography>
      </Box>

      <Grid container spacing={1.5} mb={2}>
        <Grid item xs={12} md={6}>
          <MoneyColumn title="Money In" rows={day.moneyIn} total={day.cash?.totalIn} color="success.main" />
        </Grid>
        <Grid item xs={12} md={6}>
          <MoneyColumn title="Money Out" rows={day.moneyOut} total={day.cash?.totalOut} color="error.main" />
        </Grid>
      </Grid>

      <Box mb={2}>
        <SimpleList
          title={`Factory Expense Breakdown — Total ${formatCurrency(day.cash?.expenseTotals?.factoryTotal || 0)}`}
          headers={['Expense Group', 'Category', 'Amount']}
          rows={(day.cash?.factoryExpenseBreakdown || []).map((row) => [
            row.group,
            row.category,
            formatCurrency(row.amount || 0),
          ])}
          empty="No cash-paid factory expenses on this date"
        />
      </Box>

      <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
        <Typography variant="subtitle2" fontWeight={700} gutterBottom>Bank Transfers (incl. ATM)</Typography>
        <TableContainer sx={{ maxHeight: 180, overflowX: 'auto' }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={head}>Type</TableCell>
                <TableCell sx={head}>Account</TableCell>
                <TableCell sx={head}>Party</TableCell>
                <TableCell sx={head}>Description</TableCell>
                <TableCell sx={head} align="right">Amount</TableCell>
                <TableCell sx={head} align="right">Balance</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(day.bankTransfers || []).map((t, i) => (
                <TableRow key={i}>
                  <TableCell sx={dense}>{t.isAtm ? 'ATM Out' : t.transactionType}</TableCell>
                  <TableCell sx={dense}>{t.bankAccount}</TableCell>
                  <TableCell sx={dense}>{t.relatedName || '—'}</TableCell>
                  <TableCell sx={{ ...dense, whiteSpace: 'normal' }}>{t.description || '—'}</TableCell>
                  <TableCell sx={dense} align="right">{formatCurrency(t.amount)}</TableCell>
                  <TableCell sx={dense} align="right">{formatCurrency(t.balance)}</TableCell>
                </TableRow>
              ))}
              {!(day.bankTransfers || []).length && (
                <TableRow>
                  <TableCell colSpan={6} sx={dense}>
                    <Typography variant="caption" color="text.secondary">No bank transfers</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1, mt: 1 }}>Stock Maintenance</Typography>

      <Grid container spacing={1.5} mb={2}>
        <Grid item xs={12} md={6}>
          <SimpleList
            title={`Stock Out — Sales (${day.totalSalesBundles || 0} bundles / ${Number(day.totalSalesKg || 0).toFixed(1)} kg)`}
            headers={['Customer', 'Material', 'Bundles', 'Kg']}
            rows={(day.sales || []).map((s) => [
              s.customerName + (s.isAnnealed ? ' (annealed)' : ''),
              s.wireNumber != null ? `Wire #${s.wireNumber}` : (s.coilCategory || 'Wire'),
              s.bundles || 0,
              Number(s.weightKg || 0).toFixed(1),
            ])}
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <SimpleList
            title={`Stock In — Purchases (${day.totalPurchasesBundles || 0} bundles / ${Number(day.totalPurchasesKg || 0).toFixed(1)} kg)`}
            headers={['Supplier', 'Type', 'Category', 'Bundles', 'Kg']}
            rows={(day.purchases || []).map((p) => [
              p.supplierName,
              p.materialType,
              p.coilCategory || '—',
              p.bundles || 0,
              Number(p.weightKg || 0).toFixed(1),
            ])}
          />
        </Grid>
      </Grid>

      <Paper variant="outlined" sx={{ p: 1.5, mb: 2, bgcolor: 'warning.50' }}>
        <Typography variant="subtitle2" fontWeight={700} gutterBottom>
          Annealing — Sent {an.totals?.sentBundles || 0} bundles / {Number(an.totals?.sentKg || 0).toFixed(1)} kg
          {'  →  '}
          Arrived {an.totals?.arrivedBundles || 0} bundles / {Number(an.totals?.arrivedKg || 0).toFixed(1)} kg
          {'  →  '}
          Sold {an.totals?.soldBundles || 0} bundles / {Number(an.totals?.soldKg || 0).toFixed(1)} kg
        </Typography>
        <Grid container spacing={1.5}>
          <Grid item xs={12} md={6}>
            <SimpleList
              title="Sent for Annealing"
              headers={['Party', 'Type', 'Cat/Wire', 'Bundles', 'Kg']}
              rows={(an.sent || []).map((a) => [
                a.partyName,
                a.materialType,
                a.materialType === 'Wire' ? (a.wireNumber != null ? `#${a.wireNumber}` : 'Wire') : (a.coilCategory || '—'),
                a.bundles || 0,
                Number(a.weightKg || 0).toFixed(1),
              ])}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <SimpleList
              title="Arrived from Annealing"
              headers={['Party', 'Type', 'Cat/Wire', 'Bundles', 'Final Kg']}
              rows={(an.arrived || []).map((a) => [
                a.partyName,
                a.materialType,
                a.materialType === 'Wire' ? (a.wireNumber != null ? `#${a.wireNumber}` : 'Wire') : (a.coilCategory || '—'),
                a.bundles || 0,
                Number(a.finalWeightKg || a.weightKg || 0).toFixed(1),
              ])}
            />
          </Grid>
          <Grid item xs={12}>
            <SimpleList
              title="Annealed Wire Sold (batch consumption)"
              headers={['Customer / Note', 'Wire', 'Bundles', 'Kg']}
              rows={(an.sold || []).map((a) => [
                a.customerName || a.notes || 'Sale',
                a.wireNumber != null ? `#${a.wireNumber}` : '—',
                a.bundles || 0,
                Number(a.weightKg || 0).toFixed(1),
              ])}
            />
          </Grid>
        </Grid>
      </Paper>

      <Paper variant="outlined" sx={{ p: 1.5, mb: 2, bgcolor: 'info.50' }}>
        <Typography variant="subtitle2" fontWeight={700} gutterBottom>
          Processing Work — Coil in {Number(pr.totals?.coilInKg || 0).toFixed(1)} kg
          {'  /  '}
          Wire out {pr.totals?.wireOutBundles || 0} bundles / {Number(pr.totals?.wireOutKg || 0).toFixed(1)} kg
          {'  /  '}
          Labour earned {formatCurrency(pr.totals?.labourEarned || 0)}
        </Typography>
        <Grid container spacing={1.5}>
          <Grid item xs={12} md={6}>
            <SimpleList
              title="Coil Arrival (from customer)"
              headers={['Customer', 'Category', 'Kg']}
              rows={(pr.arrivals || []).map((a) => [
                a.customerName,
                a.coilCategory || '—',
                Number(a.weightKg || 0).toFixed(1),
              ])}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <SimpleList
              title="Wire Delivery (to customer)"
              headers={['Customer', 'Wire', 'Bundles', 'Kg', 'Labour Rate', 'Labour']}
              rows={(pr.deliveries || []).map((d) => [
                d.customerName,
                d.wireNumber != null ? `#${d.wireNumber}` : '—',
                d.bundles || 0,
                Number(d.weightKg || 0).toFixed(1),
                formatCurrency(d.labourRatePerKg || 0),
                formatCurrency(d.labourAmount || 0),
              ])}
            />
          </Grid>
        </Grid>
      </Paper>

      {(day.returns || []).length > 0 && (
        <Box mb={2}>
          <SimpleList
            title="Customer Returns (stock in)"
            headers={['Customer', 'Wire', 'Bundles', 'Kg']}
            rows={(day.returns || []).map((r) => [
              r.customerName,
              r.wireNumber != null ? `#${r.wireNumber}` : '—',
              r.bundles || 0,
              Number(r.weightKg || 0).toFixed(1),
            ])}
          />
        </Box>
      )}

      {(day.coilReturns || []).length > 0 && (
        <Box mb={2}>
          <SimpleList
            title="Supplier Coil Returns (stock out)"
            headers={['Supplier', 'Category', 'Bundles', 'Kg']}
            rows={(day.coilReturns || []).map((r) => [
              r.supplierName,
              r.coilCategory || r.materialType || 'Coil',
              r.bundles || 0,
              Number(r.weightKg || 0).toFixed(1),
            ])}
          />
        </Box>
      )}

      <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
        <Typography variant="subtitle2" fontWeight={700} gutterBottom>Full Stock Movement Ledger</Typography>
        <Box display="flex" gap={3} flexWrap="wrap" mb={1}>
          <Typography variant="body2">Wire in: <strong>{Number(sm.wireInKg || 0).toFixed(1)} kg</strong></Typography>
          <Typography variant="body2">Wire out: <strong>{Number(sm.wireOutKg || 0).toFixed(1)} kg</strong></Typography>
          <Typography variant="body2">Coil in: <strong>{Number(sm.coilInKg || 0).toFixed(1)} kg</strong></Typography>
          <Typography variant="body2">Coil out: <strong>{Number(sm.coilOutKg || 0).toFixed(1)} kg</strong></Typography>
        </Box>
        <TableContainer sx={{ maxHeight: 280, overflowX: 'auto' }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={head}>Dir</TableCell>
                <TableCell sx={head}>Reason</TableCell>
                <TableCell sx={head}>Party</TableCell>
                <TableCell sx={head}>Material</TableCell>
                <TableCell sx={head} align="right">Bundles</TableCell>
                <TableCell sx={head} align="right">Kg</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(sm.ledger || []).map((r, i) => (
                <TableRow key={i}>
                  <TableCell sx={dense}>
                    <Typography variant="caption" fontWeight={700} color={r.direction === 'In' ? 'success.main' : 'error.main'}>
                      {r.direction}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ ...dense, whiteSpace: 'normal' }}>{r.reason}</TableCell>
                  <TableCell sx={dense}>{r.party || '—'}</TableCell>
                  <TableCell sx={dense}>{r.material}</TableCell>
                  <TableCell sx={dense} align="right">{r.bundles || 0}</TableCell>
                  <TableCell sx={dense} align="right">{Number(r.weightKg || 0).toFixed(1)}</TableCell>
                </TableRow>
              ))}
              {!(sm.ledger || []).length && (
                <TableRow>
                  <TableCell colSpan={6} sx={dense}>
                    <Typography variant="caption" color="text.secondary">No stock movement</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}

export default function DailyBookReportDialog({ open, onClose, defaultDate }) {
  const isMobile = useIsMobile();
  const [mode, setMode] = useState('single');
  const [singleDate, setSingleDate] = useState(defaultDate || '');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setSingleDate(defaultDate || new Date().toISOString().slice(0, 10));
      setReport(null);
      setError('');
    }
  }, [open, defaultDate]);

  const loadReport = async () => {
    setLoading(true);
    setError('');
    try {
      const params =
        mode === 'single'
          ? { date: singleDate }
          : { startDate, endDate };
      if (mode === 'range' && (!startDate || !endDate)) {
        setError('Select start and end dates');
        setLoading(false);
        return;
      }
      if (mode === 'single' && !singleDate) {
        setError('Select a date');
        setLoading(false);
        return;
      }
      const res = await reportsAPI.getDailyBook(params);
      setReport(res.data.data);
    } catch (err) {
      setReport(null);
      setError(err.response?.data?.message || 'Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ResponsiveDialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ py: 1.5, px: 2, fontWeight: 700, borderBottom: 1, borderColor: 'divider' }}>
        Daily Book Report
      </DialogTitle>
      <DialogContent sx={{ px: { xs: 1.5, sm: 2 }, pt: 2, pb: 1 }}>
        <Box
          display="flex"
          gap={1.5}
          flexWrap="wrap"
          alignItems={{ xs: 'stretch', sm: 'center' }}
          mb={2}
          flexDirection={{ xs: 'column', sm: 'row' }}
        >
          <ToggleButtonGroup
            size="small"
            exclusive
            value={mode}
            onChange={(_, v) => v && setMode(v)}
            sx={{ width: { xs: '100%', sm: 'auto' }, '& .MuiToggleButton-root': { flex: { xs: 1, sm: 'none' } } }}
          >
            <ToggleButton value="single">Single Date</ToggleButton>
            <ToggleButton value="range">Date Range</ToggleButton>
          </ToggleButtonGroup>
          {mode === 'single' ? (
            <TextField
              size="small"
              type="date"
              label="Date"
              value={singleDate}
              onChange={(e) => setSingleDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth={isMobile}
              sx={{ maxWidth: { sm: 200 } }}
            />
          ) : (
            <DateRangePicker
              startDate={startDate}
              endDate={endDate}
              onStartChange={setStartDate}
              onEndChange={setEndDate}
            />
          )}
          <Button variant="contained" size={isMobile ? 'medium' : 'small'} onClick={loadReport} disabled={loading} fullWidth={isMobile}>
            Generate
          </Button>
          {report && (
            <Box display="flex" gap={1} flexDirection={{ xs: 'column', sm: 'row' }} sx={{ width: { xs: '100%', sm: 'auto' } }}>
              <Button
                size={isMobile ? 'medium' : 'small'}
                variant="outlined"
                fullWidth={isMobile}
                startIcon={<TableChartIcon />}
                onClick={() => exportDailyBookReportExcel(report)}
              >
                Export Excel
              </Button>
              <Button
                size={isMobile ? 'medium' : 'small'}
                variant="outlined"
                fullWidth={isMobile}
                startIcon={<PictureAsPdfIcon />}
                onClick={() => exportDailyBookReportPdf(report)}
              >
                Export PDF
              </Button>
            </Box>
          )}
        </Box>

        {error && (
          <Typography color="error" variant="body2" mb={1}>{error}</Typography>
        )}

        {loading ? (
          <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
        ) : report ? (
          <>
            {report.mode === 'range' && (
              <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
                <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                  Range Summary — {formatDate(report.startDate)} to {formatDate(report.endDate)}
                </Typography>
                <Box display="flex" gap={2} flexWrap="wrap" mb={1}>
                  <Typography variant="body2">Open: <strong>{formatCurrency(report.rangeSummary?.openingBalance)}</strong></Typography>
                  <Typography variant="body2">In: <strong>{formatCurrency(report.rangeSummary?.totalMoneyIn)}</strong></Typography>
                  <Typography variant="body2">Out: <strong>{formatCurrency(report.rangeSummary?.totalMoneyOut)}</strong></Typography>
                  <Typography variant="body2">Close: <strong>{formatCurrency(report.rangeSummary?.closingBalance)}</strong></Typography>
                  <Typography variant="body2">Sales out: <strong>{Number(report.rangeSummary?.totalSalesKg || 0).toFixed(1)} kg</strong></Typography>
                  <Typography variant="body2">Purchases in: <strong>{Number(report.rangeSummary?.totalPurchasesKg || 0).toFixed(1)} kg</strong></Typography>
                  <Typography variant="body2">Anneal sent: <strong>{Number(report.rangeSummary?.annealSentKg || 0).toFixed(1)} kg</strong></Typography>
                  <Typography variant="body2">Anneal arrived: <strong>{Number(report.rangeSummary?.annealArrivedKg || 0).toFixed(1)} kg</strong></Typography>
                  <Typography variant="body2">Processing coil in: <strong>{Number(report.rangeSummary?.processingCoilInKg || 0).toFixed(1)} kg</strong></Typography>
                  <Typography variant="body2">Processing wire out: <strong>{Number(report.rangeSummary?.processingWireOutKg || 0).toFixed(1)} kg</strong></Typography>
                  <Typography variant="body2">
                    Factory expenses: <strong>{formatCurrency(report.rangeSummary?.factoryExpenseTotal || 0)}</strong>
                  </Typography>
                </Box>
                <SimpleList
                  title="Factory Expense Breakdown for Selected Range"
                  headers={['Expense Group', 'Category', 'Amount']}
                  rows={(report.rangeSummary?.factoryExpenseBreakdown || []).map((row) => [
                    row.group,
                    row.category,
                    formatCurrency(row.amount || 0),
                  ])}
                  empty="No cash-paid factory expenses in this range"
                />
                <TableContainer sx={{ overflowX: 'auto' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={head}>Date</TableCell>
                        <TableCell sx={head} align="right">Open</TableCell>
                        <TableCell sx={head} align="right">In</TableCell>
                        <TableCell sx={head} align="right">Out</TableCell>
                        <TableCell sx={head} align="right">Close</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {report.days.map((d) => (
                        <TableRow key={d.date}>
                          <TableCell sx={dense}>{formatDate(d.date)}</TableCell>
                          <TableCell sx={dense} align="right">{formatCurrency(d.cash?.openingBalance)}</TableCell>
                          <TableCell sx={dense} align="right">{formatCurrency(d.cash?.totalIn)}</TableCell>
                          <TableCell sx={dense} align="right">{formatCurrency(d.cash?.totalOut)}</TableCell>
                          <TableCell sx={dense} align="right">{formatCurrency(d.cash?.closingBalance)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            )}

            {report.mode === 'single' ? (
              <DayReportBody day={report.days[0]} />
            ) : (
              report.days.map((day) => (
                <Accordion key={String(day.date)} disableGutters sx={{ mb: 1, '&:before': { display: 'none' } }}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography variant="subtitle2" fontWeight={600}>
                      {formatDate(day.date)} — In {formatCurrency(day.cash?.totalIn)} / Out {formatCurrency(day.cash?.totalOut)} → Close {formatCurrency(day.cash?.closingBalance)}
                    </Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <DayReportBody day={day} />
                  </AccordionDetails>
                </Accordion>
              ))
            )}
          </>
        ) : (
          <Typography variant="body2" color="text.secondary">
            Choose a date or range and click Generate.
          </Typography>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 2, py: 1 }}>
        <Button size="small" onClick={onClose}>Close</Button>
      </DialogActions>
    </ResponsiveDialog>
  );
}
