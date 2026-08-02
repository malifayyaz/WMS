const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    customerName: String,
    wireNumber: { type: Number, min: 1, max: 20 },
    wireType: { type: String, required: true },
    wireSize: String,
    coilCategory: String,
    initialWeightKg: { type: Number, required: true },
    finalWeightKg: Number,
    ratePerKg: { type: Number, required: true },
    manufacturingCostPerKg: Number,
    totalAmount: Number,
    amountPaid: { type: Number, default: 0 },
    amountDue: Number,
    paymentMethod: { type: String, enum: ['Cash', 'Bank Transfer', 'Cheque'] },
    orderStatus: { type: String, enum: ['Outer', 'In Process', 'Done'], default: 'Outer' },
    stockDeductedKg: { type: Number, default: 0 },
    stockPendingKg: { type: Number, default: 0 },
    lowStockAlert: { type: Boolean, default: false },
    soldBy: String,
    orderDate: { type: Date, default: Date.now },
    heatingStartDate: Date,
    heatingEndDate: Date,
    deliveryDate: Date,
    weightChangeNote: String,
    notes: String,
    /** Bundle count (metadata; billing uses weight) */
    bundles: { type: Number, default: 0 },
    /** Optional link to annealing (annealed wire sold to customer) */
    isAnnealed: { type: Boolean, default: false },
    annealingRecordId: { type: mongoose.Schema.Types.ObjectId, ref: 'AnnealingRecord' },
    /** Defect return — reverses receivable and restores ReadyStock */
    isReturn: { type: Boolean, default: false },
    returnOfOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  },
  { timestamps: true }
);

orderSchema.index({ customerId: 1 });
orderSchema.index({ orderStatus: 1 });
orderSchema.index({ orderDate: -1 });
orderSchema.index({ wireNumber: 1 });

module.exports = mongoose.model('Order', orderSchema);
