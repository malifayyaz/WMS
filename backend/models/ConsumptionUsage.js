const mongoose = require('mongoose');
const { CONSUMPTION_MATERIAL_TYPES } = require('../utils/wireConfig');

const consumptionUsageSchema = new mongoose.Schema(
  {
    materialType: { type: String, enum: CONSUMPTION_MATERIAL_TYPES, required: true },
    quantityUsed: { type: Number, required: true },
    unit: { type: String, default: 'kg' },
    costAtUsage: Number,
    usageDate: { type: Date, default: Date.now },
    notes: String,
    materialId: { type: mongoose.Schema.Types.ObjectId, ref: 'ConsumptionMaterial' },
  },
  { timestamps: true }
);

consumptionUsageSchema.index({ usageDate: -1 });
consumptionUsageSchema.index({ materialType: 1 });

module.exports = mongoose.model('ConsumptionUsage', consumptionUsageSchema);
