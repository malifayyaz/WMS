const mongoose = require('mongoose');

const personalPaymentEntrySchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  paymentDate: { type: Date, default: Date.now },
  paymentMethod: {
    type: String,
    enum: ['Cash', 'Bank Transfer', 'Cheque'],
    default: 'Cash',
  },
  chequeNumber: String,
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
