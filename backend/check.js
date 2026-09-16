const mongoose = require('mongoose');
require('dotenv').config({ path: 'd:/Ali Fayaz Projects/wms/backend/.env' });

async function check() {
  await mongoose.connect(process.env.MONGO_URI);
  const JobWork = require('d:/Ali Fayaz Projects/wms/backend/models/JobWork');
  const lots = await JobWork.find({});
  const withExcess = lots.filter(l => l.excessDeliveries && l.excessDeliveries.length > 0);
  console.log('Found:', withExcess.length);
  withExcess.forEach(j => console.log(j._id, j.customerName, j.excessDeliveries.length, JSON.stringify(j.excessDeliveries, null, 2)));
  process.exit(0);
}

check().catch(console.error);
