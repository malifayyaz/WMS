const express = require('express');
const {
  createExpense,
  getExpenses,
  getExpenseSummary,
  getExpenseBreakdown,
  updateExpense,
  deleteExpense,
} = require('../controllers/expenseController');

const router = express.Router();
router.get('/summary', getExpenseSummary);
router.get('/breakdown', getExpenseBreakdown);
router.route('/').get(getExpenses).post(createExpense);
router.route('/:id').put(updateExpense).delete(deleteExpense);

module.exports = router;
