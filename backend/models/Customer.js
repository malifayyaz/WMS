const mongoose = require('mongoose');

const paymentHistorySchema = new mongoose.Schema({
  date: Date,
  amount: Number,
  paymentMethod: String,
  receivedBy: String,
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  note: String,
});

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    contactNumber: String,
    address: String,
    totalOrders: { type: Number, default: 0 },
    totalAmountPurchased: { type: Number, default: 0 },
    totalAmountPaid: { type: Number, default: 0 },
    totalAmountDue: { type: Number, default: 0 },
    openingBalance: { type: Number, default: 0 },
    openingBalanceDate: Date,
    openingBalanceType: { type: String, enum: ['debit', 'credit', 'none'], default: 'none' },
    customerType: { type: String, enum: ['Ledger', 'Daily', 'Processing'], default: 'Ledger' },
    /** Linked Supplier when same person is also a coil supplier */
    linkedSupplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
    paymentHistory: [paymentHistorySchema],
  },
  { timestamps: true }
);

customerSchema.index({ name: 1 });
customerSchema.index({ linkedSupplierId: 1 });

module.exports = mongoose.model('Customer', customerSchema);
