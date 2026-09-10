require('dotenv').config({ path: 'd:/Ali Fayaz Projects/WMS/backend/.env' });
const mongoose = require('mongoose');

async function searchDB() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const JobWork = require('./models/JobWork');
  const all = await JobWork.find({});
  
  let found = false;
  all.forEach(j => {
      const jstr = JSON.stringify(j);
      if (jstr.toLowerCase().includes('imran')) {
          console.log('Found Imran in JobWork:', j._id, j.customerName, j.customerId);
          found = true;
      }
      if (jstr.includes('36852') || jstr.includes('14000') || jstr.includes('8552')) {
          console.log('Found number match in JobWork:', j._id);
          found = true;
      }
  });
  if (!found) console.log('Found absolutely nothing matching imran or the numbers in JobWork.');
  
  mongoose.disconnect();
}

searchDB().catch(console.error);
