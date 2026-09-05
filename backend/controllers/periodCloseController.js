const path = require('path');
const fs = require('fs');

const PeriodClose = require('../models/PeriodClose');
const Order = require('../models/Order');
const Transaction = require('../models/Transaction');
const Expense = require('../models/Expense');
const RawMaterial = require('../models/RawMaterial');
const AnnealingRecord = require('../models/AnnealingRecord');
const JobWork = require('../models/JobWork');
const Worker = require('../models/Worker');
const WorkerLedgerEntry = require('../models/WorkerLedgerEntry');
const ConsumptionMaterial = require('../models/ConsumptionMaterial');
const ConsumptionUsage = require('../models/ConsumptionUsage');
const Customer = require('../models/Customer');
const Supplier = require('../models/Supplier');
const ReadyStock = require('../models/ReadyStock');
const PersonalPayment = require('../models/PersonalPayment');
const ActivityLog = require('../models/ActivityLog');
const DailyCashOpening = require('../models/DailyCashOpening');
const BankAccountOpening = require('../models/BankAccountOpening');

const { generateFullBackup } = require('../utils/backupService');

/**
 * Validates closing password against process.env.CLOSING_PASSWORD.
 */
exports.validatePassword = async (req, res) => {
  try {
    const { password } = req.body;
    const configuredPassword = process.env.CLOSING_PASSWORD;

    if (!configuredPassword || !password || String(password).trim() !== String(configuredPassword).trim()) {
      return res.status(401).json({
        success: false,
        valid: false,
        message: 'Invalid closing password',
      });
    }

    return res.json({
      success: true,
      valid: true,
      message: 'Password verified successfully',
    });
  } catch (error) {
    console.error('[PeriodClose] validatePassword error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Password validation failed',
    });
  }
};

/**
 * Previews the impact of closing from the specified closeDate onwards.
 */
exports.previewClose = async (req, res) => {
  try {
    const { closeDate: dateParam } = req.query;
    if (!dateParam) {
      return res.status(400).json({ success: false, message: 'closeDate query parameter is required' });
    }

    const closeDate = new Date(dateParam);
    if (isNaN(closeDate.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid closeDate provided' });
    }

    const [
      orders,
      transactions,
      expenses,
      rawMaterials,
      annealingRecords,
      jobWorks,
      workerLedgerEntries,
      consumptionMaterials,
      readyStock,
      personalPayments,
      activityLogs,
    ] = await Promise.all([
      Order.countDocuments({ orderDate: { $gte: closeDate } }),
      Transaction.countDocuments({ transactionDate: { $gte: closeDate } }),
      Expense.countDocuments({ expenseDate: { $gte: closeDate } }),
      RawMaterial.countDocuments({ purchaseDate: { $gte: closeDate } }),
      AnnealingRecord.countDocuments({ createdAt: { $gte: closeDate } }),
      JobWork.countDocuments({ createdAt: { $gte: closeDate } }),
      WorkerLedgerEntry.countDocuments({ createdAt: { $gte: closeDate } }),
      ConsumptionMaterial.countDocuments({ purchaseDate: { $gte: closeDate } }),
      ReadyStock.countDocuments({ productionDate: { $gte: closeDate } }),
      PersonalPayment.countDocuments({ createdAt: { $gte: closeDate } }),
      ActivityLog.countDocuments({ createdAt: { $gte: closeDate } }),
    ]);

    const total =
      orders +
      transactions +
      expenses +
      rawMaterials +
      annealingRecords +
      jobWorks +
      workerLedgerEntries +
      consumptionMaterials +
      readyStock +
      personalPayments +
      activityLogs;

    return res.json({
      success: true,
      data: {
        closeDate,
        willDelete: {
          orders,
          transactions,
          expenses,
          rawMaterials,
          annealingRecords,
          jobWorks,
          workerLedgerEntries,
          consumptionMaterials,
          readyStock,
          personalPayments,
          activityLogs,
          total,
        },
        warning: `This action cannot be undone. All records from ${closeDate.toLocaleDateString()} onwards will be permanently deleted.`,
      },
    });
  } catch (error) {
    console.error('[PeriodClose] previewClose error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to preview close impact',
    });
  }
};

/**
 * Executes full period close: backup, deletion, balance zeroing, and audit record creation.
 */
exports.executeClose = async (req, res) => {
  try {
    const { closeDate: dateParam, password, notes } = req.body;

    if (!dateParam) {
      return res.status(400).json({ success: false, message: 'closeDate is required' });
    }

    const closeDate = new Date(dateParam);
    if (isNaN(closeDate.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid closeDate provided' });
    }

    // STEP A: Verify password
    console.log('[PeriodClose] Step A: Verifying closing password...');
    const configuredPassword = process.env.CLOSING_PASSWORD;
    if (!configuredPassword || !password || String(password).trim() !== String(configuredPassword).trim()) {
      return res.status(401).json({
        success: false,
        message: 'Invalid closing password. Action aborted.',
      });
    }

    // STEP B: Generate Excel backup
    console.log('[PeriodClose] Step B: Generating full Excel backup before deletion...');
    let backupResult;
    try {
      backupResult = await generateFullBackup(closeDate);
      console.log(`[PeriodClose] Backup created successfully at: ${backupResult.filePath} (${backupResult.totalRecords} records)`);
    } catch (backupError) {
      console.error('[PeriodClose] Backup failed:', backupError);
      return res.status(500).json({
        success: false,
        message: `Backup failed. Close aborted. Error: ${backupError.message}`,
      });
    }

    const backupFilePath = backupResult.filePath;
    const backupFilename = backupResult.filename;

    // STEP C: Delete records ON OR AFTER closeDate in sequence
    console.log(`[PeriodClose] Step C: Deleting records from ${closeDate.toISOString()} onwards...`);
    const ordersDeleted = await Order.deleteMany({ orderDate: { $gte: closeDate } });
    console.log(`[PeriodClose] Deleted ${ordersDeleted.deletedCount} orders`);

    const transactionsDeleted = await Transaction.deleteMany({ transactionDate: { $gte: closeDate } });
    console.log(`[PeriodClose] Deleted ${transactionsDeleted.deletedCount} transactions`);

    const expensesDeleted = await Expense.deleteMany({ expenseDate: { $gte: closeDate } });
    console.log(`[PeriodClose] Deleted ${expensesDeleted.deletedCount} expenses`);

    const rawMaterialsDeleted = await RawMaterial.deleteMany({ purchaseDate: { $gte: closeDate } });
    console.log(`[PeriodClose] Deleted ${rawMaterialsDeleted.deletedCount} raw materials`);

    const annealingDeleted = await AnnealingRecord.deleteMany({ createdAt: { $gte: closeDate } });
    console.log(`[PeriodClose] Deleted ${annealingDeleted.deletedCount} annealing records`);

    const jobWorkDeleted = await JobWork.deleteMany({ createdAt: { $gte: closeDate } });
    console.log(`[PeriodClose] Deleted ${jobWorkDeleted.deletedCount} job works`);

    const workerEntriesDeleted = await WorkerLedgerEntry.deleteMany({ createdAt: { $gte: closeDate } });
    console.log(`[PeriodClose] Deleted ${workerEntriesDeleted.deletedCount} worker ledger entries`);

    const consumptionDeleted = await ConsumptionMaterial.deleteMany({ purchaseDate: { $gte: closeDate } });
    console.log(`[PeriodClose] Deleted ${consumptionDeleted.deletedCount} consumption materials`);

    const readyStockDeleted = await ReadyStock.deleteMany({ productionDate: { $gte: closeDate } });
    console.log(`[PeriodClose] Deleted ${readyStockDeleted.deletedCount} ready stock records`);

    const personalPaymentsDeleted = await PersonalPayment.deleteMany({ createdAt: { $gte: closeDate } });
    console.log(`[PeriodClose] Deleted ${personalPaymentsDeleted.deletedCount} personal payments`);

    const activityLogsDeleted = await ActivityLog.deleteMany({ createdAt: { $gte: closeDate } });
    console.log(`[PeriodClose] Deleted ${activityLogsDeleted.deletedCount} activity logs`);

    // STEP D: Zero out all running balances
    console.log('[PeriodClose] Step D: Resetting customer, supplier, stock, worker, and cash/bank balances...');

    await Customer.updateMany(
      {},
      {
        $set: {
          totalAmountPurchased: 0,
          totalAmountPaid: 0,
          totalAmountDue: 0,
          totalOrders: 0,
          paymentHistory: [],
        },
      }
    );

    await Supplier.updateMany(
      {},
      {
        $set: {
          totalAmountPurchased: 0,
          totalAmountPaid: 0,
          totalAmountDue: 0,
          paymentHistory: [],
        },
      }
    );

    await RawMaterial.updateMany(
      {},
      {
        $set: {
          currentStock: 0,
        },
      }
    );

    await Worker.updateMany(
      {},
      {
        $set: {
          totalSalaryPaid: 0,
          totalAdvance: 0,
          openingBalance: 0,
        },
      }
    );

    await DailyCashOpening.deleteMany({});
    await BankAccountOpening.deleteMany({});
    console.log('[PeriodClose] Balances and openings reset completed.');

    // STEP E: Mark previous PeriodClose records as superseded
    console.log('[PeriodClose] Step E: Marking previous period closes as Superseded...');
    await PeriodClose.updateMany({}, { $set: { status: 'Superseded' } });

    // STEP F: Create PeriodClose record
    console.log('[PeriodClose] Step F: Recording new PeriodClose audit document...');
    const deletedCounts = {
      orders: ordersDeleted.deletedCount || 0,
      transactions: transactionsDeleted.deletedCount || 0,
      expenses: expensesDeleted.deletedCount || 0,
      rawMaterials: rawMaterialsDeleted.deletedCount || 0,
      annealingRecords: annealingDeleted.deletedCount || 0,
      jobWorks: jobWorkDeleted.deletedCount || 0,
      workerLedgerEntries: workerEntriesDeleted.deletedCount || 0,
      consumptionMaterials: consumptionDeleted.deletedCount || 0,
      readyStock: readyStockDeleted.deletedCount || 0,
      personalPayments: personalPaymentsDeleted.deletedCount || 0,
      activityLogs: activityLogsDeleted.deletedCount || 0,
    };

    const periodCloseRecord = await PeriodClose.create({
      closeDate,
      executedBy: req.user?.name || req.user?.username || 'Admin',
      executedAt: new Date(),
      status: 'Completed',
      backupFilePath,
      deletedCounts,
      notes: notes || '',
    });

    console.log(`[PeriodClose] Period close #${periodCloseRecord._id} recorded successfully.`);

    // STEP G: Return success response
    return res.json({
      success: true,
      message: 'Period closed successfully',
      data: {
        periodCloseId: periodCloseRecord._id,
        closeDate,
        backupFilePath,
        backupFilename,
        deletedCounts,
        nextStep: 'Please enter opening balances for each section to start fresh',
      },
    });
  } catch (error) {
    console.error('[PeriodClose] executeClose fatal error:', error);
    return res.status(500).json({
      success: false,
      message: `Failed to execute period close: ${error.message}`,
    });
  }
};

/**
 * Downloads a generated backup file.
 */
exports.downloadBackup = async (req, res) => {
  try {
    const { filename } = req.params;
    if (!filename) {
      return res.status(400).json({ success: false, message: 'Filename is required' });
    }

    // Sanitize filename to avoid path traversal
    const safeFilename = path.basename(filename);
    const backupDir = path.join(__dirname, '..', 'backups');
    const filePath = path.join(backupDir, safeFilename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'Backup file not found' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    console.error('[PeriodClose] downloadBackup error:', error);
    return res.status(500).json({ success: false, message: 'Error downloading backup file' });
  }
};

/**
 * Returns history of all period close executions.
 */
exports.getCloseHistory = async (req, res) => {
  try {
    const history = await PeriodClose.find().sort({ executedAt: -1 }).lean();
    return res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    console.error('[PeriodClose] getCloseHistory error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch close history' });
  }
};
