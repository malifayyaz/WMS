const RawMaterial = require('../models/RawMaterial');
const Supplier = require('../models/Supplier');
const { COIL_CATEGORIES, getWiresForCoilCategory } = require('../utils/wireConfig');
const { LOW_STOCK_THRESHOLD_KG } = require('../utils/stockService');
const {
  syncTransactionFromRawMaterial,
  deleteTransactionsForSource,
  recalcSupplierTotals,
} = require('../utils/transactionSyncService');
const {
  fulfillPendingOrdersFromNewStock,
  refreshLowStockAlerts,
  reconcileAllPendingOrders,
  deductStockByCategory,
  restoreStockByCategory,
} = require('../utils/stockService');
const { logActivity } = require('../utils/activityLogService');

const createRawMaterial = async (req, res, next) => {
  try {
    const body = { ...req.body };
    if (!body.coilCategory || ![COIL_CATEGORIES.SHIPLET, COIL_CATEGORIES.PATRI].includes(body.coilCategory)) {
      return res.status(400).json({ success: false, error: 'Invalid coil category', message: 'coilCategory must be Shiplet Coil or Patri Coil' });
    }
    if (!body.materialType) {
      body.materialType = body.coilCategory;
    }
    body.totalAmount = body.weightInKg * body.ratePerKg;
    body.amountDue = (body.totalAmount || 0) - (body.amountPaid || 0);
    body.currentStock = body.weightInKg;
    body.isReturn = false;
    const supplier = await Supplier.findById(body.supplierId);
    if (supplier) body.supplierName = supplier.name;
    const raw = await RawMaterial.create(body);
    if (supplier) {
      await Supplier.findByIdAndUpdate(body.supplierId, {
        $addToSet: { materialTypes: body.materialType },
      });
    }
    await syncTransactionFromRawMaterial(raw, supplier?.name);
    await recalcSupplierTotals(body.supplierId);

    // Automatically fulfil orders that had pending stock for this coil category
    const fulfillResult = await fulfillPendingOrdersFromNewStock(body.coilCategory);
    await refreshLowStockAlerts(body.coilCategory);

    const responseMsg = fulfillResult.fulfilled > 0
      ? `Raw material purchase recorded — ${fulfillResult.fulfilled} pending order(s) fulfilled from new stock`
      : 'Raw material purchase recorded';

    await logActivity({
      req,
      action: 'CREATE',
      module: 'RawMaterial',
      description: `Purchased ${raw.weightInKg}kg ${raw.coilCategory} from ${raw.supplierName || 'supplier'} — Rs.${raw.totalAmount}`,
      documentId: raw._id,
      newValue: raw,
    });

    res.status(201).json({
      success: true,
      data: raw,
      message: responseMsg,
      pendingOrdersFulfilled: fulfillResult,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Return defective / surplus coil to supplier:
 * - Credits supplier ledger (reduces what we owe)
 * - Deducts factory coil stock by category
 */
const createCoilReturn = async (req, res, next) => {
  try {
    const body = { ...req.body };
    const coilCategory = body.coilCategory;
    if (!coilCategory || ![COIL_CATEGORIES.SHIPLET, COIL_CATEGORIES.PATRI].includes(coilCategory)) {
      return res.status(400).json({
        success: false,
        message: 'coilCategory must be Shiplet Coil or Patri Coil',
      });
    }
    const weightInKg = Number(body.weightInKg);
    const ratePerKg = Number(body.ratePerKg);
    if (!weightInKg || weightInKg <= 0) {
      return res.status(400).json({ success: false, message: 'Valid return weight required' });
    }
    if (ratePerKg == null || Number.isNaN(ratePerKg) || ratePerKg < 0) {
      return res.status(400).json({ success: false, message: 'Rate per kg required for return credit' });
    }
    const supplier = await Supplier.findById(body.supplierId);
    if (!supplier) {
      return res.status(404).json({ success: false, message: 'Supplier not found' });
    }

    const totalAmount = weightInKg * ratePerKg;
    const bundles = Number(body.bundles) || 0;

    // Deduct from factory stock first so we don't create a return if stock is empty
    const stockResult = await deductStockByCategory(coilCategory, weightInKg);
    if ((stockResult.deductedKg || 0) < weightInKg - 0.001) {
      // Roll back partial deduct if any
      if (stockResult.deductedKg > 0) {
        await restoreStockByCategory(coilCategory, stockResult.deductedKg);
      }
      return res.status(400).json({
        success: false,
        message: `Not enough ${coilCategory} stock to return — only ${(stockResult.deductedKg || 0).toFixed(2)} kg available`,
      });
    }

    const raw = await RawMaterial.create({
      supplierId: body.supplierId,
      supplierName: supplier.name,
      coilCategory,
      materialType: coilCategory,
      weightInKg,
      ratePerKg,
      totalAmount,
      amountPaid: 0,
      amountDue: 0,
      bundles,
      currentStock: 0,
      isReturn: true,
      purchaseDate: body.purchaseDate ? new Date(body.purchaseDate) : new Date(),
      notes: body.notes || `Coil return to ${supplier.name}`,
      paymentMethod: body.paymentMethod,
      paidBy: body.paidBy,
      paidTo: body.paidTo,
    });

    await recalcSupplierTotals(body.supplierId);
    await refreshLowStockAlerts(coilCategory);

    res.status(201).json({
      success: true,
      data: raw,
      message: `Coil return recorded — ${weightInKg} kg deducted from stock; supplier credit ${totalAmount}`,
      stockInfo: stockResult,
    });
  } catch (error) {
    next(error);
  }
};

const getRawMaterials = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.supplierId) filter.supplierId = req.query.supplierId;
    if (req.query.coilCategory) filter.coilCategory = req.query.coilCategory;
    if (req.query.materialType) filter.materialType = req.query.materialType;
    const limitRaw = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 2000) : 500;
    const [total, list] = await Promise.all([
      RawMaterial.countDocuments(filter),
      RawMaterial.find(filter).populate('supplierId', 'name').sort({ purchaseDate: -1 }).limit(limit).lean(),
    ]);
    res.json({ success: true, data: list, total, truncated: total > list.length });
  } catch (error) {
    next(error);
  }
};

const getStockSummary = async (req, res, next) => {
  try {
    const summary = await RawMaterial.aggregate([
      { $group: { _id: '$coilCategory', totalStock: { $sum: '$currentStock' } } },
    ]);
    const enriched = summary.map((s) => ({
      coilCategory: s._id,
      totalStock: s.totalStock,
      wiresServed: s._id === COIL_CATEGORIES.PATRI ? ['#20 Binding Wire'] : getWiresForCoilCategory(s._id).map((w) => w.name),
      lowStock: s.totalStock < LOW_STOCK_THRESHOLD_KG,
    }));
    res.json({ success: true, data: enriched });
  } catch (error) {
    next(error);
  }
};

const getLowStock = async (req, res, next) => {
  try {
    const byCategory = await RawMaterial.aggregate([
      { $group: { _id: '$coilCategory', totalStock: { $sum: '$currentStock' } } },
    ]);
    const low = byCategory
      .filter((s) => s.totalStock < LOW_STOCK_THRESHOLD_KG)
      .map((s) => ({
        coilCategory: s._id,
        totalStock: s.totalStock,
        wiresServed: s._id === COIL_CATEGORIES.PATRI ? '#20 Binding Wire' : 'Wire #1 to #19',
      }));
    res.json({ success: true, data: low });
  } catch (error) {
    next(error);
  }
};

const updateRawMaterial = async (req, res, next) => {
  try {
    const raw = await RawMaterial.findById(req.params.id);
    if (!raw) return res.status(404).json({ success: false, error: 'Not found', message: 'Purchase record not found' });
    const body = { ...req.body };
    const newWeight = body.weightInKg ?? raw.weightInKg;
    const oldWeight = raw.weightInKg;
    body.totalAmount = newWeight * (body.ratePerKg ?? raw.ratePerKg);
    body.amountDue = body.totalAmount - (body.amountPaid ?? raw.amountPaid);

    // If weight increased, increase currentStock by the same delta
    if (newWeight > oldWeight) {
      const delta = newWeight - oldWeight;
      body.currentStock = (raw.currentStock || 0) + delta;
    }

    const updated = await RawMaterial.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });
    await recalcSupplierTotals(updated.supplierId);
    const supplier = await Supplier.findById(updated.supplierId);
    await syncTransactionFromRawMaterial(updated, supplier?.name);

    // If stock increased, fulfil any pending orders
    if (newWeight > oldWeight) {
      await fulfillPendingOrdersFromNewStock(updated.coilCategory);
      await refreshLowStockAlerts(updated.coilCategory);
    }

    res.json({ success: true, data: updated, message: 'Updated successfully' });
  } catch (error) {
    next(error);
  }
};

const deleteRawMaterial = async (req, res, next) => {
  try {
    const raw = await RawMaterial.findById(req.params.id);
    if (!raw) return res.status(404).json({ success: false, error: 'Not found', message: 'Purchase record not found' });
    // Undoing a coil return puts the weight back into factory stock
    if (raw.isReturn && raw.coilCategory && raw.weightInKg > 0) {
      await restoreStockByCategory(raw.coilCategory, raw.weightInKg);
    }
    await RawMaterial.findByIdAndDelete(req.params.id);
    await deleteTransactionsForSource('RawMaterial', raw._id);
    await recalcSupplierTotals(raw.supplierId);
    if (raw.coilCategory) await refreshLowStockAlerts(raw.coilCategory);
    res.json({ success: true, message: 'Deleted successfully' });
  } catch (error) {
    next(error);
  }
};

/**
 * Manually trigger pending-order fulfillment for both coil categories.
 * Useful for fixing historical data where stock arrived before this feature existed.
 */
const reconcilePendingOrders = async (req, res, next) => {
  try {
    const results = await reconcileAllPendingOrders();
    const totalFulfilled = Object.values(results).reduce((s, r) => s + (r.fulfilled || 0), 0);
    const totalDoneFixed = Object.values(results).reduce((s, r) => s + (r.doneOrdersFixed || 0), 0);

    let message = 'All orders are already up to date';
    const parts = [];
    if (totalFulfilled > 0) parts.push(`${totalFulfilled} pending order(s) fulfilled from stock`);
    if (totalDoneFixed > 0) parts.push(`${totalDoneFixed} completed order(s) had stale alerts cleared`);
    if (parts.length > 0) message = parts.join(', ');

    res.json({
      success: true,
      message,
      data: results,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createRawMaterial,
  createCoilReturn,
  getRawMaterials,
  getStockSummary,
  getLowStock,
  updateRawMaterial,
  deleteRawMaterial,
  reconcilePendingOrders,
};
