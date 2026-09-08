const { startOfDay, endOfDay } = require('date-fns');
const Customer = require('../models/Customer');
const Supplier = require('../models/Supplier');
const AnnealingPerson = require('../models/AnnealingPerson');
const RawMaterial = require('../models/RawMaterial');
const ReadyStock = require('../models/ReadyStock');
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

    // Calculate average raw material rate per coil category (Patri & Shiplet)
    const allRawMaterials = await RawMaterial.find({ isReturn: { $ne: true } }).lean();
    const patriCoils = allRawMaterials.filter(rm => rm.coilCategory === 'Patri Coil' && (Number(rm.currentStock != null ? rm.currentStock : rm.weightInKg) || 0) > 0);
    const shipletCoils = allRawMaterials.filter(rm => rm.coilCategory !== 'Patri Coil' && (Number(rm.currentStock != null ? rm.currentStock : rm.weightInKg) || 0) > 0);
    const avgPatriRate = patriCoils.length > 0
      ? patriCoils.reduce((sum, rm) => sum + (rm.ratePerKg || 0), 0) / patriCoils.length
      : 0;
    const avgShipletRate = shipletCoils.length > 0
      ? shipletCoils.reduce((sum, rm) => sum + (rm.ratePerKg || 0), 0) / shipletCoils.length
      : 0;
    // Simple average of both category rates
    const avgRawRate = (avgPatriRate > 0 && avgShipletRate > 0)
      ? (avgPatriRate + avgShipletRate) / 2
      : (avgPatriRate || avgShipletRate || 270);

    // Value ready stock at the average raw material rate (same coil, unsold)
    const readyStockValue = Math.round(readyStockItems.reduce((sum, s) => {
      const weight = s.weightKg || 0;
      const rate = s.manufacturingCostPerKg || avgRawRate;
      return sum + (weight * rate);
    }, 0));

    // 1e. Receivables (Ledgers with Debit/Positive Balances for Customers, or Negative/Advances for Suppliers)
    // Customer Accounts (Ledger)
    const allCustomers = await Customer.find().lean();
    
    // Normal Customers
    const ledgerCustomers = allCustomers.filter(c => c.customerType !== 'Processing');
    const customerReceivables = ledgerCustomers.filter(c => c.totalAmountDue > 0).reduce((sum, c) => sum + c.totalAmountDue, 0);
    const customerAdvances = ledgerCustomers.filter(c => c.totalAmountDue < 0).reduce((sum, c) => sum + Math.abs(c.totalAmountDue), 0);

    // Processing Customers
    const processingCustomers = allCustomers.filter(c => c.customerType === 'Processing');
    const processingReceivables = processingCustomers.filter(c => c.totalAmountDue > 0).reduce((sum, c) => sum + c.totalAmountDue, 0);
    const processingAdvances = processingCustomers.filter(c => c.totalAmountDue < 0).reduce((sum, c) => sum + Math.abs(c.totalAmountDue), 0);
    
    // Calculate Processing Customer Stock (Job Work Coil) value as an Asset
    const totalProcessingStockKg = processingCustomers.reduce((sum, c) => sum + (c.processingWeightKg || 0), 0);
    const processingStockValue = Math.round(totalProcessingStockKg * avgRawRate);

    // Supplier Advances (Debit Balances)
    const allSuppliers = await Supplier.find().lean();
    const supplierAdvances = allSuppliers.filter(s => s.totalAmountDue < 0).reduce((sum, s) => sum + Math.abs(s.totalAmountDue), 0);

    // Annealing Person Advances (Debit Balances)
    const allAnnealers = await AnnealingPerson.find().lean();
    const annealingAdvances = allAnnealers.filter(a => a.totalAmountDue < 0).reduce((sum, a) => sum + Math.abs(a.totalAmountDue), 0);

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
    const totalReceivables = customerReceivables + processingReceivables + personalReceivables + supplierAdvances + annealingAdvances;
    const totalInventoryValue = rawMaterialValue + readyStockValue + processingStockValue;
    const totalAssets = totalLiquidAssets + totalReceivables + totalInventoryValue;

    // 2. LIABILITIES

    // 2a. Payables (Ledgers with Credit/Positive Balances for Suppliers/Annealers, or Negative/Advances for Customers)
    const supplierPayables = allSuppliers.filter(s => s.totalAmountDue > 0).reduce((sum, s) => sum + s.totalAmountDue, 0);
    const annealingPayables = allAnnealers.filter(a => a.totalAmountDue > 0).reduce((sum, a) => sum + a.totalAmountDue, 0);
    const customerPayables = customerAdvances + processingAdvances; // Advances received from customers are our liabilities

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

    const totalLiabilities = supplierPayables + annealingPayables + customerPayables + personalPayables;

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
          customerCount: ledgerCustomers.filter(c => c.totalAmountDue > 0).length,
          processingReceivables,
          processingCount: processingCustomers.filter(c => c.totalAmountDue > 0).length,
          supplierAdvances,
          annealingAdvances,
          personalReceivables,
          personalReceivableItems,
          totalReceivables,
          rawMaterialValue,
          rawMaterialWeightKg,
          readyStockValue,
          totalReadyStockKg,
          processingStockValue,
          totalProcessingStockKg,
          avgRawRate: Math.round(avgRawRate * 100) / 100,
          totalInventoryValue,
          totalAssets,
        },
        liabilities: {
          supplierPayables,
          supplierCount: allSuppliers.filter(s => s.totalAmountDue > 0).length,
          annealingPayables,
          annealingCount: allAnnealers.filter(a => a.totalAmountDue > 0).length,
          customerPayables,
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
