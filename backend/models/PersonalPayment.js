const mongoose = require('mongoose');

const personalPaymentEntrySchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  paymentDate: { type: Date, default: Date.now },
  paymentMethod: {
    type: String,
    enum: ['Cash', 'Bank Transfer', 'Cheque'],
    default: 'Cash',
  },
  chequeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cheque' },
  chequeNumber: String,
  chequeType: { type: String, enum: ['Customer Cheque', 'Company Cheque', 'Personal Cheque'] },
  chequeBank: String,
  chequeDate: Date,
  isEndorsedCheque: { type: Boolean, default: false },
  sourceChequeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cheque' },
  receivedFromName: String,
  bankName: String,
  paidBy: String,
  note: String,
});

const personalPaymentSchema = new mongoose.Schema(
  {
    categoryName: { type: String, required: true },
    paymentDirection: {
      type: String,
      enum: ['Receivable', 'Payable'],
      default: 'Receivable',
    },
    categoryType: {
      type: String,
      enum: ['Committee', 'Savings', 'Investment', 'Loan Taken', 'Loan Given', 'Other'],
      default: 'Committee',
    },
    personName: String,
    expectedLumpSum: { type: Number, required: true },
    expectedReceiveDate: Date,
    monthlyAmount: { type: Number, default: 0 },
    totalContributed: { type: Number, default: 0 },
    remainingToContribute: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['Active', 'Completed', 'Cancelled'],
      default: 'Active',
    },
    /** For Loan Taken / Payables: How the loan amount was received */
    receivedVia: {
      type: String,
      enum: ['Cash', 'Bank Transfer', 'Cheque', 'Other'],
      default: 'Cash',
    },
    receivedBankAccount: {
      type: String,
      enum: ['MBL', 'UBL', 'Faisal Bank', 'Other'],
      default: 'MBL',
    },
    receivedBankAccountOtherName: String,
    receivedChequeNumber: String,
    receivedChequeBank: String,
    receivedChequeDate: Date,
    recordInitialReceipt: { type: Boolean, default: false },
    initialTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
    payments: [personalPaymentEntrySchema],
    notes: String,
    createdBy: String,
  },
  { timestamps: true }
);

personalPaymentSchema.pre('save', function (next) {
  this.totalContributed = (this.payments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  this.remainingToContribute = Math.max(0, (Number(this.expectedLumpSum) || 0) - this.totalContributed);
  if (this.totalContributed >= this.expectedLumpSum && this.status === 'Active' && this.expectedLumpSum > 0) {
    this.status = 'Completed';
  }
  next();
});

module.exports = mongoose.model('PersonalPayment', personalPaymentSchema);
