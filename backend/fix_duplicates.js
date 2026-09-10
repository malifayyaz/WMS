const mongoose = require('mongoose');
require('dotenv').config({ path: 'd:/Ali Fayaz Projects/WMS/backend/.env' });

async function fixDuplicateReturns() {
  const uri = process.env.MONGODB_URI.replace('wire-manufacturing', 'test');
  await mongoose.connect(uri);
  
  // We MUST use the Mongoose Model so that pre('save') hooks trigger!
  // BUT the model is connected to the default connection. 
  // Let's create a connection to the specific URI.
  const conn = mongoose.createConnection(uri);
  const JobWorkSchema = require('d:/Ali Fayaz Projects/WMS/backend/models/JobWork').schema;
  const JobWork = conn.model('JobWork', JobWorkSchema);
  
  const jobId = '6aa158d42ff6c3036122b2a5';
  const j = await JobWork.findById(jobId);
  
  if (j && j.returns && j.returns.length > 1) {
      console.log(`Found ${j.returns.length} returns. Keeping only the first one.`);
      j.returns = [ j.returns[0] ]; // Keep only the first return
      
      // Update returnedWeightKg
      j.returnedWeightKg = j.returns[0].weightKg;
      
      // Trigger save so hooks run
      await j.save();
      console.log(`Saved JobWork ${jobId}. returnedWeightKg is now ${j.returnedWeightKg}`);
  } else {
      console.log('No duplicates found or job not found.');
  }
  
  await conn.close();
  await mongoose.disconnect();
}

fixDuplicateReturns().catch(console.error);
