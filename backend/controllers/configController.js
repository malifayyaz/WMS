const {
  WIRE_DEFINITIONS,
  COIL_CATEGORIES,
  CONSUMPTION_MATERIAL_TYPES,
  RENTAL_ROUTES,
  EXPENSE_CATEGORY_TREE,
  EXPENSE_CATEGORIES,
  getWiresForCoilCategory,
} = require('../utils/wireConfig');

const getWireConfig = async (req, res) => {
  res.json({
    success: true,
    data: {
      wires: WIRE_DEFINITIONS,
      coilCategories: [
        { name: COIL_CATEGORIES.SHIPLET, wires: getWiresForCoilCategory(COIL_CATEGORIES.SHIPLET).map((w) => w.number) },
        { name: COIL_CATEGORIES.PATRI, wires: getWiresForCoilCategory(COIL_CATEGORIES.PATRI).map((w) => w.number) },
      ],
      consumptionMaterialTypes: CONSUMPTION_MATERIAL_TYPES,
      rentalRoutes: RENTAL_ROUTES,
      expenseCategoryTree: EXPENSE_CATEGORY_TREE,
      expenseCategories: EXPENSE_CATEGORIES,
    },
  });
};

module.exports = { getWireConfig };
