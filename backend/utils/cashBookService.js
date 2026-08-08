const { startOfDay, endOfDay, addDays, subDays, isAfter } = require('date-fns');
const Transaction = require('../models/Transaction');
const Expense = require('../models/Expense');
const ConsumptionMaterial = require('../models/ConsumptionMaterial');
const DailyCashOpening = require('../models/DailyCashOpening');
const DailyCashBreakdown = require('../models/DailyCashBreakdown');
const { computeExpenseTotalsFromRecords } = require('../utils/transactionSyncService');

function normalizeDate(d) {
  return startOfDay(new Date(d));
}

function dayKey(d) {
  return normalizeDate(d).getTime();
}

function sumTransactions(txs) {
  let totalIn = 0;
  let totalOut = 0;
  let bankIn = 0;
  let bankOut = 0;
  txs.forEach((t) => {
    if (t.paymentMethod === 'Bank Transfer') {
      // Bank transfers track a separate balance — excluded from cash in hand
      if (t.transactionType === 'Money In') bankIn += t.amount || 0;
      else bankOut += t.amount || 0;
    } else {
      if (t.transactionType === 'Money In') totalIn += t.amount || 0;
      else totalOut += t.amount || 0;
    }
  });
  return { totalIn, totalOut, bankIn, bankOut };
}

function filterForDay(records, day, dateField) {
  const start = normalizeDate(day);
  const end = endOfDay(start);
  return records.filter((r) => {
    const d = new Date(r[dateField]);
    return d >= start && d <= end;
  });
}

/**
 * Cash book figures for one day.
 * Money Out = daily book transactions out + factory expense total + self expense total.
 * Individual expenses are never transactions — only their day totals count.
 */
function buildDayResult(day, manual, openingBalance, openingSource, dayTxs, dayExpenses, dayMaterials) {
  const { totalIn, totalOut: transactionsOut, bankIn, bankOut } = sumTransactions(dayTxs);
  const expenseTotals = computeExpenseTotalsFromRecords(dayExpenses, dayMaterials);
  const totalOut = transactionsOut + expenseTotals.factoryTotal + expenseTotals.selfTotal;
  const closing = openingBalance + totalIn - totalOut;

  return {
    date: normalizeDate(day),
    openingBalance,
    openingSource,
    totalIn,
    totalOut,
    transactionsOut,
    expenseTotals,
    bankIn,
    bankOut,
    closingBalance: closing,
    manualNote: manual?.note || '',
  };
}

/**
 * Walk day-by-day from anchor to target and return cash book figures for target date.
 * A manually set opening balance is ALWAYS used exactly as entered.
 */
async function getCashBookForDate(targetDate) {
  const target = normalizeDate(targetDate);

  const [firstManual, firstTx, firstExpense] = await Promise.all([
    DailyCashOpening.findOne().sort({ bookDate: 1 }),
    Transaction.findOne().sort({ transactionDate: 1 }),
    Expense.findOne().sort({ expenseDate: 1 }),
  ]);

  let anchor = target;
  if (firstManual?.bookDate && normalizeDate(firstManual.bookDate) < anchor) {
    anchor = normalizeDate(firstManual.bookDate);
  }
  if (firstTx?.transactionDate && normalizeDate(firstTx.transactionDate) < anchor) {
    anchor = normalizeDate(firstTx.transactionDate);
  }
  if (firstExpense?.expenseDate && normalizeDate(firstExpense.expenseDate) < anchor) {
    anchor = normalizeDate(firstExpense.expenseDate);
  }

  const [manuals, allTxs, allExpenses, allMaterials] = await Promise.all([
    DailyCashOpening.find({ bookDate: { $gte: anchor, $lte: target } }),
    Transaction.find({
      transactionDate: { $gte: anchor, $lte: endOfDay(target) },
      sourceType: { $nin: ['Expense', 'ConsumptionMaterial'] },
    }).sort({ transactionDate: 1 }),
    Expense.find({ expenseDate: { $gte: anchor, $lte: endOfDay(target) } }),
    ConsumptionMaterial.find({ purchaseDate: { $gte: anchor, $lte: endOfDay(target) } }),
  ]);
  const manualMap = new Map(manuals.map((m) => [dayKey(m.bookDate), m]));

  let runningClosing = 0;
  let result = null;

  for (let d = anchor; !isAfter(d, target); d = addDays(d, 1)) {
    const manual = manualMap.get(dayKey(d));
    let opening;
    let openingSource;

    if (manual) {
      opening = manual.openingBalance;
      openingSource = 'manual';
    } else if (dayKey(d) === dayKey(anchor)) {
      opening = 0;
      openingSource = 'auto';
    } else {
      opening = runningClosing;
      openingSource = 'auto';
    }

    const dayResult = buildDayResult(
      d,
      manual,
      opening,
      openingSource,
      filterForDay(allTxs, d, 'transactionDate'),
      filterForDay(allExpenses, d, 'expenseDate'),
      filterForDay(allMaterials, d, 'purchaseDate')
    );

    if (dayKey(d) === dayKey(target)) {
      result = dayResult;
    }

    runningClosing = dayResult.closingBalance;
  }

  return result;
}

/**
 * Cash book rows for a date range (for summary table).
 */
async function getCashBookRange(startDate, endDate) {
  const start = normalizeDate(startDate);
  const end = normalizeDate(endDate);
  const rows = [];

  for (let d = start; !isAfter(d, end); d = addDays(d, 1)) {
    const day = await getCashBookForDate(d);
    rows.push(day);
  }

  return rows;
}

/**
 * Set manual opening balance (cash in hand) for a specific day.
 */
async function setDailyOpening(bookDate, openingBalance, note) {
  const day = normalizeDate(bookDate);
  const doc = await DailyCashOpening.findOneAndUpdate(
    { bookDate: day },
    { bookDate: day, openingBalance: Number(openingBalance), note: note || '' },
    { upsert: true, new: true, runValidators: true }
  );
  return doc;
}

/**
 * Previous day's closing becomes hint for UI.
 */
async function getPreviousDayClosing(bookDate) {
  const prev = subDays(normalizeDate(bookDate), 1);
  const book = await getCashBookForDate(prev);
  return book.closingBalance;
}

async function getCashBreakdownForDate(bookDate) {
  const day = normalizeDate(bookDate);
  const doc = await DailyCashBreakdown.findOne({ bookDate: day }).lean();
  if (!doc) {
    return { bookDate: day, lines: [], note: '', total: 0 };
  }
  const lines = (doc.lines || []).map((line) => ({
    holder: line.holder,
    amount: Number(line.amount) || 0,
  }));
  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  return {
    bookDate: doc.bookDate,
    lines,
    note: doc.note || '',
    total: Math.round(total * 100) / 100,
  };
}

async function setCashBreakdown(bookDate, lines, note) {
  const day = normalizeDate(bookDate);
  const cleaned = (lines || [])
    .map((line) => ({
      holder: String(line.holder || '').trim(),
      amount: Number(line.amount) || 0,
    }))
    .filter((line) => line.holder && line.amount >= 0);
  const doc = await DailyCashBreakdown.findOneAndUpdate(
    { bookDate: day },
    { bookDate: day, lines: cleaned, note: note || '' },
    { upsert: true, new: true, runValidators: true }
  );
  return getCashBreakdownForDate(day);
}

module.exports = {
  getCashBookForDate,
  getCashBookRange,
  setDailyOpening,
  getPreviousDayClosing,
  getCashBreakdownForDate,
  setCashBreakdown,
  normalizeDate,
};
