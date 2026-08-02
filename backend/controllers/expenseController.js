const Expense = require('../models/Expense');
const Transaction = require('../models/Transaction');
const ConsumptionMaterial = require('../models/ConsumptionMaterial');
const { startOfDay, endOfDay } = require('date-fns');
const { CONSUMPTION_MATERIAL_TYPES, SELF_EXPENSE_GROUP, FACTORY_EXPENSE_GROUPS } = require('../utils/wireConfig');
const { deleteTransactionsForSource } = require('../utils/transactionSyncService');
const { applyRelatedBalanceImpact } = require('./transactionController');

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
    const expense = await Expense.create(body);
    res.status(201).json({ success: true, data: expense, message: 'Expense recorded' });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ success: false, message: error.message });
    }
    next(error);
  }
};

/**
 * Get all expenses with optional date and type filters.
 */
const getExpenses = async (req, res, next) => {
  try {
    const filter = buildExpenseFilter(req.query);
    const includeProcess = String(req.query.includeProcess).toLowerCase() === 'true';

    const [list, processPurchases] = await Promise.all([
      Expense.find(filter).sort({ expenseDate: -1 }),
      includeProcess
        ? ConsumptionMaterial.find(buildPurchaseFilter(req.query)).sort({ purchaseDate: -1 })
        : Promise.resolve([]),
    ]);

    const normalized = list.map((entry) => {
      if (entry.expenseGroup) return entry;
      const fallbackGroup = LEGACY_CATEGORY_TO_GROUP[entry.expenseCategory] || 'Operations';
      return { ...entry.toObject(), expenseGroup: fallbackGroup };
    });

    const processRows = processPurchases.map((m) => ({
      _id: m._id,
      expenseGroup: PROCESS_MATERIAL_GROUP,
      expenseCategory: m.materialType,
      expenseDate: m.purchaseDate,
      amount: m.totalCost || 0,
      description: m.notes || '',
      isProcessPurchase: true,
      quantity: m.quantity,
      unit: m.unit,
    }));

    const merged = [...normalized, ...processRows].sort((a, b) => new Date(b.expenseDate) - new Date(a.expenseDate));
    res.json({ success: true, data: merged, total: merged.length });
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
    res.json({ success: true, message: 'Expense deleted' });
  } catch (error) {
    next(error);
  }
};

module.exports = { createExpense, getExpenses, getExpenseSummary, getExpenseBreakdown, updateExpense, deleteExpense };
