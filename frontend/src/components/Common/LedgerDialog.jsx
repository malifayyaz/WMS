import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  Box,
  CircularProgress,
  Tabs,
  Tab,
  Chip,
} from '@mui/material';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import TableChartIcon from '@mui/icons-material/TableChart';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { exportLedgerExcel, exportLedgerPdf } from '../../utils/ledgerExport';
import DateRangePicker from './DateRangePicker';

const denseCell = {
  py: 0.45,
  px: 1,
  fontSize: '0.78rem',
  lineHeight: 1.3,
  verticalAlign: 'top',
};

const headCell = {
  ...denseCell,
  fontWeight: 700,
  bgcolor: 'grey.100',
  color: 'text.secondary',
  borderBottom: '1px solid',
  borderColor: 'divider',
  whiteSpace: 'nowrap',
};

const descCell = {
  ...denseCell,
  whiteSpace: 'normal',
  wordBreak: 'break-word',
  overflowWrap: 'anywhere',
};

const sourceCell = {
  ...denseCell,
  whiteSpace: 'normal',
  wordBreak: 'break-word',
};

/**
 * props:
 * - linked: boolean — party is both supplier + processing
 * - primaryRole: 'processing' | 'supplier' | 'customer' — default tab context
 * - fetchLedger(params) — params include mode, scope, dates
 */
export default function LedgerDialog({
  open,
  onClose,
  title,
  fetchLedger,
  partyType,
  linked = false,
  primaryRole = 'customer',
}) {
  const [ledger, setLedger] = useState(null);
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [viewTab, setViewTab] = useState(0); // personal / datewise
  const [scopeTab, setScopeTab] = useState(0); // processing / supplier / combined when linked

  // Reset scope when dialog opens — default to Combined Net so settlement is visible
  useEffect(() => {
    if (!open) return;
    if (!linked) {
      setScopeTab(0);
      return;
    }
    setScopeTab(2); // Combined Net
  }, [open, linked, primaryRole]);

  const scopeForTab = () => {
    if (!linked) return 'own';
    if (scopeTab === 0) return 'processing';
    if (scopeTab === 1) return 'supplier';
    return 'combined';
  };

  useEffect(() => {
    if (!open || !fetchLedger) return;
    (async () => {
      setLoading(true);
      try {
        const params = {
          mode: viewTab === 1 ? 'datewise' : 'personal',
          scope: scopeForTab(),
        };
        if (startDate) params.startDate = startDate;
        if (endDate) params.endDate = endDate;
        const res = await fetchLedger(params);
        setLedger(res.data.data);
      } catch {
        setLedger(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, fetchLedger, startDate, endDate, viewTab, scopeTab, linked]);

  const isDaily = ledger?.isDailyCustomer;
  const isDateWise = ledger?.ledgerMode === 'datewise' && !isDaily;
  const isCombined = ledger?.scope === 'combined';
  const settlement = ledger?.settlement || ledger?.summary?.settlement;

  const balanceLabel = (balance) => {
    // Combined uses settlement net; customer-style: positive = they owe us
    if (partyType === 'Supplier' && !isCombined && ledger?.scope !== 'processing') {
      return balance < 0 ? 'We owe them' : balance > 0 ? 'They owe us' : 'Settled';
    }
    return balance > 0 ? 'They owe us' : balance < 0 ? 'We owe them' : 'Settled';
  };

  const roleChip = (role) => {
    if (!role) return null;
    return (
      <Chip
        size="small"
        label={role === 'processing' ? 'Processing' : 'Supplier'}
        color={role === 'processing' ? 'primary' : 'secondary'}
        variant="outlined"
        sx={{ height: 18, fontSize: '0.65rem', '& .MuiChip-label': { px: 0.75 } }}
      />
    );
  };

  const SettlementPanel = () => {
    if (!isCombined || !settlement) return null;
    const net = settlement.netBalance || 0;
    return (
      <Box
        sx={{
          mb: 1.5,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          overflow: 'hidden',
        }}
      >
        <Box sx={{ bgcolor: 'primary.50', px: 1.5, py: 0.75, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="subtitle2" fontWeight={700}>
            Combined Settlement — Processing + Supplier
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Separate ledgers stay unchanged. This view only deducts the two sides to show the final net.
          </Typography>
        </Box>
        <Box display="flex" flexWrap="wrap" gap={2} sx={{ px: 1.5, py: 1.25 }}>
          <Box>
            <Typography variant="caption" color="text.secondary">They owe us (Processing)</Typography>
            <Typography variant="body2" fontWeight={700} color="success.main">
              {formatCurrency(settlement.theyOweUsFromProcessing || 0)}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">We owe them (Supplier)</Typography>
            <Typography variant="body2" fontWeight={700} color="error.main">
              {formatCurrency(settlement.weOweThemAsSupplier || 0)}
            </Typography>
          </Box>
          {(settlement.theyOweUsAsSupplier > 0 || settlement.weOweThemFromProcessing > 0) && (
            <>
              {settlement.theyOweUsAsSupplier > 0 && (
                <Box>
                  <Typography variant="caption" color="text.secondary">They owe us (Supplier advance)</Typography>
                  <Typography variant="body2" fontWeight={700} color="success.main">
                    {formatCurrency(settlement.theyOweUsAsSupplier)}
                  </Typography>
                </Box>
              )}
              {settlement.weOweThemFromProcessing > 0 && (
                <Box>
                  <Typography variant="caption" color="text.secondary">We owe them (Processing)</Typography>
                  <Typography variant="body2" fontWeight={700} color="error.main">
                    {formatCurrency(settlement.weOweThemFromProcessing)}
                  </Typography>
                </Box>
              )}
            </>
          )}
          <Box>
            <Typography variant="caption" color="text.secondary">Deducted against each other</Typography>
            <Typography variant="body2" fontWeight={700}>
              {formatCurrency(settlement.deducted || 0)}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Final amount</Typography>
            <Typography
              variant="body1"
              fontWeight={800}
              color={net > 0 ? 'success.main' : net < 0 ? 'error.main' : 'text.primary'}
            >
              {formatCurrency(settlement.netAmount || 0)}
              <Typography component="span" variant="caption" sx={{ ml: 0.75, fontWeight: 600 }}>
                {settlement.status || balanceLabel(net)}
              </Typography>
            </Typography>
          </Box>
        </Box>
      </Box>
    );
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth PaperProps={{ sx: { borderRadius: 1.5 } }}>
      <DialogTitle sx={{ py: 1.5, px: 2, fontSize: '1.05rem', fontWeight: 700, borderBottom: 1, borderColor: 'divider' }}>
        {title || (isDaily ? 'Daily Purchases' : 'Ledger')}
        {linked && (
          <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1.5, fontWeight: 500 }}>
            Linked supplier + processing
          </Typography>
        )}
      </DialogTitle>
      <DialogContent sx={{ px: 2, pt: 1.5, pb: 1 }}>
        {linked && !isDaily && (
          <Tabs
            value={scopeTab}
            onChange={(_, v) => setScopeTab(v)}
            sx={{
              minHeight: 36,
              mb: 1,
              '& .MuiTab-root': { minHeight: 36, py: 0.5, px: 1.5, fontSize: '0.8rem', textTransform: 'none', fontWeight: 600 },
            }}
          >
            <Tab label="Processing Work" />
            <Tab label="Supplier" />
            <Tab label="Combined Net" />
          </Tabs>
        )}

        {!isDaily && (
          <Tabs
            value={viewTab}
            onChange={(_, v) => setViewTab(v)}
            sx={{
              minHeight: 32,
              mb: 1.5,
              '& .MuiTab-root': { minHeight: 32, py: 0.25, px: 1.25, fontSize: '0.75rem', textTransform: 'none' },
            }}
          >
            <Tab label="Personal" />
            <Tab label="Date-wise" />
          </Tabs>
        )}

        <Box display="flex" gap={1} mb={1.5} flexWrap="wrap" alignItems="center" justifyContent="space-between">
          <DateRangePicker startDate={startDate} endDate={endDate} onStartChange={setStartDate} onEndChange={setEndDate} />
          {ledger && !loading && (
            <Box display="flex" gap={1}>
              <Button
                size="small"
                variant="outlined"
                startIcon={<TableChartIcon />}
                onClick={() => exportLedgerExcel(ledger, { title, partyType })}
              >
                Export Excel
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={<PictureAsPdfIcon />}
                onClick={() => exportLedgerPdf(ledger, { title, partyType })}
              >
                Export PDF
              </Button>
            </Box>
          )}
        </Box>

        {loading ? (
          <Box display="flex" justifyContent="center" p={3}><CircularProgress size={28} /></Box>
        ) : ledger ? (
          <>
            <SettlementPanel />

            <Box
              display="flex"
              gap={2}
              mb={1.5}
              flexWrap="wrap"
              sx={{
                bgcolor: 'grey.50',
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                px: 1.5,
                py: 1,
              }}
            >
              {isDaily ? (
                <>
                  <Typography variant="body2">Purchased: <strong>{formatCurrency(ledger.summary?.totalPurchased || 0)}</strong></Typography>
                  <Typography variant="body2">Weight: <strong>{(ledger.summary?.totalWeight || 0).toFixed(2)} kg</strong></Typography>
                </>
              ) : isCombined && settlement ? (
                <>
                  <Typography variant="body2">
                    Processing: <strong>{formatCurrency(Math.abs(settlement.processing?.balance || 0))}</strong>
                    <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                      {settlement.processing?.status}
                    </Typography>
                  </Typography>
                  <Typography variant="body2">
                    Supplier: <strong>{formatCurrency(Math.abs(settlement.supplier?.balance || 0))}</strong>
                    <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                      {settlement.supplier?.status}
                    </Typography>
                  </Typography>
                  <Typography variant="body2">
                    Combined Credit: <strong>{formatCurrency(ledger.summary?.totalCredit || 0)}</strong>
                  </Typography>
                  <Typography variant="body2">
                    Combined Debit: <strong>{formatCurrency(ledger.summary?.totalDebit || 0)}</strong>
                  </Typography>
                  <Typography variant="body2">
                    Final net: <strong>{formatCurrency(settlement.netAmount ?? settlement.netBalance ?? 0)}</strong>
                    <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.75 }}>
                      {settlement.status}
                    </Typography>
                  </Typography>
                </>
              ) : (
                <>
                  <Typography variant="body2">Credit: <strong>{formatCurrency(ledger.summary?.totalCredit || 0)}</strong></Typography>
                  <Typography variant="body2">Debit: <strong>{formatCurrency(ledger.summary?.totalDebit || 0)}</strong></Typography>
                  <Typography variant="body2">
                    Balance: <strong>{formatCurrency(Math.abs(ledger.summary?.balance || 0))}</strong>
                    <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.75 }}>
                      {balanceLabel(ledger.summary?.balance || 0)}
                    </Typography>
                  </Typography>
                  {(ledger.summary?.totalWeight || 0) > 0 && (
                    <Typography variant="body2">Weight: <strong>{ledger.summary.totalWeight.toFixed(2)} kg</strong></Typography>
                  )}
                </>
              )}
            </Box>

            {isDateWise ? (
              <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 480 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={headCell}>Date</TableCell>
                      <TableCell sx={headCell} align="right">Open</TableCell>
                      <TableCell sx={headCell} align="right">Credit</TableCell>
                      <TableCell sx={headCell} align="right">Debit</TableCell>
                      <TableCell sx={headCell} align="right">Wt</TableCell>
                      <TableCell sx={headCell} align="right">Close</TableCell>
                      <TableCell sx={{ ...headCell, whiteSpace: 'normal' }}>Entries</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(ledger.days || []).map((day) => (
                      <TableRow key={day.date} hover>
                        <TableCell sx={{ ...denseCell, whiteSpace: 'nowrap' }}>{formatDate(day.date)}</TableCell>
                        <TableCell sx={{ ...denseCell, whiteSpace: 'nowrap' }} align="right">{formatCurrency(day.openingBalance)}</TableCell>
                        <TableCell sx={{ ...denseCell, whiteSpace: 'nowrap' }} align="right">{day.credit ? formatCurrency(day.credit) : '—'}</TableCell>
                        <TableCell sx={{ ...denseCell, whiteSpace: 'nowrap' }} align="right">{day.debit ? formatCurrency(day.debit) : '—'}</TableCell>
                        <TableCell sx={{ ...denseCell, whiteSpace: 'nowrap' }} align="right">{day.totalWeight ? day.totalWeight.toFixed(1) : '—'}</TableCell>
                        <TableCell sx={{ ...denseCell, whiteSpace: 'nowrap', fontWeight: 600 }} align="right">{formatCurrency(day.closingBalance)}</TableCell>
                        <TableCell sx={descCell}>
                          {(day.entries || []).map((e, i) => (
                            <Box key={i} display="flex" alignItems="flex-start" gap={0.5} sx={{ mb: 0.15 }}>
                              {isCombined && roleChip(e.role)}
                              <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
                                {e.description}{e.weightKg ? ` (${e.weightKg} kg)` : ''}{e.paymentMethod ? ` · ${e.paymentMethod}` : ''}
                              </Typography>
                            </Box>
                          ))}
                        </TableCell>
                      </TableRow>
                    ))}
                    {(ledger.days || []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} sx={denseCell}>
                          <Typography variant="caption" color="text.secondary">No entries for selected range.</Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 480, overflowX: 'auto' }}>
                <Table size="small" stickyHeader sx={{ tableLayout: 'fixed', minWidth: isCombined ? 1080 : 1000 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ ...headCell, width: 96 }}>Date</TableCell>
                      {isCombined && <TableCell sx={{ ...headCell, width: 88 }}>Role</TableCell>}
                      <TableCell sx={{ ...headCell, whiteSpace: 'normal', width: isCombined ? '20%' : '24%' }}>Description</TableCell>
                      {!isDaily && <TableCell sx={{ ...headCell, width: 110 }}>Source</TableCell>}
                      <TableCell sx={{ ...headCell, width: 110 }}>Payment</TableCell>
                      {!isDaily && <TableCell sx={{ ...headCell, width: 72 }} align="right">Wt</TableCell>}
                      {!isDaily && <TableCell sx={{ ...headCell, width: 88 }} align="right">Rate</TableCell>}
                      {isDaily ? (
                        <TableCell sx={{ ...headCell, width: 110 }} align="right">Amount</TableCell>
                      ) : (
                        <>
                          <TableCell sx={{ ...headCell, width: 100 }} align="right">Credit</TableCell>
                          <TableCell sx={{ ...headCell, width: 100 }} align="right">Debit</TableCell>
                          <TableCell sx={{ ...headCell, width: 100 }} align="right">Total</TableCell>
                          <TableCell sx={{ ...headCell, width: 150 }} align="right">Balance</TableCell>
                        </>
                      )}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(ledger.entries || []).map((row, i) => (
                      <TableRow
                        key={i}
                        hover
                        sx={{
                          bgcolor: row.entryType === 'broughtforward' ? 'action.hover' : undefined,
                        }}
                      >
                        <TableCell sx={{ ...denseCell, whiteSpace: 'nowrap' }}>{formatDate(row.date)}</TableCell>
                        {isCombined && <TableCell sx={denseCell}>{roleChip(row.role)}</TableCell>}
                        <TableCell sx={descCell}>{row.description}</TableCell>
                        {!isDaily && <TableCell sx={sourceCell}>{row.source}</TableCell>}
                        <TableCell sx={{ ...denseCell, whiteSpace: 'nowrap' }}>{row.paymentMethod || '—'}</TableCell>
                        {!isDaily && <TableCell sx={{ ...denseCell, whiteSpace: 'nowrap' }} align="right">{row.weightKg ? Number(row.weightKg).toFixed(1) : '—'}</TableCell>}
                        {!isDaily && <TableCell sx={{ ...denseCell, whiteSpace: 'nowrap' }} align="right">{row.ratePerKg ? formatCurrency(row.ratePerKg) : '—'}</TableCell>}
                        {isDaily ? (
                          <TableCell sx={{ ...denseCell, whiteSpace: 'nowrap' }} align="right">{formatCurrency(row.amount)}</TableCell>
                        ) : (
                          <>
                            <TableCell sx={{ ...denseCell, whiteSpace: 'nowrap', color: row.credit ? 'success.main' : undefined }} align="right">
                              {row.credit ? formatCurrency(row.credit) : '—'}
                            </TableCell>
                            <TableCell sx={{ ...denseCell, whiteSpace: 'nowrap', color: row.debit ? 'error.main' : undefined }} align="right">
                              {row.debit ? formatCurrency(row.debit) : '—'}
                            </TableCell>
                            <TableCell sx={{ ...denseCell, whiteSpace: 'nowrap' }} align="right">{row.totalPrice ? formatCurrency(row.totalPrice) : '—'}</TableCell>
                            <TableCell sx={{ ...denseCell, whiteSpace: 'nowrap', fontWeight: 600 }} align="right">
                              {formatCurrency(Math.abs(row.balance))}
                              <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5, fontWeight: 400, display: 'block' }}>
                                {balanceLabel(row.balance)}
                              </Typography>
                            </TableCell>
                          </>
                        )}
                      </TableRow>
                    ))}
                    {(ledger.entries || []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={isDaily ? 4 : (isCombined ? 11 : 10)} sx={denseCell}>
                          <Typography variant="caption" color="text.secondary">No entries for selected range.</Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </>
        ) : (
          <Typography color="text.secondary" variant="body2">Failed to load ledger.</Typography>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 2, py: 1 }}>
        <Button size="small" onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
