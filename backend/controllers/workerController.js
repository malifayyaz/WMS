const Worker = require('../models/Worker');
const WorkerLedgerEntry = require('../models/WorkerLedgerEntry');
const Expense = require('../models/Expense');
const Transaction = require('../models/Transaction');
const {
  createLinkedExpenseForBankTransfer,
  deleteLinkedExpenseForBankTransfer,
} = require('../utils/transactionSyncService');

const ALLOWED_BANKS = ['MBL', 'UBL', 'Faisal Bank', 'Other'];

function normalizeWorkerPayload(body) {
  return {
    name: String(body.name || '').trim(),
    phone: body.phone || '',
    role: body.role || '',
    active: body.active !== false,
    openingBalance: Number(body.openingBalance) || 0,
    notes: body.notes || '',
  };
}

function normalizeEntryPayload(body) {
  const bankAccount = ALLOWED_BANKS.includes(body.bankAccount) ? body.bankAccount : 'MBL';
  return {
    entryType: body.entryType,
    amount: Number(body.amount) || 0,
    date: body.date ? new Date(body.date) : new Date(),
    paymentMethod: body.paymentMethod || undefined,
    notes: body.notes || '',
    addedBy: body.addedBy || '',
    bankAccount,
    bankAccountOtherName: bankAccount === 'Other' ? String(body.bankAccountOtherName || '').trim() : '',
  };
}

function validateEntry(payload) {
  if (!['SalaryDue', 'Payment', 'Advance', 'Adjustment'].includes(payload.entryType)) {
    return 'Valid entry type required';
  }
  if (!payload.amount || payload.amount <= 0) {
    return 'Amount must be greater than 0';
  }
  if (['Payment', 'Advance'].includes(payload.entryType) && !payload.paymentMethod) {
    return 'Payment method required for payment or advance';
  }
  if (
    ['Payment', 'Advance'].includes(payload.entryType)
    && payload.paymentMethod === 'Bank Transfer'
    && payload.bankAccount === 'Other'
    && !payload.bankAccountOtherName
  ) {
    return 'Please write the bank / account name when selecting Other';
  }
  return null;
}

function buildExpensePayload(worker, entry) {
  if (!['Payment', 'Advance'].includes(entry.entryType)) return null;
  return {
    expenseGroup: 'Labour',
    expenseCategory: entry.entryType === 'Payment' ? 'Labour Salary' : 'Labour Advance',
    description: entry.notes || `${entry.entryType === 'Payment' ? 'Salary payment' : 'Advance paid'} to ${worker.name}`,
    amount: entry.amount,
    paymentMethod: entry.paymentMethod,
    expenseDate: entry.date,
    addedBy: entry.addedBy || '',
    labourName: worker.name,
  };
}

async function deleteExpenseAndBankTxn(expenseId) {
  if (!expenseId) return;
  const expense = await Expense.findById(expenseId);
  if (!expense) return;
  if (expense.bankTransactionId) {
    const txn = await Transaction.findById(expense.bankTransactionId);
    if (txn) {
      await deleteLinkedExpenseForBankTransfer(txn);
      await Transaction.findByIdAndDelete(txn._id);
      return;
    }
  }
  await Expense.findByIdAndDelete(expense._id);
}

/**
 * Keep Labour Expense (and bank Money Out for Bank Transfer) in sync with a worker ledger entry.
 * Cash/Cheque → Expense only (cash book reads Expense docs).
 * Bank Transfer → Money Out Transaction + linked Expense (bank book + Expenses page).
 */
async function syncExpenseForEntry(worker, entry) {
  const expensePayload = buildExpensePayload(worker, entry);
  if (!expensePayload) {
    await deleteExpenseAndBankTxn(entry.expenseId);
    entry.expenseId = undefined;
    return;
  }

  const isBank = entry.paymentMethod === 'Bank Transfer';

  if (isBank) {
    const bankAccount = ALLOWED_BANKS.includes(entry.bankAccount) ? entry.bankAccount : 'MBL';
    const bankAccountOtherName = bankAccount === 'Other' ? String(entry.bankAccountOtherName || '').trim() : undefined;
    const txnPayload = {
      transactionType: 'Money Out',
      amount: entry.amount,
      paymentMethod: 'Bank Transfer',
      relatedTo: 'Other',
      relatedName: worker.name,
      description: expensePayload.description,
      handledBy: entry.addedBy || '',
      sourceType: 'Manual',
      bankAccount,
      bankAccountOtherName,
      transactionDate: entry.date || new Date(),
      expenseGroup: expensePayload.expenseGroup,
      expenseCategory: expensePayload.expenseCategory,
    };

    if (entry.expenseId) {
      const existing = await Expense.findById(entry.expenseId);
      if (existing?.bankTransactionId) {
        await Transaction.findByIdAndUpdate(existing.bankTransactionId, txnPayload, { runValidators: true });
        await Expense.findByIdAndUpdate(existing._id, {
          ...expensePayload,
          paymentMethod: 'Bank Transfer',
        }, { runValidators: true });
        return;
      }
      // Was cash/cheque expense — replace with bank-linked flow
      await deleteExpenseAndBankTxn(entry.expenseId);
      entry.expenseId = undefined;
    }

    const bankTxn = await Transaction.create(txnPayload);
    const expense = await createLinkedExpenseForBankTransfer(bankTxn, {
      expenseGroup: expensePayload.expenseGroup,
      expenseCategory: expensePayload.expenseCategory,
      description: expensePayload.description,
      handledBy: expensePayload.addedBy,
    });
    // Preserve labourName on the linked expense
    await Expense.findByIdAndUpdate(expense._id, { labourName: worker.name });
    entry.expenseId = expense._id;
    return;
  }

  // Cash / Cheque
  if (entry.expenseId) {
    const existing = await Expense.findById(entry.expenseId);
    if (existing?.bankTransactionId) {
      // Was bank — remove bank txn and recreate plain expense
      await deleteExpenseAndBankTxn(entry.expenseId);
      entry.expenseId = undefined;
    } else if (existing) {
      await Expense.findByIdAndUpdate(existing._id, expensePayload, { new: true, runValidators: true });
      return;
    }
  }

  const expense = await Expense.create(expensePayload);
  entry.expenseId = expense._id;
}

async function computeWorkerSummary(worker, entries) {
  const list = entries || await WorkerLedgerEntry.find({ workerId: worker._id }).sort({ date: 1, createdAt: 1 });
  const summary = {
    salaryDue: 0,
    payments: 0,
    advances: 0,
    adjustments: 0,
    remaining: Number(worker.openingBalance) || 0,
  };
  list.forEach((entry) => {
    if (entry.entryType === 'SalaryDue') {
      summary.salaryDue += entry.amount || 0;
      summary.remaining += entry.amount || 0;
    } else if (entry.entryType === 'Payment') {
      summary.payments += entry.amount || 0;
      summary.remaining -= entry.amount || 0;
    } else if (entry.entryType === 'Advance') {
      summary.advances += entry.amount || 0;
      summary.remaining -= entry.amount || 0;
    } else {
      summary.adjustments += entry.amount || 0;
      summary.remaining += entry.amount || 0;
    }
  });
  return summary;
}

const getWorkers = async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim();
    const filter = {};
    if (req.query.active === 'true') filter.active = true;
    if (req.query.active === 'false') filter.active = false;
    if (search) {
      filter.$or = [{ name: new RegExp(search, 'i') }, { role: new RegExp(search, 'i') }, { phone: new RegExp(search, 'i') }];
    }
    const workers = await Worker.find(filter).sort({ name: 1 }).lean();
    const workerIds = workers.map((w) => w._id);
    const allEntries = workerIds.length
      ? await WorkerLedgerEntry.find({ workerId: { $in: workerIds } }).sort({ date: 1, createdAt: 1 }).lean()
      : [];
    const byWorker = new Map();
    allEntries.forEach((entry) => {
      const key = String(entry.workerId);
      if (!byWorker.has(key)) byWorker.set(key, []);
      byWorker.get(key).push(entry);
    });
    const data = workers.map((worker) => ({
      ...worker,
      summary: computeWorkerSummarySync(worker, byWorker.get(String(worker._id)) || []),
    }));
    res.json({ success: true, data, total: data.length });
  } catch (error) {
    next(error);
  }
};

function computeWorkerSummarySync(worker, entries) {
  const summary = {
    salaryDue: 0,
    payments: 0,
    advances: 0,
    adjustments: 0,
    remaining: Number(worker.openingBalance) || 0,
  };
  entries.forEach((entry) => {
    if (entry.entryType === 'SalaryDue') {
      summary.salaryDue += entry.amount || 0;
      summary.remaining += entry.amount || 0;
    } else if (entry.entryType === 'Payment') {
      summary.payments += entry.amount || 0;
      summary.remaining -= entry.amount || 0;
    } else if (entry.entryType === 'Advance') {
      summary.advances += entry.amount || 0;
      summary.remaining -= entry.amount || 0;
    } else {
      summary.adjustments += entry.amount || 0;
      summary.remaining += entry.amount || 0;
    }
  });
  return summary;
}

const createWorker = async (req, res, next) => {
  try {
    const payload = normalizeWorkerPayload(req.body || {});
    if (!payload.name) return res.status(400).json({ success: false, message: 'Worker name is required' });
    const worker = await Worker.create(payload);
    res.status(201).json({ success: true, data: worker, message: 'Worker created' });
  } catch (error) {
    next(error);
  }
};

const getWorkerById = async (req, res, next) => {
  try {
    const worker = await Worker.findById(req.params.id);
    if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });
    res.json({ success: true, data: { ...worker.toObject(), summary: await computeWorkerSummary(worker) } });
  } catch (error) {
    next(error);
  }
};

const updateWorker = async (req, res, next) => {
  try {
    const payload = normalizeWorkerPayload(req.body || {});
    if (!payload.name) return res.status(400).json({ success: false, message: 'Worker name is required' });
    const worker = await Worker.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
    if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });
    res.json({ success: true, data: worker, message: 'Worker updated' });
  } catch (error) {
    next(error);
  }
};

const deleteWorker = async (req, res, next) => {
  try {
    const count = await WorkerLedgerEntry.countDocuments({ workerId: req.params.id });
    if (count > 0) {
      return res.status(400).json({ success: false, message: 'Cannot delete a worker with ledger entries' });
    }
    const worker = await Worker.findByIdAndDelete(req.params.id);
    if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });
    res.json({ success: true, message: 'Worker deleted' });
  } catch (error) {
    next(error);
  }
};

const getWorkerLedger = async (req, res, next) => {
  try {
    const worker = await Worker.findById(req.params.id);
    if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });
    const entries = await WorkerLedgerEntry.find({ workerId: worker._id }).sort({ date: 1, createdAt: 1 });
    let running = Number(worker.openingBalance) || 0;
    const rows = entries.map((entry) => {
      if (entry.entryType === 'SalaryDue') running += entry.amount || 0;
      else if (entry.entryType === 'Payment') running -= entry.amount || 0;
      else if (entry.entryType === 'Advance') running -= entry.amount || 0;
      else running += entry.amount || 0;
      return {
        ...entry.toObject(),
        balanceAfter: running,
      };
    });
    res.json({
      success: true,
      data: {
        worker,
        openingBalance: Number(worker.openingBalance) || 0,
        entries: rows,
        summary: await computeWorkerSummary(worker),
      },
    });
  } catch (error) {
    next(error);
  }
};

const createWorkerEntry = async (req, res, next) => {
  try {
    const worker = await Worker.findById(req.params.id);
    if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });
    const payload = normalizeEntryPayload(req.body || {});
    const validationError = validateEntry(payload);
    if (validationError) return res.status(400).json({ success: false, message: validationError });
    // bankAccount helpers are not schema fields — strip before create
    const { bankAccount, bankAccountOtherName, ...entryFields } = payload;
    const entry = await WorkerLedgerEntry.create({ workerId: worker._id, ...entryFields });
    entry.bankAccount = bankAccount;
    entry.bankAccountOtherName = bankAccountOtherName;
    await syncExpenseForEntry(worker, entry);
    await entry.save();
    res.status(201).json({ success: true, data: entry, message: 'Worker ledger entry saved' });
  } catch (error) {
    next(error);
  }
};

const updateWorkerEntry = async (req, res, next) => {
  try {
    const worker = await Worker.findById(req.params.id);
    if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });
    const entry = await WorkerLedgerEntry.findOne({ _id: req.params.entryId, workerId: worker._id });
    if (!entry) return res.status(404).json({ success: false, message: 'Ledger entry not found' });
    const payload = normalizeEntryPayload(req.body || {});
    const validationError = validateEntry(payload);
    if (validationError) return res.status(400).json({ success: false, message: validationError });
    const { bankAccount, bankAccountOtherName, ...entryFields } = payload;
    Object.assign(entry, entryFields);
    entry.bankAccount = bankAccount;
    entry.bankAccountOtherName = bankAccountOtherName;
    await syncExpenseForEntry(worker, entry);
    await entry.save();
    res.json({ success: true, data: entry, message: 'Worker ledger entry updated' });
  } catch (error) {
    next(error);
  }
};

const deleteWorkerEntry = async (req, res, next) => {
  try {
    const worker = await Worker.findById(req.params.id);
    if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });
    const entry = await WorkerLedgerEntry.findOne({ _id: req.params.entryId, workerId: worker._id });
    if (!entry) return res.status(404).json({ success: false, message: 'Ledger entry not found' });
    await deleteExpenseAndBankTxn(entry.expenseId);
    await entry.deleteOne();
    res.json({ success: true, message: 'Worker ledger entry deleted' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createWorker,
  getWorkers,
  getWorkerById,
  updateWorker,
  deleteWorker,
  getWorkerLedger,
  createWorkerEntry,
  updateWorkerEntry,
  deleteWorkerEntry,
  syncExpenseForEntry,
  deleteExpenseAndBankTxn,
};
