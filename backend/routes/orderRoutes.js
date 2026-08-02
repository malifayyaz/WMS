const express = require('express');
const {
  createOrder,
  getOrders,
  getOrderById,
  updateOrder,
  updateOrderStatus,
  updateFinalWeight,
  deleteOrder,
  getOrdersByStatus,
  checkStockForOrder,
  createWireReturn,
} = require('../controllers/orderController');

const router = express.Router();
router.get('/check-stock', checkStockForOrder);
router.get('/by-status/:status', getOrdersByStatus);
router.post('/return', createWireReturn);
router.route('/').get(getOrders).post(createOrder);
router.put('/:id/status', updateOrderStatus);
router.put('/:id/final-weight', updateFinalWeight);
router.route('/:id').get(getOrderById).put(updateOrder).delete(deleteOrder);

module.exports = router;
