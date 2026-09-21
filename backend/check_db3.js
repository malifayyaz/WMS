require('dotenv').config({ path: 'd:/Ali Fayaz Projects/wms/backend/.env' });
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const RawMaterial = require('d:/Ali Fayaz Projects/wms/backend/models/RawMaterial');
  const r = await RawMaterial.find({ purchaseDate: { $lte: new Date('2026-05-28') }});
  console.log('Opening balances:', r.filter(x => x.isOpeningBalance).map(x => ({c:x.coilCategory, w:x.weightInKg})));
  
  const old = r.filter(x => !x.isOpeningBalance && x.purchaseDate < new Date('2026-05-27')).reduce((a, b) => a + (b.weightInKg||0), 0);
  console.log('Old raw weight:', old);
  
  const Order = require('d:/Ali Fayaz Projects/wms/backend/models/Order');
  const o = await Order.find({ orderDate: { $lt: new Date('2026-05-27') }});
  const sold = o.reduce((a, b) => a + (b.finalWeightKg || b.initialWeightKg || 0), 0);
  console.log('Old sold weight:', sold);
  
  const JobWork = require('d:/Ali Fayaz Projects/wms/backend/models/JobWork');
  const jw = await JobWork.find();
  console.log('JobWork opening weights:', jw.map(x => ({ date: x.arrivalDate, w: x.arrivedWeightKg })));
  
  process.exit(0);
});
