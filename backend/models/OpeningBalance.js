const mongoose = require('mongoose');

const OPENING_SECTIONS = [
  'Cash',
  'Bank',
  'ShipletCoil',
  'PatriCoil',
  'Annealing',
  'ProcessingCustomer',
  'Customer',
  'Supplier',
  'ReadyStock',
  'Cheque',
  'PersonalPayment',
];

const openingBalanceSchema = new mongoose.Schema(
  {
    periodCloseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PeriodClose',
    },
    section: {
      type: String,
      enum: OPENING_SECTIONS,
      required: true,
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    referenceName: {
      type: String,
      trim: true,
    },

    // For Cash:
    cashAmount: {
      type: Number,
      default: 0,
    },

    // For Bank:
    bankAccount: {
      type: String,
      trim: true,
    },
    bankAmount: {
      type: Number,
      default: 0,
    },

    // For ShipletCoil and PatriCoil (individual lots):
    coilCategory: {
      type: String,
      trim: true,
    },
    weightKg: {
      type: Number,
      default: 0,
    },
    ratePerKg: {
      type: Number,
      default: 0,
    },
    totalValue: {
      type: Number,
      default: 0,
    },
    bundles: {
      type: Number,
      default: 0,
    },
    supplierName: {
      type: String,
      trim: true,
    },

    // For Annealing:
    annealingCoilType: {
      type: String,
      trim: true,
    },
    annealingWeightKg: {
      type: Number,
      default: 0,
    },
    annealingBundles: {
      type: Number,
      default: 0,
    },

    // For ProcessingCustomer:
    processingWeightKg: {
      type: Number,
      default: 0,
    },
    processingAmountDue: {
      type: Number,
      default: 0,
    },

    // For Customer and Supplier:
    balanceAmount: {
      type: Number,
      default: 0,
    },
    balanceType: {
      type: String,
      enum: ['debit', 'credit', 'none'],
      default: 'none',
    },

    // For ReadyStock (finished wire):
    wireNumber: {
      type: Number,
      min: 1,
      max: 20,
    },
    wireWeightKg: {
      type: Number,
      default: 0,
    },
    wireRatePerKg: {
      type: Number,
      default: 0,
    },

    // For Cheque:
    chequeNumber: {
      type: String,
      trim: true,
    },
    chequeAmount: {
      type: Number,
      default: 0,
    },
    chequePartyName: {
      type: String,
      trim: true,
    },
    chequeType: {
      type: String,
      enum: ['Receivable', 'Payable'],
    },
    chequeBankName: {
      type: String,
      trim: true,
    },
    chequeDueDate: {
      type: Date,
    },

    // For PersonalPayment:
    personalCategoryName: {
      type: String,
      trim: true,
    },
    personalAmountContributed: {
      type: Number,
      default: 0,
    },
    personalExpectedLumpSum: {
      type: Number,
      default: 0,
    },

    isApplied: {
      type: Boolean,
      default: false,
    },
    appliedAt: {
      type: Date,
    },
    appliedDocumentId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    createdBy: {
      type: String,
    },
  },
  { timestamps: true }
);

openingBalanceSchema.pre('save', function (next) {
  if (this.weightKg != null && this.ratePerKg != null && this.weightKg > 0 && this.ratePerKg > 0) {
    this.totalValue = this.weightKg * this.ratePerKg;
  }
  next();
});

openingBalanceSchema.index({ section: 1 });
openingBalanceSchema.index({ periodCloseId: 1 });
openingBalanceSchema.index({ referenceId: 1 });
openingBalanceSchema.index({ isApplied: 1 });

module.exports = mongoose.model('OpeningBalance', openingBalanceSchema);
module.exports.OPENING_SECTIONS = OPENING_SECTIONS;
