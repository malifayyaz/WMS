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

const router = express.Router();

router.route('/').get(getWorkers).post(createWorker);
router.get('/:id/ledger', getWorkerLedger);
router.post('/:id/entries', createWorkerEntry);
router.put('/:id/entries/:entryId', updateWorkerEntry);
router.delete('/:id/entries/:entryId', deleteWorkerEntry);
router.route('/:id').get(getWorkerById).put(updateWorker).delete(deleteWorker);

module.exports = router;
