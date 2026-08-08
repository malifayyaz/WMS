const express = require('express');
const {
  createSend,
  createArrival,
  getAnnealingRecords,
  getAnnealingSummary,
  updateAnnealing,
  deleteAnnealing,
} = require('../controllers/annealingController');
const { blockViewer } = require('../middleware/roleMiddleware');

const router = express.Router();
router.get('/summary', getAnnealingSummary);
router.get('/pending', getAnnealingSummary); // legacy alias
router.post('/arrival', blockViewer, createArrival);
router.route('/').get(getAnnealingRecords).post(blockViewer, createSend);
router.route('/:id').put(blockViewer, updateAnnealing).delete(blockViewer, deleteAnnealing);

module.exports = router;
