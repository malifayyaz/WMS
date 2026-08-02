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
} = require('../controllers/customerController');

const router = express.Router();
router.route('/').get(getCustomers).post(createCustomer);
router.get('/:id/orders', getCustomerOrders);
router.get('/:id/payment-history', getCustomerPaymentHistory);
router.get('/:id/ledger', getCustomerLedger);
router.post('/:id/add-payment', addCustomerPayment);
router.route('/:id').get(getCustomerById).put(updateCustomer).delete(deleteCustomer);

module.exports = router;
