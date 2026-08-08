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
const { blockViewer } = require('../middleware/roleMiddleware');

const router = express.Router();
router.route('/').get(getSuppliers).post(blockViewer, createSupplier);
router.get('/:id/ledger', getSupplierLedger);
router.get('/:id/purchases', getSupplierPurchases);
router.route('/:id').get(getSupplierById).put(blockViewer, updateSupplier).delete(blockViewer, deleteSupplier);

module.exports = router;
