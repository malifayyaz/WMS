const express = require('express');
const { createProduction, getProductions, getSummary, deleteProduction } = require('../controllers/readyStockController');
const { blockViewer } = require('../middleware/roleMiddleware');

const router = express.Router();
router.get('/summary', getSummary);
router.route('/').get(getProductions).post(blockViewer, createProduction);
router.delete('/:id', blockViewer, deleteProduction);

module.exports = router;
