const mongoose = require('mongoose');
const { CONSUMPTION_MATERIAL_TYPES } = require('../utils/wireConfig');

const paymentHistoryEntrySchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  paymentDate: { type: Date, default: Date.now },
  paymentMethod: {
    type: String,
    enum: ['Cash', 'Bank Transfer', 'Cheque'],
    default: 'Cash',
  },
  paidBy: String,
  note: String,
  createdAt: { type: Date, default: Date.now },
});

const consumptionMaterialSchema = new mongoose.Schema(
  {
    materialType: { type: String, enum: CONSUMPTION_MATERIAL_TYPES, required: true },
    quantity: { type: Number, required: true },
    unit: { type: String, default: 'kg' },
    // For some materials (e.g., Dye), user may only know total purchase cost.
    // We compute costPerUnit from totalCost / quantity in the controller.
    costPerUnit: { type: Number, required: false },
    totalCost: Number,
    amountPaid: { type: Number, default: 0 },
    amountDue: { type: Number, default: 0 },
    paymentStatus: {
      type: String,
      enum: ['Paid', 'Partial', 'Unpaid'],
      default: 'Paid',
    },
    paymentHistory: [paymentHistoryEntrySchema],
    supplierName: { type: String },
    supplierContact: { type: String },
    currentQuantity: Number,
    purchaseDate: { type: Date, default: Date.now },
    notes: String,
  },
  { timestamps: true }
);

consumptionMaterialSchema.index({ materialType: 1 });
consumptionMaterialSchema.index({ purchaseDate: -1 });

module.exports = mongoose.model('ConsumptionMaterial', consumptionMaterialSchema);
