const express = require('express');
const router = express.Router();
const receivablesController = require('../controllers/receivablesController');

router.get('/summary', receivablesController.getSummary);

module.exports = router;
