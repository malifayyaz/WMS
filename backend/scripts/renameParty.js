/**
 * Rename a customer and normalize the denormalized name copies stored on
 * orders / jobworks / transactions / annealing records.
 *
 * Usage: node scripts/renameParty.js <customerId> "<correct name>"
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const Order = require('../models/Order');
const JobWork = require('../models/JobWork');
const Transaction = require('../models/Transaction');
const AnnealingRecord = require('../models/AnnealingRecord');

async function run() {
  const [customerId, newName] = process.argv.slice(2);
  if (!customerId || !mongoose.Types.ObjectId.isValid(customerId) || !newName) {
    console.error('Usage: node scripts/renameParty.js <customerId> "<correct name>"');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const customer = await Customer.findById(customerId);
  if (!customer) {
    console.error(`No customer found with id ${customerId}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const oldName = customer.name;
  customer.name = newName;
  await customer.save();

  const [orders, jobs, txns, anns] = await Promise.all([
    Order.updateMany({ customerId, customerName: { $ne: newName } }, { $set: { customerName: newName } }),
    JobWork.updateMany({ customerId, customerName: { $ne: newName } }, { $set: { customerName: newName } }),
    Transaction.updateMany(
      { relatedTo: 'Customer', relatedId: customerId, relatedName: { $ne: newName } },
      { $set: { relatedName: newName } }
    ),
    AnnealingRecord.updateMany(
      { partyType: 'Customer', partyId: customerId, partyName: { $ne: newName } },
      { $set: { partyName: newName } }
    ),
  ]);

  console.log(`Renamed "${oldName}" -> "${newName}"`);
  console.log(`  orders renamed:        ${orders.modifiedCount}`);
  console.log(`  jobworks renamed:      ${jobs.modifiedCount}`);
  console.log(`  transactions renamed:  ${txns.modifiedCount}`);
  console.log(`  annealing renamed:     ${anns.modifiedCount}`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
