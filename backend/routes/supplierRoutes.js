const express = require('express');
const {
  createSupplier,
  getSuppliers,
  getSupplierById,
  updateSupplier,
  deleteSupplier,
  getSupplierPurchases,
  getSupplierLedger,
} = require('../controllers/supplierController');

const router = express.Router();
router.route('/').get(getSuppliers).post(createSupplier);
router.get('/:id/ledger', getSupplierLedger);
router.get('/:id/purchases', getSupplierPurchases);
router.route('/:id').get(getSupplierById).put(updateSupplier).delete(deleteSupplier);

module.exports = router;
