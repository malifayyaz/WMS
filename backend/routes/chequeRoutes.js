const express = require('express');
const {
  getCheques,
  getInHandCheques,
  getChequeSummary,
  getChequeById,
  createCheque,
  endorseCheque,
  depositCheque,
  updateChequeStatus,
  updateCheque,
  deleteCheque,
} = require('../controllers/chequeController');
const { blockViewer } = require('../middleware/roleMiddleware');

const router = express.Router();

router.get('/in-hand', getInHandCheques);
router.get('/summary', getChequeSummary);
router.post('/:id/endorse', blockViewer, endorseCheque);
router.post('/:id/deposit', blockViewer, depositCheque);
router.patch('/:id/status', blockViewer, updateChequeStatus);

router.route('/')
  .get(getCheques)
  .post(blockViewer, createCheque);

router.route('/:id')
  .get(getChequeById)
  .put(blockViewer, updateCheque)
  .delete(blockViewer, deleteCheque);

module.exports = router;
