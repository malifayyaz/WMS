const Customer = require('../models/Customer');
const Supplier = require('../models/Supplier');

/**
 * Bidirectional link between a Processing Customer and a Supplier (same person).
 * Clears previous opposite links first so one customer maps to at most one supplier.
 */
async function linkCustomerAndSupplier(customerId, supplierId) {
  if (!customerId || !supplierId) return null;

  const customer = await Customer.findById(customerId);
  const supplier = await Supplier.findById(supplierId);
  if (!customer || !supplier) {
    const err = new Error('Customer or supplier not found for linking');
    err.statusCode = 404;
    throw err;
  }

  // Clear old reverse links
  if (customer.linkedSupplierId && String(customer.linkedSupplierId) !== String(supplierId)) {
    await Supplier.findByIdAndUpdate(customer.linkedSupplierId, { $unset: { linkedCustomerId: 1 } });
  }
  if (supplier.linkedCustomerId && String(supplier.linkedCustomerId) !== String(customerId)) {
    await Customer.findByIdAndUpdate(supplier.linkedCustomerId, { $unset: { linkedSupplierId: 1 } });
  }

  customer.linkedSupplierId = supplierId;
  supplier.linkedCustomerId = customerId;
  await customer.save();
  await supplier.save();

  return { customer, supplier };
}

async function unlinkCustomer(customerId) {
  const customer = await Customer.findById(customerId);
  if (!customer?.linkedSupplierId) return;
  await Supplier.findByIdAndUpdate(customer.linkedSupplierId, { $unset: { linkedCustomerId: 1 } });
  customer.linkedSupplierId = undefined;
  await customer.save();
}

async function unlinkSupplier(supplierId) {
  const supplier = await Supplier.findById(supplierId);
  if (!supplier?.linkedCustomerId) return;
  await Customer.findByIdAndUpdate(supplier.linkedCustomerId, { $unset: { linkedSupplierId: 1 } });
  supplier.linkedCustomerId = undefined;
  await supplier.save();
}

/**
 * After creating a Processing customer, optionally create or link a Supplier.
 * body.alsoSupplier = true → create new supplier with same details
 * body.linkedSupplierId → link existing supplier
 */
async function handleCustomerLinkOnSave(customer, body) {
  if (body.unlinkSupplier) {
    await unlinkCustomer(customer._id);
    return Customer.findById(customer._id);
  }

  if (body.linkedSupplierId) {
    await linkCustomerAndSupplier(customer._id, body.linkedSupplierId);
    return Customer.findById(customer._id);
  }

  if (body.alsoSupplier && !customer.linkedSupplierId) {
    const supplier = await Supplier.create({
      name: customer.name,
      contactNumber: customer.contactNumber || '',
      address: customer.address || '',
      companyName: body.companyName || '',
      openingBalance: 0,
      openingBalanceType: 'none',
      linkedCustomerId: customer._id,
    });
    customer.linkedSupplierId = supplier._id;
    await customer.save();
  }

  // --- Part D: Customer<->ProcessingCustomer link ---
  if (body.unlinkProcessingCustomer) {
    await unlinkProcessingCustomer(customer._id);
    return Customer.findById(customer._id);
  }

  if (body.linkedProcessingCustomerId) {
    await linkRegularAndProcessingCustomer(customer._id, body.linkedProcessingCustomerId);
    return Customer.findById(customer._id);
  }

  if (body.linkedRegularCustomerId) {
    await linkRegularAndProcessingCustomer(body.linkedRegularCustomerId, customer._id);
    return Customer.findById(customer._id);
  }

  if (body.unlinkRegularCustomer) {
    await unlinkRegularCustomer(customer._id);
    return Customer.findById(customer._id);
  }

  return Customer.findById(customer._id);
}

/**
 * After creating a Supplier, optionally create or link a Processing customer.
 */
async function handleSupplierLinkOnSave(supplier, body) {
  if (body.unlinkCustomer) {
    await unlinkSupplier(supplier._id);
    return Supplier.findById(supplier._id);
  }

  if (body.linkedCustomerId) {
    await linkCustomerAndSupplier(body.linkedCustomerId, supplier._id);
    return Supplier.findById(supplier._id);
  }

  if (body.alsoProcessingCustomer && !supplier.linkedCustomerId) {
    const customer = await Customer.create({
      name: supplier.name,
      contactNumber: supplier.contactNumber || '',
      address: supplier.address || '',
      customerType: 'Processing',
      openingBalance: 0,
      openingBalanceType: 'none',
      linkedSupplierId: supplier._id,
    });
    supplier.linkedCustomerId = customer._id;
    await supplier.save();
  }

  return Supplier.findById(supplier._id);
}

// ─── Part D: Customer <-> ProcessingCustomer linking ────────────────────────

/**
 * Bidirectional link between a regular Customer and a Processing Customer.
 * A regular customer sets linkedProcessingCustomerId.
 * The processing customer sets linkedRegularCustomerId.
 */
async function linkRegularAndProcessingCustomer(regularId, processingId) {
  if (!regularId || !processingId) return null;

  const regular = await Customer.findById(regularId);
  const processing = await Customer.findById(processingId);
  if (!regular || !processing) {
    const err = new Error('One or both customers not found for linking');
    err.statusCode = 404;
    throw err;
  }

  // Clear stale reverse links
  if (regular.linkedProcessingCustomerId && String(regular.linkedProcessingCustomerId) !== String(processingId)) {
    await Customer.findByIdAndUpdate(regular.linkedProcessingCustomerId, { $unset: { linkedRegularCustomerId: 1 } });
  }
  if (processing.linkedRegularCustomerId && String(processing.linkedRegularCustomerId) !== String(regularId)) {
    await Customer.findByIdAndUpdate(processing.linkedRegularCustomerId, { $unset: { linkedProcessingCustomerId: 1 } });
  }

  regular.linkedProcessingCustomerId = processingId;
  processing.linkedRegularCustomerId = regularId;
  await regular.save();
  await processing.save();

  return { regular, processing };
}

/**
 * Remove the Customer<->ProcessingCustomer link starting from the regular customer.
 */
async function unlinkRegularCustomer(regularId) {
  const regular = await Customer.findById(regularId);
  if (!regular?.linkedProcessingCustomerId) return;
  await Customer.findByIdAndUpdate(regular.linkedProcessingCustomerId, { $unset: { linkedRegularCustomerId: 1 } });
  regular.linkedProcessingCustomerId = undefined;
  await regular.save();
}

/**
 * Remove the Customer<->ProcessingCustomer link starting from the processing customer.
 */
async function unlinkProcessingCustomer(processingId) {
  const processing = await Customer.findById(processingId);
  if (!processing?.linkedRegularCustomerId) return;
  await Customer.findByIdAndUpdate(processing.linkedRegularCustomerId, { $unset: { linkedProcessingCustomerId: 1 } });
  processing.linkedRegularCustomerId = undefined;
  await processing.save();
}

module.exports = {
  linkCustomerAndSupplier,
  unlinkCustomer,
  unlinkSupplier,
  handleCustomerLinkOnSave,
  handleSupplierLinkOnSave,
  linkRegularAndProcessingCustomer,
  unlinkRegularCustomer,
  unlinkProcessingCustomer,
};
