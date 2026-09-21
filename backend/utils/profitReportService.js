const { startOfDay, endOfDay } = require('date-fns');
const Order = require('../models/Order');
const RawMaterial = require('../models/RawMaterial');
const JobWork = require('../models/JobWork');
const Expense = require('../models/Expense');
const ConsumptionMaterial = require('../models/ConsumptionMaterial');
const SystemSettings = require('../models/SystemSettings');

const SHIPLET_COIL = 'Shiplet Coil';
const PATRI_COIL = 'Patri Coil';

function dateRange(startDate, endDate) {
  const range = {};
  if (startDate) range.$gte = startOfDay(new Date(startDate));
  if (endDate) range.$lte = endOfDay(new Date(endDate));
  return range;
}

function withDate(field, startDate, endDate) {
  const range = dateRange(startDate, endDate);
  return Object.keys(range).length ? { [field]: range } : {};
}

function sum(rows, field) {
  return rows.reduce((total, row) => total + (Number(row[field]) || 0), 0);
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function matchesCoilCategory(coilCategory, targetCategory) {
  if (!targetCategory) return true; // Combined
  if (targetCategory === SHIPLET_COIL) return String(coilCategory || '').includes('Shiplet');
  if (targetCategory === PATRI_COIL) return String(coilCategory || '').includes('Patri');
  return true;
}

function getOrderWeight(order) {
  if (order.finalWeightKg > 0) return order.finalWeightKg;
  if (order.initialWeightKg > 0) return order.initialWeightKg;
  return 0;
}

// Helper to determine coil category for order
function getOrderCategory(order) {
  // Use coilCategory field if available, otherwise assume Shiplet
  if (order.coilCategory && order.coilCategory.includes('Patri')) return PATRI_COIL;
  return SHIPLET_COIL;
}

/**
 * Reconstruct FIFO opening stock for our own coil.
 */
async function getOurOpeningStock(category, startDate) {
  if (!startDate) return []; 
  const sDate = startOfDay(new Date(startDate));
  const PeriodClose = require('../models/PeriodClose');
  const latestClose = await PeriodClose.findOne({
    closeDate: { $lte: endOfDay(sDate) },
    status: 'Completed'
  }).sort({ closeDate: -1 }).lean();

  const dawnOfTime = latestClose ? startOfDay(new Date(latestClose.closeDate)) : new Date(0);


  // Find all lots purchased between dawnOfTime and sDate
  let query = { 
    $or: [
      { purchaseDate: { $gte: dawnOfTime, $lt: sDate }, isOpeningBalance: { $ne: true } },
      { purchaseDate: { $gte: dawnOfTime, $lte: endOfDay(sDate) }, isOpeningBalance: true }
    ],
    isReturn: false 
  };
  if (category) {
    if (category === SHIPLET_COIL) {
      query.$or = [{ coilCategory: SHIPLET_COIL }, { coilCategory: { $exists: false } }, { coilCategory: null }];
    } else {
      query.coilCategory = PATRI_COIL;
    }
  }
  const lots = await RawMaterial.find(query).sort({ purchaseDate: 1 }).lean();

  // Find all orders sold between dawnOfTime and sDate
  let orderQuery = { orderDate: { $gte: dawnOfTime, $lt: sDate } };
  const orders = await Order.find(orderQuery).lean();
  let netSold = 0;
  for (const o of orders) {
    const oCat = getOrderCategory(o);
    if (category && oCat !== category) continue;
    
    const w = getOrderWeight(o);
    if (o.isReturn) netSold -= w;
    else netSold += w;
  }

  // Find all coil returns to supplier between dawnOfTime and sDate
  let returnQuery = { purchaseDate: { $gte: dawnOfTime, $lt: sDate }, isReturn: true };
  if (category) {
    if (category === SHIPLET_COIL) {
      returnQuery.$or = [{ coilCategory: SHIPLET_COIL }, { coilCategory: { $exists: false } }, { coilCategory: null }];
    } else {
      returnQuery.coilCategory = PATRI_COIL;
    }
  }
  const returnsToSupplier = await RawMaterial.find(returnQuery).lean();
  const returnedToSupplierKg = sum(returnsToSupplier, 'weightInKg');

  let deductedSoFar = netSold + returnedToSupplierKg;
  const openingLots = [];

  for (const lot of lots) {
    let lotOpening = lot.weightInKg || 0;
    if (deductedSoFar >= lot.weightInKg) {
      lotOpening = 0;
      deductedSoFar -= lot.weightInKg;
    } else if (deductedSoFar > 0) {
      lotOpening = lot.weightInKg - deductedSoFar;
      deductedSoFar = 0;
    }

    if (lotOpening > 0) {
      openingLots.push({
        _id: lot._id,
        ratePerKg: lot.ratePerKg || 0,
        openingStockKg: lotOpening,
        category: lot.coilCategory || SHIPLET_COIL
      });
    }
  }
  return openingLots;
}

function getProcessingStats(jobWorks, category, sDate, eDate) {
  let openingKg = 0;
  let arrivalsPeriodKg = 0;
  let deliveriesPeriodKg = 0;
  let labourIncome = 0;
  let excessRevenue = 0;

  for (const job of jobWorks) {
    if (!matchesCoilCategory(job.coilCategory, category)) continue;

    const arrivedDate = job.arrivalDate;
    const isBeforeStart = sDate && arrivedDate < sDate;
    const isInPeriod = arrivedDate >= sDate && arrivedDate <= eDate;

    if (isBeforeStart) openingKg += (job.arrivedWeightKg || 0);
    if (isInPeriod) arrivalsPeriodKg += (job.arrivedWeightKg || 0);

    for (const del of (job.deliveries || [])) {
      const delDate = del.deliveredDate || arrivedDate;
      const delWeight = del.weightKg || 0;
      if (sDate && delDate < sDate) {
        openingKg -= delWeight;
      } else if (delDate >= sDate && delDate <= eDate) {
        deliveriesPeriodKg += delWeight;
        labourIncome += (del.labourAmount || 0);
      }
    }
    for (const ret of (job.returns || [])) {
      const retDate = ret.returnedDate || arrivedDate;
      const retWeight = ret.weightKg || 0;
      if (sDate && retDate < sDate) {
        openingKg -= retWeight;
      }
    }
    for (const exc of (job.excessDeliveries || [])) {
      const excDate = exc.deliveryDate || arrivedDate;
      const excWeight = exc.excessWeightKg || 0;
      if (sDate && excDate < sDate) {
        openingKg -= excWeight;
      } else if (excDate >= sDate && excDate <= eDate) {
        deliveriesPeriodKg += excWeight;
        excessRevenue += (exc.totalSaleAmount || 0);
      }
    }
  }

  return {
    openingKg: Math.max(0, openingKg),
    arrivalsPeriodKg,
    deliveriesPeriodKg,
    labourIncome,
    excessRevenue,
  };
}

async function buildProfitReport({ startDate, endDate } = {}) {
  const setting = await SystemSettings.findOne({ key: 'wastePercentage' });
  const wastePercentage = setting?.value ?? 5;

  const sDate = startDate ? startOfDay(new Date(startDate)) : new Date(0);
  const eDate = endDate ? endOfDay(new Date(endDate)) : new Date();

  const PeriodClose = require('../models/PeriodClose');
  const latestClose = await PeriodClose.findOne({
    closeDate: { $lte: eDate },
    status: 'Completed'
  }).sort({ closeDate: -1 }).lean();
  const dawnOfTime = latestClose ? startOfDay(new Date(latestClose.closeDate)) : new Date(0);

  const jobWorks = await JobWork.find({ arrivalDate: { $gte: dawnOfTime } }).lean();
  const purchasesPeriod = await RawMaterial.find({ 
    ...withDate('purchaseDate', startDate, endDate), 
    isReturn: false,
    isOpeningBalance: { $ne: true }
  }).lean();
  const returnsPeriod = await RawMaterial.find({ 
    ...withDate('purchaseDate', startDate, endDate), 
    isReturn: true,
    isOpeningBalance: { $ne: true }
  }).lean();
  const ordersPeriod = await Order.find({ ...withDate('orderDate', startDate, endDate) }).lean();
  const factoryExpenses = await Expense.find({ ...withDate('expenseDate', startDate, endDate), expenseGroup: { $ne: 'Self Expense' } }).lean();
  const selfExpenses = await Expense.find({ ...withDate('expenseDate', startDate, endDate), expenseGroup: 'Self Expense' }).lean();
  const consumptionMaterials = await ConsumptionMaterial.find({ ...withDate('purchaseDate', startDate, endDate) }).lean();

  async function calcCategory(catKey) {
    const ourOpeningLots = await getOurOpeningStock(catKey, startDate);
    const procStats = getProcessingStats(jobWorks, catKey, sDate, eDate);

    const ourOpeningKg = sum(ourOpeningLots, 'openingStockKg');
    const ourOpeningValue = ourOpeningLots.reduce((acc, lot) => acc + (lot.openingStockKg * lot.ratePerKg), 0);

    const catPurchases = purchasesPeriod.filter(r => matchesCoilCategory(r.coilCategory, catKey));
    const ourPurchasesKg = sum(catPurchases, 'weightInKg');
    const ourPurchasesValue = catPurchases.reduce((acc, lot) => acc + (lot.weightInKg * lot.ratePerKg), 0);

    const catReturns = returnsPeriod.filter(r => matchesCoilCategory(r.coilCategory, catKey));
    const coilReturnsKg = sum(catReturns, 'weightInKg');

    // Our Weighted Average Rate (from our opening + our purchases)
    let ourAvgRate = 0;
    const ourTotalKg = ourOpeningKg + ourPurchasesKg;
    if (ourTotalKg > 0) {
      ourAvgRate = (ourOpeningValue + ourPurchasesValue) / ourTotalKg;
    }

    const openingStockKg = ourOpeningKg + procStats.openingKg;
    const purchasesKg = ourPurchasesKg + procStats.arrivalsPeriodKg;
    const returnsKg = coilReturnsKg; 

    const totalAvailableKg = openingStockKg + purchasesKg - returnsKg;
    const weightedAvgPurchaseRate = ourAvgRate; 

    // Wire Sold
    const catOrders = ordersPeriod.filter(o => getOrderCategory(o) === catKey);
    const soldOrders = catOrders.filter(o => !o.isReturn);
    const returnOrders = catOrders.filter(o => o.isReturn);

    let ourWireSoldKg = 0;
    let ourWireSoldValue = 0;
    for (const o of soldOrders) {
      const w = getOrderWeight(o);
      ourWireSoldKg += w;
      ourWireSoldValue += (w * (o.ratePerKg || 0));
    }

    let ourWireReturnsKg = 0;
    let ourWireReturnCredits = 0;
    for (const o of returnOrders) {
      const w = getOrderWeight(o);
      ourWireReturnsKg += w;
      ourWireReturnCredits += (w * (o.ratePerKg || 0));
    }

    const wireSoldKg = ourWireSoldKg + procStats.deliveriesPeriodKg;
    const wireReturnsKg = ourWireReturnsKg;
    
    const weightedAvgSaleRate = ourWireSoldKg > 0 ? ourWireSoldValue / ourWireSoldKg : 0;

    const costOfWireSold = wireSoldKg * weightedAvgPurchaseRate;
    const revenue = (ourWireSoldKg * weightedAvgSaleRate);

    const closingStockKg = Math.max(0, totalAvailableKg - wireSoldKg);
    const closingStockValue = closingStockKg * weightedAvgPurchaseRate;

    return {
      openingStockKg: round2(openingStockKg),
      purchasesKg: round2(purchasesKg),
      returnsKg: round2(returnsKg),
      totalAvailableKg: round2(totalAvailableKg),
      weightedAvgPurchaseRate: round2(weightedAvgPurchaseRate),
      wireSoldKg: round2(wireSoldKg),
      wireReturnsKg: round2(wireReturnsKg),
      weightedAvgSaleRate: round2(weightedAvgSaleRate),
      costOfWireSold: round2(costOfWireSold),
      revenue: round2(revenue),
      closingStockKg: round2(closingStockKg),
      closingStockValue: round2(closingStockValue),
      
      labourIncome: round2(procStats.labourIncome),
      excessDeliveryRevenue: round2(procStats.excessRevenue),
      wireReturnCredits: round2(ourWireReturnCredits)
    };
  }

  const shiplet = await calcCategory(SHIPLET_COIL);
  const patri = await calcCategory(PATRI_COIL);

  const combined = {
    openingStockKg: round2(shiplet.openingStockKg + patri.openingStockKg),
    purchasesKg: round2(shiplet.purchasesKg + patri.purchasesKg),
    returnsKg: round2(shiplet.returnsKg + patri.returnsKg),
    totalAvailableKg: round2(shiplet.totalAvailableKg + patri.totalAvailableKg),
    
    wireSoldKg: round2(shiplet.wireSoldKg + patri.wireSoldKg),
    wireReturnsKg: round2(shiplet.wireReturnsKg + patri.wireReturnsKg),
    
    costOfWireSold: round2(shiplet.costOfWireSold + patri.costOfWireSold),
    
    labourIncome: round2(shiplet.labourIncome + patri.labourIncome),
    excessDeliveryRevenue: round2(shiplet.excessDeliveryRevenue + patri.excessDeliveryRevenue),
    wireReturnCredits: round2(shiplet.wireReturnCredits + patri.wireReturnCredits),
    
    closingStockKg: round2(shiplet.closingStockKg + patri.closingStockKg),
  };

  const ourTotalOpeningLots = await getOurOpeningStock(null, startDate);
  const ourOpeningKg = sum(ourTotalOpeningLots, 'openingStockKg');
  const ourOpeningValue = ourTotalOpeningLots.reduce((acc, lot) => acc + (lot.openingStockKg * lot.ratePerKg), 0);
  const ourPurchasesKg = sum(purchasesPeriod, 'weightInKg');
  const ourPurchasesValue = purchasesPeriod.reduce((acc, lot) => acc + (lot.weightInKg * lot.ratePerKg), 0);
  
  let combinedPurchaseAvg = 0;
  if (ourOpeningKg + ourPurchasesKg > 0) {
    combinedPurchaseAvg = (ourOpeningValue + ourPurchasesValue) / (ourOpeningKg + ourPurchasesKg);
  }
  combined.weightedAvgPurchaseRate = round2(combinedPurchaseAvg);

  combined.costOfWireSold = round2(combined.wireSoldKg * combinedPurchaseAvg);

  const soldOrders = ordersPeriod.filter(o => !o.isReturn);
  let ourWireSoldKg = 0;
  let ourWireSoldValue = 0;
  for (const o of soldOrders) {
    const w = getOrderWeight(o);
    ourWireSoldKg += w;
    ourWireSoldValue += (w * (o.ratePerKg || 0));
  }
  combined.weightedAvgSaleRate = ourWireSoldKg > 0 ? round2(ourWireSoldValue / ourWireSoldKg) : 0;

  combined.revenue = round2(shiplet.revenue + patri.revenue);
  combined.totalRevenue = round2(combined.revenue + combined.labourIncome + combined.excessDeliveryRevenue - combined.wireReturnCredits);

  combined.grossProfit = round2(combined.totalRevenue - combined.costOfWireSold);

  combined.wastePercentage = wastePercentage;
  combined.wasteAmount = round2(combined.costOfWireSold * (wastePercentage / 100));

  // Add wastage to cost of wire sold
  combined.costOfWireSold = round2(combined.costOfWireSold + combined.wasteAmount);

  // Recalculate gross profit
  combined.grossProfit = round2(combined.totalRevenue - combined.costOfWireSold);

  combined.factoryExpenses = round2(sum(factoryExpenses, 'amount'));
  combined.consumptionCost = round2(sum(consumptionMaterials, 'totalCost'));

  combined.operatingProfit = round2(combined.grossProfit - combined.factoryExpenses - combined.consumptionCost);

  combined.selfExpenses = round2(sum(selfExpenses, 'amount'));
  combined.finalNetProfit = round2(combined.operatingProfit - combined.selfExpenses);

  combined.closingStockValue = round2(combined.closingStockKg * combined.weightedAvgPurchaseRate);

  return {
    period: { startDate, endDate },
    shiplet,
    patri,
    combined,
    processingStock: {
      totalPoolKg: round2(
        getProcessingStats(jobWorks, SHIPLET_COIL, sDate, eDate).openingKg + 
        getProcessingStats(jobWorks, SHIPLET_COIL, sDate, eDate).arrivalsPeriodKg -
        getProcessingStats(jobWorks, SHIPLET_COIL, sDate, eDate).deliveriesPeriodKg +
        getProcessingStats(jobWorks, PATRI_COIL, sDate, eDate).openingKg + 
        getProcessingStats(jobWorks, PATRI_COIL, sDate, eDate).arrivalsPeriodKg -
        getProcessingStats(jobWorks, PATRI_COIL, sDate, eDate).deliveriesPeriodKg
      ),
      rate: round2(combinedPurchaseAvg)
    },
    averageRates: {
      shipletPurchaseAvg: shiplet.weightedAvgPurchaseRate,
      patriPurchaseAvg: patri.weightedAvgPurchaseRate,
      combinedPurchaseAvg: combined.weightedAvgPurchaseRate,
      shipletSaleAvg: shiplet.weightedAvgSaleRate,
      patriSaleAvg: patri.weightedAvgSaleRate,
      combinedSaleAvg: combined.weightedAvgSaleRate
    }
  };
}

module.exports = {
  buildProfitReport,
  dateRange,
  withDate,
};
