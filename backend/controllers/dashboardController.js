const Transaction = require('../models/Transaction');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const Supplier = require('../models/Supplier');
const RawMaterial = require('../models/RawMaterial');
const JobWork = require('../models/JobWork');
const AnnealingRecord = require('../models/AnnealingRecord');
const { startOfMonth, endOfMonth, subMonths, startOfDay, endOfDay } = require('date-fns');
const { getCashBookForDate } = require('../utils/cashBookService');
const { buildProfitReport } = require('../utils/profitReportService');

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

module.exports = { getStats, getCharts };
