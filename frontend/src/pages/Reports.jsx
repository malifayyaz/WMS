import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
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
import { formatCurrency, formatDate } from '../utils/formatters';
import { reportsAPI, customersAPI } from '../services/api';
import {
  exportFinancialExcel,
  exportInventoryExcel,
  exportProfitExcel,
  exportProfitPdf,
} from '../utils/managementReportExport';

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
    <Box display="flex" gap={1} alignItems="center" flexWrap="wrap" mb={2}>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={scope}
        onChange={(_, value) => value && setScope(value)}
      >
        <ToggleButton value="main">Main Business</ToggleButton>
        <ToggleButton value="processing">Processing / Labour</ToggleButton>
        <ToggleButton value="combined">Combined</ToggleButton>
      </ToggleButtonGroup>
      {data && (
        <>
          <Button
            size="small"
            variant="outlined"
            startIcon={<TableChartIcon />}
            onClick={() => exportProfitExcel(data, scope)}
          >
            Export Excel
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<PictureAsPdfIcon />}
            onClick={() => exportProfitPdf(data, scope)}
          >
            Export PDF
          </Button>
        </>
      )}
    </Box>
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
              <TableCell sx={head} align="right">Avg purchase rate/kg</TableCell>
              <TableCell sx={head} align="right">Coil stock kg</TableCell>
              <TableCell sx={head} align="right">Avg stock purchase rate/kg</TableCell>
              <TableCell sx={head} align="right">Sales kg (period)</TableCell>
              <TableCell sx={head} align="right">Avg sale rate/kg</TableCell>
              <TableCell sx={head} align="right">Ready wire stock kg</TableCell>
              <TableCell sx={head} align="right">Est. ready stock value</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.label}>
                <TableCell sx={{ ...dense, fontWeight: 600 }}>{row.label}</TableCell>
                <TableCell sx={dense} align="right">{Number(row.periodPurchaseKg || 0).toFixed(1)}</TableCell>
                <TableCell sx={dense} align="right">{formatCurrency(row.avgPurchaseRate)}</TableCell>
                <TableCell sx={dense} align="right">{Number(row.stockKg || 0).toFixed(1)}</TableCell>
                <TableCell sx={dense} align="right">{formatCurrency(row.avgStockPurchaseRate)}</TableCell>
                <TableCell sx={dense} align="right">{Number(row.periodSalesKg || 0).toFixed(1)}</TableCell>
                <TableCell sx={dense} align="right">{formatCurrency(row.avgSaleRate)}</TableCell>
                <TableCell sx={dense} align="right">{Number(row.readyStockKg || 0).toFixed(1)}</TableCell>
                <TableCell sx={dense} align="right">{formatCurrency(row.estimatedReadyStockValue)}</TableCell>
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

function MainProfit({ data }) {
  const main = data?.main;
  if (!main) return null;
  const annealing = main.annealing || {};
  const breakdown = main.expenseBreakdown || {};
  const rows = [
    ...(main.sales || []).map((row) => ({ ...row, work: 'Sale', party: row.customerName, sign: 1 })),
    ...(main.returns || []).map((row) => ({ ...row, work: 'Wire Return', party: row.customerName, sign: -1 })),
    ...(main.purchases || []).map((row) => ({ ...row, work: 'Coil Purchase', party: row.supplierName, sign: -1 })),
    ...(main.coilReturns || []).map((row) => ({ ...row, work: 'Coil Return', party: row.supplierName, sign: 1 })),
  ].sort((a, b) => new Date(a.date) - new Date(b.date));
  return (
    <>
      <Grid container spacing={1.5} mb={2}>
        <Grid item xs={12} sm={6} md={3}><MetricCard title="Net Sales Earned" value={formatCurrency(main.netRevenue)} helper={`Returns: ${formatCurrency(main.wireReturnCredits)}`} /></Grid>
        <Grid item xs={12} sm={6} md={3}><MetricCard title="Net Material Cost" value={formatCurrency(main.netMaterialCost)} helper={`Coil returns: ${formatCurrency(main.coilReturnCredits)}`} /></Grid>
        <Grid item xs={12} sm={6} md={3}><MetricCard title="Main Gross Profit" value={formatCurrency(main.grossProfit)} color={main.grossProfit >= 0 ? 'success.main' : 'error.main'} /></Grid>
        <Grid item xs={12} sm={6} md={3}><MetricCard title="Main Net Profit" value={formatCurrency(main.netProfit)} color={main.netProfit >= 0 ? 'success.main' : 'error.main'} helper={`After factory expenses: ${formatCurrency((main.factoryExpenses || 0) + (main.consumptionMaterials || 0))}`} /></Grid>
        <Grid item xs={12} sm={6} md={3}><MetricCard title="Wastage (5%)" value={formatCurrency(main.wastageDeduction || 0)} color="warning.main" helper="Deducted from gross profit" /></Grid>
        <Grid item xs={12} sm={6} md={3}><MetricCard title="Sales Volume" value={`${Number(main.salesWeightKg || 0).toFixed(1)} kg`} helper={`${main.salesBundles || 0} bundles`} /></Grid>
        <Grid item xs={12} sm={6} md={3}><MetricCard title="Annealing Sent (Period)" value={`${Number(annealing.sentKg || 0).toFixed(1)} kg`} helper={`${annealing.sentBundles || 0} bundles`} /></Grid>
        <Grid item xs={12} sm={6} md={3}><MetricCard title="Annealing Arrived (Period)" value={`${Number(annealing.arrivedKg || 0).toFixed(1)} kg`} helper={`${annealing.arrivedBundles || 0} bundles`} /></Grid>
        <Grid item xs={12} sm={6} md={3}><MetricCard title="Annealed Sold (Period)" value={`${Number(annealing.soldKg || 0).toFixed(1)} kg`} helper={`${annealing.soldBundles || 0} bundles`} /></Grid>
        <Grid item xs={12} sm={6} md={3}><MetricCard title="Annealing Pending Now" value={`${Number(annealing.pendingKg || 0).toFixed(1)} kg`} helper={`${annealing.pendingBundles || 0} bundles`} color="warning.main" /></Grid>
      </Grid>

      <CoilAnalysisTable coilAnalysis={main.coilAnalysis} />

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <StatementTable title="Main Business Profit Calculation" lines={main.statement} />
        </Grid>
        <Grid item xs={12} md={6}>
          <BreakdownTable
            title="Factory Expenses Deducted (by group)"
            rows={breakdown.factoryByGroup}
            total={breakdown.factoryTotal}
            totalLabel="Total factory expenses"
          />
          <BreakdownTable
            title="Consumption Materials Deducted"
            rows={breakdown.consumptionByType}
            total={breakdown.consumptionTotal}
            totalLabel="Total consumption materials"
          />
        </Grid>
      </Grid>

      <Typography variant="subtitle1" fontWeight={700} mb={0.5}>Sales, Returns and Purchases</Typography>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={head}>Date</TableCell>
              <TableCell sx={head}>Work</TableCell>
              <TableCell sx={head}>Party</TableCell>
              <TableCell sx={head}>Material</TableCell>
              <TableCell sx={head} align="right">Bundles</TableCell>
              <TableCell sx={head} align="right">Kg</TableCell>
              <TableCell sx={head} align="right">Amount</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={`${row.work}-${row._id}-${i}`}>
                <TableCell sx={dense}>{formatDate(row.date)}</TableCell>
                <TableCell sx={dense}>{row.work}</TableCell>
                <TableCell sx={dense}>{row.party}</TableCell>
                <TableCell sx={dense}>{row.wireNumber ? `Wire #${row.wireNumber}` : row.coilCategory || row.materialType}</TableCell>
                <TableCell sx={dense} align="right">{row.bundles || 0}</TableCell>
                <TableCell sx={dense} align="right">{Number(row.weightKg || 0).toFixed(1)}</TableCell>
                <TableCell sx={dense} align="right" color={row.sign > 0 ? 'success.main' : 'error.main'}>
                  {row.sign < 0 ? '−' : '+'}{formatCurrency(row.amount)}
                </TableCell>
              </TableRow>
            ))}
            {!rows.length && <TableRow><TableCell colSpan={7} sx={dense}>No Main Business activity in this period.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </TableContainer>
      <Typography variant="subtitle1" fontWeight={700} mt={2} mb={0.5}>Annealing Activity</Typography>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead><TableRow><TableCell sx={head}>Date</TableCell><TableCell sx={head}>Action</TableCell><TableCell sx={head}>Party</TableCell><TableCell sx={head}>Material</TableCell><TableCell sx={head} align="right">Bundles</TableCell><TableCell sx={head} align="right">Kg</TableCell></TableRow></TableHead>
          <TableBody>
            {(annealing.rows || []).map((row) => (
              <TableRow key={row._id}>
                <TableCell sx={dense}>{formatDate(row.date)}</TableCell>
                <TableCell sx={dense}>{row.entryType}</TableCell>
                <TableCell sx={dense}>{row.partyName}</TableCell>
                <TableCell sx={dense}>{row.materialType === 'Wire' ? `Wire #${row.wireNumber || '?'}` : row.coilCategory}</TableCell>
                <TableCell sx={dense} align="right">{row.bundles || 0}</TableCell>
                <TableCell sx={dense} align="right">{Number(row.weightKg || 0).toFixed(1)}</TableCell>
              </TableRow>
            ))}
            {!(annealing.rows || []).length && <TableRow><TableCell colSpan={6} sx={dense}>No annealing activity in this period.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  );
}

function ProcessingProfit({ data }) {
  const processing = data?.processing;
  if (!processing) return null;
  return (
    <>
      <Grid container spacing={1.5} mb={2}>
        <Grid item xs={12} sm={6} md={3}><MetricCard title="Labour Earned" value={formatCurrency(processing.labourEarned)} /></Grid>
        <Grid item xs={12} sm={6} md={3}><MetricCard title="Labour Received" value={formatCurrency(processing.labourReceived)} /></Grid>
        <Grid item xs={12} sm={6} md={3}><MetricCard title="Labour Outstanding" value={formatCurrency(processing.labourOutstanding)} color={processing.labourOutstanding > 0 ? 'warning.main' : 'success.main'} /></Grid>
        <Grid item xs={12} sm={6} md={3}><MetricCard title="Processing Direct Profit" value={formatCurrency(processing.directProfit)} color="success.main" helper="Shared expenses deducted in Combined" /></Grid>
        <Grid item xs={12} sm={6}><MetricCard title="Customer Coil In" value={`${Number(processing.coilInKg || 0).toFixed(1)} kg`} /></Grid>
        <Grid item xs={12} sm={6}><MetricCard title="Wire Delivered" value={`${Number(processing.wireOutKg || 0).toFixed(1)} kg`} helper={`${processing.wireOutBundles || 0} bundles`} /></Grid>
        <Grid item xs={12} sm={6}><MetricCard title="Current Processing WIP" value={`${Number(processing.currentWipKg || 0).toFixed(1)} kg`} color="warning.main" /></Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <StatementTable title="Processing / Labour Profit Calculation" lines={processing.statement} />
        </Grid>
        <Grid item xs={12} md={6}>
          <Alert severity="info">
            Customer coil is not our material, so it is no cost here. Shared factory and self expenses are
            deducted in the Combined view only.
          </Alert>
        </Grid>
      </Grid>

      <Typography variant="subtitle1" fontWeight={700} mb={0.5}>Wire Deliveries and Labour Charged</Typography>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={head}>Date</TableCell>
              <TableCell sx={head}>Customer</TableCell>
              <TableCell sx={head}>Wire</TableCell>
              <TableCell sx={head} align="right">Bundles</TableCell>
              <TableCell sx={head} align="right">Delivered kg</TableCell>
              <TableCell sx={head} align="right">Labour rate</TableCell>
              <TableCell sx={head} align="right">Labour earned</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(processing.deliveries || []).map((row) => (
              <TableRow key={row.deliveryId}>
                <TableCell sx={dense}>{formatDate(row.date)}</TableCell>
                <TableCell sx={dense}>{row.customerName}</TableCell>
                <TableCell sx={dense}>{row.wireNumber ? `#${row.wireNumber}` : '—'}</TableCell>
                <TableCell sx={dense} align="right">{row.bundles || 0}</TableCell>
                <TableCell sx={dense} align="right">{Number(row.weightKg || 0).toFixed(1)}</TableCell>
                <TableCell sx={dense} align="right">{formatCurrency(row.labourRatePerKg)}</TableCell>
                <TableCell sx={dense} align="right">{formatCurrency(row.labourAmount)}</TableCell>
              </TableRow>
            ))}
            {!(processing.deliveries || []).length && <TableRow><TableCell colSpan={7} sx={dense}>No processing deliveries in this period.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  );
}

function CombinedProfit({ data }) {
  const combined = data?.combined;
  if (!combined) return null;
  const breakdown = combined.expenseBreakdown || {};
  return (
    <>
      <Alert severity="info" sx={{ mb: 2 }}>
        Main and Processing direct results are separate. Shared factory and self expenses are deducted here only.
      </Alert>
      <Grid container spacing={1.5}>
        <Grid item xs={12} sm={6} md={3}><MetricCard title="Main Gross Profit" value={formatCurrency(combined.mainGrossProfit)} /></Grid>
        <Grid item xs={12} sm={6} md={3}><MetricCard title="Processing Direct Profit" value={formatCurrency(combined.processingDirectProfit)} /></Grid>
        <Grid item xs={12} sm={6} md={3}><MetricCard title="Gross Profit" value={formatCurrency(combined.grossProfit)} color={combined.grossProfit >= 0 ? 'success.main' : 'error.main'} /></Grid>
        <Grid item xs={12} sm={6} md={3}><MetricCard title="Factory Expenses" value={formatCurrency(combined.factoryExpenses)} color="error.main" /></Grid>
        <Grid item xs={12} sm={6} md={3}><MetricCard title="Consumption Materials" value={formatCurrency(combined.consumptionMaterials)} color="error.main" /></Grid>
        <Grid item xs={12} sm={6} md={3}><MetricCard title="Self Expenses" value={formatCurrency(combined.selfExpenses)} color="warning.main" /></Grid>
        <Grid item xs={12} sm={6} md={3}><MetricCard title="Wastage (5%)" value={formatCurrency(combined.wastageDeduction || 0)} color="warning.main" /></Grid>
        <Grid item xs={12} sm={6} md={3}><MetricCard title="Net Profit" value={formatCurrency(combined.finalNetProfit)} color={combined.finalNetProfit >= 0 ? 'success.main' : 'error.main'} /></Grid>
      </Grid>

      <CoilAnalysisTable coilAnalysis={combined.coilAnalysis || data?.main?.coilAnalysis} />

      <Grid container spacing={2} sx={{ mt: 1 }}>
        <Grid item xs={12} md={6}>
          <StatementTable title="Combined Profit Calculation" lines={combined.statement} />
        </Grid>
        <Grid item xs={12} md={6}>
          <BreakdownTable
            title="Factory Expenses (by group)"
            rows={breakdown.factoryByGroup}
            total={breakdown.factoryTotal}
            totalLabel="Total factory expenses"
          />
          <BreakdownTable
            title="Self Expenses (by person / category)"
            rows={breakdown.selfByCategory}
            total={breakdown.selfTotal}
            totalLabel="Total self expenses"
          />
          <BreakdownTable
            title="Consumption Materials"
            rows={breakdown.consumptionByType}
            total={breakdown.consumptionTotal}
            totalLabel="Total consumption materials"
          />
        </Grid>
      </Grid>

      <BreakdownTable
        title="Factory Expenses (detailed by category)"
        rows={breakdown.factoryByCategory}
        total={breakdown.factoryTotal}
        totalLabel="Total factory expenses"
      />
    </>
  );
}

function ProfitLossPanel() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [scope, setScope] = useState('combined');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchReport = async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    setError('');
    try {
      const response = await reportsAPI.getProfitLoss({ startDate, endDate, scope: 'combined' });
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
      <Box display="flex" alignItems="center" gap={1.5} mb={2} flexWrap="wrap">
        <DateRangePicker startDate={startDate} endDate={endDate} onStartChange={setStartDate} onEndChange={setEndDate} />
        <Button variant="contained" onClick={fetchReport} disabled={!startDate || !endDate || loading}>Generate Report</Button>
      </Box>
      <ScopeHeader scope={scope} setScope={setScope} data={data} />
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading && <CircularProgress />}
      {data && !data.hasActivity && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          No sales, purchases, deliveries or expenses were recorded between {formatDate(startDate)} and {formatDate(endDate)}, so every
          profit figure is zero.
          {data.availableDataRange
            ? ` Your recorded activity runs from ${formatDate(data.availableDataRange.firstEntry)} to ${formatDate(data.availableDataRange.lastEntry)} — pick a range inside those dates.`
            : ''}
        </Alert>
      )}
      {data && scope === 'main' && <MainProfit data={data} />}
      {data && scope === 'processing' && <ProcessingProfit data={data} />}
      {data && scope === 'combined' && <CombinedProfit data={data} />}
    </Box>
  );
}

function FinancialPanel() {
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
      <Box display="flex" alignItems="center" gap={1.5} mb={2} flexWrap="wrap">
        <DateRangePicker startDate={startDate} endDate={endDate} onStartChange={setStartDate} onEndChange={setEndDate} />
        <Button variant="contained" onClick={fetchReport} disabled={!startDate || !endDate || loading}>Generate Report</Button>
        {data && <Button variant="outlined" startIcon={<TableChartIcon />} onClick={() => exportFinancialExcel(data, startDate, endDate)}>Export Excel</Button>}
      </Box>
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
      <Button variant="outlined" startIcon={<TableChartIcon />} onClick={() => exportInventoryExcel(data)}>Export Excel</Button>
      <Grid container spacing={1.5} my={1}>
        <Grid item xs={12} sm={6} md={3}><MetricCard title="Own Coil Stock" value={`${Number(totals.ownCoilKg || 0).toFixed(1)} kg`} /></Grid>
        <Grid item xs={12} sm={6} md={3}><MetricCard title="Ready Wire Stock" value={`${Number(totals.readyWireKg || 0).toFixed(1)} kg`} helper={`${totals.readyWireBundles || 0} bundles`} /></Grid>
        <Grid item xs={12} sm={6} md={3}><MetricCard title="Pending at Annealing" value={`${Number(totals.annealingPendingKg || 0).toFixed(1)} kg`} helper={`${totals.annealingPendingBundles || 0} bundles`} /></Grid>
        <Grid item xs={12} sm={6} md={3}><MetricCard title="Processing WIP" value={`${Number(totals.processingRemainingKg || 0).toFixed(1)} kg`} /></Grid>
      </Grid>
      {data?.lowStock?.length > 0 && <Alert severity="warning" sx={{ mb: 2 }}>Low stock: {data.lowStock.map((row) => row._id).join(', ')}</Alert>}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead><TableRow><TableCell sx={head}>Area</TableCell><TableCell sx={head}>Material / Party</TableCell><TableCell sx={head} align="right">Bundles</TableCell><TableCell sx={head} align="right">Weight kg</TableCell></TableRow></TableHead>
          <TableBody>
            {(data?.rawStock || []).map((row) => <TableRow key={`raw-${row._id}`}><TableCell sx={dense}>Own Coil</TableCell><TableCell sx={dense}>{row._id}</TableCell><TableCell sx={dense} align="right">—</TableCell><TableCell sx={dense} align="right">{Number(row.totalStock || 0).toFixed(1)}</TableCell></TableRow>)}
            {(data?.readyStock || []).map((row) => <TableRow key={`ready-${row._id}`}><TableCell sx={dense}>Ready Wire</TableCell><TableCell sx={dense}>{row.wireLabel || `Wire #${row._id}`}</TableCell><TableCell sx={dense} align="right">{row.bundles || 0}</TableCell><TableCell sx={dense} align="right">{Number(row.totalStock || 0).toFixed(1)}</TableCell></TableRow>)}
            {(data?.annealingPending || []).map((row) => <TableRow key={`ann-${row.key}`}><TableCell sx={dense}>Annealing</TableCell><TableCell sx={dense}>{row.partyName} — {row.materialType === 'Wire' ? `Wire #${row.wireNumber || '?'}` : row.coilCategory}</TableCell><TableCell sx={dense} align="right">{row.remainingBundles || 0}</TableCell><TableCell sx={dense} align="right">{Number(row.remainingKg || 0).toFixed(1)}</TableCell></TableRow>)}
            {(data?.processingStock || []).filter((row) => row.remainingKg > 0).map((row, i) => <TableRow key={`job-${i}`}><TableCell sx={dense}>Processing</TableCell><TableCell sx={dense}>{row.customerName} — {row.coilCategory}</TableCell><TableCell sx={dense} align="right">—</TableCell><TableCell sx={dense} align="right">{Number(row.remainingKg || 0).toFixed(1)}</TableCell></TableRow>)}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

function CustomerReportPanel() {
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
      <Box display="flex" alignItems="center" gap={1.5} mb={2} flexWrap="wrap">
        <FormControl size="small" sx={{ minWidth: 260 }}>
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
        <Button variant="contained" onClick={fetchReport} disabled={!customerId || loading}>
          Generate Report
        </Button>
      </Box>
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
                  <TableCell sx={head} align="right">Weight</TableCell>
                  <TableCell sx={head} align="right">Total</TableCell>
                  <TableCell sx={head} align="right">Paid</TableCell>
                  <TableCell sx={head} align="right">Due</TableCell>
                  <TableCell sx={head}>Status</TableCell>
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
                    <TableCell sx={dense} align="right">{row.finalWeightKg ?? row.initialWeightKg}</TableCell>
                    <TableCell sx={dense} align="right">{formatCurrency(row.totalAmount)}</TableCell>
                    <TableCell sx={dense} align="right">{formatCurrency(row.amountPaid)}</TableCell>
                    <TableCell sx={dense} align="right">{formatCurrency(row.amountDue)}</TableCell>
                    <TableCell sx={dense}>{row.orderStatus}</TableCell>
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

export default function Reports() {
  const location = useLocation();
  const initialTab = location.state?.tab ?? 0;
  const [tab, setTab] = useState(initialTab);

  useEffect(() => {
    if (location.state?.tab != null) setTab(location.state.tab);
  }, [location.state?.tab]);

  return (
    <Box>
      <Tabs value={tab} onChange={(_, value) => setTab(value)}>
        <Tab label="Profit & Loss" />
        <Tab label="Cash & Bank" />
        <Tab label="Inventory" />
        <Tab label="Customer" />
      </Tabs>
      <Box sx={{ pt: 2 }}>
        {tab === 0 && <ProfitLossPanel />}
        {tab === 1 && <FinancialPanel />}
        {tab === 2 && <InventoryPanel />}
        {tab === 3 && <CustomerReportPanel />}
      </Box>
    </Box>
  );
}
