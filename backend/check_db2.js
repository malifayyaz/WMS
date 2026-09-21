require('dotenv').config({ path: 'd:/Ali Fayaz Projects/wms/backend/.env' });
const mongoose = require('mongoose');
const RawMaterial = require('d:/Ali Fayaz Projects/wms/backend/models/RawMaterial');
const Order = require('d:/Ali Fayaz Projects/wms/backend/models/Order');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const r = await RawMaterial.find({ purchaseDate: { $lte: new Date('2026-05-28') }});
  console.log('Opening balance weights:', r.filter(x => x.isOpeningBalance).map(x => x.weightInKg));
  const old = r.filter(x => !x.isOpeningBalance && x.purchaseDate < new Date('2026-05-27')).reduce((a, b) => a + (b.weightInKg||0), 0);
  console.log('Old weight: ', old);
  
  const o = await Order.find({ orderDate: { $lt: new Date('2026-05-27') }});
  const sold = o.reduce((a, b) => a + (b.finalWeightKg || b.initialWeightKg || 0), 0);
  console.log('Old sold weight:', sold);
  
  process.exit(0);
});
