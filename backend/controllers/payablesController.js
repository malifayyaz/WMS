const Supplier = require('../models/Supplier');
const RawMaterial = require('../models/RawMaterial');
const Transaction = require('../models/Transaction');
const PersonalPayment = require('../models/PersonalPayment');

/**
 * GET /api/payables/summary
 * Aggregates all payables (supplier dues, raw material lot dues, personal loans/payables)
 */
exports.getSummary = async (req, res, next) => {
  try {
    const { startDate, endDate, search } = req.query;

    // 1. Supplier Payables
    const supplierFilter = { totalAmountDue: { $gt: 0 } };
    if (search) {
      supplierFilter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { companyName: { $regex: search, $options: 'i' } },
        { contactNumber: { $regex: search, $options: 'i' } },
      ];
    }
    const suppliers = await Supplier.find(supplierFilter).sort({ totalAmountDue: -1 }).lean();

    // Attach latest activity date (since)
    const supplierIds = suppliers.map((s) => s._id);
    const lastTxns = await Transaction.aggregate([
      { $match: { relatedId: { $in: supplierIds } } },
      { $sort: { transactionDate: -1 } },
      {
        $group: {
          _id: '$relatedId',
          lastDate: { $first: '$transactionDate' },
        },
      },
    ]);
    const txnDateMap = new Map();
    lastTxns.forEach((t) => txnDateMap.set(String(t._id), t.lastDate));

    const enrichedSuppliers = suppliers.map((s) => ({
      ...s,
      sinceDate: txnDateMap.get(String(s._id)) || s.updatedAt || s.createdAt,
    }));

    const totalSupplierDue = enrichedSuppliers.reduce((sum, s) => sum + (s.totalAmountDue || 0), 0);

    // 2. Raw Material Purchase Dues (lot level)
    const rawFilter = { amountDue: { $gt: 0 } };
    if (search) {
      rawFilter.$or = [
        { supplierName: { $regex: search, $options: 'i' } },
        { materialType: { $regex: search, $options: 'i' } },
      ];
    }
    const rawMaterials = await RawMaterial.find(rawFilter)
      .populate('supplierId', 'name companyName')
      .sort({ purchaseDate: -1 })
      .lean();

    const totalRawMaterialDue = rawMaterials.reduce((sum, rm) => sum + (rm.amountDue || 0), 0);

    // Group Raw Materials by Supplier
    const rawBySupplierMap = new Map();
    rawMaterials.forEach((rm) => {
      const sId = String(rm.supplierId?._id || rm.supplierId || 'unassigned');
      const sName = rm.supplierId?.name || rm.supplierName || 'Unknown Supplier';
      if (!rawBySupplierMap.has(sId)) {
        rawBySupplierMap.set(sId, {
          supplierId: sId,
          supplierName: sName,
          companyName: rm.supplierId?.companyName || '',
          totalDue: 0,
          items: [],
        });
      }
      const entry = rawBySupplierMap.get(sId);
      entry.totalDue += rm.amountDue || 0;
      entry.items.push(rm);
    });

    const rawMaterialsBySupplier = Array.from(rawBySupplierMap.values());

    // 3. Personal Payables (Loans Taken / Personal Liabilities)
    let personalPayables = [];
    try {
      personalPayables = await PersonalPayment.find({ status: 'Active', paymentDirection: 'Payable' })
        .sort({ expectedReceiveDate: 1 })
        .lean();
    } catch {
      personalPayables = [];
    }

    const totalPersonalPayableLumpSum = personalPayables.reduce((sum, p) => sum + (p.expectedLumpSum || 0), 0);
    const totalPersonalPayableRepaid = personalPayables.reduce((sum, p) => sum + (p.totalContributed || 0), 0);
    const totalPersonalPayableRemaining = personalPayables.reduce((sum, p) => sum + (p.remainingToContribute || 0), 0);

    const grandTotalPayables = totalSupplierDue + totalPersonalPayableRemaining;

    res.json({
      success: true,
      data: {
        suppliers: enrichedSuppliers,
        rawMaterials,
        rawMaterialsBySupplier,
        personalPayables,
        totals: {
          totalSupplierDue,
          totalRawMaterialDue,
          totalPersonalPayableLumpSum,
          totalPersonalPayableRepaid,
          totalPersonalPayableRemaining,
          grandTotalPayables,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};
