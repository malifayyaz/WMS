require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const authMiddleware = require('./middleware/authMiddleware');

const authRoutes = require('./routes/authRoutes');
const supplierRoutes = require('./routes/supplierRoutes');
const rawMaterialRoutes = require('./routes/rawMaterialRoutes');
const customerRoutes = require('./routes/customerRoutes');
const orderRoutes = require('./routes/orderRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const expenseRoutes = require('./routes/expenseRoutes');
const reportRoutes = require('./routes/reportRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const consumptionRoutes = require('./routes/consumptionRoutes');
const readyStockRoutes = require('./routes/readyStockRoutes');
const configRoutes = require('./routes/configRoutes');
const annealingRoutes = require('./routes/annealingRoutes');
const jobWorkRoutes = require('./routes/jobWorkRoutes');
const workerRoutes = require('./routes/workerRoutes');
const aiRoutes = require("./routes/aiRoutes");

const { reconcileAllPendingOrders } = require('./utils/stockService');

connectDB().then(async () => {
  // After DB connects, fulfil any orders whose pending stock can now be covered.
  // This handles all historical data where stock arrived before this feature existed.
  try {
    const result = await reconcileAllPendingOrders();
    const totalFulfilled = Object.values(result).reduce((s, r) => s + (r.fulfilled || 0), 0);
    const totalCleared = Object.values(result).reduce((s, r) => s + (r.alertsCleared || 0), 0);
    const totalDoneFixed = Object.values(result).reduce((s, r) => s + (r.doneOrdersFixed || 0), 0);
    if (totalFulfilled > 0 || totalCleared > 0 || totalDoneFixed > 0) {
      console.log(`[Stock Reconcile] Startup: ${totalFulfilled} order(s) fulfilled, ${totalCleared} stale alert(s) cleared, ${totalDoneFixed} Done order(s) cleaned up`);
    } else {
      console.log('[Stock Reconcile] Startup: all orders up to date');
    }
  } catch (err) {
    console.error('[Stock Reconcile] Startup reconciliation error:', err.message);
  }
});

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/suppliers', authMiddleware, supplierRoutes);
app.use('/api/raw-materials', authMiddleware, rawMaterialRoutes);
app.use('/api/customers', authMiddleware, customerRoutes);
app.use('/api/orders', authMiddleware, orderRoutes);
app.use('/api/transactions', authMiddleware, transactionRoutes);
app.use('/api/expenses', authMiddleware, expenseRoutes);
app.use('/api/reports', authMiddleware, reportRoutes);
app.use('/api/dashboard', authMiddleware, dashboardRoutes);
app.use('/api/consumption', authMiddleware, consumptionRoutes);
app.use('/api/ready-stock', authMiddleware, readyStockRoutes);
app.use('/api/config', authMiddleware, configRoutes);
app.use('/api/annealing', authMiddleware, annealingRoutes);
app.use('/api/jobwork', authMiddleware, jobWorkRoutes);
app.use('/api/workers', authMiddleware, workerRoutes);
app.use("/api/ai", authMiddleware, aiRoutes);

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
