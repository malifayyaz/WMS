const express = require('express');
const {
  createWorker,
  getWorkers,
  getWorkerById,
  updateWorker,
  deleteWorker,
  getWorkerLedger,
  createWorkerEntry,
  updateWorkerEntry,
  deleteWorkerEntry,
} = require('../controllers/workerController');
const { blockViewer } = require('../middleware/roleMiddleware');

const router = express.Router();

router.route('/').get(getWorkers).post(blockViewer, createWorker);
router.get('/:id/ledger', getWorkerLedger);
router.post('/:id/entries', blockViewer, createWorkerEntry);
router.put('/:id/entries/:entryId', blockViewer, updateWorkerEntry);
router.delete('/:id/entries/:entryId', blockViewer, deleteWorkerEntry);
router.route('/:id').get(getWorkerById).put(blockViewer, updateWorker).delete(blockViewer, deleteWorker);

module.exports = router;
