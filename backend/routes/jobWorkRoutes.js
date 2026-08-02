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

const router = express.Router();
router.get('/stock', getJobWorkStock);
router.get('/pools', getJobWorkPools);
router.post('/pool-deliver', poolDeliver);
router.route('/').get(getJobWorks).post(createJobWork);
router.post('/:id/delivery', addDelivery);
router.put('/:id/delivery/:deliveryId', updateDelivery);
router.delete('/:id/delivery/:deliveryId', deleteDelivery);
router.route('/:id').put(updateJobWork).delete(deleteJobWork);

module.exports = router;
