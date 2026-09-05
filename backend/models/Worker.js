const mongoose = require('mongoose');

const workerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: String,
    role: String,
    active: { type: Boolean, default: true },
    openingBalance: { type: Number, default: 0 },
    totalSalaryPaid: { type: Number, default: 0 },
    totalAdvance: { type: Number, default: 0 },
    notes: String,
  },
  { timestamps: true }
);

workerSchema.index({ name: 1 });

module.exports = mongoose.model('Worker', workerSchema);
