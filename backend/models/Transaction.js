const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    transactionType: { type: String, enum: ['Money In', 'Money Out'], required: true },
    amount: { type: Number, required: true },
    paymentMethod: { type: String, enum: ['Cash', 'Bank Transfer', 'Cheque'], required: true },
    relatedTo: { type: String, enum: ['Customer', 'Supplier', 'Other'] },
    relatedId: mongoose.Schema.Types.ObjectId,
    relatedName: String,
    description: String,
    handledBy: String,
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    sourceType: {
      type: String,
      enum: ['Expense', 'Order', 'RawMaterial', 'ConsumptionMaterial', 'Manual'],
    },
    sourceId: mongoose.Schema.Types.ObjectId,
    expenseGroup: String,
    expenseCategory: String,
    /** Expense record created from this bank transfer (factory/self expense tracking) */
    linkedExpenseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Expense' },
    /** Paired transaction (e.g. ATM bank out ↔ cash in) */
    linkedTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
    /** Which bank account this transfer belongs to */
    bankAccount: { type: String, enum: ['MBL', 'UBL', 'Faisal Bank', 'Other'], default: 'MBL' },
    /** Custom bank name when bankAccount is 'Other' */
    bankAccountOtherName: String,
    bankAccountNumber: String,
    /** Cheque tracking fields */
    chequeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cheque' },
    chequeNumber: String,
    chequeType: { type: String, enum: ['Customer Cheque', 'Company Cheque', 'Personal Cheque'] },
    chequeBank: String,
    chequeDate: Date,
    isEndorsedCheque: { type: Boolean, default: false },
    sourceChequeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cheque' },
    /** Return / bounce cheque fields */
    isChequeReturned: { type: Boolean, default: false },
    chequeReturnDate: Date,
    chequeReturnReason: String,
    chequeReturnedBy: String,
    transactionDate: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

transactionSchema.index({ transactionDate: -1 });
transactionSchema.index({ sourceType: 1, sourceId: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);

