const ReadyStock = require('../models/ReadyStock');
const { getCoilCategoryForWire, getWireLabel } = require('../utils/wireConfig');

const createProduction = async (req, res, next) => {
  try {
    const body = { ...req.body };
    const wireNumber = Number(body.wireNumber);
    const weightKg = Number(body.weightKg);

    if (!Number.isInteger(wireNumber) || wireNumber < 1 || wireNumber > 20) {
      return res.status(400).json({ success: false, message: 'Wire number must be between 1 and 20' });
    }
    if (!weightKg || weightKg <= 0 || Number.isNaN(weightKg)) {
      return res.status(400).json({ success: false, message: 'Weight must be greater than 0' });
    }

    body.wireNumber = wireNumber;
    body.weightKg = weightKg;
    body.wireLabel = getWireLabel(wireNumber);
    body.coilCategory = body.coilCategory || getCoilCategoryForWire(wireNumber);
    body.bundles = Number(body.bundles) || 0;

    const doc = await ReadyStock.create(body);
    res.status(201).json({ success: true, data: doc, message: 'Production recorded to ready stock' });
  } catch (error) {
    next(error);
  }
};

const getProductions = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.wireNumber) filter.wireNumber = Number(req.query.wireNumber);
    if (req.query.startDate || req.query.endDate) {
      filter.productionDate = {};
      if (req.query.startDate) filter.productionDate.$gte = new Date(req.query.startDate);
      if (req.query.endDate) filter.productionDate.$lte = new Date(req.query.endDate);
    }
    const limitRaw = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 2000) : 500;
    const [total, list] = await Promise.all([
      ReadyStock.countDocuments(filter),
      ReadyStock.find(filter).sort({ productionDate: -1 }).limit(limit).lean(),
    ]);
    res.json({ success: true, data: list, total, truncated: total > list.length });
  } catch (error) {
    next(error);
  }
};

const getSummary = async (req, res, next) => {
  try {
    const summary = await ReadyStock.aggregate([
      { $group: { _id: '$wireNumber', wireLabel: { $last: '$wireLabel' }, coilCategory: { $last: '$coilCategory' }, totalKg: { $sum: '$weightKg' } } },
      { $sort: { _id: 1 } },
    ]);
    res.json({ success: true, data: summary });
  } catch (error) {
    next(error);
  }
};

const deleteProduction = async (req, res, next) => {
  try {
    const doc = await ReadyStock.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Record not found' });
    res.json({ success: true, message: 'Deleted' });
  } catch (error) {
    next(error);
  }
};

module.exports = { createProduction, getProductions, getSummary, deleteProduction };
