const mongoose = require('mongoose');

const cashBreakdownLineSchema = new mongoose.Schema(
  {
    holder: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const dailyCashBreakdownSchema = new mongoose.Schema(
  {
    bookDate: { type: Date, required: true, unique: true },
    lines: { type: [cashBreakdownLineSchema], default: [] },
    note: String,
  },
  { timestamps: true }
);

dailyCashBreakdownSchema.index({ bookDate: 1 });

module.exports = mongoose.model('DailyCashBreakdown', dailyCashBreakdownSchema);
