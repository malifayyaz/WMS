/**
 * JSON backup of the local wire-manufacturing database.
 * Use when mongodump is not installed.
 * Usage: node scripts/backupDb.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI missing in .env');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.join(__dirname, '..', '_db_backup', stamp);
  fs.mkdirSync(outDir, { recursive: true });

  const collections = await db.listCollections().toArray();
  console.log(`Backing up ${collections.length} collections → ${outDir}`);

  for (const { name } of collections) {
    const docs = await db.collection(name).find({}).toArray();
    const file = path.join(outDir, `${name}.json`);
    fs.writeFileSync(file, JSON.stringify(docs, null, 2));
    console.log(`  ${name}: ${docs.length} docs`);
  }

  console.log('Backup complete.');
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
