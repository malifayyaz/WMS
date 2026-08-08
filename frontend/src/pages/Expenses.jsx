import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  IconButton, Dialog, DialogTitle, DialogContent, DialogActions, Snackbar, Alert, CircularProgress,
  FormControl, InputLabel, Select, MenuItem, TextField, Tabs, Tab, Typography, Card, CardContent,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { expensesAPI, configAPI, consumptionAPI } from '../services/api';
import { formatCurrency, formatDate } from '../utils/formatters';
import DateRangePicker from '../components/Common/DateRangePicker';
import ConfirmDialog from '../components/Common/ConfirmDialog';
import AccessDeniedSnackbar from '../components/Common/AccessDeniedSnackbar';
import { usePermissions } from '../hooks/usePermissions';

const paymentMethods = ['Cash', 'Bank Transfer', 'Cheque'];
const PROCESS_MATERIAL_GROUP = 'Process Material';
const MATERIAL_TYPES = ['Acid', 'Dye', 'Soap', 'Stationary'];
const getDefaultUnit = (materialType) => (['Acid', 'Soap'].includes(materialType) ? 'kg' : 'piece');
const EXPENSE_LIST_LIMIT = 500;
const BREAKDOWN_PERIOD_CAP = 24;

function currentMonthRange() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const pad = (n) => String(n).padStart(2, '0');
  const start = `${y}-${pad(m + 1)}-01`;
  const lastDay = new Date(y, m + 1, 0).getDate();
  const end = `${y}-${pad(m + 1)}-${pad(lastDay)}`;
  return { start, end };
}

const SELF_EXPENSE_GROUP = 'Self Expense';
const DEFAULT_EXPENSE_TREE = {
  Labour: ['Labour Salary', 'Labour Advance', 'Labour Tea', 'Labour Food', 'Petrol Labour', 'Miscellaneous'],
  Rental: ['Coil Rental', 'Wire Rental', 'Miscellaneous'],
  Operations: ['Weight Scale Payment', 'Hardware Maintenance', 'Electricity', 'Office Expense', 'Miscellaneous'],
  Manufacturing: ['Annealing', 'Miscellaneous'],
  [SELF_EXPENSE_GROUP]: ['Fayyaz Expense', 'Faisal Expense', 'Mutual Expense'],
  'Process Material': ['Acid', 'Dye', 'Soap', 'Stationary', 'Miscellaneous'],
};

const defaultForm = {
  expenseGroup: 'Operations',
  expenseCategory: 'Miscellaneous',
  description: '',
  amount: '',
  paymentMethod: 'Cash',
  addedBy: '',
  labourName: '',
  coilType: '',
  rentalRoute: '',
  expenseDate: new Date().toISOString().slice(0, 10),
};

export default function Expenses() {
  const { isViewer } = usePermissions();
  const [accessDenied, setAccessDenied] = useState(false);
  const monthDefaults = useMemo(() => currentMonthRange(), []);
  const [rawList, setRawList] = useState([]);
  const [listTruncated, setListTruncated] = useState(false);
  const [listTotal, setListTotal] = useState(0);
  const [config, setConfig] = useState({ rentalRoutes: [], expenseCategories: [], expenseCategoryTree: DEFAULT_EXPENSE_TREE });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [period, setPeriod] = useState('month');
  const [breakdown, setBreakdown] = useState({
    periodTotals: [], factoryPeriodTotals: [], selfPeriodTotals: [], selfCategoryTotals: [],
    groupTotals: [], categoryTotals: [],
  });
  const [startDate, setStartDate] = useState(monthDefaults.start);
  const [endDate, setEndDate] = useState(monthDefaults.end);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [editingId, setEditingId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, id: null });
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' });
  const [processSubTab, setProcessSubTab] = useState(0);
  const [analysis, setAnalysis] = useState(null);
  const [processDialogOpen, setProcessDialogOpen] = useState(false);
  const [processEditingId, setProcessEditingId] = useState(null);
  const [processForm, setProcessForm] = useState({
    materialType: 'Acid',
    quantity: '',
    costPerUnit: '',
    totalCost: '',
    unit: getDefaultUnit('Acid'),
    notes: '',
    purchaseDate: new Date().toISOString().slice(0, 10),
  });
  const [processDeleteConfirm, setProcessDeleteConfirm] = useState({ open: false, id: null });

  const categoryTree = config.expenseCategoryTree || DEFAULT_EXPENSE_TREE;
  const groups = Object.keys(categoryTree);
  const groupFilter = tab > 0 ? groups[tab - 1] : '';
  const isProcessMaterialTab = groupFilter === PROCESS_MATERIAL_GROUP;
  const isSelfExpenseTab = groupFilter === SELF_EXPENSE_GROUP;
  const addableGroups = isSelfExpenseTab
    ? [SELF_EXPENSE_GROUP]
    : groups.filter((g) => g !== PROCESS_MATERIAL_GROUP && g !== SELF_EXPENSE_GROUP);
  const isFactoryOverviewTab = tab === 0;

  const getGroupForCategory = useCallback((category) => {
    const groupEntry = Object.entries(categoryTree).find(([, categories]) => categories.includes(category));
    return groupEntry ? groupEntry[0] : 'Operations';
  }, [categoryTree]);

  const list = useMemo(() => {
    if (isFactoryOverviewTab) {
      return rawList.filter((e) => (e.expenseGroup || getGroupForCategory(e.expenseCategory)) !== SELF_EXPENSE_GROUP);
    }
    if (groupFilter) {
      return rawList.filter((e) => (e.expenseGroup || getGroupForCategory(e.expenseCategory)) === groupFilter);
    }
    return rawList;
  }, [rawList, isFactoryOverviewTab, groupFilter, getGroupForCategory]);

  const fetchProcessData = async () => {
    try {
      if (startDate && endDate) {
        const aRes = await consumptionAPI.getAnalysis({ startDate, endDate });
        setAnalysis(aRes.data.data);
      } else {
        setAnalysis(null);
      }
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Failed to load process materials', severity: 'error' });
    }
  };

  const fetchConfig = useCallback(async () => {
    try {
      const cfgRes = await configAPI.getWires();
      setConfig({ ...cfgRes.data.data, expenseCategoryTree: cfgRes.data.data?.expenseCategoryTree || DEFAULT_EXPENSE_TREE });
    } catch {
      // keep defaults
    }
  }, []);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params = { includeProcess: true, limit: EXPENSE_LIST_LIMIT };
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      const [res, breakdownRes] = await Promise.all([
        expensesAPI.getAll(params),
        expensesAPI.getBreakdown({
          ...(startDate ? { startDate } : {}),
          ...(endDate ? { endDate } : {}),
          period,
        }),
      ]);
      setRawList(res.data.data || []);
      setListTotal(res.data.total || 0);
      setListTruncated(!!res.data.truncated);
      const bd = breakdownRes.data.data || {};
      setBreakdown({
        periodTotals: bd.periodTotals || [],
        factoryPeriodTotals: bd.factoryPeriodTotals || [],
        selfPeriodTotals: bd.selfPeriodTotals || [],
        selfCategoryTotals: bd.selfCategoryTotals || [],
        groupTotals: bd.groupTotals || [],
        categoryTotals: bd.categoryTotals || [],
      });
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Failed to load', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, period]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);
  useEffect(() => { fetchList(); }, [fetchList]);

  useEffect(() => {
    if (isProcessMaterialTab) fetchProcessData();
    else setProcessSubTab(0);
  }, [isProcessMaterialTab, startDate, endDate]);

  const openProcessDialog = (row = null) => {
    if (row?.isProcessPurchase) {
      setProcessEditingId(row._id);
      setProcessForm({
        materialType: row.expenseCategory || row.materialType || 'Acid',
        quantity: row.quantity || '',
        costPerUnit: '',
        totalCost: row.amount || '',
        unit: row.unit || getDefaultUnit(row.expenseCategory),
        notes: row.description || '',
        purchaseDate: row.expenseDate ? new Date(row.expenseDate).toISOString().slice(0, 10) : entryDate,
      });
    } else {
      const materialType = 'Acid';
      setProcessEditingId(null);
      setProcessForm({
        materialType,
        quantity: '',
        costPerUnit: '',
        totalCost: '',
        unit: getDefaultUnit(materialType),
        notes: '',
        purchaseDate: entryDate,
      });
    }
    setProcessDialogOpen(true);
  };

  const handleProcessSave = async () => {
    try {
      if (!processForm.quantity || Number(processForm.quantity) <= 0) {
        setSnack({ open: true, message: 'Valid quantity required', severity: 'error' });
        return;
      }
      if (!processForm.totalCost && !processForm.costPerUnit) {
        setSnack({ open: true, message: 'Enter total purchase cost or cost per unit', severity: 'error' });
        return;
      }
      const payload = {
        ...processForm,
        quantity: Number(processForm.quantity),
        costPerUnit: processForm.costPerUnit ? Number(processForm.costPerUnit) : undefined,
        totalCost: processForm.totalCost ? Number(processForm.totalCost) : undefined,
        purchaseDate: processForm.purchaseDate || entryDate,
      };
      if (processEditingId) {
        await consumptionAPI.updateMaterial(processEditingId, payload);
      } else {
        await consumptionAPI.createMaterial(payload);
      }
      setSnack({ open: true, message: processEditingId ? 'Updated' : 'Saved', severity: 'success' });
      setProcessDialogOpen(false);
      fetchList();
      fetchProcessData();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Error', severity: 'error' });
    }
  };

  const handleProcessDelete = async () => {
    if (!processDeleteConfirm.id) return;
    try {
      await consumptionAPI.deleteMaterial(processDeleteConfirm.id);
      setSnack({ open: true, message: 'Deleted', severity: 'success' });
      setProcessDeleteConfirm({ open: false, id: null });
      fetchList();
      fetchProcessData();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Error', severity: 'error' });
    }
  };

  const handleOpenAdd = () => {
    const base = { ...defaultForm, expenseDate: entryDate };
    if (isSelfExpenseTab) {
      base.expenseGroup = SELF_EXPENSE_GROUP;
      base.expenseCategory = 'Fayyaz Expense';
    } else if (groupFilter && groupFilter !== SELF_EXPENSE_GROUP) {
      base.expenseGroup = groupFilter;
      base.expenseCategory = (categoryTree[groupFilter] || [])[0] || 'Miscellaneous';
    }
    setForm(base);
    setEditingId(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (row) => {
    setForm({
      expenseGroup: row.expenseGroup || getGroupForCategory(row.expenseCategory || row.expenseType),
      expenseCategory: row.expenseCategory || row.expenseType || 'Miscellaneous',
      description: row.description || '',
      amount: row.amount,
      paymentMethod: row.paymentMethod || 'Cash',
      addedBy: row.addedBy || '',
      labourName: row.labourName || '',
      coilType: row.coilType || '',
      rentalRoute: row.rentalRoute || '',
      expenseDate: row.expenseDate ? new Date(row.expenseDate).toISOString().slice(0, 10) : '',
    });
    setEditingId(row._id);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.amount || Number(form.amount) <= 0) {
      setSnack({ open: true, message: 'Valid amount required', severity: 'error' });
      return;
    }
    try {
      const payload = { ...form, amount: Number(form.amount), expenseDate: editingId ? form.expenseDate : entryDate };
      if (editingId) await expensesAPI.update(editingId, payload);
      else await expensesAPI.create(payload);
      setSnack({ open: true, message: editingId ? 'Updated' : 'Recorded', severity: 'success' });
      setDialogOpen(false);
      fetchList();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Error', severity: 'error' });
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm.id) return;
    try {
      await expensesAPI.delete(deleteConfirm.id);
      setSnack({ open: true, message: 'Deleted', severity: 'success' });
      setDeleteConfirm({ open: false, id: null });
      fetchList();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Error', severity: 'error' });
    }
  };

  const selectedGroupCategories = categoryTree[form.expenseGroup] || [];
  const filteredPeriodTotals = isSelfExpenseTab
    ? (breakdown.selfPeriodTotals || [])
    : isFactoryOverviewTab
      ? (breakdown.factoryPeriodTotals || [])
      : (breakdown.periodTotals || []).filter((row) => {
          const groupsForPeriod = (breakdown.groupTotals || []).filter((g) => g._id.period === row._id);
          return groupsForPeriod.some((g) => g._id.expenseGroup === groupFilter);
        });
  const filteredGroupTotals = (breakdown.groupTotals || []).filter((row) => {
    if (row._id.expenseGroup === SELF_EXPENSE_GROUP && isFactoryOverviewTab) return false;
    if (isSelfExpenseTab) return row._id.expenseGroup === SELF_EXPENSE_GROUP;
    if (groupFilter) return row._id.expenseGroup === groupFilter;
    return row._id.expenseGroup !== SELF_EXPENSE_GROUP;
  });
  const filteredCategoryTotals = isSelfExpenseTab
    ? (breakdown.selfCategoryTotals || []).map((row) => ({
        _id: { period: row._id.period, expenseGroup: SELF_EXPENSE_GROUP, expenseCategory: row._id.expenseCategory },
        total: row.total,
      }))
    : (breakdown.categoryTotals || []).filter((row) => {
        if (row._id.expenseGroup === SELF_EXPENSE_GROUP && isFactoryOverviewTab) return false;
        if (groupFilter) return row._id.expenseGroup === groupFilter;
        return row._id.expenseGroup !== SELF_EXPENSE_GROUP;
      });

  // Cap rendered breakdown rows (latest periods first — API already sorts desc)
  const displayPeriodTotals = filteredPeriodTotals.slice(0, BREAKDOWN_PERIOD_CAP);
  const allowedPeriods = new Set(displayPeriodTotals.map((row) => row._id));
  const displayGroupTotals = filteredGroupTotals.filter((row) => allowedPeriods.has(row._id.period));
  const displayCategoryTotals = filteredCategoryTotals.filter((row) => allowedPeriods.has(row._id.period));
  const breakdownTruncated = filteredPeriodTotals.length > displayPeriodTotals.length;

  const exportGroupTotals = filteredGroupTotals;
  const exportCategoryTotals = filteredCategoryTotals;
  const periodLabel = period === 'day' ? 'Day' : period === 'week' ? 'Week' : 'Month';

  const exportPdf = () => {
    const doc = new jsPDF();
    const title = `Expense Breakdown (${periodLabel})`;
    doc.setFontSize(14);
    doc.text(title, 14, 16);
    doc.setFontSize(10);
    doc.text(`Range: ${startDate || 'All'} to ${endDate || 'All'}${groupFilter ? ` | Group: ${groupFilter}` : ''}`, 14, 22);

    autoTable(doc, {
      startY: 28,
      head: [[periodLabel, 'Total Expense']],
      body: filteredPeriodTotals.map((row) => [row._id, formatCurrency(row.total)]),
      styles: { fontSize: 9 },
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 6,
      head: [[periodLabel, 'Main Category', 'Total']],
      body: exportGroupTotals.map((row) => [row._id.period, row._id.expenseGroup, formatCurrency(row.total)]),
      styles: { fontSize: 9 },
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 6,
      head: [[periodLabel, 'Main Category', 'Subcategory', 'Total']],
      body: exportCategoryTotals.map((row) => [row._id.period, row._id.expenseGroup, row._id.expenseCategory, formatCurrency(row.total)]),
      styles: { fontSize: 9 },
    });

    doc.save(`expense-breakdown-${period}-${startDate || 'all'}-${endDate || 'all'}.pdf`);
  };

  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Factory Expenses" />
        {groups.map((group) => <Tab key={group} label={group} />)}
      </Tabs>

      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} flexWrap="wrap" gap={1}>
        <Box display="flex" gap={1} alignItems="center" flexWrap="wrap">
          <DateRangePicker startDate={startDate} endDate={endDate} onStartChange={setStartDate} onEndChange={setEndDate} />
          <TextField
            size="small"
            type="date"
            label="Entry Date"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
        </Box>
        <Box display="flex" gap={1}>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>View</InputLabel>
            <Select value={period} label="View" onChange={(e) => setPeriod(e.target.value)}>
              <MenuItem value="day">Daily</MenuItem>
              <MenuItem value="month">Monthly</MenuItem>
              <MenuItem value="week">Weekly</MenuItem>
            </Select>
          </FormControl>
          <Button variant="outlined" startIcon={<PictureAsPdfIcon />} onClick={exportPdf}>Export PDF</Button>
          {isProcessMaterialTab ? (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => {
                if (isViewer) { setAccessDenied(true); return; }
                openProcessDialog();
              }}
            >
              Add Process Material
            </Button>
          ) : (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => {
                if (isViewer) { setAccessDenied(true); return; }
                handleOpenAdd();
              }}
            >
              Add Expense
            </Button>
          )}
        </Box>
      </Box>

      {isProcessMaterialTab && (
        <Tabs value={processSubTab} onChange={(_, v) => setProcessSubTab(v)} sx={{ mb: 2 }}>
          <Tab label="Purchases & Totals" />
          <Tab label="Purchase Intensity" />
        </Tabs>
      )}

      {(!isProcessMaterialTab || processSubTab === 0) && (
      <>
      {isFactoryOverviewTab && (
        <Box display="flex" gap={2} mb={2} flexWrap="wrap">
          <Card sx={{ minWidth: 220, flex: 1 }}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">Factory Expenses (excl. Self)</Typography>
              <Typography variant="h6">
                {formatCurrency((breakdown.factoryPeriodTotals || []).reduce((s, r) => s + r.total, 0))}
              </Typography>
            </CardContent>
          </Card>
          <Card sx={{ minWidth: 220, flex: 1 }}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">Self Expense — Fayyaz</Typography>
              <Typography variant="h6">
                {formatCurrency((breakdown.selfCategoryTotals || []).filter((r) => r._id.expenseCategory === 'Fayyaz Expense').reduce((s, r) => s + r.total, 0))}
              </Typography>
            </CardContent>
          </Card>
          <Card sx={{ minWidth: 220, flex: 1 }}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">Self Expense — Faisal</Typography>
              <Typography variant="h6">
                {formatCurrency((breakdown.selfCategoryTotals || []).filter((r) => r._id.expenseCategory === 'Faisal Expense').reduce((s, r) => s + r.total, 0))}
              </Typography>
            </CardContent>
          </Card>
          <Card sx={{ minWidth: 220, flex: 1 }}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">Self Expense — Mutual</Typography>
              <Typography variant="h6">
                {formatCurrency((breakdown.selfCategoryTotals || []).filter((r) => r._id.expenseCategory === 'Mutual Expense').reduce((s, r) => s + r.total, 0))}
              </Typography>
            </CardContent>
          </Card>
        </Box>
      )}

      <TableContainer component={Paper} sx={{ mb: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{periodLabel}</TableCell>
              <TableCell align="right">
                {isSelfExpenseTab ? 'Self Expense Total' : isFactoryOverviewTab ? 'Factory Expense Total' : 'Total Expense'}
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {displayPeriodTotals.map((row) => (
              <TableRow key={`period-${row._id}`}>
                <TableCell>{row._id}</TableCell>
                <TableCell align="right">{formatCurrency(row.total)}</TableCell>
              </TableRow>
            ))}
            {displayPeriodTotals.length === 0 && (
              <TableRow>
                <TableCell colSpan={2}>
                  <Typography variant="body2" color="text.secondary">No totals available for selected range.</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <TableContainer component={Paper} sx={{ mb: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{periodLabel}</TableCell>
              <TableCell>Main Category</TableCell>
              <TableCell align="right">Category Total</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {displayGroupTotals.map((row) => (
              <TableRow key={`group-${row._id.period}-${row._id.expenseGroup}`}>
                <TableCell>{row._id.period}</TableCell>
                <TableCell>{row._id.expenseGroup}</TableCell>
                <TableCell align="right">{formatCurrency(row.total)}</TableCell>
              </TableRow>
            ))}
            {displayGroupTotals.length === 0 && (
              <TableRow>
                <TableCell colSpan={3}>
                  <Typography variant="body2" color="text.secondary">No category totals for selected range.</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <TableContainer component={Paper} sx={{ mb: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{periodLabel}</TableCell>
              <TableCell>Main Category</TableCell>
              <TableCell>Subcategory</TableCell>
              <TableCell align="right">Subcategory Total</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {displayCategoryTotals.map((row) => (
              <TableRow key={`category-${row._id.period}-${row._id.expenseGroup}-${row._id.expenseCategory}`}>
                <TableCell>{row._id.period}</TableCell>
                <TableCell>{row._id.expenseGroup}</TableCell>
                <TableCell>{row._id.expenseCategory}</TableCell>
                <TableCell align="right">{formatCurrency(row.total)}</TableCell>
              </TableRow>
            ))}
            {displayCategoryTotals.length === 0 && (
              <TableRow>
                <TableCell colSpan={4}>
                  <Typography variant="body2" color="text.secondary">No subcategory totals for selected range.</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {breakdownTruncated && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          Showing latest {BREAKDOWN_PERIOD_CAP} {periodLabel.toLowerCase()} periods. Narrow the date range or export PDF for the full breakdown.
        </Typography>
      )}

      {listTruncated && (
        <Alert severity="info" sx={{ mb: 1 }}>
          Showing latest {EXPENSE_LIST_LIMIT} of {listTotal} expense lines. Narrow the date range to see older entries.
        </Alert>
      )}

      {loading ? (
        <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Main Category</TableCell>
                <TableCell>Subcategory</TableCell>
                <TableCell>Description</TableCell>
                <TableCell>Details</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {list.map((row) => (
                <TableRow key={row._id}>
                  <TableCell>{formatDate(row.expenseDate)}</TableCell>
                  <TableCell>{row.expenseGroup || getGroupForCategory(row.expenseCategory || row.expenseType)}</TableCell>
                  <TableCell>{row.expenseCategory || row.expenseType}</TableCell>
                  <TableCell>{row.description}</TableCell>
                  <TableCell>
                    {row.coilType && `${row.coilType}`}
                    {row.rentalRoute && ` → ${row.rentalRoute}`}
                    {row.labourName && ` (${row.labourName})`}
                    {row.isProcessPurchase && `${row.quantity} ${row.unit || ''}`.trim()}
                    {row.bankTransactionId && (
                      <Typography variant="caption" color="info.main" display="block">Paid via bank transfer</Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">{formatCurrency(row.amount)}</TableCell>
                  <TableCell align="right">
                    {row.isProcessPurchase ? (
                      <>
                        <IconButton
                          size="small"
                          onClick={() => {
                            if (isViewer) { setAccessDenied(true); return; }
                            openProcessDialog(row);
                          }}
                        >
                          <EditIcon />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => {
                            if (isViewer) { setAccessDenied(true); return; }
                            setProcessDeleteConfirm({ open: true, id: row._id });
                          }}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </>
                    ) : (
                      <>
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
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      </>
      )}

      {isProcessMaterialTab && processSubTab === 1 && (
        <Box>
          {!startDate || !endDate ? (
            <Alert severity="info">Select a date range to calculate purchase intensity versus wire produced.</Alert>
          ) : analysis ? (
            <>
              <Alert severity="info" sx={{ mb: 2 }}>
                Purchases in the selected period are compared against finished wire produced
                in the same period (sales + direct production + processing deliveries).
                This is a purchase-intensity view, not exact batch-wise consumption.
              </Alert>
              <Box display="flex" gap={2} flexWrap="wrap" sx={{ mb: 2 }}>
                <Paper sx={{ p: 2, minWidth: 180 }}>
                  <Typography variant="caption" color="text.secondary">Wire Produced</Typography>
                  <Typography variant="h6" fontWeight={700}>{Number(analysis.totalProducedKg || 0).toFixed(2)} kg</Typography>
                </Paper>
                <Paper sx={{ p: 2, minWidth: 180 }}>
                  <Typography variant="caption" color="text.secondary">Total Process Material Cost</Typography>
                  <Typography variant="h6" fontWeight={700}>{formatCurrency(analysis.totalCost || 0)}</Typography>
                </Paper>
                <Paper sx={{ p: 2, minWidth: 180 }}>
                  <Typography variant="caption" color="text.secondary">Cost / kg</Typography>
                  <Typography variant="h6" fontWeight={700}>{formatCurrency(analysis.totalCostPerKg || 0)}</Typography>
                </Paper>
                <Paper sx={{ p: 2, minWidth: 180 }}>
                  <Typography variant="caption" color="text.secondary">Cost / ton</Typography>
                  <Typography variant="h6" fontWeight={700}>{formatCurrency(analysis.totalCostPerTon || 0)}</Typography>
                </Paper>
              </Box>
              {Number(analysis.totalProducedKg || 0) <= 0 && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  No finished wire production was found in this range, so intensity values are shown as zero.
                </Alert>
              )}
              <Typography variant="h6" gutterBottom>Overall Purchase Intensity</Typography>
              <TableContainer component={Paper} sx={{ mb: 3 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Material</TableCell>
                      <TableCell align="right">Purchased Qty</TableCell>
                      <TableCell align="right">Qty/kg</TableCell>
                      <TableCell align="right">Qty/ton or Pieces/ton</TableCell>
                      <TableCell align="right">Cost/kg</TableCell>
                      <TableCell align="right">Cost/ton</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(analysis.overallMaterials || []).map((m) => (
                      <TableRow key={m.materialType}>
                        <TableCell>{m.materialType}</TableCell>
                        <TableCell align="right">{Number(m.totalQuantityUsed || 0).toFixed(2)} {m.unit}</TableCell>
                        <TableCell align="right">{m.unit === 'kg' ? Number(m.quantityPerKg || 0).toFixed(4) : '—'}</TableCell>
                        <TableCell align="right">
                          {m.unit === 'kg'
                            ? Number(m.quantityPerTon || 0).toFixed(2)
                            : Number(m.piecesPerTon || 0).toFixed(2)}
                        </TableCell>
                        <TableCell align="right">{formatCurrency(m.costPerKg)}</TableCell>
                        <TableCell align="right">{formatCurrency(m.costPerTon)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <Typography variant="h6" gutterBottom>Production Mix</Typography>
              {(analysis.productionMix || []).map((w) => (
                <Card key={w.wireNumber} sx={{ mb: 2 }}>
                  <CardContent>
                    <Typography fontWeight={600}>Wire #{w.wireNumber} — {Number(w.producedKg || 0).toFixed(2)} kg produced</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {Number(analysis.totalProducedKg || 0) > 0
                        ? `${((Number(w.producedKg || 0) / Number(analysis.totalProducedKg || 1)) * 100).toFixed(1)}% of total output`
                        : 'No production in selected range'}
                    </Typography>
                  </CardContent>
                </Card>
              ))}
            </>
          ) : null}
        </Box>
      )}

      <Dialog open={processDialogOpen} onClose={() => setProcessDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{processEditingId ? 'Edit Process Material' : 'Add Process Material'}</DialogTitle>
        <DialogContent>
          <FormControl fullWidth margin="dense">
            <InputLabel>Material</InputLabel>
            <Select
              value={processForm.materialType}
              onChange={(e) => {
                const nextType = e.target.value;
                setProcessForm((f) => ({ ...f, materialType: nextType, unit: getDefaultUnit(nextType) }));
              }}
              label="Material"
            >
              {MATERIAL_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField
            fullWidth
            type="number"
            label={`Quantity (${processForm.unit})`}
            value={processForm.quantity}
            onChange={(e) => setProcessForm((f) => ({ ...f, quantity: e.target.value }))}
            margin="dense"
          />
          <TextField
            fullWidth
            type="number"
            label="Total Purchase Cost"
            value={processForm.totalCost}
            onChange={(e) => setProcessForm((f) => ({ ...f, totalCost: e.target.value }))}
            margin="dense"
          />
          <TextField
            fullWidth
            type="number"
            label="Cost per unit (optional)"
            value={processForm.costPerUnit}
            onChange={(e) => setProcessForm((f) => ({ ...f, costPerUnit: e.target.value }))}
            margin="dense"
          />
          <TextField
            fullWidth
            type="date"
            label="Purchase Date"
            value={processForm.purchaseDate}
            onChange={(e) => setProcessForm((f) => ({ ...f, purchaseDate: e.target.value }))}
            margin="dense"
            InputLabelProps={{ shrink: true }}
          />
          <TextField fullWidth label="Notes" value={processForm.notes} onChange={(e) => setProcessForm((f) => ({ ...f, notes: e.target.value }))} margin="dense" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProcessDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleProcessSave}>Save</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingId ? 'Edit Expense' : 'Add Expense'}</DialogTitle>
        <DialogContent>
          <FormControl fullWidth margin="dense">
            <InputLabel>Main Category</InputLabel>
            <Select
              value={form.expenseGroup}
              onChange={(e) => {
                const nextGroup = e.target.value;
                const nextCategory = (categoryTree[nextGroup] || [])[0] || '';
                setForm((f) => ({ ...f, expenseGroup: nextGroup, expenseCategory: nextCategory }));
              }}
              label="Main Category"
            >
              {addableGroups.map((g) => <MenuItem key={g} value={g}>{g}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl fullWidth margin="dense">
            <InputLabel>Subcategory</InputLabel>
            <Select value={form.expenseCategory} onChange={(e) => setForm((f) => ({ ...f, expenseCategory: e.target.value }))} label="Subcategory">
              {selectedGroupCategories.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
            </Select>
          </FormControl>
          {form.expenseGroup === 'Labour' && (
            <TextField fullWidth label="Labour Name" value={form.labourName} onChange={(e) => setForm((f) => ({ ...f, labourName: e.target.value }))} margin="dense" />
          )}
          {['Coil Rental', 'Wire Rental'].includes(form.expenseCategory) && (
            <>
              {form.expenseCategory === 'Coil Rental' && (
                <FormControl fullWidth margin="dense">
                  <InputLabel>Coil Type</InputLabel>
                  <Select value={form.coilType} onChange={(e) => setForm((f) => ({ ...f, coilType: e.target.value }))} label="Coil Type">
                    <MenuItem value="Shiplet Coil">Shiplet Coil</MenuItem>
                    <MenuItem value="Patri Coil">Patri Coil</MenuItem>
                  </Select>
                </FormControl>
              )}
              <FormControl fullWidth margin="dense">
                <InputLabel>Rental Route</InputLabel>
                <Select value={form.rentalRoute} onChange={(e) => setForm((f) => ({ ...f, rentalRoute: e.target.value }))} label="Rental Route">
                  {(config.rentalRoutes || []).map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                </Select>
              </FormControl>
            </>
          )}
          <TextField fullWidth label="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} margin="dense" />
          <TextField fullWidth type="number" label="Amount" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} margin="dense" required />
          {editingId && (
            <TextField
              fullWidth
              type="date"
              label="Expense Date"
              value={form.expenseDate}
              onChange={(e) => setForm((f) => ({ ...f, expenseDate: e.target.value }))}
              margin="dense"
              InputLabelProps={{ shrink: true }}
            />
          )}
          <FormControl fullWidth margin="dense">
            <InputLabel>Payment Method</InputLabel>
            <Select value={form.paymentMethod} onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value }))} label="Payment Method">
              {paymentMethods.map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField fullWidth label="Added By" value={form.addedBy} onChange={(e) => setForm((f) => ({ ...f, addedBy: e.target.value }))} margin="dense" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>Save</Button>
        </DialogActions>
      </Dialog>
      <ConfirmDialog open={deleteConfirm.open} title="Delete Expense" message="Are you sure?" onConfirm={handleDelete} onCancel={() => setDeleteConfirm({ open: false, id: null })} />
      <ConfirmDialog open={processDeleteConfirm.open} title="Delete Process Material" message="Are you sure you want to delete this entry?" onConfirm={handleProcessDelete} onCancel={() => setProcessDeleteConfirm({ open: false, id: null })} />
      <Snackbar open={snack.open} autoHideDuration={6000} onClose={() => setSnack((p) => ({ ...p, open: false }))}>
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
