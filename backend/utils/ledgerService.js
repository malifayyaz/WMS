const Transaction = require('../models/Transaction');
const Order = require('../models/Order');
const RawMaterial = require('../models/RawMaterial');
const ConsumptionMaterial = require('../models/ConsumptionMaterial');
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
          paymentMethod: o.paymentMethod || '',
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
        paymentMethod: o.paymentMethod || '',
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
          paymentMethod: o.paymentMethod || '',
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
        paymentMethod: p.paymentMethod || '',
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
          sourceType: d.sourceType || 'Processing',
        });
      });
    });

    jobWorks.forEach((j) => {
      (j.returns || []).forEach((r) => {
        entries.push({
          date: r.returnDate,
          description: `Job work coil returned — ${j.coilCategory} (${r.weightKg} kg)${r.reason ? ` - ${r.reason}` : ''}`,
          credit: 0,
          debit: 0,
          weightKg: r.weightKg || 0,
          ratePerKg: j.coilRatePerKg || 0,
          totalPrice: 0,
          source: 'Job Work — Return',
          sourceId: j._id,
          entryType: 'jobwork-return',
        });
      });
      (j.excessDeliveries || []).forEach((e) => {
        entries.push({
          date: e.deliveryDate,
          description: `Job work excess stock sold — ${e.weightKg} kg × Rs.${e.saleRatePerKg}/kg`,
          credit: e.totalSaleAmount || 0,
          debit: 0,
          weightKg: e.weightKg || 0,
          ratePerKg: e.saleRatePerKg || 0,
          totalPrice: e.totalSaleAmount || 0,
          source: 'Job Work — Excess Sale',
          sourceId: j._id,
          entryType: 'jobwork-excess',
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
        source: d.sourceType === 'Annealing' ? 'Job Work — Annealing' : 'Job Work — Delivery',
        sourceId: d.jobWorkId,
        entryType: 'jobwork',
        deliveryGroupId: d.deliveryGroupId || undefined,
        isFromAnnealing: d.sourceType === 'Annealing',
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
          paymentMethod: p.paymentMethod || '',
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
        paymentMethod: p.paymentMethod || '',
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
          paymentMethod: p.paymentMethod || '',
        });
      }
    });

    // Process Material purchases from this vendor
    const processPurchases = await ConsumptionMaterial.find({ supplierId: party._id }).sort({ purchaseDate: 1 });
    processPurchases.forEach((p) => {
      entries.push({
        date: p.purchaseDate,
        description: `Process material — ${p.materialType} (${p.quantity} ${p.unit || ''})`.trim(),
        credit: 0,
        debit: p.totalCost || 0,
        weightKg: 0,
        ratePerKg: p.costPerUnit || 0,
        totalPrice: p.totalCost || 0,
        source: 'Process Material Purchase',
        sourceId: p._id,
        entryType: 'purchase',
        paymentMethod: '',
      });
      // Each payment entry (initial + subsequent) stored in paymentHistory
      (p.paymentHistory || []).forEach((ph) => {
        if ((ph.amount || 0) <= 0) return;
        entries.push({
          date: ph.paymentDate,
          description: `Payment — ${p.materialType}`,
          credit: ph.amount,
          debit: 0,
          weightKg: 0,
          ratePerKg: 0,
          totalPrice: ph.amount,
          source: 'Process Material Payment',
          sourceId: p._id,
          entryType: 'payment',
          paymentMethod: ph.paymentMethod || '',
        });
      });
    });

  }

  const transactions = await Transaction.find({ relatedTo: partyType, relatedId: party._id }).sort({ transactionDate: 1 });
  transactions.forEach((t) => {
    if (t.orderId || t.sourceType === 'Order') return;
    if (t.sourceType === 'RawMaterial') return;
    // ConsumptionMaterial entries are already added from paymentHistory above; skip to avoid double-count
    if (partyType === 'Supplier' && t.sourceType === 'ConsumptionMaterial') return;
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
        paymentMethod: t.paymentMethod || '',
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
        paymentMethod: t.paymentMethod || '',
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
  const allEntries = await collectRawEntries(partyType, party);
  const { entries: rangedEntries, broughtForward } = applyDateRange(allEntries, options.startDate, options.endDate);
  const entries = applyRunningBalance(rangedEntries);
  const summary = summarizeEntries(rangedEntries);
  summary.broughtForward = broughtForward;

  return {
    party: { _id: party._id, name: party.name, type: partyType, customerType: party.customerType },
    ledgerMode: 'personal',
    entries,
    summary,
  };
}

async function buildDateWiseLedger(partyType, party, options = {}) {
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
      // Credit for a customer means we owe them (Advance)
      return { totalAmountPaid: amount, totalAmountDue: -amount, totalAmountPurchased: 0 };
    }
    // Debit for a customer means they owe us (Receivable)
    return { totalAmountDue: amount, totalAmountPurchased: amount, totalAmountPaid: 0 };
  }

  // Supplier
  if (openingBalanceType === 'debit') {
    // Debit for a supplier means we paid them advance (Receivable)
    return { totalAmountPaid: amount, totalAmountDue: -amount, totalAmountPurchased: 0 };
  }
  // Credit for a supplier means we owe them (Payable)
  return { totalAmountDue: amount, totalAmountPurchased: amount, totalAmountPaid: 0 };
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
/**
 * Merge two Customer ledgers (regular <-> processing) into a single combined view.
 * Tags each entry with role: 'regular' | 'processing'.
 * Part D: Customer<->ProcessingCustomer link.
 */
async function buildCombinedCustomerLedger(regular, processing, options = {}) {
  const [regEntries, procEntries] = await Promise.all([
    regular ? collectRawEntries('Customer', regular) : Promise.resolve([]),
    processing ? collectRawEntries('Customer', processing) : Promise.resolve([]),
  ]);
  const regRanged = applyDateRange(regEntries, options.startDate, options.endDate);
  const procRanged = applyDateRange(procEntries, options.startDate, options.endDate);
  const regularSide = regular ? sideSettlement('Regular Sales', 'regular', regRanged.entries) : null;
  const processingSide = processing ? sideSettlement('Processing Work', 'processing', procRanged.entries) : null;
  const theyOweUs = (regularSide?.theyOweUs || 0) + (processingSide?.theyOweUs || 0);
  const weOweThem = (regularSide?.weOweThem || 0) + (processingSide?.weOweThem || 0);
  const netBalance = theyOweUs - weOweThem;
  const settlement = {
    regular: regularSide, processing: processingSide, theyOweUs, weOweThem,
    deducted: Math.min(theyOweUs, weOweThem), netBalance, netAmount: Math.abs(netBalance),
    status: netBalance > 0 ? 'They owe us' : netBalance < 0 ? 'We owe them' : 'Settled',
  };
  const tagged = [
    ...regEntries.map((e) => ({ ...e, role: 'regular', roleLabel: 'Regular' })),
    ...procEntries.map((e) => ({ ...e, role: 'processing', roleLabel: 'Processing' })),
  ].sort((a, b) => new Date(a.date) - new Date(b.date));
  const party = {
    _id: regular?._id || processing?._id, name: regular?.name || processing?.name,
    type: 'CombinedCustomer', regularCustomerId: regular?._id || null, processingCustomerId: processing?._id || null,
  };
  const { entries: rangedEntries, broughtForward } = applyDateRange(tagged, options.startDate, options.endDate);
  if (options.mode === 'datewise') {
    const byDate = new Map();
    rangedEntries.forEach((e) => {
      if (e.entryType === 'broughtforward') return;
      const day = format(new Date(e.date), 'yyyy-MM-dd');
      if (!byDate.has(day)) byDate.set(day, { date: day, credit: 0, debit: 0, totalWeight: 0, totalPrice: 0, entries: [] });
      const row = byDate.get(day);
      row.credit += e.credit || 0; row.debit += e.debit || 0; row.totalPrice += e.totalPrice || 0;
      if (['sale', 'purchase', 'jobwork'].includes(e.entryType)) row.totalWeight += e.weightKg || 0;
      row.entries.push(e);
    });
    let runningBalance = broughtForward;
    const days = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
      .map((day) => { const ob = runningBalance; runningBalance += day.credit - day.debit; return { ...day, openingBalance: ob, closingBalance: runningBalance }; });
    const summary = summarizeEntries(rangedEntries);
    summary.broughtForward = broughtForward; summary.settlement = settlement; summary.balance = settlement.netBalance;
    return { party, ledgerMode: 'datewise', scope: 'customer-combined', linked: true, days, summary, settlement };
  }
  const entries = applyRunningBalance(rangedEntries);
  const summary = summarizeEntries(rangedEntries);
  summary.broughtForward = broughtForward; summary.settlement = settlement; summary.balance = settlement.netBalance;
  return { party, ledgerMode: 'personal', scope: 'customer-combined', linked: true, entries, summary, settlement };
}

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

  // Resolve Customer<->ProcessingCustomer link (Part D)
  let linkedRegular = null;
  let linkedProcessing = null;
  if (primaryType === 'Customer') {
    if (party.linkedProcessingCustomerId) {
      linkedProcessing = await Customer.findById(party.linkedProcessingCustomerId);
    }
    if (party.linkedRegularCustomerId) {
      linkedRegular = await Customer.findById(party.linkedRegularCustomerId);
    }
  }

  const linked = !!(customer && supplier);
  const buildOne = async (type, p) => {
    if (!p) return null;
    const ledger = mode === 'datewise'
      ? await buildDateWiseLedger(type, p, options)
      : await buildLedger(type, p, options);
    return {
      ...ledger,
      scope: type === 'Customer' ? (p.customerType === 'Processing' ? 'processing' : 'regular') : 'supplier',
      linked,
      party: {
        ...ledger.party,
        customerId: customer?._id || null,
        supplierId: supplier?._id || null,
        linkedSupplierId: customer?.linkedSupplierId || null,
        linkedCustomerId: supplier?.linkedCustomerId || null,
        linkedProcessingCustomerId: party.linkedProcessingCustomerId || null,
        linkedRegularCustomerId: party.linkedRegularCustomerId || null,
      },
    };
  };

  // Customer<->ProcessingCustomer combined view (Part D)
  if (scope === 'customer-combined') {
    const isProcessing = party.customerType === 'Processing';
    const regularParty = isProcessing ? (linkedRegular || null) : party;
    const processingParty = isProcessing ? party : (linkedProcessing || null);
    if (regularParty && processingParty) {
      return buildCombinedCustomerLedger(regularParty, processingParty, { ...options, mode });
    }
    // Not linked -- fall back to own side
  }
  if (scope === 'customer-regular') {
    const isProcessing = party.customerType === 'Processing';
    const regularParty = isProcessing ? (linkedRegular || null) : party;
    if (regularParty) return buildOne('Customer', regularParty);
  }
  if (scope === 'customer-processing') {
    const isProcessing = party.customerType === 'Processing';
    const processingParty = isProcessing ? party : (linkedProcessing || null);
    if (processingParty) return buildOne('Customer', processingParty);
  }

  if (scope === 'combined') {
    if (linked) return buildCombinedLedger(customer, supplier, { ...options, mode });
    // not linked -- fall back to own side
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
  buildCombinedCustomerLedger,
  buildScopedLedger,
  applyOpeningBalanceToTotals,
  collectRawEntries,
  mergeJobWorkDeliveryFragments,
};
