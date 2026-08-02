const Worker = require('../models/Worker');
const WorkerLedgerEntry = require('../models/WorkerLedgerEntry');
const Expense = require('../models/Expense');

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
  return {
    entryType: body.entryType,
    amount: Number(body.amount) || 0,
    date: body.date ? new Date(body.date) : new Date(),
    paymentMethod: body.paymentMethod || undefined,
    notes: body.notes || '',
    addedBy: body.addedBy || '',
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

async function syncExpenseForEntry(worker, entry) {
  const expensePayload = buildExpensePayload(worker, entry);
  if (!expensePayload) {
    if (entry.expenseId) {
      await Expense.findByIdAndDelete(entry.expenseId);
      entry.expenseId = undefined;
    }
    return;
  }
  if (entry.expenseId) {
    await Expense.findByIdAndUpdate(entry.expenseId, expensePayload, { new: true, runValidators: true });
    return;
  }
  const expense = await Expense.create(expensePayload);
  entry.expenseId = expense._id;
}

async function computeWorkerSummary(worker) {
  const entries = await WorkerLedgerEntry.find({ workerId: worker._id }).sort({ date: 1, createdAt: 1 });
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

const getWorkers = async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim();
    const filter = {};
    if (req.query.active === 'true') filter.active = true;
    if (req.query.active === 'false') filter.active = false;
    if (search) {
      filter.$or = [{ name: new RegExp(search, 'i') }, { role: new RegExp(search, 'i') }, { phone: new RegExp(search, 'i') }];
    }
    const workers = await Worker.find(filter).sort({ name: 1 });
    const data = await Promise.all(workers.map(async (worker) => ({
      ...worker.toObject(),
      summary: await computeWorkerSummary(worker),
    })));
    res.json({ success: true, data, total: data.length });
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
    const entry = await WorkerLedgerEntry.create({ workerId: worker._id, ...payload });
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
    Object.assign(entry, payload);
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
    if (entry.expenseId) await Expense.findByIdAndDelete(entry.expenseId);
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
};
