const mongoose = require('mongoose');

const workerLedgerEntrySchema = new mongoose.Schema(
  {
    workerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', required: true },
    entryType: {
      type: String,
      enum: ['SalaryDue', 'Payment', 'Advance', 'Adjustment'],
      required: true,
    },
    amount: { type: Number, required: true },
    date: { type: Date, default: Date.now },
    paymentMethod: { type: String, enum: ['Cash', 'Bank Transfer', 'Cheque'] },
    notes: String,
    addedBy: String,
    expenseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Expense' },
  },
  { timestamps: true }
);

workerLedgerEntrySchema.index({ workerId: 1, date: -1 });

module.exports = mongoose.model('WorkerLedgerEntry', workerLedgerEntrySchema);
