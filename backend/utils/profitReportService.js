const { startOfDay, endOfDay } = require('date-fns');
const Order = require('../models/Order');
const RawMaterial = require('../models/RawMaterial');
const JobWork = require('../models/JobWork');
const Transaction = require('../models/Transaction');
const Expense = require('../models/Expense');
const ConsumptionMaterial = require('../models/ConsumptionMaterial');
const Customer = require('../models/Customer');
const AnnealingRecord = require('../models/AnnealingRecord');
const ReadyStock = require('../models/ReadyStock');

const SHIPLET_COIL = 'Shiplet Coil';
const PATRI_COIL = 'Patri Coil';
const WASTAGE_RATE = 0.05;

function dateRange(startDate, endDate) {
  const range = {};
  if (startDate) range.$gte = startOfDay(new Date(startDate));
  if (endDate) range.$lte = endOfDay(new Date(endDate));
  return range;
}

function withDate(field, startDate, endDate) {
  const range = dateRange(startDate, endDate);
  return Object.keys(range).length ? { [field]: range } : {};
}

function sum(rows, field) {
  return rows.reduce((total, row) => total + (Number(row[field]) || 0), 0);
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function groupTotals(rows, keyField, amountField) {
  const totals = new Map();
  rows.forEach((row) => {
    const key = row[keyField] || 'Uncategorised';
    totals.set(key, (totals.get(key) || 0) + (Number(row[amountField]) || 0));
  });
  return Array.from(totals.entries())
    .map(([label, amount]) => ({ label, amount: round2(amount) }))
    .sort((a, b) => b.amount - a.amount);
}

/** One printable P&L line. `kind` drives styling in UI and exports. */
function line(label, amount, kind = 'item') {
  return { label, amount: round2(amount), kind };
}

function orderRow(order) {
  return {
    _id: order._id,
    date: order.orderDate,
    customerName: order.customerName || '',
    wireNumber: order.wireNumber || null,
    wireType: order.wireType || '',
    bundles: order.bundles || 0,
    weightKg: order.finalWeightKg ?? order.initialWeightKg ?? 0,
    ratePerKg: order.ratePerKg || 0,
    amount: order.totalAmount || 0,
    coilCategory: order.coilCategory || '',
    isAnnealed: !!order.isAnnealed,
  };
}

function rawRow(raw) {
  return {
    _id: raw._id,
    date: raw.purchaseDate,
    supplierName: raw.supplierName || '',
    coilCategory: raw.coilCategory || '',
    materialType: raw.materialType || raw.coilCategory || 'Coil',
    bundles: raw.bundles || 0,
    weightKg: raw.weightInKg || 0,
    ratePerKg: raw.ratePerKg || 0,
    amount: raw.totalAmount || 0,
    currentStock: raw.currentStock || 0,
  };
}

function matchesCoilCategory(coilCategory, filterKey) {
  if (!filterKey) return true;
  const cat = String(coilCategory || '');
  if (filterKey === SHIPLET_COIL) return cat.includes('Shiplet');
  if (filterKey === PATRI_COIL) return cat.includes('Patri');
  return true;
}

function buildCoilAnalysisSlice(
  label,
  categoryKey,
  purchases,
  coilReturns,
  sales,
  wireReturns,
  stockLots,
  readyStockRows
) {
  const buys = purchases.filter((row) => matchesCoilCategory(row.coilCategory, categoryKey));
  const buyReturns = coilReturns.filter((row) => matchesCoilCategory(row.coilCategory, categoryKey));
  const sells = sales.filter((row) => matchesCoilCategory(row.coilCategory, categoryKey));
  const sellReturns = wireReturns.filter((row) => matchesCoilCategory(row.coilCategory, categoryKey));

  const purchaseKg = sum(buys, 'weightKg') - sum(buyReturns, 'weightKg');
  const purchaseAmount = sum(buys, 'amount') - sum(buyReturns, 'amount');
  const salesKg = sum(sells, 'weightKg') - sum(sellReturns, 'weightKg');
  const salesAmount = sum(sells, 'amount') - sum(sellReturns, 'amount');

  const lots = stockLots.filter(
    (lot) => matchesCoilCategory(lot.coilCategory, categoryKey) && (lot.currentStock || 0) > 0
  );
  const stockKg = lots.reduce((total, lot) => total + (lot.currentStock || 0), 0);
  const stockValue = lots.reduce(
    (total, lot) => total + (lot.currentStock || 0) * (lot.ratePerKg || 0),
    0
  );

  const readyRows = readyStockRows.filter((row) => {
    const cat = row.coilCategory || (row.wireNumber === 20 ? PATRI_COIL : SHIPLET_COIL);
    return matchesCoilCategory(cat, categoryKey);
  });
  const readyStockKg = sum(readyRows, 'weightKg');
  const avgPurchaseRate = purchaseKg > 0 ? purchaseAmount / purchaseKg : 0;
  const avgSaleRate = salesKg > 0 ? salesAmount / salesKg : 0;
  const avgStockPurchaseRate = stockKg > 0 ? stockValue / stockKg : 0;
  const estimatedReadyStockValue = readyStockKg > 0 && avgSaleRate > 0
    ? readyStockKg * avgSaleRate
    : 0;

  return {
    label,
    periodPurchaseKg: round2(Math.max(0, purchaseKg)),
    periodPurchaseAmount: round2(Math.max(0, purchaseAmount)),
    avgPurchaseRate: round2(avgPurchaseRate),
    periodSalesKg: round2(Math.max(0, salesKg)),
    periodSalesAmount: round2(Math.max(0, salesAmount)),
    avgSaleRate: round2(avgSaleRate),
    stockKg: round2(stockKg),
    stockValue: round2(stockValue),
    avgStockPurchaseRate: round2(avgStockPurchaseRate),
    readyStockKg: round2(readyStockKg),
    estimatedReadyStockValue: round2(estimatedReadyStockValue),
    avgReadyStockSaleRate: round2(avgSaleRate),
  };
}

/**
 * Accrual profitability:
 * - Main earns when an order is recorded, not when cash is collected.
 * - Processing earns when wire delivery labour is charged.
 * - Shared factory/self expenses are deducted only in Combined.
 */
async function buildProfitReport({ startDate, endDate, scope = 'combined' } = {}) {
  const [
    orders,
    rawMaterials,
    jobWorks,
    expenses,
    consumptionMaterials,
    processingCustomers,
    annealingPeriod,
    allAnnealing,
    stockLots,
    readyStockRows,
  ] = await Promise.all([
    Order.find(withDate('orderDate', startDate, endDate)).sort({ orderDate: 1 }),
    RawMaterial.find(withDate('purchaseDate', startDate, endDate)).sort({ purchaseDate: 1 }),
    JobWork.find().sort({ arrivalDate: 1 }),
    Expense.find(withDate('expenseDate', startDate, endDate)).sort({ expenseDate: 1 }),
    ConsumptionMaterial.find(withDate('purchaseDate', startDate, endDate)).sort({ purchaseDate: 1 }),
    Customer.find({ customerType: 'Processing' }).select('_id name'),
    AnnealingRecord.find(withDate('date', startDate, endDate)).sort({ date: 1, createdAt: 1 }),
    AnnealingRecord.find({ entryType: { $in: ['Send', 'Arrival', 'Sold'] } }).sort({ date: 1, createdAt: 1 }),
    RawMaterial.find({ isReturn: { $ne: true }, currentStock: { $gt: 0 } }).select(
      'coilCategory currentStock ratePerKg totalAmount weightInKg'
    ).lean(),
    ReadyStock.find({ weightKg: { $gt: 0 } }).select('wireNumber coilCategory weightKg bundles').lean(),
  ]);

  const sales = orders.filter((order) => !order.isReturn).map(orderRow);
  const wireReturns = orders.filter((order) => order.isReturn).map(orderRow);
  const purchases = rawMaterials.filter((raw) => !raw.isReturn).map(rawRow);
  const coilReturns = rawMaterials.filter((raw) => raw.isReturn).map(rawRow);

  const mainSalesEarned = sum(sales, 'amount');
  const wireReturnCredits = sum(wireReturns, 'amount');
  const netMainRevenue = mainSalesEarned - wireReturnCredits;
  const rawPurchases = sum(purchases, 'amount');
  const coilReturnCredits = sum(coilReturns, 'amount');
  const netMaterialCost = rawPurchases - coilReturnCredits;
  const mainGrossProfit = netMainRevenue - netMaterialCost;
  const wastageDeduction = round2(Math.max(0, mainGrossProfit) * WASTAGE_RATE);
  const coilAnalysis = {
    shiplet: buildCoilAnalysisSlice(
      'Shiplet Coil',
      SHIPLET_COIL,
      purchases,
      coilReturns,
      sales,
      wireReturns,
      stockLots,
      readyStockRows
    ),
    patri: buildCoilAnalysisSlice(
      'Patri Coil',
      PATRI_COIL,
      purchases,
      coilReturns,
      sales,
      wireReturns,
      stockLots,
      readyStockRows
    ),
    combined: buildCoilAnalysisSlice(
      'Combined (All Coil)',
      null,
      purchases,
      coilReturns,
      sales,
      wireReturns,
      stockLots,
      readyStockRows
    ),
    wastage: {
      rate: WASTAGE_RATE,
      basisLabel: '5% of main gross profit',
      amount: wastageDeduction,
    },
  };
  const annealingRows = annealingPeriod.map((record) => ({
    _id: record._id,
    date: record.date,
    entryType: record.entryType,
    partyName: record.partyName || 'Own stock',
    materialType: record.materialType || 'Coil',
    coilCategory: record.coilCategory || '',
    wireNumber: record.wireNumber || null,
    bundles: record.bundles || 0,
    weightKg: record.entryType === 'Arrival'
      ? (record.finalWeightKg || record.weightKg || 0)
      : (record.weightKg || 0),
  }));
  const annealingPools = new Map();
  allAnnealing.forEach((record) => {
    const key = [
      record.partyType || 'None',
      record.partyId ? String(record.partyId) : 'none',
      record.materialType || 'Coil',
      record.materialType === 'Wire' ? 'wire' : (record.coilCategory || 'Shiplet Coil'),
      record.materialType === 'Wire' ? (record.wireNumber || 'any') : '-',
    ].join('|');
    if (!annealingPools.has(key)) {
      annealingPools.set(key, {
        key,
        partyName: record.partyName || 'Own stock',
        materialType: record.materialType || 'Coil',
        coilCategory: record.coilCategory || '',
        wireNumber: record.wireNumber || null,
        remainingKg: 0,
        remainingBundles: 0,
      });
    }
    const pool = annealingPools.get(key);
    if (record.entryType === 'Send') {
      pool.remainingKg += record.weightKg || 0;
      pool.remainingBundles += record.bundles || 0;
    } else {
      pool.remainingKg = Math.max(0, pool.remainingKg - (record.weightKg || 0));
      pool.remainingBundles = Math.max(0, pool.remainingBundles - (record.bundles || 0));
    }
  });
  const annealingPending = Array.from(annealingPools.values())
    .filter((pool) => pool.remainingKg > 0.001 || pool.remainingBundles > 0);

  const processingArrivals = [];
  const processingDeliveries = [];
  jobWorks.forEach((job) => {
    const arrivalInRange = !startDate && !endDate
      ? true
      : job.arrivalDate >= (startDate ? startOfDay(new Date(startDate)) : new Date(0))
        && job.arrivalDate <= (endDate ? endOfDay(new Date(endDate)) : new Date());
    if (arrivalInRange) {
      processingArrivals.push({
        jobWorkId: job._id,
        date: job.arrivalDate,
        customerId: job.customerId,
        customerName: job.customerName || '',
        coilCategory: job.coilCategory || '',
        weightKg: job.arrivedWeightKg || 0,
      });
    }
    (job.deliveries || []).forEach((delivery) => {
      const deliveredDate = delivery.deliveredDate || job.arrivalDate;
      const inRange = !startDate && !endDate
        ? true
        : deliveredDate >= (startDate ? startOfDay(new Date(startDate)) : new Date(0))
          && deliveredDate <= (endDate ? endOfDay(new Date(endDate)) : new Date());
      if (!inRange) return;
      processingDeliveries.push({
        jobWorkId: job._id,
        deliveryId: delivery._id,
        date: deliveredDate,
        customerId: job.customerId,
        customerName: job.customerName || '',
        coilCategory: job.coilCategory || '',
        wireNumber: delivery.wireNumber || null,
        bundles: delivery.bundles || 0,
        weightKg: delivery.weightKg || 0,
        labourRatePerKg: delivery.labourRatePerKg || 0,
        labourAmount: delivery.labourAmount || 0,
      });
    });
  });

  const labourEarned = sum(processingDeliveries, 'labourAmount');
  const processingIds = processingCustomers.map((customer) => customer._id);
  const processingPayments = processingIds.length
    ? await Transaction.find({
        ...withDate('transactionDate', startDate, endDate),
        transactionType: 'Money In',
        relatedTo: 'Customer',
        relatedId: { $in: processingIds },
        sourceType: { $ne: 'Order' },
      }).sort({ transactionDate: 1 })
    : [];
  const labourReceived = sum(processingPayments, 'amount');
  const labourOutstanding = labourEarned - labourReceived;

  const selfExpenses = expenses.filter((expense) => expense.expenseGroup === 'Self Expense');
  const factoryExpenses = expenses.filter((expense) => expense.expenseGroup !== 'Self Expense');
  const factoryExpenseTotal = sum(factoryExpenses, 'amount');
  const selfExpenseTotal = sum(selfExpenses, 'amount');
  const consumptionCost = sum(consumptionMaterials, 'totalCost');
  const combinedGrossProfit = mainGrossProfit + labourEarned;
  const mainNetBeforeWastage = mainGrossProfit - factoryExpenseTotal - consumptionCost;
  const mainNetProfit = mainNetBeforeWastage - wastageDeduction;
  const finalNetProfit = combinedGrossProfit - factoryExpenseTotal - consumptionCost - selfExpenseTotal - wastageDeduction;

  const main = {
    sales,
    returns: wireReturns,
    purchases,
    coilReturns,
    salesEarned: round2(mainSalesEarned),
    wireReturnCredits: round2(wireReturnCredits),
    netRevenue: round2(netMainRevenue),
    rawPurchases: round2(rawPurchases),
    coilReturnCredits: round2(coilReturnCredits),
    netMaterialCost: round2(netMaterialCost),
    grossProfit: round2(mainGrossProfit),
    wastageDeduction,
    factoryExpenses: round2(factoryExpenseTotal),
    consumptionMaterials: round2(consumptionCost),
    netProfit: round2(mainNetProfit),
    coilAnalysis,
    salesWeightKg: round2(sum(sales, 'weightKg')),
    salesBundles: sum(sales, 'bundles'),
    purchaseWeightKg: round2(sum(purchases, 'weightKg')),
    purchaseBundles: sum(purchases, 'bundles'),
    annealing: {
      rows: annealingRows,
      pending: annealingPending,
      sentKg: round2(sum(annealingRows.filter((row) => row.entryType === 'Send'), 'weightKg')),
      sentBundles: sum(annealingRows.filter((row) => row.entryType === 'Send'), 'bundles'),
      arrivedKg: round2(sum(annealingRows.filter((row) => row.entryType === 'Arrival'), 'weightKg')),
      arrivedBundles: sum(annealingRows.filter((row) => row.entryType === 'Arrival'), 'bundles'),
      soldKg: round2(sum(annealingRows.filter((row) => row.entryType === 'Sold'), 'weightKg')),
      soldBundles: sum(annealingRows.filter((row) => row.entryType === 'Sold'), 'bundles'),
      pendingKg: round2(sum(annealingPending, 'remainingKg')),
      pendingBundles: sum(annealingPending, 'remainingBundles'),
    },
    expenseBreakdown: {
      factoryByGroup: groupTotals(factoryExpenses, 'expenseGroup', 'amount'),
      factoryByCategory: groupTotals(factoryExpenses, 'expenseCategory', 'amount'),
      consumptionByType: groupTotals(consumptionMaterials, 'materialType', 'totalCost'),
      factoryTotal: round2(factoryExpenseTotal),
      consumptionTotal: round2(consumptionCost),
    },
    statement: [
      line('Sales earned (wire sold)', mainSalesEarned, 'add'),
      line('Less: wire returns by customers', -wireReturnCredits, 'less'),
      line('Net Revenue', netMainRevenue, 'subtotal'),
      line('Coil purchases from suppliers', -rawPurchases, 'less'),
      line('Add back: coil returned to suppliers', coilReturnCredits, 'add'),
      line('Net Material Cost (COGS)', -netMaterialCost, 'subtotal'),
      line('MAIN GROSS PROFIT', mainGrossProfit, 'total'),
      line('Less: factory expenses', -factoryExpenseTotal, 'less'),
      line('Less: consumption materials', -consumptionCost, 'less'),
      line('Less: wastage allowance (5% of gross profit)', -wastageDeduction, 'less'),
      line('MAIN NET PROFIT', mainNetProfit, 'total'),
    ],
  };

  const processing = {
    arrivals: processingArrivals,
    deliveries: processingDeliveries,
    payments: processingPayments.map((payment) => ({
      _id: payment._id,
      date: payment.transactionDate,
      customerName: payment.relatedName || '',
      description: payment.description || 'Processing payment received',
      amount: payment.amount || 0,
      paymentMethod: payment.paymentMethod || '',
    })),
    labourEarned: round2(labourEarned),
    labourReceived: round2(labourReceived),
    labourOutstanding: round2(labourOutstanding),
    directProfit: round2(labourEarned),
    coilInKg: round2(sum(processingArrivals, 'weightKg')),
    wireOutKg: round2(sum(processingDeliveries, 'weightKg')),
    wireOutBundles: sum(processingDeliveries, 'bundles'),
    currentWipKg: round2(jobWorks.reduce(
      (total, job) => total + Math.max(0, (job.arrivedWeightKg || 0) - (job.deliveredWeightKg || 0)),
      0
    )),
    statement: [
      line('Labour charged on wire delivered', labourEarned, 'add'),
      line('PROCESSING DIRECT PROFIT', labourEarned, 'total'),
      line('Labour received in cash/bank', labourReceived, 'item'),
      line('Labour still outstanding', labourOutstanding, 'item'),
    ],
  };

  const combined = {
    mainGrossProfit: round2(mainGrossProfit),
    processingDirectProfit: round2(labourEarned),
    grossProfit: round2(combinedGrossProfit),
    factoryExpenses: round2(factoryExpenseTotal),
    consumptionMaterials: round2(consumptionCost),
    selfExpenses: round2(selfExpenseTotal),
    wastageDeduction,
    finalNetProfit: round2(finalNetProfit),
    coilAnalysis,
    factoryExpenseRows: factoryExpenses,
    selfExpenseRows: selfExpenses,
    consumptionRows: consumptionMaterials,
    expenseBreakdown: {
      factoryByGroup: groupTotals(factoryExpenses, 'expenseGroup', 'amount'),
      factoryByCategory: groupTotals(factoryExpenses, 'expenseCategory', 'amount'),
      selfByCategory: groupTotals(selfExpenses, 'expenseCategory', 'amount'),
      consumptionByType: groupTotals(consumptionMaterials, 'materialType', 'totalCost'),
      factoryTotal: round2(factoryExpenseTotal),
      selfTotal: round2(selfExpenseTotal),
      consumptionTotal: round2(consumptionCost),
    },
    statement: [
      line('Main gross profit (wire trade)', mainGrossProfit, 'add'),
      line('Processing direct profit (labour)', labourEarned, 'add'),
      line('GROSS PROFIT', combinedGrossProfit, 'total'),
      line('Less: factory expenses', -factoryExpenseTotal, 'less'),
      line('Less: consumption materials', -consumptionCost, 'less'),
      line('Less: self expenses (personal drawings)', -selfExpenseTotal, 'less'),
      line('Less: wastage allowance (5% of main gross profit)', -wastageDeduction, 'less'),
      line('NET PROFIT', finalNetProfit, 'total'),
    ],
  };

  const hasActivity = Boolean(
    sales.length || purchases.length || processingDeliveries.length || expenses.length
  );

  return {
    basis: 'accrual',
    startDate: startDate || null,
    endDate: endDate || null,
    scope,
    hasActivity,
    availableDataRange: hasActivity ? null : await findAvailableDataRange(),
    main,
    processing,
    combined,
    data: scope === 'main' ? main : scope === 'processing' ? processing : combined,
  };
}

/** Oldest and newest recorded activity, used to explain an empty period. */
async function findAvailableDataRange() {
  const sources = [
    [Order, 'orderDate'],
    [RawMaterial, 'purchaseDate'],
    [Expense, 'expenseDate'],
    [JobWork, 'arrivalDate'],
  ];
  const bounds = await Promise.all(
    sources.map(async ([Model, field]) => {
      const [oldest, newest] = await Promise.all([
        Model.findOne().sort({ [field]: 1 }).select(field),
        Model.findOne().sort({ [field]: -1 }).select(field),
      ]);
      return [oldest?.[field] || null, newest?.[field] || null];
    })
  );
  const dates = bounds.flat().filter(Boolean).map((date) => new Date(date).getTime());
  if (!dates.length) return null;
  return {
    firstEntry: new Date(Math.min(...dates)).toISOString().slice(0, 10),
    lastEntry: new Date(Math.max(...dates)).toISOString().slice(0, 10),
  };
}

module.exports = {
  buildProfitReport,
  dateRange,
  withDate,
};
