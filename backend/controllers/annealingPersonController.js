const AnnealingPerson = require('../models/AnnealingPerson');
const { logActivity } = require('../utils/activityLogService');

exports.getAll = async (req, res, next) => {
  try {
    const persons = await AnnealingPerson.find().sort({ name: 1 });
    res.json({ success: true, data: persons });
  } catch (error) {
    next(error);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const person = await AnnealingPerson.findById(req.params.id);
    if (!person) return res.status(404).json({ success: false, message: 'Person not found' });
    res.json({ success: true, data: person });
  } catch (error) {
    next(error);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { name, contactNumber, openingBalance, openingBalanceType, openingBalanceDate } = req.body;
    
    let initialDue = 0;
    if (openingBalance > 0 && openingBalanceType === 'credit') {
      initialDue = openingBalance;
    } else if (openingBalance > 0 && openingBalanceType === 'debit') {
      initialDue = -openingBalance;
    }

    const person = await AnnealingPerson.create({
      name,
      contactNumber,
      openingBalance: openingBalance || 0,
      openingBalanceType: openingBalanceType || 'none',
      openingBalanceDate: openingBalanceDate || new Date(),
      totalAmountDue: initialDue,
    });

    await logActivity({
      req,
      action: 'CREATE',
      module: 'AnnealingPerson',
      description: `Added annealing person ${person.name}`,
      documentId: person._id,
      newValue: person,
    });

    res.status(201).json({ success: true, data: person, message: 'Annealing person added' });
  } catch (error) {
    next(error);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { name, contactNumber } = req.body;
    const person = await AnnealingPerson.findByIdAndUpdate(
      req.params.id,
      { name, contactNumber },
      { new: true, runValidators: true }
    );
    if (!person) return res.status(404).json({ success: false, message: 'Person not found' });

    await logActivity({
      req,
      action: 'UPDATE',
      module: 'AnnealingPerson',
      description: `Updated annealing person ${person.name}`,
      documentId: person._id,
      newValue: person,
    });

    res.json({ success: true, data: person, message: 'Person updated' });
  } catch (error) {
    next(error);
  }
};

exports.delete = async (req, res, next) => {
  try {
    const person = await AnnealingPerson.findByIdAndDelete(req.params.id);
    if (!person) return res.status(404).json({ success: false, message: 'Person not found' });

    await logActivity({
      req,
      action: 'DELETE',
      module: 'AnnealingPerson',
      description: `Deleted annealing person ${person.name}`,
      documentId: person._id,
      previousValue: person,
    });

    res.json({ success: true, message: 'Person deleted' });
  } catch (error) {
    next(error);
  }
};

exports.addPayment = async (req, res, next) => {
  try {
    const { amount, paymentMethod, note, paidBy, paymentDate, isIncreaseDue } = req.body;
    const person = await AnnealingPerson.findById(req.params.id);
    if (!person) return res.status(404).json({ success: false, message: 'Person not found' });

    const paymentAmount = Number(amount) || 0;
    
    // If isIncreaseDue is true, we are just adding to the total due (recording a bill)
    if (isIncreaseDue) {
      person.totalAmountDue += paymentAmount;
      person.paymentHistory.push({
        amount: paymentAmount,
        paymentDate: paymentDate || new Date(),
        paymentMethod: 'Cash', // N/A
        note: note || 'Bill Added',
        paidBy: paidBy || '',
      });
    } else {
      // Regular payment (decreases due, increases total paid)
      person.totalAmountPaid += paymentAmount;
      person.totalAmountDue -= paymentAmount;
      person.paymentHistory.push({
        amount: paymentAmount,
        paymentDate: paymentDate || new Date(),
        paymentMethod: paymentMethod || 'Cash',
        note: note || 'Payment Made',
        paidBy: paidBy || '',
      });
    }

    await person.save();

    await logActivity({
      req,
      action: 'UPDATE',
      module: 'AnnealingPerson',
      description: isIncreaseDue 
        ? `Added bill of Rs.${paymentAmount} to annealing person ${person.name}`
        : `Recorded payment of Rs.${paymentAmount} to annealing person ${person.name}`,
      documentId: person._id,
      newValue: { addedAmount: paymentAmount, isIncreaseDue },
    });

    res.json({ success: true, data: person, message: isIncreaseDue ? 'Bill recorded successfully' : 'Payment recorded successfully' });
  } catch (error) {
    next(error);
  }
};
