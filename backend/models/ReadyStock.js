const mongoose = require('mongoose');

const readyStockSchema = new mongoose.Schema(
  {
    wireNumber: { type: Number, required: true, min: 1, max: 20 },
    wireLabel: String,
    coilCategory: String,
    weightKg: { type: Number, required: true },
    bundles: { type: Number, default: 0 },
    productionDate: { type: Date, default: Date.now },
    source: {
      type: String,
      enum: ['Direct Production', 'Order Surplus', 'Customer Return'],
      default: 'Direct Production',
    },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    notes: String,
    producedWeightKg: Number,
    remainingStockKg: Number,
    manufacturingCostPerKg: Number,
    status: { type: String, default: 'In Stock' },
    isOpeningBalance: { type: Boolean, default: false },
  },
  { timestamps: true }
);

readyStockSchema.index({ wireNumber: 1 });
readyStockSchema.index({ productionDate: -1 });

module.exports = mongoose.model('ReadyStock', readyStockSchema);
