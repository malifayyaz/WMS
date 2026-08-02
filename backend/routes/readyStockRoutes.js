const express = require('express');
const { createProduction, getProductions, getSummary, deleteProduction } = require('../controllers/readyStockController');

const router = express.Router();
router.get('/summary', getSummary);
router.route('/').get(getProductions).post(createProduction);
router.delete('/:id', deleteProduction);

module.exports = router;
