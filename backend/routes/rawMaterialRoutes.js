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
const { blockViewer } = require('../middleware/roleMiddleware');

const router = express.Router();
router.get('/stock-summary', getStockSummary);
router.get('/low-stock', getLowStock);
router.post('/reconcile-pending', blockViewer, reconcilePendingOrders);
router.post('/return', blockViewer, createCoilReturn);
router.route('/').get(getRawMaterials).post(blockViewer, createRawMaterial);
router.route('/:id').put(blockViewer, updateRawMaterial).delete(blockViewer, deleteRawMaterial);

module.exports = router;
