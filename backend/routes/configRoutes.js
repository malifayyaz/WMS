const express = require('express');
const { getWireConfig } = require('../controllers/configController');

const router = express.Router();
router.get('/wires', getWireConfig);

module.exports = router;
