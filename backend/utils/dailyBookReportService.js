const { startOfDay, endOfDay, addDays, isAfter, format } = require('date-fns');
const Transaction = require('../models/Transaction');
const Order = require('../models/Order');
const RawMaterial = require('../models/RawMaterial');
const AnnealingRecord = require('../models/AnnealingRecord');
const JobWork = require('../models/JobWork');
const Expense = require('../models/Expense');
const ConsumptionMaterial = require('../models/ConsumptionMaterial');
const { getCashBookForDate } = require('./cashBookService');

function normalizeDate(d) {
  return startOfDay(new Date(d));
}

function dayKey(d) {
  return format(normalizeDate(d), 'yyyy-MM-dd');
}

function inDay(date, day) {
  const s = normalizeDate(day);
  const e = endOfDay(s);
  const d = new Date(date);
  return d >= s && d <= e;
}

function moneyLine(t) {
  const isAtm = /ATM/i.test(t.description || '') || t.relatedName === 'ATM Withdrawal';
  return {
    _id: t._id,
    date: t.transactionDate,
    description: t.description || (isAtm ? 'ATM Withdrawal' : t.relatedName || t.transactionType),
    amount: t.amount || 0,
    paymentMethod: t.paymentMethod,
    relatedName: t.relatedName || '',
    relatedTo: t.relatedTo || '',
    source: t.sourceType || 'Manual',
    bankAccount: t.bankAccount || '',
    expenseGroup: t.expenseGroup || '',
    expenseCategory: t.expenseCategory || '',
    isAtm,
  };
}

async function getBankBookForDay(day) {
  const { buildBankBook } = require('./bankBalanceService');
  const ymd = normalizeDate(day).toISOString().slice(0, 10);
  const book = await buildBankBook({ startDate: ymd, endDate: ymd });
  return {
    openingBalance: book.openingBalance,
    totalIn: book.totalIn,
    totalOut: book.totalOut,
    closingBalance: book.closingBalance,
    transfers: (book.transactions || []).map((t) => ({
      _id: t._id,
      date: t.date,
      transactionType: t.transactionType,
      amount: t.amount || 0,
      relatedName: t.relatedName || '',
      bankAccount: t.bankAccount === 'Other' ? (t.bankAccountOtherName || 'Other') : (t.bankAccount || 'MBL'),
      description: t.description || '',
      isAtm: /ATM/i.test(t.description || '') || t.relatedName === 'ATM Withdrawal',
      balance: t.balance,
    })),
  };
}

async function buildDayReport(day) {
  const start = normalizeDate(day);
  const end = endOfDay(start);

  const [cash, bankSummary, txs, orders, purchases, annealing, jobWorks, expenses, processMaterials] = await Promise.all([
    getCashBookForDate(day),
    getBankBookForDay(day),
    Transaction.find({
      transactionDate: { $gte: start, $lte: end },
      sourceType: { $nin: ['Expense', 'ConsumptionMaterial'] },
    }).sort({ transactionDate: 1 }),
    Order.find({
      orderDate: { $gte: start, $lte: end },
      isReturn: { $ne: true },
    }).sort({ orderDate: 1 }),
    RawMaterial.find({
      purchaseDate: { $gte: start, $lte: end },
    }).sort({ purchaseDate: 1 }),
    AnnealingRecord.find({
      date: { $gte: start, $lte: end },
      entryType: { $in: ['Send', 'Arrival', 'Sold'] },
    }).sort({ date: 1 }),
    JobWork.find({
      $or: [
        { arrivalDate: { $gte: start, $lte: end } },
        { 'deliveries.deliveredDate': { $gte: start, $lte: end } },
      ],
    }),
    Expense.find({
      expenseDate: { $gte: start, $lte: end },
      expenseGroup: { $ne: 'Self Expense' },
      paymentMethod: { $ne: 'Bank Transfer' },
    }).sort({ expenseCategory: 1 }),
    ConsumptionMaterial.find({
      purchaseDate: { $gte: start, $lte: end },
    }).sort({ materialType: 1 }),
  ]);

  const returns = await Order.find({
    orderDate: { $gte: start, $lte: end },
    isReturn: true,
  });

  const cashTxs = txs.filter((t) => t.paymentMethod !== 'Bank Transfer');
  const moneyIn = cashTxs.filter((t) => t.transactionType === 'Money In').map(moneyLine);
  const moneyOutTx = cashTxs.filter((t) => t.transactionType === 'Money Out').map(moneyLine);

  // Expense day totals already folded into cash.totalOut — list them for clarity
  const expenseLines = [];
  if (cash?.expenseTotals) {
    if (cash.expenseTotals.factoryTotal > 0) {
      expenseLines.push({
        description: 'Factory Expense Total',
        amount: cash.expenseTotals.factoryTotal,
        paymentMethod: 'Cash',
        relatedName: 'Factory',
        source: 'Expense',
        expenseCategory: 'Daily Total',
      });
    }
    if (cash.expenseTotals.fayyaz > 0) {
      expenseLines.push({
        description: 'Self — Fayyaz Expense',
        amount: cash.expenseTotals.fayyaz,
        paymentMethod: 'Cash',
        relatedName: 'Fayyaz',
        source: 'Expense',
        expenseCategory: 'Fayyaz Expense',
      });
    }
    if (cash.expenseTotals.faisal > 0) {
      expenseLines.push({
        description: 'Self — Faisal Expense',
        amount: cash.expenseTotals.faisal,
        paymentMethod: 'Cash',
        relatedName: 'Faisal',
        source: 'Expense',
        expenseCategory: 'Faisal Expense',
      });
    }
    if (cash.expenseTotals.mutual > 0) {
      expenseLines.push({
        description: 'Self — Mutual Expense',
        amount: cash.expenseTotals.mutual,
        paymentMethod: 'Cash',
        relatedName: 'Mutual',
        source: 'Expense',
        expenseCategory: 'Mutual Expense',
      });
    }
  }
  const moneyOut = [...moneyOutTx, ...expenseLines];

  // Match cash.expenseTotals.factoryTotal exactly: cash-paid factory expenses
  // plus process-material purchases, grouped into report-friendly categories.
  const factoryCategoryMap = new Map();
  const addFactoryCategory = (category, group, amount) => {
    const key = `${group || 'Factory'}|${category || 'Uncategorised'}`;
    if (!factoryCategoryMap.has(key)) {
      factoryCategoryMap.set(key, {
        group: group || 'Factory',
        category: category || 'Uncategorised',
        amount: 0,
      });
    }
    factoryCategoryMap.get(key).amount += Number(amount) || 0;
  };
  expenses.forEach((expense) => {
    addFactoryCategory(
      expense.expenseCategory || 'Uncategorised',
      expense.expenseGroup || 'Factory',
      expense.amount
    );
  });
  processMaterials.forEach((material) => {
    addFactoryCategory(
      material.materialType || 'Process Material',
      'Process Material',
      material.totalCost
    );
  });
  const factoryExpenseBreakdown = Array.from(factoryCategoryMap.values())
    .filter((row) => row.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const materialLabel = (materialType, coilCategory, wireNumber) => {
    if (materialType === 'Wire') return wireNumber != null ? `Wire #${wireNumber}` : 'Wire';
    return coilCategory || materialType || 'Coil';
  };

  /** Detailed stock ledger rows: direction, party, material, kg, bundles, reason */
  const stockLedger = [];
  const pushStock = (row) => {
    stockLedger.push({
      direction: row.direction, // In | Out
      reason: row.reason,
      party: row.party || '',
      material: row.material || '',
      materialType: row.materialType || '',
      bundles: row.bundles || 0,
      weightKg: Number(row.weightKg) || 0,
    });
  };

  const sales = orders.map((o) => {
    const row = {
      customerName: o.customerName || '',
      wireNumber: o.wireNumber || null,
      coilCategory: o.coilCategory || '',
      weightKg: o.initialWeightKg || 0,
      bundles: o.bundles || 0,
      isAnnealed: !!o.isAnnealed,
    };
    pushStock({
      direction: 'Out',
      reason: row.isAnnealed ? 'Sale (annealed wire)' : 'Sale',
      party: row.customerName,
      material: materialLabel('Wire', row.coilCategory, row.wireNumber),
      materialType: 'Wire',
      bundles: row.bundles,
      weightKg: row.weightKg,
    });
    return row;
  });

  const purchaseRows = purchases
    .filter((r) => !r.isReturn)
    .map((r) => {
      const materialType = r.materialType || 'Coil';
      const row = {
        supplierName: r.supplierName || '',
        materialType,
        coilCategory: r.coilCategory || '',
        weightKg: r.weightInKg || 0,
        bundles: r.bundles || 0,
      };
      pushStock({
        direction: 'In',
        reason: 'Purchase / Stock arrival',
        party: row.supplierName,
        material: materialLabel(materialType, row.coilCategory, null),
        materialType,
        bundles: row.bundles,
        weightKg: row.weightKg,
      });
      return row;
    });

  const coilReturnRows = purchases.filter((r) => r.isReturn).map((r) => {
    const row = {
      supplierName: r.supplierName || '',
      materialType: r.materialType || 'Coil',
      coilCategory: r.coilCategory || '',
      weightKg: r.weightInKg || 0,
      bundles: r.bundles || 0,
      ratePerKg: r.ratePerKg || 0,
      totalAmount: r.totalAmount || 0,
      date: r.purchaseDate,
      notes: r.notes || '',
    };
    pushStock({
      direction: 'Out',
      reason: 'Coil return to supplier',
      party: row.supplierName,
      material: materialLabel(row.materialType, row.coilCategory, null),
      materialType: 'Coil',
      bundles: row.bundles,
      weightKg: row.weightKg,
    });
    return row;
  });

  const annealingSent = annealing
    .filter((a) => a.entryType === 'Send')
    .map((a) => {
      const row = {
        partyName: a.partyName || 'Own stock (no party)',
        materialType: a.materialType || 'Coil',
        coilCategory: a.coilCategory || '',
        wireNumber: a.wireNumber || null,
        bundles: a.bundles || 0,
        weightKg: a.weightKg || 0,
      };
      pushStock({
        direction: 'Out',
        reason: 'Sent for annealing',
        party: row.partyName,
        material: materialLabel(row.materialType, row.coilCategory, row.wireNumber),
        materialType: row.materialType,
        bundles: row.bundles,
        weightKg: row.weightKg,
      });
      return row;
    });

  const annealingArrived = annealing
    .filter((a) => a.entryType === 'Arrival')
    .map((a) => {
      const row = {
        partyName: a.partyName || 'Own stock (no party)',
        materialType: a.materialType || 'Coil',
        coilCategory: a.coilCategory || '',
        wireNumber: a.wireNumber || null,
        bundles: a.bundles || 0,
        weightKg: a.weightKg || 0,
        finalWeightKg: a.finalWeightKg || 0,
      };
      pushStock({
        direction: 'In',
        reason: 'Arrival from annealing',
        party: row.partyName,
        material: materialLabel(row.materialType, row.coilCategory, row.wireNumber),
        materialType: row.materialType,
        bundles: row.bundles,
        weightKg: row.finalWeightKg || row.weightKg,
      });
      return row;
    });

  // Sold is reported as annealing consumption detail, but not pushed to stock
  // ledger because the same quantity is already represented by the Sale row.
  const annealingSold = annealing
    .filter((a) => a.entryType === 'Sold')
    .map((a) => ({
      partyName: a.partyName || 'Own stock (no party)',
      customerName: (a.notes || '').match(/^Sold to (.*?) —/)?.[1] || '',
      materialType: a.materialType || 'Wire',
      coilCategory: a.coilCategory || '',
      wireNumber: a.wireNumber || null,
      bundles: a.bundles || 0,
      weightKg: a.weightKg || 0,
      date: a.date,
      notes: a.notes || '',
    }));

  const processingArrivals = [];
  const processingDeliveries = [];
  jobWorks.forEach((jw) => {
    if (jw.arrivalDate && inDay(jw.arrivalDate, day)) {
      const row = {
        customerName: jw.customerName || '',
        coilCategory: jw.coilCategory || '',
        weightKg: jw.arrivedWeightKg || 0,
        bundles: 0,
      };
      processingArrivals.push(row);
      pushStock({
        direction: 'In',
        reason: 'Processing — coil arrival',
        party: row.customerName,
        material: materialLabel('Coil', row.coilCategory, null),
        materialType: 'Coil',
        bundles: 0,
        weightKg: row.weightKg,
      });
    }
    (jw.deliveries || []).forEach((d) => {
      if (d.deliveredDate && inDay(d.deliveredDate, day)) {
        const row = {
          customerName: jw.customerName || '',
          coilCategory: jw.coilCategory || '',
          wireNumber: d.wireNumber || null,
          weightKg: d.weightKg || 0,
          bundles: d.bundles || 0,
          labourRatePerKg: d.labourRatePerKg || 0,
          labourAmount: d.labourAmount || 0,
        };
        processingDeliveries.push(row);
        pushStock({
          direction: 'Out',
          reason: 'Processing — wire delivery',
          party: row.customerName,
          material: materialLabel('Wire', row.coilCategory, row.wireNumber),
          materialType: 'Wire',
          bundles: row.bundles,
          weightKg: row.weightKg,
        });
      }
    });
  });

  const returnRows = returns.map((r) => {
    const row = {
      customerName: r.customerName || '',
      wireNumber: r.wireNumber || null,
      coilCategory: r.coilCategory || '',
      weightKg: r.initialWeightKg || 0,
      bundles: r.bundles || 0,
    };
    pushStock({
      direction: 'In',
      reason: 'Customer return',
      party: row.customerName,
      material: materialLabel('Wire', row.coilCategory, row.wireNumber),
      materialType: 'Wire',
      bundles: row.bundles,
      weightKg: row.weightKg,
    });
    return row;
  });

  // Aggregate totals from stock ledger
  const categoryMap = new Map();
  let wireOutKg = 0;
  let wireInKg = 0;
  let coilInKg = 0;
  let coilOutKg = 0;
  stockLedger.forEach((r) => {
    const key = r.material || 'Unknown';
    if (!categoryMap.has(key)) categoryMap.set(key, { category: key, inKg: 0, outKg: 0, inBundles: 0, outBundles: 0 });
    const cat = categoryMap.get(key);
    if (r.direction === 'In') {
      cat.inKg += r.weightKg;
      cat.inBundles += r.bundles;
      if (r.materialType === 'Wire') wireInKg += r.weightKg;
      else coilInKg += r.weightKg;
    } else {
      cat.outKg += r.weightKg;
      cat.outBundles += r.bundles;
      if (r.materialType === 'Wire') wireOutKg += r.weightKg;
      else coilOutKg += r.weightKg;
    }
  });

  const annealSentKg = annealingSent.reduce((s, r) => s + (r.weightKg || 0), 0);
  const annealSentBundles = annealingSent.reduce((s, r) => s + (r.bundles || 0), 0);
  const annealArrivedKg = annealingArrived.reduce((s, r) => s + (r.finalWeightKg || r.weightKg || 0), 0);
  const annealArrivedBundles = annealingArrived.reduce((s, r) => s + (r.bundles || 0), 0);
  const annealSoldKg = annealingSold.reduce((s, r) => s + (r.weightKg || 0), 0);
  const annealSoldBundles = annealingSold.reduce((s, r) => s + (r.bundles || 0), 0);

  return {
    date: start,
    cash: cash
      ? {
          openingBalance: cash.openingBalance,
          totalIn: cash.totalIn,
          totalOut: cash.totalOut,
          closingBalance: cash.closingBalance,
          bankIn: cash.bankIn || 0,
          bankOut: cash.bankOut || 0,
          expenseTotals: cash.expenseTotals,
          factoryExpenseBreakdown,
          openingSource: cash.openingSource,
        }
      : null,
    moneyIn,
    moneyOut,
    moneyInTotal: moneyIn.reduce((s, r) => s + (r.amount || 0), 0),
    moneyOutTotal: cash?.totalOut || moneyOut.reduce((s, r) => s + (r.amount || 0), 0),
    bankTransfers: bankSummary.transfers,
    bankSummary: {
      openingBalance: bankSummary.openingBalance,
      totalIn: bankSummary.totalIn,
      totalOut: bankSummary.totalOut,
      closingBalance: bankSummary.closingBalance,
    },
    sales,
    purchases: purchaseRows,
    totalSalesKg: sales.reduce((s, r) => s + (r.weightKg || 0), 0),
    totalSalesBundles: sales.reduce((s, r) => s + (r.bundles || 0), 0),
    totalPurchasesKg: purchaseRows.reduce((s, r) => s + (r.weightKg || 0), 0),
    totalPurchasesBundles: purchaseRows.reduce((s, r) => s + (r.bundles || 0), 0),
    stockMovements: {
      wireOutKg,
      wireInKg,
      coilInKg,
      coilOutKg,
      byCategory: Array.from(categoryMap.values()),
      ledger: stockLedger,
    },
    annealing: {
      sent: annealingSent,
      arrived: annealingArrived,
      sold: annealingSold,
      totals: {
        sentKg: annealSentKg,
        sentBundles: annealSentBundles,
        arrivedKg: annealArrivedKg,
        arrivedBundles: annealArrivedBundles,
        soldKg: annealSoldKg,
        soldBundles: annealSoldBundles,
      },
    },
    processing: {
      arrivals: processingArrivals,
      deliveries: processingDeliveries,
      totals: {
        coilInKg: processingArrivals.reduce((s, r) => s + (r.weightKg || 0), 0),
        wireOutKg: processingDeliveries.reduce((s, r) => s + (r.weightKg || 0), 0),
        wireOutBundles: processingDeliveries.reduce((s, r) => s + (r.bundles || 0), 0),
        labourEarned: processingDeliveries.reduce((s, r) => s + (r.labourAmount || 0), 0),
      },
    },
    returns: returnRows,
    coilReturns: coilReturnRows,
  };
}

/**
 * Build daily book report for a single date or inclusive date range.
 */
async function buildDailyBookReport({ date, startDate, endDate }) {
  let start;
  let end;
  if (startDate && endDate) {
    start = normalizeDate(startDate);
    end = normalizeDate(endDate);
  } else if (date) {
    start = normalizeDate(date);
    end = start;
  } else {
    throw Object.assign(new Error('date or startDate/endDate required'), { statusCode: 400 });
  }
  if (isAfter(start, end)) {
    throw Object.assign(new Error('startDate must be before endDate'), { statusCode: 400 });
  }

  const days = [];
  for (let d = start; !isAfter(d, end); d = addDays(d, 1)) {
    days.push(await buildDayReport(d));
  }

  const rangeFactoryMap = new Map();
  days.forEach((day) => {
    (day.cash?.factoryExpenseBreakdown || []).forEach((row) => {
      const key = `${row.group}|${row.category}`;
      if (!rangeFactoryMap.has(key)) {
        rangeFactoryMap.set(key, { group: row.group, category: row.category, amount: 0 });
      }
      rangeFactoryMap.get(key).amount += row.amount || 0;
    });
  });

  const rangeSummary = {
    totalMoneyIn: days.reduce((s, d) => s + (d.cash?.totalIn || 0), 0),
    totalMoneyOut: days.reduce((s, d) => s + (d.cash?.totalOut || 0), 0),
    netCash: 0,
    totalSalesKg: days.reduce((s, d) => s + (d.totalSalesKg || 0), 0),
    totalPurchasesKg: days.reduce((s, d) => s + (d.totalPurchasesKg || 0), 0),
    annealSentKg: days.reduce((s, d) => s + (d.annealing?.totals?.sentKg || 0), 0),
    annealArrivedKg: days.reduce((s, d) => s + (d.annealing?.totals?.arrivedKg || 0), 0),
    annealSoldKg: days.reduce((s, d) => s + (d.annealing?.totals?.soldKg || 0), 0),
    processingCoilInKg: days.reduce((s, d) => s + (d.processing?.totals?.coilInKg || 0), 0),
    processingWireOutKg: days.reduce((s, d) => s + (d.processing?.totals?.wireOutKg || 0), 0),
    processingLabourEarned: days.reduce((s, d) => s + (d.processing?.totals?.labourEarned || 0), 0),
    coilReturnsKg: days.reduce(
      (s, d) => s + (d.coilReturns || []).reduce((total, row) => total + (row.weightKg || 0), 0),
      0
    ),
    totalBankIn: days.reduce((s, d) => s + (d.bankSummary?.totalIn || 0), 0),
    totalBankOut: days.reduce((s, d) => s + (d.bankSummary?.totalOut || 0), 0),
    openingBalance: days[0]?.cash?.openingBalance || 0,
    closingBalance: days[days.length - 1]?.cash?.closingBalance || 0,
    factoryExpenseTotal: days.reduce(
      (s, d) => s + (d.cash?.expenseTotals?.factoryTotal || 0),
      0
    ),
    factoryExpenseBreakdown: Array.from(rangeFactoryMap.values())
      .sort((a, b) => b.amount - a.amount),
  };
  rangeSummary.netCash = rangeSummary.totalMoneyIn - rangeSummary.totalMoneyOut;

  return {
    mode: days.length === 1 ? 'single' : 'range',
    startDate: dayKey(start),
    endDate: dayKey(end),
    days,
    rangeSummary,
  };
}

module.exports = { buildDailyBookReport, buildDayReport };
