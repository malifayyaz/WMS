const express = require('express');
const activityLogController = require('../controllers/activityLogController');
const { adminOnly } = require('../middleware/roleMiddleware');

const router = express.Router();

// authMiddleware is applied where this router is mounted (server.js).
router.use(adminOnly);

router.get('/stats', activityLogController.getStats);
router.get('/', activityLogController.getLogs);

module.exports = router;
