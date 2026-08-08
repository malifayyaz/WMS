const Supplier = require('../models/Supplier');
const RawMaterial = require('../models/RawMaterial');
const { buildScopedLedger, applyOpeningBalanceToTotals } = require('../utils/ledgerService');
const { handleSupplierLinkOnSave, unlinkSupplier } = require('../utils/partyLinkService');

function withOpeningBalance(body) {
  const data = { ...body };
  const openingBalance = Number(data.openingBalance || 0);
  const openingBalanceType = data.openingBalanceType || 'none';
  if (openingBalance > 0 && openingBalanceType !== 'none') {
    const totals = applyOpeningBalanceToTotals('Supplier', openingBalance, openingBalanceType);
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
 * Create new supplier.
 */
const createSupplier = async (req, res, next) => {
  try {
    const body = withOpeningBalance(req.body);
    const { alsoProcessingCustomer, linkedCustomerId, unlinkCustomer, ...createBody } = body;
    let supplier = await Supplier.create(createBody);
    supplier = await handleSupplierLinkOnSave(supplier, {
      alsoProcessingCustomer,
      linkedCustomerId,
      unlinkCustomer,
    });
    res.status(201).json({ success: true, data: supplier, message: 'Supplier created successfully' });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
    next(error);
  }
};

/**
 * Get all suppliers with optional search.
 */
const getSuppliers = async (req, res, next) => {
  try {
    const { search } = req.query;
    const filter = {};
    if (search) filter.$or = [{ name: new RegExp(search, 'i') }, { companyName: new RegExp(search, 'i') }];
    const suppliers = await Supplier.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: suppliers, total: suppliers.length });
  } catch (error) {
    next(error);
  }
};

/**
 * Get single supplier by id.
 */
const getSupplierById = async (req, res, next) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) return res.status(404).json({ success: false, error: 'Supplier not found', message: 'Supplier not found' });
    res.json({ success: true, data: supplier });
  } catch (error) {
    next(error);
  }
};

/**
 * Update supplier.
 */
const updateSupplier = async (req, res, next) => {
  try {
    const existing = await Supplier.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Supplier not found', message: 'Supplier not found' });

    const body = { ...req.body };
    const oldOpening = Number(existing.openingBalance || 0);
    const newOpening = body.openingBalance !== undefined ? Number(body.openingBalance || 0) : oldOpening;
    const oldType = existing.openingBalanceType || 'credit';
    const newType = body.openingBalanceType || oldType;

    if (body.openingBalance !== undefined && (newOpening !== oldOpening || newType !== oldType)) {
      if (newType === 'none' || newOpening === 0) {
        const reverseOld = oldType !== 'none' && oldOpening > 0
          ? applyOpeningBalanceToTotals('Supplier', oldOpening, oldType)
          : {};
        Object.keys(reverseOld).forEach((key) => {
          body[key] = Math.max(0, (existing[key] || 0) - (reverseOld[key] || 0));
        });
        body.openingBalance = 0;
      } else {
        const reverseOld = oldType !== 'none' ? applyOpeningBalanceToTotals('Supplier', oldOpening, oldType) : {};
        const applyNew = applyOpeningBalanceToTotals('Supplier', newOpening, newType);
        Object.keys({ ...reverseOld, ...applyNew }).forEach((key) => {
          body[key] = Math.max(0, (existing[key] || 0) - (reverseOld[key] || 0) + (applyNew[key] || 0));
        });
        if (body.openingBalanceDate) body.openingBalanceDate = new Date(body.openingBalanceDate);
      }
    }

    const { alsoProcessingCustomer, linkedCustomerId, unlinkCustomer, ...updateBody } = body;
    let supplier = await Supplier.findByIdAndUpdate(req.params.id, updateBody, { new: true, runValidators: true });
    supplier = await handleSupplierLinkOnSave(supplier, {
      alsoProcessingCustomer,
      linkedCustomerId,
      unlinkCustomer,
    });
    res.json({ success: true, data: supplier, message: 'Supplier updated successfully' });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
    next(error);
  }
};

/**
 * Delete supplier.
 * Blocked when the supplier has related history (purchases, payments, annealing).
 */
const deleteSupplier = async (req, res, next) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) return res.status(404).json({ success: false, error: 'Supplier not found', message: 'Supplier not found' });

    const Transaction = require('../models/Transaction');
    const AnnealingRecord = require('../models/AnnealingRecord');
    const [purchaseCount, txnCount, annealingCount] = await Promise.all([
      RawMaterial.countDocuments({ supplierId: supplier._id }),
      Transaction.countDocuments({ relatedTo: 'Supplier', relatedId: supplier._id }),
      AnnealingRecord.countDocuments({ partyType: 'Supplier', partyId: supplier._id }),
    ]);

    if (purchaseCount + txnCount + annealingCount > 0) {
      return res.status(400).json({
        success: false,
        message:
          `Cannot delete "${supplier.name}" — related history exists `
          + `(purchases: ${purchaseCount}, payments: ${txnCount}, annealing: ${annealingCount}). `
          + 'Keep the supplier and leave the ledger as-is.',
      });
    }

    await unlinkSupplier(supplier._id);
    await Supplier.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Supplier deleted successfully' });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all raw material purchases from this supplier.
 */
const getSupplierPurchases = async (req, res, next) => {
  try {
    const purchases = await RawMaterial.find({ supplierId: req.params.id }).sort({ purchaseDate: -1 });
    res.json({ success: true, data: purchases, total: purchases.length });
  } catch (error) {
    next(error);
  }
};

/**
 * Get supplier ledger.
 * Query: mode=personal|datewise, scope=own|processing|supplier|combined
 */
const getSupplierLedger = async (req, res, next) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) return res.status(404).json({ success: false, error: 'Supplier not found', message: 'Supplier not found' });
    const options = {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      mode: req.query.mode === 'datewise' ? 'datewise' : 'personal',
      scope: req.query.scope || 'own',
    };
    const ledger = await buildScopedLedger('Supplier', supplier, options);
    res.json({ success: true, data: ledger });
  } catch (error) {
    next(error);
  }
};

module.exports = { createSupplier, getSuppliers, getSupplierById, updateSupplier, deleteSupplier, getSupplierPurchases, getSupplierLedger };
