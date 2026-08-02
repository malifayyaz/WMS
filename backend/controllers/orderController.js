const Order = require('../models/Order');
const Customer = require('../models/Customer');
const ReadyStock = require('../models/ReadyStock');
const { orderTotalAndDue } = require('../utils/calculations');
const { syncTransactionFromOrder, deleteTransactionsForSource, recalcCustomerTotals } = require('../utils/transactionSyncService');
const { getCoilCategoryForWire, getWireLabel } = require('../utils/wireConfig');
const { deductStockByCategory, restoreStockByCategory, checkLowStockForWire, fulfillPendingOrdersFromNewStock, refreshLowStockAlerts } = require('../utils/stockService');
const {
  consumeAnnealingForSale,
  consumeAnnealingForSaleAuto,
  releaseAnnealingForSale,
} = require('./annealingController');

function applyWireFields(body) {
  if (body.wireNumber != null) {
    body.wireNumber = Number(body.wireNumber);
    body.coilCategory = body.coilCategory || getCoilCategoryForWire(body.wireNumber);
    body.wireType = getWireLabel(body.wireNumber);
  } else if (body.wireType && !body.coilCategory) {
    const match = String(body.wireType).match(/#?(\d+)/);
    if (match) {
      body.wireNumber = Number(match[1]);
      body.coilCategory = getCoilCategoryForWire(body.wireNumber);
    }
  }
  return body;
}

/**
 * Create order. Deducts available stock by coil category but never blocks on low stock.
 * Annealed-wire sales linked to an annealing Send deduct from that pending pool instead.
 */
const createOrder = async (req, res, next) => {
  try {
    const body = applyWireFields({ ...req.body });
    const customer = await Customer.findById(body.customerId);
    if (!customer) return res.status(404).json({ success: false, error: 'Customer not found', message: 'Customer not found' });

    const coilCategory = body.coilCategory || getCoilCategoryForWire(body.wireNumber);
    const fromAnnealing = !!body.isAnnealed;
    const annealingBatchId = body.annealingRecordId || null;
    let stockResult = { deductedKg: 0, pendingKg: 0, sufficient: true };
    let stockCheck = { lowStock: false, availableKg: 0, shortfallKg: 0 };

    if (!fromAnnealing && coilCategory && body.initialWeightKg) {
      stockResult = await deductStockByCategory(coilCategory, body.initialWeightKg);
      stockCheck = await checkLowStockForWire(body.wireNumber, body.initialWeightKg, coilCategory);
      stockResult.pendingKg = stockResult.pendingKg ?? 0;
    }

    body.customerName = customer.name;
    body.stockDeductedKg = stockResult.deductedKg;
    body.stockPendingKg = fromAnnealing ? 0 : stockResult.pendingKg;
    body.lowStockAlert = fromAnnealing ? false : (!stockResult.sufficient || stockCheck.lowStock);
    body.isAnnealed = fromAnnealing;
    body.annealingRecordId = fromAnnealing && annealingBatchId ? annealingBatchId : undefined;
    body.bundles = Number(body.bundles) || 0;

    const { totalAmount, amountDue } = orderTotalAndDue(body.initialWeightKg, body.ratePerKg, body.amountPaid || 0);
    body.totalAmount = totalAmount;
    if (customer.customerType === 'Daily') {
      body.amountPaid = totalAmount;
      body.amountDue = 0;
    } else {
      body.amountDue = amountDue;
    }

    const order = await Order.create(body);
    try {
      if (customer.customerType === 'Daily') {
        await syncTransactionFromOrder(order, customer.name);
      }
      if (fromAnnealing) {
        if (annealingBatchId) {
          await consumeAnnealingForSale(order, annealingBatchId);
        } else {
          const soldEntries = await consumeAnnealingForSaleAuto(order);
          // Soft-link first batch used for reference
          if (soldEntries?.[0]?.sourceSendId) {
            await Order.findByIdAndUpdate(order._id, { annealingRecordId: soldEntries[0].sourceSendId });
          }
        }
      }
      await recalcCustomerTotals(body.customerId);
    } catch (err) {
      // Roll back sale if annealing consume fails so pool and order stay consistent
      if (order.coilCategory && order.stockDeductedKg > 0) {
        await restoreStockByCategory(order.coilCategory, order.stockDeductedKg);
      }
      await deleteTransactionsForSource('Order', order._id);
      await releaseAnnealingForSale(order._id);
      await Order.findByIdAndDelete(order._id);
      throw err;
    }

    const warnings = [];
    if (!fromAnnealing && stockResult.pendingKg > 0) {
      warnings.push(`${stockResult.pendingKg} kg pending — fulfil when ${coilCategory} stock is available`);
    }
    if (!fromAnnealing && stockCheck.lowStock) {
      warnings.push(`Low ${coilCategory} stock: ${stockCheck.availableKg} kg available`);
    }

    res.status(201).json({
      success: true,
      data: order,
      warnings,
      stockInfo: { ...stockResult, ...stockCheck, coilCategory, fromAnnealing, autoAnnealing: fromAnnealing && !annealingBatchId },
      message: fromAnnealing
        ? (annealingBatchId
          ? 'Sale recorded — annealing pending pool updated'
          : 'Sale recorded — annealed stock taken FIFO from annealing batches')
        : (warnings.length ? 'Order created with stock alert' : 'Order created successfully'),
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
};

const getOrders = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status) filter.orderStatus = req.query.status;
    if (req.query.customerId) filter.customerId = req.query.customerId;
    if (req.query.wireNumber) filter.wireNumber = Number(req.query.wireNumber);
    if (req.query.startDate || req.query.endDate) {
      filter.orderDate = {};
      if (req.query.startDate) filter.orderDate.$gte = new Date(req.query.startDate);
      if (req.query.endDate) filter.orderDate.$lte = new Date(req.query.endDate);
    }
    const orders = await Order.find(filter).populate('customerId', 'name contactNumber').sort({ orderDate: -1 });
    res.json({ success: true, data: orders, total: orders.length });
  } catch (error) {
    next(error);
  }
};

const getOrderById = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id).populate('customerId', 'name contactNumber address');
    if (!order) return res.status(404).json({ success: false, error: 'Order not found', message: 'Order not found' });
    res.json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

const updateOrder = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, error: 'Order not found', message: 'Order not found' });
    const body = applyWireFields({ ...req.body });
    const weight = body.finalWeightKg ?? order.finalWeightKg ?? order.initialWeightKg;
    const rate = body.ratePerKg ?? order.ratePerKg;
    const paid = body.amountPaid ?? order.amountPaid;
    const { totalAmount, amountDue } = orderTotalAndDue(weight, rate, paid);
    body.totalAmount = totalAmount;
    body.amountDue = amountDue;
    const updated = await Order.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });
    await recalcCustomerTotals(order.customerId);
    res.json({ success: true, data: updated, message: 'Order updated successfully' });
  } catch (error) {
    next(error);
  }
};

const updateOrderStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['Outer', 'In Process', 'Done'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status', message: 'Status must be Outer, In Process, or Done' });
    }
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, error: 'Order not found', message: 'Order not found' });
    if (status === 'In Process' && !order.heatingStartDate) order.heatingStartDate = new Date();
    if (status === 'Done') {
      order.heatingEndDate = order.finalWeightKg ? new Date() : order.heatingEndDate;
      order.deliveryDate = new Date();
      // Order completed — deduct any still-pending stock and clear alerts
      if ((order.stockPendingKg || 0) > 0 && order.coilCategory) {
        const result = await deductStockByCategory(order.coilCategory, order.stockPendingKg);
        order.stockDeductedKg = (order.stockDeductedKg || 0) + result.deductedKg;
      }
      order.stockPendingKg = 0;
      order.lowStockAlert = false;
    }
    order.orderStatus = status;
    await order.save();
    res.json({ success: true, data: order, message: 'Status updated' });
  } catch (error) {
    next(error);
  }
};

const updateFinalWeight = async (req, res, next) => {
  try {
    const { finalWeightKg, weightChangeNote } = req.body;
    if (finalWeightKg == null) return res.status(400).json({ success: false, error: 'finalWeightKg required', message: 'Please provide final weight' });
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, error: 'Order not found', message: 'Order not found' });
    const customer = await Customer.findById(order.customerId);
    order.finalWeightKg = finalWeightKg;
    if (weightChangeNote) order.weightChangeNote = weightChangeNote;
    order.heatingEndDate = new Date();
    const { totalAmount, amountDue } = orderTotalAndDue(finalWeightKg, order.ratePerKg, order.amountPaid || 0);
    order.totalAmount = totalAmount;
    if (customer?.customerType === 'Daily') {
      order.amountPaid = totalAmount;
      order.amountDue = 0;
    } else {
      order.amountDue = amountDue;
    }
    await order.save();
    await recalcCustomerTotals(order.customerId);
    res.json({ success: true, data: order, message: 'Final weight updated' });
  } catch (error) {
    next(error);
  }
};

const deleteOrder = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, error: 'Order not found', message: 'Order not found' });
    if (order.coilCategory && order.stockDeductedKg > 0) {
      await restoreStockByCategory(order.coilCategory, order.stockDeductedKg);
    }
    await Order.findByIdAndDelete(req.params.id);
    await deleteTransactionsForSource('Order', order._id);
    await releaseAnnealingForSale(order._id);
    if (order.customerId) {
      await recalcCustomerTotals(order.customerId);
    }
    res.json({ success: true, message: 'Order deleted successfully' });
  } catch (error) {
    next(error);
  }
};

const getOrdersByStatus = async (req, res, next) => {
  try {
    const orders = await Order.find({ orderStatus: req.params.status }).populate('customerId', 'name').sort({ orderDate: -1 });
    res.json({ success: true, data: orders, total: orders.length });
  } catch (error) {
    next(error);
  }
};

const checkStockForOrder = async (req, res, next) => {
  try {
    const { wireNumber, weightKg } = req.query;
    const { coilCategory: requestedCategory } = req.query;
    const coilCategory = requestedCategory || getCoilCategoryForWire(wireNumber);
    const stockCheck = await checkLowStockForWire(wireNumber, weightKg, coilCategory);
    res.json({
      success: true,
      data: {
        wireNumber: Number(wireNumber),
        wireLabel: getWireLabel(wireNumber),
        coilCategory,
        wiresServed: coilCategory === 'Patri Coil' ? ['#20 Binding Wire'] : 'Wire #1 to #19',
        ...stockCheck,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Defect wire return: reduces customer receivable and restores ReadyStock.
 */
const createWireReturn = async (req, res, next) => {
  try {
    const body = applyWireFields({ ...req.body });
    const customer = await Customer.findById(body.customerId);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }
    const weightKg = Number(body.initialWeightKg || body.weightKg);
    const ratePerKg = Number(body.ratePerKg);
    if (!weightKg || weightKg <= 0) {
      return res.status(400).json({ success: false, message: 'Valid return weight required' });
    }
    if (ratePerKg == null || Number.isNaN(ratePerKg) || ratePerKg < 0) {
      return res.status(400).json({ success: false, message: 'Rate per kg required for return credit' });
    }
    const wireNumber = body.wireNumber != null ? Number(body.wireNumber) : null;
    if (!wireNumber) {
      return res.status(400).json({ success: false, message: 'Wire number required' });
    }

    const { totalAmount } = orderTotalAndDue(weightKg, ratePerKg, 0);
    const bundles = Number(body.bundles) || 0;

    const order = await Order.create({
      customerId: body.customerId,
      customerName: customer.name,
      wireNumber,
      wireType: getWireLabel(wireNumber),
      coilCategory: body.coilCategory || getCoilCategoryForWire(wireNumber),
      initialWeightKg: weightKg,
      finalWeightKg: weightKg,
      ratePerKg,
      totalAmount,
      amountPaid: 0,
      amountDue: 0,
      bundles,
      isReturn: true,
      returnOfOrderId: body.returnOfOrderId || undefined,
      orderStatus: 'Done',
      orderDate: body.orderDate ? new Date(body.orderDate) : new Date(),
      notes: body.notes || 'Defect wire return',
      soldBy: body.soldBy || '',
    });

    await ReadyStock.create({
      wireNumber,
      wireLabel: getWireLabel(wireNumber),
      coilCategory: body.coilCategory || getCoilCategoryForWire(wireNumber),
      weightKg,
      bundles,
      source: 'Customer Return',
      orderId: order._id,
      productionDate: order.orderDate,
      notes: body.notes || `Return from ${customer.name}`,
    });

    await recalcCustomerTotals(body.customerId);

    res.status(201).json({
      success: true,
      data: order,
      message: `Wire return recorded — ${weightKg} kg back to ready stock; customer credit ${totalAmount}`,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createOrder,
  getOrders,
  getOrderById,
  updateOrder,
  updateOrderStatus,
  updateFinalWeight,
  deleteOrder,
  getOrdersByStatus,
  checkStockForOrder,
  createWireReturn,
};
