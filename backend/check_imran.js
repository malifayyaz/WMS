require('dotenv').config();
const mongoose = require('mongoose');
const JobWork = require('./models/JobWork');

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const jobs = await JobWork.find({ customerName: /imran/i }).sort({ arrivalDate: 1 });
  console.log(`Found ${jobs.length} records for Imran`);
  
  let totalArrived = 0, totalDelivered = 0, totalReturned = 0;
  jobs.forEach(j => {
    const retKg = (j.returns || []).reduce((s, r) => s + (r.weightKg || 0), 0);
    totalArrived += j.arrivedWeightKg || 0;
    totalDelivered += j.deliveredWeightKg || 0;
    totalReturned += retKg;
    console.log(`  Lot ${j._id}: arrived=${j.arrivedWeightKg}, delivered=${j.deliveredWeightKg}, returnedWeightKg field=${j.returnedWeightKg}, returns array total=${retKg}, returns count=${(j.returns||[]).length}, status=${j.status}`);
    (j.returns || []).forEach((r, i) => {
      console.log(`    Return #${i}: ${r.weightKg} kg on ${r.returnDate}`);
    });
  });
  
  console.log(`\nTotals: arrived=${totalArrived}, delivered=${totalDelivered}, returned=${totalReturned}`);
  console.log(`Pool (arrived-delivered): ${totalArrived - totalDelivered}`);
  console.log(`Pool (arrived-delivered-returned): ${totalArrived - totalDelivered - totalReturned}`);
  
  await mongoose.disconnect();
}
check().catch(e => { console.error(e); process.exit(1); });
