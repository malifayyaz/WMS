const { startOfDay, endOfDay } = require('date-fns');
const Transaction = require('../models/Transaction');
const BankAccountOpening = require('../models/BankAccountOpening');

const BANK_SOURCE_EXCLUDE = ['Expense', 'ConsumptionMaterial'];

function accountKey(bankAccount, otherName = '') {
  const acct = bankAccount || 'MBL';
  if (acct === 'Other') {
    return `Other:${String(otherName || '').trim().toLowerCase() || 'other'}`;
  }
  return acct;
}

function accountLabel(bankAccount, otherName = '') {
  if (bankAccount === 'Other') return otherName || 'Other';
  return bankAccount || 'MBL';
}

function txnDelta(t) {
  return t.transactionType === 'Money In' ? (t.amount || 0) : -(t.amount || 0);
}

function matchesAccount(t, bankAccount, otherName = '') {
  if (!bankAccount) return true;
  const acct = t.bankAccount || 'MBL';
  if (acct !== bankAccount) return false;
  if (bankAccount === 'Other' && otherName) {
    return String(t.bankAccountOtherName || '').trim().toLowerCase()
      === String(otherName).trim().toLowerCase();
  }
  return true;
}

async function getOpeningsMap() {
  const docs = await BankAccountOpening.find();
  const map = new Map();
  docs.forEach((d) => {
    map.set(accountKey(d.bankAccount, d.bankAccountOtherName), d);
  });
  return map;
}

/**
 * Effective bank opening for a query window.
 * If a stored opening exists: opening + Σ Δ from asOfDate until before rangeStart.
 * If no opening: Σ Δ of all matching txns before rangeStart (legacy behaviour).
 * When rangeStart is null, returns all-time balance pieces via callers.
 */
function openingContribution(openingDoc, txnsBeforeRange, rangeStart) {
  if (!openingDoc) {
    return txnsBeforeRange.reduce((s, t) => s + txnDelta(t), 0);
  }
  const asOf = startOfDay(new Date(openingDoc.asOfDate));
  let total = Number(openingDoc.openingBalance) || 0;
  txnsBeforeRange.forEach((t) => {
    const d = startOfDay(new Date(t.transactionDate));
    if (d >= asOf) total += txnDelta(t);
  });
  return total;
}

/**
 * Filter txns in a range to those that count after the account opening cutoff.
 * With no opening, all txns in range count.
 */
function filterTxnsAfterOpening(txns, openingDoc) {
  if (!openingDoc) return txns;
  const asOf = startOfDay(new Date(openingDoc.asOfDate));
  return txns.filter((t) => startOfDay(new Date(t.transactionDate)) >= asOf);
}

async function loadBankTxns(filter = {}) {
  const txs = await Transaction.find({
    $or: [
      { paymentMethod: 'Bank Transfer' },
      {
        paymentMethod: 'Cheque',
        transactionType: 'Money Out',
        chequeType: { $in: ['Company Cheque', 'Personal Cheque'] },
        isEndorsedCheque: { $ne: true },
      },
    ],
    sourceType: { $nin: BANK_SOURCE_EXCLUDE },
    ...filter,
  }).sort({ transactionDate: 1 });

  return txs.map((t) => {
    if (!t.bankAccount && t.paymentMethod === 'Cheque') {
      const b = (t.chequeBank || t.bankName || 'MBL').trim();
      const standard = ['MBL', 'UBL', 'Faisal Bank'].find((s) => s.toLowerCase() === b.toLowerCase());
      if (standard) {
        t.bankAccount = standard;
      } else {
        t.bankAccount = 'Other';
        t.bankAccountOtherName = b;
      }
    }
    return t;
  });
}

/**
 * Build bank book for optional account + date range.
 */
async function buildBankBook({ startDate, endDate, bankAccount, bankAccountOtherName } = {}) {
  const openings = await getOpeningsMap();

  const bankFilter = {};
  if (bankAccount) bankFilter.bankAccount = bankAccount;

  const all = await loadBankTxns(bankFilter);
  const filtered = all.filter((t) => matchesAccount(t, bankAccount, bankAccountOtherName));

  // When filtering a single named account, use that opening; otherwise sum openings for all accounts touched
  let openingBalance = 0;
  const rangeStart = startDate ? startOfDay(new Date(startDate)) : null;
  const rangeEnd = endDate ? endOfDay(new Date(endDate)) : null;

  if (bankAccount) {
    const key = accountKey(bankAccount, bankAccountOtherName);
    const openingDoc = openings.get(key)
      || (bankAccount !== 'Other' ? openings.get(bankAccount) : null);
    const before = filtered.filter((t) => !rangeStart || startOfDay(new Date(t.transactionDate)) < rangeStart);
    openingBalance = openingContribution(openingDoc, before, rangeStart);
  } else {
    // Aggregate across accounts: group by account key
    const byAcct = new Map();
    filtered.forEach((t) => {
      const key = accountKey(t.bankAccount, t.bankAccountOtherName);
      if (!byAcct.has(key)) byAcct.set(key, []);
      byAcct.get(key).push(t);
    });
    // Also include openings with no txns yet
    openings.forEach((doc, key) => {
      if (!byAcct.has(key)) byAcct.set(key, []);
    });
    byAcct.forEach((txns, key) => {
      const openingDoc = openings.get(key) || null;
      const before = txns.filter((t) => !rangeStart || startOfDay(new Date(t.transactionDate)) < rangeStart);
      openingBalance += openingContribution(openingDoc, before, rangeStart);
    });
  }

  let inRange = filtered.filter((t) => {
    const d = new Date(t.transactionDate);
    if (rangeStart && d < rangeStart) return false;
    if (rangeEnd && d > rangeEnd) return false;
    return true;
  });

  if (bankAccount) {
    const key = accountKey(bankAccount, bankAccountOtherName);
    const openingDoc = openings.get(key)
      || (bankAccount !== 'Other' ? openings.get(bankAccount) : null);
    inRange = filterTxnsAfterOpening(inRange, openingDoc);
  } else {
    inRange = inRange.filter((t) => {
      const key = accountKey(t.bankAccount, t.bankAccountOtherName);
      const openingDoc = openings.get(key) || null;
      if (!openingDoc) return true;
      return startOfDay(new Date(t.transactionDate)) >= startOfDay(new Date(openingDoc.asOfDate));
    });
  }

  let running = openingBalance;
  let totalIn = 0;
  let totalOut = 0;
  const rows = inRange.map((t) => {
    const isIn = t.transactionType === 'Money In';
    if (isIn) {
      running += t.amount || 0;
      totalIn += t.amount || 0;
    } else {
      running -= t.amount || 0;
      totalOut += t.amount || 0;
    }
    return {
      _id: t._id,
      date: t.transactionDate,
      transactionType: t.transactionType,
      amount: t.amount,
      relatedTo: t.relatedTo,
      relatedName: t.relatedName,
      relatedId: t.relatedId,
      bankAccount: t.bankAccount || 'MBL',
      bankAccountOtherName: t.bankAccountOtherName || '',
      bankAccountNumber: t.bankAccountNumber,
      description: t.description,
      expenseGroup: t.expenseGroup,
      expenseCategory: t.expenseCategory,
      linkedExpenseId: t.linkedExpenseId,
      balance: running,
    };
  });

  return {
    openingBalance,
    totalIn,
    totalOut,
    closingBalance: running,
    transactions: rows,
  };
}

/**
 * Per-account all-time balances including openings.
 */
async function buildAccountSummaries() {
  const openings = await getOpeningsMap();
  const all = await loadBankTxns();
  const accountMap = new Map();

  const ensure = (bankAccount, otherName = '') => {
    const key = accountKey(bankAccount, otherName);
    if (!accountMap.has(key)) {
      const openingDoc = openings.get(key) || null;
      accountMap.set(key, {
        key,
        bankAccount: bankAccount || 'MBL',
        bankAccountOtherName: bankAccount === 'Other' ? (otherName || '') : '',
        label: accountLabel(bankAccount, otherName),
        openingBalance: openingDoc ? (Number(openingDoc.openingBalance) || 0) : 0,
        asOfDate: openingDoc ? openingDoc.asOfDate : null,
        note: openingDoc?.note || '',
        totalIn: 0,
        totalOut: 0,
        balance: openingDoc ? (Number(openingDoc.openingBalance) || 0) : 0,
      });
    }
    return accountMap.get(key);
  };

  // Seed standard accounts + any openings
  ['MBL', 'UBL', 'Faisal Bank', 'Other'].forEach((acct) => {
    if (acct === 'Other') {
      // only seed Other if opening or txns exist
      return;
    }
    ensure(acct);
  });
  openings.forEach((doc) => {
    ensure(doc.bankAccount, doc.bankAccountOtherName);
  });

  all.forEach((t) => {
    const acct = t.bankAccount || 'MBL';
    const other = acct === 'Other' ? (t.bankAccountOtherName || '') : '';
    const a = ensure(acct, other);
    const openingDoc = openings.get(accountKey(acct, other));
    if (openingDoc) {
      const asOf = startOfDay(new Date(openingDoc.asOfDate));
      if (startOfDay(new Date(t.transactionDate)) < asOf) return;
    }
    if (t.transactionType === 'Money In') {
      a.totalIn += t.amount || 0;
      a.balance += t.amount || 0;
    } else {
      a.totalOut += t.amount || 0;
      a.balance -= t.amount || 0;
    }
  });

  return Array.from(accountMap.values());
}

async function currentBankBalance() {
  const accounts = await buildAccountSummaries();
  return accounts.reduce((s, a) => s + (a.balance || 0), 0);
}

async function setBankOpening({ bankAccount, bankAccountOtherName, openingBalance, asOfDate, note }) {
  const allowed = ['MBL', 'UBL', 'Faisal Bank', 'Other'];
  if (!allowed.includes(bankAccount)) {
    throw Object.assign(new Error('Invalid bank account'), { statusCode: 400 });
  }
  if (bankAccount === 'Other' && !String(bankAccountOtherName || '').trim()) {
    throw Object.assign(new Error('Bank / account name required for Other'), { statusCode: 400 });
  }
  if (asOfDate == null || asOfDate === '') {
    throw Object.assign(new Error('Opening date required'), { statusCode: 400 });
  }
  const otherName = bankAccount === 'Other' ? String(bankAccountOtherName).trim() : '';
  const doc = await BankAccountOpening.findOneAndUpdate(
    { bankAccount, bankAccountOtherName: otherName },
    {
      bankAccount,
      bankAccountOtherName: otherName,
      openingBalance: Number(openingBalance) || 0,
      asOfDate: startOfDay(new Date(asOfDate)),
      note: note || '',
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return doc;
}

async function getBankOpenings() {
  return BankAccountOpening.find().sort({ bankAccount: 1, bankAccountOtherName: 1 });
}

module.exports = {
  accountKey,
  accountLabel,
  buildBankBook,
  buildAccountSummaries,
  currentBankBalance,
  setBankOpening,
  getBankOpenings,
  getOpeningsMap,
};
