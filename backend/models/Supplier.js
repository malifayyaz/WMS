const mongoose = require('mongoose');

const supplierSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    contactNumber: String,
    companyName: String,
    address: String,
    materialTypes: [String],
    totalAmountPaid: { type: Number, default: 0 },
    totalAmountDue: { type: Number, default: 0 },
    totalAmountPurchased: { type: Number, default: 0 },
    openingBalance: { type: Number, default: 0 },
    openingBalanceDate: Date,
    openingBalanceType: { type: String, enum: ['debit', 'credit', 'none'], default: 'none' },
    /** Linked Processing Customer when same person also gives coil for job work */
    linkedCustomerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  },
  { timestamps: true }
);

supplierSchema.index({ linkedCustomerId: 1 });

module.exports = mongoose.model('Supplier', supplierSchema);
