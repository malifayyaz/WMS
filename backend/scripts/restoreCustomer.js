/**
 * Recreate a deleted Customer with the exact same _id so orphaned
 * orders / jobworks / transactions / annealing records reattach.
 *
 * Usage: node scripts/restoreCustomer.js <customerId>
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const Order = require('../models/Order');
const JobWork = require('../models/JobWork');
const Transaction = require('../models/Transaction');
const AnnealingRecord = require('../models/AnnealingRecord');
const { recalcCustomerTotals } = require('../utils/transactionSyncService');

async function run() {
  const orphanId = process.argv[2];
  if (!orphanId || !mongoose.Types.ObjectId.isValid(orphanId)) {
    console.error('Usage: node scripts/restoreCustomer.js <customerId>');
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI missing in .env');
    process.exit(1);
  }

  await mongoose.connect(uri);

  const existing = await Customer.findById(orphanId);
  if (existing) {
    console.error(`Customer already exists with id ${orphanId} (name: ${existing.name}). Aborting.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const oid = new mongoose.Types.ObjectId(orphanId);
  const [orders, jobs, txns, anns] = await Promise.all([
    Order.find({ customerId: oid }).select('customerName').lean(),
    JobWork.find({ customerId: oid }).select('customerName').lean(),
    Transaction.find({ relatedTo: 'Customer', relatedId: oid }).select('relatedName').lean(),
    AnnealingRecord.find({ partyType: 'Customer', partyId: oid }).select('partyName').lean(),
  ]);

  const jobCount = jobs.length;
  // Historic records can contain typo'd name variants; take the most frequent.
  const nameCounts = new Map();
  const tally = (value) => {
    const clean = (value || '').trim();
    if (!clean) return;
    nameCounts.set(clean, (nameCounts.get(clean) || 0) + 1);
  };
  orders.forEach((o) => tally(o.customerName));
  jobs.forEach((j) => tally(j.customerName));
  txns.forEach((t) => tally(t.relatedName));
  anns.forEach((a) => tally(a.partyName));

  const ranked = [...nameCounts.entries()].sort((a, b) => b[1] - a[1]);
  const name = ranked[0]?.[0] || null;

  if (ranked.length > 1) {
    console.log('Multiple name spellings found in the surviving records:');
    ranked.forEach(([n, count]) => console.log(`  "${n}" x${count}`));
    console.log(`Using "${name}". Correct it with scripts/renameParty.js if needed.\n`);
  }

  if (!name) {
    console.error(`No orphaned records found for id ${orphanId}. Nothing to restore.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const customerType = jobCount > 0 ? 'Processing' : 'Ledger';

  const customer = await Customer.create({
    _id: oid,
    name,
    customerType,
    openingBalance: 0,
    openingBalanceType: 'none',
    contactNumber: '',
    address: '',
    paymentHistory: [],
  });

  await recalcCustomerTotals(customer._id);
  const refreshed = await Customer.findById(customer._id).lean();

  console.log('Customer restored successfully:');
  console.log(`  _id:              ${refreshed._id}`);
  console.log(`  name:             ${refreshed.name}`);
  console.log(`  customerType:     ${refreshed.customerType}`);
  console.log(`  totalPurchased:   ${refreshed.totalAmountPurchased}`);
  console.log(`  totalPaid:        ${refreshed.totalAmountPaid}`);
  console.log(`  totalDue:         ${refreshed.totalAmountDue}`);
  console.log(`  totalOrders:      ${refreshed.totalOrders}`);
  console.log('');
  console.log('Next: open Customers / Daily Book ledger and confirm history.');
  console.log('Then re-enter contact, address, opening balance, and supplier link if needed.');

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
