const mongoose = require('mongoose');

const dailyCashOpeningSchema = new mongoose.Schema(
  {
    bookDate: { type: Date, required: true, unique: true },
    openingBalance: { type: Number, required: true },
    note: String,
  },
  { timestamps: true }
);

dailyCashOpeningSchema.index({ bookDate: 1 });

module.exports = mongoose.model('DailyCashOpening', dailyCashOpeningSchema);
