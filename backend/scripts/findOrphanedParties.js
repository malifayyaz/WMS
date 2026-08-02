/**
 * Read-only: list customerIds referenced by orders / jobwork / transactions /
 * annealing that no longer exist in the customers collection.
 * Usage: node scripts/findOrphanedParties.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const Order = require('../models/Order');
const JobWork = require('../models/JobWork');
const Transaction = require('../models/Transaction');
const AnnealingRecord = require('../models/AnnealingRecord');

function idKey(id) {
  return id ? String(id) : '';
}

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI missing in .env');
    process.exit(1);
  }

  await mongoose.connect(uri);

  const [orderIds, jobIds, txnIds, annIds, existingCustomers] = await Promise.all([
    Order.distinct('customerId'),
    JobWork.distinct('customerId'),
    Transaction.distinct('relatedId', { relatedTo: 'Customer' }),
    AnnealingRecord.distinct('partyId', { partyType: 'Customer' }),
    Customer.find({}).select('_id name').lean(),
  ]);

  const existing = new Set(existingCustomers.map((c) => idKey(c._id)));
  const candidateIds = new Set();
  [...orderIds, ...jobIds, ...txnIds, ...annIds].forEach((id) => {
    const key = idKey(id);
    if (key && !existing.has(key)) candidateIds.add(key);
  });

  if (candidateIds.size === 0) {
    console.log('No orphaned customer ids found. All referenced customers still exist.');
    await mongoose.disconnect();
    return;
  }

  console.log(`Found ${candidateIds.size} orphaned customer id(s):\n`);

  for (const orphanId of candidateIds) {
    const oid = new mongoose.Types.ObjectId(orphanId);
    const [orders, jobs, txns, anns] = await Promise.all([
      Order.find({ customerId: oid }).select('totalAmount customerName').lean(),
      JobWork.find({ customerId: oid }).select('labourTotal customerName').lean(),
      Transaction.find({ relatedTo: 'Customer', relatedId: oid }).select('amount relatedName').lean(),
      AnnealingRecord.find({ partyType: 'Customer', partyId: oid }).select('partyName weightKg').lean(),
    ]);

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
    const name = ranked[0]?.[0] || '(unknown name)';
    const variants = ranked.slice(1).map(([n, count]) => `"${n}" x${count}`);

    const orderTotal = orders.reduce((s, o) => s + (o.totalAmount || 0), 0);
    const jobTotal = jobs.reduce((s, j) => s + (j.labourTotal || 0), 0);
    const txnTotal = txns.reduce((s, t) => s + (t.amount || 0), 0);

    console.log('---');
    console.log(`  _id:            ${orphanId}`);
    console.log(`  name:           ${name}`);
    if (variants.length) console.log(`  other spellings: ${variants.join(', ')}`);
    console.log(`  orders:         ${orders.length}  (total Rs. ${orderTotal.toFixed(2)})`);
    console.log(`  jobWorks:       ${jobs.length}  (labour Rs. ${jobTotal.toFixed(2)})`);
    console.log(`  transactions:   ${txns.length}  (amount Rs. ${txnTotal.toFixed(2)})`);
    console.log(`  annealing:      ${anns.length}`);
    console.log(`  restore with:   node scripts/restoreCustomer.js ${orphanId}`);
  }

  console.log('\nDone (read-only — nothing was written).');
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
