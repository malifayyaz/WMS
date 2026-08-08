const mongoose = require('mongoose');

const ACTIVITY_ACTIONS = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'LOGIN',
  'LOGOUT',
  'RESET_PASSWORD',
];

const ACTIVITY_MODULES = [
  'Order',
  'Customer',
  'Supplier',
  'Transaction',
  'Expense',
  'RawMaterial',
  'ReadyStock',
  'Worker',
  'User',
  'Auth',
  'AnnealingRecord',
  'JobWork',
  'Consumable',
];

const activityLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userName: { type: String, default: 'System' },
  userRole: { type: String, default: 'system' },
  action: { type: String, enum: ACTIVITY_ACTIONS, required: true },
  module: { type: String, enum: ACTIVITY_MODULES, required: true },
  description: { type: String, required: true },
  documentId: String,
  previousValue: { type: mongoose.Schema.Types.Mixed },
  newValue: { type: mongoose.Schema.Types.Mixed },
  ipAddress: String,
  createdAt: { type: Date, default: Date.now },
});

activityLogSchema.index({ createdAt: -1 });
activityLogSchema.index({ userId: 1 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
module.exports.ACTIVITY_ACTIONS = ACTIVITY_ACTIONS;
module.exports.ACTIVITY_MODULES = ACTIVITY_MODULES;
