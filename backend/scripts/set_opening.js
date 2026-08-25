const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const DailyCashOpening = require('../models/DailyCashOpening');
const { getCashBookForDate } = require('../utils/cashBookService');
const { startOfDay } = require('date-fns');

async function run() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 15000,
  });
  console.log('Connected.');

  const targetDate = startOfDay(new Date('2026-01-01'));

  // Update or set opening on 2026-01-01
  await DailyCashOpening.deleteMany({});
  const doc = await DailyCashOpening.create({
    bookDate: targetDate,
    openingBalance: 1393369,
    note: 'Opening balance as of 1st Jan 2026',
  });
  console.log('Created opening balance on 2026-01-01:', doc);

  // Check cash book on 2026-01-01
  const jan1 = await getCashBookForDate('2026-01-01');
  console.log('Cash book on 2026-01-01:', jan1);

  // Check cash book on 2026-05-23
  const may23 = await getCashBookForDate('2026-05-23');
  console.log('Cash book on 2026-05-23:', may23);

  process.exit(0);
}

run().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
