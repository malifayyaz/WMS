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
const chequeRoutes = require('./routes/chequeRoutes');
const userRoutes = require('./routes/userRoutes');
const activityLogRoutes = require('./routes/activityLogRoutes');
const receivablesRoutes = require('./routes/receivablesRoutes');
const payablesRoutes = require('./routes/payablesRoutes');
const personalPaymentRoutes = require('./routes/personalPaymentRoutes');
const balanceSheetRoutes = require('./routes/balanceSheetRoutes');
const periodCloseRoutes = require('./routes/periodCloseRoutes');
const openingBalanceRoutes = require('./routes/openingBalanceRoutes');

const { reconcileAllPendingOrders } = require('./utils/stockService');

connectDB().then(async () => {
  // After DB connects, fulfil any orders whose pending stock can now be covered.
  try {
    const result = await reconcileAllPendingOrders();
    const totalFulfilled = Object.values(result).reduce((s, r) => s + (r.fulfilled || 0), 0);
    const totalCleared = Object.values(result).reduce((s, r) => s + (r.alertsCleared || 0), 0);
    const totalDoneFixed = Object.values(result).reduce((s, r) => s + (r.doneOrdersFixed || 0), 0);
    if (process.env.NODE_ENV !== 'production') {
      if (totalFulfilled > 0 || totalCleared > 0 || totalDoneFixed > 0) {
        console.log(`[Stock Reconcile] Startup: ${totalFulfilled} order(s) fulfilled, ${totalCleared} stale alert(s) cleared, ${totalDoneFixed} Done order(s) cleaned up`);
      } else {
        console.log('[Stock Reconcile] Startup: all orders up to date');
      }
    }
  } catch (err) {
    console.error('[Stock Reconcile] Startup reconciliation error:', err.message);
  }
});

const app = express();
const corsOrigin = process.env.CORS_ORIGIN;
app.use(
  cors(
    corsOrigin
      ? {
          origin: corsOrigin.split(',').map((s) => s.trim()).filter(Boolean),
          credentials: true,
        }
      : undefined
  )
);
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
app.use('/api/cheques', authMiddleware, chequeRoutes);
app.use('/api/users', authMiddleware, userRoutes);
app.use('/api/activity-logs', authMiddleware, activityLogRoutes);
app.use('/api/receivables', authMiddleware, receivablesRoutes);
app.use('/api/payables', authMiddleware, payablesRoutes);
app.use('/api/personal-payments', authMiddleware, personalPaymentRoutes);
app.use('/api/balance-sheet', authMiddleware, balanceSheetRoutes);
app.use('/api/period-close', authMiddleware, periodCloseRoutes);
app.use('/api/opening-balances', authMiddleware, openingBalanceRoutes);

app.use(errorHandler);

// Server entry point - restart trigger
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`Server running on port ${PORT}`);
  }
});
