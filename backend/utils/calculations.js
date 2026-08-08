/**
 * Business logic helpers for order amounts, inventory, profit/loss.
 */

/**
 * Calculate order total and due from weight and rate.
 * @param {number} weightKg - finalWeightKg or initialWeightKg
 * @param {number} ratePerKg
 * @param {number} amountPaid
 */
function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function orderTotalAndDue(weightKg, ratePerKg, amountPaid = 0) {
  const total = round2((Number(weightKg) || 0) * (Number(ratePerKg) || 0));
  const paid = Number(amountPaid) || 0;
  return { totalAmount: total, amountDue: Math.max(0, round2(total - paid)) };
}

/**
 * Manufacturing cost for an order.
 */
function manufacturingCost(finalWeightKg, manufacturingCostPerKg) {
  return (finalWeightKg || 0) * (manufacturingCostPerKg || 0);
}

module.exports = { orderTotalAndDue, manufacturingCost };
