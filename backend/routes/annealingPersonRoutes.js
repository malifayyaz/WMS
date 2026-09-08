const express = require('express');
const router = express.Router();
const annealingPersonController = require('../controllers/annealingPersonController');
const { adminOnly } = require('../middleware/roleMiddleware');

router.get('/', annealingPersonController.getAll);
router.post('/', adminOnly, annealingPersonController.create);
router.get('/:id', annealingPersonController.getById);
router.put('/:id', adminOnly, annealingPersonController.update);
router.delete('/:id', adminOnly, annealingPersonController.delete);
router.post('/:id/payments', adminOnly, annealingPersonController.addPayment);

module.exports = router;
