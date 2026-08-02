const COIL_CATEGORIES = {
  SHIPLET: 'Shiplet Coil',
  PATRI: 'Patri Coil',
};

const CONSUMPTION_MATERIAL_TYPES = ['Acid', 'Dye', 'Soap', 'Stationary'];

const RENTAL_ROUTES = [
  'Mill to Bhatti',
  'Bhatti to Factory',
  'Factory to Bhatti',
  'Bhatti to Market',
];

const EXPENSE_CATEGORY_TREE = {
  Labour: ['Labour Salary', 'Labour Advance', 'Labour Tea', 'Labour Food', 'Petrol Labour', 'Miscellaneous'],
  Rental: ['Coil Rental', 'Wire Rental', 'Miscellaneous'],
  Operations: ['Weight Scale Payment', 'Hardware Maintenance', 'Electricity', 'Office Expense', 'Miscellaneous'],
  Manufacturing: ['Annealing', 'Miscellaneous'],
  'Self Expense': ['Fayyaz Expense', 'Faisal Expense', 'Mutual Expense'],
  'Factory Expense Total': ['Daily Total'],
  'Process Material': [...CONSUMPTION_MATERIAL_TYPES, 'Miscellaneous'],
};

const FACTORY_EXPENSE_GROUPS = ['Labour', 'Rental', 'Operations', 'Manufacturing', 'Process Material'];
const SELF_EXPENSE_GROUP = 'Self Expense';

const LEGACY_EXPENSE_CATEGORIES = ['Salary', 'Bills', 'Maintenance', 'Manufacturing', 'Other'];
const EXPENSE_CATEGORIES = [...Object.values(EXPENSE_CATEGORY_TREE).flat(), ...LEGACY_EXPENSE_CATEGORIES];

const WIRE_DEFINITIONS = Array.from({ length: 19 }, (_, i) => ({
  number: i + 1,
  name: `Wire #${i + 1}`,
  coilCategory: COIL_CATEGORIES.SHIPLET,
})).concat({
  number: 20,
  name: 'Binding Wire #20',
  coilCategory: COIL_CATEGORIES.PATRI,
});

function getCoilCategoryForWire(wireNumber) {
  const n = Number(wireNumber);
  if (n === 20) return COIL_CATEGORIES.PATRI;
  if (n >= 1 && n <= 19) return COIL_CATEGORIES.SHIPLET;
  return null;
}

function getWireDefinition(wireNumber) {
  return WIRE_DEFINITIONS.find((w) => w.number === Number(wireNumber)) || null;
}

function getWireLabel(wireNumber) {
  const def = getWireDefinition(wireNumber);
  return def ? def.name : `Wire #${wireNumber}`;
}

function getWiresForCoilCategory(coilCategory) {
  return WIRE_DEFINITIONS.filter((w) => w.coilCategory === coilCategory);
}

module.exports = {
  COIL_CATEGORIES,
  CONSUMPTION_MATERIAL_TYPES,
  RENTAL_ROUTES,
  EXPENSE_CATEGORY_TREE,
  EXPENSE_CATEGORIES,
  FACTORY_EXPENSE_GROUPS,
  SELF_EXPENSE_GROUP,
  WIRE_DEFINITIONS,
  getCoilCategoryForWire,
  getWireDefinition,
  getWireLabel,
  getWiresForCoilCategory,
};
