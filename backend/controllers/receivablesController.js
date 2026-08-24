const Customer = require('../models/Customer');
const JobWork = require('../models/JobWork');
const PersonalPayment = require('../models/PersonalPayment');
const Transaction = require('../models/Transaction');
const Order = require('../models/Order');

/**
 * GET /api/receivables/summary
 * Aggregates all receivables (customer dues, processing labour dues, personal committee receivables)
 */
exports.getSummary = async (req, res, next) => {
  try {
    const { startDate, endDate, search } = req.query;

    // 1. Customer Receivables
    const customerFilter = { totalAmountDue: { $gt: 0 } };
    if (search) {
      customerFilter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { contactNumber: { $regex: search, $options: 'i' } },
      ];
    }
    const customers = await Customer.find(customerFilter).sort({ totalAmountDue: -1 }).lean();

    // Attach latest activity date (since)
    const customerIds = customers.map((c) => c._id);
    const lastTxns = await Transaction.aggregate([
      { $match: { relatedId: { $in: customerIds } } },
      { $sort: { transactionDate: -1 } },
      {
        $group: {
          _id: '$relatedId',
          lastDate: { $first: '$transactionDate' },
        },
      },
    ]);
    const txnDateMap = new Map();
    lastTxns.forEach((t) => txnDateMap.set(String(t._id), t.lastDate));

    const enrichedCustomers = customers.map((c) => ({
      ...c,
      sinceDate: txnDateMap.get(String(c._id)) || c.updatedAt || c.createdAt,
    }));

    const customerAccounts = enrichedCustomers.filter((c) => c.customerType !== 'Processing');
    const processingAccounts = enrichedCustomers.filter((c) => c.customerType === 'Processing');

    const totalCustomerDue = customerAccounts.reduce((sum, c) => sum + (c.totalAmountDue || 0), 0);
    const totalProcessingDue = processingAccounts.reduce((sum, c) => sum + (c.totalAmountDue || 0), 0);

    // 2. JobWork Delivery Details for Processing
    const jobWorks = await JobWork.find({
      deliveredWeightKg: { $gt: 0 },
      labourTotal: { $gt: 0 },
    })
      .populate('customerId', 'name contactNumber totalAmountDue')
      .sort({ updatedAt: -1 })
      .lean();

    const processingDeliveries = [];
    jobWorks.forEach((jw) => {
      (jw.deliveries || []).forEach((del) => {
        processingDeliveries.push({
          _id: del._id,
          jobWorkId: jw._id,
          customerId: jw.customerId?._id || jw.customerId,
          customerName: jw.customerId?.name || jw.customerName || 'Processing Customer',
          wireNumber: del.wireNumber,
          weightKg: del.weightKg,
          labourRatePerKg: del.labourRatePerKg,
          labourAmount: del.labourAmount,
          deliveredDate: del.deliveredDate,
          customerAmountDue: jw.customerId?.totalAmountDue || 0,
        });
      });
    });

    // 3. Personal Payments Receivables (Committees & Savings)
    let personalPayments = [];
    try {
      personalPayments = await PersonalPayment.find({ status: 'Active', paymentDirection: { $ne: 'Payable' } })
        .sort({ expectedReceiveDate: 1 })
        .lean();
    } catch {
      personalPayments = [];
    }

    const totalPersonalLumpSum = personalPayments.reduce((sum, p) => sum + (p.expectedLumpSum || 0), 0);
    const totalPersonalContributed = personalPayments.reduce((sum, p) => sum + (p.totalContributed || 0), 0);

    // Grand Total Receivables
    const totalBusinessReceivables = totalCustomerDue + totalProcessingDue;
    const grandTotalReceivables = totalBusinessReceivables + totalPersonalLumpSum;

    res.json({
      success: true,
      data: {
        customers: customerAccounts,
        processingCustomers: processingAccounts,
        processingDeliveries: processingDeliveries.slice(0, 50),
        personalPayments,
        totals: {
          totalCustomerDue,
          totalProcessingDue,
          totalBusinessReceivables,
          totalPersonalLumpSum,
          totalPersonalContributed,
          grandTotalReceivables,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};
