const express = require('express');
const { getStats, getCharts, getActivity } = require('../controllers/dashboardController');

const router = express.Router();
router.get('/stats', getStats);
router.get('/charts', getCharts);
router.get('/activity', getActivity);

module.exports = router;
