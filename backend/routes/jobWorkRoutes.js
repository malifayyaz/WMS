const express = require('express');
const {
  createJobWork,
  getJobWorks,
  addDelivery,
  updateDelivery,
  deleteDelivery,
  poolDeliver,
  getJobWorkPools,
  updateJobWork,
  deleteJobWork,
  getJobWorkStock,
  addReturn,
  updateReturn,
  deleteReturn,
  previewExcessDelivery,
  updateExcessDelivery,
  deleteExcessDelivery,
} = require('../controllers/jobWorkController');
const { blockViewer } = require('../middleware/roleMiddleware');

const router = express.Router();
router.get('/stock', getJobWorkStock);
router.get('/pools', getJobWorkPools);
router.post('/pool-deliver', blockViewer, poolDeliver);
router.route('/').get(getJobWorks).post(blockViewer, createJobWork);
router.get('/:id/excess-preview', previewExcessDelivery);
router.post('/:id/delivery', blockViewer, addDelivery);
router.put('/:id/delivery/:deliveryId', blockViewer, updateDelivery);
router.delete('/:id/delivery/:deliveryId', blockViewer, deleteDelivery);
router.put('/:id/excess/:excessId', blockViewer, updateExcessDelivery);
router.delete('/:id/excess/:excessId', blockViewer, deleteExcessDelivery);
router.post('/:id/returns', blockViewer, addReturn);
router.put('/:id/returns/:returnId', blockViewer, updateReturn);
router.delete('/:id/returns/:returnId', blockViewer, deleteReturn);
router.route('/:id').put(blockViewer, updateJobWork).delete(blockViewer, deleteJobWork);

module.exports = router;
