/**
 * Business logic helpers for order amounts, inventory, profit/loss.
 */

/**
 * Calculate order total and due from weight and rate.
 * @param {number} weightKg - finalWeightKg or initialWeightKg
 * @param {number} ratePerKg
 * @param {number} amountPaid
 */
function orderTotalAndDue(weightKg, ratePerKg, amountPaid = 0) {
  const total = weightKg * ratePerKg;
  return { totalAmount: total, amountDue: total - amountPaid };
}

/**
 * Manufacturing cost for an order.
 */
function manufacturingCost(finalWeightKg, manufacturingCostPerKg) {
  return (finalWeightKg || 0) * (manufacturingCostPerKg || 0);
}

module.exports = { orderTotalAndDue, manufacturingCost };
