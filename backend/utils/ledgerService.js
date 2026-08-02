const Transaction = require('../models/Transaction');
const Order = require('../models/Order');
const RawMaterial = require('../models/RawMaterial');
const JobWork = require('../models/JobWork');
const { startOfDay, endOfDay, format } = require('date-fns');

/**
 * Credit = they owe us / we paid them (reduces payable for suppliers)
 * Debit = we owe them (purchases / payables)
 * Balance = credit - debit (positive = net receivable, negative = net payable)
 *
 * When a date range is applied, the balance of everything BEFORE the range is
 * carried in as a "Balance brought forward" entry so a lone payment inside the
 * range never looks like we owe the party.
 */

function inRange(date, startDate, endDate) {
  if (!date) return true;
  const d = new Date(date);
  if (startDate && d < startOfDay(new Date(startDate))) return false;
  if (endDate && d > endOfDay(new Date(endDate))) return false;
  return true;
}

function isBeforeRange(date, startDate) {
  if (!startDate || !date) return false;
  return new Date(date) < startOfDay(new Date(startDate));
}

/**
 * Pool deliveries are stored as one fragment per arrival lot. Collapse them to
 * a single ledger/UI line using deliveryGroupId, or a historical heuristic when
 * group ids were not yet assigned.
 */
function mergeJobWorkDeliveryFragments(fragments) {
  if (!fragments.length) return [];
  const groups = new Map();

  fragments.forEach((f) => {
    const dateKey = f.date ? new Date(f.date).toISOString() : '';
    const key = f.deliveryGroupId
      ? `g:${f.deliveryGroupId}`
      : `h:${dateKey}|${Number(f.labourRatePerKg) || 0}|${f.wireNumber == null ? '' : Number(f.wireNumber)}|${Number(f.coilRatePerKg) || 0}`;

    if (!groups.has(key)) {
      groups.set(key, {
        date: f.date,
        labourRatePerKg: f.labourRatePerKg || 0,
        coilRatePerKg: f.coilRatePerKg || 0,
        weightKg: 0,
        labourAmount: 0,
        wireNumber: f.wireNumber,
        bundles: 0,
        deliveryGroupId: f.deliveryGroupId || null,
        jobWorkId: f.jobWorkId,
        parts: 0,
      });
    }
    const g = groups.get(key);
    g.weightKg += f.weightKg || 0;
    g.labourAmount += f.labourAmount || 0;
    g.bundles += f.bundles || 0;
    g.parts += 1;
    // Prefer primary fragment's lot id for edit navigation
    if (f.isGroupPrimary) g.jobWorkId = f.jobWorkId;
  });

  return [...groups.values()].map((g) => ({
    ...g,
    weightKg: Math.round(g.weightKg * 1000) / 1000,
    labourAmount: Math.round(g.labourAmount * 100) / 100,
  }));
}

function mapOpeningToLedger(partyType, openingBalance, openingDate, openingType) {
  const amount = Number(openingBalance || 0);
  if (amount <= 0 || openingType === 'none') return null;

  // DB openingBalanceType uses legacy names; map to user-facing columns:
  // Customer 'debit' type = customer owes us → Credit column
  // Customer 'credit' type = we owe customer → Debit column
  // Supplier 'credit' type = we owe supplier → Debit column
  // Supplier 'debit' type = supplier owes us (advance) → Credit column
  let credit = 0;
  let debit = 0;

  if (partyType === 'Customer') {
    if (openingType === 'debit') credit = amount;
    else debit = amount;
  } else {
    if (openingType === 'credit') debit = amount;
    else credit = amount;
  }

  return {
    date: openingDate,
    description: 'Opening Balance',
    credit,
    debit,
    weightKg: 0,
    ratePerKg: 0,
    totalPrice: amount,
    source: 'Opening Balance',
    entryType: 'opening',
  };
}

/** Collects ALL ledger entries for a party (no date filtering). */
async function collectRawEntries(partyType, party) {
  const entries = [];

  const opening = mapOpeningToLedger(
    partyType,
    party.openingBalance,
    party.openingBalanceDate || party.createdAt,
    party.openingBalanceType || (partyType === 'Customer' ? 'debit' : 'credit')
  );
  if (opening) entries.push(opening);

  if (partyType === 'Customer') {
    const orders = await Order.find({ customerId: party._id }).sort({ orderDate: 1 });
    orders.forEach((o) => {
      const weight = o.finalWeightKg ?? o.initialWeightKg ?? 0;
      if (o.isReturn) {
        entries.push({
          date: o.orderDate,
          description: `Wire return — ${o.wireType || `Wire #${o.wireNumber}`}${o.bundles ? ` (${o.bundles} bundles)` : ''}`,
          credit: 0,
          debit: o.totalAmount || 0,
          weightKg: weight,
          ratePerKg: o.ratePerKg || 0,
          totalPrice: o.totalAmount || 0,
          source: 'Wire Return',
          sourceId: o._id,
          entryType: 'return',
        });
        return;
      }
      entries.push({
        date: o.orderDate,
        description: `${o.wireType || `Wire #${o.wireNumber}`}${o.wireSize ? ` (${o.wireSize})` : ''}${o.bundles ? ` · ${o.bundles} bundles` : ''}${o.isAnnealed ? ' · annealed' : ''}`,
        credit: o.totalAmount || 0,
        debit: 0,
        weightKg: weight,
        ratePerKg: o.ratePerKg || 0,
        totalPrice: o.totalAmount || 0,
        source: 'Sale',
        sourceId: o._id,
        entryType: 'sale',
      });
      if (o.amountPaid > 0) {
        entries.push({
          date: o.orderDate,
          description: `Payment on sale — ${o.wireType || `Wire #${o.wireNumber}`}`,
          credit: 0,
          debit: o.amountPaid,
          weightKg: 0,
          ratePerKg: 0,
          totalPrice: o.amountPaid,
          source: 'Sale Payment',
          sourceId: o._id,
          entryType: 'payment',
        });
      }
    });

    (party.paymentHistory || []).forEach((p) => {
      entries.push({
        date: p.date,
        description: p.note || 'Payment received',
        credit: 0,
        debit: p.amount || 0,
        weightKg: 0,
        ratePerKg: 0,
        totalPrice: p.amount || 0,
        source: 'Payment',
        entryType: 'payment',
      });
    });

    const jobWorks = await JobWork.find({ customerId: party._id }).sort({ arrivalDate: 1 });
    const deliveryFragments = [];
    jobWorks.forEach((j) => {
      entries.push({
        date: j.arrivalDate,
        description: `Job work coil arrived — ${j.coilCategory} (${j.arrivedWeightKg} kg)`,
        credit: 0,
        debit: 0,
        weightKg: j.arrivedWeightKg || 0,
        ratePerKg: j.coilRatePerKg || 0,
        totalPrice: 0,
        source: 'Job Work — Arrival',
        sourceId: j._id,
        entryType: 'jobwork',
      });
      (j.deliveries || []).forEach((d) => {
        deliveryFragments.push({
          date: d.deliveredDate,
          labourRatePerKg: d.labourRatePerKg || j.labourRatePerKg || 0,
          coilRatePerKg: d.coilRatePerKg || j.coilRatePerKg || 0,
          weightKg: d.weightKg || 0,
          labourAmount: d.labourAmount || 0,
          wireNumber: d.wireNumber,
          bundles: d.bundles || 0,
          deliveryGroupId: d.deliveryGroupId ? String(d.deliveryGroupId) : null,
          jobWorkId: j._id,
          isGroupPrimary: d.isGroupPrimary !== false,
        });
      });
    });

    // One customer delivery may be FIFO-split across arrival lots — show a single ledger line.
    const mergedDeliveries = mergeJobWorkDeliveryFragments(deliveryFragments);
    mergedDeliveries.forEach((d) => {
      const rate = d.labourRatePerKg || 0;
      const wireBit = d.wireNumber ? ` Wire #${d.wireNumber}` : '';
      const bundBit = d.bundles ? ` · ${d.bundles} bundles` : '';
      entries.push({
        date: d.date,
        description: `Job work wire delivered — ${d.weightKg} kg × ${rate}/kg labour${wireBit}${bundBit}`,
        credit: d.labourAmount || 0,
        debit: 0,
        weightKg: d.weightKg || 0,
        ratePerKg: rate,
        totalPrice: d.labourAmount || 0,
        source: 'Job Work — Delivery',
        sourceId: d.jobWorkId,
        entryType: 'jobwork',
        deliveryGroupId: d.deliveryGroupId || undefined,
      });
    });

  }

  if (partyType === 'Supplier') {
    const purchases = await RawMaterial.find({ supplierId: party._id }).sort({ purchaseDate: 1 });
    purchases.forEach((p) => {
      if (p.isReturn) {
        entries.push({
          date: p.purchaseDate,
          description: `Coil return — ${p.materialType || p.coilCategory}${p.bundles ? ` · ${p.bundles} bundles` : ''}`,
          credit: p.totalAmount || 0,
          debit: 0,
          weightKg: p.weightInKg || 0,
          ratePerKg: p.ratePerKg || 0,
          totalPrice: p.totalAmount || 0,
          source: 'Coil Return',
          sourceId: p._id,
          entryType: 'return',
        });
        return;
      }
      entries.push({
        date: p.purchaseDate,
        description: `Stock arrival — ${p.materialType || p.coilCategory}${p.bundles ? ` · ${p.bundles} bundles` : ''}`,
        credit: 0,
        debit: p.totalAmount || 0,
        weightKg: p.weightInKg || 0,
        ratePerKg: p.ratePerKg || 0,
        totalPrice: p.totalAmount || 0,
        source: 'Stock Arrival',
        sourceId: p._id,
        entryType: 'purchase',
      });
      if (p.amountPaid > 0) {
        entries.push({
          date: p.purchaseDate,
          description: 'Payment on stock arrival',
          credit: p.amountPaid,
          debit: 0,
          weightKg: 0,
          ratePerKg: 0,
          totalPrice: p.amountPaid,
          source: 'Purchase Payment',
          sourceId: p._id,
          entryType: 'payment',
        });
      }
    });

  }

  const transactions = await Transaction.find({ relatedTo: partyType, relatedId: party._id }).sort({ transactionDate: 1 });
  transactions.forEach((t) => {
    if (t.orderId || t.sourceType === 'Order') return;
    if (t.sourceType === 'RawMaterial') return;
    const isIn = t.transactionType === 'Money In';
    if (partyType === 'Customer') {
      entries.push({
        date: t.transactionDate,
        description: t.description || (isIn ? 'Payment received' : 'Refund / adjustment'),
        credit: isIn ? 0 : t.amount,
        debit: isIn ? t.amount : 0,
        weightKg: 0,
        ratePerKg: 0,
        totalPrice: t.amount || 0,
        source: 'Daily Book',
        sourceId: t._id,
        entryType: isIn ? 'payment' : 'adjustment',
      });
    } else {
      // Supplier: purchase = debit (we owe them). Payment made (Money Out) = credit
      // (reduces payable) — same as amountPaid on stock arrival. Refund (Money In) = debit.
      entries.push({
        date: t.transactionDate,
        description: t.description || (isIn ? 'Refund received' : 'Payment made'),
        credit: isIn ? 0 : t.amount,
        debit: isIn ? t.amount : 0,
        weightKg: 0,
        ratePerKg: 0,
        totalPrice: t.amount || 0,
        source: 'Daily Book',
        sourceId: t._id,
        entryType: 'payment',
      });
    }
  });

  entries.sort((a, b) => new Date(a.date) - new Date(b.date));
  return entries;
}

/**
 * Splits all entries into (brought-forward pseudo-entry + entries within range).
 */
function applyDateRange(allEntries, startDate, endDate) {
  if (!startDate && !endDate) return { entries: allEntries, broughtForward: 0 };

  const before = [];
  const within = [];
  allEntries.forEach((e) => {
    if (isBeforeRange(e.date, startDate)) before.push(e);
    else if (inRange(e.date, startDate, endDate)) within.push(e);
  });

  const broughtForward = before.reduce((s, e) => s + (e.credit || 0) - (e.debit || 0), 0);
  const entries = [...within];
  if (before.length > 0) {
    entries.unshift({
      date: startOfDay(new Date(startDate)),
      description: 'Balance brought forward',
      credit: broughtForward > 0 ? broughtForward : 0,
      debit: broughtForward < 0 ? -broughtForward : 0,
      weightKg: 0,
      ratePerKg: 0,
      totalPrice: Math.abs(broughtForward),
      source: 'Balance b/f',
      entryType: 'broughtforward',
    });
  }
  return { entries, broughtForward };
}

function applyRunningBalance(entries) {
  let balance = 0;
  let totalWeight = 0;
  return entries.map((e) => {
    balance += (e.credit || 0) - (e.debit || 0);
    if (e.entryType === 'sale' || e.entryType === 'purchase') {
      totalWeight += e.weightKg || 0;
    }
    return { ...e, balance, runningTotalWeight: totalWeight };
  });
}

function summarizeEntries(entries) {
  const totalCredit = entries.reduce((s, e) => s + (e.credit || 0), 0);
  const totalDebit = entries.reduce((s, e) => s + (e.debit || 0), 0);
  const totalWeight = entries
    .filter((e) => e.entryType === 'sale' || e.entryType === 'purchase')
    .reduce((s, e) => s + (e.weightKg || 0), 0);
  const balance = totalCredit - totalDebit;
  return { totalCredit, totalDebit, balance, totalWeight };
}

async function buildLedger(partyType, party, options = {}) {
  if (partyType === 'Customer' && party.customerType === 'Daily') {
    const orders = await Order.find({ customerId: party._id }).sort({ orderDate: -1 });
    const dailyEntries = orders
      .filter((o) => inRange(o.orderDate, options.startDate, options.endDate))
      .map((o) => ({
        date: o.orderDate,
        description: `${o.wireType || `Wire #${o.wireNumber}`} — ${o.finalWeightKg ?? o.initialWeightKg} kg`,
        amount: o.totalAmount || 0,
        weightKg: o.finalWeightKg ?? o.initialWeightKg ?? 0,
        ratePerKg: o.ratePerKg || 0,
        totalPrice: o.totalAmount || 0,
        source: 'Sale',
        sourceId: o._id,
      }));

    const dailyTxs = await Transaction.find({ relatedTo: 'Customer', relatedId: party._id }).sort({ transactionDate: -1 });
    dailyTxs
      .filter((t) => inRange(t.transactionDate, options.startDate, options.endDate) && !t.orderId)
      .forEach((t) => {
        dailyEntries.push({
          date: t.transactionDate,
          description: t.description || (t.transactionType === 'Money In' ? 'Cash purchase' : 'Refund'),
          amount: t.transactionType === 'Money In' ? t.amount : -(t.amount || 0),
          weightKg: 0,
          ratePerKg: 0,
          totalPrice: t.amount || 0,
          source: 'Daily Book',
          sourceId: t._id,
        });
      });

    dailyEntries.sort((a, b) => new Date(b.date) - new Date(a.date));
    const totalPurchased = dailyEntries.reduce((s, e) => s + Math.max(0, e.amount || 0), 0);
    const totalWeight = dailyEntries.reduce((s, e) => s + (e.weightKg || 0), 0);

    return {
      party: { _id: party._id, name: party.name, type: partyType, customerType: 'Daily' },
      isDailyCustomer: true,
      ledgerMode: 'personal',
      entries: dailyEntries,
      summary: { totalPurchased, totalWeight },
    };
  }

  const allEntries = await collectRawEntries(partyType, party);
  const { entries: rangedEntries, broughtForward } = applyDateRange(allEntries, options.startDate, options.endDate);
  const entries = applyRunningBalance(rangedEntries);
  const summary = summarizeEntries(rangedEntries);
  summary.broughtForward = broughtForward;

  return {
    party: { _id: party._id, name: party.name, type: partyType },
    ledgerMode: 'personal',
    entries,
    summary,
  };
}

async function buildDateWiseLedger(partyType, party, options = {}) {
  if (partyType === 'Customer' && party.customerType === 'Daily') {
    const personal = await buildLedger(partyType, party, options);
    const byDate = new Map();
    personal.entries.forEach((e) => {
      const day = format(new Date(e.date), 'yyyy-MM-dd');
      if (!byDate.has(day)) {
        byDate.set(day, { date: day, entries: [], totalWeight: 0, totalPrice: 0, credit: 0, debit: 0 });
      }
      const row = byDate.get(day);
      row.entries.push(e);
      row.totalWeight += e.weightKg || 0;
      row.totalPrice += Math.abs(e.amount || e.totalPrice || 0);
    });
    const days = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
    return { ...personal, ledgerMode: 'datewise', days };
  }

  const allEntries = await collectRawEntries(partyType, party);
  const { entries: rangedEntries, broughtForward } = applyDateRange(allEntries, options.startDate, options.endDate);
  const byDate = new Map();

  rangedEntries.forEach((e) => {
    if (e.entryType === 'broughtforward') return;
    const day = format(new Date(e.date), 'yyyy-MM-dd');
    if (!byDate.has(day)) {
      byDate.set(day, {
        date: day,
        credit: 0,
        debit: 0,
        totalWeight: 0,
        totalPrice: 0,
        entries: [],
      });
    }
    const row = byDate.get(day);
    row.credit += e.credit || 0;
    row.debit += e.debit || 0;
    row.totalPrice += e.totalPrice || 0;
    if (['sale', 'purchase', 'jobwork'].includes(e.entryType)) {
      row.totalWeight += e.weightKg || 0;
    }
    row.entries.push(e);
  });

  let runningBalance = broughtForward;
  let runningWeight = 0;
  const days = Array.from(byDate.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day) => {
      const openingBalance = runningBalance;
      const openingWeight = runningWeight;
      runningBalance += day.credit - day.debit;
      runningWeight += day.entries
        .filter((e) => ['sale', 'purchase', 'jobwork'].includes(e.entryType))
        .reduce((s, e) => s + (e.weightKg || 0), 0);
      return {
        ...day,
        openingBalance,
        openingWeight,
        closingBalance: runningBalance,
        closingWeight: runningWeight,
      };
    });

  const summary = summarizeEntries(rangedEntries);
  summary.broughtForward = broughtForward;

  return {
    party: { _id: party._id, name: party.name, type: partyType },
    ledgerMode: 'datewise',
    days,
    summary,
  };
}

function applyOpeningBalanceToTotals(partyType, openingBalance, openingBalanceType) {
  const amount = Number(openingBalance || 0);
  if (amount <= 0 || openingBalanceType === 'none') return {};

  if (partyType === 'Customer') {
    if (openingBalanceType === 'credit') {
      return { totalAmountPaid: amount };
    }
    return { totalAmountDue: amount, totalAmountPurchased: amount };
  }

  if (openingBalanceType === 'debit') {
    return { totalAmountPaid: amount };
  }
  return { totalAmountDue: amount, totalAmountPurchased: amount };
}

/**
 * Side settlement for one role. Balance uses the same convention as personal ledgers:
 * positive = they owe us, negative = we owe them.
 */
function sideSettlement(label, role, rangedEntries) {
  const summary = summarizeEntries(rangedEntries);
  const balance = summary.balance;
  return {
    role,
    label,
    totalCredit: summary.totalCredit,
    totalDebit: summary.totalDebit,
    balance,
    theyOweUs: Math.max(0, balance),
    weOweThem: Math.max(0, -balance),
    status: balance > 0 ? 'They owe us' : balance < 0 ? 'We owe them' : 'Settled',
  };
}

/**
 * Final net between processing receivable and supplier payable.
 * Does NOT post adjustments — display-only settlement.
 */
function buildSettlement(processingSide, supplierSide) {
  const theyOweUs = (processingSide?.theyOweUs || 0) + (supplierSide?.theyOweUs || 0);
  const weOweThem = (processingSide?.weOweThem || 0) + (supplierSide?.weOweThem || 0);
  const netBalance = theyOweUs - weOweThem;
  return {
    processing: processingSide,
    supplier: supplierSide,
    theyOweUsFromProcessing: processingSide?.theyOweUs || 0,
    weOweThemAsSupplier: supplierSide?.weOweThem || 0,
    theyOweUsAsSupplier: supplierSide?.theyOweUs || 0,
    weOweThemFromProcessing: processingSide?.weOweThem || 0,
    theyOweUs,
    weOweThem,
    deducted: Math.min(theyOweUs, weOweThem),
    netBalance,
    netAmount: Math.abs(netBalance),
    status: netBalance > 0 ? 'They owe us' : netBalance < 0 ? 'We owe them' : 'Settled',
  };
}

/**
 * Merge customer + supplier ledgers for a linked person.
 * Tags each entry with role ('processing' | 'supplier') for display.
 * Separate ledgers are left unchanged — this is a read-only combined view.
 */
async function buildCombinedLedger(customer, supplier, options = {}) {
  const [custEntries, suppEntries] = await Promise.all([
    customer ? collectRawEntries('Customer', customer) : Promise.resolve([]),
    supplier ? collectRawEntries('Supplier', supplier) : Promise.resolve([]),
  ]);

  const custRanged = applyDateRange(custEntries, options.startDate, options.endDate);
  const suppRanged = applyDateRange(suppEntries, options.startDate, options.endDate);
  const processingSide = customer
    ? sideSettlement('Processing Work', 'processing', custRanged.entries)
    : null;
  const supplierSide = supplier
    ? sideSettlement('Supplier', 'supplier', suppRanged.entries)
    : null;
  const settlement = buildSettlement(processingSide, supplierSide);

  const tagged = [
    ...custEntries.map((e) => ({ ...e, role: 'processing', roleLabel: 'Processing' })),
    ...suppEntries.map((e) => ({ ...e, role: 'supplier', roleLabel: 'Supplier' })),
  ].sort((a, b) => new Date(a.date) - new Date(b.date));

  const party = {
    _id: customer?._id || supplier?._id,
    name: customer?.name || supplier?.name,
    type: 'Combined',
    customerId: customer?._id || null,
    supplierId: supplier?._id || null,
  };

  if (options.mode === 'datewise') {
    const { entries: rangedEntries, broughtForward } = applyDateRange(tagged, options.startDate, options.endDate);
    const byDate = new Map();
    rangedEntries.forEach((e) => {
      if (e.entryType === 'broughtforward') return;
      const day = format(new Date(e.date), 'yyyy-MM-dd');
      if (!byDate.has(day)) {
        byDate.set(day, { date: day, credit: 0, debit: 0, totalWeight: 0, totalPrice: 0, entries: [] });
      }
      const row = byDate.get(day);
      row.credit += e.credit || 0;
      row.debit += e.debit || 0;
      row.totalPrice += e.totalPrice || 0;
      if (['sale', 'purchase', 'jobwork'].includes(e.entryType)) row.totalWeight += e.weightKg || 0;
      row.entries.push(e);
    });
    let runningBalance = broughtForward;
    const days = Array.from(byDate.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((day) => {
        const openingBalance = runningBalance;
        runningBalance += day.credit - day.debit;
        return { ...day, openingBalance, closingBalance: runningBalance };
      });
    const summary = summarizeEntries(rangedEntries);
    summary.broughtForward = broughtForward;
    summary.settlement = settlement;
    summary.balance = settlement.netBalance;
    return {
      party,
      ledgerMode: 'datewise',
      scope: 'combined',
      linked: true,
      days,
      summary,
      settlement,
    };
  }

  const { entries: rangedEntries, broughtForward } = applyDateRange(tagged, options.startDate, options.endDate);
  const entries = applyRunningBalance(rangedEntries);
  const summary = summarizeEntries(rangedEntries);
  summary.broughtForward = broughtForward;
  summary.settlement = settlement;
  summary.balance = settlement.netBalance;

  return {
    party,
    ledgerMode: 'personal',
    scope: 'combined',
    linked: true,
    entries,
    summary,
    settlement,
  };
}

/**
 * Resolve ledger for a party with optional scope:
 * - own / processing / supplier (single-side)
 * - combined (both sides when linked)
 */
async function buildScopedLedger(primaryType, party, options = {}) {
  const Customer = require('../models/Customer');
  const Supplier = require('../models/Supplier');
  const scope = options.scope || 'own';
  const mode = options.mode || 'personal';

  let customer = primaryType === 'Customer' ? party : null;
  let supplier = primaryType === 'Supplier' ? party : null;

  if (primaryType === 'Customer' && party.linkedSupplierId) {
    supplier = await Supplier.findById(party.linkedSupplierId);
  }
  if (primaryType === 'Supplier' && party.linkedCustomerId) {
    customer = await Customer.findById(party.linkedCustomerId);
  }

  const linked = !!(customer && supplier);
  const buildOne = async (type, p) => {
    if (!p) return null;
    const ledger = mode === 'datewise'
      ? await buildDateWiseLedger(type, p, options)
      : await buildLedger(type, p, options);
    return {
      ...ledger,
      scope: type === 'Customer' ? 'processing' : 'supplier',
      linked,
      party: {
        ...ledger.party,
        customerId: customer?._id || null,
        supplierId: supplier?._id || null,
        linkedSupplierId: customer?.linkedSupplierId || null,
        linkedCustomerId: supplier?.linkedCustomerId || null,
      },
    };
  };

  if (scope === 'combined') {
    if (linked) return buildCombinedLedger(customer, supplier, { ...options, mode });
    // not linked — fall back to own side
  }
  if ((scope === 'supplier' || (scope === 'linked' && primaryType === 'Customer')) && supplier) {
    return buildOne('Supplier', supplier);
  }
  if ((scope === 'processing' || (scope === 'linked' && primaryType === 'Supplier')) && customer) {
    return buildOne('Customer', customer);
  }
  // own (default)
  return buildOne(primaryType, party);
}

module.exports = {
  buildLedger,
  buildDateWiseLedger,
  buildCombinedLedger,
  buildScopedLedger,
  applyOpeningBalanceToTotals,
  collectRawEntries,
  mergeJobWorkDeliveryFragments,
};
