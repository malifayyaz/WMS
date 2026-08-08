const express = require('express');
const {
  createTransaction,
  updateTransaction,
  getTransactionById,
  getTransactions,
  getSummary,
  getDailyTransactions,
  deleteTransaction,
  getCashBook,
  getBankBook,
  getBankPersons,
  setBankOpeningBalance,
  getBankOpeningBalances,
  setCashOpening,
  setCashBreakdownHandler,
  getPrevClosing,
} = require('../controllers/transactionController');
const { blockViewer } = require('../middleware/roleMiddleware');

const router = express.Router();
router.get('/cashbook', getCashBook);
router.post('/cashbook/opening', blockViewer, setCashOpening);
router.post('/cashbook/breakdown', blockViewer, setCashBreakdownHandler);
router.get('/cashbook/previous-closing', getPrevClosing);
router.get('/bank-book', getBankBook);
router.get('/bank-persons', getBankPersons);
router.get('/bank-book/opening', getBankOpeningBalances);
router.post('/bank-book/opening', blockViewer, setBankOpeningBalance);
router.get('/summary', getSummary);
router.get('/daily/:date', getDailyTransactions);
router.route('/').get(getTransactions).post(blockViewer, createTransaction);
router.route('/:id').get(getTransactionById).put(blockViewer, updateTransaction).delete(blockViewer, deleteTransaction);

module.exports = router;
