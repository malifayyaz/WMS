const Transaction = require('../models/Transaction');
const Customer = require('../models/Customer');
const Supplier = require('../models/Supplier');
const { startOfDay, endOfDay } = require('date-fns');
const {
  getCashBookForDate,
  getCashBookRange,
  setDailyOpening,
  getPreviousDayClosing,
  getCashBreakdownForDate,
  setCashBreakdown,
} = require('../utils/cashBookService');
const {
  createDailyBookExpenseTotal,
  cascadeDeleteSource,
  syncSourceFromTransaction,
  cleanupPhantomTransactions,
  createLinkedExpenseForBankTransfer,
  findLinkedExpenseForBankTransfer,
  syncLinkedExpenseFromBankTransfer,
  deleteLinkedExpenseForBankTransfer,
  clearBankTransferExpenseLink,
  isPollutedDailyTotalBankTransfer,
  FACTORY_EXPENSE_TOTAL,
  DAILY_TOTAL_CATEGORY,
  recalcCustomerTotals,
  recalcSupplierTotals,
  SELF_EXPENSE_GROUP,
} = require('../utils/transactionSyncService');
const { logActivity } = require('../utils/activityLogService');

let phantomCleanupDone = false;

async function syncPartyTotalsFromTransaction(transaction) {
  if (!transaction?.relatedId || !transaction.relatedTo) return;
  if (transaction.relatedTo === 'Customer') await recalcCustomerTotals(transaction.relatedId);
  if (transaction.relatedTo === 'Supplier') await recalcSupplierTotals(transaction.relatedId);
}

/** @deprecated Prefer syncPartyTotalsFromTransaction / recalc*; kept for callers that reverse then re-apply */
async function applyRelatedBalanceImpact(transaction, multiplier = 1) {
  if (!transaction?.relatedId || !transaction.relatedTo) return;
  // Always full recalc so purchased/paid stay correct when due is settled
  await syncPartyTotalsFromTransaction(transaction);
}

/**
 * Add new Money In or Money Out transaction.
 */
const createTransaction = async (req, res, next) => {
  try {
    const body = { ...req.body };
    if (['FactoryExpense', 'SelfExpense'].includes(body.entryKind)) {
      const expense = await createDailyBookExpenseTotal(body);
      await logActivity({
        req,
        action: 'CREATE',
        module: 'Transaction',
        description: `Daily expense total Rs.${expense.amount || body.amount} — ${expense.expenseCategory || body.expenseCategory || 'Expense'}`,
        documentId: expense._id,
        newValue: expense,
      });
      return res.status(201).json({ success: true, data: expense, message: 'Daily expense total recorded' });
    }
    // ATM cash withdrawal: deduct bank; add to cash in hand or record as expense
    if (body.entryKind === 'ATMWithdrawal') {
      const amount = Number(body.amount);
      if (!amount || amount <= 0) {
        return res.status(400).json({ success: false, message: 'Valid amount required' });
      }
      const allowedBanks = ['MBL', 'UBL', 'Faisal Bank', 'Other'];
      const bankAccount = allowedBanks.includes(body.bankAccount) ? body.bankAccount : 'MBL';
      if (bankAccount === 'Other' && !String(body.bankAccountOtherName || '').trim()) {
        return res.status(400).json({
          success: false,
          message: 'Please write the bank / account name when selecting Other',
        });
      }
      const destination = body.destination === 'expense' ? 'expense' : 'cashInHand';
      const note = String(body.description || '').trim();
      const txnDate = body.transactionDate || new Date();
      const bankLabel = bankAccount === 'Other' ? body.bankAccountOtherName : bankAccount;

      const bankTxn = await Transaction.create({
        transactionType: 'Money Out',
        amount,
        paymentMethod: 'Bank Transfer',
        relatedTo: 'Other',
        relatedName: 'ATM Withdrawal',
        description: note ? `ATM — ${note}` : 'ATM Withdrawal',
        handledBy: body.handledBy || '',
        sourceType: 'Manual',
        bankAccount,
        bankAccountOtherName: bankAccount === 'Other' ? body.bankAccountOtherName : undefined,
        bankAccountNumber: body.bankAccountNumber || undefined,
        transactionDate: txnDate,
      });

      let message = `ATM withdrawal recorded — Rs.${amount} deducted from ${bankLabel}`;

      if (destination === 'cashInHand') {
        const cashTxn = await Transaction.create({
          transactionType: 'Money In',
          amount,
          paymentMethod: 'Cash',
          relatedTo: 'Other',
          relatedName: 'ATM Withdrawal',
          description: note ? `ATM — cash to hand: ${note}` : 'ATM — cash to hand',
          handledBy: body.handledBy || '',
          sourceType: 'Manual',
          transactionDate: txnDate,
          linkedTransactionId: bankTxn._id,
        });
        await Transaction.findByIdAndUpdate(bankTxn._id, { linkedTransactionId: cashTxn._id });
        message += ', added to cash in hand';
      } else {
        const expenseGroup = body.expenseGroup || SELF_EXPENSE_GROUP;
        const expenseCategory = body.expenseCategory || 'Fayyaz Expense';
        if (!expenseGroup || !expenseCategory) {
          await Transaction.findByIdAndDelete(bankTxn._id);
          return res.status(400).json({ success: false, message: 'Expense group and category required' });
        }
        await Transaction.findByIdAndUpdate(bankTxn._id, { expenseGroup, expenseCategory });
        await createLinkedExpenseForBankTransfer(bankTxn, {
          expenseGroup,
          expenseCategory,
          description: note
            ? `ATM — ${expenseGroup} / ${expenseCategory}: ${note}`
            : `ATM — ${expenseGroup} / ${expenseCategory}`,
          handledBy: body.handledBy,
        });
        message += `, recorded as ${expenseGroup} / ${expenseCategory}`;
      }

      const data = await Transaction.findById(bankTxn._id);
      await logActivity({
        req,
        action: 'CREATE',
        module: 'Transaction',
        description: `${data.transactionType} Rs.${data.amount} — ${data.relatedName}`,
        documentId: data._id,
        newValue: data,
      });
      return res.status(201).json({ success: true, data, message });
    }
    if (['Customer', 'Supplier'].includes(body.relatedTo) && !body.relatedId) {
      return res.status(400).json({
        success: false,
        error: 'relatedId required',
        message: 'Please select an existing customer or supplier',
      });
    }
    if (body.relatedTo === 'Customer' && body.transactionType === 'Money In') {
      const customer = await Customer.findById(body.relatedId);
      if (!customer) {
        return res.status(404).json({
          success: false,
          error: 'Customer not found',
          message: 'Selected customer does not exist',
        });
      }
    }
    if (!body.sourceType) body.sourceType = 'Manual';
    if (body.paymentMethod === 'Bank Transfer') {
      const allowed = ['MBL', 'UBL', 'Faisal Bank', 'Other'];
      if (!body.bankAccount || !allowed.includes(body.bankAccount)) {
        body.bankAccount = 'MBL';
      }
      if (body.bankAccount === 'Other' && !String(body.bankAccountOtherName || '').trim()) {
        return res.status(400).json({
          success: false,
          message: 'Please write the bank / account name when selecting Other',
        });
      }
      if (body.bankAccount !== 'Other') body.bankAccountOtherName = undefined;
    }
    const transaction = await Transaction.create(body);
    await applyRelatedBalanceImpact(transaction, 1);

    let message = 'Transaction recorded';
    if (
      body.recordAsExpense
      && body.transactionType === 'Money Out'
      && body.paymentMethod === 'Bank Transfer'
      && body.expenseGroup
      && body.expenseCategory
    ) {
      await createLinkedExpenseForBankTransfer(transaction, {
        expenseGroup: body.expenseGroup,
        expenseCategory: body.expenseCategory,
        description: body.description,
        handledBy: body.handledBy,
      });
      message = `Bank transfer recorded — also added to ${body.expenseGroup} / ${body.expenseCategory} expenses`;
    }

    const data = await Transaction.findById(transaction._id);
    await logActivity({
      req,
      action: 'CREATE',
      module: 'Transaction',
      description: `${data.transactionType} Rs.${data.amount} — ${data.relatedName}`,
      documentId: data._id,
      newValue: data,
    });
    res.status(201).json({ success: true, data, message });
  } catch (error) {
    next(error);
  }
};

/**
 * Get a single transaction by id.
 */
const getTransactionById = async (req, res, next) => {
  try {
    const data = await Transaction.findById(req.params.id);
    if (!data) return res.status(404).json({ success: false, message: 'Transaction not found' });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all transactions with optional date range filter.
 */
const getTransactions = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const filter = {
      // Individual expenses never appear as daily book rows — only their day totals.
      sourceType: { $nin: ['Expense', 'ConsumptionMaterial'] },
    };
    if (startDate || endDate) {
      filter.transactionDate = {};
      if (startDate) filter.transactionDate.$gte = startOfDay(new Date(startDate));
      if (endDate) filter.transactionDate.$lte = endOfDay(new Date(endDate));
    }
    if (req.query.type) filter.transactionType = req.query.type;
    if (req.query.relatedTo) filter.relatedTo = req.query.relatedTo;
    if (req.query.relatedId) filter.relatedId = req.query.relatedId;
    const limitRaw = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 2000) : 500;
    const [total, list] = await Promise.all([
      Transaction.countDocuments(filter),
      Transaction.find(filter).sort({ transactionDate: -1 }).limit(limit).lean(),
    ]);
    res.json({ success: true, data: list, total, truncated: total > list.length });
  } catch (error) {
    next(error);
  }
};

/**
 * Get total IN, total OUT, net balance for date range.
 */
const getSummary = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const filter = {};
    if (startDate || endDate) {
      filter.transactionDate = {};
      if (startDate) filter.transactionDate.$gte = new Date(startDate);
      if (endDate) filter.transactionDate.$lte = new Date(endDate);
    }
    const transactions = await Transaction.find(filter);
    let totalIn = 0,
      totalOut = 0;
    transactions.forEach((t) => {
      if (t.transactionType === 'Money In') totalIn += t.amount;
      else totalOut += t.amount;
    });
    res.json({ success: true, data: { totalIn, totalOut, netBalance: totalIn - totalOut } });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all transactions for a specific date.
 */
const getDailyTransactions = async (req, res, next) => {
  try {
    const date = new Date(req.params.date);
    const start = startOfDay(date);
    const end = endOfDay(date);
    const list = await Transaction.find({ transactionDate: { $gte: start, $lte: end } }).sort({ transactionDate: -1 });
    res.json({ success: true, data: list, total: list.length });
  } catch (error) {
    next(error);
  }
};

/**
 * Update a transaction and sync linked source records.
 */
const updateTransaction = async (req, res, next) => {
  try {
    const existing = await Transaction.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Transaction not found' });

    await applyRelatedBalanceImpact(existing, -1);

    const updates = { ...req.body };
    delete updates.entryKind;
    if (updates.amount !== undefined) updates.amount = Number(updates.amount);

    if (existing.paymentMethod === 'Bank Transfer') {
      updates.paymentMethod = 'Bank Transfer';
      const pollutedDailyTotal = updates.expenseGroup === FACTORY_EXPENSE_TOTAL
        && updates.expenseCategory === DAILY_TOTAL_CATEGORY;
      if ((pollutedDailyTotal && updates.recordAsExpense !== true) || updates.recordAsExpense === false) {
        delete updates.expenseGroup;
        delete updates.expenseCategory;
      }
    } else if (updates.paymentMethod === 'Bank Transfer') {
      delete updates.paymentMethod;
    }

    const transaction = await Transaction.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });

    await syncSourceFromTransaction(transaction, updates);

    if (transaction.paymentMethod === 'Bank Transfer' && transaction.transactionType === 'Money Out') {
      const existingExpense = await findLinkedExpenseForBankTransfer(transaction);
      const recordAsExpense = updates.recordAsExpense !== undefined
        ? updates.recordAsExpense
        : !!existingExpense;
      const expenseGroup = updates.expenseGroup || transaction.expenseGroup;
      const expenseCategory = updates.expenseCategory || transaction.expenseCategory;

      if (recordAsExpense && expenseGroup && expenseCategory) {
        if (existingExpense) {
          await syncLinkedExpenseFromBankTransfer(transaction, updates);
        } else {
          await createLinkedExpenseForBankTransfer(transaction, {
            expenseGroup,
            expenseCategory,
            description: updates.description,
            handledBy: updates.handledBy,
          });
        }
      } else if (updates.recordAsExpense === false && existingExpense) {
        await deleteLinkedExpenseForBankTransfer(transaction);
        await clearBankTransferExpenseLink(transaction._id);
      } else if (existingExpense) {
        await syncLinkedExpenseFromBankTransfer(transaction, updates);
      }

      if (isPollutedDailyTotalBankTransfer(transaction)) {
        await clearBankTransferExpenseLink(transaction._id);
      }
    }

    await applyRelatedBalanceImpact(transaction, 1);

    const data = await Transaction.findById(transaction._id);
    res.json({ success: true, data, message: 'Transaction updated' });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a transaction.
 */
const deleteTransaction = async (req, res, next) => {
  try {
    const t = await Transaction.findById(req.params.id);
    if (!t) return res.status(404).json({ success: false, error: 'Not found', message: 'Transaction not found' });
    const relatedTo = t.relatedTo;
    const relatedId = t.relatedId;
    if (t.paymentMethod === 'Bank Transfer') {
      await deleteLinkedExpenseForBankTransfer(t);
    } else {
      await cascadeDeleteSource(t);
    }
    if (t.linkedTransactionId) {
      const linked = await Transaction.findById(t.linkedTransactionId);
      if (linked) {
        if (linked.paymentMethod === 'Bank Transfer') {
          await deleteLinkedExpenseForBankTransfer(linked);
        }
        await Transaction.findByIdAndDelete(linked._id);
      }
    }
    await Transaction.findByIdAndDelete(req.params.id);
    if (relatedTo === 'Customer' && relatedId) await recalcCustomerTotals(relatedId);
    if (relatedTo === 'Supplier' && relatedId) await recalcSupplierTotals(relatedId);
    res.json({ success: true, message: 'Transaction deleted' });
  } catch (error) {
    next(error);
  }
};

/**
 * Cash in hand for a specific day (opening, in, out, closing).
 */
const getCashBook = async (req, res, next) => {
  try {
    if (!phantomCleanupDone) {
      await cleanupPhantomTransactions();
      phantomCleanupDone = true;
    }
    const { date, startDate, endDate } = req.query;
    if (startDate && endDate) {
      const rows = await getCashBookRange(startDate, endDate);
      return res.json({ success: true, data: rows });
    }
    if (!date) {
      return res.status(400).json({ success: false, message: 'date or startDate/endDate required' });
    }
    const data = await getCashBookForDate(date);
    const cashBreakdown = await getCashBreakdownForDate(date);
    res.json({ success: true, data: { ...data, cashBreakdown } });
  } catch (error) {
    next(error);
  }
};

/**
 * Set manual opening balance (cash in hand) for a day.
 */
const setCashOpening = async (req, res, next) => {
  try {
    const { bookDate, openingBalance, note } = req.body;
    if (!bookDate || openingBalance === undefined || openingBalance === '') {
      return res.status(400).json({ success: false, message: 'bookDate and openingBalance are required' });
    }
    const amount = Number(openingBalance);
    if (Number.isNaN(amount) || amount < 0) {
      return res.status(400).json({ success: false, message: 'Valid opening balance required' });
    }
    const doc = await setDailyOpening(bookDate, amount, note);
    const cashBook = await getCashBookForDate(bookDate);
    res.json({ success: true, data: { opening: doc, cashBook }, message: 'Opening balance set' });
  } catch (error) {
    next(error);
  }
};

/**
 * Set manual cash-in-hand breakdown (who holds how much cash) for a day.
 */
const setCashBreakdownHandler = async (req, res, next) => {
  try {
    const { bookDate, lines, note } = req.body;
    if (!bookDate) {
      return res.status(400).json({ success: false, message: 'bookDate is required' });
    }
    const breakdown = await setCashBreakdown(bookDate, lines, note);
    const cashBook = await getCashBookForDate(bookDate);
    res.json({
      success: true,
      data: { breakdown, cashBook: { ...cashBook, cashBreakdown: breakdown } },
      message: 'Cash breakdown saved',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Bank book: running bank balance + transactions for a date range.
 * Opening = stored BankAccountOpening (if any) + post-cutoff Bank Transfer deltas.
 */
const getBankBook = async (req, res, next) => {
  try {
    const { startDate, endDate, bankAccount, bankAccountOtherName } = req.query;
    const {
      buildBankBook,
    } = require('../utils/bankBalanceService');
    const data = await buildBankBook({
      startDate,
      endDate,
      bankAccount: bankAccount || undefined,
      bankAccountOtherName: bankAccountOtherName || undefined,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

/**
 * Per-person bank summary (all-time, no date filter).
 * Groups bank transfer transactions by relatedName / relatedId.
 * Account cards include dated opening balances.
 */
const getBankPersons = async (req, res, next) => {
  try {
    const {
      buildAccountSummaries,
    } = require('../utils/bankBalanceService');
    const all = await Transaction.find({
      paymentMethod: 'Bank Transfer',
      sourceType: { $nin: ['Expense', 'ConsumptionMaterial'] },
    }).sort({ transactionDate: 1 });

    const map = new Map();
    all.forEach((t) => {
      const key = t.relatedId ? String(t.relatedId) : (t.relatedName || 'Unknown');
      if (!map.has(key)) {
        map.set(key, {
          key,
          name: t.relatedName || '—',
          relatedTo: t.relatedTo || 'Other',
          relatedId: t.relatedId || null,
          totalIn: 0,
          totalOut: 0,
          net: 0,
          lastDate: null,
          txCount: 0,
        });
      }
      const p = map.get(key);
      if (t.transactionType === 'Money In') p.totalIn += t.amount || 0;
      else p.totalOut += t.amount || 0;
      p.net = p.totalIn - p.totalOut;
      if (!p.lastDate || t.transactionDate > p.lastDate) p.lastDate = t.transactionDate;
      p.txCount += 1;
    });

    const accounts = await buildAccountSummaries();
    // Prefer enum-keyed cards for the four standard accounts (Other collapsed by enum for UI cards)
    const cardMap = new Map();
    accounts.forEach((a) => {
      const cardKey = a.bankAccount;
      if (!cardMap.has(cardKey)) {
        cardMap.set(cardKey, {
          bankAccount: a.bankAccount,
          label: a.bankAccount === 'Other' ? 'Any Other' : a.bankAccount,
          openingBalance: 0,
          asOfDate: null,
          totalIn: 0,
          totalOut: 0,
          balance: 0,
        });
      }
      const card = cardMap.get(cardKey);
      card.totalIn += a.totalIn || 0;
      card.totalOut += a.totalOut || 0;
      card.balance += a.balance || 0;
      card.openingBalance += a.openingBalance || 0;
      if (a.asOfDate && (!card.asOfDate || a.asOfDate < card.asOfDate)) {
        card.asOfDate = a.asOfDate;
      }
    });

    res.json({
      success: true,
      data: Array.from(map.values()),
      accounts: Array.from(cardMap.values()),
      accountDetails: accounts,
    });
  } catch (error) {
    next(error);
  }
};

const setBankOpeningBalance = async (req, res, next) => {
  try {
    const { setBankOpening } = require('../utils/bankBalanceService');
    const doc = await setBankOpening(req.body || {});
    res.json({ success: true, data: doc, message: 'Bank opening balance saved' });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
};

const getBankOpeningBalances = async (req, res, next) => {
  try {
    const { getBankOpenings } = require('../utils/bankBalanceService');
    const data = await getBankOpenings();
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

/**
 * Previous day closing (for UI hint).
 */
const getPrevClosing = async (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ success: false, message: 'date required' });
    const closing = await getPreviousDayClosing(date);
    res.json({ success: true, data: { previousClosing: closing } });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createTransaction,
  updateTransaction,
  getTransactionById,
  getTransactions,
  getSummary,
  getDailyTransactions,
  deleteTransaction,
  getCashBook,
  getBankBook,
  getBankPersons,
  setBankOpeningBalance,
  getBankOpeningBalances,
  setCashOpening,
  setCashBreakdownHandler,
  getPrevClosing,
  applyRelatedBalanceImpact,
};
