const mongoose = require('mongoose');
const { COIL_CATEGORIES } = require('../utils/wireConfig');

/**
 * Job work: a customer brings their own coil, we manufacture it into wire
 * and charge labour per kg at delivery time (rate varies by wire type).
 */
const jobWorkDeliverySchema = new mongoose.Schema({
  weightKg: { type: Number, required: true },
  /** Labour rate applied for this delivery (set at delivery time) */
  labourRatePerKg: { type: Number, default: 0 },
  labourAmount: { type: Number, default: 0 },
  /**
   * Arrival coil rate used for this delivery — the customer's latest incoming
   * rate at delivery time, so a newer arrival is never averaged with older ones.
   */
  coilRatePerKg: { type: Number, default: 0 },
  /** coilRatePerKg + labourRatePerKg for this delivery */
  sellingRatePerKg: { type: Number, default: 0 },
  wireNumber: { type: Number, min: 1, max: 20 },
  bundles: { type: Number, default: 0 },
  deliveredDate: { type: Date, default: Date.now },
  notes: String,
  /**
   * Shared id when one customer delivery is FIFO-split across multiple arrival lots.
   * Ledger / UI merge rows with the same deliveryGroupId into a single line.
   */
  deliveryGroupId: { type: mongoose.Schema.Types.ObjectId },
  /** True on the first lot fragment of a pool delivery (shows the merged line in UI). */
  isGroupPrimary: { type: Boolean, default: true },
});

const jobWorkReturnSchema = new mongoose.Schema({
  weightKg: { type: Number, required: true },
  returnDate: { type: Date, default: Date.now },
  coilType: String,
  reason: String,
  returnedBy: String,
  note: String,
  createdAt: { type: Date, default: Date.now },
});

const jobWorkSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    customerName: String,
    coilCategory: {
      type: String,
      enum: [COIL_CATEGORIES.SHIPLET, COIL_CATEGORIES.PATRI],
      default: COIL_CATEGORIES.SHIPLET,
    },
    arrivedWeightKg: { type: Number, required: true },
    /** Customer's own coil rate (informational, e.g. 232) */
    coilRatePerKg: { type: Number, default: 0 },
    /**
     * Legacy: labour used to be set on arrival.
     * New flow stores labour on each delivery. Kept optional for old records.
     */
    labourRatePerKg: { type: Number, default: 0 },
    sellingRatePerKg: { type: Number, default: 0 },
    arrivalDate: { type: Date, default: Date.now },

    deliveries: [jobWorkDeliverySchema],
    returns: [jobWorkReturnSchema],
    deliveredWeightKg: { type: Number, default: 0 },
    labourTotal: { type: Number, default: 0 },
    status: { type: String, enum: ['In Stock', 'Partially Delivered', 'Delivered'], default: 'In Stock' },
    notes: String,
  },
  { timestamps: true }
);

jobWorkSchema.pre('save', function syncTotals(next) {
  this.deliveredWeightKg = (this.deliveries || []).reduce((s, d) => s + (d.weightKg || 0), 0);
  this.labourTotal = (this.deliveries || []).reduce((s, d) => s + (d.labourAmount || 0), 0);

  // Prefer latest delivery rate for display; else legacy arrival rate
  const lastDelivery = (this.deliveries || []).length
    ? this.deliveries[this.deliveries.length - 1]
    : null;
  if (lastDelivery?.labourRatePerKg) {
    this.labourRatePerKg = lastDelivery.labourRatePerKg;
    this.sellingRatePerKg = lastDelivery.sellingRatePerKg
      || ((this.coilRatePerKg || 0) + (lastDelivery.labourRatePerKg || 0));
  } else {
    this.sellingRatePerKg = (this.coilRatePerKg || 0) + (this.labourRatePerKg || 0);
  }

  const returnedWeightKg = (this.returns || []).reduce((s, r) => s + (r.weightKg || 0), 0);
  const totalOutKg = this.deliveredWeightKg + returnedWeightKg;
  if (totalOutKg >= this.arrivedWeightKg && this.arrivedWeightKg > 0) {
    this.status = 'Delivered';
  } else if (totalOutKg > 0) {
    this.status = 'Partially Delivered';
  } else {
    this.status = 'In Stock';
  }
  next();
});

jobWorkSchema.index({ customerId: 1 });
jobWorkSchema.index({ arrivalDate: -1 });

module.exports = mongoose.model('JobWork', jobWorkSchema);
