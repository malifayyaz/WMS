const OpeningBalance = require('../models/OpeningBalance');
const PeriodClose = require('../models/PeriodClose');
const DailyCashOpening = require('../models/DailyCashOpening');
const BankAccountOpening = require('../models/BankAccountOpening');
const RawMaterial = require('../models/RawMaterial');
const ReadyStock = require('../models/ReadyStock');
const AnnealingRecord = require('../models/AnnealingRecord');
const Customer = require('../models/Customer');
const Supplier = require('../models/Supplier');
const JobWork = require('../models/JobWork');
const Transaction = require('../models/Transaction');
const PersonalPayment = require('../models/PersonalPayment');

const ALL_SECTIONS = [
  'Cash',
  'Bank',
  'ShipletCoil',
  'PatriCoil',
  'Annealing',
  'ProcessingCustomer',
  'Customer',
  'Supplier',
  'ReadyStock',
  'Cheque',
  'PersonalPayment',
];

/**
 * Internal helper to apply opening balance to system collections.
 */
async function applyOpeningBalance(opening, closeDate) {
  if (!closeDate) {
    const latestClose = await PeriodClose.findOne({ status: 'Completed' }).sort({ executedAt: -1 });
    closeDate = latestClose?.closeDate || new Date();
  }

  switch (opening.section) {
    case 'Cash': {
      await DailyCashOpening.findOneAndUpdate(
        { bookDate: closeDate },
        {
          bookDate: closeDate,
          openingBalance: Number(opening.cashAmount) || 0,
          note: 'Opening balance from period close',
        },
        { upsert: true, new: true }
      );
      break;
    }

    case 'Bank': {
      const isOther = !['MBL', 'UBL', 'Faisal Bank'].includes(opening.bankAccount);
      const bankAccount = isOther ? 'Other' : opening.bankAccount;
      const bankAccountOtherName = isOther ? opening.bankAccount || '' : '';

      await BankAccountOpening.findOneAndUpdate(
        { bankAccount, bankAccountOtherName },
        {
          bankAccount,
          bankAccountOtherName,
          openingBalance: Number(opening.bankAmount) || 0,
          asOfDate: closeDate,
          note: 'Opening balance from period close',
        },
        { upsert: true, new: true }
      );
      break;
    }

    case 'ShipletCoil':
    case 'PatriCoil': {
      const coilCategory = opening.coilCategory || (opening.section === 'ShipletCoil' ? 'Shiplet Coil' : 'Patri Coil');
      const weightInKg = Number(opening.weightKg) || 0;
      const ratePerKg = Number(opening.ratePerKg) || 0;
      const totalAmount = opening.totalValue || weightInKg * ratePerKg;

      const raw = await RawMaterial.create({
        coilCategory,
        materialType: coilCategory,
        weightInKg,
        ratePerKg,
        totalAmount,
        currentStock: weightInKg,
        bundles: Number(opening.bundles) || 0,
        supplierName: opening.supplierName || 'Opening Stock',
        purchaseDate: closeDate,
        amountPaid: totalAmount,
        amountDue: 0,
        isOpeningBalance: true,
        notes: 'Opening stock from period close',
      });
      opening.appliedDocumentId = raw._id;
      break;
    }

    case 'Customer': {
      if (opening.referenceId) {
        const isDebit = opening.balanceType === 'debit';
        const isCredit = opening.balanceType === 'credit';
        const bal = Number(opening.balanceAmount) || 0;

        await Customer.findByIdAndUpdate(opening.referenceId, {
          totalAmountDue: isDebit ? bal : 0,
          totalAmountPaid: isCredit ? bal : 0,
          totalAmountPurchased: isDebit ? bal : 0,
          openingBalance: bal,
          openingBalanceType: opening.balanceType || 'none',
          openingBalanceDate: closeDate,
        });
      }
      break;
    }

    case 'Supplier': {
      if (opening.referenceId) {
        const isDebit = opening.balanceType === 'debit';
        const isCredit = opening.balanceType === 'credit';
        const bal = Number(opening.balanceAmount) || 0;

        await Supplier.findByIdAndUpdate(opening.referenceId, {
          totalAmountDue: isCredit ? bal : 0,
          totalAmountPaid: isDebit ? bal : 0,
          totalAmountPurchased: isCredit ? bal : 0,
          openingBalance: bal,
          openingBalanceType: opening.balanceType || 'none',
          openingBalanceDate: closeDate,
        });
      }
      break;
    }

    case 'ReadyStock': {
      const weight = Number(opening.wireWeightKg) || 0;
      const rate = Number(opening.wireRatePerKg) || 0;
      const wireNumber = Number(opening.wireNumber);

      const rs = await ReadyStock.create({
        wireNumber,
        wireLabel: `Wire #${wireNumber}`,
        weightKg: weight,
        producedWeightKg: weight,
        remainingStockKg: weight,
        manufacturingCostPerKg: rate,
        status: 'In Stock',
        productionDate: closeDate,
        isOpeningBalance: true,
        notes: 'Opening stock from period close',
      });
      opening.appliedDocumentId = rs._id;
      break;
    }

    case 'Annealing': {
      const weight = Number(opening.annealingWeightKg) || 0;
      const bundles = Number(opening.annealingBundles) || 0;

      const record = await AnnealingRecord.create({
        entryType: 'Send',
        partyType: 'None',
        materialType: 'Coil',
        coilCategory: opening.annealingCoilType || 'Shiplet Coil',
        bundles,
        weightKg: weight,
        date: closeDate,
        sentDate: closeDate,
        isOpeningBalance: true,
        notes: 'Opening annealing from period close',
      });
      opening.appliedDocumentId = record._id;
      break;
    }

    case 'ProcessingCustomer': {
      if (opening.referenceId) {
        const cust = await Customer.findById(opening.referenceId);
        const jw = await JobWork.create({
          customerId: opening.referenceId,
          customerName: cust?.name || opening.referenceName || '',
          arrivedWeightKg: Number(opening.processingWeightKg) || 0,
          deliveredWeightKg: 0,
          labourTotal: Number(opening.processingAmountDue) || 0,
          status: 'In Stock',
          arrivalDate: closeDate,
          notes: 'Opening processing stock from period close',
        });
        opening.appliedDocumentId = jw._id;
      }
      break;
    }

    case 'Cheque': {
      const isReceivable = opening.chequeType === 'Receivable';
      const tx = await Transaction.create({
        transactionType: isReceivable ? 'Money In' : 'Money Out',
        amount: Number(opening.chequeAmount) || 0,
        paymentMethod: 'Cheque',
        relatedName: opening.chequePartyName || '',
        chequeNumber: opening.chequeNumber || '',
        bankName: opening.chequeBankName || '',
        chequeDate: opening.chequeDueDate || closeDate,
        transactionDate: closeDate,
        isOpeningBalance: true,
        description: `Opening ${isReceivable ? 'Receivable' : 'Payable'} cheque from period close`,
      });
      opening.appliedDocumentId = tx._id;
      break;
    }

    case 'PersonalPayment': {
      if (opening.referenceId) {
        await PersonalPayment.findByIdAndUpdate(opening.referenceId, {
          totalContributed: Number(opening.personalAmountContributed) || 0,
          expectedLumpSum: Number(opening.personalExpectedLumpSum) || 0,
        });
      } else if (opening.personalCategoryName) {
        const pp = await PersonalPayment.findOne({ categoryName: opening.personalCategoryName });
        if (pp) {
          pp.totalContributed = Number(opening.personalAmountContributed) || pp.totalContributed;
          pp.expectedLumpSum = Number(opening.personalExpectedLumpSum) || pp.expectedLumpSum;
          await pp.save();
          opening.appliedDocumentId = pp._id;
        }
      }
      break;
    }

    default:
      break;
  }

  opening.isApplied = true;
  opening.appliedAt = new Date();
  await opening.save();
}

/**
 * Returns all opening balances grouped by section.
 */
exports.getAll = async (req, res) => {
  try {
    const list = await OpeningBalance.find().sort({ createdAt: 1 }).lean();
    const grouped = {};
    for (const sec of ALL_SECTIONS) {
      grouped[sec] = [];
    }

    for (const item of list) {
      if (!grouped[item.section]) {
        grouped[item.section] = [];
      }
      grouped[item.section].push(item);
    }

    return res.json({
      success: true,
      data: grouped,
    });
  } catch (error) {
    console.error('[OpeningBalance] getAll error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch opening balances' });
  }
};

/**
 * Creates or updates an opening balance and applies it to the system.
 */
exports.upsertOpening = async (req, res) => {
  try {
    const body = { ...req.body };
    const { section, referenceId, bankAccount } = body;

    if (!section || !ALL_SECTIONS.includes(section)) {
      return res.status(400).json({
        success: false,
        message: `Valid section is required (${ALL_SECTIONS.join(', ')})`,
      });
    }

    // Attach latest periodCloseId if not provided
    if (!body.periodCloseId) {
      const latestClose = await PeriodClose.findOne({ status: 'Completed' }).sort({ executedAt: -1 });
      if (latestClose) {
        body.periodCloseId = latestClose._id;
      }
    }

    let openingRecord;

    if (referenceId) {
      openingRecord = await OpeningBalance.findOne({ section, referenceId });
    } else if (section === 'Bank') {
      openingRecord = await OpeningBalance.findOne({ section, bankAccount });
    } else if (section === 'Cash') {
      openingRecord = await OpeningBalance.findOne({ section });
    }

    if (openingRecord) {
      Object.assign(openingRecord, body);
      openingRecord.isApplied = false; // re-apply with new values
      await openingRecord.save();
    } else {
      openingRecord = new OpeningBalance(body);
      await openingRecord.save();
    }

    // Apply opening balance to the live data
    await applyOpeningBalance(openingRecord);

    return res.json({
      success: true,
      message: 'Opening balance saved and applied successfully',
      data: openingRecord,
    });
  } catch (error) {
    console.error('[OpeningBalance] upsertOpening error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to save opening balance',
    });
  }
};

/**
 * Deletes an opening balance record and reverses any applied effects.
 */
exports.deleteOpening = async (req, res) => {
  try {
    const { id } = req.params;
    const opening = await OpeningBalance.findById(id);

    if (!opening) {
      return res.status(404).json({ success: false, message: 'Opening balance record not found' });
    }

    // Reverse effect if previously applied
    if (opening.isApplied) {
      if (opening.appliedDocumentId) {
        switch (opening.section) {
          case 'ShipletCoil':
          case 'PatriCoil':
            await RawMaterial.findByIdAndDelete(opening.appliedDocumentId);
            break;
          case 'ReadyStock':
            await ReadyStock.findByIdAndDelete(opening.appliedDocumentId);
            break;
          case 'Annealing':
            await AnnealingRecord.findByIdAndDelete(opening.appliedDocumentId);
            break;
          case 'ProcessingCustomer':
            await JobWork.findByIdAndDelete(opening.appliedDocumentId);
            break;
          case 'Cheque':
            await Transaction.findByIdAndDelete(opening.appliedDocumentId);
            break;
          default:
            break;
        }
      }

      if (opening.section === 'Customer' && opening.referenceId) {
        await Customer.findByIdAndUpdate(opening.referenceId, {
          totalAmountDue: 0,
          totalAmountPaid: 0,
          totalAmountPurchased: 0,
          openingBalance: 0,
          openingBalanceType: 'none',
        });
      } else if (opening.section === 'Supplier' && opening.referenceId) {
        await Supplier.findByIdAndUpdate(opening.referenceId, {
          totalAmountDue: 0,
          totalAmountPaid: 0,
          totalAmountPurchased: 0,
          openingBalance: 0,
          openingBalanceType: 'none',
        });
      } else if (opening.section === 'Cash') {
        await DailyCashOpening.deleteMany({});
      } else if (opening.section === 'Bank') {
        const isOther = !['MBL', 'UBL', 'Faisal Bank'].includes(opening.bankAccount);
        const bankAccount = isOther ? 'Other' : opening.bankAccount;
        const bankAccountOtherName = isOther ? opening.bankAccount || '' : '';
        await BankAccountOpening.deleteMany({ bankAccount, bankAccountOtherName });
      }
    }

    await OpeningBalance.findByIdAndDelete(id);

    return res.json({
      success: true,
      message: 'Opening balance deleted and effects reversed successfully',
    });
  } catch (error) {
    console.error('[OpeningBalance] deleteOpening error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete opening balance' });
  }
};

/**
 * Returns overall completion summary across the 11 sections.
 */
exports.getSummary = async (req, res) => {
  try {
    const list = await OpeningBalance.find().lean();
    const sectionsWithData = new Set(list.map((item) => item.section));

    const sectionsCompleted = ALL_SECTIONS.filter((s) => sectionsWithData.has(s));
    const sectionsRemaining = ALL_SECTIONS.filter((s) => !sectionsWithData.has(s));

    let totalOpeningAssets = 0;
    let totalOpeningLiabilities = 0;

    for (const item of list) {
      switch (item.section) {
        case 'Cash':
          totalOpeningAssets += Number(item.cashAmount) || 0;
          break;
        case 'Bank':
          totalOpeningAssets += Number(item.bankAmount) || 0;
          break;
        case 'ShipletCoil':
        case 'PatriCoil':
          totalOpeningAssets += Number(item.totalValue) || (Number(item.weightKg) || 0) * (Number(item.ratePerKg) || 0);
          break;
        case 'ReadyStock':
          totalOpeningAssets += (Number(item.wireWeightKg) || 0) * (Number(item.wireRatePerKg) || 0);
          break;
        case 'ProcessingCustomer':
          totalOpeningAssets += Number(item.processingAmountDue) || 0;
          break;
        case 'PersonalPayment':
          totalOpeningAssets += Number(item.personalAmountContributed) || 0;
          break;
        case 'Cheque':
          if (item.chequeType === 'Receivable') {
            totalOpeningAssets += Number(item.chequeAmount) || 0;
          } else {
            totalOpeningLiabilities += Number(item.chequeAmount) || 0;
          }
          break;
        case 'Customer':
          if (item.balanceType === 'debit') {
            totalOpeningAssets += Number(item.balanceAmount) || 0;
          } else if (item.balanceType === 'credit') {
            totalOpeningLiabilities += Number(item.balanceAmount) || 0;
          }
          break;
        case 'Supplier':
          if (item.balanceType === 'credit') {
            totalOpeningLiabilities += Number(item.balanceAmount) || 0;
          } else if (item.balanceType === 'debit') {
            totalOpeningAssets += Number(item.balanceAmount) || 0;
          }
          break;
        default:
          break;
      }
    }

    return res.json({
      success: true,
      data: {
        sectionsCompleted,
        sectionsRemaining,
        totalOpeningAssets,
        totalOpeningLiabilities,
        isComplete: sectionsRemaining.length === 0,
      },
    });
  } catch (error) {
    console.error('[OpeningBalance] getSummary error:', error);
    return res.status(500).json({ success: false, message: 'Failed to calculate opening balance summary' });
  }
};
