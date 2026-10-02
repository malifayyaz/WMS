const express = require('express');
const {
  createCustomer,
  getCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
  getCustomerOrders,
  getCustomerPaymentHistory,
  addCustomerPayment,
  getCustomerLedger,
  linkCustomerToProcessingCustomer,
  unlinkCustomerFromProcessingCustomer,
} = require('../controllers/customerController');
const { blockViewer } = require('../middleware/roleMiddleware');

const router = express.Router();
router.route('/').get(getCustomers).post(blockViewer, createCustomer);
router.get('/:id/orders', getCustomerOrders);
router.get('/:id/payment-history', getCustomerPaymentHistory);
router.get('/:id/ledger', getCustomerLedger);
router.post('/:id/add-payment', blockViewer, addCustomerPayment);
// Part D: link/unlink Customer <-> ProcessingCustomer
router.post('/link-processing', blockViewer, linkCustomerToProcessingCustomer);
router.delete('/:id/unlink-processing', blockViewer, unlinkCustomerFromProcessingCustomer);
router.route('/:id').get(getCustomerById).put(blockViewer, updateCustomer).delete(blockViewer, deleteCustomer);

module.exports = router;
