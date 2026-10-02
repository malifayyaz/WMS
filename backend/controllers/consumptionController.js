const ConsumptionMaterial = require('../models/ConsumptionMaterial');

const ConsumptionUsage = require('../models/ConsumptionUsage');

const Order = require('../models/Order');

const ReadyStock = require('../models/ReadyStock');
const JobWork = require('../models/JobWork');
const Supplier = require('../models/Supplier');
const Transaction = require('../models/Transaction');

const { CONSUMPTION_MATERIAL_TYPES } = require('../utils/wireConfig');
const { deleteTransactionsForSource, recalcSupplierTotals } = require('../utils/transactionSyncService');
const { startOfDay, endOfDay } = require('date-fns');



function computeCosts(body, quantity) {

  const costPerUnit = body.costPerUnit !== undefined && body.costPerUnit !== '' ? Number(body.costPerUnit) : undefined;

  const totalCost = body.totalCost !== undefined && body.totalCost !== '' ? Number(body.totalCost) : undefined;



  if ((costPerUnit === undefined || Number.isNaN(costPerUnit)) && (totalCost === undefined || Number.isNaN(totalCost))) {

    return null;

  }



  const computedCostPerUnit = costPerUnit !== undefined && !Number.isNaN(costPerUnit)

    ? costPerUnit

    : (totalCost / quantity);

  const computedTotalCost = totalCost !== undefined && !Number.isNaN(totalCost)

    ? totalCost

    : computedCostPerUnit * quantity;



  return { costPerUnit: computedCostPerUnit, totalCost: computedTotalCost };

}



async function syncUsageForMaterial(material) {

  const usageData = {

    materialType: material.materialType,

    quantityUsed: material.quantity,

    unit: material.unit,

    costAtUsage: material.totalCost,

    usageDate: material.purchaseDate,

    notes: material.notes,

    materialId: material._id,

  };



  const existing = await ConsumptionUsage.findOne({ materialId: material._id });

  if (existing) {

    await ConsumptionUsage.findByIdAndUpdate(existing._id, usageData);

  } else {

    await ConsumptionUsage.create(usageData);

  }

}

/**
 * Create a Daily Book Money Out transaction for a process material purchase.
 * If a supplierId is present the transaction is linked to that vendor (relatedTo: 'Supplier')
 * so it appears correctly in the supplier ledger and Daily Book.
 * Amount is amountPaid — the "due" portion is tracked through recalcSupplierTotals.
 *
 * Payment method is honoured as-is (Cash / Bank Transfer / Cheque — cheque is NOT
 * coerced to Cash).
 */
async function syncTransactionFromProcessMaterial(material, supplierName) {
  if (!material?._id) return null;

  const amountPaid = Number(material.amountPaid) || 0;

  // Delete any existing transaction for this source so we can upsert cleanly
  await Transaction.deleteMany({ sourceType: 'ConsumptionMaterial', sourceId: material._id });

  if (amountPaid <= 0) return null;

  const payload = {
    transactionType: 'Money Out',
    amount: amountPaid,
    paymentMethod: material.paymentMethod || 'Cash',
    relatedTo: material.supplierId ? 'Supplier' : 'Other',
    relatedId: material.supplierId || undefined,
    relatedName: supplierName || material.supplierName || 'Process Material',
    description: `${material.materialType} — ${material.quantity} ${material.unit || ''}`.trim(),
    sourceType: 'ConsumptionMaterial',
    sourceId: material._id,
    expenseGroup: 'Process Material',
    expenseCategory: material.materialType,
    transactionDate: material.purchaseDate || new Date(),
  };

  return Transaction.create(payload);
}


const createMaterial = async (req, res, next) => {

  try {

    const body = { ...req.body };

    const quantity = Number(body.quantity || 0);



    if (!body.materialType) {

      return res.status(400).json({ success: false, message: 'materialType is required' });

    }

    if (!quantity || quantity <= 0) {

      return res.status(400).json({ success: false, message: 'quantity must be greater than 0' });

    }



    if (!body.unit) {

      body.unit = ['Acid', 'Soap'].includes(body.materialType) ? 'kg' : 'piece';

    }



    const costs = computeCosts(body, quantity);

    if (!costs) {

      return res.status(400).json({ success: false, message: 'Provide either costPerUnit or totalCost' });

    }



    body.costPerUnit = costs.costPerUnit;
    body.totalCost = costs.totalCost;
    body.currentQuantity = quantity;

    const totalAmount = costs.totalCost;
    let amountPaid;
    if (body.amountPaid !== undefined && body.amountPaid !== '') {
      amountPaid = Math.max(0, Number(body.amountPaid) || 0);
    } else {
      amountPaid = totalAmount;
    }

    const amountDue = Math.max(0, totalAmount - amountPaid);
    let paymentStatus;
    if (amountPaid >= totalAmount) {
      paymentStatus = 'Paid';
    } else if (amountPaid > 0) {
      paymentStatus = 'Partial';
    } else {
      paymentStatus = 'Unpaid';
    }

    body.amountPaid = amountPaid;
    body.amountDue = amountDue;
    body.paymentStatus = paymentStatus;
    body.supplierName = body.supplierName || '';
    body.supplierContact = body.supplierContact || '';

    if (amountPaid > 0) {
      body.paymentHistory = [
        {
          amount: amountPaid,
          paymentDate: body.purchaseDate ? new Date(body.purchaseDate) : new Date(),
          paymentMethod: body.paymentMethod || 'Cash',
          paidBy: body.paidBy || '',
          note: body.notes || 'Initial payment',
          createdAt: new Date(),
        },
      ];
    } else {
      body.paymentHistory = [];
    }

    const doc = await ConsumptionMaterial.create(body);

    // Resolve supplier name for transaction / ledger
    let resolvedSupplierName = doc.supplierName || '';
    if (doc.supplierId) {
      const supplier = await Supplier.findById(doc.supplierId).lean();
      if (supplier) resolvedSupplierName = supplier.name;
    }

    // Create Daily Book transaction (Money Out, linked to supplier if present)
    await syncTransactionFromProcessMaterial(doc, resolvedSupplierName);

    // Recalculate supplier running totals from ledger entries (same as coil purchase)
    if (doc.supplierId) {
      await recalcSupplierTotals(doc.supplierId);
    }

    await syncUsageForMaterial(doc);
    res.status(201).json({ success: true, data: doc, message: 'Process material recorded' });
  } catch (error) {
    next(error);
  }
};



const updateMaterial = async (req, res, next) => {

  try {

    const existing = await ConsumptionMaterial.findById(req.params.id);

    if (!existing) {

      return res.status(404).json({ success: false, message: 'Record not found' });

    }



    const body = { ...req.body };

    const quantity = body.quantity !== undefined ? Number(body.quantity) : existing.quantity;

    if (!quantity || quantity <= 0) {

      return res.status(400).json({ success: false, message: 'quantity must be greater than 0' });

    }



    if (!body.unit) body.unit = existing.unit;

    if (!body.materialType) body.materialType = existing.materialType;



    const costs = computeCosts(

      { costPerUnit: body.costPerUnit ?? existing.costPerUnit, totalCost: body.totalCost ?? existing.totalCost },

      quantity

    );

    if (!costs) {

      return res.status(400).json({ success: false, message: 'Provide either costPerUnit or totalCost' });

    }



    const updated = await ConsumptionMaterial.findByIdAndUpdate(

      req.params.id,

      {

        materialType: body.materialType,

        quantity,

        unit: body.unit,

        costPerUnit: costs.costPerUnit,

        totalCost: costs.totalCost,

        currentQuantity: quantity,

        purchaseDate: body.purchaseDate || existing.purchaseDate,

        notes: body.notes !== undefined ? body.notes : existing.notes,

      },

      { new: true, runValidators: true }

    );



    // Re-sync transaction and supplier totals
    const supplierId = updated.supplierId || existing.supplierId;
    let supplierName = updated.supplierName || existing.supplierName || '';
    if (supplierId) {
      const supplier = await Supplier.findById(supplierId).lean();
      if (supplier) supplierName = supplier.name;
    }
    await syncTransactionFromProcessMaterial(updated, supplierName);
    if (supplierId) await recalcSupplierTotals(supplierId);

    await syncUsageForMaterial(updated);

    res.json({ success: true, data: updated, message: 'Process material updated' });

  } catch (error) {

    next(error);

  }

};



const deleteMaterial = async (req, res, next) => {

  try {

    const existing = await ConsumptionMaterial.findById(req.params.id);

    if (!existing) {

      return res.status(404).json({ success: false, message: 'Record not found' });

    }

    const supplierId = existing.supplierId;

    await ConsumptionUsage.deleteMany({ materialId: existing._id });

    await deleteTransactionsForSource('ConsumptionMaterial', existing._id);

    await ConsumptionMaterial.findByIdAndDelete(req.params.id);

    // Recalc supplier totals after deletion
    if (supplierId) await recalcSupplierTotals(supplierId);

    res.json({ success: true, message: 'Process material deleted' });

  } catch (error) {

    next(error);

  }

};



const getMaterials = async (req, res, next) => {

  try {

    const filter = {};

    if (req.query.materialType) filter.materialType = req.query.materialType;
    if (req.query.supplierId) filter.supplierId = req.query.supplierId;

    const list = await ConsumptionMaterial.find(filter).sort({ purchaseDate: -1 });

    res.json({ success: true, data: list, total: list.length });

  } catch (error) {

    next(error);

  }

};



const getMaterialStock = async (req, res, next) => {

  try {

    const summary = await ConsumptionMaterial.aggregate([

      {

        $group: {

          _id: '$materialType',

          totalQuantity: { $sum: { $ifNull: ['$currentQuantity', '$quantity'] } },

          purchasedQuantity: { $sum: '$quantity' },

          totalValue: {

            $sum: {

              $multiply: [

                { $ifNull: ['$currentQuantity', '$quantity'] },

                { $ifNull: ['$costPerUnit', 0] },

              ],

            },

          },

        },

      },

    ]);

    res.json({ success: true, data: summary });

  } catch (error) {

    next(error);

  }

};



const recordUsage = async (req, res, next) => {

  try {

    res.status(400).json({

      success: false,

      message: 'Usage is recorded automatically when you add process material. Use Add Stock in the Process Material tab.',

    });

  } catch (error) {

    next(error);

  }

};



const getUsage = async (req, res, next) => {

  try {

    const filter = {};

    if (req.query.materialType) filter.materialType = req.query.materialType;

    if (req.query.startDate || req.query.endDate) {

      filter.usageDate = {};

      if (req.query.startDate) filter.usageDate.$gte = new Date(req.query.startDate);

      if (req.query.endDate) filter.usageDate.$lte = new Date(req.query.endDate);

    }

    const list = await ConsumptionUsage.find(filter).sort({ usageDate: -1 });

    res.json({ success: true, data: list, total: list.length });

  } catch (error) {

    next(error);

  }

};



/**
 * Purchase intensity vs wire produced in the selected period.
 * This is not true BOM usage; it compares process-material purchases to
 * finished-wire output (sales + direct production + processing deliveries).
 */
const getConsumptionAnalysis = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter = {};
    if (startDate) dateFilter.$gte = startOfDay(new Date(startDate));
    if (endDate) dateFilter.$lte = endOfDay(new Date(endDate));

    const orderDateFilter = Object.keys(dateFilter).length
      ? {
        $or: [
          { deliveryDate: dateFilter },
          { deliveryDate: { $exists: false }, orderDate: dateFilter },
        ],
      }
      : {};
    const readyStockFilter = Object.keys(dateFilter).length ? { productionDate: dateFilter } : {};
    const purchaseFilter = Object.keys(dateFilter).length ? { purchaseDate: dateFilter } : {};

    const [doneOrders, directProduction, jobWorks, purchases] = await Promise.all([
      Order.find({
        orderStatus: 'Done',
        isReturn: { $ne: true },
        ...orderDateFilter,
      }),
      ReadyStock.find({
        source: 'Direct Production',
        ...readyStockFilter,
      }),
      JobWork.find(Object.keys(dateFilter).length ? { 'deliveries.deliveredDate': dateFilter } : {}),
      ConsumptionMaterial.find(purchaseFilter),
    ]);

    const productionByWire = {};
    const addProduction = (wireNumber, weightKg) => {
      const n = Number(wireNumber);
      const kg = Number(weightKg) || 0;
      if (!n || kg <= 0) return;
      productionByWire[n] = (productionByWire[n] || 0) + kg;
    };

    doneOrders.forEach((o) => addProduction(o.wireNumber, o.finalWeightKg ?? o.initialWeightKg));
    directProduction.forEach((p) => addProduction(p.wireNumber, p.weightKg));
    jobWorks.forEach((job) => {
      (job.deliveries || []).forEach((delivery) => {
        const deliveredAt = delivery.deliveredDate ? new Date(delivery.deliveredDate) : null;
        if (Object.keys(dateFilter).length) {
          if (!deliveredAt) return;
          if (dateFilter.$gte && deliveredAt < dateFilter.$gte) return;
          if (dateFilter.$lte && deliveredAt > dateFilter.$lte) return;
        }
        addProduction(delivery.wireNumber, delivery.weightKg);
      });
    });

    const productionMix = Object.entries(productionByWire)
      .map(([wireNumber, producedKg]) => ({ wireNumber: Number(wireNumber), producedKg }))
      .sort((a, b) => a.wireNumber - b.wireNumber);
    const totalProducedKg = productionMix.reduce((sum, row) => sum + row.producedKg, 0);

    const usageByMaterial = {};
    purchases.forEach((p) => {
      if (!usageByMaterial[p.materialType]) {
        usageByMaterial[p.materialType] = { quantityUsed: 0, totalCost: 0, unit: p.unit || 'kg' };
      }
      usageByMaterial[p.materialType].quantityUsed += p.quantity || 0;
      usageByMaterial[p.materialType].totalCost += p.totalCost || 0;
      usageByMaterial[p.materialType].unit = p.unit || usageByMaterial[p.materialType].unit;
    });

    const overallMaterials = CONSUMPTION_MATERIAL_TYPES.map((type) => {
      const usage = usageByMaterial[type] || { quantityUsed: 0, totalCost: 0, unit: ['Acid', 'Soap'].includes(type) ? 'kg' : 'piece' };
      const isWeightUnit = usage.unit === 'kg';
      return {
        materialType: type,
        unit: usage.unit,
        totalQuantityUsed: usage.quantityUsed,
        totalCost: usage.totalCost,
        quantityPerKg: isWeightUnit && totalProducedKg > 0 ? usage.quantityUsed / totalProducedKg : 0,
        quantityPerTon: isWeightUnit && totalProducedKg > 0 ? (usage.quantityUsed / totalProducedKg) * 1000 : 0,
        piecesPerTon: !isWeightUnit && totalProducedKg > 0 ? (usage.quantityUsed / totalProducedKg) * 1000 : 0,
        costPerKg: totalProducedKg > 0 ? usage.totalCost / totalProducedKg : 0,
        costPerTon: totalProducedKg > 0 ? (usage.totalCost / totalProducedKg) * 1000 : 0,
      };
    });

    const totalCost = overallMaterials.reduce((sum, row) => sum + (row.totalCost || 0), 0);

    res.json({
      success: true,
      data: {
        period: { startDate, endDate },
        totalProducedKg,
        totalCost,
        totalCostPerKg: totalProducedKg > 0 ? totalCost / totalProducedKg : 0,
        totalCostPerTon: totalProducedKg > 0 ? (totalCost / totalProducedKg) * 1000 : 0,
        overallMaterials,
        productionMix,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Record a later payment towards an unpaid / partial process material purchase.
 *
 * Fixes:
 *  - Creates a proper Daily Book Money Out transaction (with correct paymentMethod —
 *    Cheque is NOT coerced to Cash any more).
 *  - Links transaction to the vendor (relatedTo: 'Supplier') when supplierId is set.
 *  - Recalculates the supplier's running totals (totalAmountDue/Paid/Purchased).
 */
const addPayment = async (req, res, next) => {
  try {
    const { amount, paymentMethod, paidBy, note, paymentDate } = req.body;
    const paymentAmount = Number(amount);
    if (!paymentAmount || paymentAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid payment amount is required and must be greater than 0' });
    }

    const record = await ConsumptionMaterial.findById(req.params.id);
    if (!record) {
      return res.status(404).json({ success: false, message: 'Process material record not found' });
    }

    const currentDue = Number(record.amountDue ?? (record.totalCost || 0) - (record.amountPaid || 0));
    if (paymentAmount > currentDue + 0.001) {
      return res.status(400).json({
        success: false,
        message: `Payment amount cannot exceed outstanding due of Rs. ${currentDue}`,
      });
    }

    const method = paymentMethod || 'Cash';
    const pDate = paymentDate ? new Date(paymentDate) : new Date();

    record.paymentHistory.push({
      amount: paymentAmount,
      paymentDate: pDate,
      paymentMethod: method,
      paidBy: paidBy || '',
      note: note || '',
      createdAt: new Date(),
    });

    record.amountPaid = (record.amountPaid || 0) + paymentAmount;
    record.amountDue = Math.max(0, currentDue - paymentAmount);

    if (record.amountDue <= 0.001) {
      record.paymentStatus = 'Paid';
    } else if (record.amountPaid > 0) {
      record.paymentStatus = 'Partial';
    } else {
      record.paymentStatus = 'Unpaid';
    }

    await record.save();

    // Create a Daily Book Money Out transaction for this payment
    // (separate from the initial purchase transaction)
    let supplierName = record.supplierName || '';
    if (record.supplierId) {
      const supplier = await Supplier.findById(record.supplierId).lean();
      if (supplier) supplierName = supplier.name;
    }

    await Transaction.create({
      transactionType: 'Money Out',
      amount: paymentAmount,
      paymentMethod: method,          // preserved — Cheque stays Cheque
      relatedTo: record.supplierId ? 'Supplier' : 'Other',
      relatedId: record.supplierId || undefined,
      relatedName: supplierName || 'Process Material',
      description: `Payment for ${record.materialType} — ${record.quantity} ${record.unit || ''}`.trim(),
      sourceType: 'ConsumptionMaterial',
      sourceId: record._id,
      expenseGroup: 'Process Material',
      expenseCategory: record.materialType,
      transactionDate: pDate,
    });

    // Recalc supplier running totals
    if (record.supplierId) {
      await recalcSupplierTotals(record.supplierId);
    }

    res.json({
      success: true,
      data: record,
      message: `Payment of Rs. ${paymentAmount} recorded successfully`,
    });
  } catch (error) {
    next(error);
  }
};

/** Get material ledger filtered by materialType and date range with summary totals. */
const getLedger = async (req, res, next) => {
  try {
    const { materialType, supplierId, startDate, endDate } = req.query;
    const filter = {};
    if (materialType) {
      filter.materialType = ['Stationery', 'Stationary'].includes(materialType)
        ? { $in: ['Stationary', 'Stationery'] }
        : materialType;
    }
    if (supplierId) {
      filter.supplierId = supplierId;
    }
    if (startDate || endDate) {
      filter.purchaseDate = {};
      if (startDate) filter.purchaseDate.$gte = startOfDay(new Date(startDate));
      if (endDate) filter.purchaseDate.$lte = endOfDay(new Date(endDate));
    }

    const records = await ConsumptionMaterial.find(filter).sort({ purchaseDate: -1, createdAt: -1 });

    const totalPurchasedQuantity = records.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);
    const totalPurchasedAmount = records.reduce((sum, r) => sum + (Number(r.totalCost) || 0), 0);
    const totalPaid = records.reduce((sum, r) => sum + (Number(r.amountPaid) || 0), 0);
    const totalDue = records.reduce((sum, r) => sum + (Number(r.amountDue) || 0), 0);

    res.json({
      success: true,
      data: {
        summary: {
          totalPurchasedQuantity,
          totalPurchasedAmount,
          totalPurchased: {
            quantity: totalPurchasedQuantity,
            amount: totalPurchasedAmount,
          },
          totalPaid,
          totalDue,
        },
        records,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createMaterial,
  updateMaterial,
  deleteMaterial,
  getMaterials,
  getMaterialStock,
  recordUsage,
  getUsage,
  getConsumptionAnalysis,
  addPayment,
  getLedger,
};
