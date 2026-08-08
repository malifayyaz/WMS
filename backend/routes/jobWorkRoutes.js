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
} = require('../controllers/jobWorkController');
const { blockViewer } = require('../middleware/roleMiddleware');

const router = express.Router();
router.get('/stock', getJobWorkStock);
router.get('/pools', getJobWorkPools);
router.post('/pool-deliver', blockViewer, poolDeliver);
router.route('/').get(getJobWorks).post(blockViewer, createJobWork);
router.post('/:id/delivery', blockViewer, addDelivery);
router.put('/:id/delivery/:deliveryId', blockViewer, updateDelivery);
router.delete('/:id/delivery/:deliveryId', blockViewer, deleteDelivery);
router.route('/:id').put(blockViewer, updateJobWork).delete(blockViewer, deleteJobWork);

module.exports = router;
