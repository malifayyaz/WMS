const ConsumptionMaterial = require('../models/ConsumptionMaterial');

const ConsumptionUsage = require('../models/ConsumptionUsage');

const Order = require('../models/Order');

const ReadyStock = require('../models/ReadyStock');
const JobWork = require('../models/JobWork');

const { CONSUMPTION_MATERIAL_TYPES } = require('../utils/wireConfig');
const { deleteTransactionsForSource } = require('../utils/transactionSyncService');
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

    body.currentQuantity = 0;



    const doc = await ConsumptionMaterial.create(body);

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

        currentQuantity: 0,

        purchaseDate: body.purchaseDate || existing.purchaseDate,

        notes: body.notes !== undefined ? body.notes : existing.notes,

      },

      { new: true, runValidators: true }

    );



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

    await ConsumptionUsage.deleteMany({ materialId: existing._id });

    await deleteTransactionsForSource('ConsumptionMaterial', existing._id);

    await ConsumptionMaterial.findByIdAndDelete(req.params.id);

    res.json({ success: true, message: 'Process material deleted' });

  } catch (error) {

    next(error);

  }

};



const getMaterials = async (req, res, next) => {

  try {

    const filter = {};

    if (req.query.materialType) filter.materialType = req.query.materialType;

    const list = await ConsumptionMaterial.find(filter).sort({ purchaseDate: -1 });

    res.json({ success: true, data: list, total: list.length });

  } catch (error) {

    next(error);

  }

};



const getMaterialStock = async (req, res, next) => {

  try {

    const summary = await ConsumptionMaterial.aggregate([

      { $group: { _id: '$materialType', totalQuantity: { $sum: '$currentQuantity' }, totalValue: { $sum: { $multiply: ['$currentQuantity', '$costPerUnit'] } } } },

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



module.exports = {

  createMaterial,

  updateMaterial,

  deleteMaterial,

  getMaterials,

  getMaterialStock,

  recordUsage,

  getUsage,

  getConsumptionAnalysis,

};

