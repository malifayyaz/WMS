const mongoose = require('mongoose');

const paymentHistoryEntrySchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  paymentDate: { type: Date, default: Date.now },
  paymentMethod: {
    type: String,
    enum: ['Cash', 'Bank Transfer', 'Cheque'],
    default: 'Cash',
  },
  paidBy: String,
  note: String,
  createdAt: { type: Date, default: Date.now },
});

const annealingPersonSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    contactNumber: String,
    totalAmountPaid: { type: Number, default: 0 },
    totalAmountDue: { type: Number, default: 0 },
    openingBalance: { type: Number, default: 0 },
    openingBalanceDate: Date,
    openingBalanceType: { type: String, enum: ['debit', 'credit', 'none'], default: 'none' },
    paymentHistory: [paymentHistoryEntrySchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model('AnnealingPerson', annealingPersonSchema);
