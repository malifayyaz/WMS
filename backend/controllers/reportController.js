const Transaction = require('../models/Transaction');
const Expense = require('../models/Expense');
const RawMaterial = require('../models/RawMaterial');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const ReadyStock = require('../models/ReadyStock');
const JobWork = require('../models/JobWork');
const AnnealingRecord = require('../models/AnnealingRecord');
const { buildDailyBookReport } = require('../utils/dailyBookReportService');
const { buildProfitReport, withDate } = require('../utils/profitReportService');
const { getCashBookRange } = require('../utils/cashBookService');
const { startOfDay } = require('date-fns');

/** Accrual P&L with Main, Processing/Labour and Combined scopes. */
const getProfitLoss = async (req, res, next) => {
  try {
    const { startDate, endDate, scope = 'combined' } = req.query;
    if (!['main', 'processing', 'combined'].includes(scope)) {
      return res.status(400).json({ success: false, message: 'scope must be main, processing, or combined' });
    }
    const data = await buildProfitReport({ startDate, endDate, scope });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

/**
 * Cash and Bank position for a period. Kept separate from accrual profit.
 */
const getFinancialReport = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'startDate and endDate are required' });
    }

    const [cashDays, transactions, expenses] = await Promise.all([
      getCashBookRange(startDate, endDate),
      Transaction.find(withDate('transactionDate', startDate, endDate)).sort({ transactionDate: 1 }),
      Expense.find(withDate('expenseDate', startDate, endDate)).sort({ expenseDate: 1 }),
    ]);

    const { buildBankBook } = require('../utils/bankBalanceService');
    const bankBook = await buildBankBook({ startDate, endDate });
    const bankOpening = bankBook.openingBalance;
    const bankIn = bankBook.totalIn;
    const bankOut = bankBook.totalOut;
    const bankRunning = bankBook.closingBalance;
    const bankRows = (bankBook.transactions || []).map((t) => ({
      _id: t._id,
      date: t.date,
      type: t.transactionType,
      account: t.bankAccount === 'Other' ? (t.bankAccountOtherName || 'Other') : (t.bankAccount || 'MBL'),
      party: t.relatedName || '',
      description: t.description || '',
      amount: t.amount || 0,
      balance: t.balance,
    }));

    const factoryExpenses = expenses.filter((e) => e.expenseGroup !== 'Self Expense');
    const selfExpenses = expenses.filter((e) => e.expenseGroup === 'Self Expense');
    const cashOpening = cashDays[0]?.openingBalance || 0;
    const cashClosing = cashDays[cashDays.length - 1]?.closingBalance || 0;
    const cashIn = cashDays.reduce((s, d) => s + (d.totalIn || 0), 0);
    const cashOut = cashDays.reduce((s, d) => s + (d.totalOut || 0), 0);

    res.json({
      success: true,
      data: {
        transactions,
        expenses,
        cash: {
          openingBalance: cashOpening,
          totalIn: cashIn,
          totalOut: cashOut,
          closingBalance: cashClosing,
          days: cashDays,
        },
        bank: {
          openingBalance: bankOpening,
          totalIn: bankIn,
          totalOut: bankOut,
          closingBalance: bankRunning,
          transactions: bankRows,
        },
        summary: {
          cashAndBankOpening: cashOpening + bankOpening,
          cashAndBankIn: cashIn + bankIn,
          cashAndBankOut: cashOut + bankOut,
          cashAndBankClosing: cashClosing + bankRunning,
          factoryExpenses: factoryExpenses.reduce((s, e) => s + (e.amount || 0), 0),
          selfExpenses: selfExpenses.reduce((s, e) => s + (e.amount || 0), 0),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Individual customer report (orders + payments).
 */
const getCustomerReport = async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ success: false, error: 'Customer not found', message: 'Customer not found' });
    const orders = await Order.find({ customerId: req.params.id }).sort({ orderDate: -1 });
    res.json({ success: true, data  : { customer, orders, paymentHistory: customer.paymentHistory || [] } });
  } catch (error) {
    next(error);
  }
};

/**
 * Full current inventory: own coil, ready wire, annealing pending and processing WIP.
 */
const getInventoryReport = async (req, res, next) => {
  try {
    const [rawSummary, readySummary, annealingRecords, jobs] = await Promise.all([
      RawMaterial.aggregate([
        { $match: { isReturn: { $ne: true } } },
        { $group: {
          _id: '$coilCategory',
          totalStock: { $sum: '$currentStock' },
          purchaseValue: { $sum: '$totalAmount' },
        } },
      ]),
      ReadyStock.aggregate([
        { $group: {
          _id: '$wireNumber',
          wireLabel: { $first: '$wireLabel' },
          totalStock: { $sum: '$weightKg' },
          bundles: { $sum: '$bundles' },
        } },
        { $sort: { _id: 1 } },
      ]),
      AnnealingRecord.find({ entryType: { $in: ['Send', 'Arrival', 'Sold'] } }).sort({ date: 1, createdAt: 1 }),
      JobWork.find().select('customerName coilCategory arrivedWeightKg deliveredWeightKg status'),
    ]);

    const annealingMap = new Map();
    annealingRecords.forEach((record) => {
      const key = [
        record.partyType || 'None',
        record.partyId ? String(record.partyId) : 'none',
        record.materialType || 'Coil',
        record.materialType === 'Wire' ? 'wire' : (record.coilCategory || 'Shiplet Coil'),
        record.materialType === 'Wire' ? (record.wireNumber || 'any') : '-',
      ].join('|');
      if (!annealingMap.has(key)) {
        annealingMap.set(key, {
          key,
          partyName: record.partyName || 'Own stock',
          materialType: record.materialType || 'Coil',
          coilCategory: record.coilCategory || '',
          wireNumber: record.wireNumber || null,
          remainingKg: 0,
          remainingBundles: 0,
        });
      }
      const pool = annealingMap.get(key);
      if (record.entryType === 'Send') {
        pool.remainingKg += record.weightKg || 0;
        pool.remainingBundles += record.bundles || 0;
      } else {
        pool.remainingKg = Math.max(0, pool.remainingKg - (record.weightKg || 0));
        pool.remainingBundles = Math.max(0, pool.remainingBundles - (record.bundles || 0));
      }
    });
    const annealingPending = Array.from(annealingMap.values())
      .filter((p) => p.remainingKg > 0.001 || p.remainingBundles > 0);

    const processingRows = jobs.map((job) => ({
      customerName: job.customerName || '',
      coilCategory: job.coilCategory || '',
      arrivedKg: job.arrivedWeightKg || 0,
      deliveredKg: job.deliveredWeightKg || 0,
      remainingKg: Math.max(0, (job.arrivedWeightKg || 0) - (job.deliveredWeightKg || 0)),
      status: job.status,
    }));
    const totals = {
      ownCoilKg: rawSummary.reduce((s, r) => s + (r.totalStock || 0), 0),
      readyWireKg: readySummary.reduce((s, r) => s + (r.totalStock || 0), 0),
      readyWireBundles: readySummary.reduce((s, r) => s + (r.bundles || 0), 0),
      annealingPendingKg: annealingPending.reduce((s, r) => s + (r.remainingKg || 0), 0),
      annealingPendingBundles: annealingPending.reduce((s, r) => s + (r.remainingBundles || 0), 0),
      processingRemainingKg: processingRows.reduce((s, r) => s + (r.remainingKg || 0), 0),
    };
    const lowStock = rawSummary.filter((s) => s.totalStock < 1000);
    res.json({
      success: true,
      data: {
        summary: rawSummary,
        rawStock: rawSummary,
        readyStock: readySummary,
        annealingPending,
        processingStock: processingRows,
        totals,
        lowStock,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Daily Book day/range report: money in/out, bank, sales/purchases, stock, annealing.
 */
const getDailyBookReport = async (req, res, next) => {
  try {
    const { date, startDate, endDate } = req.query;
    if (!date && !(startDate && endDate)) {
      return res.status(400).json({
        success: false,
        message: 'Provide date or startDate and endDate',
      });
    }
    const data = await buildDailyBookReport({ date, startDate, endDate });
    res.json({ success: true, data });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
};

module.exports = {
  getProfitLoss,
  getFinancialReport,
  getCustomerReport,
  getInventoryReport,
  getDailyBookReport,
};
