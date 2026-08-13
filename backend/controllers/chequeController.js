const Cheque = require('../models/Cheque');
const Transaction = require('../models/Transaction');
const Customer = require('../models/Customer');
const Supplier = require('../models/Supplier');
const { startOfDay, endOfDay } = require('date-fns');
const { logActivity } = require('../utils/activityLogService');
const { recalcCustomerTotals, recalcSupplierTotals } = require('../utils/transactionSyncService');

/**
 * Get all cheques with flexible filtering and search.
 */
const getCheques = async (req, res, next) => {
  try {
    const {
      direction,
      status,
      chequeType,
      partyId,
      partyType,
      startDate,
      endDate,
      search,
      limit = 500,
    } = req.query;

    const filter = {};

    if (direction) filter.direction = direction;
    if (status) {
      if (status.includes(',')) {
        filter.status = { $in: status.split(',').map((s) => s.trim()) };
      } else {
        filter.status = status;
      }
    }
    if (chequeType) filter.chequeType = chequeType;

    if (partyId) {
      filter.$or = [{ 'receivedFrom.partyId': partyId }, { 'givenTo.partyId': partyId }];
    } else if (partyType) {
      filter.$or = [{ 'receivedFrom.partyType': partyType }, { 'givenTo.partyType': partyType }];
    }

    if (startDate || endDate) {
      filter.chequeDate = {};
      if (startDate) filter.chequeDate.$gte = startOfDay(new Date(startDate));
      if (endDate) filter.chequeDate.$lte = endOfDay(new Date(endDate));
    }

    if (search && String(search).trim()) {
      const q = String(search).trim();
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { chequeNumber: regex },
        { bankName: regex },
        { 'receivedFrom.partyName': regex },
        { 'givenTo.partyName': regex },
        { notes: regex },
      ];
    }

    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 500, 1), 2000);
    const [total, list] = await Promise.all([
      Cheque.countDocuments(filter),
      Cheque.find(filter).sort({ chequeDate: -1, createdAt: -1 }).limit(limitNum).lean(),
    ]);

    res.json({
      success: true,
      data: list,
      total,
      truncated: total > list.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get active In-Hand customer cheques available to deposit or endorse.
 */
const getInHandCheques = async (req, res, next) => {
  try {
    const cheques = await Cheque.find({
      direction: 'Received',
      status: 'In Hand',
    })
      .sort({ chequeDate: 1, createdAt: 1 })
      .lean();

    const totalAmount = cheques.reduce((s, c) => s + (Number(c.amount) || 0), 0);

    res.json({
      success: true,
      data: cheques,
      count: cheques.length,
      totalAmount,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Summary KPI metrics for cheques dashboard.
 */
const getChequeSummary = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.chequeDate = {};
      if (startDate) dateFilter.chequeDate.$gte = startOfDay(new Date(startDate));
      if (endDate) dateFilter.chequeDate.$lte = endOfDay(new Date(endDate));
    }

    const [
      inHandAgg,
      totalReceivedAgg,
      totalDepositedAgg,
      totalEndorsedAgg,
      issuedCompanyAgg,
      issuedPersonalAgg,
      bouncedAgg,
    ] = await Promise.all([
      // In hand cheques (currently active, all time)
      Cheque.aggregate([
        { $match: { direction: 'Received', status: 'In Hand' } },
        { $group: { _id: null, count: { $sum: 1 }, totalAmount: { $sum: '$amount' } } },
      ]),
      // Total received customer cheques (with date filter if provided)
      Cheque.aggregate([
        { $match: { direction: 'Received', ...dateFilter } },
        { $group: { _id: null, count: { $sum: 1 }, totalAmount: { $sum: '$amount' } } },
      ]),
      // Deposited cheques
      Cheque.aggregate([
        { $match: { direction: 'Received', status: 'Deposited', ...dateFilter } },
        { $group: { _id: null, count: { $sum: 1 }, totalAmount: { $sum: '$amount' } } },
      ]),
      // Endorsed / passed customer cheques
      Cheque.aggregate([
        { $match: { direction: 'Received', status: 'Endorsed', ...dateFilter } },
        { $group: { _id: null, count: { $sum: 1 }, totalAmount: { $sum: '$amount' } } },
      ]),
      // Company cheques issued
      Cheque.aggregate([
        { $match: { direction: 'Issued', chequeType: 'Company Cheque', ...dateFilter } },
        { $group: { _id: null, count: { $sum: 1 }, totalAmount: { $sum: '$amount' } } },
      ]),
      // Personal cheques issued
      Cheque.aggregate([
        { $match: { direction: 'Issued', chequeType: 'Personal Cheque', ...dateFilter } },
        { $group: { _id: null, count: { $sum: 1 }, totalAmount: { $sum: '$amount' } } },
      ]),
      // Bounced cheques
      Cheque.aggregate([
        { $match: { status: 'Bounced', ...dateFilter } },
        { $group: { _id: null, count: { $sum: 1 }, totalAmount: { $sum: '$amount' } } },
      ]),
    ]);

    const summary = {
      inHand: {
        count: inHandAgg[0]?.count || 0,
        totalAmount: inHandAgg[0]?.totalAmount || 0,
      },
      received: {
        count: totalReceivedAgg[0]?.count || 0,
        totalAmount: totalReceivedAgg[0]?.totalAmount || 0,
      },
      deposited: {
        count: totalDepositedAgg[0]?.count || 0,
        totalAmount: totalDepositedAgg[0]?.totalAmount || 0,
      },
      endorsed: {
        count: totalEndorsedAgg[0]?.count || 0,
        totalAmount: totalEndorsedAgg[0]?.totalAmount || 0,
      },
      issuedCompany: {
        count: issuedCompanyAgg[0]?.count || 0,
        totalAmount: issuedCompanyAgg[0]?.totalAmount || 0,
      },
      issuedPersonal: {
        count: issuedPersonalAgg[0]?.count || 0,
        totalAmount: issuedPersonalAgg[0]?.totalAmount || 0,
      },
      issuedTotal: {
        count: (issuedCompanyAgg[0]?.count || 0) + (issuedPersonalAgg[0]?.count || 0),
        totalAmount: (issuedCompanyAgg[0]?.totalAmount || 0) + (issuedPersonalAgg[0]?.totalAmount || 0),
      },
      bounced: {
        count: bouncedAgg[0]?.count || 0,
        totalAmount: bouncedAgg[0]?.totalAmount || 0,
      },
    };

    res.json({ success: true, data: summary });
  } catch (error) {
    next(error);
  }
};

/**
 * Get a single cheque by id.
 */
const getChequeById = async (req, res, next) => {
  try {
    const cheque = await Cheque.findById(req.params.id)
      .populate('sourceChequeId')
      .populate('transactionId')
      .populate('orderId');

    if (!cheque) {
      return res.status(404).json({ success: false, message: 'Cheque not found' });
    }

    res.json({ success: true, data: cheque });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new cheque record.
 */
const createCheque = async (req, res, next) => {
  try {
    const body = { ...req.body };

    if (!body.chequeNumber || !String(body.chequeNumber).trim()) {
      return res.status(400).json({ success: false, message: 'Cheque number is required' });
    }
    if (!body.bankName || !String(body.bankName).trim()) {
      return res.status(400).json({ success: false, message: 'Bank name is required' });
    }
    const amount = Number(body.amount);
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid cheque amount is required' });
    }

    const direction = body.direction || (body.chequeType === 'Customer Cheque' ? 'Received' : 'Issued');
    const chequeType = body.chequeType || (direction === 'Received' ? 'Customer Cheque' : 'Company Cheque');
    const status = body.status || (direction === 'Received' ? 'In Hand' : 'Issued');

    const chequeData = {
      chequeNumber: String(body.chequeNumber).trim(),
      chequeType,
      direction,
      bankName: String(body.bankName).trim(),
      amount,
      chequeDate: body.chequeDate ? new Date(body.chequeDate) : new Date(),
      receivedDate: body.receivedDate ? new Date(body.receivedDate) : new Date(),
      issueDate: body.issueDate ? new Date(body.issueDate) : new Date(),
      status,
      receivedFrom: body.receivedFrom || undefined,
      givenTo: body.givenTo || undefined,
      depositBankAccount: body.depositBankAccount || undefined,
      depositBankAccountOtherName: body.depositBankAccountOtherName || undefined,
      depositDate: body.depositDate ? new Date(body.depositDate) : undefined,
      notes: body.notes || '',
      handledBy: body.handledBy || '',
    };

    const cheque = await Cheque.create(chequeData);

    // If recorded as customer received cheque from a specific customer, sync customer ledger totals
    if (cheque.direction === 'Received' && cheque.receivedFrom?.partyId && cheque.receivedFrom.partyType === 'Customer') {
      await recalcCustomerTotals(cheque.receivedFrom.partyId);
    }

    // If recorded as Issued Cheque from our bank, create linked Money Out transaction to deduct from bank
    if (cheque.direction === 'Issued') {
      const allowedBanks = ['MBL', 'UBL', 'Faisal Bank', 'Other'];
      const bankAcct = allowedBanks.includes(cheque.bankName) ? cheque.bankName : 'MBL';
      const toName = cheque.givenTo?.partyName || 'Payee';

      const txn = await Transaction.create({
        transactionType: 'Money Out',
        amount: cheque.amount,
        paymentMethod: 'Cheque',
        relatedTo: cheque.givenTo?.partyType || 'Supplier',
        relatedId: cheque.givenTo?.partyId || undefined,
        relatedName: toName,
        description: `${cheque.chequeType} #${cheque.chequeNumber} (${cheque.bankName}) to ${toName}`,
        handledBy: cheque.handledBy || '',
        sourceType: 'Manual',
        bankAccount: bankAcct,
        bankAccountOtherName: bankAcct === 'Other' ? cheque.bankName : undefined,
        transactionDate: cheque.issueDate || cheque.chequeDate || new Date(),
        chequeId: cheque._id,
        chequeNumber: cheque.chequeNumber,
        chequeBank: cheque.bankName,
        chequeDate: cheque.chequeDate,
        chequeType: cheque.chequeType,
      });

      cheque.transactionId = txn._id;
      await cheque.save();

      if (cheque.givenTo?.partyId && cheque.givenTo.partyType === 'Supplier') {
        await recalcSupplierTotals(cheque.givenTo.partyId);
      }
    }

    await logActivity({
      req,
      action: 'CREATE',
      module: 'Cheque',
      description: `${cheque.chequeType} #${cheque.chequeNumber} — Rs.${cheque.amount} (${cheque.status})`,
      documentId: cheque._id,
      newValue: cheque,
    });

    res.status(201).json({
      success: true,
      data: cheque,
      message: `${cheque.chequeType} recorded successfully`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Endorse / Pass an in-hand customer cheque to a supplier, expense, or third party.
 */
const endorseCheque = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { givenTo, endorsedDate, notes } = req.body;

    const cheque = await Cheque.findById(id);
    if (!cheque) {
      return res.status(404).json({ success: false, message: 'Cheque not found' });
    }
    if (cheque.status !== 'In Hand') {
      return res.status(400).json({
        success: false,
        message: `Only In-Hand cheques can be endorsed. Current status: ${cheque.status}`,
      });
    }

    if (!givenTo || !givenTo.partyName) {
      return res.status(400).json({
        success: false,
        message: 'Please specify who this cheque is being given to (supplier, worker, expense, etc.)',
      });
    }

    cheque.status = 'Endorsed';
    cheque.givenTo = givenTo;
    cheque.endorsedDate = endorsedDate ? new Date(endorsedDate) : new Date();
    if (notes) cheque.notes = cheque.notes ? `${cheque.notes} | ${notes}` : notes;

    await cheque.save();

    // If given to a Supplier, sync supplier ledger totals
    if (givenTo.partyId && givenTo.partyType === 'Supplier') {
      await recalcSupplierTotals(givenTo.partyId);
    }

    await logActivity({
      req,
      action: 'UPDATE',
      module: 'Cheque',
      description: `Cheque #${cheque.chequeNumber} (Rs.${cheque.amount}) endorsed to ${givenTo.partyName}`,
      documentId: cheque._id,
      newValue: cheque,
    });

    res.json({
      success: true,
      data: cheque,
      message: `Cheque #${cheque.chequeNumber} endorsed to ${givenTo.partyName}`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Deposit an in-hand customer cheque into one of our bank accounts.
 */
const depositCheque = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { bankAccount, bankAccountOtherName, depositDate, notes } = req.body;

    const cheque = await Cheque.findById(id);
    if (!cheque) {
      return res.status(404).json({ success: false, message: 'Cheque not found' });
    }
    if (cheque.status !== 'In Hand') {
      return res.status(400).json({
        success: false,
        message: `Only In-Hand cheques can be deposited. Current status: ${cheque.status}`,
      });
    }

    const allowedBanks = ['MBL', 'UBL', 'Faisal Bank', 'Other'];
    const chosenBank = allowedBanks.includes(bankAccount) ? bankAccount : 'MBL';
    if (chosenBank === 'Other' && !String(bankAccountOtherName || '').trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please provide the custom bank name when selecting Other',
      });
    }

    const dDate = depositDate ? new Date(depositDate) : new Date();
    const fromParty = cheque.receivedFrom?.partyName || 'Customer';

    // Create Bank Money In Transaction
    const bankTxn = await Transaction.create({
      transactionType: 'Money In',
      amount: cheque.amount,
      paymentMethod: 'Bank Transfer',
      relatedTo: cheque.receivedFrom?.partyType || 'Customer',
      relatedId: cheque.receivedFrom?.partyId || undefined,
      relatedName: fromParty,
      description: `Cheque deposit — Cheque #${cheque.chequeNumber} (${cheque.bankName}) from ${fromParty}`,
      handledBy: cheque.handledBy || '',
      sourceType: 'Manual',
      bankAccount: chosenBank,
      bankAccountOtherName: chosenBank === 'Other' ? bankAccountOtherName : undefined,
      transactionDate: dDate,
      chequeId: cheque._id,
      chequeNumber: cheque.chequeNumber,
      chequeBank: cheque.bankName,
      chequeDate: cheque.chequeDate,
    });

    cheque.status = 'Deposited';
    cheque.depositBankAccount = chosenBank;
    cheque.depositBankAccountOtherName = chosenBank === 'Other' ? bankAccountOtherName : undefined;
    cheque.depositDate = dDate;
    cheque.transactionId = bankTxn._id;
    if (notes) cheque.notes = cheque.notes ? `${cheque.notes} | ${notes}` : notes;

    await cheque.save();

    await logActivity({
      req,
      action: 'UPDATE',
      module: 'Cheque',
      description: `Cheque #${cheque.chequeNumber} deposited to ${chosenBank === 'Other' ? bankAccountOtherName : chosenBank} (Rs.${cheque.amount})`,
      documentId: cheque._id,
      newValue: cheque,
    });

    res.json({
      success: true,
      data: cheque,
      transaction: bankTxn,
      message: `Cheque #${cheque.chequeNumber} deposited to ${chosenBank === 'Other' ? bankAccountOtherName : chosenBank}`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update status of a cheque (Cleared, Bounced, Returned, Cancelled, or revert to In Hand).
 */
const updateChequeStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const allowedStatuses = [
      'In Hand',
      'Deposited',
      'Endorsed',
      'Issued',
      'Cleared',
      'Bounced',
      'Returned',
      'Cancelled',
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Allowed: ${allowedStatuses.join(', ')}`,
      });
    }

    const cheque = await Cheque.findById(id);
    if (!cheque) {
      return res.status(404).json({ success: false, message: 'Cheque not found' });
    }

    const oldStatus = cheque.status;
    cheque.status = status;
    if (notes) cheque.notes = cheque.notes ? `${cheque.notes} | ${notes}` : notes;

    await cheque.save();

    // If cheque was bounced or returned, log clearly
    await logActivity({
      req,
      action: 'UPDATE',
      module: 'Cheque',
      description: `Cheque #${cheque.chequeNumber} status changed: ${oldStatus} → ${status}`,
      documentId: cheque._id,
      newValue: cheque,
    });

    res.json({
      success: true,
      data: cheque,
      message: `Cheque status updated to ${status}`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Edit cheque details.
 */
const updateCheque = async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = { ...req.body };

    const cheque = await Cheque.findById(id);
    if (!cheque) {
      return res.status(404).json({ success: false, message: 'Cheque not found' });
    }

    if (body.chequeNumber) cheque.chequeNumber = String(body.chequeNumber).trim();
    if (body.bankName) cheque.bankName = String(body.bankName).trim();
    if (body.amount != null) cheque.amount = Number(body.amount) || cheque.amount;
    if (body.chequeDate) cheque.chequeDate = new Date(body.chequeDate);
    if (body.chequeType) cheque.chequeType = body.chequeType;
    if (body.direction) cheque.direction = body.direction;
    if (body.status) cheque.status = body.status;
    if (body.receivedFrom) cheque.receivedFrom = body.receivedFrom;
    if (body.givenTo) cheque.givenTo = body.givenTo;
    if (body.depositBankAccount) cheque.depositBankAccount = body.depositBankAccount;
    if (body.depositBankAccountOtherName) cheque.depositBankAccountOtherName = body.depositBankAccountOtherName;
    if (body.notes != null) cheque.notes = body.notes;
    if (body.handledBy != null) cheque.handledBy = body.handledBy;

    await cheque.save();

    await logActivity({
      req,
      action: 'UPDATE',
      module: 'Cheque',
      description: `Updated Cheque #${cheque.chequeNumber}`,
      documentId: cheque._id,
      newValue: cheque,
    });

    res.json({
      success: true,
      data: cheque,
      message: 'Cheque updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a cheque record.
 */
const deleteCheque = async (req, res, next) => {
  try {
    const { id } = req.params;
    const cheque = await Cheque.findById(id);
    if (!cheque) {
      return res.status(404).json({ success: false, message: 'Cheque not found' });
    }

    // If this cheque had a linked deposit transaction, remove or unlink it
    if (cheque.transactionId) {
      await Transaction.findByIdAndDelete(cheque.transactionId).catch(() => {});
    }

    await Cheque.findByIdAndDelete(id);

    await logActivity({
      req,
      action: 'DELETE',
      module: 'Cheque',
      description: `Deleted ${cheque.chequeType} #${cheque.chequeNumber} (Rs.${cheque.amount})`,
      documentId: cheque._id,
    });

    res.json({
      success: true,
      message: `Cheque #${cheque.chequeNumber} deleted successfully`,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCheques,
  getInHandCheques,
  getChequeSummary,
  getChequeById,
  createCheque,
  endorseCheque,
  depositCheque,
  updateChequeStatus,
  updateCheque,
  deleteCheque,
};
