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

const router = express.Router();
router.get('/analysis', getConsumptionAnalysis);
router.get('/stock', getMaterialStock);
router.route('/materials').get(getMaterials).post(createMaterial);
router.route('/materials/:id').put(updateMaterial).delete(deleteMaterial);
router.route('/usage').get(getUsage).post(recordUsage);

module.exports = router;
