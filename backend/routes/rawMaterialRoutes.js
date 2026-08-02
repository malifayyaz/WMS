const express = require('express');
const {
  createRawMaterial,
  createCoilReturn,
  getRawMaterials,
  getStockSummary,
  getLowStock,
  updateRawMaterial,
  deleteRawMaterial,
  reconcilePendingOrders,
} = require('../controllers/rawMaterialController');

const router = express.Router();
router.get('/stock-summary', getStockSummary);
router.get('/low-stock', getLowStock);
router.post('/reconcile-pending', reconcilePendingOrders);
router.post('/return', createCoilReturn);
router.route('/').get(getRawMaterials).post(createRawMaterial);
router.route('/:id').put(updateRawMaterial).delete(deleteRawMaterial);

module.exports = router;
