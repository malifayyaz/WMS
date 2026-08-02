/**
 * Backfill deliveryGroupId on historical pool-split JobWork deliveries.
 *
 * Heuristic: same customer + same deliveredDate (ISO) + same labour rate
 * + same wire number + same coil rate across 2+ lots → one group.
 *
 * Usage: node scripts/backfillDeliveryGroups.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const JobWork = require('../models/JobWork');

function fragmentKey(customerId, d) {
  const dateKey = d.deliveredDate ? new Date(d.deliveredDate).toISOString() : '';
  return [
    String(customerId),
    dateKey,
    Number(d.labourRatePerKg) || 0,
    d.wireNumber == null ? '' : Number(d.wireNumber),
    Number(d.coilRatePerKg) || 0,
  ].join('|');
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const lots = await JobWork.find({ 'deliveries.0': { $exists: true } }).sort({ arrivalDate: 1, createdAt: 1 });

  const buckets = new Map();
  lots.forEach((lot) => {
    (lot.deliveries || []).forEach((d) => {
      if (d.deliveryGroupId) return;
      const key = fragmentKey(lot.customerId, d);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push({ lot, delivery: d });
    });
  });

  const dirtyLots = new Set();
  let groupsCreated = 0;
  let fragmentsTagged = 0;
  let singlesTagged = 0;

  for (const [, parts] of buckets) {
    if (parts.length >= 2) {
      const groupId = new mongoose.Types.ObjectId();
      parts.sort(
        (a, b) => new Date(a.lot.arrivalDate) - new Date(b.lot.arrivalDate)
          || new Date(a.lot.createdAt) - new Date(b.lot.createdAt)
      );
      let bundleSum = 0;
      parts.forEach(({ delivery }) => {
        bundleSum += delivery.bundles || 0;
      });
      parts.forEach(({ lot, delivery }, i) => {
        delivery.deliveryGroupId = groupId;
        delivery.isGroupPrimary = i === 0;
        delivery.bundles = i === 0 ? bundleSum : 0;
        dirtyLots.add(lot);
        fragmentsTagged += 1;
      });
      groupsCreated += 1;
    } else if (parts.length === 1) {
      const { lot, delivery } = parts[0];
      delivery.deliveryGroupId = delivery._id || new mongoose.Types.ObjectId();
      delivery.isGroupPrimary = true;
      dirtyLots.add(lot);
      singlesTagged += 1;
    }
  }

  for (const lot of dirtyLots) {
    await lot.save();
  }

  // Tag any still-missing (edge cases)
  const leftover = await JobWork.find({
    deliveries: { $elemMatch: { deliveryGroupId: { $exists: false } } },
  });
  for (const lot of leftover) {
    let changed = false;
    (lot.deliveries || []).forEach((d) => {
      if (!d.deliveryGroupId) {
        d.deliveryGroupId = d._id || new mongoose.Types.ObjectId();
        d.isGroupPrimary = true;
        changed = true;
        singlesTagged += 1;
      }
    });
    if (changed) await lot.save();
  }

  console.log('Backfill complete.');
  console.log(`  Pool-split groups created: ${groupsCreated}`);
  console.log(`  Fragments tagged in groups: ${fragmentsTagged}`);
  console.log(`  Single deliveries tagged:   ${singlesTagged}`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
