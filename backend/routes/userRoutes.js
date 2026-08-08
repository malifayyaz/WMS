const express = require('express');
const userController = require('../controllers/userController');
const { adminOnly } = require('../middleware/roleMiddleware');

const router = express.Router();

// authMiddleware is already applied where this router is mounted (server.js).
// Every route here additionally requires admin.
router.use(adminOnly);

router.get('/stats', userController.getUserStats);
router.get('/', userController.getAllUsers);
router.post('/', userController.createUser);
router.put('/:id', userController.updateUser);
router.put('/:id/reset-password', userController.adminResetPassword);
router.delete('/:id', userController.deleteUser);

module.exports = router;
