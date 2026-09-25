import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  Alert,
  Box,
  Button,
  ButtonGroup,
  Card,
  CardContent,
  CircularProgress,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import TableChartIcon from '@mui/icons-material/TableChart';
import DateRangePicker from '../components/Common/DateRangePicker';
import PageToolbar from '../components/Common/PageToolbar';
import { useIsMobile } from '../hooks/useBreakpoint';
import { formatCurrency, formatDate } from '../utils/formatters';
import { reportsAPI, customersAPI, periodCloseAPI, openingBalanceAPI } from '../services/api';
import {
  exportFinancialExcel,
  exportInventoryExcel,
  exportProfitExcel,
  exportProfitPdf,
} from '../utils/managementReportExport';

/**
 * G4 FIX: Quick date preset buttons.
 * Lets users pick Today / This Week / This Month / Last Month / This Year
 * with a single click instead of manually typing both dates.
 */
function DatePresets({ onApply }) {
  const presets = [
    {
      label: 'Today',
      getRange: () => {
        const d = dayjs();
        return [d.format('YYYY-MM-DD'), d.format('YYYY-MM-DD')];
      },
    },
    {
      label: 'This Week',
      getRange: () => [
        dayjs().startOf('week').format('YYYY-MM-DD'),
        dayjs().endOf('week').format('YYYY-MM-DD'),
      ],
    },
    {
      label: 'This Month',
      getRange: () => [
        dayjs().startOf('month').format('YYYY-MM-DD'),
        dayjs().endOf('month').format('YYYY-MM-DD'),
      ],
    },
    {
      label: 'Last Month',
      getRange: () => [
        dayjs().subtract(1, 'month').startOf('month').format('YYYY-MM-DD'),
        dayjs().subtract(1, 'month').endOf('month').format('YYYY-MM-DD'),
      ],
    },
    {
      label: 'This Year',
      getRange: () => [
        dayjs().startOf('year').format('YYYY-MM-DD'),
        dayjs().endOf('year').format('YYYY-MM-DD'),
      ],
    },
  ];

  return (
    <Box display="flex" gap={0.75} flexWrap="wrap" sx={{ width: { xs: '100%', sm: 'auto' } }}>
      {presets.map(({ label, getRange }) => (
        <Button
          key={label}
          size="small"
          variant="outlined"
          color="secondary"
          onClick={() => {
            const [s, e] = getRange();
            onApply(s, e);
          }}
          sx={{ textTransform: 'none', fontSize: '0.72rem', py: 0.4, px: 1 }}
        >
          {label}
        </Button>
      ))}
    </Box>
  );
}

const dense = { py: 0.55, px: 1, fontSize: '0.78rem' };
const head = { ...dense, fontWeight: 700, bgcolor: 'grey.100' };

function MetricCard({ title, value, color = 'text.primary', helper }) {
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Typography variant="caption" color="text.secondary">{title}</Typography>
        <Typography variant="h6" color={color} fontWeight={700}>{value}</Typography>
        {helper && <Typography variant="caption" color="text.secondary">{helper}</Typography>}
      </CardContent>
    </Card>
  );
}

function ScopeHeader({ scope, setScope, data }) {
  return (
    <PageToolbar sx={{ mb: 2 }}>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={scope}
        onChange={(_, value) => value && setScope(value)}
        sx={{ width: { xs: '100%', sm: 'auto' }, flexWrap: 'wrap', '& .MuiToggleButton-root': { flex: { xs: 1, sm: 'none' } } }}
      >
        <ToggleButton value="main">Main Business</ToggleButton>
        <ToggleButton value="processing">Processing / Labour</ToggleButton>
        <ToggleButton value="combined">Combined</ToggleButton>
      </ToggleButtonGroup>
      {data && (
        <Box display="flex" gap={1} flexWrap="wrap" sx={{ width: { xs: '100%', sm: 'auto' } }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<TableChartIcon />}
            onClick={() => exportProfitExcel(data, scope)}
            sx={{ width: { xs: '100%', sm: 'auto' } }}
          >
            Export Excel
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<PictureAsPdfIcon />}
            onClick={() => exportProfitPdf(data, scope)}
            sx={{ width: { xs: '100%', sm: 'auto' } }}
          >
            Export PDF
          </Button>
        </Box>
      )}
    </PageToolbar>
  );
}

function StatementTable({ title, lines }) {
  if (!lines?.length) return null;
  return (
    <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={head} colSpan={2}>{title}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {lines.map((row, index) => {
            const isTotal = row.kind === 'total';
            const isSubtotal = row.kind === 'subtotal';
            return (
              <TableRow
                key={`${row.label}-${index}`}
                sx={{ bgcolor: isTotal ? 'grey.100' : isSubtotal ? 'grey.50' : 'inherit' }}
              >
                <TableCell sx={{ ...dense, fontWeight: isTotal ? 700 : isSubtotal ? 600 : 400 }}>
                  {row.label}
                </TableCell>
                <TableCell
                  align="right"
                  sx={{
                    ...dense,
                    fontWeight: isTotal ? 700 : isSubtotal ? 600 : 400,
                    color: isTotal
                      ? (row.amount >= 0 ? 'success.main' : 'error.main')
                      : row.kind === 'less' ? 'error.main' : 'text.primary',
                  }}
                >
                  {formatCurrency(row.amount)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function BreakdownTable({ title, rows, total, totalLabel = 'Total' }) {
  return (
    <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={head}>{title}</TableCell>
            <TableCell sx={head} align="right">Amount</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {(rows || []).map((row) => (
            <TableRow key={row.label}>
              <TableCell sx={dense}>{row.label}</TableCell>
              <TableCell sx={dense} align="right">{formatCurrency(row.amount)}</TableCell>
            </TableRow>
          ))}
          {!(rows || []).length && (
            <TableRow><TableCell colSpan={2} sx={dense}>Nothing recorded in this period.</TableCell></TableRow>
          )}
          {total != null && (
            <TableRow sx={{ bgcolor: 'grey.100' }}>
              <TableCell sx={{ ...dense, fontWeight: 700 }}>{totalLabel}</TableCell>
              <TableCell sx={{ ...dense, fontWeight: 700 }} align="right">{formatCurrency(total)}</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function CoilAnalysisTable({ coilAnalysis, title = 'Coil Purchase & Sale Averages (Patri / Shiplet / Combined)' }) {
  if (!coilAnalysis) return null;
  const rows = [coilAnalysis.shiplet, coilAnalysis.patri, coilAnalysis.combined].filter(Boolean);
  return (
    <>
      <Typography variant="subtitle1" fontWeight={700} mb={0.5}>{title}</Typography>
      <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={head}>Coil Type</TableCell>
              <TableCell sx={head} align="right">Purchase kg (period)</TableCell>
              <TableCell sx={{ ...head, display: { xs: 'none', md: 'table-cell' } }} align="right">Avg purchase rate/kg</TableCell>
              <TableCell sx={head} align="right">Coil stock kg</TableCell>
              <TableCell sx={{ ...head, display: { xs: 'none', md: 'table-cell' } }} align="right">Avg stock purchase rate/kg</TableCell>
              <TableCell sx={head} align="right">Sales kg (period)</TableCell>
              <TableCell sx={{ ...head, display: { xs: 'none', md: 'table-cell' } }} align="right">Avg sale rate/kg</TableCell>
              <TableCell sx={{ ...head, display: { xs: 'none', sm: 'table-cell' } }} align="right">Ready wire stock kg</TableCell>
              <TableCell sx={{ ...head, display: { xs: 'none', sm: 'table-cell' } }} align="right">Est. ready stock value</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.label}>
                <TableCell sx={{ ...dense, fontWeight: 600 }}>{row.label}</TableCell>
                <TableCell sx={dense} align="right">{Number(row.periodPurchaseKg || 0).toFixed(1)}</TableCell>
                <TableCell sx={{ ...dense, display: { xs: 'none', md: 'table-cell' } }} align="right">{formatCurrency(row.avgPurchaseRate)}</TableCell>
                <TableCell sx={dense} align="right">{Number(row.stockKg || 0).toFixed(1)}</TableCell>
                <TableCell sx={{ ...dense, display: { xs: 'none', md: 'table-cell' } }} align="right">{formatCurrency(row.avgStockPurchaseRate)}</TableCell>
                <TableCell sx={dense} align="right">{Number(row.periodSalesKg || 0).toFixed(1)}</TableCell>
                <TableCell sx={{ ...dense, display: { xs: 'none', md: 'table-cell' } }} align="right">{formatCurrency(row.avgSaleRate)}</TableCell>
                <TableCell sx={{ ...dense, display: { xs: 'none', sm: 'table-cell' } }} align="right">{Number(row.readyStockKg || 0).toFixed(1)}</TableCell>
                <TableCell sx={{ ...dense, display: { xs: 'none', sm: 'table-cell' } }} align="right">{formatCurrency(row.estimatedReadyStockValue)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {coilAnalysis.wastage && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Wastage allowance deducted from profit: <strong>{formatCurrency(coilAnalysis.wastage.amount)}</strong>
          {' '}({coilAnalysis.wastage.basisLabel})
        </Alert>
      )}
    </>
  );
}

function CategoryProfit({ data, title, isCombined }) {
  if (!data) return null;
  
  return (
    <>
      <Typography variant="h6" fontWeight={700} mb={2}>{title}</Typography>
      
      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} md={6}>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow><TableCell sx={head} colSpan={2}>Calculation Flow</TableCell></TableRow>
              </TableHead>
              <TableBody>
                <TableRow><TableCell sx={dense}>A. Opening Stock</TableCell><TableCell sx={dense} align="right">{Number(data.openingStockKg || 0).toFixed(1)} kg</TableCell></TableRow>
                <TableRow><TableCell sx={dense}>B. Purchases This Period</TableCell><TableCell sx={dense} align="right">{Number(data.purchasesKg || 0).toFixed(1)} kg</TableCell></TableRow>
                <TableRow><TableCell sx={dense}>C. Coil Returns This Period</TableCell><TableCell sx={dense} align="right" color="error.main">-{Number(data.returnsKg || 0).toFixed(1)} kg</TableCell></TableRow>
                <TableRow><TableCell sx={dense}>D. Processing Customer Stock in Factory</TableCell><TableCell sx={dense} align="right">(Included in Opening & Purchases)</TableCell></TableRow>
                <TableRow sx={{ bgcolor: 'grey.100' }}><TableCell sx={{...dense, fontWeight: 700}}>E. Total Stock Available</TableCell><TableCell sx={{...dense, fontWeight: 700}} align="right">{Number(data.totalAvailableKg || 0).toFixed(1)} kg</TableCell></TableRow>
                <TableRow><TableCell sx={dense}>F. Weighted Average Purchase Rate</TableCell><TableCell sx={dense} align="right">{formatCurrency(data.weightedAvgPurchaseRate || 0)}</TableCell></TableRow>
                <TableRow><TableCell sx={dense}>G. Wire Sold (incl. Processing)</TableCell><TableCell sx={dense} align="right">{Number(data.wireSoldKg || 0).toFixed(1)} kg</TableCell></TableRow>
                <TableRow><TableCell sx={dense}>H. Wire Returns</TableCell><TableCell sx={dense} align="right" color="error.main">-{Number(data.wireReturnsKg || 0).toFixed(1)} kg</TableCell></TableRow>
                <TableRow><TableCell sx={dense}>I. Weighted Average Sale Rate</TableCell><TableCell sx={dense} align="right">{formatCurrency(data.weightedAvgSaleRate || 0)}</TableCell></TableRow>
                <TableRow sx={{ bgcolor: 'grey.100' }}><TableCell sx={{...dense, fontWeight: 700}}>J. Cost of Wire Sold</TableCell><TableCell sx={{...dense, fontWeight: 700}} align="right">{formatCurrency(data.costOfWireSold || 0)}</TableCell></TableRow>
                <TableRow sx={{ bgcolor: 'grey.100' }}><TableCell sx={{...dense, fontWeight: 700}}>K. Revenue</TableCell><TableCell sx={{...dense, fontWeight: 700}} align="right">{formatCurrency(data.revenue || 0)}</TableCell></TableRow>
                <TableRow sx={{ bgcolor: 'grey.100' }}><TableCell sx={{...dense, fontWeight: 700}}>L. Closing Stock</TableCell><TableCell sx={{...dense, fontWeight: 700}} align="right">{Number(data.closingStockKg || 0).toFixed(1)} kg</TableCell></TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </Grid>

        <Grid item xs={12} md={6}>
          <Grid container spacing={1.5}>
            <Grid item xs={12} sm={6}><MetricCard title="Cost of Wire Sold" value={formatCurrency(data.costOfWireSold)} /></Grid>
            <Grid item xs={12} sm={6}><MetricCard title="Total Revenue" value={formatCurrency(data.totalRevenue || data.revenue)} helper={data.labourIncome > 0 ? `Incl. Labour: ${formatCurrency(data.labourIncome)}` : ''} /></Grid>
            <Grid item xs={12} sm={6}><MetricCard title="Closing Stock Value" value={formatCurrency(data.closingStockValue)} /></Grid>
            {isCombined && (
              <>
                <Grid item xs={12} sm={6}><MetricCard title="Gross Profit" value={formatCurrency(data.grossProfit)} color={data.grossProfit >= 0 ? 'success.main' : 'error.main'} /></Grid>
                <Grid item xs={12} sm={6}><MetricCard title={`Wastage (${data.wastePercentage || 5}%)`} value={formatCurrency(data.wasteAmount || 0)} color="warning.main" helper="Included in Cost of Wire Sold" /></Grid>
                <Grid item xs={12} sm={6}><MetricCard title="Factory Expenses" value={formatCurrency(data.factoryExpenses || 0)} color="error.main" /></Grid>
                <Grid item xs={12} sm={6}><MetricCard title="Consumption Cost" value={formatCurrency(data.consumptionCost || 0)} color="error.main" /></Grid>
                <Grid item xs={12} sm={6}><MetricCard title="Operating Profit" value={formatCurrency(data.operatingProfit)} color={data.operatingProfit >= 0 ? 'success.main' : 'error.main'} /></Grid>
                <Grid item xs={12} sm={6}><MetricCard title="Self Expenses" value={formatCurrency(data.selfExpenses || 0)} color="warning.main" /></Grid>
                <Grid item xs={12} sm={6}><MetricCard title="Final Net Profit" value={formatCurrency(data.finalNetProfit)} color={data.finalNetProfit >= 0 ? 'success.main' : 'error.main'} /></Grid>
              </>
            )}
          </Grid>
        </Grid>
      </Grid>
    </>
  );
}

function ProfitLossPanel() {
  const isMobile = useIsMobile();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [tabIndex, setTabIndex] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchReport = async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    setError('');
    try {
      const response = await reportsAPI.getProfitLoss({ startDate, endDate });
      setData(response.data.data);
    } catch (err) {
      setData(null);
      setError(err.response?.data?.message || 'Failed to generate profit report');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <PageToolbar>
        <Box display="flex" flexDirection="column" gap={1} sx={{ width: { xs: '100%', sm: 'auto' } }}>
          {/* G4 FIX: Date preset shortcuts */}
          <DatePresets onApply={(s, e) => { setStartDate(s); setEndDate(e); }} />
          <DateRangePicker startDate={startDate} endDate={endDate} onStartChange={setStartDate} onEndChange={setEndDate} />
        </Box>
        <Box display="flex" gap={1} flexWrap="wrap" sx={{ width: { xs: '100%', sm: 'auto' } }}>
          <Button variant="contained" fullWidth={isMobile} onClick={fetchReport} disabled={!startDate || !endDate || loading}>Generate Report</Button>
        </Box>
      </PageToolbar>
      
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading && <CircularProgress />}
      
      {data && (
        <Box mt={2}>
          <Tabs value={tabIndex} onChange={(_, val) => setTabIndex(val)} variant="fullWidth" sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
            <Tab label="Shiplet" />
            <Tab label="Patri" />
            <Tab label="Combined" />
          </Tabs>

          {tabIndex === 0 && <CategoryProfit data={data.shiplet} title="Shiplet Profit & Loss" isCombined={false} />}
          {tabIndex === 1 && <CategoryProfit data={data.patri} title="Patri Profit & Loss" isCombined={false} />}
          {tabIndex === 2 && <CategoryProfit data={data.combined} title="Combined Profit & Loss" isCombined={true} />}
        </Box>
      )}
    </Box>
  );
}

function FinancialPanel() {
  const isMobile = useIsMobile();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchReport = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await reportsAPI.getFinancial({ startDate, endDate });
      setData(response.data.data);
    } catch (err) {
      setData(null);
      setError(err.response?.data?.message || 'Failed to generate cash and bank report');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <PageToolbar>
        <Box display="flex" flexDirection="column" gap={1} sx={{ width: { xs: '100%', sm: 'auto' } }}>
          {/* G4 FIX: Date preset shortcuts */}
          <DatePresets onApply={(s, e) => { setStartDate(s); setEndDate(e); }} />
          <DateRangePicker startDate={startDate} endDate={endDate} onStartChange={setStartDate} onEndChange={setEndDate} />
        </Box>
        <Box display="flex" gap={1} flexWrap="wrap" sx={{ width: { xs: '100%', sm: 'auto' } }}>
          <Button variant="contained" fullWidth={isMobile} onClick={fetchReport} disabled={!startDate || !endDate || loading}>Generate Report</Button>
          {data && <Button variant="outlined" fullWidth={isMobile} startIcon={<TableChartIcon />} onClick={() => exportFinancialExcel(data, startDate, endDate)}>Export Excel</Button>}
        </Box>
      </PageToolbar>
      <Alert severity="info" sx={{ mb: 2 }}>Cash and Bank position is separate from Profit & Loss. Transfers are movement, not revenue.</Alert>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading && <CircularProgress />}
      {data && (
        <>
          <Grid container spacing={1.5} mb={2}>
            <Grid item xs={12} sm={6} md={3}><MetricCard title="Cash Opening" value={formatCurrency(data.cash?.openingBalance)} /></Grid>
            <Grid item xs={12} sm={6} md={3}><MetricCard title="Cash Closing" value={formatCurrency(data.cash?.closingBalance)} /></Grid>
            <Grid item xs={12} sm={6} md={3}><MetricCard title="Bank Opening" value={formatCurrency(data.bank?.openingBalance)} /></Grid>
            <Grid item xs={12} sm={6} md={3}><MetricCard title="Bank Closing" value={formatCurrency(data.bank?.closingBalance)} /></Grid>
            <Grid item xs={12} sm={6} md={3}><MetricCard title="Combined Closing" value={formatCurrency(data.summary?.cashAndBankClosing)} color="primary.main" /></Grid>
            <Grid item xs={12} sm={6} md={3}><MetricCard title="Factory Expenses" value={formatCurrency(data.summary?.factoryExpenses)} color="error.main" /></Grid>
            <Grid item xs={12} sm={6} md={3}><MetricCard title="Self Expenses" value={formatCurrency(data.summary?.selfExpenses)} color="warning.main" /></Grid>
          </Grid>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead><TableRow><TableCell sx={head}>Date</TableCell><TableCell sx={head} align="right">Open</TableCell><TableCell sx={head} align="right">In</TableCell><TableCell sx={head} align="right">Out</TableCell><TableCell sx={head} align="right">Close</TableCell></TableRow></TableHead>
              <TableBody>
                {(data.cash?.days || []).map((day) => (
                  <TableRow key={String(day.date)}>
                    <TableCell sx={dense}>{formatDate(day.date)}</TableCell>
                    <TableCell sx={dense} align="right">{formatCurrency(day.openingBalance)}</TableCell>
                    <TableCell sx={dense} align="right">{formatCurrency(day.totalIn)}</TableCell>
                    <TableCell sx={dense} align="right">{formatCurrency(day.totalOut)}</TableCell>
                    <TableCell sx={dense} align="right">{formatCurrency(day.closingBalance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
    </Box>
  );
}

function InventoryPanel() {
  const isMobile = useIsMobile();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    reportsAPI.getInventory()
      .then((response) => setData(response.data.data))
      .catch((err) => setError(err.response?.data?.message || 'Failed to load inventory'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <CircularProgress />;
  if (error) return <Alert severity="error">{error}</Alert>;
  const totals = data?.totals || {};
  return (
    <Box>
      <PageToolbar>
        <Button variant="outlined" fullWidth={isMobile} startIcon={<TableChartIcon />} onClick={() => exportInventoryExcel(data)}>Export Excel</Button>
      </PageToolbar>
      <Grid container spacing={1.5} my={1}>
        <Grid item xs={12} sm={6} md={3}><MetricCard title="Own Coil Stock" value={`${Number(totals.ownCoilKg || 0).toFixed(1)} kg`} /></Grid>
        <Grid item xs={12} sm={6} md={3}><MetricCard title="Ready Wire Stock" value={`${Number(totals.readyWireKg || 0).toFixed(1)} kg`} helper={`${totals.readyWireBundles || 0} bundles`} /></Grid>
        <Grid item xs={12} sm={6} md={3}><MetricCard title="Pending at Annealing" value={`${Number(totals.annealingPendingKg || 0).toFixed(1)} kg`} helper={`${totals.annealingPendingBundles || 0} bundles`} /></Grid>
        <Grid item xs={12} sm={6} md={3}><MetricCard title="Processing WIP" value={`${Number(totals.processingRemainingKg || 0).toFixed(1)} kg`} /></Grid>
      </Grid>
      {data?.lowStock?.length > 0 && <Alert severity="warning" sx={{ mb: 2 }}>Low stock: {data.lowStock.map((row) => row._id).join(', ')}</Alert>}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead><TableRow><TableCell sx={head}>Area</TableCell><TableCell sx={head}>Material / Party</TableCell><TableCell sx={{ ...head, display: { xs: 'none', sm: 'table-cell' } }} align="right">Bundles</TableCell><TableCell sx={head} align="right">Weight kg</TableCell></TableRow></TableHead>
          <TableBody>
            {(data?.rawStock || []).map((row) => <TableRow key={`raw-${row._id}`}><TableCell sx={dense}>Own Coil</TableCell><TableCell sx={dense}>{row._id}</TableCell><TableCell sx={{ ...dense, display: { xs: 'none', sm: 'table-cell' } }} align="right">—</TableCell><TableCell sx={dense} align="right">{Number(row.totalStock || 0).toFixed(1)}</TableCell></TableRow>)}
            {(data?.readyStock || []).map((row) => <TableRow key={`ready-${row._id}`}><TableCell sx={dense}>Ready Wire</TableCell><TableCell sx={dense}>{row.wireLabel || `Wire #${row._id}`}</TableCell><TableCell sx={{ ...dense, display: { xs: 'none', sm: 'table-cell' } }} align="right">{row.bundles || 0}</TableCell><TableCell sx={dense} align="right">{Number(row.totalStock || 0).toFixed(1)}</TableCell></TableRow>)}
            {(data?.annealingPending || []).map((row) => <TableRow key={`ann-${row.key}`}><TableCell sx={dense}>Annealing</TableCell><TableCell sx={dense}>{row.partyName} — {row.materialType === 'Wire' ? `Wire #${row.wireNumber || '?'}` : row.coilCategory}</TableCell><TableCell sx={{ ...dense, display: { xs: 'none', sm: 'table-cell' } }} align="right">{row.remainingBundles || 0}</TableCell><TableCell sx={dense} align="right">{Number(row.remainingKg || 0).toFixed(1)}</TableCell></TableRow>)}
            {(data?.processingStock || []).filter((row) => row.remainingKg > 0).map((row, i) => <TableRow key={`job-${i}`}><TableCell sx={dense}>Processing</TableCell><TableCell sx={dense}>{row.customerName} — {row.coilCategory}</TableCell><TableCell sx={{ ...dense, display: { xs: 'none', sm: 'table-cell' } }} align="right">—</TableCell><TableCell sx={dense} align="right">{Number(row.remainingKg || 0).toFixed(1)}</TableCell></TableRow>)}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

function CustomerReportPanel() {
  const isMobile = useIsMobile();
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    customersAPI.getAll()
      .then((res) => setCustomers(res.data.data || []))
      .catch(() => setError('Failed to load customers'))
      .finally(() => setListLoading(false));
  }, []);

  const fetchReport = async () => {
    if (!customerId) return;
    setLoading(true);
    setError('');
    try {
      const res = await reportsAPI.getCustomerReport(customerId);
      setData(res.data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load customer report');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const customer = data?.customer;
  const orders = data?.orders || [];

  return (
    <Box>
      <PageToolbar>
        <FormControl size="small" sx={{ width: { xs: '100%', sm: 'auto' }, minWidth: { xs: 0, sm: 260 } }}>
          <InputLabel>Customer</InputLabel>
          <Select
            value={customerId}
            label="Customer"
            onChange={(e) => setCustomerId(e.target.value)}
            disabled={listLoading}
          >
            {customers.map((c) => (
              <MenuItem key={c._id} value={c._id}>{c.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button variant="contained" fullWidth={isMobile} onClick={fetchReport} disabled={!customerId || loading}>
          Generate Report
        </Button>
      </PageToolbar>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading && <CircularProgress />}
      {customer && (
        <>
          <Grid container spacing={1.5} mb={2}>
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard title="Customer" value={customer.name} helper={customer.customerType || 'Ledger'} />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard title="Total Purchased" value={formatCurrency(customer.totalAmountPurchased)} />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard title="Total Paid" value={formatCurrency(customer.totalAmountPaid)} color="success.main" />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard title="Amount Due" value={formatCurrency(customer.totalAmountDue)} color="error.main" />
            </Grid>
          </Grid>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Orders ({orders.length})</Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 480 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={head}>Date</TableCell>
                  <TableCell sx={head}>Wire</TableCell>
                  <TableCell sx={{ ...head, display: { xs: 'none', sm: 'table-cell' } }} align="right">Weight</TableCell>
                  <TableCell sx={head} align="right">Total</TableCell>
                  <TableCell sx={{ ...head, display: { xs: 'none', md: 'table-cell' } }} align="right">Paid</TableCell>
                  <TableCell sx={head} align="right">Due</TableCell>
                  <TableCell sx={{ ...head, display: { xs: 'none', sm: 'table-cell' } }}>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {orders.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>No orders for this customer.</Typography>
                    </TableCell>
                  </TableRow>
                )}
                {orders.map((row) => (
                  <TableRow key={row._id}>
                    <TableCell sx={dense}>{formatDate(row.orderDate)}</TableCell>
                    <TableCell sx={dense}>{row.wireType || `Wire #${row.wireNumber}`}</TableCell>
                    <TableCell sx={{ ...dense, display: { xs: 'none', sm: 'table-cell' } }} align="right">{row.finalWeightKg ?? row.initialWeightKg}</TableCell>
                    <TableCell sx={dense} align="right">{formatCurrency(row.totalAmount)}</TableCell>
                    <TableCell sx={{ ...dense, display: { xs: 'none', md: 'table-cell' } }} align="right">{formatCurrency(row.amountPaid)}</TableCell>
                    <TableCell sx={dense} align="right">{formatCurrency(row.amountDue)}</TableCell>
                    <TableCell sx={{ ...dense, display: { xs: 'none', sm: 'table-cell' } }}>{row.orderStatus}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
    </Box>
  );
}

function ExcessDeliveryReportPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchReport = async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      const res = await reportsAPI.getExcessDeliveries(params);
      setData(res.data.data);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchReport(); }, [startDate, endDate]);

  if (loading && !data) return <CircularProgress />;
  if (error) return <Alert severity="error">{error}</Alert>;

  const records = data?.records || [];
  const summary = data?.summary || {};

  return (
    <Box>
      <PageToolbar>
        <DateRangePicker startDate={startDate} endDate={endDate} onStartChange={setStartDate} onEndChange={setEndDate} />
      </PageToolbar>
      
      <Grid container spacing={1.5} my={2}>
        <Grid item xs={12} sm={6} md={3}><MetricCard title="Total Excess Given" value={`${Number(summary.totalExcessKg || 0).toFixed(1)} kg`} /></Grid>
        <Grid item xs={12} sm={6} md={3}><MetricCard title="Total Sale Amount" value={formatCurrency(summary.totalSaleAmount || 0)} /></Grid>
        <Grid item xs={12} sm={6} md={3}><MetricCard title="Total Profit" value={formatCurrency(summary.totalProfit || 0)} color={(summary.totalProfit || 0) >= 0 ? 'success.main' : 'error.main'} /></Grid>
        <Grid item xs={12} sm={6} md={3}><MetricCard title="Avg Profit per kg" value={formatCurrency(summary.averageProfitPerKg || 0)} /></Grid>
      </Grid>
      
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={head}>Customer Name</TableCell>
              <TableCell sx={head}>Delivery Date</TableCell>
              <TableCell sx={head}>Coil Category</TableCell>
              <TableCell sx={head} align="right">Excess Weight (kg)</TableCell>
              <TableCell sx={head} align="right">Profit Per Kg</TableCell>
              <TableCell sx={head} align="right">Total Profit</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {records.map((r, i) => (
              <TableRow key={i}>
                <TableCell sx={dense}>{r.customerName}</TableCell>
                <TableCell sx={dense}>{formatDate(r.deliveryDate)}</TableCell>
                <TableCell sx={dense}>{r.coilCategory}</TableCell>
                <TableCell sx={dense} align="right">{Number(r.excessWeightKg).toFixed(2)}</TableCell>
                <TableCell sx={dense} align="right">{formatCurrency(r.profitPerKg)}</TableCell>
                <TableCell sx={{...dense, color: r.profitAmount >= 0 ? 'success.main' : 'error.main'}} align="right">{formatCurrency(r.profitAmount)}</TableCell>
              </TableRow>
            ))}
            {!records.length && <TableRow><TableCell colSpan={6} sx={dense} align="center">No excess deliveries found in this period.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

export default function Reports() {
  const location = useLocation();
  const navigate = useNavigate();
  const initialTab = location.state?.tab ?? 0;
  const [tab, setTab] = useState(initialTab);
  const [openingWarning, setOpeningWarning] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [hRes, sRes] = await Promise.all([
          periodCloseAPI.getHistory().catch(() => ({ data: { data: [] } })),
          openingBalanceAPI.getSummary().catch(() => ({ data: { data: null } })),
        ]);
        const history = hRes.data.data || [];
        const summaryData = sRes.data.data;
        const latestClose = history.find((h) => h.status === 'Completed');
        if (mounted && latestClose && summaryData && !summaryData.isComplete) {
          setOpeningWarning(true);
        }
      } catch {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (location.state?.tab != null) setTab(location.state.tab);
  }, [location.state?.tab]);

  return (
    <Box>
      {openingWarning && (
        <Alert
          severity="info"
          sx={{ mb: 2, display: 'flex', alignItems: 'center' }}
          action={
            <Button
              color="inherit"
              size="small"
              variant="outlined"
              onClick={() => navigate('/period-close')}
            >
              Enter Opening Balances &rarr;
            </Button>
          }
        >
          Some opening balances are not yet entered. Reports may not reflect complete figures.
        </Alert>
      )}

      <Tabs
        value={tab}
        onChange={(_, value) => setTab(value)}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
      >
        <Tab label="Profit & Loss" />
        <Tab label="Cash & Bank" />
        <Tab label="Inventory" />
        <Tab label="Customer" />
        <Tab label="Excess Deliveries" />
      </Tabs>
      <Box sx={{ pt: 2 }}>
        {tab === 0 && <ProfitLossPanel />}
        {tab === 1 && <FinancialPanel />}
        {tab === 2 && <InventoryPanel />}
        {tab === 3 && <CustomerReportPanel />}
        {tab === 4 && <ExcessDeliveryReportPanel />}
      </Box>
    </Box>
  );
}
