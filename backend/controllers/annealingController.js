const mongoose = require('mongoose');
const AnnealingRecord = require('../models/AnnealingRecord');
const Supplier = require('../models/Supplier');
const Customer = require('../models/Customer');
const RawMaterial = require('../models/RawMaterial');
const { COIL_CATEGORIES } = require('../utils/wireConfig');

/* ------------------------------------------------------------------ */
/* One-time migration of legacy batch-based records into send/arrival  */
/* entries pooled per party.                                           */
/* ------------------------------------------------------------------ */
let migrationDone = false;
async function migrateLegacyRecords() {
  if (migrationDone) return;
  migrationDone = true;
  const legacy = await AnnealingRecord.find({ entryType: { $exists: false } });
  for (const doc of legacy) {
    const partyFields = doc.supplierId
      ? { partyType: 'Supplier', partyId: doc.supplierId, partyName: doc.supplierName }
      : { partyType: 'None', partyName: '' };

    const arrivals = [];
    if (Array.isArray(doc.returns) && doc.returns.length) {
      doc.returns.forEach((r) => {
        arrivals.push({
          entryType: 'Arrival',
          ...partyFields,
          materialType: 'Coil',
          coilCategory: doc.coilCategory,
          bundles: r.bundlesReturned || 0,
          weightKg: r.calculatedInitialKg || 0,
          finalWeightKg: r.finalWeightKg || 0,
          weightLossKg: r.weightLossKg || 0,
          date: r.returnedDate || doc.returnedDate || doc.sentDate,
          receivedBy: r.receivedBy || doc.receivedBy || '',
          notes: r.returnNotes || '',
        });
      });
    } else if (doc.status === 'Returned' && (doc.finalWeightKg || doc.returnedWeightKg)) {
      const finalW = doc.finalWeightKg ?? doc.returnedWeightKg ?? 0;
      const initW = doc.initialWeightKg ?? doc.weightKg ?? 0;
      arrivals.push({
        entryType: 'Arrival',
        ...partyFields,
        materialType: 'Coil',
        coilCategory: doc.coilCategory,
        bundles: doc.bundleCount || 0,
        weightKg: initW,
        finalWeightKg: finalW,
        weightLossKg: doc.weightLossKg ?? Math.max(0, initW - finalW),
        date: doc.returnedDate || doc.sentDate,
        receivedBy: doc.receivedBy || '',
        notes: doc.returnNotes || '',
      });
    }

    await AnnealingRecord.updateOne(
      { _id: doc._id },
      {
        $set: {
          entryType: 'Send',
          ...partyFields,
          materialType: 'Coil',
          bundles: doc.bundleCount || 0,
          weightKg: doc.initialWeightKg ?? doc.weightKg ?? 0,
          date: doc.sentDate || doc.createdAt,
          notes: doc.notes || '',
        },
        $unset: { status: '', returns: '', bundlesReturnedTotal: '' },
      }
    );
    if (arrivals.length) await AnnealingRecord.insertMany(arrivals);
  }
}

/* ------------------------------------------------------------------ */
/* Pool helpers                                                        */
/* ------------------------------------------------------------------ */
function poolKey(e) {
  const material = e.materialType || 'Coil';
  const coil = material === 'Wire' ? 'wire' : (e.coilCategory || COIL_CATEGORIES.SHIPLET);
  const wire = material === 'Wire' ? (e.wireNumber || 'any') : '-';
  return `${e.partyType || 'None'}:${e.partyId || 'none'}:${material}:${coil}:${wire}`;
}

async function computePools(filter = {}) {
  // Process chronologically. An arrival may close a pool, but it must never
  // create a negative balance that consumes bundles from a later Send.
  const entries = await AnnealingRecord.find({ entryType: { $exists: true }, ...filter })
    .sort({ date: 1, createdAt: 1 });
  const pools = new Map();
  entries.forEach((e) => {
    const key = poolKey(e);
    if (!pools.has(key)) {
      pools.set(key, {
        key,
        partyType: e.partyType || 'None',
        partyId: e.partyId ? String(e.partyId) : null,
        partyName: e.partyName || (e.partyType === 'None' || !e.partyType ? 'Own stock (no party)' : ''),
        materialType: e.materialType || 'Coil',
        coilCategory: e.materialType === 'Wire' ? '' : (e.coilCategory || COIL_CATEGORIES.SHIPLET),
        wireNumber: e.materialType === 'Wire' ? (e.wireNumber || null) : null,
        sentBundles: 0,
        sentKg: 0,
        arrivedBundles: 0,
        arrivedInitialKg: 0,
        arrivedFinalKg: 0,
        outstandingBundles: 0,
        outstandingKg: 0,
      });
    }
    const p = pools.get(key);
    if (e.entryType === 'Send') {
      p.sentBundles += e.bundles || 0;
      p.sentKg += e.weightKg || 0;
      p.outstandingBundles += e.bundles || 0;
      p.outstandingKg += e.weightKg || 0;
      if (e.partyName) p.partyName = e.partyName;
      if (e.wireNumber) p.wireNumber = e.wireNumber;
    } else {
      // Arrival (back to factory) OR Sold (direct to customer) both leave the pending pool
      p.arrivedBundles += e.bundles || 0;
      p.arrivedInitialKg += e.weightKg || 0;
      if (e.entryType === 'Arrival') {
        p.arrivedFinalKg += e.finalWeightKg || 0;
      }
      p.outstandingBundles = Math.max(0, p.outstandingBundles - (e.bundles || 0));
      p.outstandingKg = Math.max(0, p.outstandingKg - (e.weightKg || 0));
    }
  });

  return Array.from(pools.values()).map((p) => {
    const remainingBundles = p.outstandingBundles;
    const remainingKg = p.outstandingKg;
    const avgKgPerBundle = remainingBundles > 0 && remainingKg > 0
      ? remainingKg / remainingBundles
      : p.sentBundles > 0 && p.sentKg > 0
        ? p.sentKg / p.sentBundles
        : 0;
    const { outstandingBundles, outstandingKg, ...summary } = p;
    return { ...summary, remainingBundles, remainingKg, avgKgPerBundle };
  });
}

/** Soft Patri link: annealed Patri for own factory stock feeds RawMaterial */
async function feedPatriFactoryStock(arrivalDoc) {
  if (arrivalDoc.materialType !== 'Coil') return null;
  if (arrivalDoc.coilCategory !== COIL_CATEGORIES.PATRI) return null;
  if (arrivalDoc.partyType && arrivalDoc.partyType !== 'None') return null;
  const weight = Number(arrivalDoc.finalWeightKg) || 0;
  if (weight <= 0) return null;

  // Factory stock without a real supplier — use a sentinel ObjectId-less skip;
  // RawMaterial requires supplierId, so find-or-create a system "Annealing" supplier.
  let systemSupplier = await Supplier.findOne({ name: 'Annealing — Factory Patri' });
  if (!systemSupplier) {
    systemSupplier = await Supplier.create({
      name: 'Annealing — Factory Patri',
      companyName: 'Internal',
      openingBalanceType: 'none',
    });
  }

  return RawMaterial.create({
    supplierId: systemSupplier._id,
    supplierName: systemSupplier.name,
    coilCategory: COIL_CATEGORIES.PATRI,
    materialType: COIL_CATEGORIES.PATRI,
    weightInKg: weight,
    ratePerKg: 0,
    totalAmount: 0,
    amountPaid: 0,
    amountDue: 0,
    currentStock: weight,
    bundles: arrivalDoc.bundles || 0,
    purchaseDate: arrivalDoc.date || new Date(),
    notes: `From annealing arrival ${arrivalDoc._id}${arrivalDoc.notes ? ` — ${arrivalDoc.notes}` : ''}`,
  });
}

async function resolveParty(partyType, partyId) {
  if (!partyId || partyType === 'None') return { partyType: 'None', partyId: undefined, partyName: '' };
  if (partyType === 'Supplier') {
    const s = await Supplier.findById(partyId);
    if (!s) throw Object.assign(new Error('Supplier not found'), { statusCode: 404 });
    return { partyType, partyId, partyName: s.name };
  }
  const c = await Customer.findById(partyId);
  if (!c) throw Object.assign(new Error('Customer not found'), { statusCode: 404 });
  return { partyType, partyId, partyName: c.name };
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

/* ------------------------------------------------------------------ */
/* Endpoints                                                           */
/* ------------------------------------------------------------------ */

/** Send stock (coil or wire) for annealing. Party optional. */
const createSend = async (req, res, next) => {
  try {
    await migrateLegacyRecords();
    const body = req.body;
    const party = await resolveParty(body.partyType || 'None', body.partyId);
    const bundles = Number(body.bundles) || 0;
    let weightKg = Number(body.weightKg) || 0;
    if (!bundles && !weightKg) {
      return res.status(400).json({ success: false, message: 'Enter bundles or weight (at least one)' });
    }

    const materialType = body.materialType || 'Coil';
    const wireNumber = materialType === 'Wire' && body.wireNumber != null
      ? Number(body.wireNumber)
      : undefined;
    if (materialType === 'Wire' && !wireNumber) {
      return res.status(400).json({ success: false, message: 'Wire number required when sending wire for annealing' });
    }

    let weightEstimated = false;
    if (!weightKg && bundles > 0) {
      const poolFilter = {
        partyType: party.partyType,
        ...(party.partyId ? { partyId: party.partyId } : { partyId: null }),
        materialType,
      };
      if (materialType === 'Coil') poolFilter.coilCategory = body.coilCategory || COIL_CATEGORIES.SHIPLET;
      if (wireNumber) poolFilter.wireNumber = wireNumber;
      const pools = await computePools(poolFilter);
      const avg = pools[0]?.avgKgPerBundle || 0;
      if (avg > 0) {
        weightKg = round3(bundles * avg);
        weightEstimated = true;
      }
    }

    const doc = await AnnealingRecord.create({
      entryType: 'Send',
      ...party,
      materialType,
      coilCategory: materialType === 'Wire' ? '' : body.coilCategory || COIL_CATEGORIES.SHIPLET,
      wireNumber,
      bundles,
      weightKg,
      weightEstimated,
      date: body.date ? new Date(body.date) : new Date(),
      sentBy: body.sentBy || '',
      notes: body.notes || '',
    });
    res.status(201).json({ success: true, data: doc, message: 'Sent for annealing' });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
    next(error);
  }
};

/**
 * Record arrival from annealing against the party pool (not a specific batch).
 * Initial weight is auto-calculated from the pool's per-bundle average when
 * bundles are given; otherwise it can be entered directly.
 */
const createArrival = async (req, res, next) => {
  try {
    await migrateLegacyRecords();
    const body = req.body;
    const autoAllocateAcrossParties = body.autoAllocateAcrossParties === true;
    const party = autoAllocateAcrossParties
      ? { partyType: 'None', partyId: undefined, partyName: '' }
      : await resolveParty(body.partyType || 'None', body.partyId);
    const bundles = Number(body.bundles) || 0;
    const finalWeightKg = Number(body.finalWeightKg) || 0;
    if (!finalWeightKg) {
      return res.status(400).json({ success: false, message: 'Valid final (received) weight required' });
    }

    const materialType = body.materialType || 'Coil';
    const coilCategory = materialType === 'Wire' ? '' : (body.coilCategory || COIL_CATEGORIES.SHIPLET);
    const wireNumber = materialType === 'Wire' && body.wireNumber != null
      ? Number(body.wireNumber)
      : undefined;

    const poolFilter = { materialType };
    if (!autoAllocateAcrossParties) {
      poolFilter.partyType = party.partyType;
      Object.assign(poolFilter, party.partyId ? { partyId: party.partyId } : { partyId: null });
    }
    if (materialType === 'Coil') poolFilter.coilCategory = coilCategory;
    if (wireNumber) poolFilter.wireNumber = wireNumber;

    const pools = await computePools(poolFilter);
    const pendingPools = pools.filter((p) => p.remainingKg > 0.001 || p.remainingBundles > 0);
    const pool = pendingPools[0];

    let initialKg = Number(body.initialWeightKg) || 0;
    if (autoAllocateAcrossParties) {
      const totalPendingBundles = pendingPools.reduce((sum, p) => sum + (p.remainingBundles || 0), 0);
      const totalPendingKg = pendingPools.reduce((sum, p) => sum + (p.remainingKg || 0), 0);
      const globalAvgKgPerBundle = totalPendingBundles > 0
        ? totalPendingKg / totalPendingBundles
        : 0;

      if (!pendingPools.length) {
        return res.status(400).json({
          success: false,
          message: `No pending ${materialType === 'Coil' ? coilCategory : `Wire #${wireNumber}`} found at annealing`,
        });
      }
      if (bundles > 0 && bundles > totalPendingBundles + 0.001) {
        return res.status(400).json({
          success: false,
          message: `Only ${totalPendingBundles} matching bundle(s) are pending across all parties`,
        });
      }
      if (!initialKg && bundles > 0 && globalAvgKgPerBundle > 0) {
        initialKg = round3(bundles * globalAvgKgPerBundle);
      }
      if (!initialKg && !bundles && totalPendingKg > 0) {
        initialKg = round3(totalPendingKg);
      }
      if (!initialKg) {
        return res.status(400).json({
          success: false,
          message: 'Could not estimate initial weight from the matching pending pools',
        });
      }

      let remainingBundles = bundles;
      let remainingInitialKg = initialKg;
      const allocations = [];

      for (const pendingPool of pendingPools) {
        if (bundles > 0 && remainingBundles <= 0.001) break;
        if (!bundles && remainingInitialKg <= 0.001) break;

        const allocatedBundles = bundles > 0
          ? Math.min(remainingBundles, pendingPool.remainingBundles || 0)
          : 0;
        if (bundles > 0 && allocatedBundles <= 0) continue;

        let allocatedInitialKg;
        if (bundles > 0) {
          const poolAvg = pendingPool.avgKgPerBundle || globalAvgKgPerBundle;
          allocatedInitialKg = allocatedBundles * poolAvg;
        } else {
          allocatedInitialKg = Math.min(remainingInitialKg, pendingPool.remainingKg || 0);
        }
        if (allocatedInitialKg <= 0) continue;

        allocations.push({
          pool: pendingPool,
          bundles: allocatedBundles,
          expectedInitialKg: allocatedInitialKg,
        });
        remainingBundles -= allocatedBundles;
        remainingInitialKg -= allocatedInitialKg;
      }

      if (!allocations.length || (bundles > 0 && remainingBundles > 0.001)) {
        return res.status(400).json({
          success: false,
          message: 'Matching pending pools do not contain enough bundle information for automatic allocation',
        });
      }

      const expectedTotal = allocations.reduce((sum, a) => sum + a.expectedInitialKg, 0);
      const allocationId = new mongoose.Types.ObjectId();
      let allocatedInitialTotal = 0;
      let allocatedFinalTotal = 0;
      const docsToCreate = allocations.map((allocation, index) => {
        const isLast = index === allocations.length - 1;
        const allocatedInitial = isLast
          ? round3(initialKg - allocatedInitialTotal)
          : round3(initialKg * (allocation.expectedInitialKg / expectedTotal));
        const allocatedFinal = isLast
          ? round3(finalWeightKg - allocatedFinalTotal)
          : round3(finalWeightKg * (allocatedInitial / initialKg));
        allocatedInitialTotal += allocatedInitial;
        allocatedFinalTotal += allocatedFinal;

        return {
          entryType: 'Arrival',
          partyType: allocation.pool.partyType || 'None',
          partyId: allocation.pool.partyId || undefined,
          partyName: allocation.pool.partyName || '',
          materialType,
          coilCategory,
          wireNumber,
          bundles: allocation.bundles,
          weightKg: allocatedInitial,
          weightEstimated: !Number(body.initialWeightKg),
          finalWeightKg: allocatedFinal,
          weightLossKg: round3(allocatedInitial - allocatedFinal),
          date: body.date ? new Date(body.date) : new Date(),
          receivedBy: body.receivedBy || '',
          notes: `${body.notes || ''}${body.notes ? ' — ' : ''}Auto-allocated mixed/unknown party arrival`,
          autoAllocated: true,
          autoAllocationId: allocationId,
        };
      });

      const docs = await AnnealingRecord.insertMany(docsToCreate);
      const stockRows = [];
      for (const doc of docs) {
        try {
          const fedStock = await feedPatriFactoryStock(doc);
          if (fedStock) stockRows.push(fedStock);
        } catch {
          // The arrival remains valid even if the optional Patri stock link fails.
        }
      }

      return res.status(201).json({
        success: true,
        data: docs,
        allocation: {
          pools: docs.length,
          bundles,
          initialWeightKg: initialKg,
          finalWeightKg,
        },
        patriStockFed: stockRows.map((row) => ({ id: row._id, weightKg: row.weightInKg })),
        message: `Mixed arrival recorded and allocated across ${docs.length} pending pool(s)`,
      });
    }

    if (!initialKg && bundles > 0 && pool?.avgKgPerBundle > 0) {
      initialKg = round3(bundles * pool.avgKgPerBundle);
    }
    if (!initialKg && !bundles && pool?.remainingKg > 0) {
      initialKg = round3(pool.remainingKg);
    }
    if (!initialKg) {
      return res.status(400).json({
        success: false,
        message: 'Could not determine initial weight — enter bundles (with weight sent earlier) or initial weight directly',
      });
    }
    if (pool && bundles > 0 && pool.remainingBundles > 0 && bundles > pool.remainingBundles) {
      return res.status(400).json({
        success: false,
        message: `Only ${pool.remainingBundles} bundle(s) pending for ${pool.partyName || 'this pool'}`,
      });
    }

    const doc = await AnnealingRecord.create({
      entryType: 'Arrival',
      ...party,
      materialType,
      coilCategory,
      wireNumber,
      bundles,
      weightKg: initialKg,
      weightEstimated: !Number(body.initialWeightKg),
      finalWeightKg,
      weightLossKg: round3(initialKg - finalWeightKg),
      date: body.date ? new Date(body.date) : new Date(),
      receivedBy: body.receivedBy || '',
      notes: body.notes || '',
    });

    let fedStock = null;
    try {
      fedStock = await feedPatriFactoryStock(doc);
    } catch {
      fedStock = null;
    }

    res.status(201).json({
      success: true,
      data: doc,
      patriStockFed: fedStock ? { id: fedStock._id, weightKg: fedStock.weightInKg } : null,
      message: fedStock
        ? 'Arrival recorded — Patri coil added to factory stock'
        : 'Arrival from annealing recorded',
    });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
    next(error);
  }
};

const getAnnealingRecords = async (req, res, next) => {
  try {
    await migrateLegacyRecords();
    const filter = { entryType: { $exists: true } };
    if (req.query.partyId) filter.partyId = req.query.partyId;
    if (req.query.supplierId) filter.partyId = req.query.supplierId;
    if (req.query.materialType) filter.materialType = req.query.materialType;
    if (req.query.entryType) filter.entryType = req.query.entryType;
    if (req.query.wireNumber) filter.wireNumber = Number(req.query.wireNumber);
    if (req.query.coilCategory) filter.coilCategory = req.query.coilCategory;
    if (req.query.startDate || req.query.endDate) {
      filter.date = {};
      if (req.query.startDate) filter.date.$gte = new Date(req.query.startDate);
      if (req.query.endDate) {
        const end = new Date(req.query.endDate);
        end.setHours(23, 59, 59, 999);
        filter.date.$lte = end;
      }
    }
    const list = await AnnealingRecord.find(filter).sort({ date: -1 });
    res.json({ success: true, data: list, total: list.length });
  } catch (error) {
    next(error);
  }
};

/** Pool summary: remaining bundles/weight per party + material type. */
async function backfillSoldFromLinkedOrders() {
  const Order = require('../models/Order');
  const sends = await AnnealingRecord.find({
    entryType: 'Send',
    linkedOrderId: { $exists: true, $ne: null },
  });
  for (const send of sends) {
    const already = await AnnealingRecord.findOne({
      entryType: 'Sold',
      linkedOrderId: send.linkedOrderId,
      sourceSendId: send._id,
    });
    if (already) continue;
    const order = await Order.findById(send.linkedOrderId);
    if (!order) continue;
    const bundles = Number(order.bundles) || Number(send.bundles) || 0;
    const weightKg = Number(order.finalWeightKg ?? order.initialWeightKg) || Number(send.weightKg) || 0;
    if (!bundles && !weightKg) continue;
    await AnnealingRecord.create({
      entryType: 'Sold',
      partyType: send.partyType || 'None',
      partyId: send.partyId,
      partyName: send.partyName || '',
      materialType: send.materialType || 'Wire',
      coilCategory: send.materialType === 'Wire' ? '' : (send.coilCategory || ''),
      wireNumber: send.wireNumber || order.wireNumber,
      bundles,
      weightKg,
      date: order.orderDate || send.date || new Date(),
      linkedOrderId: order._id,
      sourceSendId: send._id,
      notes: `Backfill sold — ${order.customerName || ''} ${order.wireType || ''}`.trim(),
    });
  }
}

const getAnnealingSummary = async (req, res, next) => {
  try {
    await migrateLegacyRecords();
    await backfillSoldFromLinkedOrders();
    const filter = {};
    if (req.query.partyId) filter.partyId = req.query.partyId;
    if (req.query.supplierId) filter.partyId = req.query.supplierId;
    const pools = await computePools(filter);
    res.json({ success: true, data: pools });
  } catch (error) {
    next(error);
  }
};

const updateAnnealing = async (req, res, next) => {
  try {
    const existing = await AnnealingRecord.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Record not found' });

    const body = { ...req.body };
    if (body.partyType !== undefined || body.partyId !== undefined) {
      const party = await resolveParty(body.partyType || existing.partyType, body.partyId ?? existing.partyId);
      Object.assign(body, party);
    }
    if (body.bundles !== undefined) body.bundles = Number(body.bundles) || 0;
    if (body.weightKg !== undefined) {
      body.weightKg = Number(body.weightKg) || 0;
      body.weightEstimated = false;
    }
    if (body.date) body.date = new Date(body.date);

    if (existing.entryType === 'Arrival') {
      const initial = body.weightKg ?? existing.weightKg;
      const finalW = body.finalWeightKg !== undefined ? Number(body.finalWeightKg) : existing.finalWeightKg;
      body.finalWeightKg = finalW;
      // Negative value means weight increased after annealing
      body.weightLossKg = round3(initial - finalW);
    }

    const doc = await AnnealingRecord.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });
    res.json({ success: true, data: doc, message: 'Annealing entry updated' });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
    next(error);
  }
};

const deleteAnnealing = async (req, res, next) => {
  try {
    const doc = await AnnealingRecord.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Record not found' });
    res.json({ success: true, message: 'Annealing entry deleted' });
  } catch (error) {
    next(error);
  }
};

/**
 * Remaining on a specific Send after Sold entries.
 * Bundles drive remaining; if no bundles left, kg is treated as 0
 * (annealing gain/loss should not leave orphan kg on a closed batch).
 */
async function remainingOnSend(send) {
  const priorSold = await AnnealingRecord.find({ entryType: 'Sold', sourceSendId: send._id });
  const usedBundles = priorSold.reduce((s, r) => s + (r.bundles || 0), 0);
  const usedKg = priorSold.reduce((s, r) => s + (r.weightKg || 0), 0);
  const remBundles = Math.max(0, (send.bundles || 0) - usedBundles);
  let remKg = Math.max(0, (send.weightKg || 0) - usedKg);
  if (remBundles <= 0) remKg = 0;
  return { remBundles, remKg, usedBundles, usedKg };
}

async function createSoldFromSend(send, order, bundles, weightKg) {
  const sold = await AnnealingRecord.create({
    entryType: 'Sold',
    partyType: send.partyType || 'None',
    partyId: send.partyId,
    partyName: send.partyName || '',
    materialType: send.materialType || 'Wire',
    coilCategory: send.materialType === 'Wire' ? '' : (send.coilCategory || ''),
    wireNumber: send.wireNumber || order.wireNumber,
    bundles,
    weightKg,
    date: order.orderDate || new Date(),
    linkedOrderId: order._id,
    sourceSendId: send._id,
    notes: `Sold to ${order.customerName || 'customer'} — ${order.wireType || `Wire #${order.wireNumber}`} (${bundles} b / ${Number(weightKg).toFixed(2)} kg)`,
  });
  await AnnealingRecord.findByIdAndUpdate(send._id, { linkedOrderId: order._id });
  return sold;
}

/**
 * When annealed wire is sold from a Send batch, record a Sold entry so pending
 * bundles/weight drop. Does not mutate the original Send amounts.
 *
 * Weight may gain or lose after annealing — bundles are the hard limit.
 * Sale kg may exceed or fall short of the send's remaining kg.
 */
async function consumeAnnealingForSale(order, annealingRecordId) {
  if (!order || !annealingRecordId) return null;
  const send = await AnnealingRecord.findById(annealingRecordId);
  if (!send || send.entryType !== 'Send') {
    throw Object.assign(new Error('Selected annealing send batch not found'), { statusCode: 400 });
  }

  let bundles = Number(order.bundles) || 0;
  const saleKg = Number(order.finalWeightKg ?? order.initialWeightKg) || 0;
  if (!bundles && !saleKg) {
    throw Object.assign(new Error('Bundles or weight required to consume from annealing batch'), { statusCode: 400 });
  }

  const { remBundles, remKg } = await remainingOnSend(send);

  if (bundles > remBundles + 0.001) {
    throw Object.assign(
      new Error(`Only ${remBundles} bundle(s) left on this annealing batch`),
      { statusCode: 400 }
    );
  }

  if (remBundles <= 0 && remKg <= 0.001) {
    throw Object.assign(new Error('This annealing batch is already fully sold'), { statusCode: 400 });
  }

  let soldBundles = bundles;
  let soldWeight = saleKg;

  if (soldBundles > 0 && soldBundles >= remBundles - 0.001) {
    // Selling all remaining bundles — close the batch.
    // Gain: record actual sale kg (pool clamps to 0). Loss: clear remKg so no orphan left.
    soldBundles = remBundles;
    if (saleKg < remKg) soldWeight = remKg;
  } else if (soldBundles <= 0) {
    // Weight-only: allow gain/loss; if taking more than remKg, just clear remaining
    if (saleKg > remKg && remKg > 0) {
      soldWeight = Math.max(saleKg, remKg);
    }
  }

  return createSoldFromSend(send, order, soldBundles, soldWeight);
}

/**
 * Auto FIFO: when annealed sale has no batch selected, consume from any
 * matching Wire Send batches (oldest first) until bundles/kg are covered.
 * Weight gain/loss allowed — bundles preferred when provided.
 */
async function consumeAnnealingForSaleAuto(order) {
  if (!order) return [];
  let needBundles = Number(order.bundles) || 0;
  let needKg = Number(order.finalWeightKg ?? order.initialWeightKg) || 0;
  if (!needBundles && !needKg) {
    throw Object.assign(new Error('Bundles or weight required for annealed sale'), { statusCode: 400 });
  }

  const filter = { entryType: 'Send', materialType: 'Wire' };
  if (order.wireNumber) filter.wireNumber = order.wireNumber;

  const sends = await AnnealingRecord.find(filter).sort({ date: 1, createdAt: 1 });
  const created = [];
  const saleKgTotal = needKg;
  const saleBundlesTotal = needBundles;

  for (const send of sends) {
    if (needBundles <= 0 && needKg <= 0) break;
    const { remBundles, remKg } = await remainingOnSend(send);
    if (remBundles <= 0 && remKg <= 0.001) continue;

    let takeBundles = 0;
    let takeKg = 0;

    if (needBundles > 0) {
      takeBundles = Math.min(needBundles, remBundles);
      if (takeBundles <= 0) continue;
      if (saleBundlesTotal > 0) {
        takeKg = (saleKgTotal * takeBundles) / saleBundlesTotal;
      } else {
        takeKg = remKg * (takeBundles / (remBundles || 1));
      }
      if (takeBundles >= remBundles - 0.001) {
        takeKg = Math.max(takeKg, remKg);
      }
      needBundles -= takeBundles;
      needKg = Math.max(0, needKg - takeKg);
    } else {
      takeKg = Math.min(needKg, remKg > 0 ? remKg : needKg);
      if (takeKg <= 0.001) continue;
      if (remBundles > 0 && remKg > 0) {
        takeBundles = Math.min(remBundles, Math.ceil((takeKg / remKg) * remBundles - 1e-9));
        if (takeBundles >= remBundles) takeKg = Math.max(takeKg, remKg);
      }
      needKg = Math.max(0, needKg - takeKg);
    }

    created.push(await createSoldFromSend(send, order, takeBundles, takeKg));
  }

  if (needBundles > 0.001) {
    throw Object.assign(
      new Error(`Not enough annealed wire bundles pending — short ${needBundles} bundle(s)`),
      { statusCode: 400 }
    );
  }
  // Do not fail on leftover needKg when bundles were fully allocated (gain case already covered)
  if (saleBundlesTotal <= 0 && needKg > 0.5) {
    throw Object.assign(
      new Error(`Not enough annealed wire pending — short ${needKg.toFixed(2)} kg`),
      { statusCode: 400 }
    );
  }

  if (!created.length) {
    throw Object.assign(
      new Error('No annealing send batches available for this wire — send wire for annealing first, or pick a batch'),
      { statusCode: 400 }
    );
  }
  return created;
}

async function releaseAnnealingForSale(orderId) {
  if (!orderId) return;
  await AnnealingRecord.deleteMany({ entryType: 'Sold', linkedOrderId: orderId });
}

module.exports = {
  createSend,
  createArrival,
  getAnnealingRecords,
  getAnnealingSummary,
  updateAnnealing,
  deleteAnnealing,
  consumeAnnealingForSale,
  consumeAnnealingForSaleAuto,
  releaseAnnealingForSale,
  feedPatriFactoryStock,
  computePools,
};
