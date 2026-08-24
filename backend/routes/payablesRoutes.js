const express = require('express');
const router = express.Router();
const payablesController = require('../controllers/payablesController');

router.get('/summary', payablesController.getSummary);

module.exports = router;
