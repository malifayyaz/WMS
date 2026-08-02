const mongoose = require('mongoose');
const { EXPENSE_CATEGORIES, COIL_CATEGORIES, RENTAL_ROUTES } = require('../utils/wireConfig');

const expenseSchema = new mongoose.Schema(
  {
    expenseGroup: {
      type: String,
      default: 'Operations',
    },
    expenseCategory: {
      type: String,
      enum: EXPENSE_CATEGORIES,
      default: 'Miscellaneous',
    },
    expenseType: { type: String, enum: ['Salary', 'Bills', 'Maintenance', 'Manufacturing', 'Other'] },
    description: String,
    amount: { type: Number, required: true },
    paymentMethod: { type: String, enum: ['Cash', 'Bank Transfer', 'Cheque'] },
    expenseDate: { type: Date, default: Date.now },
    addedBy: String,
    labourName: String,
    coilType: { type: String, enum: [COIL_CATEGORIES.SHIPLET, COIL_CATEGORIES.PATRI] },
    rentalRoute: { type: String, enum: RENTAL_ROUTES },
    /** Set when this expense was created from a bank transfer — prevents double deduction */
    bankTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
  },
  { timestamps: true }
);

expenseSchema.index({ expenseDate: -1 });
expenseSchema.index({ expenseGroup: 1 });
expenseSchema.index({ expenseCategory: 1 });

module.exports = mongoose.model('Expense', expenseSchema);
