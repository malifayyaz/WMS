const express = require('express');
const {
  createExpense,
  getExpenses,
  getExpenseSummary,
  getExpenseBreakdown,
  updateExpense,
  deleteExpense,
} = require('../controllers/expenseController');
const { blockViewer } = require('../middleware/roleMiddleware');

const router = express.Router();
router.get('/summary', getExpenseSummary);
router.get('/breakdown', getExpenseBreakdown);
router.route('/').get(getExpenses).post(blockViewer, createExpense);
router.route('/:id').put(blockViewer, updateExpense).delete(blockViewer, deleteExpense);

module.exports = router;
