const mongoose = require('mongoose');
const { COIL_CATEGORIES } = require('../utils/wireConfig');

const rawMaterialSchema = new mongoose.Schema(
  {
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
    supplierName: String,
    coilCategory: {
      type: String,
      enum: [COIL_CATEGORIES.SHIPLET, COIL_CATEGORIES.PATRI],
      default: COIL_CATEGORIES.SHIPLET,
    },
    materialType: { type: String, required: true },
    weightInKg: { type: Number, required: true },
    ratePerKg: { type: Number, required: true },
    totalAmount: Number,
    amountPaid: { type: Number, default: 0 },
    amountDue: Number,
    paymentMethod: { type: String, enum: ['Cash', 'Bank Transfer', 'Cheque'] },
    paidBy: String,
    paidTo: String,
    currentStock: Number,
    purchaseDate: { type: Date, default: Date.now },
    notes: String,
    /** Bundle count for coil arrival */
    bundles: { type: Number, default: 0 },
    /** Defect / surplus coil returned to supplier — reduces payable and factory stock */
    isReturn: { type: Boolean, default: false },
  },
  { timestamps: true }
);

rawMaterialSchema.index({ coilCategory: 1 });
rawMaterialSchema.index({ materialType: 1 });
rawMaterialSchema.index({ supplierId: 1 });

module.exports = mongoose.model('RawMaterial', rawMaterialSchema);
