const express = require('express');
const router = express.Router();
const periodCloseController = require('../controllers/periodCloseController');
const { adminOnly } = require('../middleware/roleMiddleware');

// All Period Close routes are strictly restricted to admin role
router.use(adminOnly);

router.post('/validate-password', periodCloseController.validatePassword);
router.get('/preview', periodCloseController.previewClose);
router.post('/execute', periodCloseController.executeClose);
router.get('/history', periodCloseController.getCloseHistory);
router.get('/backup/:filename', periodCloseController.downloadBackup);

module.exports = router;
