const Transaction = require('../models/Transaction');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const Supplier = require('../models/Supplier');
const RawMaterial = require('../models/RawMaterial');
const JobWork = require('../models/JobWork');
const AnnealingRecord = require('../models/AnnealingRecord');
const {
  startOfMonth,
  endOfMonth,
  subMonths,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  parseISO,
  isValid,
} = require('date-fns');
const { getCashBookForDate } = require('../utils/cashBookService');
const { buildProfitReport } = require('../utils/profitReportService');

function dayKey(d) {
  return format(d, 'yyyy-MM-dd');
}

function resolveActivityRange(period, dateParam) {
  let anchor = new Date();
  if (dateParam) {
    const parsed = typeof dateParam === 'string' ? parseISO(dateParam.slice(0, 10)) : new Date(dateParam);
    if (isValid(parsed)) anchor = parsed;
  }

  const mode = period === 'month' ? 'month' : 'week';
  let start;
  let end;
  let label;

  if (mode === 'month') {
    start = startOfMonth(anchor);
    end = endOfMonth(anchor);
    label = format(start, 'MMMM yyyy');
  } else {
    start = startOfWeek(anchor, { weekStartsOn: 1 });
    end = endOfWeek(anchor, { weekStartsOn: 1 });
    label = `${format(start, 'dd MMM')} – ${format(end, 'dd MMM yyyy')}`;
  }

  return {
    period: mode,
    start: startOfDay(start),
    end: endOfDay(end),
    label,
    anchor: dayKey(anchor),
  };
}

function emptyDayBucket(date) {
  return {
    date: dayKey(date),
    label: format(date, 'dd MMM'),
    weekday: format(date, 'EEE'),
    salesKg: 0,
    salesBundles: 0,
    salesAmount: 0,
    purchaseKg: 0,
    purchaseBundles: 0,
    purchaseAmount: 0,
    moneyIn: 0,
    moneyOut: 0,
  };
}

async function currentBankBalance() {
  const { currentBankBalance: calc } = require('../utils/bankBalanceService');
  return calc();
}

async function annealingPendingTotals() {
  const records = await AnnealingRecord.find({
    entryType: { $in: ['Send', 'Arrival', 'Sold'] },
  }).sort({ date: 1, createdAt: 1 });
  const pools = new Map();
  records.forEach((record) => {
    const key = [
      record.partyType || 'None',
      record.partyId ? String(record.partyId) : 'none',
      record.materialType || 'Coil',
      record.materialType === 'Wire' ? 'wire' : (record.coilCategory || 'Shiplet Coil'),
      record.materialType === 'Wire' ? (record.wireNumber || 'any') : '-',
    ].join('|');
    if (!pools.has(key)) pools.set(key, { kg: 0, bundles: 0 });
    const pool = pools.get(key);
    if (record.entryType === 'Send') {
      pool.kg += record.weightKg || 0;
      pool.bundles += record.bundles || 0;
    } else {
      pool.kg = Math.max(0, pool.kg - (record.weightKg || 0));
      pool.bundles = Math.max(0, pool.bundles - (record.bundles || 0));
    }
  });
  return Array.from(pools.values()).reduce(
    (totals, pool) => ({
      kg: totals.kg + pool.kg,
      bundles: totals.bundles + pool.bundles,
    }),
    { kg: 0, bundles: 0 }
  );
}

/**
 * Dashboard command view: corrected monthly profit plus today's cash/stock operations.
 */
const getStats = async (req, res, next) => {
  try {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const [
      profit,
      cashBook,
      bankBalance,
      annealingPending,
      customers,
      suppliers,
      inProcessCount,
      stockSummary,
      jobs,
      todayOrders,
      todayPurchases,
    ] = await Promise.all([
      buildProfitReport({
        startDate: monthStart.toISOString(),
        endDate: monthEnd.toISOString(),
        scope: 'combined',
      }),
      getCashBookForDate(now),
      currentBankBalance(),
      annealingPendingTotals(),
      Customer.aggregate([{ $group: { _id: null, pending: { $sum: '$totalAmountDue' } } }]),
      Supplier.aggregate([{ $group: { _id: null, pending: { $sum: '$totalAmountDue' } } }]),
      Order.countDocuments({ orderStatus: 'In Process' }),
      RawMaterial.aggregate([
        { $match: { isReturn: { $ne: true } } },
        { $group: { _id: '$coilCategory', totalStock: { $sum: '$currentStock' } } },
      ]),
      JobWork.find().select('arrivedWeightKg deliveredWeightKg'),
      Order.find({
        orderDate: { $gte: todayStart, $lte: todayEnd },
        isReturn: { $ne: true },
      }).select('initialWeightKg finalWeightKg bundles'),
      RawMaterial.find({
        purchaseDate: { $gte: todayStart, $lte: todayEnd },
        isReturn: { $ne: true },
      }).select('weightInKg bundles'),
    ]);

    const lowStockItems = stockSummary.filter((s) => s.totalStock < 1000);
    const lowStockCount = lowStockItems.length;
    const lowStockTotalKg = lowStockItems.reduce((sum, item) => sum + (item.totalStock || 0), 0);
    const processingRemainingKg = jobs.reduce(
      (sum, job) => sum + Math.max(0, (job.arrivedWeightKg || 0) - (job.deliveredWeightKg || 0)),
      0
    );
    const todaySalesKg = todayOrders.reduce(
      (sum, order) => sum + (order.finalWeightKg ?? order.initialWeightKg ?? 0),
      0
    );
    const todayPurchasesKg = todayPurchases.reduce((sum, raw) => sum + (raw.weightInKg || 0), 0);

    res.json({
      success: true,
      data: {
        totalRevenueThisMonth: profit.main.netRevenue + profit.processing.labourEarned,
        monthMainGrossProfit: profit.main.grossProfit,
        monthProcessingLabour: profit.processing.labourEarned,
        monthCombinedGrossProfit: profit.combined.grossProfit,
        monthFinalNetProfit: profit.combined.finalNetProfit,
        totalExpenses: profit.combined.factoryExpenses + profit.combined.selfExpenses,
        pendingFromCustomers: customers[0]?.pending || 0,
        pendingToSuppliers: suppliers[0]?.pending || 0,
        activeOrdersInProcess: inProcessCount,
        lowStockAlertsCount: lowStockCount,
        lowStockTotalKg,
        cashOpeningToday: cashBook?.openingBalance || 0,
        cashInToday: cashBook?.totalIn || 0,
        cashOutToday: cashBook?.totalOut || 0,
        cashClosingToday: cashBook?.closingBalance || 0,
        bankBalance,
        annealingPendingKg: annealingPending.kg,
        annealingPendingBundles: annealingPending.bundles,
        processingRemainingKg,
        todaySalesKg,
        todaySalesBundles: todayOrders.reduce((s, order) => s + (order.bundles || 0), 0),
        todayPurchasesKg,
        todayPurchaseBundles: todayPurchases.reduce((s, raw) => s + (raw.bundles || 0), 0),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Chart data uses the same corrected accrual P&L as Reports.
 */
const getCharts = async (req, res, next) => {
  try {
    const monthSpecs = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      const start = startOfMonth(d);
      const end = endOfMonth(d);
      monthSpecs.push({ start, end });
    }

    const [profitReports, orderStatusCounts, recentTransactions, topCustomers] = await Promise.all([
      Promise.all(
        monthSpecs.map(({ start, end }) =>
          buildProfitReport({
            startDate: start.toISOString(),
            endDate: end.toISOString(),
            scope: 'combined',
          })
        )
      ),
      Order.aggregate([{ $group: { _id: '$orderStatus', count: { $sum: 1 } } }]),
      Transaction.find().sort({ transactionDate: -1 }).limit(10).lean(),
      Customer.find().sort({ totalAmountPurchased: -1 }).limit(5).select('name totalAmountPurchased totalAmountDue'),
    ]);

    const monthlyData = monthSpecs.map(({ start }, idx) => {
      const profit = profitReports[idx];
      return {
        month: start.toISOString().slice(0, 7),
        label: start.toLocaleString('default', { month: 'short', year: '2-digit' }),
        mainGross: profit.main.grossProfit,
        processingLabour: profit.processing.labourEarned,
        expenses: profit.combined.factoryExpenses + profit.combined.selfExpenses,
        netProfit: profit.combined.finalNetProfit,
      };
    });

    const statusMap = { Outer: 0, 'In Process': 0, Done: 0 };
    orderStatusCounts.forEach((s) => (statusMap[s._id] = s.count));

    res.json({
      success: true,
      data: {
        monthlyRevenueVsExpenses: monthlyData,
        ordersByStatus: statusMap,
        topCustomers,
        recentTransactions,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Week/month activity series for dashboard analytics widgets.
 * Query: period=week|month, date=YYYY-MM-DD (any day inside the desired period)
 */
const getActivity = async (req, res, next) => {
  try {
    const { period = 'week', date } = req.query;
    const range = resolveActivityRange(period, date);
    const { start, end } = range;

    const days = eachDayOfInterval({ start, end });
    const buckets = new Map(days.map((d) => [dayKey(d), emptyDayBucket(d)]));

    const [orders, purchases, transactions] = await Promise.all([
      Order.find({
        orderDate: { $gte: start, $lte: end },
        isReturn: { $ne: true },
      })
        .select('orderDate finalWeightKg initialWeightKg bundles totalAmount ratePerKg customerName')
        .populate('customerId', 'name')
        .lean(),
      RawMaterial.find({
        purchaseDate: { $gte: start, $lte: end },
        isReturn: { $ne: true },
      })
        .select('purchaseDate weightInKg bundles totalAmount ratePerKg supplierName')
        .lean(),
      Transaction.find({
        transactionDate: { $gte: start, $lte: end },
      })
        .sort({ transactionDate: -1 })
        .select('transactionDate transactionType amount relatedName description paymentMethod sourceType')
        .lean(),
    ]);

    orders.forEach((order) => {
      const key = dayKey(order.orderDate);
      const bucket = buckets.get(key);
      if (!bucket) return;
      const kg = order.finalWeightKg ?? order.initialWeightKg ?? 0;
      const amount =
        order.totalAmount != null
          ? Number(order.totalAmount) || 0
          : kg * (Number(order.ratePerKg) || 0);
      bucket.salesKg += kg;
      bucket.salesBundles += order.bundles || 0;
      bucket.salesAmount += amount;
    });

    purchases.forEach((raw) => {
      const key = dayKey(raw.purchaseDate);
      const bucket = buckets.get(key);
      if (!bucket) return;
      bucket.purchaseKg += raw.weightInKg || 0;
      bucket.purchaseBundles += raw.bundles || 0;
      const purchaseAmount =
        raw.totalAmount != null
          ? Number(raw.totalAmount) || 0
          : (raw.weightInKg || 0) * (Number(raw.ratePerKg) || 0);
      bucket.purchaseAmount = (bucket.purchaseAmount || 0) + purchaseAmount;
    });

    transactions.forEach((tx) => {
      const key = dayKey(tx.transactionDate);
      const bucket = buckets.get(key);
      if (!bucket) return;
      if (tx.transactionType === 'Money In') bucket.moneyIn += tx.amount || 0;
      else if (tx.transactionType === 'Money Out') bucket.moneyOut += tx.amount || 0;
    });

    const series = days.map((d) => buckets.get(dayKey(d)));

    const totals = series.reduce(
      (acc, day) => {
        acc.salesKg += day.salesKg;
        acc.salesBundles += day.salesBundles;
        acc.salesAmount += day.salesAmount;
        acc.purchaseKg += day.purchaseKg;
        acc.purchaseBundles += day.purchaseBundles;
        acc.purchaseAmount += day.purchaseAmount || 0;
        acc.moneyIn += day.moneyIn;
        acc.moneyOut += day.moneyOut;
        return acc;
      },
      {
        salesKg: 0,
        salesBundles: 0,
        salesAmount: 0,
        purchaseKg: 0,
        purchaseBundles: 0,
        purchaseAmount: 0,
        moneyIn: 0,
        moneyOut: 0,
      }
    );
    totals.netCash = totals.moneyIn - totals.moneyOut;

    const activityMix = [
      { name: 'Sales', value: Math.round(totals.salesAmount * 100) / 100 },
      { name: 'Purchases', value: Math.round(totals.purchaseAmount * 100) / 100 },
      { name: 'Money In', value: Math.round(totals.moneyIn * 100) / 100 },
      { name: 'Money Out', value: Math.round(totals.moneyOut * 100) / 100 },
    ].filter((item) => item.value > 0);

    const latestFromOrders = orders.slice(0, 12).map((order) => {
      const kg = order.finalWeightKg ?? order.initialWeightKg ?? 0;
      const amount =
        order.totalAmount != null
          ? Number(order.totalAmount) || 0
          : kg * (Number(order.ratePerKg) || 0);
      const party = order.customerId?.name || order.customerName || 'Customer';
      return {
        id: String(order._id),
        kind: 'Sale',
        date: order.orderDate,
        title: party,
        detail: `${Number(kg).toFixed(1)} kg${order.bundles ? ` / ${order.bundles} bundles` : ''}`,
        amount,
      };
    });

    const latestFromTx = transactions.slice(0, 12).map((tx) => ({
      id: String(tx._id),
      kind: tx.transactionType === 'Money In' ? 'Money In' : 'Money Out',
      date: tx.transactionDate,
      title: tx.relatedName || tx.description || tx.paymentMethod || 'Transaction',
      detail: tx.description || tx.paymentMethod || '',
      amount: tx.amount || 0,
    }));

    const latestFromPurchases = purchases.slice(0, 8).map((raw) => {
      const amount =
        raw.totalAmount != null
          ? Number(raw.totalAmount) || 0
          : (raw.weightInKg || 0) * (Number(raw.ratePerKg) || 0);
      return {
        id: String(raw._id),
        kind: 'Purchase',
        date: raw.purchaseDate,
        title: raw.supplierName || 'Supplier',
        detail: `${Number(raw.weightInKg || 0).toFixed(1)} kg`,
        amount,
      };
    });

    const latestActivity = [...latestFromOrders, ...latestFromTx, ...latestFromPurchases]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 8);

    res.json({
      success: true,
      data: {
        period: range.period,
        startDate: dayKey(start),
        endDate: dayKey(end),
        label: range.label,
        anchor: range.anchor,
        series,
        totals,
        activityMix,
        latestActivity,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getStats, getCharts, getActivity };
