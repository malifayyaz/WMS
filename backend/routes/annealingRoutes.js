const express = require('express');
const {
  createSend,
  createArrival,
  getAnnealingRecords,
  getAnnealingSummary,
  updateAnnealing,
  deleteAnnealing,
} = require('../controllers/annealingController');

const router = express.Router();
router.get('/summary', getAnnealingSummary);
router.get('/pending', getAnnealingSummary); // legacy alias
router.post('/arrival', createArrival);
router.route('/').get(getAnnealingRecords).post(createSend);
router.route('/:id').put(updateAnnealing).delete(deleteAnnealing);

module.exports = router;
