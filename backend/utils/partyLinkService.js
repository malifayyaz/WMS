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

module.exports = {
  linkCustomerAndSupplier,
  unlinkCustomer,
  unlinkSupplier,
  handleCustomerLinkOnSave,
  handleSupplierLinkOnSave,
};
