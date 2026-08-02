const express = require('express');
const { getStats, getCharts } = require('../controllers/dashboardController');

const router = express.Router();
router.get('/stats', getStats);
router.get('/charts', getCharts);

module.exports = router;
