const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const Order = require('../models/Order');
const Transaction = require('../models/Transaction');
const Expense = require('../models/Expense');
const RawMaterial = require('../models/RawMaterial');
const AnnealingRecord = require('../models/AnnealingRecord');
const JobWork = require('../models/JobWork');
const Worker = require('../models/Worker');
const WorkerLedgerEntry = require('../models/WorkerLedgerEntry');
const ConsumptionMaterial = require('../models/ConsumptionMaterial');
const ConsumptionUsage = require('../models/ConsumptionUsage');
const Customer = require('../models/Customer');
const Supplier = require('../models/Supplier');
const ReadyStock = require('../models/ReadyStock');
const PersonalPayment = require('../models/PersonalPayment');
const ActivityLog = require('../models/ActivityLog');

function formatDate(val) {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function formatValue(val) {
  if (val === null || val === undefined) return '';
  if (val instanceof Date) return formatDate(val);
  if (typeof val === 'number') {
    return Number(val.toFixed(2));
  }
  if (typeof val === 'object') {
    if (val._bsontype === 'ObjectID' || val.constructor?.name === 'ObjectId') {
      return String(val);
    }
    // If it's an ISO date string
    if (typeof val.toISOString === 'function') {
      return formatDate(val);
    }
  }
  return val;
}

function sanitizeRow(doc) {
  const row = {};
  for (const [key, rawVal] of Object.entries(doc)) {
    if (key === '__v') continue;
    if (rawVal === null || rawVal === undefined) {
      row[key] = '';
    } else if (rawVal instanceof Date) {
      row[key] = formatDate(rawVal);
    } else if (typeof rawVal === 'number') {
      row[key] = Number(rawVal.toFixed(2));
    } else if (typeof rawVal === 'boolean') {
      row[key] = rawVal ? 'Yes' : 'No';
    } else if (Array.isArray(rawVal)) {
      // Arrays are handled separately or stringified if primitive
      if (rawVal.length === 0) {
        row[key] = '';
      } else if (typeof rawVal[0] !== 'object') {
        row[key] = rawVal.join(', ');
      } else {
        row[key] = JSON.stringify(rawVal);
      }
    } else if (typeof rawVal === 'object') {
      if (rawVal._bsontype === 'ObjectID' || rawVal._id) {
        row[key] = String(rawVal._id || rawVal);
      } else {
        row[key] = JSON.stringify(rawVal);
      }
    } else {
      row[key] = String(rawVal);
    }
  }
  return row;
}

/**
 * Generates a full Excel backup of all major collections in the system.
 *
 * @param {Date|string} [closeDate] - Optional close date reference
 * @returns {Promise<{ filePath: string, filename: string, totalRecords: number }>}
 */
async function generateFullBackup(closeDate) {
  const [
    orders,
    transactions,
    expenses,
    rawMaterials,
    annealingRecords,
    jobWorks,
    workers,
    workerLedgerEntries,
    consumptionMaterials,
    customers,
    suppliers,
    readyStock,
    personalPayments,
    activityLogs,
  ] = await Promise.all([
    Order.find().lean(),
    Transaction.find().lean(),
    Expense.find().lean(),
    RawMaterial.find().lean(),
    AnnealingRecord.find().lean(),
    JobWork.find().lean(),
    Worker.find().lean(),
    WorkerLedgerEntry.find().lean(),
    ConsumptionMaterial.find().lean(),
    Customer.find().lean(),
    Supplier.find().lean(),
    ReadyStock.find().lean(),
    PersonalPayment.find().lean(),
    ActivityLog.find().sort({ createdAt: -1 }).lean(),
  ]);

  const totalRecords =
    orders.length +
    transactions.length +
    expenses.length +
    rawMaterials.length +
    annealingRecords.length +
    jobWorks.length +
    workers.length +
    workerLedgerEntries.length +
    consumptionMaterials.length +
    customers.length +
    suppliers.length +
    readyStock.length +
    personalPayments.length +
    activityLogs.length;

  const wb = XLSX.utils.book_new();

  // Sheet 1: Orders
  const ordersRows = orders.map((o) => ({
    _id: String(o._id),
    orderDate: formatDate(o.orderDate),
    customerId: String(o.customerId || ''),
    customerName: o.customerName || '',
    wireNumber: o.wireNumber ?? '',
    wireType: o.wireType || '',
    wireSize: o.wireSize || '',
    coilCategory: o.coilCategory || '',
    initialWeightKg: formatValue(o.initialWeightKg),
    finalWeightKg: formatValue(o.finalWeightKg),
    ratePerKg: formatValue(o.ratePerKg),
    manufacturingCostPerKg: formatValue(o.manufacturingCostPerKg),
    totalAmount: formatValue(o.totalAmount),
    amountPaid: formatValue(o.amountPaid),
    amountDue: formatValue(o.amountDue),
    paymentMethod: o.paymentMethod || '',
    orderStatus: o.orderStatus || '',
    stockDeductedKg: formatValue(o.stockDeductedKg),
    stockPendingKg: formatValue(o.stockPendingKg),
    lowStockAlert: o.lowStockAlert ? 'Yes' : 'No',
    bundles: o.bundles ?? '',
    soldBy: o.soldBy || '',
    deliveryDate: formatDate(o.deliveryDate),
    heatingStartDate: formatDate(o.heatingStartDate),
    heatingEndDate: formatDate(o.heatingEndDate),
    notes: o.notes || '',
    createdAt: formatDate(o.createdAt),
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ordersRows), 'Orders');

  // Sheet 2: Transactions
  const transactionsRows = transactions.map((t) => ({
    _id: String(t._id),
    transactionDate: formatDate(t.transactionDate),
    transactionType: t.transactionType || '',
    amount: formatValue(t.amount),
    paymentMethod: t.paymentMethod || '',
    bankAccount: t.bankAccount || '',
    bankAccountOtherName: t.bankAccountOtherName || '',
    relatedTo: t.relatedTo || '',
    relatedId: t.relatedId ? String(t.relatedId) : '',
    relatedName: t.relatedName || '',
    sourceType: t.sourceType || '',
    sourceId: t.sourceId ? String(t.sourceId) : '',
    expenseGroup: t.expenseGroup || '',
    expenseCategory: t.expenseCategory || '',
    chequeNumber: t.chequeNumber || '',
    chequeType: t.chequeType || '',
    chequeBank: t.chequeBank || '',
    chequeDate: formatDate(t.chequeDate),
    description: t.description || '',
    handledBy: t.handledBy || '',
    createdAt: formatDate(t.createdAt),
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(transactionsRows), 'Transactions');

  // Sheet 3: Expenses
  const expensesRows = expenses.map((e) => ({
    _id: String(e._id),
    expenseDate: formatDate(e.expenseDate),
    expenseGroup: e.expenseGroup || '',
    expenseCategory: e.expenseCategory || '',
    expenseType: e.expenseType || '',
    description: e.description || '',
    amount: formatValue(e.amount),
    paymentMethod: e.paymentMethod || '',
    bankAccount: e.bankAccount || '',
    bankAccountOtherName: e.bankAccountOtherName || '',
    labourName: e.labourName || '',
    coilType: e.coilType || '',
    rentalRoute: e.rentalRoute || '',
    chequeNumber: e.chequeNumber || '',
    addedBy: e.addedBy || '',
    createdAt: formatDate(e.createdAt),
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(expensesRows), 'Expenses');

  // Sheet 4: Raw Materials
  const rawMaterialsRows = rawMaterials.map((r) => ({
    _id: String(r._id),
    purchaseDate: formatDate(r.purchaseDate),
    supplierId: r.supplierId ? String(r.supplierId) : '',
    supplierName: r.supplierName || '',
    coilCategory: r.coilCategory || '',
    materialType: r.materialType || '',
    weightInKg: formatValue(r.weightInKg),
    currentStock: formatValue(r.currentStock),
    ratePerKg: formatValue(r.ratePerKg),
    totalAmount: formatValue(r.totalAmount),
    amountPaid: formatValue(r.amountPaid),
    amountDue: formatValue(r.amountDue),
    bundles: r.bundles ?? 0,
    paymentMethod: r.paymentMethod || '',
    paidBy: r.paidBy || '',
    isReturn: r.isReturn ? 'Yes' : 'No',
    notes: r.notes || '',
    createdAt: formatDate(r.createdAt),
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rawMaterialsRows), 'Raw Materials');

  // Sheet 5: Annealing Records
  const annealingRows = annealingRecords.map((a) => ({
    _id: String(a._id),
    date: formatDate(a.date || a.sentDate),
    entryType: a.entryType || a.type || 'Send',
    partyType: a.partyType || '',
    partyId: a.partyId ? String(a.partyId) : '',
    partyName: a.partyName || a.supplierName || '',
    materialType: a.materialType || 'Coil',
    coilCategory: a.coilCategory || a.coilType || '',
    bundles: a.bundles ?? a.bundleCount ?? 0,
    weightKg: formatValue(a.weightKg ?? a.initialWeightKg),
    finalWeightKg: formatValue(a.finalWeightKg ?? a.returnedWeightKg),
    weightLossKg: formatValue(a.weightLossKg),
    sentBy: a.sentBy || '',
    receivedBy: a.receivedBy || '',
    notes: a.notes || '',
    createdAt: formatDate(a.createdAt),
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(annealingRows), 'Annealing Records');

  // Sheet 6: Job Work (Flatten deliveries and returns)
  const jobWorkRows = [];
  for (const j of jobWorks) {
    const baseInfo = {
      jobWorkId: String(j._id),
      customerId: j.customerId ? String(j.customerId) : '',
      customerName: j.customerName || '',
      coilCategory: j.coilCategory || '',
      arrivedWeightKg: formatValue(j.arrivedWeightKg),
      coilRatePerKg: formatValue(j.coilRatePerKg),
      arrivalDate: formatDate(j.arrivalDate),
      status: j.status || '',
      deliveredWeightTotal: formatValue(j.deliveredWeightKg),
      labourTotal: formatValue(j.labourTotal),
      jobNotes: j.notes || '',
      createdAt: formatDate(j.createdAt),
    };

    const deliveries = Array.isArray(j.deliveries) ? j.deliveries : [];
    const returns = Array.isArray(j.returns) ? j.returns : [];

    if (deliveries.length === 0 && returns.length === 0) {
      jobWorkRows.push({
        ...baseInfo,
        subType: 'Arrival Only',
        subWeightKg: '',
        subRatePerKg: '',
        subAmount: '',
        subDate: '',
        subWireNumber: '',
        subBundles: '',
        subNote: '',
      });
    } else {
      deliveries.forEach((d) => {
        jobWorkRows.push({
          ...baseInfo,
          subType: 'Delivery',
          subWeightKg: formatValue(d.weightKg),
          subRatePerKg: formatValue(d.labourRatePerKg),
          subAmount: formatValue(d.labourAmount),
          subDate: formatDate(d.deliveredDate),
          subWireNumber: d.wireNumber ?? '',
          subBundles: d.bundles ?? '',
          subNote: d.notes || '',
        });
      });
      returns.forEach((r) => {
        jobWorkRows.push({
          ...baseInfo,
          subType: 'Return',
          subWeightKg: formatValue(r.weightKg),
          subRatePerKg: '',
          subAmount: '',
          subDate: formatDate(r.returnDate),
          subWireNumber: '',
          subBundles: '',
          subNote: r.reason || r.note || '',
        });
      });
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(jobWorkRows), 'Job Work');

  // Sheet 7: Workers
  const workerRows = workers.map((w) => ({
    _id: String(w._id),
    name: w.name || '',
    phone: w.phone || '',
    role: w.role || '',
    active: w.active ? 'Yes' : 'No',
    openingBalance: formatValue(w.openingBalance),
    totalSalaryPaid: formatValue(w.totalSalaryPaid),
    totalAdvance: formatValue(w.totalAdvance),
    notes: w.notes || '',
    createdAt: formatDate(w.createdAt),
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(workerRows), 'Workers');

  // Sheet 8: Worker Ledger
  const workerLedgerRows = workerLedgerEntries.map((wl) => ({
    _id: String(wl._id),
    workerId: wl.workerId ? String(wl.workerId) : '',
    date: formatDate(wl.date),
    entryType: wl.entryType || '',
    amount: formatValue(wl.amount),
    paymentMethod: wl.paymentMethod || '',
    notes: wl.notes || '',
    addedBy: wl.addedBy || '',
    createdAt: formatDate(wl.createdAt),
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(workerLedgerRows), 'Worker Ledger');

  // Sheet 9: Consumption Materials (Flatten paymentHistory)
  const consumptionRows = [];
  for (const cm of consumptionMaterials) {
    const baseInfo = {
      _id: String(cm._id),
      materialType: cm.materialType || '',
      quantity: formatValue(cm.quantity),
      unit: cm.unit || 'kg',
      costPerUnit: formatValue(cm.costPerUnit),
      totalCost: formatValue(cm.totalCost),
      amountPaid: formatValue(cm.amountPaid),
      amountDue: formatValue(cm.amountDue),
      currentQuantity: formatValue(cm.currentQuantity),
      paymentStatus: cm.paymentStatus || '',
      supplierName: cm.supplierName || '',
      purchaseDate: formatDate(cm.purchaseDate),
      notes: cm.notes || '',
    };
    const payments = Array.isArray(cm.paymentHistory) ? cm.paymentHistory : [];
    if (payments.length === 0) {
      consumptionRows.push({
        ...baseInfo,
        paymentAmount: '',
        paymentDate: '',
        paymentMethod: '',
        paymentNote: '',
      });
    } else {
      payments.forEach((p) => {
        consumptionRows.push({
          ...baseInfo,
          paymentAmount: formatValue(p.amount),
          paymentDate: formatDate(p.paymentDate),
          paymentMethod: p.paymentMethod || '',
          paymentNote: p.note || '',
        });
      });
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(consumptionRows), 'Consumption Materials');

  // Sheet 10: Customers (Flatten paymentHistory)
  const customerRows = [];
  for (const c of customers) {
    const baseInfo = {
      _id: String(c._id),
      name: c.name || '',
      contactNumber: c.contactNumber || '',
      address: c.address || '',
      customerType: c.customerType || '',
      openingBalance: formatValue(c.openingBalance),
      openingBalanceType: c.openingBalanceType || 'none',
      totalOrders: c.totalOrders ?? 0,
      totalAmountPurchased: formatValue(c.totalAmountPurchased),
      totalAmountPaid: formatValue(c.totalAmountPaid),
      totalAmountDue: formatValue(c.totalAmountDue),
      linkedSupplierId: c.linkedSupplierId ? String(c.linkedSupplierId) : '',
    };
    const payments = Array.isArray(c.paymentHistory) ? c.paymentHistory : [];
    if (payments.length === 0) {
      customerRows.push({
        ...baseInfo,
        paymentAmount: '',
        paymentDate: '',
        paymentMethod: '',
        paymentReceivedBy: '',
        paymentNote: '',
      });
    } else {
      payments.forEach((p) => {
        customerRows.push({
          ...baseInfo,
          paymentAmount: formatValue(p.amount),
          paymentDate: formatDate(p.date),
          paymentMethod: p.paymentMethod || '',
          paymentReceivedBy: p.receivedBy || '',
          paymentNote: p.note || '',
        });
      });
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(customerRows), 'Customers');

  // Sheet 11: Suppliers
  const supplierRows = suppliers.map((s) => ({
    _id: String(s._id),
    name: s.name || '',
    contactNumber: s.contactNumber || '',
    companyName: s.companyName || '',
    address: s.address || '',
    materialTypes: Array.isArray(s.materialTypes) ? s.materialTypes.join(', ') : '',
    openingBalance: formatValue(s.openingBalance),
    openingBalanceType: s.openingBalanceType || 'none',
    totalAmountPurchased: formatValue(s.totalAmountPurchased),
    totalAmountPaid: formatValue(s.totalAmountPaid),
    totalAmountDue: formatValue(s.totalAmountDue),
    linkedCustomerId: s.linkedCustomerId ? String(s.linkedCustomerId) : '',
    createdAt: formatDate(s.createdAt),
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(supplierRows), 'Suppliers');

  // Sheet 12: Ready Stock
  const readyStockRows = readyStock.map((rs) => ({
    _id: String(rs._id),
    productionDate: formatDate(rs.productionDate),
    wireNumber: rs.wireNumber ?? '',
    wireLabel: rs.wireLabel || '',
    coilCategory: rs.coilCategory || '',
    weightKg: formatValue(rs.weightKg),
    bundles: rs.bundles ?? 0,
    source: rs.source || '',
    notes: rs.notes || '',
    createdAt: formatDate(rs.createdAt),
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(readyStockRows), 'Ready Stock');

  // Sheet 13: Personal Payments (Flatten payments)
  const personalPaymentRows = [];
  for (const pp of personalPayments) {
    const baseInfo = {
      _id: String(pp._id),
      categoryName: pp.categoryName || '',
      paymentDirection: pp.paymentDirection || '',
      categoryType: pp.categoryType || '',
      personName: pp.personName || '',
      expectedLumpSum: formatValue(pp.expectedLumpSum),
      totalContributed: formatValue(pp.totalContributed),
      remainingToContribute: formatValue(pp.remainingToContribute),
      status: pp.status || '',
      startDate: formatDate(pp.startDate),
      expectedReceiveDate: formatDate(pp.expectedReceiveDate),
      notes: pp.notes || '',
    };
    const payments = Array.isArray(pp.payments) ? pp.payments : [];
    if (payments.length === 0) {
      personalPaymentRows.push({
        ...baseInfo,
        paymentAmount: '',
        paymentDate: '',
        paymentMethod: '',
        paymentBankAccount: '',
        paymentNote: '',
      });
    } else {
      payments.forEach((p) => {
        personalPaymentRows.push({
          ...baseInfo,
          paymentAmount: formatValue(p.amount),
          paymentDate: formatDate(p.paymentDate),
          paymentMethod: p.paymentMethod || '',
          paymentBankAccount: p.bankAccount || '',
          paymentNote: p.note || '',
        });
      });
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(personalPaymentRows), 'Personal Payments');

  // Sheet 14: Activity Log
  const activityLogRows = activityLogs.map((al) => ({
    _id: String(al._id),
    createdAt: formatDate(al.createdAt),
    userName: al.userName || '',
    userRole: al.userRole || '',
    action: al.action || '',
    module: al.module || '',
    description: al.description || '',
    documentId: al.documentId || '',
    ipAddress: al.ipAddress || '',
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(activityLogRows), 'Activity Log');

  // Destination folder
  const backupDir = path.join(__dirname, '..', 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  // Generate filename: WMS_Backup_[DD-MM-YYYY]_[HH-mm].xlsx
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const filename = `WMS_Backup_${dd}-${mm}-${yyyy}_${hh}-${min}.xlsx`;
  const filePath = path.join(backupDir, filename);

  XLSX.writeFile(wb, filePath);

  return {
    filePath,
    filename,
    totalRecords,
  };
}

module.exports = {
  generateFullBackup,
};
