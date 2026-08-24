const express = require('express');
const router = express.Router();
const balanceSheetController = require('../controllers/balanceSheetController');

router.get('/', balanceSheetController.getBalanceSheet);

module.exports = router;
