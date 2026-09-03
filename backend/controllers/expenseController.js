const Expense = require('../models/Expense');
const Transaction = require('../models/Transaction');
const Cheque = require('../models/Cheque');
const ConsumptionMaterial = require('../models/ConsumptionMaterial');
const { startOfDay, endOfDay } = require('date-fns');
const { CONSUMPTION_MATERIAL_TYPES, SELF_EXPENSE_GROUP, FACTORY_EXPENSE_GROUPS } = require('../utils/wireConfig');
const { deleteTransactionsForSource } = require('../utils/transactionSyncService');
const { applyRelatedBalanceImpact } = require('./transactionController');
const { logActivity } = require('../utils/activityLogService');

const PROCESS_MATERIAL_GROUP = 'Process Material';

const LEGACY_CATEGORY_TO_GROUP = {
  'Labour Salary': 'Labour',
  'Labour Advance': 'Labour',
  'Labour Tea': 'Labour',
  'Labour Food': 'Labour',
  'Petrol Labour': 'Labour',
  'Coil Rental': 'Rental',
  'Wire Rental': 'Rental',
  'Weight Scale Payment': 'Operations',
  'Hardware Maintenance': 'Operations',
  Electricity: 'Operations',
  Miscellaneous: 'Operations',
  Annealing: 'Manufacturing',
  'Self Expense': 'Self Expense',
};

const LEGACY_TYPE_TO_CATEGORY = {
  Salary: 'Labour Salary',
  Maintenance: 'Hardware Maintenance',
  Manufacturing: 'Annealing',
  Bills: 'Electricity',
  Other: 'Miscellaneous',
};

function isProcessMaterialExpense(body) {
  if (body.expenseGroup === PROCESS_MATERIAL_GROUP) return true;
  return CONSUMPTION_MATERIAL_TYPES.includes(body.expenseCategory);
}

function normalizeExpensePayload(payload) {
  const body = { ...payload };
  if (!body.expenseCategory && body.expenseType) {
    body.expenseCategory = LEGACY_TYPE_TO_CATEGORY[body.expenseType] || 'Miscellaneous';
  }
  if (!body.expenseGroup && body.expenseCategory) {
    body.expenseGroup = LEGACY_CATEGORY_TO_GROUP[body.expenseCategory] || 'Operations';
  }
  if (isProcessMaterialExpense(body)) {
    const err = new Error('Process material must be added using Add Stock in the Process Material tab');
    err.statusCode = 400;
    throw err;
  }

  // Prevent enum / ObjectId validation errors from blank fields in UI.
  if (!body.sourceChequeId || String(body.sourceChequeId).trim() === '') delete body.sourceChequeId;
  if (!body.chequeId || String(body.chequeId).trim() === '') delete body.chequeId;
  if (!body.bankTransactionId || String(body.bankTransactionId).trim() === '') delete body.bankTransactionId;
  if (!body.chequeDate || String(body.chequeDate).trim() === '') delete body.chequeDate;

  if (body.paymentMethod !== 'Cheque') {
    delete body.sourceChequeId;
    delete body.chequeId;
    delete body.chequeNumber;
    delete body.chequeType;
    delete body.chequeBank;
    delete body.chequeDate;
    delete body.isEndorsedCheque;
    delete body.receivedFromName;
  }

  // Prevent enum validation errors from blank selects in UI.
  if (!body.coilType) delete body.coilType;
  if (!body.rentalRoute) delete body.rentalRoute;
  if (!['Coil Rental', 'Wire Rental'].includes(body.expenseCategory)) {
    delete body.coilType;
    delete body.rentalRoute;
  }
  if (body.expenseCategory === 'Wire Rental') {
    delete body.coilType;
  }

  return body;
}

function buildExpenseFilter(query) {
  const filter = {};
  if (query.startDate || query.endDate) {
    filter.expenseDate = {};
    if (query.startDate) filter.expenseDate.$gte = startOfDay(new Date(query.startDate));
    if (query.endDate) filter.expenseDate.$lte = endOfDay(new Date(query.endDate));
  }
  if (query.expenseType) filter.expenseType = query.expenseType;
  if (query.expenseGroup) filter.expenseGroup = query.expenseGroup;
  if (query.expenseCategory) filter.expenseCategory = query.expenseCategory;
  return filter;
}

/**
 * Add new expense entry.
 */
const createExpense = async (req, res, next) => {
  try {
    const body = normalizeExpensePayload(req.body);

    if (body.paymentMethod === 'Cheque') {
      const isEndorsed = body.isEndorsedCheque || body.chequeType === 'Customer Cheque';
      const chqType = isEndorsed ? 'Customer Cheque' : (body.chequeType || 'Company Cheque');
      const chqNumber = String(body.chequeNumber || '').trim() || `CHQ-${Date.now().toString().slice(-6)}`;
      const chqBank = String(body.chequeBank || body.bankAccount || 'Bank').trim();
      const chqDate = body.chequeDate ? new Date(body.chequeDate) : (body.expenseDate ? new Date(body.expenseDate) : new Date());

      if (isEndorsed && body.sourceChequeId) {
        const sourceCheque = await Cheque.findById(body.sourceChequeId);
        if (sourceCheque) {
          sourceCheque.status = 'Endorsed';
          sourceCheque.givenTo = {
            partyType: 'Expense',
            partyName: body.description || body.expenseCategory || 'Expense',
            expenseGroup: body.expenseGroup,
            expenseCategory: body.expenseCategory,
          };
          sourceCheque.endorsedDate = body.expenseDate || new Date();
          await sourceCheque.save();
          body.chequeId = sourceCheque._id;
          body.chequeNumber = sourceCheque.chequeNumber;
          body.chequeBank = sourceCheque.bankName;
          body.chequeDate = sourceCheque.chequeDate;
          body.chequeType = 'Customer Cheque';
          body.isEndorsedCheque = true;
        }
      } else if (!body.chequeId) {
        const newCheque = await Cheque.create({
          chequeNumber: chqNumber,
          chequeType: chqType,
          direction: isEndorsed ? 'Received' : 'Issued',
          bankName: chqBank,
          amount: Number(body.amount) || 0,
          chequeDate: chqDate,
          issueDate: body.expenseDate || new Date(),
          status: isEndorsed ? 'Endorsed' : 'Issued',
          receivedFrom: isEndorsed ? {
            partyType: 'Customer',
            partyName: body.receivedFromName || 'Customer',
          } : undefined,
          givenTo: {
            partyType: 'Expense',
            partyName: body.description || body.expenseCategory || 'Expense',
            expenseGroup: body.expenseGroup,
            expenseCategory: body.expenseCategory,
          },
          endorsedDate: isEndorsed ? (body.expenseDate || new Date()) : undefined,
          notes: body.description || '',
          handledBy: body.addedBy || '',
        });
        body.chequeId = newCheque._id;
        body.chequeNumber = chqNumber;
        body.chequeBank = chqBank;
        body.chequeDate = chqDate;
        body.chequeType = chqType;
        if (isEndorsed) body.isEndorsedCheque = true;
      }

      if (!isEndorsed && chqType !== 'Customer Cheque') {
        const allowed = ['MBL', 'UBL', 'Faisal Bank', 'Other'];
        let bAcc = allowed.find((a) => a.toLowerCase() === chqBank.toLowerCase());
        let bOther = undefined;
        if (!bAcc) {
          bAcc = 'Other';
          bOther = chqBank;
        }
        const txn = await Transaction.create({
          transactionType: 'Money Out',
          amount: Number(body.amount) || 0,
          paymentMethod: 'Cheque',
          chequeId: body.chequeId,
          chequeNumber: body.chequeNumber,
          chequeType: chqType,
          chequeBank: chqBank,
          chequeDate: chqDate,
          relatedTo: 'Other',
          relatedName: body.expenseGroup || 'Expense',
          description: body.description || `${body.expenseGroup} — ${body.expenseCategory} (Cheque #${body.chequeNumber})`,
          handledBy: body.addedBy || '',
          sourceType: 'Expense',
          bankAccount: bAcc,
          bankAccountOtherName: bOther,
          expenseGroup: body.expenseGroup,
          expenseCategory: body.expenseCategory,
          transactionDate: body.expenseDate || new Date(),
        });
        body.bankTransactionId = txn._id;
      }
    } else if (body.paymentMethod === 'Bank Transfer') {
      const allowed = ['MBL', 'UBL', 'Faisal Bank', 'Other'];
      if (!body.bankAccount || !allowed.includes(body.bankAccount)) {
        body.bankAccount = 'MBL';
      }
      const txn = await Transaction.create({
        transactionType: 'Money Out',
        amount: Number(body.amount) || 0,
        paymentMethod: 'Bank Transfer',
        relatedTo: 'Other',
        relatedName: body.expenseGroup || 'Expense',
        description: body.description || `${body.expenseGroup} — ${body.expenseCategory}`,
        handledBy: body.addedBy || '',
        sourceType: 'Expense',
        bankAccount: body.bankAccount,
        bankAccountOtherName: body.bankAccount === 'Other' ? body.bankAccountOtherName : undefined,
        expenseGroup: body.expenseGroup,
        expenseCategory: body.expenseCategory,
        transactionDate: body.expenseDate || new Date(),
      });
      body.bankTransactionId = txn._id;
    }

    const expense = await Expense.create(body);

    await logActivity({
      req,
      action: 'CREATE',
      module: 'Expense',
      description: `Recorded expense ${expense.expenseCategory || expense.expenseType || 'Expense'} — Rs.${expense.amount} (${expense.paymentMethod || 'Cash'})`,
      documentId: expense._id,
      newValue: expense,
    });
    res.status(201).json({ success: true, data: expense, message: 'Expense recorded' });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ success: false, message: error.message });
    }
    next(error);
  }
};

const EXPENSE_LIST_FIELDS =
  'expenseGroup expenseCategory expenseType description amount paymentMethod expenseDate addedBy labourName coilType rentalRoute bankTransactionId chequeId chequeNumber chequeType chequeBank chequeDate isEndorsedCheque sourceChequeId receivedFromName';
const PROCESS_LIST_FIELDS =
  'materialType purchaseDate totalCost notes quantity unit costPerUnit amountPaid amountDue paymentStatus paymentHistory supplierName supplierContact';

/**
 * Get all expenses with optional date and type filters.
 * Caps returned rows (default 500) so unbounded history cannot stall the UI.
 */
const getExpenses = async (req, res, next) => {
  try {
    const filter = buildExpenseFilter(req.query);
    const includeProcess = String(req.query.includeProcess).toLowerCase() === 'true';
    const limitRaw = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 2000) : 500;
    const purchaseFilter = buildPurchaseFilter(req.query);

    const [expenseCount, processCount, list, processPurchases] = await Promise.all([
      Expense.countDocuments(filter),
      includeProcess ? ConsumptionMaterial.countDocuments(purchaseFilter) : Promise.resolve(0),
      Expense.find(filter)
        .select(EXPENSE_LIST_FIELDS)
        .sort({ expenseDate: -1 })
        .limit(limit)
        .lean(),
      includeProcess
        ? ConsumptionMaterial.find(purchaseFilter)
            .select(PROCESS_LIST_FIELDS)
            .sort({ purchaseDate: -1 })
            .limit(limit)
            .lean()
        : Promise.resolve([]),
    ]);

    const normalized = list.map((entry) => {
      if (entry.expenseGroup) return entry;
      const fallbackGroup = LEGACY_CATEGORY_TO_GROUP[entry.expenseCategory] || 'Operations';
      return { ...entry, expenseGroup: fallbackGroup };
    });

    const processRows = processPurchases.map((m) => ({
      _id: m._id,
      expenseGroup: PROCESS_MATERIAL_GROUP,
      expenseCategory: m.materialType,
      materialType: m.materialType,
      expenseDate: m.purchaseDate,
      purchaseDate: m.purchaseDate,
      amount: m.totalCost || 0,
      totalCost: m.totalCost || 0,
      description: m.notes || '',
      isProcessPurchase: true,
      quantity: m.quantity,
      unit: m.unit,
      costPerUnit: m.costPerUnit,
      amountPaid: m.amountPaid ?? (m.totalCost || 0),
      amountDue: m.amountDue ?? 0,
      paymentStatus: m.paymentStatus || 'Paid',
      paymentHistory: m.paymentHistory || [],
      supplierName: m.supplierName || '',
      supplierContact: m.supplierContact || '',
    }));

    const merged = [...normalized, ...processRows]
      .sort((a, b) => new Date(b.expenseDate) - new Date(a.expenseDate))
      .slice(0, limit);
    const total = expenseCount + processCount;
    const truncated = total > merged.length;

    res.json({ success: true, data: merged, total, truncated });
  } catch (error) {
    next(error);
  }
};

/**
 * Get total expenses for date range.
 */
const getExpenseSummary = async (req, res, next) => {
  try {
    const filter = buildExpenseFilter(req.query);
    const result = await Expense.aggregate([{ $match: filter }, { $group: { _id: null, total: { $sum: '$amount' } } }]);
    res.json({ success: true, data: { totalExpenses: result[0]?.total || 0 } });
  } catch (error) {
    next(error);
  }
};

/**
 * Grouped expenses for week/month tracking.
 */
const getExpenseBreakdown = async (req, res, next) => {
  try {
    const expenseFilter = buildExpenseFilter(req.query);
    const period = ['day', 'week', 'month'].includes(req.query.period) ? req.query.period : 'month';
    const formatMap = { day: '%Y-%m-%d', week: '%G-W%V', month: '%Y-%m' };
    const format = formatMap[period];

    const purchaseFilter = buildPurchaseFilter(req.query);

    const [expenseBucketed, purchaseBucketed] = await Promise.all([
      Expense.aggregate([
        { $match: expenseFilter },
      {
        $addFields: {
          normalizedGroup: { $ifNull: ['$expenseGroup', 'Operations'] },
          normalizedCategory: { $ifNull: ['$expenseCategory', 'Miscellaneous'] },
          periodKey: { $dateToString: { format, date: '$expenseDate' } },
        },
      },
      { $project: { periodKey: 1, normalizedGroup: 1, normalizedCategory: 1, amount: 1 } },
      {
        $facet: {
          periodTotals: [
            { $group: { _id: '$periodKey', total: { $sum: '$amount' } } },
            { $sort: { _id: -1 } },
          ],
          groupTotals: [
            { $group: { _id: { period: '$periodKey', expenseGroup: '$normalizedGroup' }, total: { $sum: '$amount' } } },
            { $sort: { '_id.period': -1, '_id.expenseGroup': 1 } },
          ],
          categoryTotals: [
            {
              $group: {
                _id: { period: '$periodKey', expenseGroup: '$normalizedGroup', expenseCategory: '$normalizedCategory' },
                total: { $sum: '$amount' },
              },
            },
            { $sort: { '_id.period': -1, '_id.expenseGroup': 1, '_id.expenseCategory': 1 } },
          ],
        },
      },
      ]),
      ConsumptionMaterial.aggregate([
        { $match: purchaseFilter },
        {
          $addFields: {
            normalizedGroup: PROCESS_MATERIAL_GROUP,
            normalizedCategory: { $ifNull: ['$materialType', 'Miscellaneous'] },
            periodKey: { $dateToString: { format, date: '$purchaseDate' } },
            purchaseAmount: { $ifNull: ['$totalCost', 0] },
          },
        },
        { $project: { periodKey: 1, normalizedGroup: 1, normalizedCategory: 1, purchaseAmount: 1 } },
        {
          $facet: {
            periodTotals: [
              { $group: { _id: '$periodKey', total: { $sum: '$purchaseAmount' } } },
              { $sort: { _id: -1 } },
            ],
            groupTotals: [
              { $group: { _id: { period: '$periodKey', expenseGroup: '$normalizedGroup' }, total: { $sum: '$purchaseAmount' } } },
              { $sort: { '_id.period': -1, '_id.expenseGroup': 1 } },
            ],
            categoryTotals: [
              {
                $group: {
                  _id: { period: '$periodKey', expenseGroup: '$normalizedGroup', expenseCategory: '$normalizedCategory' },
                  total: { $sum: '$purchaseAmount' },
                },
              },
              { $sort: { '_id.period': -1, '_id.expenseGroup': 1, '_id.expenseCategory': 1 } },
            ],
          },
        },
      ]),
    ]);

    const expenseData = expenseBucketed[0] || { periodTotals: [], groupTotals: [], categoryTotals: [] };
    const purchaseData = purchaseBucketed[0] || { periodTotals: [], groupTotals: [], categoryTotals: [] };

    const mergeTotals = (a, b, keyFn) => {
      const map = new Map();
      for (const row of a) {
        const key = keyFn(row);
        map.set(key, (map.get(key) || 0) + (row.total || 0));
      }
      for (const row of b) {
        const key = keyFn(row);
        map.set(key, (map.get(key) || 0) + (row.total || 0));
      }
      return map;
    };

    const periodTotalsMap = mergeTotals(
      expenseData.periodTotals || [],
      purchaseData.periodTotals || [],
      (row) => row._id,
    );

    const groupTotalsMap = mergeTotals(
      expenseData.groupTotals || [],
      purchaseData.groupTotals || [],
      (row) => `${row._id.period}__${row._id.expenseGroup}`,
    );

    const categoryTotalsMap = mergeTotals(
      expenseData.categoryTotals || [],
      purchaseData.categoryTotals || [],
      (row) => `${row._id.period}__${row._id.expenseGroup}__${row._id.expenseCategory}`,
    );

    const mergedPeriodTotals = Array.from(periodTotalsMap.entries()).map(([periodKey, total]) => ({ _id: periodKey, total }));
    const mergedGroupTotals = Array.from(groupTotalsMap.entries()).map(([k, total]) => {
      const [periodKey, expenseGroup] = k.split('__');
      return { _id: { period: periodKey, expenseGroup }, total };
    });
    const mergedCategoryTotals = Array.from(categoryTotalsMap.entries()).map(([k, total]) => {
      const [periodKey, expenseGroup, expenseCategory] = k.split('__');
      return { _id: { period: periodKey, expenseGroup, expenseCategory }, total };
    });

    // sort merged arrays consistently
    mergedPeriodTotals.sort((x, y) => (x._id < y._id ? 1 : -1));
    mergedGroupTotals.sort((x, y) => (x._id.period < y._id.period ? 1 : x._id.period > y._id.period ? -1 : x._id.expenseGroup.localeCompare(y._id.expenseGroup)));
    mergedCategoryTotals.sort((x, y) => (x._id.period < y._id.period ? 1 : x._id.period > y._id.period ? -1 : x._id.expenseGroup.localeCompare(y._id.expenseGroup) || x._id.expenseCategory.localeCompare(y._id.expenseCategory)));

    const factoryPeriodTotalsMap = new Map();
    const selfPeriodTotalsMap = new Map();
    const selfCategoryTotalsMap = new Map();

    mergedGroupTotals.forEach((row) => {
      const period = row._id.period;
      const group = row._id.expenseGroup;
      if (group === SELF_EXPENSE_GROUP) {
        selfPeriodTotalsMap.set(period, (selfPeriodTotalsMap.get(period) || 0) + row.total);
      } else if (FACTORY_EXPENSE_GROUPS.includes(group)) {
        factoryPeriodTotalsMap.set(period, (factoryPeriodTotalsMap.get(period) || 0) + row.total);
      }
    });

    mergedCategoryTotals.forEach((row) => {
      if (row._id.expenseGroup === SELF_EXPENSE_GROUP) {
        const key = `${row._id.period}__${row._id.expenseCategory}`;
        selfCategoryTotalsMap.set(key, (selfCategoryTotalsMap.get(key) || 0) + row.total);
      }
    });

    const factoryPeriodTotals = Array.from(factoryPeriodTotalsMap.entries()).map(([_id, total]) => ({ _id, total })).sort((a, b) => (a._id < b._id ? 1 : -1));
    const selfPeriodTotals = Array.from(selfPeriodTotalsMap.entries()).map(([_id, total]) => ({ _id, total })).sort((a, b) => (a._id < b._id ? 1 : -1));
    const selfCategoryTotals = Array.from(selfCategoryTotalsMap.entries()).map(([k, total]) => {
      const [period, expenseCategory] = k.split('__');
      return { _id: { period, expenseCategory }, total };
    });

    res.json({
      success: true,
      data: {
        period,
        periodTotals: mergedPeriodTotals,
        factoryPeriodTotals,
        selfPeriodTotals,
        selfCategoryTotals,
        groupTotals: mergedGroupTotals,
        categoryTotals: mergedCategoryTotals,
      },
    });
  } catch (error) {
    next(error);
  }
};

function buildPurchaseFilter(query) {
  const filter = {};
  if (query.startDate || query.endDate) {
    filter.purchaseDate = {};
    if (query.startDate) filter.purchaseDate.$gte = startOfDay(new Date(query.startDate));
    if (query.endDate) filter.purchaseDate.$lte = endOfDay(new Date(query.endDate));
  }
  return filter;
}

/**
 * Update expense entry.
 */
const updateExpense = async (req, res, next) => {
  try {
    const payload = normalizeExpensePayload(req.body);
    const expense = await Expense.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
    if (!expense) return res.status(404).json({ success: false, error: 'Not found', message: 'Expense not found' });

    if (expense.bankTransactionId) {
      await Transaction.findByIdAndUpdate(expense.bankTransactionId, {
        amount: expense.amount,
        transactionDate: expense.expenseDate,
        description: expense.description,
        expenseGroup: expense.expenseGroup,
        expenseCategory: expense.expenseCategory,
      });
    }

    await logActivity({
      req,
      action: 'UPDATE',
      module: 'Expense',
      description: `Updated expense ${expense.expenseCategory || 'Expense'} — Rs.${expense.amount}`,
      documentId: expense._id,
      newValue: expense,
    });

    res.json({ success: true, data: expense, message: 'Expense updated' });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ success: false, message: error.message });
    }
    next(error);
  }
};

/**
 * Delete expense entry.
 */
const deleteExpense = async (req, res, next) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) return res.status(404).json({ success: false, error: 'Not found', message: 'Expense not found' });

    if (expense.chequeId) {
      if (expense.isEndorsedCheque) {
        await Cheque.findByIdAndUpdate(expense.chequeId, {
          status: 'In Hand',
          givenTo: undefined,
          endorsedDate: undefined,
        });
      } else {
        await Cheque.findByIdAndDelete(expense.chequeId);
      }
    }

    if (expense.bankTransactionId) {
      const txn = await Transaction.findById(expense.bankTransactionId);
      if (txn) {
        await applyRelatedBalanceImpact(txn, -1);
        await Transaction.findByIdAndDelete(txn._id);
      }
    } else {
      await deleteTransactionsForSource('Expense', expense._id);
    }

    await Expense.findByIdAndDelete(req.params.id);
    await logActivity({
      req,
      action: 'DELETE',
      module: 'Expense',
      description: `Deleted expense ${expense.expenseCategory || 'Expense'} — Rs.${expense.amount}`,
      documentId: expense._id,
      previousValue: expense,
    });
    res.json({ success: true, message: 'Expense deleted' });
  } catch (error) {
    next(error);
  }
};

/**
 * Break down a factory expense total entry into specific category expense lines.
 */
const breakdownExpense = async (req, res, next) => {
  try {
    const original = await Expense.findById(req.params.id);
    if (!original) {
      return res.status(404).json({ success: false, error: 'Not found', message: 'Expense not found' });
    }

    const { breakdownItems } = req.body;
    if (!Array.isArray(breakdownItems) || breakdownItems.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one breakdown item is required' });
    }

    const validItems = [];
    let totalAllocated = 0;

    for (const item of breakdownItems) {
      const amount = Number(item.amount);
      if (!amount || amount <= 0) continue;
      if (!item.expenseGroup || !item.expenseCategory) {
        return res.status(400).json({ success: false, message: 'Group and category are required for all breakdown items' });
      }
      validItems.push({
        ...item,
        amount,
      });
      totalAllocated += amount;
    }

    if (validItems.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one breakdown item with amount > 0 is required' });
    }

    if (totalAllocated > original.amount) {
      return res.status(400).json({
        success: false,
        message: `Total allocated (Rs.${totalAllocated.toLocaleString()}) exceeds expense amount (Rs.${original.amount.toLocaleString()})`,
      });
    }

    const createdExpenses = [];
    const createdMaterials = [];

    for (const item of validItems) {
      if (item.expenseGroup === PROCESS_MATERIAL_GROUP || CONSUMPTION_MATERIAL_TYPES.includes(item.expenseCategory)) {
        const material = await ConsumptionMaterial.create({
          materialType: item.expenseCategory,
          quantity: Number(item.quantity) || 1,
          unit: item.unit || (['Acid', 'Soap'].includes(item.expenseCategory) ? 'kg' : 'piece'),
          totalCost: item.amount,
          costPerUnit: item.quantity && Number(item.quantity) > 0 ? Number((item.amount / Number(item.quantity)).toFixed(2)) : undefined,
          notes: item.description || `Breakdown from ${original.expenseCategory || 'Daily Total'}`,
          purchaseDate: original.expenseDate || new Date(),
        });
        createdMaterials.push(material);
      } else {
        const payload = normalizeExpensePayload({
          expenseGroup: item.expenseGroup,
          expenseCategory: item.expenseCategory,
          amount: item.amount,
          description: item.description || '',
          paymentMethod: original.paymentMethod || 'Cash',
          expenseDate: original.expenseDate || new Date(),
          addedBy: original.addedBy || '',
          labourName: item.labourName || undefined,
          coilType: item.coilType || undefined,
          rentalRoute: item.rentalRoute || undefined,
        });
        const exp = await Expense.create(payload);
        createdExpenses.push(exp);
      }
    }

    const remaining = original.amount - totalAllocated;
    if (remaining > 0) {
      await Expense.findByIdAndUpdate(original._id, { amount: remaining });
    } else {
      await Expense.findByIdAndDelete(original._id);
    }

    await logActivity({
      req,
      action: 'UPDATE',
      module: 'Expense',
      description: `Broke down factory expense Rs.${original.amount} into ${validItems.length} categories (allocated Rs.${totalAllocated}${remaining > 0 ? `, remaining Rs.${remaining}` : ''})`,
      documentId: original._id,
      newValue: { originalAmount: original.amount, allocated: totalAllocated, remaining, items: validItems },
    });

    res.json({
      success: true,
      message: `Expense broken down successfully into ${validItems.length} items${remaining > 0 ? ` (Rs.${remaining.toLocaleString()} remaining as Daily Total)` : ''}`,
      data: {
        allocated: totalAllocated,
        remaining,
        createdExpenses,
        createdMaterials,
      },
    });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ success: false, message: error.message });
    }
    next(error);
  }
};

module.exports = {
  createExpense,
  getExpenses,
  getExpenseSummary,
  getExpenseBreakdown,
  updateExpense,
  deleteExpense,
  breakdownExpense,
};
