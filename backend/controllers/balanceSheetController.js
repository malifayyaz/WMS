const { startOfDay, endOfDay } = require('date-fns');
const Customer = require('../models/Customer');
const Supplier = require('../models/Supplier');
const RawMaterial = require('../models/RawMaterial');
const ReadyStock = require('../models/ReadyStock');
const Order = require('../models/Order');
const Transaction = require('../models/Transaction');
const PersonalPayment = require('../models/PersonalPayment');
const { getCashBookForDate } = require('../utils/cashBookService');
const { buildAccountSummaries } = require('../utils/bankBalanceService');
const { buildProfitReport } = require('../utils/profitReportService');

/**
 * GET /api/balance-sheet
 * Generates comprehensive Balance Sheet (Assets, Liabilities, Net Worth / Equity)
 */
exports.getBalanceSheet = async (req, res, next) => {
  try {
    const { date, startDate, endDate } = req.query;

    const asOfDate = date ? new Date(date) : new Date();

    // 1. ASSETS

    // 1a. Cash in Hand
    let cashInHand = 0;
    try {
      const cashBook = await getCashBookForDate(asOfDate);
      cashInHand = cashBook?.closingBalance || 0;
    } catch {
      cashInHand = 0;
    }

    // 1b. Bank Balances
    let bankAccounts = [];
    let totalBankBalance = 0;
    try {
      bankAccounts = await buildAccountSummaries();
      totalBankBalance = bankAccounts.reduce((sum, a) => sum + (a.balance || 0), 0);
    } catch {
      bankAccounts = [];
      totalBankBalance = 0;
    }

    // 1c. Raw Material Stock Value
    const rawMaterials = await RawMaterial.find({ isReturn: { $ne: true } }).lean();
    const rawMaterialValue = rawMaterials.reduce((sum, rm) => {
      const stock = Number(rm.currentStock != null ? rm.currentStock : rm.weightInKg) || 0;
      const rate = Number(rm.ratePerKg) || 0;
      return sum + (stock > 0 ? stock * rate : 0);
    }, 0);
    const rawMaterialWeightKg = rawMaterials.reduce((sum, rm) => {
      const stock = Number(rm.currentStock != null ? rm.currentStock : rm.weightInKg) || 0;
      return sum + (stock > 0 ? stock : 0);
    }, 0);

    // 1d. Ready Stock Value
    const readyStockItems = await ReadyStock.find().lean();
    const totalReadyStockKg = readyStockItems.reduce((sum, s) => sum + (s.weightKg || 0), 0);

    // Average selling rate from recent orders
    const recentOrders = await Order.find().sort({ orderDate: -1 }).limit(30).lean();
    const avgOrderRate = recentOrders.length
      ? recentOrders.reduce((sum, o) => sum + (o.ratePerKg || 0), 0) / recentOrders.length
      : 270;
    const readyStockValue = Math.round(totalReadyStockKg * avgOrderRate);

    // 1e. Receivables
    // Customer Accounts (Ledger)
    const ledgerCustomers = await Customer.find({ customerType: { $ne: 'Processing' }, totalAmountDue: { $gt: 0 } }).lean();
    const customerReceivables = ledgerCustomers.reduce((sum, c) => sum + (c.totalAmountDue || 0), 0);

    // Processing Customers
    const processingCustomers = await Customer.find({ customerType: 'Processing', totalAmountDue: { $gt: 0 } }).lean();
    const processingReceivables = processingCustomers.reduce((sum, c) => sum + (c.totalAmountDue || 0), 0);

    // Personal Receivables (Committees, Savings, Loans Given)
    let personalReceivables = 0;
    let personalReceivableItems = [];
    try {
      personalReceivableItems = await PersonalPayment.find({ status: 'Active', paymentDirection: { $ne: 'Payable' } }).lean();
      personalReceivables = personalReceivableItems.reduce((sum, p) => sum + (p.expectedLumpSum || 0), 0);
    } catch {
      personalReceivables = 0;
    }

    const totalLiquidAssets = cashInHand + totalBankBalance;
    const totalReceivables = customerReceivables + processingReceivables + personalReceivables;
    const totalInventoryValue = rawMaterialValue + readyStockValue;
    const totalAssets = totalLiquidAssets + totalReceivables + totalInventoryValue;

    // 2. LIABILITIES

    // 2a. Supplier Payables
    const suppliers = await Supplier.find({ totalAmountDue: { $gt: 0 } }).lean();
    const supplierPayables = suppliers.reduce((sum, s) => sum + (s.totalAmountDue || 0), 0);

    // 2b. Raw Material Lot Dues (informational breakdown)
    const rawMaterialLotsWithDue = await RawMaterial.find({ amountDue: { $gt: 0 } }).lean();
    const rawMaterialDues = rawMaterialLotsWithDue.reduce((sum, rm) => sum + (rm.amountDue || 0), 0);

    // 2c. Personal Payables (Loans Taken)
    let personalPayables = 0;
    let personalPayableItems = [];
    try {
      personalPayableItems = await PersonalPayment.find({ status: 'Active', paymentDirection: 'Payable' }).lean();
      personalPayables = personalPayableItems.reduce((sum, p) => sum + (p.remainingToContribute || p.expectedLumpSum || 0), 0);
    } catch {
      personalPayables = 0;
    }

    const totalLiabilities = supplierPayables + personalPayables;

    // 3. EQUITY / NET POSITION
    let cumulativeProfit = 0;
    try {
      const profitReport = await buildProfitReport(
        startDate || null,
        endDate || asOfDate.toISOString().slice(0, 10),
        'combined'
      );
      cumulativeProfit = profitReport?.data?.netProfit || 0;
    } catch {
      cumulativeProfit = 0;
    }

    // Self Expenses Total
    const selfExpenseTxns = await Transaction.find({ expenseGroup: 'Self Expense' }).lean();
    const totalSelfExpenses = selfExpenseTxns.reduce((sum, t) => sum + (t.amount || 0), 0);

    const netWorth = totalAssets - totalLiabilities;

    res.json({
      success: true,
      data: {
        asOf: asOfDate,
        assets: {
          cashInHand,
          bankBalance: totalBankBalance,
          bankAccounts,
          totalLiquidAssets,
          customerReceivables,
          customerCount: ledgerCustomers.length,
          processingReceivables,
          processingCount: processingCustomers.length,
          personalReceivables,
          personalReceivableItems,
          totalReceivables,
          rawMaterialValue,
          rawMaterialWeightKg,
          readyStockValue,
          totalReadyStockKg,
          totalInventoryValue,
          totalAssets,
        },
        liabilities: {
          supplierPayables,
          supplierCount: suppliers.length,
          rawMaterialDues,
          personalPayables,
          personalPayableItems,
          totalLiabilities,
        },
        equity: {
          cumulativeProfit,
          totalSelfExpenses,
          netWorth,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};
