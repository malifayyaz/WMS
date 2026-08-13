import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
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
  TextField,
  Typography,
  Tabs,
  Tab,
  Chip,
  Checkbox,
  FormControlLabel,
  Tooltip,
  Stack,
  Divider,
  Menu,
  IconButton,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AssessmentIcon from '@mui/icons-material/Assessment';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import TableChartIcon from '@mui/icons-material/TableChart';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import LocalAtmIcon from '@mui/icons-material/LocalAtm';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import { customersAPI, suppliersAPI, transactionsAPI, ordersAPI, configAPI, rawMaterialsAPI, annealingAPI, jobWorkAPI, chequesAPI } from '../services/api';
import { formatCurrency, formatDate } from '../utils/formatters';
import { exportLedgerExcel, exportLedgerPdf } from '../utils/ledgerExport';
import DateRangePicker from '../components/Common/DateRangePicker';
import ConfirmDialog from '../components/Common/ConfirmDialog';
import AccessDeniedSnackbar from '../components/Common/AccessDeniedSnackbar';
import LedgerDialog from '../components/Common/LedgerDialog';
import PartySearchSelect from '../components/Common/PartySearchSelect';
import DailyBookReportDialog from '../components/DailyBook/DailyBookReportDialog';
import ResponsiveDialog from '../components/Common/ResponsiveDialog';
import useDailyBookSession from '../hooks/useDailyBookSession';
import { usePermissions } from '../hooks/usePermissions';
import { useIsMobile } from '../hooks/useBreakpoint';

const paymentMethods = ['Cash', 'Bank Transfer', 'Cheque'];
const cashChequeMethods = ['Cash', 'Cheque'];
const defaultCoilCategoryForWire = (wireNumber) => (Number(wireNumber) === 20 ? 'Patri Coil' : 'Shiplet Coil');
const BANK_ACCOUNTS = ['MBL', 'UBL', 'Faisal Bank', 'Other'];
const SELF_EXPENSE_GROUP = 'Self Expense';
const DAILY_TOTAL_CATEGORY = 'Daily Total';

/**
 * Pool deliveries are stored per arrival lot. Collapse FIFO-split pieces into one
 * display row per deliveryGroupId (or matching historical heuristic).
 * Returns Map<lotId, displayDelivery[]> for nested table rows.
 */
function buildJobWorkDeliveryDisplayByLot(lots) {
  const fragments = [];
  (lots || []).forEach((lot) => {
    (lot.deliveries || []).forEach((d) => {
      fragments.push({
        ...d,
        jobWorkId: lot._id,
        customerId: lot.customerId,
        arrivalDate: lot.arrivalDate,
        lotCoilRate: lot.coilRatePerKg,
      });
    });
  });

  const rawGroups = new Map();
  fragments.forEach((f) => {
    const dateKey = f.deliveredDate ? new Date(f.deliveredDate).toISOString() : '';
    const key = f.deliveryGroupId
      ? `g:${f.deliveryGroupId}`
      : `h:${String(f.customerId)}|${dateKey}|${Number(f.labourRatePerKg) || 0}|${f.wireNumber == null ? '' : Number(f.wireNumber)}|${Number(f.coilRatePerKg) || 0}`;
    if (!rawGroups.has(key)) rawGroups.set(key, []);
    rawGroups.get(key).push(f);
  });

  const byLot = new Map();
  const ensure = (id) => {
    const k = String(id);
    if (!byLot.has(k)) byLot.set(k, []);
    return byLot.get(k);
  };

  rawGroups.forEach((parts, key) => {
    const isHeuristicSolo = key.startsWith('h:') && parts.length === 1;
    const isGrouped = key.startsWith('g:') || parts.length > 1;
    if (!isGrouped || isHeuristicSolo) {
      parts.forEach((p) => {
        ensure(p.jobWorkId).push({
          ...p,
          displayWeightKg: p.weightKg,
          displayLabourAmount: p.labourAmount,
          displayBundles: p.bundles || 0,
          splitAcrossLots: false,
        });
      });
      return;
    }

    // Prefer explicit primary; else earliest arrival lot
    const sorted = [...parts].sort(
      (a, b) => new Date(a.arrivalDate) - new Date(b.arrivalDate)
    );
    const primary = sorted.find((p) => p.isGroupPrimary) || sorted[0];
    const totalWeight = parts.reduce((s, p) => s + (Number(p.weightKg) || 0), 0);
    const totalLabour = parts.reduce((s, p) => s + (Number(p.labourAmount) || 0), 0);
    const totalBundles = parts.reduce((s, p) => s + (Number(p.bundles) || 0), 0);
    ensure(primary.jobWorkId).push({
      ...primary,
      displayWeightKg: Math.round(totalWeight * 1000) / 1000,
      displayLabourAmount: Math.round(totalLabour * 100) / 100,
      displayBundles: totalBundles,
      splitAcrossLots: parts.length > 1,
      groupPartCount: parts.length,
    });
  });

  return byLot;
}
const FACTORY_EXPENSE_TOTAL = 'Factory Expense Total';
const SELF_EXPENSE_CATEGORIES = ['Fayyaz Expense', 'Faisal Expense', 'Mutual Expense'];

const BANK_EXPENSE_TREE = {
  Labour: ['Labour Salary', 'Labour Advance', 'Labour Tea', 'Labour Food', 'Petrol Labour', 'Miscellaneous'],
  Rental: ['Coil Rental', 'Wire Rental', 'Miscellaneous'],
  Operations: ['Weight Scale Payment', 'Hardware Maintenance', 'Electricity', 'Office Expense', 'Miscellaneous'],
  Manufacturing: ['Annealing', 'Miscellaneous'],
  'Process Material': ['Acid', 'Dye', 'Soap', 'Stationary', 'Miscellaneous'],
  'Self Expense': ['Fayyaz Expense', 'Faisal Expense', 'Mutual Expense'],
};

const defaultCustomerForm = {
  name: '',
  contactNumber: '',
  address: '',
  customerType: 'Ledger',
  openingBalance: '',
  openingBalanceDate: new Date().toISOString().slice(0, 10),
  openingBalanceType: 'none',
  alsoSupplier: false,
  linkedSupplierId: '',
  unlinkSupplier: false,
};

const defaultSupplierForm = {
  name: '',
  contactNumber: '',
  companyName: '',
  address: '',
  openingBalance: '',
  openingBalanceDate: new Date().toISOString().slice(0, 10),
  openingBalanceType: 'none',
  alsoProcessingCustomer: false,
  linkedCustomerId: '',
  unlinkCustomer: false,
};

function isDailyBookExpenseRow(row) {
  if (row.paymentMethod === 'Bank Transfer') return false;
  if (row.sourceType === 'Manual') {
    return row.expenseGroup === FACTORY_EXPENSE_TOTAL
      || (row.expenseGroup === SELF_EXPENSE_GROUP && SELF_EXPENSE_CATEGORIES.includes(row.expenseCategory));
  }
  if (row.sourceType !== 'Expense') return false;
  if (row.expenseGroup === FACTORY_EXPENSE_TOTAL) return true;
  return row.expenseGroup === SELF_EXPENSE_GROUP
    && /^Daily book total/i.test(row.description || '');
}

function getSourceLabel(row) {
  if (isDailyBookExpenseRow(row)) {
    if (row.expenseGroup === SELF_EXPENSE_GROUP) return `Self Expense — ${row.expenseCategory}`;
    return 'Factory Expense — Daily Total';
  }
  if (row.sourceType === 'Expense') {
    return `Expense (classified) — ${row.expenseGroup || 'General'}${row.expenseCategory ? ` / ${row.expenseCategory}` : ''}`;
  }
  if (row.sourceType === 'Order') return 'Daily Sale / Order';
  if (row.sourceType === 'RawMaterial') return 'Raw Material Purchase';
  if (row.sourceType === 'ConsumptionMaterial') return 'Process Material';
  if (row.relatedTo === 'Customer' && row.orderId) return 'Customer Order';
  if (row.relatedTo === 'Customer') return 'Customer Payment';
  if (row.relatedTo === 'Supplier') return 'Supplier Payment';
  if (row.relatedName === 'ATM Withdrawal') {
    return row.paymentMethod === 'Cash' ? 'ATM Withdrawal — Cash In' : 'ATM Withdrawal';
  }
  if (row.paymentMethod === 'Bank Transfer') return 'Bank Transfer';
  if (row.relatedTo === 'Other' && row.sourceType === 'Manual') return 'General Cash / Cheque';
  return row.sourceType === 'Manual' ? 'Manual Entry' : row.relatedTo || 'Other';
}

function ToolbarSection({ label, children }) {
  return (
    <Box sx={{ minWidth: 0, width: { xs: '100%', md: 'auto' } }}>
      <Typography
        variant="overline"
        color="text.secondary"
        sx={{ display: 'block', mb: 0.75, letterSpacing: 0.6, fontWeight: 700, lineHeight: 1.2 }}
      >
        {label}
      </Typography>
      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap alignItems="center">
        {children}
      </Stack>
    </Box>
  );
}

const toolbarBtn = { textTransform: 'none', fontWeight: 600, borderRadius: 1.5, px: 1.5 };

export default function DailyBook() {
  const { isViewer } = usePermissions();
  const isMobile = useIsMobile();
  const btnSize = isMobile ? 'medium' : 'small';
  const [accessDenied, setAccessDenied] = useState(false);
  const requireAdmin = (fn) => (...args) => {
    if (isViewer) {
      setAccessDenied(true);
      return;
    }
    return fn(...args);
  };
  const [list, setList] = useState([]);
  const [dailyOrders, setDailyOrders] = useState([]);
  const [wires, setWires] = useState([]);
  const [stockPreview, setStockPreview] = useState(null);
  const [cashBook, setCashBook] = useState(null);
  const [cashBookRange, setCashBookRange] = useState([]);
  const [bankBook, setBankBook] = useState(null);
  const [bankTransferDialogOpen, setBankTransferDialogOpen] = useState(false);
  const [bankTransferEditingId, setBankTransferEditingId] = useState(null);
  const [bankTransferForm, setBankTransferForm] = useState({
    transactionType: 'Money In',
    amount: '',
    personType: 'free',
    relatedId: '',
    relatedName: '',
    bankAccount: 'MBL',
    bankAccountOtherName: '',
    bankAccountNumber: '',
    description: '',
    transactionDate: '',
    recordAsExpense: false,
    expenseGroup: 'Manufacturing',
    expenseCategory: 'Annealing',
  });
  const [loading, setLoading] = useState(true);
  const {
    entryDate,
    setEntryDate,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    mainTab,
    setMainTab,
  } = useDailyBookSession();
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [atmDialogOpen, setAtmDialogOpen] = useState(false);
  const [atmForm, setAtmForm] = useState({
    amount: '',
    bankAccount: 'MBL',
    bankAccountOtherName: '',
    destination: 'cashInHand',
    expenseGroup: 'Self Expense',
    expenseCategory: 'Fayyaz Expense',
    description: '',
    transactionDate: '',
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [generalCashMode, setGeneralCashMode] = useState(false);
  const [selfExpenseMenuAnchor, setSelfExpenseMenuAnchor] = useState(null);
  const [dailySaleDialogOpen, setDailySaleDialogOpen] = useState(false);
  const [editingDailySaleId, setEditingDailySaleId] = useState(null);
  const [dailySaleForm, setDailySaleForm] = useState({
    customerId: '',
    wireNumber: '',
    coilCategory: '',
    wireSize: '',
    initialWeightKg: '',
    bundles: '',
    ratePerKg: '',
    amountPaid: 0,
    paymentMethod: 'Cash',
    soldBy: '',
    orderDate: '',
    notes: '',
    isAnnealed: false,
    annealingRecordId: '',
  });
  const [openingDialogOpen, setOpeningDialogOpen] = useState(false);
  const [openingForm, setOpeningForm] = useState({ openingBalance: '', note: '' });
  const [cashBreakdownDialogOpen, setCashBreakdownDialogOpen] = useState(false);
  const [cashBreakdownForm, setCashBreakdownForm] = useState({ lines: [{ holder: '', amount: '' }], note: '' });
  const [prevClosingHint, setPrevClosingHint] = useState(null);
  const [selectedPartyId, setSelectedPartyId] = useState('');
  const [partyLedger, setPartyLedger] = useState(null);
  const [inHandChequesList, setInHandChequesList] = useState([]);
  const [form, setForm] = useState({
    entryKind: 'General',
    expenseGroup: 'Operations',
    expenseCategory: 'Miscellaneous',
    transactionType: 'Money In',
    amount: '',
    paymentMethod: 'Cash',
    relatedTo: 'Customer',
    relatedId: '',
    relatedName: '',
    description: '',
    handledBy: '',
    chequeNumber: '',
    chequeBank: 'MBL',
    chequeDate: '',
    chequeType: 'Company Cheque',
    isEndorsedCheque: false,
    sourceChequeId: '',
    receivedFromName: '',
  });
  const [editingId, setEditingId] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, id: null });
  const [deleteOrderConfirm, setDeleteOrderConfirm] = useState({ open: false, id: null });
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' });
  const [ledgerDialogOpen, setLedgerDialogOpen] = useState(false);
  const [partyDialogOpen, setPartyDialogOpen] = useState(false);
  const [partyForm, setPartyForm] = useState(defaultCustomerForm);
  const [partyEditingId, setPartyEditingId] = useState(null);
  const [partyDeleteConfirm, setPartyDeleteConfirm] = useState({ open: false, id: null });
  const [stockArrivalDialogOpen, setStockArrivalDialogOpen] = useState(false);
  const [stockArrivalForm, setStockArrivalForm] = useState({
    supplierId: '',
    coilCategory: 'Shiplet Coil',
    weightInKg: '',
    bundles: '',
    ratePerKg: '',
    amountPaid: '',
    paymentMethod: 'Cash',
    purchaseDate: '',
    notes: '',
  });
  const [coilReturnDialogOpen, setCoilReturnDialogOpen] = useState(false);
  const [coilReturnForm, setCoilReturnForm] = useState({
    supplierId: '',
    coilCategory: 'Shiplet Coil',
    weightInKg: '',
    bundles: '',
    ratePerKg: '',
    purchaseDate: '',
    notes: '',
  });
  const [ledgerSaleDialogOpen, setLedgerSaleDialogOpen] = useState(false);
  const [ledgerSaleForm, setLedgerSaleForm] = useState({
    customerId: '',
    wireNumber: '',
    coilCategory: '',
    wireSize: '',
    initialWeightKg: '',
    bundles: '',
    ratePerKg: '',
    amountPaid: '',
    paymentMethod: 'Cash',
    soldBy: '',
    orderDate: '',
    notes: '',
    isAnnealed: false,
    annealingRecordId: '',
  });
  const defaultAnnealingSendForm = {
    partyType: 'Supplier',
    partyId: '',
    materialType: 'Coil',
    coilCategory: 'Shiplet Coil',
    wireNumber: '',
    bundles: '',
    weightKg: '',
    date: '',
    sentBy: '',
    notes: '',
  };
  const defaultAnnealingArrivalForm = {
    poolKey: '',
    partyType: 'Supplier',
    partyId: '',
    materialType: 'Coil',
    coilCategory: 'Shiplet Coil',
    wireNumber: '',
    bundles: '',
    initialWeightKg: '',
    finalWeightKg: '',
    date: '',
    receivedBy: '',
    notes: '',
  };
  const [annealingSendDialogOpen, setAnnealingSendDialogOpen] = useState(false);
  const [annealingArrivalDialogOpen, setAnnealingArrivalDialogOpen] = useState(false);
  const [annealingRecords, setAnnealingRecords] = useState([]);
  const [annealingPools, setAnnealingPools] = useState([]);
  const [annealingSendForm, setAnnealingSendForm] = useState(defaultAnnealingSendForm);
  const [annealingArrivalForm, setAnnealingArrivalForm] = useState(defaultAnnealingArrivalForm);
  const [annealingEditId, setAnnealingEditId] = useState(null);
  const [annealingEditType, setAnnealingEditType] = useState(null);
  const [deleteAnnealingConfirm, setDeleteAnnealingConfirm] = useState({ open: false, id: null });
  const [annealingPoolDialog, setAnnealingPoolDialog] = useState({ open: false, pool: null });
  const [annealingPoolEntries, setAnnealingPoolEntries] = useState([]);
  const [annealingPoolLoading, setAnnealingPoolLoading] = useState(false);

  const [jobWorks, setJobWorks] = useState([]);
  const [jobWorkStock, setJobWorkStock] = useState(null);
  const [jobWorkPools, setJobWorkPools] = useState([]);
  const [jobWorkDialogOpen, setJobWorkDialogOpen] = useState(false);
  const [jobWorkEditId, setJobWorkEditId] = useState(null);
  const [jobWorkForm, setJobWorkForm] = useState({
    customerId: '',
    coilCategory: 'Shiplet Coil',
    arrivedWeightKg: '',
    coilRatePerKg: '',
    arrivalDate: '',
    notes: '',
  });
  const [jobWorkDeliveryDialogOpen, setJobWorkDeliveryDialogOpen] = useState(false);
  const [jobWorkDeliveryForm, setJobWorkDeliveryForm] = useState({
    customerId: '',
    weightKg: '',
    bundles: '',
    wireNumber: '',
    labourRatePerKg: '',
    deliveredDate: '',
    notes: '',
  });
  const [jobWorkDeliveryEdit, setJobWorkDeliveryEdit] = useState(null);
  const [deleteJobWorkDeliveryConfirm, setDeleteJobWorkDeliveryConfirm] = useState({
    open: false,
    jobWorkId: null,
    deliveryId: null,
  });
  const [deleteJobWorkConfirm, setDeleteJobWorkConfirm] = useState({ open: false, id: null });
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [returnForm, setReturnForm] = useState({
    customerId: '',
    wireNumber: '',
    coilCategory: '',
    initialWeightKg: '',
    bundles: '',
    ratePerKg: '',
    orderDate: '',
    notes: '',
  });
  const [annealedWireOptions, setAnnealedWireOptions] = useState([]);

  const fetchAnnealingData = useCallback(async () => {
    if (mainTab !== 4) {
      setAnnealingRecords([]);
      setAnnealingPools([]);
      return;
    }
    try {
      const params = {};
      params.startDate = startDate || entryDate;
      params.endDate = endDate || entryDate;
      const [allRes, poolRes] = await Promise.all([
        annealingAPI.getAll(params),
        annealingAPI.getSummary({}),
      ]);
      setAnnealingRecords(allRes.data.data || []);
      setAnnealingPools(poolRes.data.data || []);
    } catch {
      setAnnealingRecords([]);
      setAnnealingPools([]);
    }
  }, [mainTab, startDate, endDate, entryDate]);

  const fetchJobWorkData = useCallback(async () => {
    if (mainTab !== 5) {
      setJobWorks([]);
      setJobWorkStock(null);
      setJobWorkPools([]);
      return;
    }
    try {
      const params = {};
      if (selectedPartyId) params.customerId = selectedPartyId;
      params.startDate = startDate || entryDate;
      params.endDate = endDate || entryDate;
      const poolParams = selectedPartyId ? { customerId: selectedPartyId } : {};
      const [listRes, stockRes, poolRes] = await Promise.all([
        jobWorkAPI.getAll(params),
        jobWorkAPI.getStock(),
        jobWorkAPI.getPools(poolParams),
      ]);
      setJobWorks(listRes.data.data || []);
      setJobWorkStock(stockRes.data.data || null);
      setJobWorkPools(poolRes.data.data || []);
    } catch {
      setJobWorks([]);
      setJobWorkStock(null);
      setJobWorkPools([]);
    }
  }, [mainTab, selectedPartyId, startDate, endDate, entryDate]);

  const dailyCustomers = customers.filter((c) => c.customerType === 'Daily');
  const ledgerCustomers = customers.filter((c) => c.customerType === 'Ledger');
  const processingCustomers = customers.filter((c) => c.customerType === 'Processing');

  const partyConfig = [
    { label: 'Cash Book', type: null },
    { label: 'Daily Customers', type: 'DailyCustomer', partyType: 'Customer', parties: dailyCustomers },
    { label: 'Ledger Customers', type: 'LedgerCustomer', partyType: 'Customer', parties: ledgerCustomers },
    { label: 'Suppliers', type: 'Supplier', partyType: 'Supplier', parties: suppliers },
    { label: 'Annealing', type: 'Annealing', partyType: null, parties: [] },
    { label: 'Processing Work', type: 'Processing', partyType: 'Customer', parties: processingCustomers },
  ];

  const currentConfig = partyConfig[mainTab];
  const partyType = currentConfig.partyType;
  const parties = currentConfig.parties || [];

  const fetchCashBook = useCallback(async () => {
    try {
      if (startDate && endDate && mainTab === 0) {
        const res = await transactionsAPI.getCashBook({ startDate, endDate });
        setCashBookRange(res.data.data || []);
        setCashBook(null);
      } else {
        const res = await transactionsAPI.getCashBook({ date: entryDate });
        setCashBook(res.data.data);
        setCashBookRange([]);
      }
    } catch {
      setCashBook(null);
      setCashBookRange([]);
    }
  }, [entryDate, startDate, endDate, mainTab]);

  const fetchBankBook = useCallback(async () => {
    if (mainTab !== 0) return;
    try {
      const params = startDate && endDate
        ? { startDate, endDate }
        : { startDate: entryDate, endDate: entryDate };
      const res = await transactionsAPI.getBankBook(params);
      setBankBook(res.data.data || null);
    } catch {
      setBankBook(null);
    }
  }, [mainTab, entryDate, startDate, endDate]);

  const filterForPartyTab = (rows, tab) => {
    if (tab === 2) {
      const ledgerIds = new Set(ledgerCustomers.map((c) => String(c._id)));
      return rows.filter(
        (t) => t.relatedTo === 'Customer'
          && ledgerIds.has(String(t.relatedId))
          && !t.orderId
          && t.sourceType === 'Manual'
      );
    }
    if (tab === 3) {
      const supplierIds = new Set(suppliers.map((s) => String(s._id)));
      return rows.filter(
        (t) => t.relatedTo === 'Supplier'
          && supplierIds.has(String(t.relatedId))
          && ['Manual', 'RawMaterial'].includes(t.sourceType)
      );
    }
    return rows;
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      if (mainTab === 4 || mainTab === 5) {
        setList([]);
        setDailyOrders([]);
        await fetchCashBook();
        setLoading(false);
        return;
      }
      if (mainTab === 1) {
      const params = {};
        if (startDate && endDate) {
          params.startDate = startDate;
          params.endDate = endDate;
        } else {
          params.startDate = entryDate;
          params.endDate = entryDate;
        }
        if (selectedPartyId) params.customerId = selectedPartyId;
        const txnParams = { relatedTo: 'Customer' };
        if (startDate) txnParams.startDate = startDate;
        else txnParams.startDate = entryDate;
        if (endDate) txnParams.endDate = endDate;
        else txnParams.endDate = entryDate;
        if (selectedPartyId) txnParams.relatedId = selectedPartyId;
        const [orderRes, txnRes] = await Promise.all([
          ordersAPI.getAll(params),
          transactionsAPI.getAll(txnParams),
        ]);
        const dailyIds = new Set(dailyCustomers.map((c) => String(c._id)));
        const filtered = (orderRes.data.data || []).filter((o) => {
          const cid = String(o.customerId?._id || o.customerId);
          return dailyIds.has(cid);
        });
        const filteredTxns = (txnRes.data.data || []).filter((t) => {
          const cid = String(t.relatedId);
          return dailyIds.has(cid) && !t.orderId;
        });
        setDailyOrders(filtered);
        setList(filteredTxns);
      } else {
        const params = {};
        if (mainTab === 0) {
          params.startDate = entryDate;
          params.endDate = entryDate;
        } else {
          params.startDate = startDate || entryDate;
          params.endDate = endDate || entryDate;
          params.relatedTo = partyType;
          if (selectedPartyId) params.relatedId = selectedPartyId;
        }
        const res = await transactionsAPI.getAll(params);
        let data = res.data.data || [];
        if (mainTab === 2 || mainTab === 3) {
          data = filterForPartyTab(data, mainTab);
        }
        setList(data);
        setDailyOrders([]);
      }
      await fetchCashBook();
      await fetchBankBook();
      chequesAPI.getInHand().then((res) => setInHandChequesList(res.data.data || [])).catch(() => {});
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Failed to load', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const fetchPartyLedger = useCallback(async () => {
    if (!selectedPartyId || !partyType) {
      setPartyLedger(null);
      return;
    }
    try {
      const params = { mode: 'personal' };
      if (startDate) params.startDate = startDate;
      else if (mainTab >= 2) params.startDate = entryDate;
      if (endDate) params.endDate = endDate;
      else if (mainTab >= 2) params.endDate = entryDate;
      const api = partyType === 'Customer' ? customersAPI : suppliersAPI;
      const res = await api.getLedger(selectedPartyId, params);
      setPartyLedger(res.data.data);
    } catch {
      setPartyLedger(null);
    }
  }, [selectedPartyId, partyType, startDate, endDate, entryDate, mainTab]);

  const fetchParties = useCallback(async () => {
    try {
      const [customerRes, supplierRes] = await Promise.all([
        customersAPI.getAll(),
        suppliersAPI.getAll(),
      ]);
      setCustomers(customerRes.data.data || []);
      setSuppliers(supplierRes.data.data || []);
    } catch (err) {
      setSnack({
        open: true,
        message: err.response?.data?.message || 'Failed to load customers and suppliers',
        severity: 'error',
      });
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [entryDate, startDate, endDate, selectedPartyId, mainTab]);

  // If an AI agent mutation happens in a separate dialog, the currently open tab
  // must refresh (otherwise you only see the change after manually switching tabs).
  useEffect(() => {
    const handler = () => {
      fetchParties();
      fetchData();
      fetchPartyLedger();
    };
    window.addEventListener('wms-ai-updated', handler);
    return () => window.removeEventListener('wms-ai-updated', handler);
  }, [fetchData, fetchPartyLedger, fetchParties]);

  useEffect(() => {
    fetchPartyLedger();
  }, [fetchPartyLedger]);

  useEffect(() => {
    fetchAnnealingData();
  }, [fetchAnnealingData]);

  useEffect(() => {
    fetchJobWorkData();
  }, [fetchJobWorkData]);

  useEffect(() => {
    fetchParties();
  }, [fetchParties]);

  useEffect(() => {
    (async () => {
      try {
        const configRes = await configAPI.getWires();
        setWires(configRes.data.data?.wires || []);
      } catch {
        // ignore wire config load failure
      }
    })();
  }, []);

  const loadStockPreview = async (wireNumber, weightKg, coilCategory) => {
    if (!wireNumber || !weightKg) {
      setStockPreview(null);
      return;
    }
    try {
      const res = await ordersAPI.checkStock({ wireNumber, weightKg, coilCategory });
      setStockPreview(res.data.data);
    } catch {
      setStockPreview(null);
    }
  };

  useEffect(() => {
    if (dailySaleDialogOpen && dailySaleForm.wireNumber && dailySaleForm.initialWeightKg && dailySaleForm.coilCategory) {
      loadStockPreview(dailySaleForm.wireNumber, dailySaleForm.initialWeightKg, dailySaleForm.coilCategory);
    }
  }, [dailySaleForm.wireNumber, dailySaleForm.initialWeightKg, dailySaleForm.coilCategory, dailySaleDialogOpen]);

  const selectedWire = wires.find((w) => w.number === Number(dailySaleForm.wireNumber));
  const dailyOrderTotal = Number(dailySaleForm.initialWeightKg || 0) * Number(dailySaleForm.ratePerKg || 0);

  const openOpeningDialog = async () => {
    try {
      const res = await transactionsAPI.getPreviousClosing({ date: entryDate });
      setPrevClosingHint(res.data.data?.previousClosing ?? 0);
    } catch {
      setPrevClosingHint(null);
    }
    setOpeningForm({
      openingBalance: cashBook?.openingSource === 'manual' ? String(cashBook.openingBalance) : '',
      note: cashBook?.manualNote || '',
    });
    setOpeningDialogOpen(true);
  };

  const handleSaveOpening = async () => {
    if (openingForm.openingBalance === '' || Number(openingForm.openingBalance) < 0) {
      setSnack({ open: true, message: 'Valid opening balance required', severity: 'error' });
      return;
    }
    try {
      await transactionsAPI.setCashOpening({
        bookDate: entryDate,
        openingBalance: Number(openingForm.openingBalance),
        note: openingForm.note,
      });
      setSnack({ open: true, message: 'Opening balance set', severity: 'success' });
      setOpeningDialogOpen(false);
      fetchData();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Error', severity: 'error' });
    }
  };

  const openCashBreakdownDialog = () => {
    const breakdown = cashBook?.cashBreakdown;
    setCashBreakdownForm({
      lines: breakdown?.lines?.length
        ? breakdown.lines.map((line) => ({ holder: line.holder, amount: String(line.amount) }))
        : [{ holder: '', amount: '' }],
      note: breakdown?.note || '',
    });
    setCashBreakdownDialogOpen(true);
  };

  const handleSaveCashBreakdown = async () => {
    const lines = cashBreakdownForm.lines
      .map((line) => ({ holder: String(line.holder || '').trim(), amount: Number(line.amount) || 0 }))
      .filter((line) => line.holder && line.amount > 0);
    try {
      await transactionsAPI.setCashBreakdown({
        bookDate: entryDate,
        lines,
        note: cashBreakdownForm.note || undefined,
      });
      setSnack({ open: true, message: 'Cash breakdown saved', severity: 'success' });
      setCashBreakdownDialogOpen(false);
      fetchData();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Error', severity: 'error' });
    }
  };

  const handleSaveAtmWithdrawal = async () => {
    if (!Number(atmForm.amount) || Number(atmForm.amount) <= 0) {
      setSnack({ open: true, message: 'Valid amount required', severity: 'error' });
      return;
    }
    if (atmForm.bankAccount === 'Other' && !atmForm.bankAccountOtherName?.trim()) {
      setSnack({ open: true, message: 'Please write the bank / account name for Other', severity: 'error' });
      return;
    }
    if (atmForm.destination === 'expense' && (!atmForm.expenseGroup || !atmForm.expenseCategory)) {
      setSnack({ open: true, message: 'Select expense group and category', severity: 'error' });
      return;
    }
    try {
      const payload = {
        entryKind: 'ATMWithdrawal',
        amount: Number(atmForm.amount),
        bankAccount: atmForm.bankAccount || 'MBL',
        bankAccountOtherName: atmForm.bankAccount === 'Other' ? atmForm.bankAccountOtherName.trim() : undefined,
        destination: atmForm.destination,
        description: atmForm.description || undefined,
        transactionDate: atmForm.transactionDate || entryDate,
      };
      if (atmForm.destination === 'expense') {
        payload.expenseGroup = atmForm.expenseGroup;
        payload.expenseCategory = atmForm.expenseCategory;
      }
      const res = await transactionsAPI.create(payload);
      setSnack({ open: true, message: res.data.message || 'ATM withdrawal recorded', severity: 'success' });
      setAtmDialogOpen(false);
      fetchData();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Error', severity: 'error' });
    }
  };

  const handleSaveBankTransfer = async () => {
    const {
      transactionType, amount, personType, relatedId, relatedName,
      bankAccount, bankAccountOtherName, bankAccountNumber, description, transactionDate,
    } = bankTransferForm;
    if (!Number(amount) || Number(amount) <= 0) {
      setSnack({ open: true, message: 'Valid amount required', severity: 'error' });
      return;
    }
    if (personType !== 'free' && !relatedId) {
      setSnack({ open: true, message: 'Please select a customer or supplier', severity: 'error' });
      return;
    }
    if (bankAccount === 'Other' && !bankAccountOtherName?.trim()) {
      setSnack({ open: true, message: 'Please write the bank / account name for Other', severity: 'error' });
      return;
    }
    try {
      const payload = {
        transactionType,
        amount: Number(amount),
        paymentMethod: 'Bank Transfer',
        sourceType: 'Manual',
        bankAccount: bankAccount || 'MBL',
        bankAccountOtherName: bankAccount === 'Other' ? bankAccountOtherName.trim() : undefined,
        bankAccountNumber: bankAccountNumber || undefined,
        description: description || undefined,
        transactionDate: transactionDate || entryDate,
      };
      if (personType === 'customer') {
        payload.relatedTo = 'Customer';
        payload.relatedId = relatedId;
        const cust = customers.find((c) => c._id === relatedId);
        payload.relatedName = cust?.name || relatedName;
      } else if (personType === 'supplier') {
        payload.relatedTo = 'Supplier';
        payload.relatedId = relatedId;
        const sup = suppliers.find((s) => s._id === relatedId);
        payload.relatedName = sup?.name || relatedName;
      } else {
        payload.relatedTo = 'Other';
        payload.relatedName = relatedName || undefined;
      }
      if (transactionType === 'Money Out' && bankTransferForm.recordAsExpense) {
        if (!bankTransferForm.expenseGroup || !bankTransferForm.expenseCategory) {
          setSnack({ open: true, message: 'Select expense group and category', severity: 'error' });
          return;
        }
        payload.recordAsExpense = true;
        payload.expenseGroup = bankTransferForm.expenseGroup;
        payload.expenseCategory = bankTransferForm.expenseCategory;
      } else if (bankTransferEditingId && transactionType === 'Money Out') {
        payload.recordAsExpense = false;
      }
      if (bankTransferEditingId) {
        await transactionsAPI.update(bankTransferEditingId, payload);
        setSnack({ open: true, message: 'Bank transfer updated', severity: 'success' });
      } else {
        const res = await transactionsAPI.create(payload);
        setSnack({ open: true, message: res.data.message || `Bank transfer recorded — ${transactionType}`, severity: 'success' });
      }
      setBankTransferDialogOpen(false);
      setBankTransferEditingId(null);
      fetchData();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Error', severity: 'error' });
    }
  };

  const openExpenseDialog = (entryKind, expenseCategory = 'Fayyaz Expense') => {
    setGeneralCashMode(false);
    setEditingId(null);
    setForm({
      entryKind,
      expenseGroup: entryKind === 'SelfExpense' ? SELF_EXPENSE_GROUP : FACTORY_EXPENSE_TOTAL,
      expenseCategory: entryKind === 'SelfExpense' ? expenseCategory : DAILY_TOTAL_CATEGORY,
      transactionType: 'Money Out',
      amount: '',
      paymentMethod: 'Cash',
      relatedTo: 'Other',
      relatedId: '',
      relatedName: '',
      description: '',
      handledBy: '',
    });
    setDialogOpen(true);
  };

  /** Cash/cheque from anyone who is not a ledger customer — updates cash in hand. */
  const openGeneralCashDialog = (transactionType = 'Money In') => {
    setGeneralCashMode(true);
    setEditingId(null);
    setForm({
      entryKind: 'General',
      expenseGroup: 'Operations',
      expenseCategory: 'Miscellaneous',
      transactionType,
      amount: '',
      paymentMethod: 'Cash',
      relatedTo: 'Other',
      relatedId: '',
      relatedName: '',
      description: '',
      handledBy: '',
    });
    setDialogOpen(true);
  };

  const openEditBankTransfer = (row) => {
    let personType = 'free';
    if (row.relatedTo === 'Customer') personType = 'customer';
    else if (row.relatedTo === 'Supplier') personType = 'supplier';

    const pollutedDailyTotal = row.expenseGroup === FACTORY_EXPENSE_TOTAL
      && row.expenseCategory === DAILY_TOTAL_CATEGORY;
    const hasRealExpense = !!(row.linkedExpenseId
      || (row.expenseGroup && !pollutedDailyTotal));

    setBankTransferEditingId(row._id);
    setBankTransferForm({
      transactionType: row.transactionType || 'Money In',
      amount: String(row.amount ?? ''),
      personType,
      relatedId: row.relatedId || '',
      relatedName: row.relatedName || '',
      bankAccount: row.bankAccount || 'MBL',
      bankAccountOtherName: row.bankAccountOtherName || '',
      bankAccountNumber: row.bankAccountNumber || '',
      description: row.description || '',
      transactionDate: row.transactionDate
        ? new Date(row.transactionDate).toISOString().slice(0, 10)
        : entryDate,
      recordAsExpense: hasRealExpense,
      expenseGroup: hasRealExpense && row.expenseGroup ? row.expenseGroup : 'Manufacturing',
      expenseCategory: hasRealExpense && row.expenseCategory ? row.expenseCategory : 'Annealing',
    });
    setBankTransferDialogOpen(true);
  };

  const openBankTransferDialog = () => {
    setBankTransferEditingId(null);
    setBankTransferForm({
      transactionType: 'Money In',
      amount: '',
      personType: 'free',
      relatedId: '',
      relatedName: '',
      bankAccount: 'MBL',
      bankAccountOtherName: '',
      bankAccountNumber: '',
      description: '',
      transactionDate: entryDate,
      recordAsExpense: false,
      expenseGroup: 'Manufacturing',
      expenseCategory: 'Annealing',
    });
    setBankTransferDialogOpen(true);
  };

  const openAtmDialog = () => {
    setAtmForm({
      amount: '',
      bankAccount: 'MBL',
      bankAccountOtherName: '',
      destination: 'cashInHand',
      expenseGroup: 'Self Expense',
      expenseCategory: 'Fayyaz Expense',
      description: '',
      transactionDate: entryDate,
    });
    setAtmDialogOpen(true);
  };

  const closeTransactionDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setGeneralCashMode(false);
  };

  const customerSearchLabel = (c) => {
    if (!c) return '';
    if (c.customerType === 'Daily') return `${c.name} (Daily)`;
    if (c.customerType === 'Processing') return `${c.name} (Processing)`;
    return `${c.name} (Due: ${formatCurrency(c.totalAmountDue || 0)})`;
  };

  const supplierSearchLabel = (s) => `${s.name} (Due: ${formatCurrency(s.totalAmountDue || 0)})`;

  const handleOpenAdd = () => {
    if (mainTab === 1) {
      setEditingDailySaleId(null);
      setDailySaleForm({
        customerId: selectedPartyId || dailyCustomers[0]?._id || '',
        wireNumber: '',
        coilCategory: '',
        wireSize: '',
        initialWeightKg: '',
        bundles: '',
        ratePerKg: '',
        amountPaid: 0,
        paymentMethod: 'Cash',
        soldBy: '',
        orderDate: entryDate,
        notes: '',
        isAnnealed: false,
        annealingRecordId: '',
      });
      setAnnealedWireOptions([]);
      setStockPreview(null);
      setDailySaleDialogOpen(true);
      return;
    }
    const isSupplierTab = mainTab === 3;
    if (mainTab >= 2 && !selectedPartyId) {
      setSnack({ open: true, message: `Please select a ${isSupplierTab ? 'supplier' : 'customer'} first`, severity: 'error' });
      return;
    }
    setEditingId(null);
    setGeneralCashMode(false);
    setForm({
      entryKind: 'General',
      expenseGroup: 'Operations',
      expenseCategory: 'Miscellaneous',
      transactionType: isSupplierTab ? 'Money Out' : 'Money In',
      amount: '',
      paymentMethod: 'Cash',
      relatedTo: isSupplierTab ? 'Supplier' : mainTab === 2 || mainTab === 5 ? 'Customer' : 'Other',
      relatedId: selectedPartyId || '',
      relatedName: '',
      description: '',
      handledBy: '',
    });
    setDialogOpen(true);
  };

  const openEditTransaction = (row) => {
    if (mainTab >= 2 && row.sourceType === 'RawMaterial') {
      setSnack({ open: true, message: 'Raw material purchases are managed in Raw Materials section', severity: 'info' });
      return;
    }
    if (mainTab === 0 && row.sourceType === 'Expense' && !isDailyBookExpenseRow(row)) {
      setSnack({ open: true, message: 'Classified expenses are edited in the Expenses section', severity: 'info' });
      return;
    }
    if (row.paymentMethod === 'Bank Transfer') {
      openEditBankTransfer(row);
      return;
    }
    if (row.transactionDate) {
      const d = new Date(row.transactionDate);
      if (!Number.isNaN(d.getTime())) {
        setEntryDate(d.toISOString().slice(0, 10));
      }
    }
    setEditingId(row._id);
    let entryKind = 'General';
    if (isDailyBookExpenseRow(row)) {
      entryKind = row.expenseGroup === SELF_EXPENSE_GROUP ? 'SelfExpense' : 'FactoryExpense';
    }
    const isGeneralCash = mainTab === 0
      && entryKind === 'General'
      && (row.relatedTo || 'Other') === 'Other'
      && row.paymentMethod !== 'Bank Transfer'
      && !isDailyBookExpenseRow(row);
    setGeneralCashMode(isGeneralCash);
    setForm({
      entryKind,
      expenseGroup: row.expenseGroup || (entryKind === 'SelfExpense' ? SELF_EXPENSE_GROUP : FACTORY_EXPENSE_TOTAL),
      expenseCategory: row.expenseCategory || (entryKind === 'SelfExpense' ? 'Fayyaz Expense' : DAILY_TOTAL_CATEGORY),
      transactionType: row.transactionType,
      amount: String(row.amount),
      paymentMethod: row.paymentMethod || 'Cash',
      relatedTo: row.relatedTo || 'Other',
      relatedId: row.relatedId || '',
      relatedName: row.relatedName || '',
      description: row.description || '',
      handledBy: row.handledBy || '',
    });
    setDialogOpen(true);
  };

  /** Edit a Daily Book payment/adjustment from the party day ledger table. */
  const openEditLedgerEntry = async (row) => {
    if (row.source !== 'Daily Book' || !row.sourceId) {
      setSnack({
        open: true,
        message: row.entryType === 'broughtforward'
          ? 'Balance brought forward cannot be edited'
          : `${row.source || 'This entry'} is edited from its own section, not here`,
        severity: 'info',
      });
      return;
    }
    try {
      const res = await transactionsAPI.getById(row.sourceId);
      openEditTransaction(res.data.data);
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Could not load transaction', severity: 'error' });
    }
  };

  /** Edit a sale order from the party ledger table or daily sales table. */
  const openEditDailySale = async (orderOrRow) => {
    let order = orderOrRow;
    const orderId = orderOrRow._id || orderOrRow.sourceId;
    if ((!order.wireNumber && orderId) || !order._id) {
      try {
        const res = await ordersAPI.getById(orderId);
        order = res.data.data;
      } catch (err) {
        setSnack({ open: true, message: err.response?.data?.message || 'Could not load sale details', severity: 'error' });
        return;
      }
    }
    setEditingDailySaleId(order._id);
    setDailySaleForm({
      customerId: order.customerId?._id || order.customerId || '',
      wireNumber: order.wireNumber || '',
      coilCategory: order.coilCategory || defaultCoilCategoryForWire(order.wireNumber),
      wireSize: order.wireSize || '',
      initialWeightKg: order.finalWeightKg ?? order.initialWeightKg ?? '',
      bundles: order.bundles || '',
      ratePerKg: order.ratePerKg || '',
      amountPaid: order.amountPaid ?? 0,
      paymentMethod: order.paymentMethod || 'Cash',
      soldBy: order.soldBy || '',
      orderDate: order.orderDate ? new Date(order.orderDate).toISOString().slice(0, 10) : entryDate,
      notes: order.notes || '',
      isAnnealed: !!order.isAnnealed,
      annealingRecordId: order.annealingRecordId || '',
    });
    if (order.isAnnealed && order.wireNumber) {
      loadAnnealedWireOptions(order.wireNumber);
    } else {
      setAnnealedWireOptions([]);
    }
    setStockPreview(null);
    setDailySaleDialogOpen(true);
  };

  const handleSaveDailySale = async () => {
    if (!dailySaleForm.customerId || !dailySaleForm.wireNumber || !dailySaleForm.initialWeightKg || !dailySaleForm.ratePerKg) {
      setSnack({ open: true, message: 'Customer, wire, weight and rate required', severity: 'error' });
      return;
    }
    try {
      const payload = {
        customerId: dailySaleForm.customerId,
        wireNumber: Number(dailySaleForm.wireNumber),
        coilCategory: dailySaleForm.coilCategory,
        wireSize: dailySaleForm.wireSize,
        initialWeightKg: Number(dailySaleForm.initialWeightKg),
        bundles: Number(dailySaleForm.bundles) || 0,
        ratePerKg: Number(dailySaleForm.ratePerKg),
        amountPaid: Number(dailySaleForm.amountPaid) || 0,
        paymentMethod: dailySaleForm.paymentMethod,
        soldBy: dailySaleForm.soldBy,
        orderDate: dailySaleForm.orderDate || entryDate,
        notes: dailySaleForm.notes,
        isAnnealed: !!dailySaleForm.isAnnealed,
        annealingRecordId: dailySaleForm.isAnnealed && dailySaleForm.annealingRecordId
          ? dailySaleForm.annealingRecordId
          : undefined,
      };
      let res;
      if (editingDailySaleId) {
        res = await ordersAPI.update(editingDailySaleId, payload);
      } else {
        res = await ordersAPI.create(payload);
      }
      const warnings = res.data.warnings || [];
      setSnack({
        open: true,
        message: warnings.length
          ? `Sale recorded — ${warnings.join('; ')}`
          : (res.data.message || (editingDailySaleId ? 'Daily sale updated' : 'Daily sale recorded')),
        severity: warnings.length ? 'warning' : 'success',
      });
      setEditingDailySaleId(null);
      setDailySaleDialogOpen(false);
      fetchData();
      fetchPartyLedger();
      if (dailySaleForm.isAnnealed) fetchAnnealingData();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Error', severity: 'error' });
    }
  };

  const handleDeleteOrder = async () => {
    if (!deleteOrderConfirm.id) return;
    try {
      await ordersAPI.delete(deleteOrderConfirm.id);
      setSnack({ open: true, message: 'Deleted', severity: 'success' });
      setDeleteOrderConfirm({ open: false, id: null });
      fetchData();
      fetchPartyLedger();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Error', severity: 'error' });
    }
  };

  const handleSave = async () => {
    if (!form.amount || Number(form.amount) <= 0) {
      setSnack({ open: true, message: 'Valid amount required', severity: 'error' });
      return;
    }
    if (['FactoryExpense', 'SelfExpense'].includes(form.entryKind)) {
      if (mainTab !== 0) {
        setSnack({ open: true, message: 'Daily expense totals can only be added from Cash Book tab', severity: 'error' });
        return;
      }
      try {
        const isSelf = form.entryKind === 'SelfExpense';
        const expenseCategory = isSelf ? form.expenseCategory : DAILY_TOTAL_CATEGORY;
        const payload = {
          entryKind: form.entryKind,
          amount: Number(form.amount),
          paymentMethod: form.paymentMethod,
          description: form.description,
          handledBy: form.handledBy,
          transactionDate: entryDate,
          expenseCategory,
        };
        if (editingId) {
          await transactionsAPI.update(editingId, {
            ...payload,
            transactionType: 'Money Out',
            expenseGroup: isSelf ? SELF_EXPENSE_GROUP : FACTORY_EXPENSE_TOTAL,
            relatedTo: 'Other',
            relatedName: isSelf ? form.expenseCategory : 'Factory Expense Total',
          });
        } else {
          await transactionsAPI.create(payload);
        }
        setSnack({ open: true, message: editingId ? 'Updated' : 'Expense total recorded', severity: 'success' });
        closeTransactionDialog();
        fetchData();
        fetchPartyLedger();
      } catch (err) {
        setSnack({ open: true, message: err.response?.data?.message || 'Error', severity: 'error' });
      }
      return;
    }
    if (['Customer', 'Supplier'].includes(form.relatedTo) && !form.relatedId) {
      setSnack({ open: true, message: `Please select a ${form.relatedTo.toLowerCase()}`, severity: 'error' });
      return;
    }
    if (generalCashMode && !String(form.relatedName || '').trim()) {
      setSnack({ open: true, message: 'Please enter who paid or received (person / party name)', severity: 'error' });
      return;
    }
    if (generalCashMode && form.paymentMethod === 'Bank Transfer') {
      setSnack({ open: true, message: 'Use Bank Transfer button for bank payments — they do not affect cash in hand', severity: 'error' });
      return;
    }
    try {
      let relatedName = form.relatedName;
      if (form.relatedTo === 'Customer') {
        const customer = customers.find((c) => c._id === form.relatedId);
        relatedName = customer?.name || '';
      }
      if (form.relatedTo === 'Supplier') {
        const supplier = suppliers.find((s) => s._id === form.relatedId);
        relatedName = supplier?.name || '';
      }
      const payload = {
        transactionType: form.transactionType,
        amount: Number(form.amount),
        paymentMethod: form.paymentMethod,
        relatedTo: form.relatedTo,
        relatedId: form.relatedTo === 'Other' ? undefined : form.relatedId,
        relatedName,
        description: form.description,
        handledBy: form.handledBy,
        transactionDate: entryDate,
        chequeNumber: form.chequeNumber,
        chequeBank: form.chequeBank,
        chequeDate: form.chequeDate,
        chequeType: form.chequeType,
        isEndorsedCheque: form.isEndorsedCheque,
        sourceChequeId: form.sourceChequeId || undefined,
        receivedFromName: form.receivedFromName,
      };
      if (editingId) {
        await transactionsAPI.update(editingId, payload);
      } else {
        await transactionsAPI.create(payload);
      }
      setSnack({ open: true, message: editingId ? 'Updated' : 'Recorded', severity: 'success' });
      closeTransactionDialog();
      fetchData();
      fetchPartyLedger();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Error', severity: 'error' });
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm.id) return;
    try {
      await transactionsAPI.delete(deleteConfirm.id);
      setSnack({ open: true, message: 'Deleted', severity: 'success' });
      setDeleteConfirm({ open: false, id: null });
      fetchData();
      fetchPartyLedger();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Error', severity: 'error' });
    }
  };

  const getPartyTypeLabel = () => {
    if (mainTab === 1) return 'Daily Customer';
    if (mainTab === 2) return 'Ledger Customer';
    if (mainTab === 5) return 'Processing Customer';
    return 'Supplier';
  };

  const handleOpenAddParty = () => {
    if (mainTab === 3) {
      setPartyForm(defaultSupplierForm);
    } else {
      setPartyForm({
        ...defaultCustomerForm,
        customerType: mainTab === 5 ? 'Processing' : mainTab === 1 ? 'Daily' : 'Ledger',
      });
    }
    setPartyEditingId(null);
    setPartyDialogOpen(true);
  };

  const handleOpenEditParty = () => {
    if (!selectedPartyId) return;
    if (mainTab === 3) {
      const supplier = suppliers.find((s) => s._id === selectedPartyId);
      if (!supplier) return;
      setPartyForm({
        ...defaultSupplierForm,
        name: supplier.name,
        contactNumber: supplier.contactNumber || '',
        companyName: supplier.companyName || '',
        address: supplier.address || '',
        openingBalance: supplier.openingBalance || '',
        openingBalanceDate: supplier.openingBalanceDate
          ? new Date(supplier.openingBalanceDate).toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10),
        openingBalanceType: supplier.openingBalanceType || 'none',
        alsoProcessingCustomer: false,
        linkedCustomerId: supplier.linkedCustomerId ? String(supplier.linkedCustomerId) : '',
        unlinkCustomer: false,
      });
    } else {
      const customer = customers.find((c) => c._id === selectedPartyId);
      if (!customer) return;
      setPartyForm({
        ...defaultCustomerForm,
        name: customer.name,
        contactNumber: customer.contactNumber || '',
        address: customer.address || '',
        customerType: customer.customerType || (mainTab === 1 ? 'Daily' : 'Ledger'),
        openingBalance: customer.openingBalance || '',
        openingBalanceDate: customer.openingBalanceDate
          ? new Date(customer.openingBalanceDate).toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10),
        openingBalanceType: customer.openingBalanceType || 'none',
        alsoSupplier: false,
        linkedSupplierId: customer.linkedSupplierId ? String(customer.linkedSupplierId) : '',
        unlinkSupplier: false,
      });
    }
    setPartyEditingId(selectedPartyId);
    setPartyDialogOpen(true);
  };

  const handleSaveParty = async () => {
    if (!partyForm.name.trim()) {
      setSnack({ open: true, message: 'Name is required', severity: 'error' });
      return;
    }
    try {
      if (mainTab === 3) {
        const payload = {
          name: partyForm.name,
          contactNumber: partyForm.contactNumber,
          companyName: partyForm.companyName,
          address: partyForm.address,
          openingBalance: partyForm.openingBalanceType !== 'none' && partyForm.openingBalance
            ? Number(partyForm.openingBalance)
            : 0,
          openingBalanceDate: partyForm.openingBalanceDate,
          openingBalanceType: partyForm.openingBalanceType,
        };
        if (partyForm.unlinkCustomer) payload.unlinkCustomer = true;
        else if (partyForm.linkedCustomerId) payload.linkedCustomerId = partyForm.linkedCustomerId;
        else if (partyForm.alsoProcessingCustomer) payload.alsoProcessingCustomer = true;

        if (partyEditingId) await suppliersAPI.update(partyEditingId, payload);
        else await suppliersAPI.create(payload);
      } else {
        const payload = {
          name: partyForm.name,
          contactNumber: partyForm.contactNumber,
          address: partyForm.address,
          openingBalance: (mainTab === 2 || mainTab === 5) && partyForm.openingBalanceType !== 'none' && partyForm.openingBalance
            ? Number(partyForm.openingBalance)
            : 0,
          openingBalanceDate: partyForm.openingBalanceDate,
          openingBalanceType: mainTab === 2 || mainTab === 5 ? partyForm.openingBalanceType : 'none',
          customerType: mainTab === 5 ? 'Processing' : mainTab === 1 ? 'Daily' : 'Ledger',
        };
        if (mainTab === 5) {
          if (partyForm.unlinkSupplier) payload.unlinkSupplier = true;
          else if (partyForm.linkedSupplierId) payload.linkedSupplierId = partyForm.linkedSupplierId;
          else if (partyForm.alsoSupplier) payload.alsoSupplier = true;
        }
        if (partyEditingId) await customersAPI.update(partyEditingId, payload);
        else await customersAPI.create(payload);
      }
      setSnack({ open: true, message: partyEditingId ? 'Updated' : 'Added', severity: 'success' });
      setPartyDialogOpen(false);
      await fetchParties();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Error', severity: 'error' });
    }
  };

  const handleDeleteParty = async () => {
    if (!partyDeleteConfirm.id) return;
    try {
      if (mainTab === 3) {
        await suppliersAPI.delete(partyDeleteConfirm.id);
      } else {
        await customersAPI.delete(partyDeleteConfirm.id);
      }
      if (selectedPartyId === partyDeleteConfirm.id) setSelectedPartyId('');
      setSnack({ open: true, message: 'Removed', severity: 'success' });
      setPartyDeleteConfirm({ open: false, id: null });
      await fetchParties();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Error', severity: 'error' });
    }
  };

  const openStockArrivalDialog = () => {
    setStockArrivalForm({
      supplierId: selectedPartyId || suppliers[0]?._id || '',
      coilCategory: 'Shiplet Coil',
      weightInKg: '',
      bundles: '',
      ratePerKg: '',
      amountPaid: '',
      paymentMethod: 'Cash',
      purchaseDate: entryDate,
      notes: '',
    });
    setStockArrivalDialogOpen(true);
  };

  const openCoilReturnDialog = () => {
    setCoilReturnForm({
      supplierId: selectedPartyId || suppliers[0]?._id || '',
      coilCategory: 'Shiplet Coil',
      weightInKg: '',
      bundles: '',
      ratePerKg: '',
      purchaseDate: entryDate,
      notes: '',
    });
    setCoilReturnDialogOpen(true);
  };

  const handleSaveCoilReturn = async () => {
    if (!coilReturnForm.supplierId || !coilReturnForm.weightInKg || coilReturnForm.ratePerKg === '') {
      setSnack({ open: true, message: 'Supplier, weight and rate required', severity: 'error' });
      return;
    }
    try {
      const res = await rawMaterialsAPI.createReturn({
        supplierId: coilReturnForm.supplierId,
        coilCategory: coilReturnForm.coilCategory,
        weightInKg: Number(coilReturnForm.weightInKg),
        bundles: Number(coilReturnForm.bundles) || 0,
        ratePerKg: Number(coilReturnForm.ratePerKg),
        purchaseDate: coilReturnForm.purchaseDate || entryDate,
        notes: coilReturnForm.notes || 'Coil return to supplier',
      });
      setSnack({ open: true, message: res.data.message || 'Coil return recorded', severity: 'success' });
      setCoilReturnDialogOpen(false);
      fetchData();
      fetchPartyLedger();
      fetchParties();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Error', severity: 'error' });
    }
  };

  const handleSaveStockArrival = async () => {
    if (!stockArrivalForm.supplierId || !stockArrivalForm.weightInKg || !stockArrivalForm.ratePerKg) {
      setSnack({ open: true, message: 'Supplier, weight and rate required', severity: 'error' });
      return;
    }
    try {
      await rawMaterialsAPI.create({
        ...stockArrivalForm,
        materialType: stockArrivalForm.coilCategory,
        weightInKg: Number(stockArrivalForm.weightInKg),
        bundles: Number(stockArrivalForm.bundles) || 0,
        ratePerKg: Number(stockArrivalForm.ratePerKg),
        amountPaid: stockArrivalForm.amountPaid ? Number(stockArrivalForm.amountPaid) : 0,
        purchaseDate: stockArrivalForm.purchaseDate || entryDate,
      });
      setSnack({ open: true, message: 'Stock arrival recorded in ledger', severity: 'success' });
      setStockArrivalDialogOpen(false);
      fetchData();
      fetchPartyLedger();
      fetchParties();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Error', severity: 'error' });
    }
  };

  const loadAnnealedWireOptions = async (wireNumber) => {
    try {
      const params = { materialType: 'Wire' };
      if (wireNumber) params.wireNumber = wireNumber;
      const [sendRes, soldRes] = await Promise.all([
        annealingAPI.getAll({ ...params, entryType: 'Send' }),
        annealingAPI.getAll({ ...params, entryType: 'Sold' }),
      ]);
      const sold = soldRes.data.data || [];
      const options = (sendRes.data.data || []).map((send) => {
        const used = sold.filter((s) => String(s.sourceSendId) === String(send._id));
        const usedBundles = used.reduce((sum, r) => sum + (r.bundles || 0), 0);
        const usedKg = used.reduce((sum, r) => sum + (r.weightKg || 0), 0);
        const remainingBundles = Math.max(0, (send.bundles || 0) - usedBundles);
        // If bundles are fully sold, treat kg remaining as 0 (gain/loss closed the batch)
        const remainingKg = remainingBundles <= 0
          ? 0
          : Math.max(0, (send.weightKg || 0) - usedKg);
        return { ...send, remainingBundles, remainingKg };
      }).filter((s) => s.remainingBundles > 0);
      setAnnealedWireOptions(options);
    } catch {
      setAnnealedWireOptions([]);
    }
  };

  const openLedgerSaleDialog = () => {
    setLedgerSaleForm({
      customerId: selectedPartyId || ledgerCustomers[0]?._id || '',
      wireNumber: '',
      coilCategory: '',
      wireSize: '',
      initialWeightKg: '',
      bundles: '',
      ratePerKg: '',
      amountPaid: '',
      paymentMethod: 'Cash',
      soldBy: '',
      orderDate: entryDate,
      notes: '',
      isAnnealed: false,
      annealingRecordId: '',
    });
    setAnnealedWireOptions([]);
    setStockPreview(null);
    setLedgerSaleDialogOpen(true);
  };

  const openReturnDialog = () => {
    const list = mainTab === 5 ? processingCustomers : ledgerCustomers;
    setReturnForm({
      customerId: selectedPartyId || list[0]?._id || '',
      wireNumber: '',
      coilCategory: '',
      initialWeightKg: '',
      bundles: '',
      ratePerKg: '',
      orderDate: entryDate,
      notes: '',
    });
    setReturnDialogOpen(true);
  };

  const handleSaveWireReturn = async () => {
    if (!returnForm.customerId || !returnForm.wireNumber || !returnForm.initialWeightKg || returnForm.ratePerKg === '') {
      setSnack({ open: true, message: 'Customer, wire, weight and rate required', severity: 'error' });
      return;
    }
    try {
      const res = await ordersAPI.createReturn({
        customerId: returnForm.customerId,
        wireNumber: Number(returnForm.wireNumber),
        coilCategory: returnForm.coilCategory,
        initialWeightKg: Number(returnForm.initialWeightKg),
        bundles: Number(returnForm.bundles) || 0,
        ratePerKg: Number(returnForm.ratePerKg),
        orderDate: returnForm.orderDate || entryDate,
        notes: returnForm.notes || 'Defect wire return',
      });
      setSnack({ open: true, message: res.data.message || 'Wire return recorded', severity: 'success' });
      setReturnDialogOpen(false);
      fetchData();
      fetchPartyLedger();
      fetchParties();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Error', severity: 'error' });
    }
  };

  const handleSaveLedgerSale = async () => {
    if (!ledgerSaleForm.customerId || !ledgerSaleForm.wireNumber || !ledgerSaleForm.initialWeightKg || !ledgerSaleForm.ratePerKg) {
      setSnack({ open: true, message: 'Customer, wire, weight and rate required', severity: 'error' });
      return;
    }
    try {
      const res = await ordersAPI.create({
        customerId: ledgerSaleForm.customerId,
        wireNumber: Number(ledgerSaleForm.wireNumber),
        coilCategory: ledgerSaleForm.coilCategory,
        wireSize: ledgerSaleForm.wireSize,
        initialWeightKg: Number(ledgerSaleForm.initialWeightKg),
        bundles: Number(ledgerSaleForm.bundles) || 0,
        ratePerKg: Number(ledgerSaleForm.ratePerKg),
        amountPaid: ledgerSaleForm.amountPaid ? Number(ledgerSaleForm.amountPaid) : 0,
        paymentMethod: ledgerSaleForm.paymentMethod,
        soldBy: ledgerSaleForm.soldBy,
        orderDate: ledgerSaleForm.orderDate || entryDate,
        notes: ledgerSaleForm.notes,
        isAnnealed: !!ledgerSaleForm.isAnnealed,
        annealingRecordId: ledgerSaleForm.isAnnealed && ledgerSaleForm.annealingRecordId
          ? ledgerSaleForm.annealingRecordId
          : undefined,
      });
      setSnack({ open: true, message: res.data.message || 'Sale recorded in ledger', severity: 'success' });
      setLedgerSaleDialogOpen(false);
      fetchData();
      fetchPartyLedger();
      fetchParties();
      if (ledgerSaleForm.isAnnealed) fetchAnnealingData();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Error', severity: 'error' });
    }
  };

  const findAnnealingPool = (partyType, partyId, materialType, coilCategory, wireNumber) =>
    annealingPools.find(
      (p) => p.partyType === (partyType || 'None')
        && String(p.partyId || '') === String(partyId || '')
        && p.materialType === (materialType || 'Coil')
        && (materialType === 'Wire'
          ? String(p.wireNumber || '') === String(wireNumber || '')
          : (p.coilCategory || 'Shiplet Coil') === (coilCategory || 'Shiplet Coil'))
    );

  const annealingRecordPoolKey = (row) => {
    const material = row.materialType || 'Coil';
    const coil = material === 'Wire' ? 'wire' : (row.coilCategory || 'Shiplet Coil');
    const wire = material === 'Wire' ? (row.wireNumber || 'any') : '-';
    return `${row.partyType || 'None'}:${row.partyId || 'none'}:${material}:${coil}:${wire}`;
  };

  const openAnnealingPoolManage = async (pool) => {
    setAnnealingPoolDialog({ open: true, pool });
    setAnnealingPoolLoading(true);
    try {
      const params = { materialType: pool.materialType };
      if (pool.partyId) params.partyId = pool.partyId;
      const [res, summaryRes] = await Promise.all([
        annealingAPI.getAll(params),
        annealingAPI.getSummary(pool.partyId ? { partyId: pool.partyId } : {}),
      ]);
      const all = res.data.data || [];
      const freshPool = (summaryRes.data.data || []).find((p) => p.key === pool.key) || pool;
      setAnnealingPoolDialog({ open: true, pool: freshPool });
      setAnnealingPoolEntries(
        all
          .filter((r) => annealingRecordPoolKey(r) === pool.key)
          .sort((a, b) => new Date(b.date) - new Date(a.date))
      );
    } catch {
      setAnnealingPoolEntries([]);
    } finally {
      setAnnealingPoolLoading(false);
    }
  };

  const annealingPartyOptions = (partyType) =>
    partyType === 'Supplier' ? suppliers : partyType === 'Customer' ? customers : [];

  const openAnnealingSendDialog = () => {
    setAnnealingEditId(null);
    setAnnealingEditType(null);
    setAnnealingSendForm({
      ...defaultAnnealingSendForm,
      partyId: selectedPartyId || '',
      date: entryDate,
    });
    setAnnealingSendDialogOpen(true);
  };

  const openAnnealingArrivalDialog = () => {
    setAnnealingEditId(null);
    setAnnealingEditType(null);
    const pending = annealingPools.filter((p) => p.remainingKg > 0 || p.remainingBundles > 0);
    const first = pending[0];
    setAnnealingArrivalForm({
      ...defaultAnnealingArrivalForm,
      poolKey: first?.key || '',
      partyType: first?.partyType || 'Supplier',
      partyId: first?.partyId || selectedPartyId || '',
      materialType: first?.materialType || 'Coil',
      date: entryDate,
    });
    setAnnealingArrivalDialogOpen(true);
  };

  const openAnnealingEdit = (row) => {
    setAnnealingEditId(row._id);
    setAnnealingEditType(row.entryType);
    if (row.entryType === 'Send') {
      setAnnealingSendForm({
        partyType: row.partyType || 'None',
        partyId: row.partyId || '',
        materialType: row.materialType || 'Coil',
        coilCategory: row.coilCategory || 'Shiplet Coil',
        wireNumber: row.wireNumber || '',
        bundles: row.bundles || '',
        weightKg: row.weightKg || '',
        date: row.date ? new Date(row.date).toISOString().slice(0, 10) : entryDate,
        sentBy: row.sentBy || '',
        notes: row.notes || '',
      });
      setAnnealingSendDialogOpen(true);
    } else {
      setAnnealingArrivalForm({
        poolKey: '',
        partyType: row.partyType || 'None',
        partyId: row.partyId || '',
        materialType: row.materialType || 'Coil',
        coilCategory: row.coilCategory || 'Shiplet Coil',
        wireNumber: row.wireNumber || '',
        bundles: row.bundles || '',
        initialWeightKg: row.weightKg || '',
        finalWeightKg: row.finalWeightKg || '',
        date: row.date ? new Date(row.date).toISOString().slice(0, 10) : entryDate,
        receivedBy: row.receivedBy || '',
        notes: row.notes || '',
      });
      setAnnealingArrivalDialogOpen(true);
    }
  };

  const handleSaveAnnealingSend = async () => {
    if (!Number(annealingSendForm.bundles) && !Number(annealingSendForm.weightKg)) {
      setSnack({ open: true, message: 'Enter bundles or weight (at least one)', severity: 'error' });
      return;
    }
    try {
      const payload = {
        partyType: annealingSendForm.partyId ? annealingSendForm.partyType : 'None',
        partyId: annealingSendForm.partyId || undefined,
        materialType: annealingSendForm.materialType,
        coilCategory: annealingSendForm.coilCategory,
        wireNumber: annealingSendForm.materialType === 'Wire' && annealingSendForm.wireNumber
          ? Number(annealingSendForm.wireNumber)
          : undefined,
        bundles: Number(annealingSendForm.bundles) || 0,
        weightKg: Number(annealingSendForm.weightKg) || 0,
        date: annealingSendForm.date || entryDate,
        sentBy: annealingSendForm.sentBy,
        notes: annealingSendForm.notes,
      };
      if (annealingEditId) {
        await annealingAPI.update(annealingEditId, payload);
      } else {
        await annealingAPI.create(payload);
      }
      setSnack({ open: true, message: annealingEditId ? 'Annealing entry updated' : 'Sent for annealing', severity: 'success' });
      setAnnealingSendDialogOpen(false);
      setAnnealingEditId(null);
      await fetchAnnealingData();
      if (annealingPoolDialog.open && annealingPoolDialog.pool) {
        await openAnnealingPoolManage(annealingPoolDialog.pool);
      }
      fetchPartyLedger();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Error', severity: 'error' });
    }
  };

  const handleSaveAnnealingArrival = async () => {
    if (!Number(annealingArrivalForm.finalWeightKg)) {
      setSnack({ open: true, message: 'Final (received) weight required', severity: 'error' });
      return;
    }
    if (!Number(annealingArrivalForm.bundles) && !Number(annealingArrivalForm.initialWeightKg)) {
      if (!arrivalPool || arrivalPool.remainingKg <= 0) {
        setSnack({ open: true, message: 'Enter bundles arrived or initial weight', severity: 'error' });
        return;
      }
    }
    try {
      const payload = {
        partyType: annealingArrivalForm.poolKey === '__mixed__'
          ? 'None'
          : (annealingArrivalForm.partyId ? annealingArrivalForm.partyType : 'None'),
        partyId: annealingArrivalForm.poolKey === '__mixed__'
          ? undefined
          : (annealingArrivalForm.partyId || undefined),
        autoAllocateAcrossParties: annealingArrivalForm.poolKey === '__mixed__',
        materialType: annealingArrivalForm.materialType,
        coilCategory: annealingArrivalForm.coilCategory,
        wireNumber: annealingArrivalForm.materialType === 'Wire' && annealingArrivalForm.wireNumber
          ? Number(annealingArrivalForm.wireNumber)
          : undefined,
        bundles: Number(annealingArrivalForm.bundles) || 0,
        initialWeightKg: Number(annealingArrivalForm.initialWeightKg) || 0,
        finalWeightKg: Number(annealingArrivalForm.finalWeightKg),
        date: annealingArrivalForm.date || entryDate,
        receivedBy: annealingArrivalForm.receivedBy,
        notes: annealingArrivalForm.notes,
      };
      if (annealingEditId) {
        await annealingAPI.update(annealingEditId, {
          ...payload,
          weightKg: payload.initialWeightKg,
        });
      } else {
        await annealingAPI.createArrival(payload);
      }
      setSnack({ open: true, message: annealingEditId ? 'Annealing entry updated' : 'Arrival from annealing recorded', severity: 'success' });
      setAnnealingArrivalDialogOpen(false);
      setAnnealingEditId(null);
      await fetchAnnealingData();
      if (annealingPoolDialog.open && annealingPoolDialog.pool) {
        await openAnnealingPoolManage(annealingPoolDialog.pool);
      }
      fetchPartyLedger();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Error', severity: 'error' });
    }
  };

  const handleDeleteAnnealing = async () => {
    if (!deleteAnnealingConfirm.id) return;
    try {
      await annealingAPI.delete(deleteAnnealingConfirm.id);
      setSnack({ open: true, message: 'Annealing entry deleted', severity: 'success' });
      setDeleteAnnealingConfirm({ open: false, id: null });
      await fetchAnnealingData();
      if (annealingPoolDialog.open && annealingPoolDialog.pool) {
        await openAnnealingPoolManage(annealingPoolDialog.pool);
      }
      fetchPartyLedger();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Error', severity: 'error' });
    }
  };

  const arrivalIsMixed = annealingArrivalForm.poolKey === '__mixed__';
  const mixedArrivalPools = arrivalIsMixed
    ? annealingPools.filter((p) => {
      if (p.materialType !== annealingArrivalForm.materialType) return false;
      if (p.remainingKg <= 0.001 && p.remainingBundles <= 0) return false;
      if (p.materialType === 'Wire') {
        return String(p.wireNumber || '') === String(annealingArrivalForm.wireNumber || '');
      }
      return (p.coilCategory || 'Shiplet Coil') === annealingArrivalForm.coilCategory;
    })
    : [];
  const arrivalPool = arrivalIsMixed
    ? {
      partyName: 'all matching parties',
      materialType: annealingArrivalForm.materialType,
      remainingBundles: mixedArrivalPools.reduce((sum, p) => sum + (p.remainingBundles || 0), 0),
      remainingKg: mixedArrivalPools.reduce((sum, p) => sum + (p.remainingKg || 0), 0),
      get avgKgPerBundle() {
        return this.remainingBundles > 0 ? this.remainingKg / this.remainingBundles : 0;
      },
    }
    : findAnnealingPool(
      annealingArrivalForm.partyId ? annealingArrivalForm.partyType : 'None',
      annealingArrivalForm.partyId,
      annealingArrivalForm.materialType,
      annealingArrivalForm.coilCategory,
      annealingArrivalForm.wireNumber
    );
  const arrivalAutoInitial = Number(annealingArrivalForm.initialWeightKg)
    || (Number(annealingArrivalForm.bundles) && arrivalPool?.avgKgPerBundle
      ? Math.round(Number(annealingArrivalForm.bundles) * arrivalPool.avgKgPerBundle * 1000) / 1000
      : (!Number(annealingArrivalForm.bundles) && arrivalPool?.remainingKg) || 0);
  const annealingWeightChangePreview = arrivalAutoInitial && annealingArrivalForm.finalWeightKg
    ? arrivalAutoInitial - Number(annealingArrivalForm.finalWeightKg)
    : null;

  /* ---------------- Job Work ---------------- */

  const openJobWorkDialog = (row = null) => {
    if (row) {
      setJobWorkEditId(row._id);
      setJobWorkForm({
        customerId: row.customerId?._id || row.customerId,
        coilCategory: row.coilCategory || 'Shiplet Coil',
        arrivedWeightKg: row.arrivedWeightKg || '',
        coilRatePerKg: row.coilRatePerKg || '',
        arrivalDate: row.arrivalDate ? new Date(row.arrivalDate).toISOString().slice(0, 10) : entryDate,
        notes: row.notes || '',
      });
    } else {
      setJobWorkEditId(null);
      setJobWorkForm({
        customerId: selectedPartyId || processingCustomers[0]?._id || '',
        coilCategory: 'Shiplet Coil',
        arrivedWeightKg: '',
        coilRatePerKg: '',
        arrivalDate: entryDate,
        notes: '',
      });
    }
    setJobWorkDialogOpen(true);
  };

  const handleSaveJobWork = async () => {
    if (!jobWorkForm.customerId || !Number(jobWorkForm.arrivedWeightKg)) {
      setSnack({ open: true, message: 'Customer and arrived weight required', severity: 'error' });
      return;
    }
    try {
      const payload = {
        ...jobWorkForm,
        arrivedWeightKg: Number(jobWorkForm.arrivedWeightKg),
        coilRatePerKg: Number(jobWorkForm.coilRatePerKg) || 0,
        arrivalDate: jobWorkForm.arrivalDate || entryDate,
      };
      if (jobWorkEditId) {
        await jobWorkAPI.update(jobWorkEditId, payload);
      } else {
        await jobWorkAPI.create(payload);
      }
      setSnack({ open: true, message: jobWorkEditId ? 'Job work updated' : 'Job work coil arrival recorded', severity: 'success' });
      setJobWorkDialogOpen(false);
      setJobWorkEditId(null);
      fetchJobWorkData();
      fetchPartyLedger();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Error', severity: 'error' });
    }
  };

  const openJobWorkDeliveryDialog = (customerId = null) => {
    const cid = customerId || selectedPartyId || processingCustomers[0]?._id || '';
    setJobWorkDeliveryEdit(null);
    setJobWorkDeliveryForm({
      customerId: cid,
      weightKg: '',
      bundles: '',
      wireNumber: '',
      labourRatePerKg: '',
      deliveredDate: entryDate,
      notes: '',
    });
    setJobWorkDeliveryDialogOpen(true);
  };

  const openJobWorkDeliveryEdit = (jobWork, delivery) => {
    setJobWorkDeliveryEdit({
      jobWorkId: jobWork._id,
      deliveryId: delivery._id,
      originalWeightKg: Number(delivery.weightKg) || 0,
      coilRatePerKg: Number(delivery.coilRatePerKg) || Number(jobWork.coilRatePerKg) || 0,
    });
    setJobWorkDeliveryForm({
      customerId: String(jobWork.customerId?._id || jobWork.customerId),
      weightKg: delivery.weightKg || '',
      bundles: delivery.bundles || '',
      wireNumber: delivery.wireNumber || '',
      labourRatePerKg: delivery.labourRatePerKg || '',
      deliveredDate: delivery.deliveredDate
        ? new Date(delivery.deliveredDate).toISOString().slice(0, 10)
        : entryDate,
      notes: delivery.notes || '',
    });
    setJobWorkDeliveryDialogOpen(true);
  };

  const handleSaveJobWorkDelivery = async () => {
    if (!Number(jobWorkDeliveryForm.weightKg)) {
      setSnack({ open: true, message: 'Delivered weight required', severity: 'error' });
      return;
    }
    if (!jobWorkDeliveryForm.customerId) {
      setSnack({ open: true, message: 'Select a customer', severity: 'error' });
      return;
    }
    if (!Number(jobWorkDeliveryForm.labourRatePerKg) || Number(jobWorkDeliveryForm.labourRatePerKg) <= 0) {
      setSnack({ open: true, message: 'Labour rate per kg required at delivery', severity: 'error' });
      return;
    }
    try {
      const payload = {
        customerId: jobWorkDeliveryForm.customerId,
        weightKg: Number(jobWorkDeliveryForm.weightKg),
        bundles: Number(jobWorkDeliveryForm.bundles) || 0,
        wireNumber: jobWorkDeliveryForm.wireNumber ? Number(jobWorkDeliveryForm.wireNumber) : undefined,
        labourRatePerKg: Number(jobWorkDeliveryForm.labourRatePerKg),
        deliveredDate: jobWorkDeliveryForm.deliveredDate || entryDate,
        notes: jobWorkDeliveryForm.notes,
      };
      const res = jobWorkDeliveryEdit
        ? await jobWorkAPI.updateDelivery(
          jobWorkDeliveryEdit.jobWorkId,
          jobWorkDeliveryEdit.deliveryId,
          payload
        )
        : await jobWorkAPI.poolDeliver(payload);
      setSnack({
        open: true,
        message: res.data.message || (jobWorkDeliveryEdit ? 'Delivery updated' : 'Delivery recorded'),
        severity: 'success',
      });
      setJobWorkDeliveryDialogOpen(false);
      setJobWorkDeliveryEdit(null);
      fetchJobWorkData();
      fetchPartyLedger();
      fetchParties();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Error', severity: 'error' });
    }
  };

  const handleDeleteJobWorkDelivery = async () => {
    const { jobWorkId, deliveryId } = deleteJobWorkDeliveryConfirm;
    if (!jobWorkId || !deliveryId) return;
    try {
      const res = await jobWorkAPI.deleteDelivery(jobWorkId, deliveryId);
      setSnack({
        open: true,
        message: res.data.message || 'Processing delivery deleted',
        severity: 'success',
      });
      setDeleteJobWorkDeliveryConfirm({
        open: false,
        jobWorkId: null,
        deliveryId: null,
      });
      fetchJobWorkData();
      fetchPartyLedger();
      fetchParties();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Error', severity: 'error' });
    }
  };

  const handleDeleteJobWork = async () => {
    if (!deleteJobWorkConfirm.id) return;
    try {
      await jobWorkAPI.delete(deleteJobWorkConfirm.id);
      setSnack({ open: true, message: 'Job work record deleted', severity: 'success' });
      setDeleteJobWorkConfirm({ open: false, id: null });
      fetchJobWorkData();
      fetchPartyLedger();
      fetchParties();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Error', severity: 'error' });
    }
  };

  // Pool delivery: remaining + latest arrival coil rate from full pool (not date-filtered list)
  const deliveryPool = jobWorkPools.find((p) => p.customerId === jobWorkDeliveryForm.customerId);
  const deliveryPoolRemaining = deliveryPool ? Math.max(0, deliveryPool.remainingKg) : 0;
  const deliveryAvailableKg = deliveryPoolRemaining + (jobWorkDeliveryEdit?.originalWeightKg || 0);
  const deliveryIncomingCoilRate = (() => {
    if (jobWorkDeliveryEdit?.coilRatePerKg) return Number(jobWorkDeliveryEdit.coilRatePerKg) || 0;
    if (jobWorkDeliveryEdit?.jobWorkId) {
      const lot = jobWorks.find((j) => j._id === jobWorkDeliveryEdit.jobWorkId);
      if (lot?.coilRatePerKg) return Number(lot.coilRatePerKg) || 0;
    }
    if (!deliveryPool) return 0;
    return Number(deliveryPool.latestCoilRatePerKg || deliveryPool.coilRatePerKg || 0);
  })();
  const deliveryAvgCoilRate = Number(deliveryPool?.avgCoilRatePerKg) || 0;
  const deliveryLabourPreview = Number(jobWorkDeliveryForm.weightKg) > 0 && Number(jobWorkDeliveryForm.labourRatePerKg) > 0
    ? Number(jobWorkDeliveryForm.weightKg) * Number(jobWorkDeliveryForm.labourRatePerKg)
    : 0;
  const deliverySellingPreview = Number(jobWorkDeliveryForm.labourRatePerKg) > 0 && deliveryIncomingCoilRate > 0
    ? deliveryIncomingCoilRate + Number(jobWorkDeliveryForm.labourRatePerKg)
    : 0;

  const selectedParty = parties.find((p) => p._id === selectedPartyId);
  const partyIsLinked = !!(
    selectedParty?.linkedSupplierId || selectedParty?.linkedCustomerId
  );

  const factoryCashOut = cashBook?.expenseTotals?.factoryTotal || 0;
  const selfCashOut = cashBook?.expenseTotals?.selfTotal || 0;
  const otherMoneyOut = cashBook?.transactionsOut || 0;
  const fetchLedgerForDialog = useCallback(
    (params) => {
      const api = partyType === 'Customer' ? customersAPI : suppliersAPI;
      return api.getLedger(selectedPartyId, params);
    },
    [selectedPartyId, partyType]
  );

  const customerOptions = mainTab === 1 ? dailyCustomers : mainTab === 5 ? processingCustomers : mainTab === 2 ? ledgerCustomers : customers;

  return (
    <Box>
      <Tabs
        value={mainTab}
        onChange={(_, v) => { setMainTab(v); setSelectedPartyId(''); }}
        variant="scrollable"
        allowScrollButtonsMobile
        sx={{ mb: 2 }}
      >
        {partyConfig.map((p) => <Tab key={p.label} label={p.label} />)}
      </Tabs>

      <Paper
        elevation={0}
        sx={{
          mb: 2,
          p: { xs: 1.5, sm: 2 },
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          bgcolor: 'background.paper',
        }}
      >
        <Stack
          direction={{ xs: 'column', lg: 'row' }}
          spacing={2}
          alignItems={{ lg: 'center' }}
          justifyContent="space-between"
        >
          <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap alignItems="center" sx={{ flex: 1, minWidth: 0, width: { xs: '100%', lg: 'auto' } }}>
            <DateRangePicker startDate={startDate} endDate={endDate} onStartChange={setStartDate} onEndChange={setEndDate} />
            <TextField
              size={btnSize}
              type="date"
              label="Entry Date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ minWidth: { xs: '100%', sm: 150 } }}
            />
            {mainTab !== 0 && mainTab !== 4 && (
              <Box sx={{ minWidth: { xs: '100%', sm: 240 }, maxWidth: { sm: 320 }, flex: 1 }}>
                <PartySearchSelect
                  options={parties}
                  value={selectedPartyId}
                  onChange={setSelectedPartyId}
                  label={partyType || 'Party'}
                  allowEmpty
                  emptyLabel="All"
                  getOptionLabel={(p) => {
                    if (!p?._id) return 'All';
                    const linked = (p.linkedSupplierId || p.linkedCustomerId) ? '  ↔ linked' : '';
                    return `${p.name}${linked}`;
                  }}
                />
              </Box>
            )}
          </Stack>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            alignItems={{ xs: 'stretch', sm: 'center' }}
            sx={{ width: { xs: '100%', lg: 'auto' }, flexShrink: 0 }}
          >
            <Button
              variant="outlined"
              size={btnSize}
              startIcon={<AssessmentIcon />}
              onClick={() => setReportDialogOpen(true)}
              sx={toolbarBtn}
              fullWidth={isMobile}
            >
              Report
            </Button>
            {mainTab !== 4 && mainTab !== 5 && (
              <Button variant="contained" size={btnSize} startIcon={<AddIcon />} onClick={requireAdmin(handleOpenAdd)} sx={toolbarBtn} fullWidth={isMobile}>
                {mainTab === 1 ? 'Add Daily Sale' : mainTab >= 2 ? 'Add Payment' : 'Add Transaction'}
              </Button>
            )}
            {mainTab === 5 && (
              <Button
                variant="contained"
                color="success"
                size={btnSize}
                startIcon={<AddIcon />}
                onClick={requireAdmin(() => openJobWorkDeliveryDialog(selectedPartyId || null))}
                sx={toolbarBtn}
                fullWidth={isMobile}
              >
                Record Delivery
              </Button>
            )}
          </Stack>
        </Stack>

        <Divider sx={{ my: 1.5 }} />

        {mainTab === 0 && (
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2.5} flexWrap="wrap" useFlexGap>
            <ToolbarSection label="Cash book">
              <Button variant="outlined" size={btnSize} startIcon={<AccountBalanceWalletIcon />} onClick={requireAdmin(openOpeningDialog)} sx={toolbarBtn}>
                Opening Balance
              </Button>
              <Button variant="outlined" size={btnSize} startIcon={<ReceiptLongIcon />} onClick={requireAdmin(openCashBreakdownDialog)} sx={toolbarBtn}>
                Cash Breakdown
              </Button>
              <Tooltip title="Cash or cheque from anyone who is not a customer or supplier — updates cash in hand">
                <Button variant="outlined" size={btnSize} startIcon={<SwapHorizIcon />} onClick={requireAdmin(() => openGeneralCashDialog('Money In'))} sx={toolbarBtn}>
                  Cash / Cheque
                </Button>
              </Tooltip>
            </ToolbarSection>
            <ToolbarSection label="Daily expense totals">
              <Button variant="outlined" size={btnSize} startIcon={<ReceiptLongIcon />} onClick={requireAdmin(() => openExpenseDialog('FactoryExpense'))} sx={toolbarBtn}>
                Factory Total
              </Button>
              <Button
                variant="outlined"
                size={btnSize}
                endIcon={<ArrowDropDownIcon />}
                onClick={(e) => {
                  if (isViewer) { setAccessDenied(true); return; }
                  setSelfExpenseMenuAnchor(e.currentTarget);
                }}
                sx={toolbarBtn}
              >
                Self Expense
              </Button>
              <Menu
                anchorEl={selfExpenseMenuAnchor}
                open={Boolean(selfExpenseMenuAnchor)}
                onClose={() => setSelfExpenseMenuAnchor(null)}
              >
                {SELF_EXPENSE_CATEGORIES.map((cat) => (
                  <MenuItem
                    key={cat}
                    onClick={() => {
                      setSelfExpenseMenuAnchor(null);
                      openExpenseDialog('SelfExpense', cat);
                    }}
                  >
                    {cat.replace(' Expense', '')}
                  </MenuItem>
                ))}
              </Menu>
            </ToolbarSection>
            <ToolbarSection label="Bank (not cash in hand)">
              <Button variant="outlined" size={btnSize} startIcon={<AccountBalanceIcon />} onClick={requireAdmin(openBankTransferDialog)} sx={toolbarBtn}>
                Bank Transfer
              </Button>
              <Button variant="outlined" size={btnSize} startIcon={<LocalAtmIcon />} onClick={requireAdmin(openAtmDialog)} sx={toolbarBtn}>
                ATM Withdrawal
              </Button>
            </ToolbarSection>
          </Stack>
        )}

        {mainTab >= 1 && mainTab !== 4 && (
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2.5} flexWrap="wrap" useFlexGap>
            <ToolbarSection label="Party">
                <Button variant="outlined" size={btnSize} startIcon={<AddIcon />} onClick={requireAdmin(handleOpenAddParty)} sx={toolbarBtn}>
                  Add {getPartyTypeLabel()}
                </Button>
                {selectedPartyId && (
                  <>
                    <Button variant="outlined" size={btnSize} startIcon={<EditIcon />} onClick={requireAdmin(handleOpenEditParty)} sx={toolbarBtn}>
                      Edit
                    </Button>
                    <Button
                      variant="outlined"
                      size={btnSize}
                      color="error"
                      startIcon={<DeleteIcon />}
                      onClick={requireAdmin(() => setPartyDeleteConfirm({ open: true, id: selectedPartyId }))}
                      sx={toolbarBtn}
                    >
                      Drop
                    </Button>
                  </>
                )}
              </ToolbarSection>
            {selectedPartyId && (
              <ToolbarSection label="Ledger">
                <Button
                  variant="outlined"
                  size={btnSize}
                  onClick={() => setLedgerDialogOpen(true)}
                  sx={toolbarBtn}
                >
                  Full Ledger
                </Button>
              </ToolbarSection>
            )}
            {mainTab === 1 && (
              <ToolbarSection label="Other">
                <Button
                  variant="outlined"
                  size={btnSize}
                  onClick={requireAdmin(() => {
                    setGeneralCashMode(false);
                    setEditingId(null);
                    setForm({
                      entryKind: 'General',
                      expenseGroup: 'Operations',
                      expenseCategory: 'Miscellaneous',
                      transactionType: 'Money Out',
                      amount: '',
                      paymentMethod: 'Cash',
                      relatedTo: 'Customer',
                      relatedId: selectedPartyId || dailyCustomers[0]?._id || '',
                      relatedName: '',
                      description: '',
                      handledBy: '',
                    });
                    setDialogOpen(true);
                  })}
                  sx={toolbarBtn}
                >
                  Add Transaction
                </Button>
              </ToolbarSection>
            )}
            {mainTab === 2 && (
              <ToolbarSection label="Sales & returns">
                <Button variant="outlined" size={btnSize} startIcon={<AddIcon />} onClick={requireAdmin(openLedgerSaleDialog)} sx={toolbarBtn}>
                  Add Sale
                </Button>
                <Button variant="outlined" size={btnSize} color="warning" startIcon={<AddIcon />} onClick={requireAdmin(openReturnDialog)} sx={toolbarBtn}>
                  Return Wire
                </Button>
              </ToolbarSection>
            )}
            {mainTab === 3 && (
              <ToolbarSection label="Stock">
                <Button variant="outlined" size={btnSize} startIcon={<AddIcon />} onClick={requireAdmin(openStockArrivalDialog)} sx={toolbarBtn}>
                  Stock Arrival
                </Button>
                <Button variant="outlined" size={btnSize} color="warning" startIcon={<AddIcon />} onClick={requireAdmin(openCoilReturnDialog)} sx={toolbarBtn}>
                  Return Coil
                </Button>
              </ToolbarSection>
            )}
            {mainTab === 5 && (
              <ToolbarSection label="Processing">
                <Button variant="outlined" size={btnSize} startIcon={<AddIcon />} onClick={requireAdmin(() => openJobWorkDialog())} sx={toolbarBtn}>
                  Coil Arrival
                </Button>
                <Button variant="outlined" size={btnSize} color="warning" startIcon={<AddIcon />} onClick={requireAdmin(openReturnDialog)} sx={toolbarBtn}>
                  Return Wire
                </Button>
              </ToolbarSection>
            )}
          </Stack>
        )}

        {mainTab === 4 && (
          <ToolbarSection label="Annealing">
            <Button variant="outlined" size={btnSize} startIcon={<AddIcon />} onClick={requireAdmin(openAnnealingSendDialog)} sx={toolbarBtn}>
              Send for Annealing
            </Button>
            <Button variant="outlined" size={btnSize} startIcon={<AddIcon />} onClick={requireAdmin(openAnnealingArrivalDialog)} sx={toolbarBtn}>
              Arrival from Annealing
            </Button>
          </ToolbarSection>
        )}
      </Paper>

      {mainTab === 0 && cashBook && (
        <Paper
          elevation={0}
          sx={{
            p: 2,
            mb: 2,
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            bgcolor: 'grey.50',
            minWidth: 0,
          }}
        >
          <Typography variant="subtitle1" fontWeight={700} gutterBottom>
            Cash in Hand — {formatDate(entryDate)}
          </Typography>
          <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap alignItems="flex-start" sx={{ minWidth: 0 }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary">Opening Balance</Typography>
              <Typography variant="h6">{formatCurrency(cashBook.openingBalance)}</Typography>
              <Chip
                size="small"
                label={cashBook.openingSource === 'manual' ? 'Manual' : 'From previous day'}
                variant="outlined"
                sx={{ mt: 0.5 }}
              />
            </Box>
            <Typography>+ Money In: <strong>{formatCurrency(cashBook.totalIn)}</strong></Typography>
            <Typography>− Money Out: <strong>{formatCurrency(cashBook.totalOut)}</strong></Typography>
            {((cashBook.bankIn || 0) + (cashBook.bankOut || 0)) > 0 && (
              <Typography variant="caption" color="info.main">
                Bank transfers excluded: +{formatCurrency(cashBook.bankIn || 0)} / −{formatCurrency(cashBook.bankOut || 0)}
              </Typography>
            )}
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: -0.5 }}>
              Includes factory ({formatCurrency(factoryCashOut)}) + self ({formatCurrency(selfCashOut)})
              {otherMoneyOut > 0 ? ` + other (${formatCurrency(otherMoneyOut)})` : ''}
            </Typography>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary">Closing Balance</Typography>
              <Typography variant="h6" color="primary">{formatCurrency(cashBook.closingBalance)}</Typography>
              <Typography variant="caption" color="text.secondary">Carried to next day as opening</Typography>
            </Box>
          </Stack>
          {cashBook.cashBreakdown?.lines?.length > 0 && (
            <Box mt={2} pt={2} borderTop={1} borderColor="divider" sx={{ minWidth: 0 }}>
              <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                Cash Breakdown — who holds cash
              </Typography>
              <Box display="flex" gap={2} flexWrap="wrap" alignItems="flex-start" sx={{ minWidth: 0 }}>
                {cashBook.cashBreakdown.lines.map((line) => (
                  <Box key={line.holder}>
                    <Typography variant="caption" color="text.secondary">{line.holder}</Typography>
                    <Typography variant="h6">{formatCurrency(line.amount)}</Typography>
                  </Box>
                ))}
                <Box>
                  <Typography variant="caption" color="text.secondary">Breakdown Total</Typography>
                  <Typography variant="h6" fontWeight={700}>{formatCurrency(cashBook.cashBreakdown.total)}</Typography>
                  {Math.abs((cashBook.cashBreakdown.total || 0) - (cashBook.closingBalance || 0)) > 0.01 && (
                    <Typography variant="caption" color="warning.main" display="block">
                      Diff vs closing: {formatCurrency(cashBook.closingBalance - cashBook.cashBreakdown.total)}
                    </Typography>
                  )}
                </Box>
              </Box>
              {cashBook.cashBreakdown.note && (
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                  Note: {cashBook.cashBreakdown.note}
                </Typography>
              )}
            </Box>
          )}
          {cashBook.expenseTotals && (
            <Box mt={2} pt={2} borderTop={1} borderColor="divider" sx={{ minWidth: 0 }}>
              <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                Money Out — Expense Breakdown for {formatDate(entryDate)}
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                Only these day totals count as Money Out — individual expenses stay in the Expenses section.
              </Typography>
              <Box display="flex" gap={3} flexWrap="wrap" sx={{ minWidth: 0 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">Factory Expense Total</Typography>
                  <Typography variant="h6">{formatCurrency(factoryCashOut)}</Typography>
                  {cashBook.expenseTotals.factoryFromDetails > 0 && (
                    <Typography variant="caption" color="text.secondary">
                      Classified entries: {formatCurrency(cashBook.expenseTotals.factoryFromDetails)}
                    </Typography>
                  )}
                  {cashBook.expenseTotals.factoryDailyTotal > 0 && (
                    <Typography variant="caption" color="text.secondary" display="block">
                      Daily book entry: {formatCurrency(cashBook.expenseTotals.factoryDailyTotal)}
                    </Typography>
                  )}
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Self — Fayyaz</Typography>
                  <Typography variant="h6">{formatCurrency(cashBook.expenseTotals.fayyaz)}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Self — Faisal</Typography>
                  <Typography variant="h6">{formatCurrency(cashBook.expenseTotals.faisal)}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Self — Mutual</Typography>
                  <Typography variant="h6">{formatCurrency(cashBook.expenseTotals.mutual)}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Self Total</Typography>
                  <Typography variant="h6">{formatCurrency(selfCashOut)}</Typography>
                </Box>
                {otherMoneyOut > 0 && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">Other Money Out</Typography>
                    <Typography variant="h6">{formatCurrency(otherMoneyOut)}</Typography>
                    <Typography variant="caption" color="text.secondary">Supplier payments, etc.</Typography>
                  </Box>
                )}
              </Box>
            </Box>
          )}
        </Paper>
      )}

      {mainTab === 0 && bankBook && (
        <Paper sx={{ p: 2, mb: 2, borderLeft: 4, borderColor: 'info.main', minWidth: 0 }}>
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={1} flexWrap="wrap" gap={1} sx={{ minWidth: 0 }}>
            <Typography variant="subtitle1" fontWeight={600}>Bank Account Balance</Typography>
            <Chip
              label={`Net: ${formatCurrency(bankBook.closingBalance)}`}
              color={bankBook.closingBalance >= 0 ? 'info' : 'error'}
              variant="outlined"
            />
          </Box>
          <Box display="flex" gap={3} flexWrap="wrap" mb={2} sx={{ minWidth: 0 }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary">Opening (before period)</Typography>
              <Typography variant="h6">{formatCurrency(bankBook.openingBalance)}</Typography>
            </Box>
            <Typography>+ Received: <strong>{formatCurrency(bankBook.totalIn)}</strong></Typography>
            <Typography>− Sent: <strong>{formatCurrency(bankBook.totalOut)}</strong></Typography>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary">Closing Balance</Typography>
              <Typography variant="h6" color="info.main">{formatCurrency(bankBook.closingBalance)}</Typography>
            </Box>
          </Box>
          {bankBook.transactions.length > 0 && (
            <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'action.hover' }}>
                  <TableCell>Date</TableCell>
                  <TableCell>Bank Account</TableCell>
                  <TableCell>Person / Party</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell align="right" sx={{ color: 'success.main' }}>In (+)</TableCell>
                  <TableCell align="right" sx={{ color: 'error.main' }}>Out (−)</TableCell>
                  <TableCell align="right">Balance</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {bankBook.transactions.map((t) => (
                  <TableRow key={t._id} hover>
                    <TableCell>{formatDate(t.date)}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={t.bankAccount === 'Other' ? (t.bankAccountOtherName || 'Other') : (t.bankAccount || 'MBL')}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>{t.relatedName || t.relatedTo || '—'}</TableCell>
                    <TableCell>{t.description || '—'}</TableCell>
                    <TableCell align="right" sx={{ color: 'success.main' }}>
                      {t.transactionType === 'Money In' ? formatCurrency(t.amount) : ''}
                    </TableCell>
                    <TableCell align="right" sx={{ color: 'error.main' }}>
                      {t.transactionType === 'Money Out' ? formatCurrency(t.amount) : ''}
                    </TableCell>
                    <TableCell align="right"><strong>{formatCurrency(t.balance)}</strong></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </TableContainer>
          )}
          {bankBook.transactions.length === 0 && (
            <Typography variant="body2" color="text.secondary">No bank transfers in this period.</Typography>
          )}
        </Paper>
      )}

      {mainTab === 0 && startDate && endDate && cashBookRange.length > 0 && (
        <TableContainer component={Paper} sx={{ mb: 2, overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell align="right">Opening</TableCell>
                <TableCell align="right">Money In</TableCell>
                <TableCell align="right">Money Out</TableCell>
                <TableCell align="right">Closing</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {cashBookRange.map((row) => (
                <TableRow key={row.date}>
                  <TableCell>{formatDate(row.date)}</TableCell>
                  <TableCell align="right">{formatCurrency(row.openingBalance)}</TableCell>
                  <TableCell align="right">{formatCurrency(row.totalIn)}</TableCell>
                  <TableCell align="right">{formatCurrency(row.totalOut)}</TableCell>
                  <TableCell align="right"><strong>{formatCurrency(row.closingBalance)}</strong></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {selectedParty && partyLedger && mainTab >= 1 && mainTab !== 4 && (
        <Box display="flex" gap={2} mb={2} flexWrap="wrap" sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1, minWidth: 0 }}>
          <Typography fontWeight={600}>{selectedParty.name}</Typography>
          <Typography>Credit: <strong>{formatCurrency(partyLedger.summary?.totalCredit ?? partyLedger.summary?.totalPurchased ?? 0)}</strong></Typography>
          <Typography>Debit: <strong>{formatCurrency(partyLedger.summary?.totalDebit ?? 0)}</strong></Typography>
          <Typography>
            Net Balance: <strong>{formatCurrency(Math.abs(partyLedger.summary?.balance ?? 0))}</strong>
            {(partyLedger.summary?.balance ?? 0) > 0 ? ' — They owe us' : (partyLedger.summary?.balance ?? 0) < 0 ? ' — We owe them' : ' — Settled'}
          </Typography>
          <Typography>
            Due: <strong>{formatCurrency(Math.max(0, mainTab === 3 ? -(partyLedger.summary?.balance ?? 0) : (partyLedger.summary?.balance ?? 0)))}</strong>
            {Math.abs(partyLedger.summary?.balance ?? 0) < 0.01 ? ' — Settled' : ''}
          </Typography>
        </Box>
      )}

      {loading ? (
        <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
      ) : mainTab === 4 || mainTab === 5 ? null : selectedPartyId && partyLedger ? (
        <>
          <Box display="flex" justifyContent="flex-end" gap={1} mb={1}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<TableChartIcon />}
              onClick={() => exportLedgerExcel(partyLedger, {
                title: selectedParty?.name,
                partyType: mainTab === 3 ? 'Supplier' : 'Customer',
              })}
            >
              Export Excel
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<PictureAsPdfIcon />}
              onClick={() => exportLedgerPdf(partyLedger, {
                title: selectedParty?.name,
                partyType: mainTab === 3 ? 'Supplier' : 'Customer',
              })}
            >
              Export PDF
            </Button>
          </Box>
        <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ tableLayout: 'fixed', minWidth: { xs: 700, sm: 1020 }, '& td, & th': { py: 0.5, px: 1, fontSize: '0.8rem', verticalAlign: 'top' } }}>
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.100' }}>
                <TableCell sx={{ width: 96, fontWeight: 700 }}>Date</TableCell>
                <TableCell sx={{ width: '24%', fontWeight: 700 }}>Description</TableCell>
                <TableCell sx={{ width: 110, fontWeight: 700 }}>Source</TableCell>
                <TableCell sx={{ width: 110, fontWeight: 700 }}>Payment</TableCell>
                <TableCell sx={{ width: 72, fontWeight: 700 }} align="right">Wt</TableCell>
                <TableCell sx={{ width: 88, fontWeight: 700 }} align="right">Rate</TableCell>
                <TableCell sx={{ width: 100, fontWeight: 700 }} align="right">Credit</TableCell>
                <TableCell sx={{ width: 100, fontWeight: 700 }} align="right">Debit</TableCell>
                <TableCell sx={{ width: 150, fontWeight: 700 }} align="right">Balance</TableCell>
                <TableCell sx={{ width: 140, fontWeight: 700 }} align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(partyLedger.entries || []).map((row, i) => {
                const canEditTxn = row.source === 'Daily Book' && !!row.sourceId;
                return (
                <TableRow key={i} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(row.date)}</TableCell>
                  <TableCell sx={{ whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{row.description}</TableCell>
                  <TableCell sx={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{row.source}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{row.paymentMethod || '—'}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{row.weightKg ? Number(row.weightKg).toFixed(1) : '—'}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{row.ratePerKg ? formatCurrency(row.ratePerKg) : '—'}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap', color: row.credit ? 'success.main' : undefined }}>{row.credit ? formatCurrency(row.credit) : '—'}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap', color: row.debit ? 'error.main' : undefined }}>{row.debit ? formatCurrency(row.debit) : '—'}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {formatCurrency(Math.abs(row.balance))}
                    <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5, display: 'block', fontWeight: 400 }}>
                      {row.balance > 0 ? 'They owe us' : row.balance < 0 ? 'We owe them' : ''}
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    {canEditTxn ? (
                      <>
                        <Button size="small" startIcon={<EditIcon />} onClick={requireAdmin(() => openEditLedgerEntry(row))} sx={{ mr: 0.5 }}>Edit</Button>
                        <Button size="small" color="error" startIcon={<DeleteIcon />} onClick={requireAdmin(() => setDeleteConfirm({ open: true, id: row.sourceId }))}>Delete</Button>
                      </>
                    ) : (row.source === 'Sale' || row.source === 'Order') && !!row.sourceId ? (
                      <>
                        <Button size="small" startIcon={<EditIcon />} onClick={requireAdmin(() => openEditDailySale(row))} sx={{ mr: 0.5 }}>Edit</Button>
                        <Button size="small" color="error" startIcon={<DeleteIcon />} onClick={requireAdmin(() => setDeleteOrderConfirm({ open: true, id: row.sourceId }))}>Delete</Button>
                      </>
                    ) : '—'}
                  </TableCell>
                </TableRow>
                );
              })}
              {(partyLedger.entries || []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={10}>
                    <Typography variant="body2" color="text.secondary">
                      No activity for selected dates — current due: {formatCurrency(selectedParty?.totalAmountDue || 0)}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        </>
      ) : mainTab === 1 ? (
        <>
        <TableContainer component={Paper} sx={{ mb: 2, overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Customer</TableCell>
                <TableCell>Wire</TableCell>
                <TableCell align="right">Weight (kg)</TableCell>
                <TableCell align="right">Bundles</TableCell>
                <TableCell align="right">Rate/kg</TableCell>
                <TableCell align="right">Total</TableCell>
                <TableCell align="right">Paid</TableCell>
                <TableCell align="right">Due</TableCell>
                <TableCell>Payment</TableCell>
                <TableCell>Sold By</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {dailyOrders.map((row) => (
                <TableRow key={row._id}>
                  <TableCell>{formatDate(row.orderDate)}</TableCell>
                  <TableCell>{row.customerName || row.customerId?.name}</TableCell>
                  <TableCell>{row.wireType} {row.wireSize ? `(${row.wireSize})` : ''}{row.isAnnealed ? ' · annealed' : ''}{row.isReturn ? ' · RETURN' : ''}</TableCell>
                  <TableCell align="right">{row.finalWeightKg ?? row.initialWeightKg}</TableCell>
                  <TableCell align="right">{row.bundles || '—'}</TableCell>
                  <TableCell align="right">{formatCurrency(row.ratePerKg)}</TableCell>
                  <TableCell align="right">{formatCurrency(row.totalAmount)}</TableCell>
                  <TableCell align="right">{formatCurrency(row.amountPaid ?? 0)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: row.amountDue > 0 ? 600 : 400, color: row.amountDue > 0 ? 'error.main' : 'text.secondary' }}>
                    {formatCurrency(row.amountDue ?? 0)}
                  </TableCell>
                  <TableCell>{row.paymentMethod}</TableCell>
                  <TableCell>{row.soldBy}</TableCell>
                  <TableCell align="right">
                    {(
                      <>
                        <Button size="small" startIcon={<EditIcon />} onClick={requireAdmin(() => openEditDailySale(row))} sx={{ mr: 0.5 }}>Edit</Button>
                        <Button size="small" color="error" startIcon={<DeleteIcon />} onClick={requireAdmin(() => setDeleteOrderConfirm({ open: true, id: row._id }))}>Delete</Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {dailyOrders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={12}>
                    <Typography variant="body2" color="text.secondary">No daily sales for selected date range.</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        {list.length > 0 && (
          <>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Other Transactions (refunds / adjustments)</Typography>
        <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Type</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell>Payment</TableCell>
                <TableCell>Description</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {list.map((row) => (
                <TableRow key={row._id}>
                  <TableCell>{formatDate(row.transactionDate)}</TableCell>
                      <TableCell>
                        <Chip size="small" label={row.transactionType} color={row.transactionType === 'Money In' ? 'success' : 'error'} variant="outlined" />
                      </TableCell>
                  <TableCell align="right">{formatCurrency(row.amount)}</TableCell>
                  <TableCell>{row.paymentMethod}</TableCell>
                  <TableCell>{row.description}</TableCell>
                  <TableCell align="right">
                    {(
                      <>
                        <Button size="small" startIcon={<EditIcon />} onClick={requireAdmin(() => openEditTransaction(row))} sx={{ mr: 0.5 }}>Edit</Button>
                        <Button size="small" color="error" startIcon={<DeleteIcon />} onClick={requireAdmin(() => setDeleteConfirm({ open: true, id: row._id }))}>Delete</Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
          </>
        )}
        </>
      ) : mainTab >= 2 && !selectedPartyId ? (
        <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{partyType}</TableCell>
                <TableCell align="right">Total Purchased</TableCell>
                <TableCell align="right">Total Paid</TableCell>
                <TableCell align="right">Due</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {parties.map((p) => (
                <TableRow key={p._id} hover sx={{ cursor: 'pointer' }} onClick={() => setSelectedPartyId(p._id)}>
                  <TableCell>{p.name}</TableCell>
                  <TableCell align="right">{formatCurrency(p.totalAmountPurchased)}</TableCell>
                  <TableCell align="right">{formatCurrency(p.totalAmountPaid)}</TableCell>
                  <TableCell align="right">
                    <strong>{formatCurrency(p.totalAmountDue)}</strong>
                    {p.totalAmountDue > 0
                      ? (mainTab === 3 ? ' — We owe them' : ' — They owe us')
                      : ' — Settled'}
                  </TableCell>
                </TableRow>
              ))}
              {parties.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4}>
                    <Typography variant="body2" color="text.secondary">No {partyType.toLowerCase()}s added yet.</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Type</TableCell>
                <TableCell align="right">Amount</TableCell>
                {mainTab === 0 && <TableCell>Source</TableCell>}
                <TableCell>Payment</TableCell>
                {mainTab === 0 && <TableCell>Related To</TableCell>}
                <TableCell>Description</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {list.map((row) => {
                const isIn = row.transactionType === 'Money In';
                const isBankTransfer = row.paymentMethod === 'Bank Transfer';
                const isReadOnlyRow = mainTab === 0 && row.sourceType === 'Expense' && !isDailyBookExpenseRow(row);
                return (
                  <TableRow key={row._id} sx={isBankTransfer ? { bgcolor: 'info.50', opacity: 0.9 } : undefined}>
                    <TableCell>{formatDate(row.transactionDate)}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={row.transactionType}
                        color={isIn ? 'success' : 'error'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="right">{formatCurrency(row.amount)}</TableCell>
                    {mainTab === 0 && <TableCell>{getSourceLabel(row)}</TableCell>}
                    <TableCell>
                      {isBankTransfer
                        ? (
                          <>
                            <Chip size="small" label="Bank Transfer" color="info" variant="outlined" />
                            {row.expenseCategory && (
                              <Chip size="small" label={`Expense: ${row.expenseCategory}`} color="warning" variant="outlined" sx={{ ml: 0.5 }} />
                            )}
                          </>
                        )
                        : row.paymentMethod}
                    </TableCell>
                    {mainTab === 0 && <TableCell>
                      {row.paymentMethod === 'Bank Transfer'
                        ? (
                          <>
                            <Box component="span">{row.relatedName || row.relatedTo || '—'}</Box>
                            <Typography variant="caption" display="block" color="text.secondary">
                              {(row.bankAccount === 'Other' ? (row.bankAccountOtherName || 'Other') : (row.bankAccount || 'MBL'))}
                              {row.bankAccountNumber ? ` · ${row.bankAccountNumber}` : ''}
                            </Typography>
                          </>
                        )
                        : (row.relatedName || row.relatedTo || '—')}
                    </TableCell>}
                    <TableCell>{row.description}</TableCell>
                    <TableCell align="right">
                      {!isReadOnlyRow && (
                        <>
                          <Button size="small" startIcon={<EditIcon />} onClick={requireAdmin(() => openEditTransaction(row))} sx={{ mr: 0.5 }}>Edit</Button>
                          <Button size="small" color="error" startIcon={<DeleteIcon />} onClick={requireAdmin(() => setDeleteConfirm({ open: true, id: row._id }))}>Delete</Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {list.length === 0 && (
                <TableRow>
                  <TableCell colSpan={mainTab === 0 ? 7 : 5}>
                    <Typography variant="body2" color="text.secondary">No transactions for selected date range.</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {mainTab === 4 && (
        <Box sx={{ mt: 2 }}>
          {annealingPools.filter((p) => p.remainingKg > 0.001 || p.remainingBundles > 0).length > 0 && (
            <Paper sx={{ p: 1.5, mb: 1, bgcolor: 'action.hover' }}>
              <Typography variant="subtitle2" fontWeight={600} gutterBottom>Pending at annealing</Typography>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                Click a chip to edit or delete the send/arrival entries for that pool.
              </Typography>
              <Box display="flex" gap={1} flexWrap="wrap">
                {annealingPools
                  .filter((p) => p.remainingKg > 0.001 || p.remainingBundles > 0)
                  .map((p) => (
                    <Chip
                      key={p.key}
                      color="warning"
                      variant="outlined"
                      onClick={requireAdmin(() => openAnnealingPoolManage(p))}
                      onDelete={requireAdmin(() => openAnnealingPoolManage(p))}
                      deleteIcon={<EditIcon />}
                      label={`${p.partyName || 'Own stock'} — ${p.materialType}${p.coilCategory ? ` ${p.coilCategory}` : ''}${p.wireNumber ? ` #${p.wireNumber}` : ''}: ${p.remainingBundles > 0 ? `${p.remainingBundles} bundles / ` : ''}${p.remainingKg.toFixed(2)} kg pending`}
                      sx={{ cursor: 'pointer' }}
                    />
                  ))}
              </Box>
            </Paper>
          )}
          <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
            <Typography variant="subtitle2" fontWeight={600} sx={{ p: 2, pb: 0 }}>
              Annealing — Sent &amp; Arrived (all parties)
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Party</TableCell>
                  <TableCell>Material</TableCell>
                  <TableCell>Entry</TableCell>
                  <TableCell align="right">Bundles</TableCell>
                  <TableCell align="right">Initial (kg)</TableCell>
                  <TableCell align="right">Final (kg)</TableCell>
                  <TableCell align="right">Loss (kg)</TableCell>
                  <TableCell>Notes</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {annealingRecords.map((row) => (
                  <TableRow key={row._id}>
                    <TableCell>{formatDate(row.date)}</TableCell>
                    <TableCell>{row.partyName || 'Own stock'}</TableCell>
                    <TableCell>{row.materialType === 'Wire' ? (row.wireNumber ? `Wire #${row.wireNumber}` : 'Wire') : row.coilCategory || 'Coil'}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={row.entryType === 'Send' ? 'Sent' : row.entryType === 'Sold' ? 'Sold' : 'Arrived'}
                        color={row.entryType === 'Send' ? 'warning' : row.entryType === 'Sold' ? 'info' : 'success'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="right">{row.bundles > 0 ? row.bundles : '—'}</TableCell>
                    <TableCell align="right">
                      {(row.weightKg || 0).toFixed(2)}
                      {row.weightEstimated ? ' (auto)' : ''}
                    </TableCell>
                    <TableCell align="right">{row.entryType === 'Arrival' ? (row.finalWeightKg || 0).toFixed(2) : '—'}</TableCell>
                    <TableCell align="right">{row.entryType === 'Arrival' ? (row.weightLossKg || 0).toFixed(2) : '—'}</TableCell>
                    <TableCell>{row.notes || '—'}</TableCell>
                    <TableCell align="right">
                      {(
                        <>
                          <Button size="small" startIcon={<EditIcon />} onClick={requireAdmin(() => openAnnealingEdit(row))} sx={{ mr: 0.5 }}>Edit</Button>
                          <Button size="small" color="error" startIcon={<DeleteIcon />} onClick={requireAdmin(() => setDeleteAnnealingConfirm({ open: true, id: row._id }))}>Delete</Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {annealingRecords.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10}>
                      <Typography variant="body2" color="text.secondary">No annealing entries for selected dates.</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {mainTab === 5 && (
        <Box sx={{ mt: 2 }}>
          {jobWorkStock && (
            <Paper sx={{ p: 2, mb: 2, bgcolor: 'action.hover' }}>
              <Typography variant="subtitle2" fontWeight={600} gutterBottom>Stock Overview</Typography>
              <Box display="flex" gap={4} flexWrap="wrap" sx={{ minWidth: 0 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">Job Work Stock (customer coil)</Typography>
                  <Typography variant="h6">{jobWorkStock.jobWorkStockKg.toFixed(2)} kg</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Main Stock (own)</Typography>
                  <Typography variant="h6">{jobWorkStock.mainStockKg.toFixed(2)} kg</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Total Stock</Typography>
                  <Typography variant="h6" color="primary">{jobWorkStock.totalStockKg.toFixed(2)} kg</Typography>
                </Box>
              </Box>
            </Paper>
          )}
          {jobWorkPools.length > 0 && (
            <Paper sx={{ p: 2, mb: 2 }}>
              <Typography variant="subtitle2" fontWeight={600} gutterBottom>Customer Coil Pool — Remaining Stock</Typography>
              <Box display="flex" gap={1} flexWrap="wrap">
                {jobWorkPools.map((pool) => (
                  <Chip
                    key={pool.customerId}
                    label={`${pool.customerName}: ${pool.remainingKg.toFixed(1)} kg remaining`}
                    color={pool.remainingKg > 0 ? 'primary' : 'default'}
                    variant={pool.remainingKg > 0 ? 'filled' : 'outlined'}
                    onClick={requireAdmin(() => openJobWorkDeliveryDialog(pool.customerId))}
                    sx={{ cursor: pool.remainingKg > 0 ? 'pointer' : 'default' }}
                  />
                ))}
              </Box>
            </Paper>
          )}
          <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
            <Typography variant="subtitle2" fontWeight={600} sx={{ p: 2, pb: 0 }}>
              Processing Work — Customer Coil to Wire {selectedParty ? `(${selectedParty.name})` : '(all customers)'}
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Arrival Date</TableCell>
                  <TableCell>Customer</TableCell>
                  <TableCell>Coil</TableCell>
                  <TableCell align="right">Arrived (kg)</TableCell>
                  <TableCell align="right">Coil Rate</TableCell>
                  <TableCell align="right">Delivered (kg)</TableCell>
                  <TableCell align="right">In Stock (kg)</TableCell>
                  <TableCell align="right">Labour Charged</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(() => {
                  const deliveriesByLot = buildJobWorkDeliveryDisplayByLot(jobWorks);
                  return jobWorks.map((row) => {
                  const remaining = Math.max(0, (row.arrivedWeightKg || 0) - (row.deliveredWeightKg || 0));
                  const statusColor = row.status === 'Delivered' ? 'success' : row.status === 'Partially Delivered' ? 'info' : 'warning';
                  const displayDeliveries = deliveriesByLot.get(String(row._id)) || [];
                  return (
                    <React.Fragment key={row._id}>
                      <TableRow>
                        <TableCell>{formatDate(row.arrivalDate)}</TableCell>
                        <TableCell>{row.customerName}</TableCell>
                        <TableCell>{row.coilCategory}</TableCell>
                        <TableCell align="right">{(row.arrivedWeightKg || 0).toFixed(2)}</TableCell>
                        <TableCell align="right">{row.coilRatePerKg ? formatCurrency(row.coilRatePerKg) : '—'}</TableCell>
                        <TableCell align="right">{(row.deliveredWeightKg || 0).toFixed(2)}</TableCell>
                        <TableCell align="right">{remaining.toFixed(2)}</TableCell>
                        <TableCell align="right">{formatCurrency(row.labourTotal || 0)}</TableCell>
                        <TableCell>
                          <Chip size="small" label={row.status} color={statusColor} variant="outlined" />
                        </TableCell>
                        <TableCell align="right">
                          {(
                            <>
                              <Button size="small" startIcon={<EditIcon />} onClick={requireAdmin(() => openJobWorkDialog(row))} sx={{ mr: 0.5 }}>Edit</Button>
                              <Button size="small" color="error" startIcon={<DeleteIcon />} onClick={requireAdmin(() => setDeleteJobWorkConfirm({ open: true, id: row._id }))}>Delete</Button>
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                      {displayDeliveries.map((d, idx) => (
                        <TableRow key={d._id || `${row._id}-del-${idx}`} sx={{ bgcolor: 'action.hover' }}>
                          <TableCell colSpan={3} sx={{ pl: 4, fontSize: '0.85rem', color: 'text.secondary' }}>
                            ↳ Delivery {idx + 1} — {formatDate(d.deliveredDate)}
                            {d.wireNumber ? ` · Wire #${d.wireNumber}` : ''}
                            {d.displayBundles ? ` · ${d.displayBundles} bundles` : ''}
                            {d.labourRatePerKg ? ` @ labour ${formatCurrency(d.labourRatePerKg)}/kg` : ''}
                            {d.splitAcrossLots ? ` · from ${d.groupPartCount} arrivals` : ''}
                          </TableCell>
                          <TableCell colSpan={2} sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>
                            {(d.coilRatePerKg || row.coilRatePerKg)
                              ? `Arrival ${formatCurrency(d.coilRatePerKg || row.coilRatePerKg)}/kg`
                              : ''}
                            {d.sellingRatePerKg ? ` · Selling ${formatCurrency(d.sellingRatePerKg)}/kg` : ''}
                          </TableCell>
                          <TableCell align="right" sx={{ fontSize: '0.85rem' }}>{(d.displayWeightKg || 0).toFixed(2)}</TableCell>
                          <TableCell />
                          <TableCell align="right" sx={{ fontSize: '0.85rem' }}>{formatCurrency(d.displayLabourAmount || 0)}</TableCell>
                          <TableCell colSpan={2}>
                            <Box display="flex" alignItems="center" justifyContent="flex-end" gap={0.5}>
                              {d.notes && (
                                <Typography variant="caption" sx={{ mr: 'auto' }}>{d.notes}</Typography>
                              )}
                              {(
                                <>
                                  <Button
                                    size="small"
                                    startIcon={<EditIcon />}
                                    onClick={requireAdmin(() => openJobWorkDeliveryEdit(row, d))}
                                  >
                                    Edit
                                  </Button>
                                  <Button
                                    size="small"
                                    color="error"
                                    startIcon={<DeleteIcon />}
                                    onClick={requireAdmin(() => setDeleteJobWorkDeliveryConfirm({
                                      open: true,
                                      jobWorkId: row._id,
                                      deliveryId: d._id,
                                    }))}
                                  >
                                    Delete
                                  </Button>
                                </>
                              )}
                            </Box>
                          </TableCell>
                        </TableRow>
                      ))}
                    </React.Fragment>
                  );
                  });
                })()}
                {jobWorks.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={12}>
                      <Typography variant="body2" color="text.secondary">No processing work records for selected dates.</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      <ResponsiveDialog open={dailySaleDialogOpen} onClose={() => setDailySaleDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingDailySaleId ? 'Edit Daily Sale' : 'Add Daily Sale'}</DialogTitle>
        <DialogContent sx={{ overflowY: 'auto' }}>
          <FormControl fullWidth margin="dense" required>
            <PartySearchSelect
              options={dailyCustomers}
              value={dailySaleForm.customerId}
              onChange={(id) => setDailySaleForm((f) => ({ ...f, customerId: id }))}
              label="Customer"
              required
              getOptionLabel={customerSearchLabel}
            />
          </FormControl>
          <FormControl fullWidth margin="dense" required>
            <InputLabel>Wire Number</InputLabel>
            <Select
              value={dailySaleForm.wireNumber}
              onChange={(e) => setDailySaleForm((f) => ({
                ...f,
                wireNumber: e.target.value,
                coilCategory: defaultCoilCategoryForWire(e.target.value),
              }))}
              label="Wire Number"
            >
              {wires.map((w) => (
                <MenuItem key={w.number} value={w.number}>{w.name} — {w.coilCategory}</MenuItem>
              ))}
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
              value={dailySaleForm.coilCategory}
              onChange={(e) => setDailySaleForm((f) => ({ ...f, coilCategory: e.target.value }))}
              label="Coil Category"
            >
              <MenuItem value="Shiplet Coil">Shiplet Coil</MenuItem>
              <MenuItem value="Patri Coil">Patri Coil</MenuItem>
            </Select>
          </FormControl>
          {stockPreview && (
            <Alert severity={stockPreview.lowStock ? 'warning' : 'success'} sx={{ mt: 1 }}>
              {stockPreview.coilCategory}: {stockPreview.availableKg} kg available
              {stockPreview.shortfallKg > 0 && ` — ${stockPreview.shortfallKg} kg short (sale still allowed)`}
            </Alert>
          )}
          <TextField fullWidth label="Wire Size (optional)" value={dailySaleForm.wireSize} onChange={(e) => setDailySaleForm((f) => ({ ...f, wireSize: e.target.value }))} margin="dense" />
          <TextField fullWidth type="number" label="Initial Weight (kg)" value={dailySaleForm.initialWeightKg} onChange={(e) => setDailySaleForm((f) => ({ ...f, initialWeightKg: e.target.value }))} margin="dense" required />
          <TextField fullWidth type="number" label="Bundles" value={dailySaleForm.bundles} onChange={(e) => setDailySaleForm((f) => ({ ...f, bundles: e.target.value }))} margin="dense" helperText="Wire bundles (lighter than coil bundles)" />
          <TextField fullWidth type="number" label="Rate per kg" value={dailySaleForm.ratePerKg} onChange={(e) => setDailySaleForm((f) => ({ ...f, ratePerKg: e.target.value }))} margin="dense" required />
          <FormControlLabel
            control={(
              <Checkbox
                checked={!!dailySaleForm.isAnnealed}
                onChange={(e) => {
                  const on = e.target.checked;
                  setDailySaleForm((f) => ({ ...f, isAnnealed: on, annealingRecordId: '' }));
                  if (on) loadAnnealedWireOptions(dailySaleForm.wireNumber);
                  else setAnnealedWireOptions([]);
                }}
              />
            )}
            label="Wire is annealed (optional link)"
          />
          {dailySaleForm.isAnnealed && (
            <FormControl fullWidth margin="dense">
              <InputLabel>Annealing send batch</InputLabel>
              <Select
                value={dailySaleForm.annealingRecordId}
                label="Annealing send batch"
                onChange={(e) => {
                  const id = e.target.value;
                  const batch = annealedWireOptions.find((r) => r._id === id);
                  setDailySaleForm((f) => ({
                    ...f,
                    annealingRecordId: id,
                    bundles: f.bundles || (batch?.remainingBundles ? String(batch.remainingBundles) : f.bundles),
                    initialWeightKg: f.initialWeightKg || (batch?.remainingKg ? String(batch.remainingKg) : f.initialWeightKg),
                  }));
                }}
              >
                <MenuItem value="">Auto — any annealing batch (FIFO)</MenuItem>
                {annealedWireOptions.map((r) => (
                  <MenuItem key={r._id} value={r._id}>
                    Wire #{r.wireNumber || '?'} — left {r.remainingBundles || 0} bundles / ~{(r.remainingKg || 0).toFixed(2)} kg — {formatDate(r.date)}
                  </MenuItem>
                ))}
              </Select>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                Sale weight may gain or lose vs sent kg. Leave Auto to deduct from oldest matching batches. Bundles are the limit.
              </Typography>
            </FormControl>
          )}
          <TextField
            fullWidth
            type="number"
            label="Amount Paid"
            value={dailySaleForm.amountPaid}
            onChange={(e) => setDailySaleForm((f) => ({ ...f, amountPaid: e.target.value }))}
            margin="dense"
            helperText="Default 0 for credit / partial payment"
          />
          {dailyOrderTotal > 0 && (
            <TextField
              fullWidth
              label="Amount Due"
              value={formatCurrency(Math.max(0, dailyOrderTotal - (Number(dailySaleForm.amountPaid) || 0)))}
              margin="dense"
              InputProps={{ readOnly: true }}
              helperText={
                Number(dailySaleForm.amountPaid) >= dailyOrderTotal
                  ? 'Fully paid'
                  : Number(dailySaleForm.amountPaid) > 0
                    ? 'Partial payment'
                    : 'Full credit — unpaid'
              }
            />
          )}
          <TextField fullWidth type="date" label="Order Date" value={dailySaleForm.orderDate} onChange={(e) => setDailySaleForm((f) => ({ ...f, orderDate: e.target.value }))} margin="dense" InputLabelProps={{ shrink: true }} />
          <FormControl fullWidth margin="dense">
            <InputLabel>Payment Method</InputLabel>
            <Select value={dailySaleForm.paymentMethod} onChange={(e) => setDailySaleForm((f) => ({ ...f, paymentMethod: e.target.value }))} label="Payment Method">
              {paymentMethods.map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField fullWidth label="Sold By" value={dailySaleForm.soldBy} onChange={(e) => setDailySaleForm((f) => ({ ...f, soldBy: e.target.value }))} margin="dense" />
          <TextField fullWidth label="Notes" value={dailySaleForm.notes} onChange={(e) => setDailySaleForm((f) => ({ ...f, notes: e.target.value }))} margin="dense" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDailySaleDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveDailySale}>Save</Button>
        </DialogActions>
      </ResponsiveDialog>

      <ResponsiveDialog open={openingDialogOpen} onClose={() => setOpeningDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Set Opening Balance (Cash in Hand)</DialogTitle>
        <DialogContent sx={{ overflowY: 'auto' }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Date: <strong>{entryDate}</strong>
            {prevClosingHint != null && (
              <> — Previous day closing: <strong>{formatCurrency(prevClosingHint)}</strong></>
            )}
          </Typography>
          <TextField
            fullWidth
            type="number"
            label="Opening Balance"
            value={openingForm.openingBalance}
            onChange={(e) => setOpeningForm((f) => ({ ...f, openingBalance: e.target.value }))}
            margin="dense"
            helperText="Physical cash in hand at start of this day"
          />
          <TextField
            fullWidth
            label="Note (optional)"
            value={openingForm.note}
            onChange={(e) => setOpeningForm((f) => ({ ...f, note: e.target.value }))}
            margin="dense"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpeningDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveOpening}>Save</Button>
        </DialogActions>
      </ResponsiveDialog>

      <ResponsiveDialog open={cashBreakdownDialogOpen} onClose={() => setCashBreakdownDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Cash Breakdown — {formatDate(entryDate)}</DialogTitle>
        <DialogContent sx={{ overflowY: 'auto' }}>
          <Alert severity="info" sx={{ mb: 2 }}>
            Record who is holding how much of today&apos;s cash in hand (e.g. Fayyaz, Irfan, Faisal). Add as many rows as you need.
          </Alert>
          {cashBreakdownForm.lines.map((line, index) => (
            <Stack key={index} direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
              <TextField
                fullWidth
                label="Person / holder"
                value={line.holder}
                onChange={(e) => setCashBreakdownForm((f) => ({
                  ...f,
                  lines: f.lines.map((row, i) => (i === index ? { ...row, holder: e.target.value } : row)),
                }))}
                margin="dense"
                placeholder="e.g. Fayyaz"
              />
              <TextField
                type="number"
                label="Amount"
                value={line.amount}
                onChange={(e) => setCashBreakdownForm((f) => ({
                  ...f,
                  lines: f.lines.map((row, i) => (i === index ? { ...row, amount: e.target.value } : row)),
                }))}
                margin="dense"
                sx={{ minWidth: 140 }}
              />
              <IconButton
                color="error"
                disabled={cashBreakdownForm.lines.length <= 1}
                onClick={() => setCashBreakdownForm((f) => ({
                  ...f,
                  lines: f.lines.filter((_, i) => i !== index),
                }))}
              >
                <DeleteIcon />
              </IconButton>
            </Stack>
          ))}
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setCashBreakdownForm((f) => ({
              ...f,
              lines: [...f.lines, { holder: '', amount: '' }],
            }))}
            sx={{ mb: 1 }}
          >
            Add holder
          </Button>
          <TextField
            fullWidth
            label="Note (optional)"
            value={cashBreakdownForm.note}
            onChange={(e) => setCashBreakdownForm((f) => ({ ...f, note: e.target.value }))}
            margin="dense"
          />
          {cashBook && (
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
              Closing cash in hand: {formatCurrency(cashBook.closingBalance)}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCashBreakdownDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveCashBreakdown}>Save Breakdown</Button>
        </DialogActions>
      </ResponsiveDialog>

      <ResponsiveDialog open={dialogOpen} onClose={closeTransactionDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {generalCashMode
            ? (editingId ? 'Edit Cash / Cheque Entry' : 'General Cash / Cheque In-Out')
            : ['FactoryExpense', 'SelfExpense'].includes(form.entryKind)
            ? (editingId ? 'Edit Expense Total' : form.entryKind === 'FactoryExpense'
              ? 'Add Factory Expense Total'
              : `Add Self Expense — ${form.expenseCategory?.replace(' Expense', '') || ''}`)
            : (editingId ? 'Edit Transaction' : 'Add Transaction')}
        </DialogTitle>
        <DialogContent sx={{ overflowY: 'auto' }}>
          {generalCashMode && (
            <Alert severity="info" sx={{ mb: 1 }}>
              Record cash or cheque received from (or paid to) anyone who is <strong>not</strong> a ledger customer or supplier.
              This updates <strong>cash in hand</strong>. For bank transfers use the Bank Transfer button.
            </Alert>
          )}
          {mainTab === 0 && !editingId && !['FactoryExpense', 'SelfExpense'].includes(form.entryKind) && !generalCashMode && (
            <FormControl fullWidth margin="dense">
              <InputLabel>Entry Type</InputLabel>
              <Select
                value={form.entryKind}
                onChange={(e) => {
                  const entryKind = e.target.value;
                  setForm((f) => ({
                    ...f,
                    entryKind,
                    transactionType: ['FactoryExpense', 'SelfExpense'].includes(entryKind) ? 'Money Out' : f.transactionType,
                    relatedTo: ['FactoryExpense', 'SelfExpense'].includes(entryKind) ? 'Other' : f.relatedTo,
                    expenseCategory: entryKind === 'SelfExpense' ? 'Fayyaz Expense' : f.expenseCategory,
                    expenseGroup: entryKind === 'SelfExpense' ? SELF_EXPENSE_GROUP : entryKind === 'FactoryExpense' ? FACTORY_EXPENSE_TOTAL : f.expenseGroup,
                  }));
                }}
                label="Entry Type"
              >
                <MenuItem value="General">General Money In / Out</MenuItem>
                <MenuItem value="FactoryExpense">Factory Expense — Daily Total</MenuItem>
                <MenuItem value="SelfExpense">Self Expense — Fayyaz / Faisal / Mutual</MenuItem>
              </Select>
            </FormControl>
          )}
          {mainTab === 0 && ['FactoryExpense', 'SelfExpense'].includes(form.entryKind) && (
            <Alert severity="info" sx={{ mb: 1 }}>
              Saves to Daily Book and Expenses section. Classified line items (Labour, Rental, etc.) are added in Expenses only.
            </Alert>
          )}
          {['FactoryExpense', 'SelfExpense'].includes(form.entryKind) && (
            <>
              {form.entryKind === 'SelfExpense' && (
                <FormControl fullWidth margin="dense">
                  <InputLabel>Self Expense For</InputLabel>
                  <Select
                    value={form.expenseCategory}
                    onChange={(e) => setForm((f) => ({ ...f, expenseCategory: e.target.value }))}
                    label="Self Expense For"
                  >
                    {SELF_EXPENSE_CATEGORIES.map((c) => (
                      <MenuItem key={c} value={c}>{c.replace(' Expense', '')}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
              <TextField
                fullWidth
                label={form.entryKind === 'SelfExpense'
                  ? `${form.expenseCategory?.replace(' Expense', '') || 'Self'} — Daily Total`
                  : 'Factory Expense — Daily Total'}
                type="number"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                margin="dense"
                required
                helperText={`Total cash out for ${entryDate}`}
              />
            </>
          )}
          {!['FactoryExpense', 'SelfExpense'].includes(form.entryKind) && (
          <>
          {mainTab === 0 && !generalCashMode && (
            <Alert severity="info" sx={{ mb: 1 }}>
              General cash in/out or daily expense totals. Customer and supplier payments are recorded under their respective tabs.
            </Alert>
          )}
          {mainTab >= 2 && (
            <Alert severity="info" sx={{ mb: 1 }}>
              {mainTab === 3 ? 'Supplier payment (Money Out) or refund (Money In).' : 'Customer payment (Money In) or refund (Money Out).'}
            </Alert>
          )}
          {!generalCashMode && (
          <FormControl fullWidth margin="dense">
            <InputLabel>Related To</InputLabel>
            <Select
              value={form.relatedTo}
              onChange={(e) => {
                const next = e.target.value;
                setForm((f) => ({
                  ...f,
                  relatedTo: next,
                  relatedId: '',
                  relatedName: '',
                  transactionType: next === 'Customer' ? 'Money In' : next === 'Supplier' ? 'Money Out' : f.transactionType,
                }));
              }}
              label="Related To"
              disabled={mainTab === 1 || mainTab === 2 || mainTab === 3}
            >
              {mainTab === 1 && <MenuItem value="Customer">Daily Customer</MenuItem>}
              {mainTab === 2 && <MenuItem value="Customer">Ledger Customer</MenuItem>}
              {mainTab === 3 && <MenuItem value="Supplier">Supplier</MenuItem>}
              {mainTab === 0 && (
                <MenuItem value="Other">Other (general)</MenuItem>
              )}
            </Select>
          </FormControl>
          )}
          {form.relatedTo === 'Customer' && (
            <PartySearchSelect
              options={customerOptions}
              value={form.relatedId}
              onChange={(id) => setForm((f) => ({ ...f, relatedId: id }))}
              label="Customer"
              required
              getOptionLabel={customerSearchLabel}
            />
          )}
          {form.relatedTo === 'Supplier' && (
            <PartySearchSelect
              options={suppliers}
              value={form.relatedId}
              onChange={(id) => setForm((f) => ({ ...f, relatedId: id }))}
              label="Supplier"
              required
              getOptionLabel={supplierSearchLabel}
            />
          )}
          <FormControl fullWidth margin="dense">
            <InputLabel>Type</InputLabel>
            <Select value={form.transactionType} onChange={(e) => setForm((f) => ({ ...f, transactionType: e.target.value }))} label="Type">
              <MenuItem value="Money In">
                Money In {generalCashMode ? '(Received)' : mainTab === 1 ? '(Sale received)' : form.relatedTo === 'Customer' ? '(Payment received)' : '(Refund from supplier)'}
              </MenuItem>
              <MenuItem value="Money Out">
                Money Out {generalCashMode ? '(Paid out)' : mainTab === 1 ? '(Refund to customer)' : form.relatedTo === 'Supplier' ? '(Payment to supplier)' : '(Refund/payment out)'}
              </MenuItem>
            </Select>
          </FormControl>
          {(form.relatedTo === 'Other' || generalCashMode) && (
            <TextField
              fullWidth
              label={form.transactionType === 'Money In' ? 'Received from (person / party)' : 'Paid to (person / party)'}
              value={form.relatedName}
              onChange={(e) => setForm((f) => ({ ...f, relatedName: e.target.value }))}
              margin="dense"
              required={generalCashMode}
              placeholder="e.g. Imran, ABC Traders, relative"
            />
          )}
          <TextField fullWidth type="number" label="Amount" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} margin="dense" required />
          </>
          )}
          {['FactoryExpense', 'SelfExpense'].includes(form.entryKind) && (
            <>
          <FormControl fullWidth margin="dense">
            <InputLabel>Payment Method</InputLabel>
            <Select value={form.paymentMethod} onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value }))} label="Payment Method">
              {paymentMethods.map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField fullWidth label="Description (optional)" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} margin="dense" />
          <TextField fullWidth label="Handled By" value={form.handledBy} onChange={(e) => setForm((f) => ({ ...f, handledBy: e.target.value }))} margin="dense" />
            </>
          )}
          {!['FactoryExpense', 'SelfExpense'].includes(form.entryKind) && (
          <>
          <FormControl fullWidth margin="dense">
            <InputLabel>Payment Method</InputLabel>
            <Select
              value={form.paymentMethod}
              onChange={(e) => {
                const m = e.target.value;
                setForm((f) => ({ ...f, paymentMethod: m }));
                if (m === 'Cheque') {
                  chequesAPI.getInHand().then((res) => setInHandChequesList(res.data.data || [])).catch(() => {});
                }
              }}
              label="Payment Method"
            >
              {(generalCashMode ? cashChequeMethods : paymentMethods).map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
            </Select>
          </FormControl>

          {form.paymentMethod === 'Cheque' && (
            <Box sx={{ p: 1.5, my: 1, borderRadius: 2, bgcolor: 'rgba(25, 118, 210, 0.08)', border: '1px solid rgba(25, 118, 210, 0.2)' }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.light', display: 'block', mb: 1 }}>
                Cheque Details
              </Typography>

              {form.transactionType === 'Money In' ? (
                <>
                  <TextField
                    fullWidth
                    size="small"
                    label="Cheque Number *"
                    value={form.chequeNumber}
                    onChange={(e) => setForm((f) => ({ ...f, chequeNumber: e.target.value }))}
                    margin="dense"
                    placeholder="e.g. 123456"
                  />
                  <TextField
                    fullWidth
                    size="small"
                    label="Drawer Bank Name *"
                    value={form.chequeBank}
                    onChange={(e) => setForm((f) => ({ ...f, chequeBank: e.target.value }))}
                    margin="dense"
                    placeholder="e.g. MBL, UBL, HBL, MCB"
                  />
                  <TextField
                    fullWidth
                    size="small"
                    type="date"
                    label="Cheque Date (Maturity)"
                    value={form.chequeDate || entryDate}
                    onChange={(e) => setForm((f) => ({ ...f, chequeDate: e.target.value }))}
                    margin="dense"
                    InputLabelProps={{ shrink: true }}
                  />
                </>
              ) : (
                <>
                  <FormControl fullWidth size="small" margin="dense">
                    <InputLabel>Cheque Source</InputLabel>
                    <Select
                      value={form.isEndorsedCheque ? 'Customer Cheque' : form.chequeType}
                      label="Cheque Source"
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === 'Customer Cheque') {
                          setForm((f) => ({ ...f, isEndorsedCheque: true, chequeType: 'Customer Cheque' }));
                          chequesAPI.getInHand().then((res) => setInHandChequesList(res.data.data || [])).catch(() => {});
                        } else {
                          setForm((f) => ({ ...f, isEndorsedCheque: false, sourceChequeId: '', chequeType: val }));
                        }
                      }}
                    >
                      <MenuItem value="Customer Cheque">Customer Cheque (Passed / Endorsed)</MenuItem>
                      <MenuItem value="Company Cheque">Our Company Cheque (Bank Account)</MenuItem>
                      <MenuItem value="Personal Cheque">Our Personal Cheque</MenuItem>
                    </Select>
                  </FormControl>

                  {form.isEndorsedCheque ? (
                    <>
                      <FormControl fullWidth size="small" margin="dense">
                        <InputLabel>Select from In-Hand Cheques (Optional)</InputLabel>
                        <Select
                          value={form.sourceChequeId || ''}
                          label="Select from In-Hand Cheques (Optional)"
                          onChange={(e) => {
                            const chqId = e.target.value;
                            if (!chqId) {
                              setForm((f) => ({
                                ...f,
                                sourceChequeId: '',
                              }));
                              return;
                            }
                            const chosen = inHandChequesList.find((c) => String(c._id) === String(chqId));
                            setForm((f) => ({
                              ...f,
                              sourceChequeId: chqId,
                              amount: chosen ? String(chosen.amount) : f.amount,
                              chequeNumber: chosen ? chosen.chequeNumber : f.chequeNumber,
                              chequeBank: chosen ? chosen.bankName : f.chequeBank,
                              receivedFromName: chosen ? (chosen.receivedFrom?.partyName || '') : f.receivedFromName,
                            }));
                          }}
                        >
                          <MenuItem value=""><em>-- Enter Cheque Details Manually Below --</em></MenuItem>
                          {inHandChequesList.length === 0 ? (
                            <MenuItem value="" disabled>No in-hand cheques in system (Enter details below)</MenuItem>
                          ) : (
                            inHandChequesList.map((c) => (
                              <MenuItem key={c._id} value={c._id}>
                                Cheque #{c.chequeNumber} — {c.bankName} — Rs.{c.amount?.toLocaleString()} (from {c.receivedFrom?.partyName || 'Customer'})
                              </MenuItem>
                            ))
                          )}
                        </Select>
                      </FormControl>

                      <TextField
                        fullWidth
                        size="small"
                        label="Cheque Number *"
                        value={form.chequeNumber}
                        onChange={(e) => setForm((f) => ({ ...f, chequeNumber: e.target.value }))}
                        margin="dense"
                        placeholder="e.g. 123456"
                      />
                      <TextField
                        fullWidth
                        size="small"
                        label="Drawer Bank Name *"
                        value={form.chequeBank}
                        onChange={(e) => setForm((f) => ({ ...f, chequeBank: e.target.value }))}
                        margin="dense"
                        placeholder="e.g. HBL, MCB, MBL"
                      />
                      <TextField
                        fullWidth
                        size="small"
                        type="date"
                        label="Cheque Date (Maturity)"
                        value={form.chequeDate || entryDate}
                        onChange={(e) => setForm((f) => ({ ...f, chequeDate: e.target.value }))}
                        margin="dense"
                        InputLabelProps={{ shrink: true }}
                      />
                      <TextField
                        fullWidth
                        size="small"
                        label="Received From Customer (optional)"
                        value={form.receivedFromName || ''}
                        onChange={(e) => setForm((f) => ({ ...f, receivedFromName: e.target.value }))}
                        margin="dense"
                        placeholder="e.g. Original customer name"
                      />
                    </>
                  ) : (
                    <>
                      <TextField
                        fullWidth
                        size="small"
                        label="Our Cheque Number *"
                        value={form.chequeNumber}
                        onChange={(e) => setForm((f) => ({ ...f, chequeNumber: e.target.value }))}
                        margin="dense"
                        placeholder="e.g. 0987654"
                      />
                      <TextField
                        fullWidth
                        size="small"
                        label="Our Bank Account *"
                        value={form.chequeBank}
                        onChange={(e) => setForm((f) => ({ ...f, chequeBank: e.target.value }))}
                        margin="dense"
                        placeholder="e.g. MBL, UBL, Faisal Bank"
                      />
                      <TextField
                        fullWidth
                        size="small"
                        type="date"
                        label="Cheque Date (Maturity)"
                        value={form.chequeDate || entryDate}
                        onChange={(e) => setForm((f) => ({ ...f, chequeDate: e.target.value }))}
                        margin="dense"
                        InputLabelProps={{ shrink: true }}
                      />
                    </>
                  )}
                </>
              )}
            </Box>
          )}

          <TextField fullWidth label="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} margin="dense" />
          <TextField fullWidth label="Handled By" value={form.handledBy} onChange={(e) => setForm((f) => ({ ...f, handledBy: e.target.value }))} margin="dense" />
          </>
          )}
          <TextField fullWidth label="Entry Date" value={entryDate} margin="dense" InputProps={{ readOnly: true }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeTransactionDialog}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>{editingId ? 'Update' : 'Save'}</Button>
        </DialogActions>
      </ResponsiveDialog>

      {selectedPartyId && selectedParty && (
        <LedgerDialog
          open={ledgerDialogOpen}
          onClose={() => setLedgerDialogOpen(false)}
          title={
            mainTab === 1
              ? `Daily Purchases — ${selectedParty.name}`
              : `Ledger — ${selectedParty.name}`
          }
          fetchLedger={fetchLedgerForDialog}
          partyType={partyType}
          linked={partyIsLinked && (mainTab === 3 || mainTab === 5)}
          primaryRole={mainTab === 3 ? 'supplier' : mainTab === 5 ? 'processing' : 'customer'}
        />
      )}

      <ResponsiveDialog open={stockArrivalDialogOpen} onClose={() => setStockArrivalDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Stock Arrival</DialogTitle>
        <DialogContent sx={{ overflowY: 'auto' }}>
          <Alert severity="info" sx={{ mb: 1 }}>Records stock in ledger — cash payment is optional.</Alert>
          <PartySearchSelect
            options={suppliers}
            value={stockArrivalForm.supplierId}
            onChange={(id) => setStockArrivalForm((f) => ({ ...f, supplierId: id }))}
            label="Supplier"
            required
            getOptionLabel={supplierSearchLabel}
          />
          <FormControl fullWidth margin="dense">
            <InputLabel>Coil Category</InputLabel>
            <Select value={stockArrivalForm.coilCategory} label="Coil Category" onChange={(e) => setStockArrivalForm((f) => ({ ...f, coilCategory: e.target.value }))}>
              <MenuItem value="Shiplet Coil">Shiplet Coil</MenuItem>
              <MenuItem value="Patri Coil">Patri Coil</MenuItem>
            </Select>
          </FormControl>
          <TextField fullWidth type="number" label="Weight (kg)" value={stockArrivalForm.weightInKg} onChange={(e) => setStockArrivalForm((f) => ({ ...f, weightInKg: e.target.value }))} margin="dense" required />
          <TextField fullWidth type="number" label="Bundles" value={stockArrivalForm.bundles} onChange={(e) => setStockArrivalForm((f) => ({ ...f, bundles: e.target.value }))} margin="dense" helperText="Coil bundles are typically heavier than wire bundles" />
          <TextField fullWidth type="number" label="Rate per kg" value={stockArrivalForm.ratePerKg} onChange={(e) => setStockArrivalForm((f) => ({ ...f, ratePerKg: e.target.value }))} margin="dense" required />
          <TextField fullWidth type="number" label="Amount Paid (optional)" value={stockArrivalForm.amountPaid} onChange={(e) => setStockArrivalForm((f) => ({ ...f, amountPaid: e.target.value }))} margin="dense" helperText="Leave empty if no payment on this date" />
          <TextField fullWidth type="date" label="Arrival Date" value={stockArrivalForm.purchaseDate} onChange={(e) => setStockArrivalForm((f) => ({ ...f, purchaseDate: e.target.value }))} margin="dense" InputLabelProps={{ shrink: true }} />
          <TextField fullWidth label="Notes" value={stockArrivalForm.notes} onChange={(e) => setStockArrivalForm((f) => ({ ...f, notes: e.target.value }))} margin="dense" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStockArrivalDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveStockArrival}>Save</Button>
        </DialogActions>
      </ResponsiveDialog>

      <ResponsiveDialog open={coilReturnDialogOpen} onClose={() => setCoilReturnDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Return Coil to Supplier</DialogTitle>
        <DialogContent sx={{ overflowY: 'auto' }}>
          <Alert severity="info" sx={{ mb: 1 }}>
            Credits the supplier ledger (reduces what we owe) and deducts coil from factory stock.
          </Alert>
          <PartySearchSelect
            options={suppliers}
            value={coilReturnForm.supplierId}
            onChange={(id) => setCoilReturnForm((f) => ({ ...f, supplierId: id }))}
            label="Supplier"
            required
            getOptionLabel={supplierSearchLabel}
          />
          <FormControl fullWidth margin="dense" required>
            <InputLabel>Coil Category</InputLabel>
            <Select
              value={coilReturnForm.coilCategory}
              label="Coil Category"
              onChange={(e) => setCoilReturnForm((f) => ({ ...f, coilCategory: e.target.value }))}
            >
              <MenuItem value="Shiplet Coil">Shiplet Coil</MenuItem>
              <MenuItem value="Patri Coil">Patri Coil</MenuItem>
            </Select>
          </FormControl>
          <TextField
            fullWidth type="number" label="Weight (kg)" value={coilReturnForm.weightInKg}
            onChange={(e) => setCoilReturnForm((f) => ({ ...f, weightInKg: e.target.value }))}
            margin="dense" required
          />
          <TextField
            fullWidth type="number" label="Bundles" value={coilReturnForm.bundles}
            onChange={(e) => setCoilReturnForm((f) => ({ ...f, bundles: e.target.value }))}
            margin="dense"
          />
          <TextField
            fullWidth type="number" label="Rate per kg (credit amount)" value={coilReturnForm.ratePerKg}
            onChange={(e) => setCoilReturnForm((f) => ({ ...f, ratePerKg: e.target.value }))}
            margin="dense" required
          />
          <TextField
            fullWidth type="date" label="Return Date" value={coilReturnForm.purchaseDate}
            onChange={(e) => setCoilReturnForm((f) => ({ ...f, purchaseDate: e.target.value }))}
            margin="dense" InputLabelProps={{ shrink: true }}
          />
          <TextField
            fullWidth label="Notes" value={coilReturnForm.notes}
            onChange={(e) => setCoilReturnForm((f) => ({ ...f, notes: e.target.value }))}
            margin="dense"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCoilReturnDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" color="warning" onClick={handleSaveCoilReturn}>Record Coil Return</Button>
        </DialogActions>
      </ResponsiveDialog>

      <ResponsiveDialog open={ledgerSaleDialogOpen} onClose={() => setLedgerSaleDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Sale (Ledger Customer)</DialogTitle>
        <DialogContent sx={{ overflowY: 'auto' }}>
          <Alert severity="info" sx={{ mb: 1 }}>Sale goes to customer ledger — payment optional on this date.</Alert>
          <PartySearchSelect
            options={ledgerCustomers}
            value={ledgerSaleForm.customerId}
            onChange={(id) => setLedgerSaleForm((f) => ({ ...f, customerId: id }))}
            label="Customer"
            required
            getOptionLabel={customerSearchLabel}
          />
          <FormControl fullWidth margin="dense" required>
            <InputLabel>Wire Number</InputLabel>
            <Select
              value={ledgerSaleForm.wireNumber}
              label="Wire Number"
              onChange={(e) => setLedgerSaleForm((f) => ({
                ...f,
                wireNumber: e.target.value,
                coilCategory: defaultCoilCategoryForWire(e.target.value),
              }))}
            >
              {wires.map((w) => <MenuItem key={w.number} value={w.number}>{w.name}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl fullWidth margin="dense" required>
            <InputLabel>Coil Category</InputLabel>
            <Select
              value={ledgerSaleForm.coilCategory}
              label="Coil Category"
              onChange={(e) => setLedgerSaleForm((f) => ({ ...f, coilCategory: e.target.value }))}
            >
              <MenuItem value="Shiplet Coil">Shiplet Coil</MenuItem>
              <MenuItem value="Patri Coil">Patri Coil</MenuItem>
            </Select>
          </FormControl>
          <TextField fullWidth label="Wire Size" value={ledgerSaleForm.wireSize} onChange={(e) => setLedgerSaleForm((f) => ({ ...f, wireSize: e.target.value }))} margin="dense" />
          <TextField fullWidth type="number" label="Weight (kg)" value={ledgerSaleForm.initialWeightKg} onChange={(e) => setLedgerSaleForm((f) => ({ ...f, initialWeightKg: e.target.value }))} margin="dense" required />
          <TextField fullWidth type="number" label="Bundles" value={ledgerSaleForm.bundles} onChange={(e) => setLedgerSaleForm((f) => ({ ...f, bundles: e.target.value }))} margin="dense" />
          <TextField fullWidth type="number" label="Rate per kg" value={ledgerSaleForm.ratePerKg} onChange={(e) => setLedgerSaleForm((f) => ({ ...f, ratePerKg: e.target.value }))} margin="dense" required />
          <FormControlLabel
            control={(
              <Checkbox
                checked={!!ledgerSaleForm.isAnnealed}
                onChange={(e) => {
                  const on = e.target.checked;
                  setLedgerSaleForm((f) => ({ ...f, isAnnealed: on, annealingRecordId: '' }));
                  if (on) loadAnnealedWireOptions(ledgerSaleForm.wireNumber);
                  else setAnnealedWireOptions([]);
                }}
              />
            )}
            label="Wire is annealed (optional link)"
          />
          {ledgerSaleForm.isAnnealed && (
            <FormControl fullWidth margin="dense">
              <InputLabel>Annealing send batch</InputLabel>
              <Select
                value={ledgerSaleForm.annealingRecordId}
                label="Annealing send batch"
                onChange={(e) => {
                  const id = e.target.value;
                  const batch = annealedWireOptions.find((r) => r._id === id);
                  setLedgerSaleForm((f) => ({
                    ...f,
                    annealingRecordId: id,
                    bundles: f.bundles || (batch?.remainingBundles ? String(batch.remainingBundles) : f.bundles),
                    initialWeightKg: f.initialWeightKg || (batch?.remainingKg ? String(batch.remainingKg) : f.initialWeightKg),
                  }));
                }}
              >
                <MenuItem value="">Auto — any annealing batch (FIFO)</MenuItem>
                {annealedWireOptions.map((r) => (
                  <MenuItem key={r._id} value={r._id}>
                    Wire #{r.wireNumber || '?'} — left {r.remainingBundles || 0} bundles / ~{(r.remainingKg || 0).toFixed(2)} kg — {formatDate(r.date)}
                  </MenuItem>
                ))}
              </Select>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                Sale weight may gain or lose vs sent kg. Leave Auto to deduct from oldest matching batches. Bundles are the limit.
              </Typography>
            </FormControl>
          )}
          <TextField fullWidth type="number" label="Amount Paid (optional)" value={ledgerSaleForm.amountPaid} onChange={(e) => setLedgerSaleForm((f) => ({ ...f, amountPaid: e.target.value }))} margin="dense" />
          <TextField fullWidth type="date" label="Sale Date" value={ledgerSaleForm.orderDate} onChange={(e) => setLedgerSaleForm((f) => ({ ...f, orderDate: e.target.value }))} margin="dense" InputLabelProps={{ shrink: true }} />
          <TextField fullWidth label="Sold By" value={ledgerSaleForm.soldBy} onChange={(e) => setLedgerSaleForm((f) => ({ ...f, soldBy: e.target.value }))} margin="dense" />
          <TextField fullWidth label="Notes" value={ledgerSaleForm.notes} onChange={(e) => setLedgerSaleForm((f) => ({ ...f, notes: e.target.value }))} margin="dense" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLedgerSaleDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveLedgerSale}>Save</Button>
        </DialogActions>
      </ResponsiveDialog>

      <ResponsiveDialog open={annealingSendDialogOpen} onClose={() => { setAnnealingSendDialogOpen(false); setAnnealingEditId(null); }} maxWidth="sm" fullWidth>
        <DialogTitle>{annealingEditId ? 'Edit Annealing Send' : 'Send for Annealing'}</DialogTitle>
        <DialogContent sx={{ overflowY: 'auto' }}>
          <Alert severity="info" sx={{ mb: 1 }}>
            Party is optional — leave it empty for factory&apos;s own stock. If weight is unknown, enter bundles only; the system estimates weight from earlier sends.
          </Alert>
          <FormControl fullWidth margin="dense">
            <InputLabel>Party Type</InputLabel>
            <Select
              value={annealingSendForm.partyType}
              label="Party Type"
              onChange={(e) => setAnnealingSendForm((f) => ({ ...f, partyType: e.target.value, partyId: '' }))}
            >
              <MenuItem value="None">No party — own stock</MenuItem>
              <MenuItem value="Supplier">Supplier</MenuItem>
              <MenuItem value="Customer">Customer</MenuItem>
            </Select>
          </FormControl>
          {annealingSendForm.partyType !== 'None' && (
            <PartySearchSelect
              options={annealingPartyOptions(annealingSendForm.partyType)}
              value={annealingSendForm.partyId}
              onChange={(id) => setAnnealingSendForm((f) => ({ ...f, partyId: id }))}
              label={`${annealingSendForm.partyType} (optional)`}
              allowEmpty
              emptyLabel="— None —"
              getOptionLabel={(p) => p?.name || ''}
            />
          )}
          <FormControl fullWidth margin="dense">
            <InputLabel>Material</InputLabel>
            <Select
              value={annealingSendForm.materialType}
              label="Material"
              onChange={(e) => setAnnealingSendForm((f) => ({ ...f, materialType: e.target.value }))}
            >
              <MenuItem value="Coil">Coil</MenuItem>
              <MenuItem value="Wire">Wire</MenuItem>
            </Select>
          </FormControl>
          {annealingSendForm.materialType === 'Coil' && (
            <FormControl fullWidth margin="dense">
              <InputLabel>Coil Category</InputLabel>
              <Select
                value={annealingSendForm.coilCategory}
                label="Coil Category"
                onChange={(e) => setAnnealingSendForm((f) => ({ ...f, coilCategory: e.target.value }))}
              >
                <MenuItem value="Shiplet Coil">Shiplet Coil</MenuItem>
                <MenuItem value="Patri Coil">Patri Coil</MenuItem>
              </Select>
            </FormControl>
          )}
          {annealingSendForm.materialType === 'Wire' && (
            <FormControl fullWidth margin="dense" required>
              <InputLabel>Wire Number</InputLabel>
              <Select
                value={annealingSendForm.wireNumber}
                label="Wire Number"
                onChange={(e) => setAnnealingSendForm((f) => ({ ...f, wireNumber: e.target.value }))}
              >
                {wires.map((w) => (
                  <MenuItem key={w.number} value={w.number}>{w.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          <TextField fullWidth type="number" label="Bundles Sent" value={annealingSendForm.bundles} onChange={(e) => setAnnealingSendForm((f) => ({ ...f, bundles: e.target.value }))} margin="dense" helperText="Needed if arrivals will come back in parts" />
          <TextField fullWidth type="number" label="Weight Sent (kg)" value={annealingSendForm.weightKg} onChange={(e) => setAnnealingSendForm((f) => ({ ...f, weightKg: e.target.value }))} margin="dense" helperText="Optional if bundles entered — estimated from earlier sends" />
          <TextField fullWidth type="date" label="Sent Date" value={annealingSendForm.date} onChange={(e) => setAnnealingSendForm((f) => ({ ...f, date: e.target.value }))} margin="dense" InputLabelProps={{ shrink: true }} />
          <TextField fullWidth label="Sent By" value={annealingSendForm.sentBy} onChange={(e) => setAnnealingSendForm((f) => ({ ...f, sentBy: e.target.value }))} margin="dense" />
          <TextField fullWidth label="Notes" value={annealingSendForm.notes} onChange={(e) => setAnnealingSendForm((f) => ({ ...f, notes: e.target.value }))} margin="dense" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setAnnealingSendDialogOpen(false); setAnnealingEditId(null); }}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveAnnealingSend}>{annealingEditId ? 'Update' : 'Save'}</Button>
        </DialogActions>
      </ResponsiveDialog>

      <ResponsiveDialog open={annealingArrivalDialogOpen} onClose={() => { setAnnealingArrivalDialogOpen(false); setAnnealingEditId(null); }} maxWidth="sm" fullWidth>
        <DialogTitle>{annealingEditId ? 'Edit Annealing Arrival' : 'Arrival from Annealing'}</DialogTitle>
        <DialogContent sx={{ overflowY: 'auto' }}>
          <Alert severity="info" sx={{ mb: 1 }}>
            If you know the party, choose its pending pool. For combined bundles
            whose owner is unknown, choose <strong>Unknown / mixed parties</strong>;
            the system will estimate initial weight and deduct from matching pools automatically.
          </Alert>
          {!annealingEditId && annealingPools.filter((p) => p.remainingKg > 0.001 || p.remainingBundles > 0).length > 0 && (
            <FormControl fullWidth margin="dense">
              <InputLabel>Pending Pool</InputLabel>
              <Select
                value={annealingArrivalForm.poolKey}
                label="Pending Pool"
                onChange={(e) => {
                  if (e.target.value === '__mixed__') {
                    setAnnealingArrivalForm((f) => ({
                      ...f,
                      poolKey: '__mixed__',
                      partyType: 'None',
                      partyId: '',
                      bundles: '',
                      initialWeightKg: '',
                    }));
                    return;
                  }
                  const pool = annealingPools.find((p) => p.key === e.target.value);
                  setAnnealingArrivalForm((f) => ({
                    ...f,
                    poolKey: e.target.value,
                    partyType: pool ? pool.partyType : f.partyType,
                    partyId: pool ? pool.partyId || '' : f.partyId,
                    materialType: pool ? pool.materialType : f.materialType,
                    coilCategory: pool?.coilCategory || f.coilCategory,
                    wireNumber: pool?.wireNumber || '',
                    bundles: '',
                    initialWeightKg: '',
                  }));
                }}
              >
                <MenuItem value="">— Choose manually —</MenuItem>
                <MenuItem value="__mixed__">
                  Unknown / mixed parties — auto-allocate by material
                </MenuItem>
                {annealingPools
                  .filter((p) => p.remainingKg > 0.001 || p.remainingBundles > 0)
                  .map((p) => (
                    <MenuItem key={p.key} value={p.key}>
                      {p.partyName || 'Own stock'} — {p.materialType}
                      {p.coilCategory ? ` ${p.coilCategory}` : ''}
                      {p.wireNumber ? ` #${p.wireNumber}` : ''}
                      : {p.remainingBundles > 0 ? `${p.remainingBundles} bundles / ` : ''}{p.remainingKg.toFixed(2)} kg pending
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>
          )}
          {!annealingArrivalForm.poolKey && (
            <>
              <FormControl fullWidth margin="dense">
                <InputLabel>Party Type</InputLabel>
                <Select
                  value={annealingArrivalForm.partyType}
                  label="Party Type"
                  onChange={(e) => setAnnealingArrivalForm((f) => ({ ...f, partyType: e.target.value, partyId: '' }))}
                >
                  <MenuItem value="None">No party — own stock</MenuItem>
                  <MenuItem value="Supplier">Supplier</MenuItem>
                  <MenuItem value="Customer">Customer</MenuItem>
                </Select>
              </FormControl>
              {annealingArrivalForm.partyType !== 'None' && (
                <FormControl fullWidth margin="dense">
                  <InputLabel>{annealingArrivalForm.partyType} (optional)</InputLabel>
                  <Select
                    value={annealingArrivalForm.partyId}
                    label={`${annealingArrivalForm.partyType} (optional)`}
                    onChange={(e) => setAnnealingArrivalForm((f) => ({ ...f, partyId: e.target.value }))}
                  >
                    <MenuItem value="">— None —</MenuItem>
                    {annealingPartyOptions(annealingArrivalForm.partyType).map((p) => (
                      <MenuItem key={p._id} value={p._id}>{p.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
              <FormControl fullWidth margin="dense">
                <InputLabel>Material</InputLabel>
                <Select
                  value={annealingArrivalForm.materialType}
                  label="Material"
                  onChange={(e) => setAnnealingArrivalForm((f) => ({ ...f, materialType: e.target.value }))}
                >
                  <MenuItem value="Coil">Coil</MenuItem>
                  <MenuItem value="Wire">Wire</MenuItem>
                </Select>
              </FormControl>
            </>
          )}
          {annealingArrivalForm.materialType === 'Coil' && (
            <FormControl fullWidth margin="dense">
              <InputLabel>Coil Category</InputLabel>
              <Select
                value={annealingArrivalForm.coilCategory}
                label="Coil Category"
                onChange={(e) => setAnnealingArrivalForm((f) => ({ ...f, coilCategory: e.target.value }))}
              >
                <MenuItem value="Shiplet Coil">Shiplet Coil</MenuItem>
                <MenuItem value="Patri Coil">Patri Coil</MenuItem>
              </Select>
            </FormControl>
          )}
          {annealingArrivalForm.materialType === 'Wire' && (
            <FormControl fullWidth margin="dense">
              <InputLabel>Wire Number</InputLabel>
              <Select
                value={annealingArrivalForm.wireNumber}
                label="Wire Number"
                onChange={(e) => setAnnealingArrivalForm((f) => ({ ...f, wireNumber: e.target.value }))}
              >
                {wires.map((w) => (
                  <MenuItem key={w.number} value={w.number}>{w.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          {arrivalPool && (arrivalPool.remainingKg > 0.001 || arrivalPool.remainingBundles > 0) && (
            <Alert severity="warning" sx={{ my: 1 }}>
              Pending for {arrivalPool.partyName || 'own stock'} ({arrivalPool.materialType}):{' '}
              {arrivalPool.remainingBundles > 0 && <><strong>{arrivalPool.remainingBundles} bundles</strong> / </>}
              <strong>{arrivalPool.remainingKg.toFixed(2)} kg</strong>
              {arrivalPool.avgKgPerBundle > 0 && <> (~{arrivalPool.avgKgPerBundle.toFixed(2)} kg/bundle)</>}
              {arrivalIsMixed && (
                <> — bundles will be deducted automatically from the matching party pools</>
              )}
            </Alert>
          )}
          <TextField
            fullWidth
            type="number"
            label="Bundles Arrived"
            value={annealingArrivalForm.bundles}
            onChange={(e) => setAnnealingArrivalForm((f) => ({ ...f, bundles: e.target.value }))}
            margin="dense"
            helperText={arrivalIsMixed
              ? 'Initial weight is estimated from all matching pending pools; bundles are allocated automatically'
              : 'Initial weight is calculated from the pending pool'}
          />
          <TextField fullWidth type="number" label="Initial Weight (kg) — optional override" value={annealingArrivalForm.initialWeightKg} onChange={(e) => setAnnealingArrivalForm((f) => ({ ...f, initialWeightKg: e.target.value }))} margin="dense" helperText="Leave empty to auto-calculate; if no bundles either, whole pending weight is used" />
          {arrivalAutoInitial > 0 && (
            <Alert severity="info" sx={{ my: 1 }}>
              Initial weight for this arrival: <strong>{Number(arrivalAutoInitial).toFixed(2)} kg</strong>
              {annealingWeightChangePreview != null && (
                <>
                  {' — '}
                  {annealingWeightChangePreview > 0 ? (
                    <>Weight loss: <strong>{annealingWeightChangePreview.toFixed(2)} kg</strong></>
                  ) : annealingWeightChangePreview < 0 ? (
                    <>Weight gain: <strong>{Math.abs(annealingWeightChangePreview).toFixed(2)} kg</strong></>
                  ) : (
                    <>No weight change</>
                  )}
                </>
              )}
            </Alert>
          )}
          <TextField fullWidth type="number" label="Final Weight — received (kg)" value={annealingArrivalForm.finalWeightKg} onChange={(e) => setAnnealingArrivalForm((f) => ({ ...f, finalWeightKg: e.target.value }))} margin="dense" required />
          <TextField fullWidth type="date" label="Arrival Date" value={annealingArrivalForm.date} onChange={(e) => setAnnealingArrivalForm((f) => ({ ...f, date: e.target.value }))} margin="dense" InputLabelProps={{ shrink: true }} />
          <TextField fullWidth label="Received By" value={annealingArrivalForm.receivedBy} onChange={(e) => setAnnealingArrivalForm((f) => ({ ...f, receivedBy: e.target.value }))} margin="dense" />
          <TextField fullWidth label="Notes" value={annealingArrivalForm.notes} onChange={(e) => setAnnealingArrivalForm((f) => ({ ...f, notes: e.target.value }))} margin="dense" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setAnnealingArrivalDialogOpen(false); setAnnealingEditId(null); }}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveAnnealingArrival}>{annealingEditId ? 'Update' : 'Save Arrival'}</Button>
        </DialogActions>
      </ResponsiveDialog>

      <ResponsiveDialog open={jobWorkDialogOpen} onClose={() => { setJobWorkDialogOpen(false); setJobWorkEditId(null); }} maxWidth="sm" fullWidth>
        <DialogTitle>{jobWorkEditId ? 'Edit Processing Work Record' : 'Processing Work — Coil Arrival'}</DialogTitle>
        <DialogContent sx={{ overflowY: 'auto' }}>
          <Alert severity="info" sx={{ mb: 1 }}>
            Customer&apos;s own coil arrives for manufacturing. Labour rate is entered later when wire is delivered (rate varies by wire).
          </Alert>
          <PartySearchSelect
            options={processingCustomers}
            value={jobWorkForm.customerId}
            onChange={(id) => setJobWorkForm((f) => ({ ...f, customerId: id }))}
            label="Customer"
            required
            getOptionLabel={customerSearchLabel}
          />
          <FormControl fullWidth margin="dense">
            <InputLabel>Coil Category</InputLabel>
            <Select value={jobWorkForm.coilCategory} label="Coil Category" onChange={(e) => setJobWorkForm((f) => ({ ...f, coilCategory: e.target.value }))}>
              <MenuItem value="Shiplet Coil">Shiplet Coil</MenuItem>
              <MenuItem value="Patri Coil">Patri Coil</MenuItem>
            </Select>
          </FormControl>
          <TextField fullWidth type="number" label="Arrived Weight (kg)" value={jobWorkForm.arrivedWeightKg} onChange={(e) => setJobWorkForm((f) => ({ ...f, arrivedWeightKg: e.target.value }))} margin="dense" required />
          <TextField fullWidth type="number" label="Customer's Coil Rate per kg (e.g. 232)" value={jobWorkForm.coilRatePerKg} onChange={(e) => setJobWorkForm((f) => ({ ...f, coilRatePerKg: e.target.value }))} margin="dense" helperText="Optional — used with labour rate at delivery to show selling rate" />
          <TextField fullWidth type="date" label="Arrival Date" value={jobWorkForm.arrivalDate} onChange={(e) => setJobWorkForm((f) => ({ ...f, arrivalDate: e.target.value }))} margin="dense" InputLabelProps={{ shrink: true }} />
          <TextField fullWidth label="Notes" value={jobWorkForm.notes} onChange={(e) => setJobWorkForm((f) => ({ ...f, notes: e.target.value }))} margin="dense" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setJobWorkDialogOpen(false); setJobWorkEditId(null); }}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveJobWork}>{jobWorkEditId ? 'Update' : 'Save'}</Button>
        </DialogActions>
      </ResponsiveDialog>

      <ResponsiveDialog
        open={jobWorkDeliveryDialogOpen}
        onClose={() => {
          setJobWorkDeliveryDialogOpen(false);
          setJobWorkDeliveryEdit(null);
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Processing Work — {jobWorkDeliveryEdit ? 'Edit Wire Delivery' : 'Record Wire Delivery'}
        </DialogTitle>
        <DialogContent sx={{ overflowY: 'auto' }}>
          <Alert severity="info" sx={{ mb: 1 }}>
            {jobWorkDeliveryEdit
              ? 'Changing weight or labour rate will recalculate stock, labour charges, status, and customer balance.'
              : 'Delivery is drawn FIFO from the customer’s coil pool. Enter the labour rate for this wire delivery.'}
          </Alert>
          <PartySearchSelect
            options={processingCustomers}
            value={jobWorkDeliveryForm.customerId}
            onChange={(id) => setJobWorkDeliveryForm((f) => ({ ...f, customerId: id }))}
            label="Customer"
            required
            disabled={!!jobWorkDeliveryEdit}
            getOptionLabel={customerSearchLabel}
          />
          {deliveryAvailableKg > 0 && (
            <Alert severity="info" sx={{ my: 1 }}>
              Available for this {jobWorkDeliveryEdit ? 'edited delivery' : 'delivery'}:{' '}
              <strong>{deliveryAvailableKg.toFixed(2)} kg</strong>
            </Alert>
          )}
          {deliveryPool && deliveryAvailableKg <= 0 && (
            <Alert severity="warning" sx={{ my: 1 }}>No stock remaining in pool for this customer.</Alert>
          )}
          <TextField
            fullWidth
            type="number"
            label="Incoming coil rate (latest arrival)"
            value={deliveryIncomingCoilRate || ''}
            margin="dense"
            InputProps={{ readOnly: true }}
            helperText={
              !jobWorkDeliveryEdit && deliveryAvgCoilRate > 0
                && Math.abs(deliveryAvgCoilRate - deliveryIncomingCoilRate) > 0.01
                ? `Latest arrival rate is used (pool average is ${deliveryAvgCoilRate}/kg) — added to labour to make the selling rate`
                : "Rate of the customer's most recent coil arrival — added to labour to make the selling rate"
            }
          />
          <FormControl fullWidth margin="dense">
            <InputLabel>Wire Number</InputLabel>
            <Select
              value={jobWorkDeliveryForm.wireNumber}
              label="Wire Number"
              onChange={(e) => setJobWorkDeliveryForm((f) => ({ ...f, wireNumber: e.target.value }))}
            >
              <MenuItem value="">— Optional —</MenuItem>
              {wires.map((w) => (
                <MenuItem key={w.number} value={w.number}>{w.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            fullWidth type="number" label="Delivered Wire Weight (kg)"
            value={jobWorkDeliveryForm.weightKg}
            onChange={(e) => setJobWorkDeliveryForm((f) => ({ ...f, weightKg: e.target.value }))}
            margin="dense" required
            inputProps={{ max: deliveryAvailableKg }}
          />
          <TextField
            fullWidth type="number" label="Bundles"
            value={jobWorkDeliveryForm.bundles}
            onChange={(e) => setJobWorkDeliveryForm((f) => ({ ...f, bundles: e.target.value }))}
            margin="dense"
          />
          <TextField
            fullWidth type="number" label="Labour Rate per kg (e.g. 25)"
            value={jobWorkDeliveryForm.labourRatePerKg}
            onChange={(e) => setJobWorkDeliveryForm((f) => ({ ...f, labourRatePerKg: e.target.value }))}
            margin="dense" required
            helperText="Rate for this wire type — charged only on delivered weight"
          />
          {(deliveryIncomingCoilRate > 0 || deliveryLabourPreview > 0) && (
            <Alert severity="success" sx={{ my: 1 }}>
              Incoming coil: <strong>{deliveryIncomingCoilRate > 0 ? `${formatCurrency(deliveryIncomingCoilRate)}/kg` : '—'}</strong>
              {Number(jobWorkDeliveryForm.labourRatePerKg) > 0 && (
                <> + Labour <strong>{formatCurrency(Number(jobWorkDeliveryForm.labourRatePerKg))}/kg</strong></>
              )}
              {deliverySellingPreview > 0 && (
                <> = Selling <strong>{formatCurrency(deliverySellingPreview)}/kg</strong></>
              )}
              {deliveryLabourPreview > 0 && (
                <> — Labour charge: <strong>{formatCurrency(deliveryLabourPreview)}</strong></>
              )}
            </Alert>
          )}
          <TextField fullWidth type="date" label="Delivery Date" value={jobWorkDeliveryForm.deliveredDate} onChange={(e) => setJobWorkDeliveryForm((f) => ({ ...f, deliveredDate: e.target.value }))} margin="dense" InputLabelProps={{ shrink: true }} />
          <TextField fullWidth label="Notes" value={jobWorkDeliveryForm.notes} onChange={(e) => setJobWorkDeliveryForm((f) => ({ ...f, notes: e.target.value }))} margin="dense" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setJobWorkDeliveryDialogOpen(false);
            setJobWorkDeliveryEdit(null);
          }}>
            Cancel
          </Button>
          <Button variant="contained" color="success" onClick={handleSaveJobWorkDelivery}>
            {jobWorkDeliveryEdit ? 'Update Delivery' : 'Save Delivery'}
          </Button>
        </DialogActions>
      </ResponsiveDialog>

      <ResponsiveDialog open={returnDialogOpen} onClose={() => setReturnDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Return Defect Wire</DialogTitle>
        <DialogContent sx={{ overflowY: 'auto' }}>
          <Alert severity="info" sx={{ mb: 1 }}>
            Credits the customer ledger and adds the weight back to Ready Stock by wire number. Does not change the original sale row.
          </Alert>
          <PartySearchSelect
            options={mainTab === 5 ? processingCustomers : ledgerCustomers}
            value={returnForm.customerId}
            onChange={(id) => setReturnForm((f) => ({ ...f, customerId: id }))}
            label="Customer"
            required
            getOptionLabel={customerSearchLabel}
          />
          <FormControl fullWidth margin="dense" required>
            <InputLabel>Wire Number</InputLabel>
            <Select
              value={returnForm.wireNumber}
              label="Wire Number"
              onChange={(e) => setReturnForm((f) => ({
                ...f,
                wireNumber: e.target.value,
                coilCategory: defaultCoilCategoryForWire(e.target.value),
              }))}
            >
              {wires.map((w) => (
                <MenuItem key={w.number} value={w.number}>{w.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth margin="dense" required>
            <InputLabel>Coil Category</InputLabel>
            <Select
              value={returnForm.coilCategory}
              label="Coil Category"
              onChange={(e) => setReturnForm((f) => ({ ...f, coilCategory: e.target.value }))}
            >
              <MenuItem value="Shiplet Coil">Shiplet Coil</MenuItem>
              <MenuItem value="Patri Coil">Patri Coil</MenuItem>
            </Select>
          </FormControl>
          <TextField fullWidth type="number" label="Weight (kg)" value={returnForm.initialWeightKg} onChange={(e) => setReturnForm((f) => ({ ...f, initialWeightKg: e.target.value }))} margin="dense" required />
          <TextField fullWidth type="number" label="Bundles" value={returnForm.bundles} onChange={(e) => setReturnForm((f) => ({ ...f, bundles: e.target.value }))} margin="dense" />
          <TextField fullWidth type="number" label="Rate per kg (credit amount)" value={returnForm.ratePerKg} onChange={(e) => setReturnForm((f) => ({ ...f, ratePerKg: e.target.value }))} margin="dense" required />
          <TextField fullWidth type="date" label="Return Date" value={returnForm.orderDate} onChange={(e) => setReturnForm((f) => ({ ...f, orderDate: e.target.value }))} margin="dense" InputLabelProps={{ shrink: true }} />
          <TextField fullWidth label="Notes" value={returnForm.notes} onChange={(e) => setReturnForm((f) => ({ ...f, notes: e.target.value }))} margin="dense" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReturnDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" color="warning" onClick={handleSaveWireReturn}>Save Return</Button>
        </DialogActions>
      </ResponsiveDialog>

      {/* ───────── Bank Transfer Dialog ───────── */}
      <ResponsiveDialog
        open={bankTransferDialogOpen}
        onClose={() => { setBankTransferDialogOpen(false); setBankTransferEditingId(null); }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{bankTransferEditingId ? 'Edit Bank Transfer' : 'Bank Transfer'}</DialogTitle>
        <DialogContent sx={{ overflowY: 'auto' }}>
          <Alert severity="info" sx={{ mb: 2 }}>
            Bank transfers do <strong>not</strong> affect cash in hand — choose which bank account ledger to update.
          </Alert>
          <FormControl fullWidth margin="dense" required>
            <InputLabel>Bank Account</InputLabel>
            <Select
              value={bankTransferForm.bankAccount}
              label="Bank Account"
              onChange={(e) => setBankTransferForm((f) => ({ ...f, bankAccount: e.target.value }))}
            >
              {BANK_ACCOUNTS.map((a) => (
                <MenuItem key={a} value={a}>{a === 'Other' ? 'Any Other' : `${a} Account`}</MenuItem>
              ))}
            </Select>
          </FormControl>
          {bankTransferForm.bankAccount === 'Other' && (
            <TextField
              fullWidth
              label="Write bank / account name"
              value={bankTransferForm.bankAccountOtherName}
              onChange={(e) => setBankTransferForm((f) => ({ ...f, bankAccountOtherName: e.target.value }))}
              margin="dense"
              required
              placeholder="e.g. HBL, JazzCash, EasyPaisa"
            />
          )}
          <FormControl fullWidth margin="dense" required>
            <InputLabel>Direction</InputLabel>
            <Select
              value={bankTransferForm.transactionType}
              label="Direction"
              onChange={(e) => setBankTransferForm((f) => ({
                ...f,
                transactionType: e.target.value,
                recordAsExpense: e.target.value === 'Money Out' ? f.recordAsExpense : false,
              }))}
            >
              <MenuItem value="Money In">Money In — Received via Bank</MenuItem>
              <MenuItem value="Money Out">Money Out — Sent via Bank</MenuItem>
            </Select>
          </FormControl>
          <TextField
            fullWidth type="number" label="Amount (Rs.)"
            value={bankTransferForm.amount}
            onChange={(e) => setBankTransferForm((f) => ({ ...f, amount: e.target.value }))}
            margin="dense" required
          />
          <FormControl fullWidth margin="dense">
            <InputLabel>Person / Party Type</InputLabel>
            <Select
              value={bankTransferForm.personType}
              label="Person / Party Type"
              onChange={(e) => setBankTransferForm((f) => ({ ...f, personType: e.target.value, relatedId: '', relatedName: '' }))}
            >
              <MenuItem value="free">Free Text (any person)</MenuItem>
              <MenuItem value="customer">Ledger Customer</MenuItem>
              <MenuItem value="supplier">Supplier</MenuItem>
            </Select>
          </FormControl>
          {bankTransferForm.personType === 'free' && (
            <TextField
              fullWidth label="Person / Company Name (optional)"
              value={bankTransferForm.relatedName}
              onChange={(e) => setBankTransferForm((f) => ({ ...f, relatedName: e.target.value }))}
              margin="dense"
            />
          )}
          {bankTransferForm.personType === 'customer' && (
            <PartySearchSelect
              options={[...ledgerCustomers, ...processingCustomers]}
              value={bankTransferForm.relatedId}
              onChange={(id) => setBankTransferForm((f) => ({ ...f, relatedId: id }))}
              label="Customer"
              required
              getOptionLabel={customerSearchLabel}
            />
          )}
          {bankTransferForm.personType === 'supplier' && (
            <PartySearchSelect
              options={suppliers}
              value={bankTransferForm.relatedId}
              onChange={(id) => setBankTransferForm((f) => ({ ...f, relatedId: id }))}
              label="Supplier"
              required
              getOptionLabel={supplierSearchLabel}
            />
          )}
          <TextField
            fullWidth label="Bank Account Number"
            value={bankTransferForm.bankAccountNumber}
            onChange={(e) => setBankTransferForm((f) => ({ ...f, bankAccountNumber: e.target.value }))}
            margin="dense"
            placeholder="e.g. 0123-4567890-01"
            inputProps={{ style: { fontFamily: 'monospace' } }}
          />
          <TextField
            fullWidth label="Description / Reference"
            value={bankTransferForm.description}
            onChange={(e) => setBankTransferForm((f) => ({ ...f, description: e.target.value }))}
            margin="dense"
          />
          <TextField
            fullWidth type="date" label="Transaction Date"
            value={bankTransferForm.transactionDate}
            onChange={(e) => setBankTransferForm((f) => ({ ...f, transactionDate: e.target.value }))}
            margin="dense"
            InputLabelProps={{ shrink: true }}
          />
          {bankTransferForm.transactionType === 'Money Out' && (
            <>
              <FormControlLabel
                sx={{ mt: 1 }}
                control={(
                  <Checkbox
                    checked={bankTransferForm.recordAsExpense}
                    onChange={(e) => setBankTransferForm((f) => ({ ...f, recordAsExpense: e.target.checked }))}
                  />
                )}
                label="Record as factory / self expense (e.g. Annealing payment)"
              />
              {bankTransferForm.recordAsExpense && (
                <>
                  <Alert severity="info" sx={{ my: 1 }}>
                    This amount will appear in Expenses under the selected category. It is deducted from bank balance only — not cash in hand.
                  </Alert>
                  <FormControl fullWidth margin="dense" required>
                    <InputLabel>Expense Group</InputLabel>
                    <Select
                      value={bankTransferForm.expenseGroup}
                      label="Expense Group"
                      onChange={(e) => {
                        const group = e.target.value;
                        const firstCat = BANK_EXPENSE_TREE[group]?.[0] || 'Miscellaneous';
                        setBankTransferForm((f) => ({ ...f, expenseGroup: group, expenseCategory: firstCat }));
                      }}
                    >
                      {Object.keys(BANK_EXPENSE_TREE).map((g) => (
                        <MenuItem key={g} value={g}>{g}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl fullWidth margin="dense" required>
                    <InputLabel>Expense Category</InputLabel>
                    <Select
                      value={bankTransferForm.expenseCategory}
                      label="Expense Category"
                      onChange={(e) => setBankTransferForm((f) => ({ ...f, expenseCategory: e.target.value }))}
                    >
                      {(BANK_EXPENSE_TREE[bankTransferForm.expenseGroup] || []).map((c) => (
                        <MenuItem key={c} value={c}>{c}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setBankTransferDialogOpen(false); setBankTransferEditingId(null); }}>Cancel</Button>
          <Button
            variant="contained"
            color={bankTransferForm.transactionType === 'Money In' ? 'success' : 'error'}
            onClick={handleSaveBankTransfer}
          >
            {bankTransferEditingId
              ? 'Update'
              : (bankTransferForm.transactionType === 'Money In' ? 'Record Received' : 'Record Sent')}
          </Button>
        </DialogActions>
      </ResponsiveDialog>

      <ConfirmDialog open={deleteConfirm.open} title="Delete Transaction" message="Are you sure?" onConfirm={handleDelete} onCancel={() => setDeleteConfirm({ open: false, id: null })} />
      <ConfirmDialog open={deleteAnnealingConfirm.open} title="Delete Annealing Entry" message="Delete this annealing entry? Pool totals will be recalculated." onConfirm={handleDeleteAnnealing} onCancel={() => setDeleteAnnealingConfirm({ open: false, id: null })} />

      <ResponsiveDialog
        open={annealingPoolDialog.open}
        onClose={() => setAnnealingPoolDialog({ open: false, pool: null })}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Pending pool — {annealingPoolDialog.pool?.partyName || 'Own stock'} ({annealingPoolDialog.pool?.materialType})
        </DialogTitle>
        <DialogContent sx={{ overflowY: 'auto' }}>
          {annealingPoolDialog.pool && (
            <Alert severity="warning" sx={{ mb: 1.5 }}>
              Remaining:{' '}
              <strong>
                {annealingPoolDialog.pool.remainingBundles > 0
                  ? `${annealingPoolDialog.pool.remainingBundles} bundles / `
                  : ''}
                {annealingPoolDialog.pool.remainingKg.toFixed(2)} kg
              </strong>
            </Alert>
          )}
          <Box display="flex" gap={1} mb={1.5}>
              <Button
                size="small"
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={requireAdmin(() => {
                  const pool = annealingPoolDialog.pool;
                  if (!pool) return;
                  setAnnealingEditId(null);
                  setAnnealingEditType(null);
                  setAnnealingArrivalForm({
                    ...defaultAnnealingArrivalForm,
                    poolKey: pool.key,
                    partyType: pool.partyType || 'None',
                    partyId: pool.partyId || '',
                    materialType: pool.materialType || 'Coil',
                    date: entryDate,
                  });
                  setAnnealingArrivalDialogOpen(true);
                })}
              >
                Record Arrival
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={requireAdmin(() => {
                  const pool = annealingPoolDialog.pool;
                  setAnnealingEditId(null);
                  setAnnealingEditType(null);
                  setAnnealingSendForm({
                    ...defaultAnnealingSendForm,
                    partyType: pool?.partyType || 'None',
                    partyId: pool?.partyId || '',
                    materialType: pool?.materialType || 'Coil',
                    date: entryDate,
                  });
                  setAnnealingSendDialogOpen(true);
                })}
              >
                Add Send
              </Button>
            </Box>
          {annealingPoolLoading ? (
            <Box display="flex" justifyContent="center" py={3}><CircularProgress size={28} /></Box>
          ) : (
            <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ '& td, & th': { py: 0.6, px: 1, fontSize: '0.8rem' } }}>
                <TableHead>
                  <TableRow sx={{ bgcolor: 'grey.100' }}>
                    <TableCell>Date</TableCell>
                    <TableCell>Entry</TableCell>
                    <TableCell align="right">Bundles</TableCell>
                    <TableCell align="right">Weight (kg)</TableCell>
                    <TableCell align="right">Final (kg)</TableCell>
                    <TableCell>Notes</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {annealingPoolEntries.map((row) => (
                    <TableRow key={row._id} hover>
                      <TableCell>{formatDate(row.date)}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={row.entryType === 'Send' ? 'Sent' : row.entryType === 'Sold' ? 'Sold' : 'Arrived'}
                          color={row.entryType === 'Send' ? 'warning' : row.entryType === 'Sold' ? 'info' : 'success'}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell align="right">{row.bundles > 0 ? row.bundles : '—'}</TableCell>
                      <TableCell align="right">{(row.weightKg || 0).toFixed(2)}</TableCell>
                      <TableCell align="right">{row.entryType === 'Arrival' ? (row.finalWeightKg || 0).toFixed(2) : '—'}</TableCell>
                      <TableCell>{row.notes || '—'}</TableCell>
                      <TableCell align="right">
                        {(
                          <>
                            <Button
                              size="small"
                              startIcon={<EditIcon />}
                              onClick={requireAdmin(() => openAnnealingEdit(row))}
                              sx={{ mr: 0.5 }}
                            >
                              Edit
                            </Button>
                            <Button
                              size="small"
                              color="error"
                              startIcon={<DeleteIcon />}
                              onClick={requireAdmin(() => setDeleteAnnealingConfirm({ open: true, id: row._id }))}
                            >
                              Delete
                            </Button>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {annealingPoolEntries.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7}>
                        <Typography variant="body2" color="text.secondary">No entries found for this pool.</Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAnnealingPoolDialog({ open: false, pool: null })}>Close</Button>
        </DialogActions>
      </ResponsiveDialog>
      <ConfirmDialog open={deleteJobWorkConfirm.open} title="Delete Job Work Record" message="Delete this job work record? Any labour charged will be reversed from the customer's due." onConfirm={handleDeleteJobWork} onCancel={() => setDeleteJobWorkConfirm({ open: false, id: null })} />
      <ConfirmDialog
        open={deleteJobWorkDeliveryConfirm.open}
        title="Delete Processing Delivery"
        message="Delete this delivery? Its weight will return to processing stock and the labour charge will be removed from the customer balance."
        onConfirm={handleDeleteJobWorkDelivery}
        onCancel={() => setDeleteJobWorkDeliveryConfirm({
          open: false,
          jobWorkId: null,
          deliveryId: null,
        })}
      />
      <ConfirmDialog open={deleteOrderConfirm.open} title="Delete Daily Sale" message="Are you sure you want to delete this sale?" onConfirm={handleDeleteOrder} onCancel={() => setDeleteOrderConfirm({ open: false, id: null })} />
      <ConfirmDialog
        open={partyDeleteConfirm.open}
        title={`Drop ${getPartyTypeLabel()}`}
        message={`Remove this ${getPartyTypeLabel().toLowerCase()}? Their ledger history in the ${mainTab === 3 ? 'Suppliers' : 'Customers'} section will also be removed.`}
        onConfirm={handleDeleteParty}
        onCancel={() => setPartyDeleteConfirm({ open: false, id: null })}
      />

      <ResponsiveDialog open={partyDialogOpen} onClose={() => setPartyDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{partyEditingId ? `Edit ${getPartyTypeLabel()}` : `Add ${getPartyTypeLabel()}`}</DialogTitle>
        <DialogContent sx={{ overflowY: 'auto' }}>
          <TextField fullWidth label="Name" value={partyForm.name} onChange={(e) => setPartyForm((f) => ({ ...f, name: e.target.value }))} margin="dense" required />
          <TextField fullWidth label="Contact Number" value={partyForm.contactNumber} onChange={(e) => setPartyForm((f) => ({ ...f, contactNumber: e.target.value }))} margin="dense" />
          {mainTab === 3 ? (
            <>
              <TextField fullWidth label="Company Name" value={partyForm.companyName} onChange={(e) => setPartyForm((f) => ({ ...f, companyName: e.target.value }))} margin="dense" />
              <TextField fullWidth label="Address" value={partyForm.address} onChange={(e) => setPartyForm((f) => ({ ...f, address: e.target.value }))} margin="dense" />
              <FormControl fullWidth margin="dense">
                <InputLabel>Opening Balance Type</InputLabel>
                <Select
                  value={partyForm.openingBalanceType}
                  onChange={(e) => setPartyForm((f) => ({ ...f, openingBalanceType: e.target.value, openingBalance: e.target.value === 'none' ? '' : f.openingBalance }))}
                  label="Opening Balance Type"
                >
                  <MenuItem value="none">None</MenuItem>
                  <MenuItem value="credit">Debit — We owe supplier</MenuItem>
                  <MenuItem value="debit">Credit — They owe us (advance paid)</MenuItem>
                </Select>
              </FormControl>
              {partyForm.openingBalanceType !== 'none' && (
                <>
                  <TextField fullWidth type="number" label="Opening Balance" value={partyForm.openingBalance} onChange={(e) => setPartyForm((f) => ({ ...f, openingBalance: e.target.value }))} margin="dense" />
                  <TextField fullWidth type="date" label="Opening Balance Date" value={partyForm.openingBalanceDate} onChange={(e) => setPartyForm((f) => ({ ...f, openingBalanceDate: e.target.value }))} margin="dense" InputLabelProps={{ shrink: true }} />
                </>
              )}
              <Alert severity="info" sx={{ mt: 1.5 }}>
                Same person can also be a Processing Customer (they give coil for manufacturing). Ledgers stay separate, with a Combined view.
              </Alert>
              {partyForm.linkedCustomerId ? (
                <>
                  <FormControl fullWidth margin="dense">
                    <InputLabel>Linked Processing Customer</InputLabel>
                    <Select
                      value={partyForm.linkedCustomerId}
                      label="Linked Processing Customer"
                      onChange={(e) => setPartyForm((f) => ({ ...f, linkedCustomerId: e.target.value, alsoProcessingCustomer: false, unlinkCustomer: false }))}
                    >
                      {processingCustomers.map((c) => (
                        <MenuItem key={c._id} value={c._id}>{c.name}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControlLabel
                    control={<Checkbox checked={!!partyForm.unlinkCustomer} onChange={(e) => setPartyForm((f) => ({ ...f, unlinkCustomer: e.target.checked }))} />}
                    label="Unlink processing customer"
                  />
                </>
              ) : (
                <>
                  <FormControlLabel
                    control={(
                      <Checkbox
                        checked={!!partyForm.alsoProcessingCustomer}
                        onChange={(e) => setPartyForm((f) => ({
                          ...f,
                          alsoProcessingCustomer: e.target.checked,
                          linkedCustomerId: e.target.checked ? '' : f.linkedCustomerId,
                        }))}
                      />
                    )}
                    label="Also create as Processing Customer (same person)"
                  />
                  {!partyForm.alsoProcessingCustomer && (
                    <FormControl fullWidth margin="dense">
                      <InputLabel>Or link existing Processing Customer</InputLabel>
                      <Select
                        value={partyForm.linkedCustomerId || ''}
                        label="Or link existing Processing Customer"
                        onChange={(e) => setPartyForm((f) => ({ ...f, linkedCustomerId: e.target.value, alsoProcessingCustomer: false }))}
                      >
                        <MenuItem value="">None</MenuItem>
                        {processingCustomers.map((c) => (
                          <MenuItem key={c._id} value={c._id}>{c.name}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              <TextField fullWidth label="Address" value={partyForm.address} onChange={(e) => setPartyForm((f) => ({ ...f, address: e.target.value }))} margin="dense" />
              {mainTab === 1 && (
                <Alert severity="info" sx={{ mt: 1 }}>
                  Daily customer — cash purchases only, no credit/debit ledger.
                </Alert>
              )}
              {(mainTab === 2 || mainTab === 5) && (
                <>
                  <FormControl fullWidth margin="dense">
                    <InputLabel>Opening Balance Type</InputLabel>
                    <Select
                      value={partyForm.openingBalanceType}
                      onChange={(e) => setPartyForm((f) => ({ ...f, openingBalanceType: e.target.value, openingBalance: e.target.value === 'none' ? '' : f.openingBalance }))}
                      label="Opening Balance Type"
                    >
                      <MenuItem value="none">None</MenuItem>
                      <MenuItem value="debit">Credit — They owe us</MenuItem>
                      <MenuItem value="credit">Debit — We owe them</MenuItem>
                    </Select>
                  </FormControl>
                  {partyForm.openingBalanceType !== 'none' && (
                    <>
                      <TextField fullWidth type="number" label="Opening Balance" value={partyForm.openingBalance} onChange={(e) => setPartyForm((f) => ({ ...f, openingBalance: e.target.value }))} margin="dense" />
                      <TextField fullWidth type="date" label="Opening Balance Date" value={partyForm.openingBalanceDate} onChange={(e) => setPartyForm((f) => ({ ...f, openingBalanceDate: e.target.value }))} margin="dense" InputLabelProps={{ shrink: true }} />
                    </>
                  )}
                </>
              )}
              {mainTab === 5 && (
                <>
                  <Alert severity="info" sx={{ mt: 1.5 }}>
                    Same person can also be a Supplier (we buy their coil as our stock). Ledgers stay separate, with a Combined view.
                  </Alert>
                  {partyForm.linkedSupplierId ? (
                    <>
                      <FormControl fullWidth margin="dense">
                        <InputLabel>Linked Supplier</InputLabel>
                        <Select
                          value={partyForm.linkedSupplierId}
                          label="Linked Supplier"
                          onChange={(e) => setPartyForm((f) => ({ ...f, linkedSupplierId: e.target.value, alsoSupplier: false, unlinkSupplier: false }))}
                        >
                          {suppliers.map((s) => (
                            <MenuItem key={s._id} value={s._id}>{s.name}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      <FormControlLabel
                        control={<Checkbox checked={!!partyForm.unlinkSupplier} onChange={(e) => setPartyForm((f) => ({ ...f, unlinkSupplier: e.target.checked }))} />}
                        label="Unlink supplier"
                      />
                    </>
                  ) : (
                    <>
                      <FormControlLabel
                        control={(
                          <Checkbox
                            checked={!!partyForm.alsoSupplier}
                            onChange={(e) => setPartyForm((f) => ({
                              ...f,
                              alsoSupplier: e.target.checked,
                              linkedSupplierId: e.target.checked ? '' : f.linkedSupplierId,
                            }))}
                          />
                        )}
                        label="Also create as Supplier (same person)"
                      />
                      {!partyForm.alsoSupplier && (
                        <FormControl fullWidth margin="dense">
                          <InputLabel>Or link existing Supplier</InputLabel>
                          <Select
                            value={partyForm.linkedSupplierId || ''}
                            label="Or link existing Supplier"
                            onChange={(e) => setPartyForm((f) => ({ ...f, linkedSupplierId: e.target.value, alsoSupplier: false }))}
                          >
                            <MenuItem value="">None</MenuItem>
                            {suppliers.map((s) => (
                              <MenuItem key={s._id} value={s._id}>{s.name}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      )}
                    </>
                  )}
                </>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPartyDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveParty}>Save</Button>
        </DialogActions>
      </ResponsiveDialog>

      {/* ATM Withdrawal Dialog */}
      <ResponsiveDialog open={atmDialogOpen} onClose={() => setAtmDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>ATM Withdrawal</DialogTitle>
        <DialogContent sx={{ overflowY: 'auto' }}>
          <Alert severity="info" sx={{ mb: 1 }}>
            Amount is always deducted from the selected bank account. Choose where the withdrawn cash should go.
          </Alert>
          <TextField
            fullWidth type="number" label="Amount (Rs.)" value={atmForm.amount}
            onChange={(e) => setAtmForm((f) => ({ ...f, amount: e.target.value }))}
            margin="dense" required autoFocus
          />
          <FormControl fullWidth margin="dense" required>
            <InputLabel>Bank Account</InputLabel>
            <Select
              value={atmForm.bankAccount}
              label="Bank Account"
              onChange={(e) => setAtmForm((f) => ({ ...f, bankAccount: e.target.value }))}
            >
              {BANK_ACCOUNTS.map((b) => <MenuItem key={b} value={b}>{b === 'Other' ? 'Any Other' : `${b} Account`}</MenuItem>)}
            </Select>
          </FormControl>
          {atmForm.bankAccount === 'Other' && (
            <TextField
              fullWidth label="Bank / Account Name"
              value={atmForm.bankAccountOtherName}
              onChange={(e) => setAtmForm((f) => ({ ...f, bankAccountOtherName: e.target.value }))}
              margin="dense" required
            />
          )}
          <FormControl fullWidth margin="dense" required sx={{ mt: 1 }}>
            <InputLabel>Withdrawal goes to</InputLabel>
            <Select
              value={atmForm.destination}
              label="Withdrawal goes to"
              onChange={(e) => setAtmForm((f) => ({ ...f, destination: e.target.value }))}
            >
              <MenuItem value="cashInHand">Add to cash in hand</MenuItem>
              <MenuItem value="expense">Record as expense</MenuItem>
            </Select>
          </FormControl>
          {atmForm.destination === 'cashInHand' && (
            <Alert severity="success" sx={{ mt: 1 }}>
              Cash will be added to <strong>cash in hand</strong> for this day. No expense will be recorded.
            </Alert>
          )}
          {atmForm.destination === 'expense' && (
            <>
              <Alert severity="warning" sx={{ mt: 1 }}>
                Amount will appear in <strong>Expenses</strong> under the selected category. Cash in hand is not affected.
              </Alert>
              <FormControl fullWidth margin="dense" required>
                <InputLabel>Expense Group</InputLabel>
                <Select
                  value={atmForm.expenseGroup}
                  label="Expense Group"
                  onChange={(e) => {
                    const group = e.target.value;
                    const firstCat = BANK_EXPENSE_TREE[group]?.[0] || 'Miscellaneous';
                    setAtmForm((f) => ({ ...f, expenseGroup: group, expenseCategory: firstCat }));
                  }}
                >
                  {Object.keys(BANK_EXPENSE_TREE).map((g) => (
                    <MenuItem key={g} value={g}>{g}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl fullWidth margin="dense" required>
                <InputLabel>Expense Category</InputLabel>
                <Select
                  value={atmForm.expenseCategory}
                  label="Expense Category"
                  onChange={(e) => setAtmForm((f) => ({ ...f, expenseCategory: e.target.value }))}
                >
                  {(BANK_EXPENSE_TREE[atmForm.expenseGroup] || []).map((c) => (
                    <MenuItem key={c} value={c}>{c}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </>
          )}
          <TextField
            fullWidth label="Description (optional)"
            value={atmForm.description}
            onChange={(e) => setAtmForm((f) => ({ ...f, description: e.target.value }))}
            margin="dense"
          />
          <TextField
            fullWidth type="date" label="Date"
            value={atmForm.transactionDate}
            onChange={(e) => setAtmForm((f) => ({ ...f, transactionDate: e.target.value }))}
            margin="dense" InputLabelProps={{ shrink: true }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAtmDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" color="warning" onClick={handleSaveAtmWithdrawal}>Record ATM Withdrawal</Button>
        </DialogActions>
      </ResponsiveDialog>

      {/* Daily Book Report Dialog */}
      <DailyBookReportDialog
        open={reportDialogOpen}
        onClose={() => setReportDialogOpen(false)}
        defaultDate={entryDate}
      />

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