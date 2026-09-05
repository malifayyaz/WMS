const express = require('express');
const router = express.Router();
const openingBalanceController = require('../controllers/openingBalanceController');
const { blockViewer } = require('../middleware/roleMiddleware');

router.get('/summary', openingBalanceController.getSummary);
router.get('/', openingBalanceController.getAll);
router.post('/', blockViewer, openingBalanceController.upsertOpening);
router.delete('/:id', blockViewer, openingBalanceController.deleteOpening);

module.exports = router;
