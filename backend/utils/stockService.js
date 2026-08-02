const RawMaterial = require('../models/RawMaterial');
const { getCoilCategoryForWire, COIL_CATEGORIES } = require('./wireConfig');
// Lazy-require Order to avoid circular-dependency at module load time
const getOrderModel = () => require('../models/Order');

function categoryMatchFilter(coilCategory) {
  if (coilCategory === COIL_CATEGORIES.SHIPLET) {
    return { $or: [{ coilCategory: COIL_CATEGORIES.SHIPLET }, { coilCategory: { $exists: false } }, { coilCategory: null }] };
  }
  return { coilCategory };
}

const LOW_STOCK_THRESHOLD_KG = 1000;

/**
 * Deduct stock FIFO from a specific coil category. Returns deducted and pending amounts.
 */
async function deductStockByCategory(coilCategory, weightKg) {
  const need = Number(weightKg) || 0;
  if (need <= 0) return { deductedKg: 0, pendingKg: 0, sufficient: true };

  const docs = await RawMaterial.find({
    ...categoryMatchFilter(coilCategory),
    isReturn: { $ne: true },
    currentStock: { $gt: 0 },
  })
    .sort({ purchaseDate: 1 })
    .lean();

  let remaining = need;
  let deductedKg = 0;

  for (const doc of docs) {
    if (remaining <= 0) break;
    const deduct = Math.min(doc.currentStock || 0, remaining);
    if (deduct > 0) {
      await RawMaterial.findByIdAndUpdate(doc._id, { $inc: { currentStock: -deduct } });
      deductedKg += deduct;
      remaining -= deduct;
    }
  }

  return {
    deductedKg,
    pendingKg: Math.max(0, remaining),
    sufficient: remaining <= 0,
  };
}

async function restoreStockByCategory(coilCategory, weightKg) {
  const amount = Number(weightKg) || 0;
  if (amount <= 0) return;

  const doc = await RawMaterial.findOne({
    ...categoryMatchFilter(coilCategory),
    isReturn: { $ne: true },
  }).sort({ purchaseDate: -1 });
  if (doc) {
    await RawMaterial.findByIdAndUpdate(doc._id, { $inc: { currentStock: amount } });
  }
}

async function getCategoryStockSummary(coilCategory) {
  const match = categoryMatchFilter(coilCategory);
  const result = await RawMaterial.aggregate([
    { $match: match },
    { $group: { _id: null, totalStock: { $sum: '$currentStock' } } },
  ]);
  return result[0]?.totalStock || 0;
}

async function checkLowStockForWire(wireNumber, requiredKg, coilCategoryOverride) {
  const coilCategory = coilCategoryOverride || getCoilCategoryForWire(wireNumber);
  if (!coilCategory) return { lowStock: false, availableKg: 0, coilCategory: null };

  const availableKg = await getCategoryStockSummary(coilCategory);
  const need = Number(requiredKg) || 0;
  const lowStock = availableKg < need || availableKg < LOW_STOCK_THRESHOLD_KG;

  return { lowStock, availableKg, coilCategory, shortfallKg: Math.max(0, need - availableKg) };
}

/**
 * Build a MongoDB filter that matches orders for a given coil category.
 * For Shiplet Coil we also catch legacy orders that never had coilCategory set,
 * since those were all Shiplet (wire #1–19).
 */
function orderCategoryFilter(coilCategory) {
  if (coilCategory === COIL_CATEGORIES.SHIPLET) {
    return {
      $or: [
        { coilCategory: COIL_CATEGORIES.SHIPLET },
        { coilCategory: { $exists: false } },
        { coilCategory: null },
        { coilCategory: '' },
      ],
    };
  }
  return { coilCategory };
}

/**
 * When new coil stock arrives, fulfil any orders that previously had
 * insufficient stock (stockPendingKg > 0) for this coil category.
 * Orders are processed FIFO (oldest first).
 * Returns a summary of what was fulfilled.
 */
async function fulfillPendingOrdersFromNewStock(coilCategory) {
  const Order = getOrderModel();

  const pendingOrders = await Order.find({
    ...orderCategoryFilter(coilCategory),
    stockPendingKg: { $gt: 0 },
    orderStatus: { $ne: 'Done' },
  }).sort({ orderDate: 1 });

  if (pendingOrders.length === 0) return { fulfilled: 0, orders: [] };

  const summary = [];

  for (const order of pendingOrders) {
    const needKg = order.stockPendingKg;
    if (needKg <= 0) continue;

    // Try to deduct the pending amount from whatever stock is now available
    const result = await deductStockByCategory(coilCategory, needKg);

    order.stockDeductedKg = (order.stockDeductedKg || 0) + result.deductedKg;
    order.stockPendingKg = result.pendingKg; // 0 if fully fulfilled
    // Ensure coilCategory is stamped on the order for future queries
    if (!order.coilCategory) order.coilCategory = coilCategory;
    // Only keep lowStockAlert if there is still pending weight
    if (result.pendingKg <= 0) order.lowStockAlert = false;
    await order.save();

    summary.push({
      orderId: order._id,
      customerName: order.customerName,
      fulfilledKg: result.deductedKg,
      remainingPendingKg: result.pendingKg,
    });
  }

  return { fulfilled: summary.length, orders: summary };
}

/**
 * Clear lowStockAlert on all orders that are fully deducted (stockPendingKg === 0).
 * Once an order's material needs are fully met, the alert is gone —
 * regardless of whether the warehouse is still below the general threshold.
 * Returns how many alerts were cleared.
 */
async function refreshLowStockAlerts(coilCategory) {
  const Order = getOrderModel();

  const result = await Order.updateMany(
    {
      ...orderCategoryFilter(coilCategory),
      stockPendingKg: 0,
      lowStockAlert: true,
      orderStatus: { $ne: 'Done' },
    },
    { $set: { lowStockAlert: false } }
  );
  return result.modifiedCount || 0;
}

/**
 * For Done orders that still have stockPendingKg > 0 (order was completed in
 * real life but the system never tracked the full deduction):
 * - Deduct whatever stock is currently available
 * - Forcibly clear stockPendingKg and lowStockAlert regardless (order is done)
 */
async function clearDoneOrderPendingFlags(coilCategory) {
  const Order = getOrderModel();

  // Use $and to avoid $or key collision with orderCategoryFilter for Shiplet Coil
  const doneOrders = await Order.find({
    $and: [
      orderCategoryFilter(coilCategory),
      { orderStatus: 'Done' },
      { $or: [{ stockPendingKg: { $gt: 0 } }, { lowStockAlert: true }] },
    ],
  });

  let deductedTotal = 0;
  for (const order of doneOrders) {
    if ((order.stockPendingKg || 0) > 0) {
      // Try to deduct from remaining stock (accounts for coil actually consumed)
      const result = await deductStockByCategory(coilCategory, order.stockPendingKg);
      order.stockDeductedKg = (order.stockDeductedKg || 0) + result.deductedKg;
      deductedTotal += result.deductedKg;
    }
    // Order is Done — clear pending flags unconditionally
    order.stockPendingKg = 0;
    order.lowStockAlert = false;
    await order.save();
  }

  return { ordersFixed: doneOrders.length, deductedKg: deductedTotal };
}

/**
 * Run full reconciliation for both coil categories.
 * Runs at server startup AND on demand from the admin endpoint.
 * Safe to call multiple times — only deducts what is actually pending.
 */
async function reconcileAllPendingOrders() {
  const categories = [COIL_CATEGORIES.SHIPLET, COIL_CATEGORIES.PATRI];
  const results = {};
  for (const cat of categories) {
    // 1. Fulfil non-Done orders that have pending stock needs
    results[cat] = await fulfillPendingOrdersFromNewStock(cat);
    // 2. Clear stale alerts on non-Done orders that are already fully deducted
    const cleared = await refreshLowStockAlerts(cat);
    results[cat].alertsCleared = cleared;
    // 3. Fix Done orders that still carry stale pending flags
    const doneFixed = await clearDoneOrderPendingFlags(cat);
    results[cat].doneOrdersFixed = doneFixed.ordersFixed;
    results[cat].doneDeductedKg = doneFixed.deductedKg;
  }
  return results;
}

module.exports = {
  LOW_STOCK_THRESHOLD_KG,
  deductStockByCategory,
  restoreStockByCategory,
  getCategoryStockSummary,
  checkLowStockForWire,
  fulfillPendingOrdersFromNewStock,
  refreshLowStockAlerts,
  reconcileAllPendingOrders,
};
