const Customer = require('../models/Customer');
const Order = require('../models/Order');
const { buildScopedLedger, applyOpeningBalanceToTotals } = require('../utils/ledgerService');
const { handleCustomerLinkOnSave, unlinkCustomer } = require('../utils/partyLinkService');

function withOpeningBalance(body) {
  const data = { ...body };
  if (data.customerType === 'Daily') {
    data.openingBalance = 0;
    data.openingBalanceType = 'none';
    return data;
  }
  const openingBalance = Number(data.openingBalance || 0);
  const openingBalanceType = data.openingBalanceType || 'none';
  if (openingBalance > 0 && openingBalanceType !== 'none') {
    const totals = applyOpeningBalanceToTotals('Customer', openingBalance, openingBalanceType);
    Object.assign(data, totals);
    if (data.openingBalanceDate) {
      data.openingBalanceDate = new Date(data.openingBalanceDate);
    }
  } else {
    data.openingBalance = 0;
    if (!data.openingBalanceType) data.openingBalanceType = 'none';
  }
  return data;
}

/**
 * Create new customer.
 */
const createCustomer = async (req, res, next) => {
  try {
    const body = withOpeningBalance(req.body);
    // Don't persist link helper flags on the document
    const { alsoSupplier, linkedSupplierId, unlinkSupplier, companyName, ...createBody } = body;
    let customer = await Customer.create(createBody);
    customer = await handleCustomerLinkOnSave(customer, {
      alsoSupplier,
      linkedSupplierId,
      unlinkSupplier,
      companyName,
    });
    res.status(201).json({ success: true, data: customer, message: 'Customer created successfully' });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
    next(error);
  }
};

/**
 * Get all customers with optional search.
 */
const getCustomers = async (req, res, next) => {
  try {
    const { search } = req.query;
    const filter = {};
    if (search) filter.$or = [{ name: new RegExp(search, 'i') }, { contactNumber: new RegExp(search, 'i') }];
    let customers = await Customer.find(filter).sort({ createdAt: -1 });
    const { recalcCustomerTotals } = require('../utils/transactionSyncService');
    await Promise.all(customers.map((c) => recalcCustomerTotals(c._id)));
    customers = await Customer.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, data: customers, total: customers.length });
  } catch (error) {
    next(error);
  }
};

/**
 * Get customer details with full order history.
 */
const getCustomerById = async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ success: false, error: 'Customer not found', message: 'Customer not found' });
    const orders = await Order.find({ customerId: req.params.id }).sort({ orderDate: -1 });
    res.json({ success: true, data: { ...customer.toObject(), orders } });
  } catch (error) {
    next(error);
  }
};

/**
 * Update customer.
 */
const updateCustomer = async (req, res, next) => {
  try {
    const existing = await Customer.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Customer not found', message: 'Customer not found' });

    const body = { ...req.body };
    const oldOpening = Number(existing.openingBalance || 0);
    const newOpening = body.openingBalance !== undefined ? Number(body.openingBalance || 0) : oldOpening;
    const oldType = existing.openingBalanceType || 'debit';
    const newType = body.openingBalanceType || oldType;

    if (body.openingBalance !== undefined && (newOpening !== oldOpening || newType !== oldType)) {
      if (newType === 'none' || newOpening === 0) {
        const reverseOld = oldType !== 'none' && oldOpening > 0
          ? applyOpeningBalanceToTotals('Customer', oldOpening, oldType)
          : {};
        Object.keys(reverseOld).forEach((key) => {
          body[key] = Math.max(0, (existing[key] || 0) - (reverseOld[key] || 0));
        });
        body.openingBalance = 0;
      } else {
        const reverseOld = oldType !== 'none' ? applyOpeningBalanceToTotals('Customer', oldOpening, oldType) : {};
        const applyNew = applyOpeningBalanceToTotals('Customer', newOpening, newType);
        Object.keys({ ...reverseOld, ...applyNew }).forEach((key) => {
          body[key] = Math.max(0, (existing[key] || 0) - (reverseOld[key] || 0) + (applyNew[key] || 0));
        });
        if (body.openingBalanceDate) body.openingBalanceDate = new Date(body.openingBalanceDate);
      }
    }

    if (body.customerType === 'Daily') {
      body.openingBalance = 0;
      body.openingBalanceType = 'none';
      body.totalAmountDue = 0;
    }

    const { alsoSupplier, linkedSupplierId, unlinkSupplier, companyName, ...updateBody } = body;
    let customer = await Customer.findByIdAndUpdate(req.params.id, updateBody, { new: true, runValidators: true });
    customer = await handleCustomerLinkOnSave(customer, {
      alsoSupplier,
      linkedSupplierId,
      unlinkSupplier,
      companyName,
    });
    res.json({ success: true, data: customer, message: 'Customer updated successfully' });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
    next(error);
  }
};

/**
 * Delete customer.
 * Blocked when the customer has related history (orders, payments, processing, annealing).
 */
const deleteCustomer = async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ success: false, error: 'Customer not found', message: 'Customer not found' });

    const JobWork = require('../models/JobWork');
    const Transaction = require('../models/Transaction');
    const AnnealingRecord = require('../models/AnnealingRecord');
    const [orderCount, jobCount, txnCount, annealingCount] = await Promise.all([
      Order.countDocuments({ customerId: customer._id }),
      JobWork.countDocuments({ customerId: customer._id }),
      Transaction.countDocuments({ relatedTo: 'Customer', relatedId: customer._id }),
      AnnealingRecord.countDocuments({ partyType: 'Customer', partyId: customer._id }),
    ]);

    if (orderCount + jobCount + txnCount + annealingCount > 0) {
      return res.status(400).json({
        success: false,
        message:
          `Cannot delete "${customer.name}" — related history exists `
          + `(orders: ${orderCount}, processing: ${jobCount}, payments: ${txnCount}, annealing: ${annealingCount}). `
          + 'Keep the customer and leave the ledger as-is.',
      });
    }

    await unlinkCustomer(customer._id);
    await Customer.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Customer deleted successfully' });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all orders for a customer.
 */
const getCustomerOrders = async (req, res, next) => {
  try {
    const orders = await Order.find({ customerId: req.params.id }).sort({ orderDate: -1 });
    res.json({ success: true, data: orders, total: orders.length });
  } catch (error) {
    next(error);
  }
};

/**
 * Get payment history for a customer.
 */
const getCustomerPaymentHistory = async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.params.id).select('paymentHistory');
    if (!customer) return res.status(404).json({ success: false, error: 'Customer not found', message: 'Customer not found' });
    res.json({ success: true, data: customer.paymentHistory || [] });
  } catch (error) {
    next(error);
  }
};

/**
 * Record a payment from customer. Updates customer totals and adds to paymentHistory.
 */
const addCustomerPayment = async (req, res, next) => {
  try {
    const { amount, paymentMethod, receivedBy, orderId, note } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ success: false, error: 'Amount required', message: 'Please provide a valid amount' });
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ success: false, error: 'Customer not found', message: 'Customer not found' });
    customer.paymentHistory.push({ date: new Date(), amount, paymentMethod, receivedBy, orderId, note });
    customer.totalAmountPaid = (customer.totalAmountPaid || 0) + amount;
    customer.totalAmountDue = (customer.totalAmountDue || 0) - amount;
    if (customer.totalAmountDue < 0) customer.totalAmountDue = 0;
    await customer.save();
    if (orderId) {
      await Order.findByIdAndUpdate(orderId, { $inc: { amountPaid: amount } });
      const order = await Order.findById(orderId);
      if (order) {
        order.amountDue = (order.totalAmount || 0) - (order.amountPaid || 0);
        await order.save();
      }
    }
    res.json({ success: true, data: customer, message: 'Payment recorded successfully' });
  } catch (error) {
    next(error);
  }
};

/**
 * Get customer ledger.
 * Query: mode=personal|datewise, scope=own|processing|supplier|combined
 */
const getCustomerLedger = async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ success: false, error: 'Customer not found', message: 'Customer not found' });
    const options = {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      mode: req.query.mode === 'datewise' ? 'datewise' : 'personal',
      scope: req.query.scope || 'own',
    };
    const ledger = await buildScopedLedger('Customer', customer, options);
    res.json({ success: true, data: ledger });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createCustomer,
  getCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
  getCustomerOrders,
  getCustomerPaymentHistory,
  addCustomerPayment,
  getCustomerLedger,
};
