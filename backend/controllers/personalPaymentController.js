const PersonalPayment = require('../models/PersonalPayment');
const Cheque = require('../models/Cheque');
const { logActivity } = require('../utils/activityLogService');

/**
 * GET /api/personal-payments
 * List all personal payments / committees / loans with summary metrics
 */
exports.getAll = async (req, res, next) => {
  try {
    const { status, direction, search } = req.query;

    const filter = {};
    if (status && status !== 'All') {
      filter.status = status;
    }
    if (direction && direction !== 'All') {
      filter.paymentDirection = direction;
    }
    if (search) {
      filter.$or = [
        { categoryName: { $regex: search, $options: 'i' } },
        { personName: { $regex: search, $options: 'i' } },
        { categoryType: { $regex: search, $options: 'i' } },
      ];
    }

    const items = await PersonalPayment.find(filter).sort({ status: 1, expectedReceiveDate: 1 }).lean();

    // Summary calculations across all records (or active records)
    const allActive = await PersonalPayment.find({ status: 'Active' }).lean();

    const receivableActive = allActive.filter((i) => i.paymentDirection !== 'Payable');
    const payableActive = allActive.filter((i) => i.paymentDirection === 'Payable');

    const totalReceivableLumpSum = receivableActive.reduce((s, i) => s + (i.expectedLumpSum || 0), 0);
    const totalReceivableContributed = receivableActive.reduce((s, i) => s + (i.totalContributed || 0), 0);
    const totalReceivableRemaining = receivableActive.reduce((s, i) => s + (i.remainingToContribute || 0), 0);

    const totalPayableLumpSum = payableActive.reduce((s, i) => s + (i.expectedLumpSum || 0), 0);
    const totalPayableRepaid = payableActive.reduce((s, i) => s + (i.totalContributed || 0), 0);
    const totalPayableRemaining = payableActive.reduce((s, i) => s + (i.remainingToContribute || 0), 0);

    // Nearest upcoming receive date
    const withDates = allActive
      .filter((i) => i.expectedReceiveDate && new Date(i.expectedReceiveDate) >= new Date())
      .sort((a, b) => new Date(a.expectedReceiveDate) - new Date(b.expectedReceiveDate));
    const upcomingReceive = withDates[0] || null;

    res.json({
      success: true,
      data: items,
      summary: {
        totalActiveCount: allActive.length,
        receivableCount: receivableActive.length,
        payableCount: payableActive.length,
        totalReceivableLumpSum,
        totalReceivableContributed,
        totalReceivableRemaining,
        totalPayableLumpSum,
        totalPayableRepaid,
        totalPayableRemaining,
        upcomingReceive,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/personal-payments
 * Create a new personal payment / committee / loan category
 */
exports.create = async (req, res, next) => {
  try {
    const {
      categoryName,
      paymentDirection = 'Receivable',
      categoryType = 'Committee',
      personName,
      expectedLumpSum,
      expectedReceiveDate,
      monthlyAmount,
      notes,
    } = req.body;

    if (!categoryName || expectedLumpSum == null || expectedLumpSum <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Category Name and Expected Lump Sum / Target Amount are required.',
      });
    }

    const item = new PersonalPayment({
      categoryName,
      paymentDirection,
      categoryType,
      personName,
      expectedLumpSum: Number(expectedLumpSum),
      expectedReceiveDate: expectedReceiveDate ? new Date(expectedReceiveDate) : null,
      monthlyAmount: Number(monthlyAmount) || 0,
      notes,
      createdBy: req.user?.username || req.user?.name || 'User',
    });

    await item.save();

    await logActivity({
      req,
      action: 'CREATE',
      module: 'PersonalPayment',
      description: `Created ${paymentDirection} category: ${categoryName} (Rs. ${expectedLumpSum})`,
      documentId: item._id,
      newValue: item,
    });

    res.status(201).json({
      success: true,
      data: item,
      message: 'Category created successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/personal-payments/:id/payments
 * Add a payment / installment to a category
 */
exports.addPayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      amount,
      paymentDate,
      paymentMethod,
      chequeNumber,
      chequeType,
      chequeBank,
      chequeDate,
      isEndorsedCheque,
      sourceChequeId,
      receivedFromName,
      bankName,
      paidBy,
      note,
    } = req.body;

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Valid payment amount is required.' });
    }

    const item = await PersonalPayment.findById(id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Personal payment category not found.' });
    }

    let resolvedChequeId = null;
    let finalChequeNum = chequeNumber || '';
    let finalChequeBank = chequeBank || bankName || '';
    let finalChequeType = chequeType || 'Company Cheque';
    let finalIsEndorsed = Boolean(isEndorsedCheque || chequeType === 'Customer Cheque');

    if (paymentMethod === 'Cheque') {
      const chqDate = chequeDate ? new Date(chequeDate) : (paymentDate ? new Date(paymentDate) : new Date());
      finalChequeNum = String(chequeNumber || '').trim() || `CHQ-${Date.now().toString().slice(-6)}`;
      finalChequeBank = String(chequeBank || bankName || 'Bank').trim();

      if (finalIsEndorsed && sourceChequeId) {
        const sourceCheque = await Cheque.findById(sourceChequeId);
        if (sourceCheque) {
          sourceCheque.status = 'Endorsed';
          sourceCheque.givenTo = {
            partyType: 'Other',
            partyName: item.categoryName,
            expenseGroup: 'Personal',
            expenseCategory: item.categoryType,
          };
          sourceCheque.endorsedDate = paymentDate || new Date();
          await sourceCheque.save();
          resolvedChequeId = sourceCheque._id;
          finalChequeNum = sourceCheque.chequeNumber;
          finalChequeBank = sourceCheque.bankName;
          finalChequeType = 'Customer Cheque';
          finalIsEndorsed = true;
        }
      } else {
        const newCheque = await Cheque.create({
          chequeNumber: finalChequeNum,
          chequeType: finalIsEndorsed ? 'Customer Cheque' : finalChequeType,
          direction: finalIsEndorsed ? 'Received' : 'Issued',
          bankName: finalChequeBank,
          amount: Number(amount) || 0,
          chequeDate: chqDate,
          issueDate: paymentDate || new Date(),
          status: finalIsEndorsed ? 'Endorsed' : 'Issued',
          receivedFrom: finalIsEndorsed ? {
            partyType: 'Customer',
            partyName: receivedFromName || 'Customer',
          } : undefined,
          givenTo: {
            partyType: 'Other',
            partyName: item.categoryName,
            expenseGroup: 'Personal',
            expenseCategory: item.categoryType,
          },
          endorsedDate: finalIsEndorsed ? (paymentDate || new Date()) : undefined,
          notes: note || `Personal payment: ${item.categoryName}`,
          handledBy: paidBy || '',
        });
        resolvedChequeId = newCheque._id;
      }
    }

    item.payments.push({
      amount: Number(amount),
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      paymentMethod: paymentMethod || 'Cash',
      chequeId: resolvedChequeId,
      chequeNumber: finalChequeNum,
      chequeType: finalChequeType,
      chequeBank: finalChequeBank,
      chequeDate: chequeDate ? new Date(chequeDate) : undefined,
      isEndorsedCheque: finalIsEndorsed,
      sourceChequeId: sourceChequeId || undefined,
      receivedFromName: receivedFromName || '',
      bankName: finalChequeBank,
      paidBy: paidBy || req.user?.name || req.user?.username || '',
      note: note || '',
    });

    await item.save();

    await logActivity({
      req,
      action: 'UPDATE',
      module: 'PersonalPayment',
      description: `Recorded payment of Rs. ${amount} for ${item.categoryName} (${paymentMethod || 'Cash'})`,
      documentId: item._id,
      newValue: item,
    });

    res.json({
      success: true,
      data: item,
      message: 'Payment recorded successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/personal-payments/:id
 * Update category details
 */
exports.update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      categoryName,
      paymentDirection,
      categoryType,
      personName,
      expectedLumpSum,
      expectedReceiveDate,
      monthlyAmount,
      status,
      notes,
    } = req.body;

    const item = await PersonalPayment.findById(id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Category not found.' });
    }

    if (categoryName !== undefined) item.categoryName = categoryName;
    if (paymentDirection !== undefined) item.paymentDirection = paymentDirection;
    if (categoryType !== undefined) item.categoryType = categoryType;
    if (personName !== undefined) item.personName = personName;
    if (expectedLumpSum !== undefined) item.expectedLumpSum = Number(expectedLumpSum);
    if (expectedReceiveDate !== undefined) {
      item.expectedReceiveDate = expectedReceiveDate ? new Date(expectedReceiveDate) : null;
    }
    if (monthlyAmount !== undefined) item.monthlyAmount = Number(monthlyAmount) || 0;
    if (status !== undefined) item.status = status;
    if (notes !== undefined) item.notes = notes;

    await item.save();

    await logActivity({
      req,
      action: 'UPDATE',
      module: 'PersonalPayment',
      description: `Updated category ${item.categoryName}`,
      documentId: item._id,
      newValue: item,
    });

    res.json({
      success: true,
      data: item,
      message: 'Category updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/personal-payments/:id/payments/:paymentId
 * Remove a specific payment from a category
 */
exports.deletePayment = async (req, res, next) => {
  try {
    const { id, paymentId } = req.params;

    const item = await PersonalPayment.findById(id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Category not found.' });
    }

    const pEntry = item.payments.find((p) => String(p._id) === String(paymentId));
    if (pEntry && pEntry.chequeId) {
      if (pEntry.isEndorsedCheque) {
        await Cheque.findByIdAndUpdate(pEntry.chequeId, {
          status: 'In Hand',
          givenTo: undefined,
          endorsedDate: undefined,
        });
      } else {
        await Cheque.findByIdAndDelete(pEntry.chequeId);
      }
    }

    item.payments = item.payments.filter((p) => String(p._id) !== String(paymentId));
    await item.save();

    await logActivity({
      req,
      action: 'DELETE',
      module: 'PersonalPayment',
      description: `Deleted payment from category ${item.categoryName}`,
      documentId: item._id,
      newValue: item,
    });

    res.json({
      success: true,
      data: item,
      message: 'Payment removed successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/personal-payments/:id
 * Delete or Cancel a category
 */
exports.delete = async (req, res, next) => {
  try {
    const { id } = req.params;
    const item = await PersonalPayment.findById(id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Category not found.' });
    }

    if (item.payments && item.payments.length > 0) {
      item.status = 'Cancelled';
      await item.save();
    } else {
      await PersonalPayment.findByIdAndDelete(id);
    }

    await logActivity({
      req,
      action: 'DELETE',
      module: 'PersonalPayment',
      description: `Cancelled/deleted category ${item.categoryName}`,
      documentId: item._id,
    });

    res.json({
      success: true,
      message: 'Category cancelled/deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
