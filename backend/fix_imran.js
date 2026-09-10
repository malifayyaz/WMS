require('dotenv').config({ path: 'd:/Ali Fayaz Projects/WMS/backend/.env' });
const mongoose = require('mongoose');

async function checkPools() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const JobWork = require('./models/JobWork');
  const all = await JobWork.find({}).sort({ arrivalDate: 1, createdAt: 1 });
  
  const map = new Map();
  all.forEach((j) => {
    const key = String(j.customerId);
    if (!map.has(key)) {
      map.set(key, {
        customerId: key,
        customerName: j.customerName,
        totalArrivedKg: 0,
        totalDeliveredKg: 0,
        remainingKg: 0,
        totalReturnedKg: 0,
        lots: 0,
      });
    }
    const pool = map.get(key);
    const returned = j.returnedWeightKg || 0;
    const remaining = Math.max(0, (j.arrivedWeightKg || 0) - (j.deliveredWeightKg || 0) - returned);
    pool.totalArrivedKg += j.arrivedWeightKg || 0;
    pool.totalDeliveredKg += j.deliveredWeightKg || 0;
    pool.totalReturnedKg += returned;
    pool.remainingKg = pool.totalArrivedKg - pool.totalDeliveredKg - pool.totalReturnedKg;
    pool.lots += 1;
  });
  
  const data = Array.from(map.values());
  data.forEach(p => {
      console.log(`Pool ${p.customerName || p.customerId}: Arrived=${p.totalArrivedKg}, Delivered=${p.totalDeliveredKg}, Returned=${p.totalReturnedKg}, Remaining=${p.remainingKg}`);
  });
  
  mongoose.disconnect();
}

checkPools().catch(console.error);
