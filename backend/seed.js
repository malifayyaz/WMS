require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const users = [
  { name: 'Dad', username: 'dad', password: 'factory123' },
  { name: 'Uncle', username: 'uncle', password: 'factory123' },
  { name: 'Admin', username: 'admin', password: 'factory123' },
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
    console.log('Seed completed. Created users: dad, uncle, admin (password: factory123)');
  } catch (err) {
    console.error('Seed error:', err);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
};

seed();
