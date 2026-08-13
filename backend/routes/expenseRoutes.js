const express = require('express');
const {
  createExpense,
  getExpenses,
  getExpenseSummary,
  getExpenseBreakdown,
  updateExpense,
  deleteExpense,
  breakdownExpense,
} = require('../controllers/expenseController');
const { blockViewer } = require('../middleware/roleMiddleware');

const router = express.Router();
router.get('/summary', getExpenseSummary);
router.get('/breakdown', getExpenseBreakdown);
router.route('/').get(getExpenses).post(blockViewer, createExpense);
router.post('/:id/breakdown', blockViewer, breakdownExpense);
router.route('/:id').put(blockViewer, updateExpense).delete(blockViewer, deleteExpense);

module.exports = router;
