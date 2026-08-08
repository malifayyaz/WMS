require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

/**
 * Seed initial users. Passwords come from env (never hardcode secrets in source).
 *
 * Optional env:
 *   SEED_ADMIN_PASSWORD  (default: change-me-admin)
 *   SEED_VIEWER_PASSWORD (default: change-me-viewer)
 */
const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'change-me-admin';
const viewerPassword = process.env.SEED_VIEWER_PASSWORD || 'change-me-viewer';

const users = [
  { name: 'Admin', username: 'admin', password: adminPassword, role: 'admin' },
  { name: 'Dad', username: 'dad', password: adminPassword, role: 'admin' },
  { name: 'Uncle', username: 'uncle', password: adminPassword, role: 'admin' },
  { name: 'Viewer', username: 'viewer', password: viewerPassword, role: 'viewer' },
];

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const existing = await User.countDocuments();
    if (existing > 0) {
      console.log('Users already exist. Skipping seed.');
      process.exit(0);
      return;
    }
    await User.create(users);
    console.log('Seed completed. Created users: admin, dad, uncle, viewer.');
    console.log('Passwords were taken from SEED_ADMIN_PASSWORD / SEED_VIEWER_PASSWORD (or defaults). Change them after first login.');
  } catch (err) {
    console.error('Seed error:', err);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
};

seed();
