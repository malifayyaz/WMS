const mongoose = require('mongoose');
const { CONSUMPTION_MATERIAL_TYPES } = require('../utils/wireConfig');

const consumptionMaterialSchema = new mongoose.Schema(
  {
    materialType: { type: String, enum: CONSUMPTION_MATERIAL_TYPES, required: true },
    quantity: { type: Number, required: true },
    unit: { type: String, default: 'kg' },
    // For some materials (e.g., Dye), user may only know total purchase cost.
    // We compute costPerUnit from totalCost / quantity in the controller.
    costPerUnit: { type: Number, required: false },
    totalCost: Number,
    currentQuantity: Number,
    purchaseDate: { type: Date, default: Date.now },
    notes: String,
  },
  { timestamps: true }
);

consumptionMaterialSchema.index({ materialType: 1 });
consumptionMaterialSchema.index({ purchaseDate: -1 });

module.exports = mongoose.model('ConsumptionMaterial', consumptionMaterialSchema);
