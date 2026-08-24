const express = require('express');
const router = express.Router();
const personalPaymentController = require('../controllers/personalPaymentController');
const { blockViewer } = require('../middleware/roleMiddleware');

router.get('/', personalPaymentController.getAll);
router.post('/', blockViewer, personalPaymentController.create);
router.post('/:id/payments', blockViewer, personalPaymentController.addPayment);
router.put('/:id', blockViewer, personalPaymentController.update);
router.delete('/:id/payments/:paymentId', blockViewer, personalPaymentController.deletePayment);
router.delete('/:id', blockViewer, personalPaymentController.delete);

module.exports = router;
