const mongoose = require('mongoose');
const { COIL_CATEGORIES } = require('../utils/wireConfig');

/**
 * Entry-based annealing ledger.
 * Each document is either a 'Send' (stock left for annealing) or an
 * 'Arrival' (stock came back). Sends and arrivals are NOT linked to each
 * other — remaining bundles/weight are tracked as a pool per party
 * (supplier / customer / factory own stock) + material type.
 */
const annealingRecordSchema = new mongoose.Schema(
  {
    entryType: { type: String, enum: ['Send', 'Arrival', 'Sold'], required: true },

    partyType: { type: String, enum: ['Supplier', 'Customer', 'None'], default: 'None' },
    partyId: { type: mongoose.Schema.Types.ObjectId, refPath: 'partyType' },
    partyName: String,

    materialType: { type: String, enum: ['Coil', 'Wire'], default: 'Coil' },
    coilCategory: {
      type: String,
      enum: [COIL_CATEGORIES.SHIPLET, COIL_CATEGORIES.PATRI, ''],
      default: COIL_CATEGORIES.SHIPLET,
    },
    /** Wire annealing / sale matching */
    wireNumber: { type: Number, min: 1, max: 20 },
    linkedOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    /** Sold entries: which Send batch this sale consumed from */
    sourceSendId: { type: mongoose.Schema.Types.ObjectId, ref: 'AnnealingRecord' },

    bundles: { type: Number, default: 0 },
    /** Send: weight sent. Arrival: initial (pre-annealing) weight of what arrived. */
    weightKg: { type: Number, default: 0 },
    /** True when weight was auto-calculated from the pool's per-bundle average */
    weightEstimated: { type: Boolean, default: false },
    /** Mixed/unknown arrivals can be split across multiple party pools. */
    autoAllocated: { type: Boolean, default: false },
    autoAllocationId: mongoose.Schema.Types.ObjectId,

    /** Arrival only: weight received after annealing */
    finalWeightKg: Number,
    weightLossKg: Number,

    date: { type: Date, default: Date.now },
    notes: String,
    sentBy: String,
    receivedBy: String,

    // ---- legacy fields from the old batch-based model (kept for migration) ----
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
    supplierName: String,
    initialWeightKg: Number,
    returnedWeightKg: Number,
    sentDate: Date,
    returnedDate: Date,
    status: String,
    bundleCount: Number,
    bundlesReturnedTotal: Number,
    returns: [{}],
    isOpeningBalance: { type: Boolean, default: false },
  },
  { timestamps: true, strict: false }
);

annealingRecordSchema.index({ date: -1 });
annealingRecordSchema.index({ partyType: 1, partyId: 1, materialType: 1 });

module.exports = mongoose.model('AnnealingRecord', annealingRecordSchema);
