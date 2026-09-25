const { startOfDay, endOfDay } = require('date-fns');
const Customer = require('../models/Customer');
const Supplier = require('../models/Supplier');
const AnnealingPerson = require('../models/AnnealingPerson');
const RawMaterial = require('../models/RawMaterial');
const ReadyStock = require('../models/ReadyStock');
const JobWork = require('../models/JobWork');
const Transaction = require('../models/Transaction');
const PersonalPayment = require('../models/PersonalPayment');
const Order = require('../models/Order');
const { buildProfitReport } = require('../utils/profitReportService');

function getOrderWeight(order) {
  if (order.finalWeightKg > 0) return order.finalWeightKg;
  if (order.initialWeightKg > 0) return order.initialWeightKg;
  return 0;
}

exports.getBalanceSheet = async (req, res, next) => {
  try {
    const { date, startDate, endDate } = req.query;
    const asOfDate = date ? endOfDay(new Date(date)) : new Date();

    const PeriodClose = require('../models/PeriodClose');
    const latestClose = await PeriodClose.findOne({
      closeDate: { $lte: asOfDate },
      status: 'Completed'
    }).sort({ closeDate: -1 }).lean();
    
    const latestOB = await RawMaterial.findOne({
      purchaseDate: { $lte: asOfDate },
      isOpeningBalance: true
    }).sort({ purchaseDate: -1 }).lean();

    let dawnOfTime = new Date(0);
    if (latestClose && latestOB) {
      dawnOfTime = startOfDay(new Date(Math.max(new Date(latestClose.closeDate).getTime(), new Date(latestOB.purchaseDate).getTime())));
    } else if (latestOB) {
      dawnOfTime = startOfDay(new Date(latestOB.purchaseDate));
    } else if (latestClose) {
      dawnOfTime = startOfDay(new Date(latestClose.closeDate));
    }

    // 1. ASSETS
    // 1a & 1b. Cash and Bank Balances
    const transactions = await Transaction.find({ transactionDate: { $gte: dawnOfTime, $lte: asOfDate } }).lean();
    
    let cashInHand = 0;
    let totalBankBalance = 0;
    let bankAccountsObj = {};

    transactions.forEach(t => {
      const amt = Number(t.amount) || 0;
      if (t.paymentMethod === 'Cash') {
        if (t.transactionType === 'Money In') cashInHand += amt;
        else cashInHand -= amt;
      } else { // Bank Transfer or Cheque
        const bank = t.bankAccount || 'Unknown';
        if (!bankAccountsObj[bank]) bankAccountsObj[bank] = 0;
        if (t.transactionType === 'Money In') {
          totalBankBalance += amt;
          bankAccountsObj[bank] += amt;
        } else {
          totalBankBalance -= amt;
          bankAccountsObj[bank] -= amt;
        }
      }
    });

    const bankAccounts = Object.keys(bankAccountsObj).map(bank => ({
      bankAccount: bank,
      balance: bankAccountsObj[bank]
    }));

    // 1c. Raw Material Stock Value
    const rawMaterials = await RawMaterial.find({ purchaseDate: { $gte: dawnOfTime, $lte: asOfDate }, isReturn: false }).lean();
    const allOrdersBefore = await Order.find({ orderDate: { $gte: dawnOfTime, $lte: asOfDate } }).lean();
    const allReturnsToSupplierBefore = await RawMaterial.find({ purchaseDate: { $gte: dawnOfTime, $lte: asOfDate }, isReturn: true }).lean();

    // Same FIFO logic as Fix 1 to get exact stock kg as of date
    let patriSold = 0;
    let shipletSold = 0;
    allOrdersBefore.forEach(o => {
      const w = getOrderWeight(o);
      const isPatri = o.coilCategory && o.coilCategory.includes('Patri');
      if (o.isReturn) {
        if (isPatri) patriSold -= w; else shipletSold -= w;
      } else {
        if (isPatri) patriSold += w; else shipletSold += w;
      }
    });

    let patriReturnedToSupplier = 0;
    let shipletReturnedToSupplier = 0;
    allReturnsToSupplierBefore.forEach(r => {
      const w = Number(r.weightInKg) || 0;
      const isPatri = r.coilCategory === 'Patri Coil';
      if (isPatri) patriReturnedToSupplier += w; else shipletReturnedToSupplier += w;
    });

    let deductedPatri = patriSold + patriReturnedToSupplier;
    let deductedShiplet = shipletSold + shipletReturnedToSupplier;

    let rawMaterialWeightKg = 0;
    let rawMaterialValue = 0;
    
    // Sort lots by purchaseDate ASC for FIFO
    rawMaterials.sort((a, b) => new Date(a.purchaseDate) - new Date(b.purchaseDate));

    rawMaterials.forEach(lot => {
      const isPatri = lot.coilCategory === 'Patri Coil';
      let lotWeight = Number(lot.weightInKg) || 0;
      let deductedSoFar = isPatri ? deductedPatri : deductedShiplet;
      
      let lotRemaining = lotWeight;
      if (deductedSoFar >= lotWeight) {
        lotRemaining = 0;
        deductedSoFar -= lotWeight;
      } else if (deductedSoFar > 0) {
        lotRemaining = lotWeight - deductedSoFar;
        deductedSoFar = 0;
      }
      
      if (isPatri) deductedPatri = deductedSoFar;
      else deductedShiplet = deductedSoFar;

      if (lotRemaining > 0) {
        rawMaterialWeightKg += lotRemaining;
        rawMaterialValue += (lotRemaining * (lot.ratePerKg || 0));
      }
    });

    const avgRawRate = rawMaterialWeightKg > 0 ? (rawMaterialValue / rawMaterialWeightKg) : 0;

    // 1d. Ready Stock Value
    const readyStockItems = await ReadyStock.find({ productionDate: { $gte: dawnOfTime, $lte: asOfDate } }).lean();
    let totalReadyStockKg = 0;
    let readyStockValue = 0;

    let wireSoldKg = 0;
    let wireReturnedKg = 0;
    allOrdersBefore.forEach(o => {
      if (!o.isAnnealed) {
        if (o.isReturn) wireReturnedKg += getOrderWeight(o);
        else wireSoldKg += getOrderWeight(o);
      }
    });
    
    let totalProduced = 0;
    readyStockItems.forEach(s => {
      totalProduced += (Number(s.weightKg) || 0);
    });

    totalReadyStockKg = Math.max(0, totalProduced - wireSoldKg + wireReturnedKg);
    readyStockValue = Math.round(totalReadyStockKg * avgRawRate);

    // 1e. Annealing Stock (Coil at Bhatti)
    const activeAnnealing = await JobWork.find({ 
      jobType: 'Annealing', 
      arrivalDate: { $gte: dawnOfTime, $lte: asOfDate } // Reconstruct annealing stock
    }).lean();
    
    let totalAnnealingStockKg = 0;
    activeAnnealing.forEach(jw => {
      let pool = Number(jw.arrivedWeightKg) || 0;
      (jw.deliveries || []).forEach(del => {
        if (new Date(del.deliveredDate || jw.arrivalDate) <= asOfDate) pool -= (Number(del.weightKg) || 0);
      });
      (jw.returns || []).forEach(ret => {
        if (new Date(ret.returnedDate || jw.arrivalDate) <= asOfDate) pool -= (Number(ret.weightKg) || 0);
      });
      if (pool > 0) totalAnnealingStockKg += pool;
    });
    const annealingStockValue = Math.round(totalAnnealingStockKg * avgRawRate);

    // 1f. Receivables (Customers, Processing, Advances)
    let customerReceivables = 0;
    let customerAdvances = 0;
    let processingReceivables = 0;
    let processingAdvances = 0;

    const customerBalances = {};
    const allCustomers = await Customer.find().lean();
    allCustomers.forEach(c => {
      customerBalances[c._id.toString()] = { type: c.customerType, balance: 0 };
    });

    allOrdersBefore.forEach(o => {
      if (o.customerId) {
        const cid = o.customerId.toString();
        if (!customerBalances[cid]) customerBalances[cid] = { type: 'Ledger', balance: 0 };
        if (!o.isReturn) {
          customerBalances[cid].balance += (Number(o.totalAmount) || 0);
        } else {
          customerBalances[cid].balance -= (Number(o.totalAmount) || 0);
        }
      }
    });

    const allJobWorks = await JobWork.find({ arrivalDate: { $gte: dawnOfTime, $lte: asOfDate } }).lean();
    allJobWorks.forEach(jw => {
      if (jw.customerId) {
        const cid = jw.customerId.toString();
        if (!customerBalances[cid]) customerBalances[cid] = { type: 'Processing', balance: 0 };
        (jw.deliveries || []).forEach(del => {
          const dDate = del.deliveredDate || jw.arrivalDate;
          if (new Date(dDate) <= asOfDate) {
            customerBalances[cid].balance += (Number(del.labourAmount) || 0);
          }
        });
        (jw.excessDeliveries || []).forEach(exc => {
          const eDate = exc.deliveryDate || jw.arrivalDate;
          if (new Date(eDate) <= asOfDate) {
            customerBalances[cid].balance += (Number(exc.totalSaleAmount) || 0);
          }
        });
      }
    });

    transactions.forEach(t => {
      if (t.relatedTo === 'Customer' && t.relatedId) {
        const cid = t.relatedId.toString();
        if (!customerBalances[cid]) customerBalances[cid] = { type: 'Ledger', balance: 0 };
        if (t.transactionType === 'Money In') {
          customerBalances[cid].balance -= (Number(t.amount) || 0);
        } else if (t.transactionType === 'Money Out') {
          customerBalances[cid].balance += (Number(t.amount) || 0);
        }
      }
    });

    let customerCount = 0;
    let processingCount = 0;

    Object.values(customerBalances).forEach(c => {
      if (c.type === 'Processing') {
        if (c.balance > 0) { processingReceivables += c.balance; processingCount++; }
        else if (c.balance < 0) processingAdvances += Math.abs(c.balance);
      } else {
        if (c.balance > 0) { customerReceivables += c.balance; customerCount++; }
        else if (c.balance < 0) customerAdvances += Math.abs(c.balance);
      }
    });

    // Processing Stock Value
    let totalProcessingStockKg = 0;
    allJobWorks.forEach(jw => {
      let pool = Number(jw.arrivedWeightKg) || 0;
      (jw.deliveries || []).forEach(del => {
        if (new Date(del.deliveredDate || jw.arrivalDate) <= asOfDate) pool -= (Number(del.weightKg) || 0);
      });
      (jw.returns || []).forEach(ret => {
        if (new Date(ret.returnedDate || jw.arrivalDate) <= asOfDate) pool -= (Number(ret.weightKg) || 0);
      });
      (jw.excessDeliveries || []).forEach(exc => {
        // G3 FIX: field is weightKg not excessWeightKg in the JobWork excessDeliveries schema
        if (new Date(exc.deliveryDate || jw.arrivalDate) <= asOfDate) pool -= (Number(exc.weightKg) || 0);
      });
      if (pool > 0) totalProcessingStockKg += pool;
    });
    const processingStockValue = Math.round(totalProcessingStockKg * avgRawRate);

    // 2. LIABILITIES
    let supplierPayables = 0;
    let supplierAdvances = 0;
    const supplierBalances = {};
    const allSuppliers = await Supplier.find().lean();
    allSuppliers.forEach(s => {
      supplierBalances[s._id.toString()] = 0;
    });

    rawMaterials.forEach(rm => {
      if (rm.supplierId) {
        const sid = rm.supplierId.toString();
        if (!supplierBalances[sid]) supplierBalances[sid] = 0;
        supplierBalances[sid] += (Number(rm.totalAmount) || 0);
      }
    });
    allReturnsToSupplierBefore.forEach(rm => {
      if (rm.supplierId) {
        const sid = rm.supplierId.toString();
        if (!supplierBalances[sid]) supplierBalances[sid] = 0;
        supplierBalances[sid] -= (Number(rm.totalAmount) || 0);
      }
    });

    transactions.forEach(t => {
      if (t.relatedTo === 'Supplier' && t.relatedId) {
        const sid = t.relatedId.toString();
        if (!supplierBalances[sid]) supplierBalances[sid] = 0;
        if (t.transactionType === 'Money Out') {
          supplierBalances[sid] -= (Number(t.amount) || 0);
        } else if (t.transactionType === 'Money In') {
          supplierBalances[sid] += (Number(t.amount) || 0);
        }
      }
    });

    let supplierCount = 0;
    Object.values(supplierBalances).forEach(bal => {
      if (bal > 0) { supplierPayables += bal; supplierCount++; }
      else if (bal < 0) supplierAdvances += Math.abs(bal);
    });

    let annealingPayables = 0;
    let annealingAdvances = 0;
    const allAnnealers = await AnnealingPerson.find().lean();
    let annealingCount = 0;
    allAnnealers.forEach(a => {
      if (a.totalAmountDue > 0) { annealingPayables += a.totalAmountDue; annealingCount++; }
      else if (a.totalAmountDue < 0) annealingAdvances += Math.abs(a.totalAmountDue);
    });

    let personalReceivables = 0;
    let personalPayables = 0;
    const personalReceivableItems = await PersonalPayment.find({ status: 'Active', paymentDirection: { $ne: 'Payable' }, createdAt: { $gte: dawnOfTime, $lte: asOfDate } }).lean();
    const personalPayableItems = await PersonalPayment.find({ status: 'Active', paymentDirection: 'Payable', createdAt: { $gte: dawnOfTime, $lte: asOfDate } }).lean();
    
    personalReceivables = personalReceivableItems.reduce((sum, p) => sum + (p.expectedLumpSum || 0), 0);
    personalPayables = personalPayableItems.reduce((sum, p) => sum + (p.remainingToContribute || p.expectedLumpSum || 0), 0);

    const totalLiquidAssets = cashInHand + totalBankBalance;
    const totalReceivables = customerReceivables + processingReceivables + personalReceivables + supplierAdvances + annealingAdvances;
    const totalInventoryValue = rawMaterialValue + readyStockValue + processingStockValue + annealingStockValue;
    const totalAssets = totalLiquidAssets + totalReceivables + totalInventoryValue;

    const customerPayables = customerAdvances + processingAdvances;
    const rawMaterialDues = 0;
    const totalLiabilities = supplierPayables + annealingPayables + customerPayables + personalPayables;

    // 3. EQUITY / NET POSITION
    //
    // G5 NOTE: cumulativeProfit comes from buildProfitReport({ startDate: null, endDate: asOfDate }).
    // When startDate is null, the P&L uses dawnOfTime (set by the latest PeriodClose or Opening Balance)
    // as the effective start — this is by design with the period-close accounting system.
    // For a business WITHOUT any PeriodClose records, dawnOfTime will be the earliest transaction date,
    // so cumulativeProfit will be truly all-time.
    //
    // netWorth is the primary equity figure: assets − liabilities (from reconstruction).
    // profitBasedNetWorth (= owner's capital + cumulativeProfit) is shown for cross-check only.
    // The two will match closely when all opening balances are correctly entered.
    let cumulativeProfit = 0;
    let profitBasedNetWorth = null;
    try {
      const profitReport = await buildProfitReport({ startDate: null, endDate: asOfDate });
      cumulativeProfit = profitReport?.combined?.finalNetProfit || 0;
      // Opening capital estimate = assets at dawnOfTime (approximated as netWorth − cumulativeProfit)
      profitBasedNetWorth = cumulativeProfit; // displayed as "Profit since last period close"
    } catch {
      cumulativeProfit = 0;
    }

    const selfExpenseTxns = transactions.filter(t => t.expenseGroup === 'Self Expense');
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
          customerCount,
          processingReceivables,
          processingCount,
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
          annealingStockValue,
          totalAnnealingStockKg,
          avgRawRate: Math.round(avgRawRate * 100) / 100,
          totalInventoryValue,
          totalAssets,
        },
        liabilities: {
          supplierPayables,
          supplierCount,
          annealingPayables,
          annealingCount,
          customerPayables,
          rawMaterialDues,
          personalPayables,
          personalPayableItems,
          totalLiabilities,
        },
        equity: {
          cumulativeProfit,
          profitBasedNetWorth,
          totalSelfExpenses,
          netWorth,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};
