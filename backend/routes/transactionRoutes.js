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

const router = express.Router();
router.get('/cashbook', getCashBook);
router.post('/cashbook/opening', setCashOpening);
router.post('/cashbook/breakdown', setCashBreakdownHandler);
router.get('/cashbook/previous-closing', getPrevClosing);
router.get('/bank-book', getBankBook);
router.get('/bank-persons', getBankPersons);
router.get('/bank-book/opening', getBankOpeningBalances);
router.post('/bank-book/opening', setBankOpeningBalance);
router.get('/summary', getSummary);
router.get('/daily/:date', getDailyTransactions);
router.route('/').get(getTransactions).post(createTransaction);
router.route('/:id').get(getTransactionById).put(updateTransaction).delete(deleteTransaction);

module.exports = router;
