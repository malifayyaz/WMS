const mongoose = require('mongoose');
const JobWork = require('../models/JobWork');
const Customer = require('../models/Customer');
const RawMaterial = require('../models/RawMaterial');
const { recalcCustomerTotals } = require('../utils/transactionSyncService');

const createJobWork = async (req, res, next) => {
  try {
    const body = req.body;
    const customer = await Customer.findById(body.customerId);
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
    const arrivedWeightKg = Number(body.arrivedWeightKg);
    if (!arrivedWeightKg || arrivedWeightKg <= 0) {
      return res.status(400).json({ success: false, message: 'Valid arrived weight required' });
    }
    const doc = await JobWork.create({
      customerId: body.customerId,
      customerName: customer.name,
      coilCategory: body.coilCategory || 'Shiplet Coil',
      arrivedWeightKg,
      coilRatePerKg: Number(body.coilRatePerKg) || 0,
      // Labour rate is set at delivery time (varies by wire)
      labourRatePerKg: Number(body.labourRatePerKg) || 0,
      arrivalDate: body.arrivalDate ? new Date(body.arrivalDate) : new Date(),
      notes: body.notes || '',
    });
    res.status(201).json({ success: true, data: doc, message: 'Job work coil arrival recorded' });
  } catch (error) {
    next(error);
  }
};

const getJobWorks = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.customerId) filter.customerId = req.query.customerId;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.startDate || req.query.endDate) {
      const clauses = [];
      const range = {};
      if (req.query.startDate) range.$gte = new Date(req.query.startDate);
      if (req.query.endDate) {
        const end = new Date(req.query.endDate);
        end.setHours(23, 59, 59, 999);
        range.$lte = end;
      }
      clauses.push({ arrivalDate: range });
      clauses.push({ 'deliveries.deliveredDate': range });
      filter.$or = clauses;
    }
    const list = await JobWork.find(filter).sort({ arrivalDate: -1 });
    res.json({ success: true, data: list, total: list.length });
  } catch (error) {
    next(error);
  }
};

/** Deliver manufactured wire and charge labour (weight × labour rate at delivery). */
const addDelivery = async (req, res, next) => {
  try {
    const doc = await JobWork.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Job work record not found' });
    const weightKg = Number(req.body.weightKg);
    if (!weightKg || weightKg <= 0) {
      return res.status(400).json({ success: false, message: 'Valid delivered weight required' });
    }
    const labourRatePerKg = Number(req.body.labourRatePerKg) || Number(doc.labourRatePerKg) || 0;
    if (!labourRatePerKg || labourRatePerKg <= 0) {
      return res.status(400).json({ success: false, message: 'Labour rate per kg required at delivery' });
    }
    const remaining = doc.arrivedWeightKg - doc.deliveredWeightKg;
    if (weightKg > remaining) {
      return res.status(400).json({
        success: false,
        message: `Only ${remaining.toFixed(2)} kg remaining in job work stock for this lot`,
      });
    }
    const labourAmount = Math.round(weightKg * labourRatePerKg * 100) / 100;
    const coilRatePerKg = Number(req.body.coilRatePerKg) > 0
      ? Number(req.body.coilRatePerKg)
      : (doc.coilRatePerKg || 0);
    const sellingRatePerKg = Math.round((coilRatePerKg + labourRatePerKg) * 100) / 100;
    const deliveryGroupId = new mongoose.Types.ObjectId();
    doc.deliveries.push({
      weightKg,
      labourRatePerKg,
      labourAmount,
      coilRatePerKg,
      sellingRatePerKg,
      wireNumber: req.body.wireNumber != null ? Number(req.body.wireNumber) : undefined,
      bundles: Number(req.body.bundles) || 0,
      deliveredDate: req.body.deliveredDate ? new Date(req.body.deliveredDate) : new Date(),
      notes: req.body.notes || '',
      deliveryGroupId,
      isGroupPrimary: true,
    });
    await doc.save();
    await recalcCustomerTotals(doc.customerId);

    res.json({ success: true, data: doc, message: `Delivery recorded — labour charge ${labourAmount}` });
  } catch (error) {
    next(error);
  }
};

/** Edit one delivery within a processing lot and recalculate all derived totals.
 *  When the delivery is part of a pool-split group, rate/date/wire/notes sync to every fragment.
 *  Weight edits apply only to this fragment (pool stock math stays on each lot).
 */
const updateDelivery = async (req, res, next) => {
  try {
    const doc = await JobWork.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Job work record not found' });
    const delivery = doc.deliveries.id(req.params.deliveryId);
    if (!delivery) return res.status(404).json({ success: false, message: 'Delivery not found' });

    const weightKg = Number(req.body.weightKg);
    const labourRatePerKg = Number(req.body.labourRatePerKg);
    if (!weightKg || weightKg <= 0) {
      return res.status(400).json({ success: false, message: 'Valid delivered weight required' });
    }
    if (!labourRatePerKg || labourRatePerKg <= 0) {
      return res.status(400).json({ success: false, message: 'Labour rate per kg required' });
    }

    const deliveredByOthers = (doc.deliveredWeightKg || 0) - (delivery.weightKg || 0);
    const maxWeight = Math.max(0, (doc.arrivedWeightKg || 0) - deliveredByOthers);
    if (weightKg > maxWeight + 0.001) {
      return res.status(400).json({
        success: false,
        message: `Only ${maxWeight.toFixed(2)} kg available for this delivery`,
      });
    }

    // Keep the coil rate that was charged when this delivery was made
    const coilRatePerKg = Number(req.body.coilRatePerKg) > 0
      ? Number(req.body.coilRatePerKg)
      : (Number(delivery.coilRatePerKg) || Number(doc.coilRatePerKg) || 0);

    delivery.weightKg = weightKg;
    delivery.labourRatePerKg = labourRatePerKg;
    delivery.labourAmount = Math.round(weightKg * labourRatePerKg * 100) / 100;
    delivery.coilRatePerKg = coilRatePerKg;
    delivery.sellingRatePerKg = Math.round((coilRatePerKg + labourRatePerKg) * 100) / 100;
    delivery.wireNumber = req.body.wireNumber ? Number(req.body.wireNumber) : undefined;
    delivery.bundles = Number(req.body.bundles) || 0;
    if (req.body.deliveredDate) delivery.deliveredDate = new Date(req.body.deliveredDate);
    delivery.notes = req.body.notes || '';

    await doc.save();

    // Sync shared fields across other FIFO fragments of the same delivery group
    if (delivery.deliveryGroupId) {
      const siblings = await JobWork.find({
        customerId: doc.customerId,
        'deliveries.deliveryGroupId': delivery.deliveryGroupId,
        _id: { $ne: doc._id },
      });
      for (const lot of siblings) {
        let changed = false;
        (lot.deliveries || []).forEach((d) => {
          if (String(d.deliveryGroupId) !== String(delivery.deliveryGroupId)) return;
          d.labourRatePerKg = labourRatePerKg;
          d.labourAmount = Math.round((d.weightKg || 0) * labourRatePerKg * 100) / 100;
          d.coilRatePerKg = coilRatePerKg;
          d.sellingRatePerKg = Math.round((coilRatePerKg + labourRatePerKg) * 100) / 100;
          d.wireNumber = delivery.wireNumber;
          if (req.body.deliveredDate) d.deliveredDate = new Date(req.body.deliveredDate);
          if (req.body.notes !== undefined) d.notes = req.body.notes || '';
          changed = true;
        });
        if (changed) await lot.save();
      }
    }

    await recalcCustomerTotals(doc.customerId);
    res.json({ success: true, data: doc, message: 'Processing delivery updated' });
  } catch (error) {
    next(error);
  }
};

/** Delete one delivery and return its weight to the customer's processing pool.
 *  Pool-split groups: deletes every fragment that shares deliveryGroupId.
 */
const deleteDelivery = async (req, res, next) => {
  try {
    const doc = await JobWork.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Job work record not found' });
    const delivery = doc.deliveries.id(req.params.deliveryId);
    if (!delivery) return res.status(404).json({ success: false, message: 'Delivery not found' });

    const groupId = delivery.deliveryGroupId ? String(delivery.deliveryGroupId) : null;
    const customerId = doc.customerId;

    if (groupId) {
      const lots = await JobWork.find({
        customerId,
        'deliveries.deliveryGroupId': delivery.deliveryGroupId,
      });
      for (const lot of lots) {
        lot.deliveries = (lot.deliveries || []).filter(
          (d) => String(d.deliveryGroupId || '') !== groupId
        );
        await lot.save();
      }
    } else {
      delivery.deleteOne();
      await doc.save();
    }

    await recalcCustomerTotals(customerId);
    res.json({
      success: true,
      data: doc,
      message: groupId
        ? 'Processing delivery deleted (all pool shares); weight returned to processing stock'
        : 'Processing delivery deleted; weight returned to processing stock',
    });
  } catch (error) {
    next(error);
  }
};

const updateJobWork = async (req, res, next) => {
  try {
    const doc = await JobWork.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Record not found' });
    const body = req.body;
    if (body.customerId && String(body.customerId) !== String(doc.customerId)) {
      const customer = await Customer.findById(body.customerId);
      if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
      doc.customerId = body.customerId;
      doc.customerName = customer.name;
    }
    if (body.coilCategory !== undefined) doc.coilCategory = body.coilCategory;
    if (body.arrivedWeightKg !== undefined) doc.arrivedWeightKg = Number(body.arrivedWeightKg);
    if (body.coilRatePerKg !== undefined) doc.coilRatePerKg = Number(body.coilRatePerKg) || 0;
    if (body.labourRatePerKg !== undefined) doc.labourRatePerKg = Number(body.labourRatePerKg);
    if (body.arrivalDate) doc.arrivalDate = new Date(body.arrivalDate);
    if (body.notes !== undefined) doc.notes = body.notes;
    if (doc.arrivedWeightKg < doc.deliveredWeightKg) {
      return res.status(400).json({ success: false, message: 'Arrived weight cannot be less than already delivered weight' });
    }
    await doc.save();
    await recalcCustomerTotals(doc.customerId);
    res.json({ success: true, data: doc, message: 'Job work record updated' });
  } catch (error) {
    next(error);
  }
};

const deleteJobWork = async (req, res, next) => {
  try {
    const doc = await JobWork.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Record not found' });
    await recalcCustomerTotals(doc.customerId);
    res.json({ success: true, message: 'Job work record deleted' });
  } catch (error) {
    next(error);
  }
};

/**
 * Coil rate to charge on a delivery: the customer's most recent arrival rate.
 * Lots must be ordered oldest first. Older arrivals are never blended in, so a
 * fresh coil at a new rate immediately governs the next delivery.
 */
const latestArrivalCoilRate = (lots) => {
  let latestWithStock = 0;
  let latestAny = 0;
  lots.forEach((lot) => {
    const rate = Number(lot.coilRatePerKg) || 0;
    if (!rate) return;
    latestAny = rate;
    const remaining = Math.max(0, (lot.arrivedWeightKg || 0) - (lot.deliveredWeightKg || 0));
    if (remaining > 0.001) latestWithStock = rate;
  });
  return latestWithStock || latestAny;
};

/**
 * Pool summary per customer — all time (no date filter).
 * Returns remaining kg in pool for each customer that has any stock.
 */
const getJobWorkPools = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.customerId) filter.customerId = req.query.customerId;
    const all = await JobWork.find(filter).sort({ arrivalDate: 1, createdAt: 1 });
    const map = new Map();
    all.forEach((j) => {
      const key = String(j.customerId);
      if (!map.has(key)) {
        map.set(key, {
          customerId: key,
          customerName: j.customerName,
          totalArrivedKg: 0,
          totalDeliveredKg: 0,
          remainingKg: 0,
          totalLabourCharged: 0,
          lots: 0,
          // Weighted by remaining kg — arrival coil rate put at coil arrival time
          remainingRateWeight: 0,
          nextFifoCoilRatePerKg: 0,
          latestCoilRatePerKg: 0,
          latestArrivalDate: null,
          lotDocs: [],
        });
      }
      const pool = map.get(key);
      const remaining = Math.max(0, (j.arrivedWeightKg || 0) - (j.deliveredWeightKg || 0));
      pool.totalArrivedKg += j.arrivedWeightKg || 0;
      pool.totalDeliveredKg += j.deliveredWeightKg || 0;
      pool.remainingKg = pool.totalArrivedKg - pool.totalDeliveredKg;
      pool.totalLabourCharged += j.labourTotal || 0;
      pool.lots += 1;
      pool.lotDocs.push(j);
      if (remaining > 0) {
        pool.remainingRateWeight += remaining * (j.coilRatePerKg || 0);
        if (!pool.nextFifoCoilRatePerKg) {
          pool.nextFifoCoilRatePerKg = j.coilRatePerKg || 0;
        }
        pool.latestArrivalDate = j.arrivalDate;
      }
    });
    const data = Array.from(map.values()).map((p) => {
      const avgCoilRatePerKg = p.remainingKg > 0
        ? Math.round((p.remainingRateWeight / p.remainingKg) * 100) / 100
        : 0;
      const { remainingRateWeight, lotDocs, ...rest } = p;
      const latestCoilRatePerKg = latestArrivalCoilRate(lotDocs);
      return {
        ...rest,
        avgCoilRatePerKg,
        latestCoilRatePerKg,
        // Delivery pricing uses the latest incoming rate, not a blended average
        coilRatePerKg: latestCoilRatePerKg || avgCoilRatePerKg || 0,
      };
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

/**
 * Pool-based delivery: FIFO across all undelivered lots for a customer.
 * Labour rate is set at delivery time (varies by wire type).
 */
const poolDeliver = async (req, res, next) => {
  try {
    const {
      customerId,
      weightKg: wRaw,
      labourRatePerKg: rateRaw,
      deliveredDate,
      notes,
      wireNumber,
      bundles,
    } = req.body;
    if (!customerId) return res.status(400).json({ success: false, message: 'Customer required' });
    const weightKg = Number(wRaw);
    if (!weightKg || weightKg <= 0) {
      return res.status(400).json({ success: false, message: 'Valid delivery weight required' });
    }
    const labourRatePerKg = Number(rateRaw);
    if (!labourRatePerKg || labourRatePerKg <= 0) {
      return res.status(400).json({ success: false, message: 'Labour rate per kg required at delivery' });
    }
    const lots = await JobWork.find({ customerId, status: { $ne: 'Delivered' } })
      .sort({ arrivalDate: 1, createdAt: 1 });
    const poolRemaining = lots.reduce((s, j) => s + Math.max(0, (j.arrivedWeightKg || 0) - (j.deliveredWeightKg || 0)), 0);
    if (weightKg > poolRemaining + 0.001) {
      return res.status(400).json({
        success: false,
        message: `Only ${poolRemaining.toFixed(2)} kg in pool — cannot deliver ${weightKg} kg`,
      });
    }
    // Weight is still consumed FIFO, but the whole delivery is priced at the
    // customer's latest incoming coil rate (no averaging across old arrivals).
    const deliveryCoilRate = Number(req.body.coilRatePerKg) > 0
      ? Number(req.body.coilRatePerKg)
      : latestArrivalCoilRate(lots);
    const sellingRatePerKg = Math.round((deliveryCoilRate + labourRatePerKg) * 100) / 100;
    const delivDate = deliveredDate ? new Date(deliveredDate) : new Date();
    const wn = wireNumber != null && wireNumber !== '' ? Number(wireNumber) : undefined;
    const bund = Number(bundles) || 0;
    let remaining = weightKg;
    let totalLabour = 0;
    const updatedLots = [];
    let firstLot = true;
    const deliveryGroupId = new mongoose.Types.ObjectId();
    for (const lot of lots) {
      if (remaining <= 0.001) break;
      const lotRemaining = Math.max(0, (lot.arrivedWeightKg || 0) - (lot.deliveredWeightKg || 0));
      if (lotRemaining <= 0) continue;
      const toDeduct = Math.min(lotRemaining, remaining);
      const labourAmount = Math.round(toDeduct * labourRatePerKg * 100) / 100;
      lot.deliveries.push({
        weightKg: toDeduct,
        labourRatePerKg,
        labourAmount,
        coilRatePerKg: deliveryCoilRate,
        sellingRatePerKg,
        wireNumber: wn,
        bundles: firstLot ? bund : 0,
        deliveredDate: delivDate,
        notes: notes || '',
        deliveryGroupId,
        isGroupPrimary: firstLot,
      });
      firstLot = false;
      await lot.save();
      updatedLots.push({
        lotId: lot._id,
        deducted: toDeduct,
        labourAmount,
        labourRatePerKg,
        sellingRatePerKg,
        coilRatePerKg: deliveryCoilRate,
        lotCoilRatePerKg: lot.coilRatePerKg || 0,
        wireNumber: wn,
        bundles: bund,
        deliveryGroupId,
      });
      totalLabour += labourAmount;
      remaining -= toDeduct;
    }
    await recalcCustomerTotals(customerId);
    res.json({
      success: true,
      data: {
        updatedLots,
        totalLabourCharged: totalLabour,
        labourRatePerKg,
        coilRatePerKg: deliveryCoilRate,
        sellingRatePerKg,
        wireNumber: wn,
        bundles: bund,
      },
      message: `${weightKg} kg delivered @ ${labourRatePerKg}/kg — labour charge Rs. ${totalLabour.toFixed(2)}`,
    });
  } catch (error) {
    next(error);
  }
};

/** Stock summary: job work stock + main (own) stock + combined total. */
const getJobWorkStock = async (req, res, next) => {
  try {
    const jobWorks = await JobWork.find();
    const jobWorkStockKg = jobWorks.reduce(
      (s, j) => s + Math.max(0, (j.arrivedWeightKg || 0) - (j.deliveredWeightKg || 0)),
      0
    );
    const mainAgg = await RawMaterial.aggregate([
      { $group: { _id: null, total: { $sum: '$currentStock' } } },
    ]);
    const mainStockKg = mainAgg[0]?.total || 0;
    res.json({
      success: true,
      data: {
        jobWorkStockKg,
        mainStockKg,
        totalStockKg: jobWorkStockKg + mainStockKg,
      },
    });
  } catch (error) {
    next(error);
  }
};

/** Record returned coil from processing customer and add back to factory stock. */
const addReturn = async (req, res, next) => {
  try {
    const jobWorkId = req.params.id;
    const { weightKg, returnDate, coilType, reason, returnedBy, note } = req.body;

    const parsedWeight = Number(weightKg);
    if (!parsedWeight || parsedWeight <= 0) {
      return res.status(400).json({ success: false, message: 'Valid returned weight is required and must be greater than 0' });
    }

    const jobWork = await JobWork.findById(jobWorkId);
    if (!jobWork) {
      return res.status(404).json({ success: false, message: 'Job work record not found' });
    }

    const resolvedCoilType = coilType || jobWork.coilCategory || 'Shiplet Coil';
    const parsedReturnDate = returnDate ? new Date(returnDate) : new Date();

    jobWork.returns.push({
      weightKg: parsedWeight,
      returnDate: parsedReturnDate,
      coilType: resolvedCoilType,
      reason: reason || '',
      returnedBy: returnedBy || '',
      note: note || '',
      createdAt: new Date(),
    });

    await jobWork.save();

    const rawMaterial = await RawMaterial.create({
      supplierId: jobWork.customerId,
      supplierName: jobWork.customerName || 'Processing Customer',
      coilCategory: resolvedCoilType,
      materialType: resolvedCoilType,
      weightInKg: parsedWeight,
      ratePerKg: jobWork.coilRatePerKg || 0,
      totalAmount: Math.round(parsedWeight * (jobWork.coilRatePerKg || 0) * 100) / 100,
      amountPaid: 0,
      amountDue: 0,
      currentStock: parsedWeight,
      isReturn: false,
      purchaseDate: parsedReturnDate,
      notes: 'Returned by processing customer — ' + (jobWork.customerName || 'Processing Customer') + (note ? ' — ' + note : ''),
    });

    res.status(201).json({
      success: true,
      data: { jobWork, rawMaterial },
      message: 'Return recorded and stock updated',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createJobWork,
  getJobWorks,
  addDelivery,
  updateDelivery,
  deleteDelivery,
  poolDeliver,
  getJobWorkPools,
  updateJobWork,
  deleteJobWork,
  getJobWorkStock,
  addReturn,
};
