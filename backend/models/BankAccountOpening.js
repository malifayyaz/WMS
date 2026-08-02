const mongoose = require('mongoose');

/**
 * Dated opening balance for a bank account.
 * Transactions are never rewritten — balances after asOfDate =
 * openingBalance + Σ Bank Transfer deltas on/after asOfDate.
 */
const bankAccountOpeningSchema = new mongoose.Schema(
  {
    bankAccount: {
      type: String,
      enum: ['MBL', 'UBL', 'Faisal Bank', 'Other'],
      required: true,
    },
    /** Required identity when bankAccount is Other */
    bankAccountOtherName: { type: String, default: '' },
    openingBalance: { type: Number, required: true, default: 0 },
    asOfDate: { type: Date, required: true },
    note: String,
  },
  { timestamps: true }
);

bankAccountOpeningSchema.index(
  { bankAccount: 1, bankAccountOtherName: 1 },
  { unique: true }
);

module.exports = mongoose.model('BankAccountOpening', bankAccountOpeningSchema);
