const mongoose = require('mongoose');

const periodCloseSchema = new mongoose.Schema(
  {
    closeDate: {
      type: Date,
      required: true,
    },
    executedBy: {
      type: String,
      required: true,
    },
    executedAt: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ['Completed', 'Superseded'],
      default: 'Completed',
    },
    backupFilePath: {
      type: String,
    },
    deletedCounts: {
      orders: { type: Number, default: 0 },
      transactions: { type: Number, default: 0 },
      expenses: { type: Number, default: 0 },
      rawMaterials: { type: Number, default: 0 },
      annealingRecords: { type: Number, default: 0 },
      jobWorks: { type: Number, default: 0 },
      workerLedgerEntries: { type: Number, default: 0 },
      consumptionMaterials: { type: Number, default: 0 },
      consumptionUsage: { type: Number, default: 0 },
      activityLogs: { type: Number, default: 0 },
      personalPayments: { type: Number, default: 0 },
      readyStock: { type: Number, default: 0 },
    },
    notes: {
      type: String,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

periodCloseSchema.index({ closeDate: -1 });
periodCloseSchema.index({ executedAt: -1 });

module.exports = mongoose.model('PeriodClose', periodCloseSchema);
