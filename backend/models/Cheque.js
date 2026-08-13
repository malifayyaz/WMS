const mongoose = require('mongoose');

const chequeSchema = new mongoose.Schema(
  {
    chequeNumber: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    /**
     * Customer Cheque: received from customer/third party
     * Company Cheque: written from our own company bank account (MBL/UBL/Faisal/etc.)
     * Personal Cheque: written from personal bank account
     */
    chequeType: {
      type: String,
      enum: ['Customer Cheque', 'Company Cheque', 'Personal Cheque'],
      default: 'Customer Cheque',
      required: true,
    },
    direction: {
      type: String,
      enum: ['Received', 'Issued'],
      required: true,
    },
    bankName: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    /** Date written on the cheque / maturity date */
    chequeDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    /** Date the cheque was physically received or issued */
    receivedDate: {
      type: Date,
      default: Date.now,
    },
    issueDate: {
      type: Date,
      default: Date.now,
    },
    /**
     * In Hand: Received customer cheque currently in our possession
     * Deposited: Received cheque deposited into our bank account
     * Endorsed: Received customer cheque passed/handed over to pay a supplier/party/expense
     * Issued: Company/personal cheque issued by us (waiting for clearance)
     * Cleared: Cheque successfully cleared through bank
     * Bounced: Cheque dishonoured / bounced
     * Returned: Cheque returned back to customer / party
     * Cancelled: Cheque voided / cancelled
     */
    status: {
      type: String,
      enum: [
        'In Hand',
        'Deposited',
        'Endorsed',
        'Issued',
        'Cleared',
        'Bounced',
        'Returned',
        'Cancelled',
      ],
      default: 'In Hand',
      required: true,
    },
    /** Who gave us this cheque (for Received customer cheques) */
    receivedFrom: {
      partyType: {
        type: String,
        enum: ['Customer', 'Supplier', 'Other'],
        default: 'Customer',
      },
      partyId: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'receivedFrom.partyType',
      },
      partyName: {
        type: String,
        trim: true,
      },
    },
    /** Who received this cheque from us (for Issued cheques OR Endorsed customer cheques) */
    givenTo: {
      partyType: {
        type: String,
        enum: ['Supplier', 'Customer', 'Worker', 'Expense', 'Other'],
        default: 'Supplier',
      },
      partyId: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'givenTo.partyType',
      },
      partyName: {
        type: String,
        trim: true,
      },
      expenseGroup: String,
      expenseCategory: String,
    },
    /** If this is an endorsed transaction, links to the original Customer Cheque document */
    sourceChequeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cheque',
    },
    /** Endorsed on date */
    endorsedDate: Date,
    /** Which bank account this cheque was deposited into (when deposited) */
    depositBankAccount: {
      type: String,
      enum: ['MBL', 'UBL', 'Faisal Bank', 'Other'],
    },
    depositBankAccountOtherName: String,
    depositDate: Date,
    /** Linked Transaction in Daily Book or Bank Book */
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
    },
    /** Linked Order if received as order payment */
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
    },
    /** Linked RawMaterial purchase if given for coil purchase */
    rawMaterialId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RawMaterial',
    },
    notes: {
      type: String,
      trim: true,
    },
    handledBy: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

chequeSchema.index({ status: 1 });
chequeSchema.index({ direction: 1 });
chequeSchema.index({ chequeType: 1 });
chequeSchema.index({ chequeDate: -1 });
chequeSchema.index({ 'receivedFrom.partyId': 1 });
chequeSchema.index({ 'givenTo.partyId': 1 });

module.exports = mongoose.model('Cheque', chequeSchema);
