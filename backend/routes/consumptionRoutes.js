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
} = require('../controllers/consumptionController');
const { blockViewer } = require('../middleware/roleMiddleware');

const router = express.Router();
router.get('/analysis', getConsumptionAnalysis);
router.get('/stock', getMaterialStock);
router.route('/materials').get(getMaterials).post(blockViewer, createMaterial);
router.route('/materials/:id').put(blockViewer, updateMaterial).delete(blockViewer, deleteMaterial);
router.route('/usage').get(getUsage).post(blockViewer, recordUsage);

module.exports = router;
