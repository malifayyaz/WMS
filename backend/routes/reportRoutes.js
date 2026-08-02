const express = require('express');
const {
  getProfitLoss,
  getFinancialReport,
  getCustomerReport,
  getInventoryReport,
  getDailyBookReport,
} = require('../controllers/reportController');

const router = express.Router();
router.get('/profit-loss', getProfitLoss);
router.get('/financial', getFinancialReport);
router.get('/customer/:id', getCustomerReport);
router.get('/inventory', getInventoryReport);
router.get('/daily-book', getDailyBookReport);

module.exports = router;
