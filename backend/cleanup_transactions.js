require('dotenv').config();
const mongoose = require('mongoose');

const Order = require('./models/Order');
const Transaction = require('./models/Transaction');
const Expense = require('./models/Expense');
const ConsumptionMaterial = require('./models/ConsumptionMaterial');
const RawMaterial = require('./models/RawMaterial');
const ReadyStock = require('./models/ReadyStock');
const AnnealingRecord = require('./models/AnnealingRecord');
const JobWork = require('./models/JobWork');
const WorkerLedgerEntry = require('./models/WorkerLedgerEntry');
const ActivityLog = require('./models/ActivityLog');
const PeriodClose = require('./models/PeriodClose');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB');

  const orders = await Order.deleteMany({});
  console.log(`Deleted ${orders.deletedCount} orders`);

  const txs = await Transaction.deleteMany({});
  console.log(`Deleted ${txs.deletedCount} transactions`);

  const exps = await Expense.deleteMany({});
  console.log(`Deleted ${exps.deletedCount} expenses`);

  const cons = await ConsumptionMaterial.deleteMany({});
  console.log(`Deleted ${cons.deletedCount} consumption materials`);

  // Only delete non-opening balances
  const raws = await RawMaterial.deleteMany({ isOpeningBalance: { $ne: true } });
  console.log(`Deleted ${raws.deletedCount} raw materials`);

  const readys = await ReadyStock.deleteMany({ isOpeningBalance: { $ne: true } });
  console.log(`Deleted ${readys.deletedCount} ready stocks`);

  const anns = await AnnealingRecord.deleteMany({});
  console.log(`Deleted ${anns.deletedCount} annealing records`);

  const jobs = await JobWork.deleteMany({});
  console.log(`Deleted ${jobs.deletedCount} job works`);

  const workers = await WorkerLedgerEntry.deleteMany({});
  console.log(`Deleted ${workers.deletedCount} worker ledger entries`);

  const logs = await ActivityLog.deleteMany({});
  console.log(`Deleted ${logs.deletedCount} activity logs`);

  const pcs = await PeriodClose.deleteMany({});
  console.log(`Deleted ${pcs.deletedCount} period close audits`);

  console.log('Cleanup complete. All opening balances on Suppliers/Customers have been preserved.');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
