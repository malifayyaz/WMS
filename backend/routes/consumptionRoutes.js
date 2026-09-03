const express = require('express');
const {
  createMaterial,
  updateMaterial,
  deleteMaterial,
  getMaterials,
  getMaterialStock,
  recordUsage,
  getUsage,
  getConsumptionAnalysis,
  addPayment,
  getLedger,
} = require('../controllers/consumptionController');
const { blockViewer } = require('../middleware/roleMiddleware');

const router = express.Router();
router.get('/analysis', getConsumptionAnalysis);
router.get('/stock', getMaterialStock);
router.get('/ledger', getLedger);
router.get('/materials/ledger', getLedger);
router.route('/materials').get(getMaterials).post(blockViewer, createMaterial);
router.post('/materials/:id/payments', blockViewer, addPayment);
router.post('/:id/payments', blockViewer, addPayment);
router.route('/materials/:id').put(blockViewer, updateMaterial).delete(blockViewer, deleteMaterial);
router.route('/usage').get(getUsage).post(blockViewer, recordUsage);

module.exports = router;
