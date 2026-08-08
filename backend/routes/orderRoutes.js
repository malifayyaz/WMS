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
const { blockViewer } = require('../middleware/roleMiddleware');

const router = express.Router();
router.get('/check-stock', checkStockForOrder);
router.get('/by-status/:status', getOrdersByStatus);
router.post('/return', blockViewer, createWireReturn);
router.route('/').get(getOrders).post(blockViewer, createOrder);
router.put('/:id/status', blockViewer, updateOrderStatus);
router.put('/:id/final-weight', blockViewer, updateFinalWeight);
router.route('/:id').get(getOrderById).put(blockViewer, updateOrder).delete(blockViewer, deleteOrder);

module.exports = router;
