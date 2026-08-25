const Transaction = require('../models/Transaction');
const Expense = require('../models/Expense');
const ConsumptionMaterial = require('../models/ConsumptionMaterial');
const Order = require('../models/Order');
const RawMaterial = require('../models/RawMaterial');
const ConsumptionUsage = require('../models/ConsumptionUsage');
const Customer = require('../models/Customer');
const Supplier = require('../models/Supplier');
const { restoreStockByCategory } = require('../utils/stockService');
const { startOfDay, endOfDay, addDays, isAfter } = require('date-fns');

const SELF_EXPENSE_GROUP = 'Self Expense';
const FACTORY_EXPENSE_TOTAL = 'Factory Expense Total';
const DAILY_TOTAL_CATEGORY = 'Daily Total';
const PROCESS_MATERIAL_GROUP = 'Process Material';

function isPollutedDailyTotalBankTransfer(transaction) {
  return transaction.paymentMethod === 'Bank Transfer'
    && transaction.expenseGroup === FACTORY_EXPENSE_TOTAL
    && transaction.expenseCategory === DAILY_TOTAL_CATEGORY
    && !transaction.linkedExpenseId;
}

function buildExpenseDescription(expense) {
  const parts = [expense.expenseCategory];
  if (expense.description) parts.push(expense.description);
  if (expense.labourName) parts.push(`(${expense.labourName})`);
  return parts.join(' — ');
}

function transactionPayloadFromExpense(expense) {
  return {
    transactionType: 'Money Out',
    amount: expense.amount,
    paymentMethod: expense.paymentMethod || 'Cash',
    relatedTo: 'Other',
    relatedName: expense.expenseGroup,
    description: buildExpenseDescription(expense),
    handledBy: expense.addedBy || '',
    sourceType: 'Expense',
    sourceId: expense._id,
    expenseGroup: expense.expenseGroup,
    expenseCategory: expense.expenseCategory,
    transactionDate: expense.expenseDate || new Date(),
  };
}

async function syncTransactionFromExpense(expense) {
  if (!expense?._id) return null;
  const payload = transactionPayloadFromExpense(expense);
  const existing = await Transaction.findOne({ sourceType: 'Expense', sourceId: expense._id });
  if (existing) {
    return Transaction.findByIdAndUpdate(existing._id, payload, { new: true });
  }
  return Transaction.create(payload);
}

async function syncTransactionFromConsumptionMaterial(material) {
  if (!material?._id) return null;
  const payload = {
    transactionType: 'Money Out',
    amount: material.totalCost || 0,
    paymentMethod: 'Cash',
    relatedTo: 'Other',
    relatedName: PROCESS_MATERIAL_GROUP,
    description: `${material.materialType} — ${material.quantity} ${material.unit || ''}`.trim(),
    sourceType: 'ConsumptionMaterial',
    sourceId: material._id,
    expenseGroup: PROCESS_MATERIAL_GROUP,
    expenseCategory: material.materialType,
    transactionDate: material.purchaseDate || new Date(),
  };
  const existing = await Transaction.findOne({ sourceType: 'ConsumptionMaterial', sourceId: material._id });
  if (existing) {
    return Transaction.findByIdAndUpdate(existing._id, payload, { new: true });
  }
  return Transaction.create(payload);
}

async function syncTransactionFromRawMaterial(raw, supplierName) {
  if (!raw?._id || !(raw.amountPaid > 0)) {
    await Transaction.deleteMany({ sourceType: 'RawMaterial', sourceId: raw?._id });
    return null;
  }
  const payload = {
    transactionType: 'Money Out',
    amount: raw.amountPaid,
    paymentMethod: raw.paymentMethod || 'Cash',
    relatedTo: 'Supplier',
    relatedId: raw.supplierId,
    relatedName: supplierName || raw.supplierName || '',
    description: `Raw material purchase — ${raw.materialType || raw.coilCategory} (${raw.weightInKg} kg)`,
    sourceType: 'RawMaterial',
    sourceId: raw._id,
    expenseGroup: 'Raw Material',
    expenseCategory: raw.coilCategory || raw.materialType,
    transactionDate: raw.purchaseDate || new Date(),
  };
  const existing = await Transaction.findOne({ sourceType: 'RawMaterial', sourceId: raw._id });
  if (existing) {
    return Transaction.findByIdAndUpdate(existing._id, payload, { new: true });
  }
  return Transaction.create(payload);
}

async function syncTransactionFromOrder(order, customerName) {
  if (!order?._id) return null;
  const paid = Number(order.amountPaid) || 0;
  if (paid <= 0) {
    await Transaction.deleteMany({
      $or: [{ orderId: order._id }, { sourceType: 'Order', sourceId: order._id }],
    });
    return null;
  }
  const payload = {
    transactionType: 'Money In',
    amount: paid,
    paymentMethod: order.paymentMethod || 'Cash',
    relatedTo: 'Customer',
    relatedId: order.customerId,
    relatedName: customerName || order.customerName || '',
    description: `${order.wireType || `Wire #${order.wireNumber}`} — ${order.initialWeightKg} kg`,
    handledBy: order.soldBy || '',
    orderId: order._id,
    sourceType: 'Order',
    sourceId: order._id,
    transactionDate: order.orderDate || new Date(),
  };
  const existing = await Transaction.findOne({
    $or: [{ orderId: order._id }, { sourceType: 'Order', sourceId: order._id }],
  });
  if (existing) {
    return Transaction.findByIdAndUpdate(existing._id, payload, { new: true });
  }
  return Transaction.create(payload);
}

async function deleteTransactionsForSource(sourceType, sourceId) {
  await Transaction.deleteMany({ sourceType, sourceId });
}

/**
 * Recompute party totals from the same ledger entries used in LedgerDialog.
 * Purchased / Paid stay visible even when Due is settled (0).
 */
async function recalcCustomerTotals(customerId) {
  if (!customerId) return;
  const customer = await Customer.findById(customerId);
  if (!customer) return;

  const { collectRawEntries } = require('./ledgerService');
  const entries = await collectRawEntries('Customer', customer);
  const totalCredit = entries.reduce((s, e) => s + (e.credit || 0), 0);
  const totalDebit = entries.reduce((s, e) => s + (e.debit || 0), 0);
  const balance = totalCredit - totalDebit;
  const orderCount = await Order.countDocuments({ customerId });
  await Customer.findByIdAndUpdate(customerId, {
    totalAmountPurchased: totalCredit,
    totalAmountPaid: totalDebit,
    totalAmountDue: Math.max(0, balance),
    totalOrders: orderCount,
  });
}

async function recalcSupplierTotals(supplierId) {
  if (!supplierId) return;
  const supplier = await Supplier.findById(supplierId);
  if (!supplier) return;

  const { collectRawEntries } = require('./ledgerService');
  const entries = await collectRawEntries('Supplier', supplier);
  const totalCredit = entries.reduce((s, e) => s + (e.credit || 0), 0);
  const totalDebit = entries.reduce((s, e) => s + (e.debit || 0), 0);
  const balance = totalCredit - totalDebit;
  // Purchases increase debit (we owe them); payments increase credit.
  await Supplier.findByIdAndUpdate(supplierId, {
    totalAmountPurchased: totalDebit,
    totalAmountPaid: totalCredit,
    totalAmountDue: Math.max(0, -balance),
  });
}

async function cascadeDeleteSource(transaction) {
  if (!transaction) return;

  if (transaction.sourceType === 'Expense' && transaction.sourceId) {
    await Expense.findByIdAndDelete(transaction.sourceId);
    return;
  }

  if (transaction.sourceType === 'ConsumptionMaterial' && transaction.sourceId) {
    await ConsumptionUsage.deleteMany({ materialId: transaction.sourceId });
    await ConsumptionMaterial.findByIdAndDelete(transaction.sourceId);
    return;
  }

  if (transaction.sourceType === 'RawMaterial' && transaction.sourceId) {
    const raw = await RawMaterial.findById(transaction.sourceId);
    if (raw) {
      await RawMaterial.findByIdAndDelete(raw._id);
      await recalcSupplierTotals(raw.supplierId);
    }
    return;
  }

  const orderId = transaction.orderId || (transaction.sourceType === 'Order' ? transaction.sourceId : null);
  if (orderId) {
    const order = await Order.findById(orderId);
    if (order) {
      if (order.coilCategory && order.stockDeductedKg > 0) {
        await restoreStockByCategory(order.coilCategory, order.stockDeductedKg);
      }
      await Order.findByIdAndDelete(order._id);
      if (order.customerId) {
        await recalcCustomerTotals(order.customerId);
      }
    }
  }
}

async function syncSourceFromTransaction(transaction, updates = {}) {
  const amount = updates.amount !== undefined ? Number(updates.amount) : transaction.amount;
  const transactionDate = updates.transactionDate || transaction.transactionDate;
  const description = updates.description !== undefined ? updates.description : transaction.description;
  const paymentMethod = updates.paymentMethod || transaction.paymentMethod;

  if (transaction.sourceType === 'Expense' && transaction.sourceId) {
    const expenseUpdates = {
      amount,
      expenseDate: transactionDate,
      description: description || '',
      paymentMethod,
    };
    if (updates.expenseGroup) expenseUpdates.expenseGroup = updates.expenseGroup;
    if (updates.expenseCategory) expenseUpdates.expenseCategory = updates.expenseCategory;
    await Expense.findByIdAndUpdate(transaction.sourceId, expenseUpdates);
    return;
  }

  if (transaction.sourceType === 'ConsumptionMaterial' && transaction.sourceId) {
    await ConsumptionMaterial.findByIdAndUpdate(transaction.sourceId, {
      totalCost: amount,
      purchaseDate: transactionDate,
      notes: description || '',
    });
    const material = await ConsumptionMaterial.findById(transaction.sourceId);
    if (material) {
      const usage = await ConsumptionUsage.findOne({ materialId: material._id });
      if (usage) {
        await ConsumptionUsage.findByIdAndUpdate(usage._id, {
          costAtUsage: amount,
          usageDate: transactionDate,
          notes: description || '',
        });
      }
    }
    return;
  }

  if (transaction.sourceType === 'RawMaterial' && transaction.sourceId) {
    const raw = await RawMaterial.findById(transaction.sourceId);
    if (raw) {
      await RawMaterial.findByIdAndUpdate(raw._id, {
        amountPaid: amount,
        amountDue: (raw.totalAmount || 0) - amount,
        purchaseDate: transactionDate,
      });
      await recalcSupplierTotals(raw.supplierId);
    }
    return;
  }

  const orderId = transaction.orderId || (transaction.sourceType === 'Order' ? transaction.sourceId : null);
  if (orderId) {
    const order = await Order.findById(orderId);
    if (order) {
      const amountPaid = amount;
      const totalAmount = order.totalAmount || 0;
      const amountDue = Math.max(0, totalAmount - amountPaid);
      await Order.findByIdAndUpdate(orderId, {
        amountPaid,
        amountDue,
        orderDate: transactionDate,
        paymentMethod,
        notes: description || order.notes,
      });
      if (order.customerId) {
        await recalcCustomerTotals(order.customerId);
      }
    }
  }
}

async function createDailyBookExpenseTotal(body) {
  const isSelf = body.entryKind === 'SelfExpense';
  const expenseGroup = isSelf ? SELF_EXPENSE_GROUP : FACTORY_EXPENSE_TOTAL;
  const expenseCategory = isSelf ? (body.expenseCategory || 'Fayyaz Expense') : DAILY_TOTAL_CATEGORY;
  const expenseDate = body.transactionDate ? new Date(body.transactionDate) : new Date();
  const dayStart = startOfDay(expenseDate);
  const dayEnd = endOfDay(expenseDate);

  const filter = {
    expenseDate: { $gte: dayStart, $lte: dayEnd },
    expenseGroup,
  };

  if (isSelf) {
    filter.expenseCategory = expenseCategory;
    filter.description = { $regex: /^Daily book total/i };
  } else {
    filter.expenseCategory = DAILY_TOTAL_CATEGORY;
  }

  const payload = {
    amount: Number(body.amount),
    paymentMethod: body.paymentMethod || 'Cash',
    description: body.description || (isSelf ? `Daily book total — ${expenseCategory}` : 'Daily book total — Factory'),
    addedBy: body.handledBy || '',
    expenseDate,
  };

  let expense = await Expense.findOne(filter);
  if (expense) {
    expense = await Expense.findByIdAndUpdate(expense._id, payload, { new: true, runValidators: true });
  } else {
    expense = await Expense.create({
      ...payload,
      expenseGroup,
      expenseCategory,
    });
  }

  return expense;
}

/**
 * Pure calculation of factory/self expense totals from Expense and
 * ConsumptionMaterial records. No transactions are created — Daily Book
 * shows these totals directly.
 */
function computeExpenseTotalsFromRecords(expenses, processPurchases) {
  let factoryFromDetails = 0;
  let factoryDailyTotal = 0;
  let fayyaz = 0;
  let faisal = 0;
  let mutual = 0;

  (expenses || []).forEach((e) => {
    // Bank-paid expenses & company/personal bank cheques are deducted from bank balance, not cash in hand
    if (e.paymentMethod === 'Bank Transfer') return;
    if (
      e.paymentMethod === 'Cheque' &&
      !e.isEndorsedCheque &&
      ['Company Cheque', 'Personal Cheque'].includes(e.chequeType || (e.isEndorsedCheque ? 'Customer Cheque' : 'Company Cheque'))
    ) {
      return;
    }

    const amount = e.amount || 0;
    if (e.expenseGroup === SELF_EXPENSE_GROUP) {
      if (e.expenseCategory === 'Fayyaz Expense') fayyaz += amount;
      else if (e.expenseCategory === 'Faisal Expense') faisal += amount;
      else if (e.expenseCategory === 'Mutual Expense') mutual += amount;
      else fayyaz += amount;
    } else if (e.expenseGroup === FACTORY_EXPENSE_TOTAL && e.expenseCategory === DAILY_TOTAL_CATEGORY) {
      factoryDailyTotal += amount;
    } else {
      factoryFromDetails += amount;
    }
  });

  const processMaterialTotal = (processPurchases || []).reduce((s, m) => s + (m.totalCost || 0), 0);
  factoryFromDetails += processMaterialTotal;

  return {
    factoryFromDetails,
    factoryDailyTotal,
    factoryTotal: factoryFromDetails + factoryDailyTotal,
    fayyaz,
    faisal,
    mutual,
    selfTotal: fayyaz + faisal + mutual,
    processMaterialTotal,
  };
}

async function getDailyExpenseTotalsForDate(date) {
  const dayStart = startOfDay(new Date(date));
  const dayEnd = endOfDay(dayStart);

  const [expenses, processPurchases] = await Promise.all([
    Expense.find({ expenseDate: { $gte: dayStart, $lte: dayEnd } }),
    ConsumptionMaterial.find({ purchaseDate: { $gte: dayStart, $lte: dayEnd } }),
  ]);

  return computeExpenseTotalsFromRecords(expenses, processPurchases);
}

/**
 * One-time cleanup: remove auto-created per-expense transactions and
 * order transactions that were wrongly backfilled for ledger customers.
 * Expenses only appear in Daily Book as day totals, never as rows.
 */
async function cleanupPhantomTransactions() {
  await Transaction.deleteMany({ sourceType: { $in: ['Expense', 'ConsumptionMaterial'] } });

  const orderTxs = await Transaction.find({ sourceType: 'Order' });
  for (const t of orderTxs) {
    const order = await Order.findById(t.sourceId || t.orderId);
    if (!order || !(order.amountPaid > 0)) {
      await Transaction.findByIdAndDelete(t._id);
    }
  }
}

function computeExpenseBreakdown(transactions) {
  let factoryExpenseOut = 0;
  let factoryDailyTotal = 0;
  let selfDailyTotal = 0;
  let fayyazExpenseOut = 0;
  let faisalExpenseOut = 0;
  let mutualExpenseOut = 0;

  transactions.forEach((t) => {
    if (t.transactionType !== 'Money Out') return;
    if (t.paymentMethod === 'Bank Transfer') return;
    if (t.expenseGroup === SELF_EXPENSE_GROUP) {
      if (t.expenseCategory === DAILY_TOTAL_CATEGORY) {
        selfDailyTotal += t.amount || 0;
      } else if (t.expenseCategory === 'Fayyaz Expense') fayyazExpenseOut += t.amount || 0;
      else if (t.expenseCategory === 'Faisal Expense') faisalExpenseOut += t.amount || 0;
      else if (t.expenseCategory === 'Mutual Expense') mutualExpenseOut += t.amount || 0;
      else fayyazExpenseOut += t.amount || 0;
    } else if (t.expenseGroup === FACTORY_EXPENSE_TOTAL && t.expenseCategory === DAILY_TOTAL_CATEGORY) {
      factoryDailyTotal += t.amount || 0;
    } else if (
      t.expenseGroup ||
      t.sourceType === 'Expense' ||
      t.sourceType === 'ConsumptionMaterial' ||
      t.sourceType === 'RawMaterial'
    ) {
      factoryExpenseOut += t.amount || 0;
    }
  });

  return {
    factoryExpenseOut,
    factoryDailyTotal,
    selfDailyTotal,
    selfExpenseOut: {
      fayyaz: fayyazExpenseOut,
      faisal: faisalExpenseOut,
      mutual: mutualExpenseOut,
      dailyTotal: selfDailyTotal,
      total: fayyazExpenseOut + faisalExpenseOut + mutualExpenseOut + selfDailyTotal,
    },
  };
}

/**
 * Create a linked Expense when a bank transfer is marked as factory/self expense.
 * The expense appears in Expenses (e.g. Annealing) but is excluded from cash-book totals.
 */
async function createLinkedExpenseForBankTransfer(transaction, { expenseGroup, expenseCategory, description, handledBy }) {
  const isCheque = transaction.paymentMethod === 'Cheque';
  const expense = await Expense.create({
    expenseGroup,
    expenseCategory,
    amount: transaction.amount,
    paymentMethod: transaction.paymentMethod || 'Bank Transfer',
    expenseDate: transaction.transactionDate || new Date(),
    description: description || `${isCheque ? 'Cheque' : 'Bank'} payment — ${expenseCategory}${transaction.relatedName ? ` (${transaction.relatedName})` : ''}`,
    addedBy: handledBy || '',
    bankTransactionId: transaction._id,
    chequeId: transaction.chequeId,
    chequeNumber: transaction.chequeNumber,
    chequeType: transaction.chequeType,
    chequeBank: transaction.chequeBank || transaction.bankAccount,
    chequeDate: transaction.chequeDate,
    isEndorsedCheque: transaction.isEndorsedCheque,
  });
  await Transaction.findByIdAndUpdate(transaction._id, {
    linkedExpenseId: expense._id,
    expenseGroup,
    expenseCategory,
  });
  return expense;
}

async function findLinkedExpenseForBankTransfer(transaction) {
  if (transaction.linkedExpenseId) {
    return Expense.findById(transaction.linkedExpenseId);
  }
  return Expense.findOne({ bankTransactionId: transaction._id });
}

async function syncLinkedExpenseFromBankTransfer(transaction, updates = {}) {
  const expense = await findLinkedExpenseForBankTransfer(transaction);
  if (!expense) return null;

  const expenseGroup = updates.expenseGroup || transaction.expenseGroup || expense.expenseGroup;
  const expenseCategory = updates.expenseCategory || transaction.expenseCategory || expense.expenseCategory;

  await Expense.findByIdAndUpdate(expense._id, {
    amount: updates.amount !== undefined ? Number(updates.amount) : transaction.amount,
    expenseDate: updates.transactionDate || transaction.transactionDate,
    description: updates.description !== undefined ? updates.description : expense.description,
    expenseGroup,
    expenseCategory,
    paymentMethod: 'Bank Transfer',
    addedBy: updates.handledBy !== undefined ? updates.handledBy : expense.addedBy,
  });

  if (expenseGroup !== transaction.expenseGroup || expenseCategory !== transaction.expenseCategory) {
    await Transaction.findByIdAndUpdate(transaction._id, { expenseGroup, expenseCategory });
  }
  return expense;
}

async function deleteLinkedExpenseForBankTransfer(transaction) {
  const expense = await findLinkedExpenseForBankTransfer(transaction);
  if (expense) {
    await Expense.findByIdAndDelete(expense._id);
  }
}

async function clearBankTransferExpenseLink(transactionId) {
  await Transaction.findByIdAndUpdate(transactionId, {
    $unset: { linkedExpenseId: 1, expenseGroup: 1, expenseCategory: 1 },
  });
}

module.exports = {
  SELF_EXPENSE_GROUP,
  PROCESS_MATERIAL_GROUP,
  syncTransactionFromExpense,
  syncTransactionFromConsumptionMaterial,
  syncTransactionFromRawMaterial,
  syncTransactionFromOrder,
  deleteTransactionsForSource,
  cascadeDeleteSource,
  syncSourceFromTransaction,
  createDailyBookExpenseTotal,
  computeExpenseTotalsFromRecords,
  cleanupPhantomTransactions,
  getDailyExpenseTotalsForDate,
  computeExpenseBreakdown,
  recalcSupplierTotals,
  recalcCustomerTotals,
  createLinkedExpenseForBankTransfer,
  findLinkedExpenseForBankTransfer,
  syncLinkedExpenseFromBankTransfer,
  deleteLinkedExpenseForBankTransfer,
  clearBankTransferExpenseLink,
  isPollutedDailyTotalBankTransfer,
  FACTORY_EXPENSE_TOTAL,
  DAILY_TOTAL_CATEGORY,
};
