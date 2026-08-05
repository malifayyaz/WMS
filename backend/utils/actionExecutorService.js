const Order = require("../models/Order");
const Customer = require("../models/Customer");
const Supplier = require("../models/Supplier");
const Transaction = require("../models/Transaction");
const Expense = require("../models/Expense");
const RawMaterial = require("../models/RawMaterial");
const ReadyStock = require("../models/ReadyStock");
const AnnealingRecord = require("../models/AnnealingRecord");
const JobWork = require("../models/JobWork");
const Worker = require("../models/Worker");
const WorkerLedgerEntry = require("../models/WorkerLedgerEntry");

const {
  syncTransactionFromOrder,
  syncTransactionFromRawMaterial,
  recalcCustomerTotals,
  recalcSupplierTotals,
  createLinkedExpenseForBankTransfer,
  SELF_EXPENSE_GROUP,
} = require("./transactionSyncService");
const {
  deductStockByCategory,
  fulfillPendingOrdersFromNewStock,
  refreshLowStockAlerts,
} = require("./stockService");
const { applyOpeningBalanceToTotals } = require("./ledgerService");
const {
  getCoilCategoryForWire,
  getWireLabel,
  COIL_CATEGORIES,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_TREE,
} = require("./wireConfig");
const { orderTotalAndDue } = require("./calculations");
const {
  feedPatriFactoryStock,
  releaseAnnealingForSale,
} = require("../controllers/annealingController");
const mongoose = require("mongoose");

function formatRs(n) {
  return Number(n || 0).toLocaleString("en-PK");
}

function escapeRegex(str) {
  return String(str || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Pull a real Mongo ObjectId from LLM junk like "Imran Shahdra (id:6a62...)" */
function extractObjectId(value) {
  if (!value) return null;
  if (typeof value === "object") {
    if (value._id) return extractObjectId(value._id);
    if (typeof value.toString === "function" && mongoose.isValidObjectId(value)) {
      return String(value);
    }
  }
  const s = String(value).trim();
  if (mongoose.isValidObjectId(s) && /^[a-fA-F0-9]{24}$/.test(s)) return s;
  const m = s.match(/\b([a-fA-F0-9]{24})\b/);
  return m ? m[1] : null;
}

function cleanPartyName(name) {
  return String(name || "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameEqualsFilter(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return null;
  // Strip trailing "(id:...)" if LLM put that in the name field
  const cleaned = trimmed.replace(/\s*\(id:[a-fA-F0-9]{24}\)\s*$/i, "").trim();
  if (!cleaned) return null;
  return { name: new RegExp(`^${escapeRegex(cleaned)}$`, "i") };
}

function businessTodayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
}

/**
 * Date to use when the user did not mention one.
 * Follows the date currently selected in Daily Book (sent by the client),
 * falling back to today.
 */
function defaultEntryDate(data = {}) {
  return parseOptionalDate(data.defaultDate) || businessTodayUtc();
}

function parseOptionalDate(...candidates) {
  for (const c of candidates) {
    if (!c) continue;
    const d = new Date(c);
    if (!Number.isNaN(d.getTime())) {
      // Normalize to UTC midnight for calendar-day consistency with WMS
      return new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0)
      );
    }
  }
  return null;
}

/** Only keep an explicit user note — never the raw command text. */
function cleanOptionalNote(value, userMessageHint) {
  const v = String(value || "").trim();
  if (!v) return "";
  const lower = v.toLowerCase();
  const msg = String(userMessageHint || "").trim().toLowerCase();
  if (msg && lower === msg) return "";
  if (/^(add|record|create|expense|payment|order|purchase|send|arrive)\b/i.test(v)) {
    return "";
  }
  if (/^(rs\.?\s*)?\d+(\.\d+)?(\s*(rs|rupees?))?$/i.test(v)) return "";
  return v;
}

function normalizePaymentMethod(method) {
  if (!method) return "Cash";
  const m = String(method).toLowerCase();
  if (m.includes("bank") || m === "transfer") return "Bank Transfer";
  if (m.includes("cheque") || m.includes("check")) return "Cheque";
  return "Cash";
}

function resolveBankAccount(data, defaultAccount = "MBL") {
  const allowedBanks = ["MBL", "UBL", "Faisal Bank", "Other"];
  let bankAccount = data.bankAccount || defaultAccount;
  if (!allowedBanks.includes(bankAccount)) {
    const lower = String(bankAccount).toLowerCase();
    if (lower.includes("ubl")) bankAccount = "UBL";
    else if (lower.includes("faisal")) bankAccount = "Faisal Bank";
    else if (lower.includes("other")) bankAccount = "Other";
    else bankAccount = defaultAccount;
  }
  if (bankAccount === "Other" && !String(data.bankAccountOtherName || "").trim()) {
    throw new Error("Please provide the bank / account name when using Other");
  }
  return bankAccount;
}

function bankAccountLabel(bankAccount, otherName) {
  return bankAccount === "Other" ? otherName : bankAccount;
}

function resolveCoilCategory(coilTypeOrCategory, wireNumber) {
  if (coilTypeOrCategory === COIL_CATEGORIES.SHIPLET || coilTypeOrCategory === COIL_CATEGORIES.PATRI) {
    return coilTypeOrCategory;
  }
  const lower = String(coilTypeOrCategory || "").toLowerCase();
  if (lower.includes("patri") || lower.includes("binding")) return COIL_CATEGORIES.PATRI;
  if (lower.includes("shiplet") || lower.includes("number")) return COIL_CATEGORIES.SHIPLET;
  if (wireNumber != null) return getCoilCategoryForWire(wireNumber);
  return COIL_CATEGORIES.SHIPLET;
}

const CATEGORY_TO_GROUP = {};
Object.entries(EXPENSE_CATEGORY_TREE).forEach(([group, cats]) => {
  cats.forEach((cat) => {
    CATEGORY_TO_GROUP[cat] = group;
  });
});

const EXPENSE_CATEGORY_SYNONYMS = {
  fayyaz: "Fayyaz Expense",
  fayaz: "Fayyaz Expense",
  faisal: "Faisal Expense",
  mutual: "Mutual Expense",
  salary: "Labour Salary",
  advance: "Labour Advance",
  tea: "Labour Tea",
  food: "Labour Food",
  annealing: "Annealing",
  electricity: "Electricity",
  rent: "Coil Rental",
  rental: "Coil Rental",
  petrol: "Petrol Labour",
  office: "Office Expense",
  miscellaneous: "Miscellaneous",
  misc: "Miscellaneous",
};

async function findCustomer(data) {
  const id = extractObjectId(data.customerId);
  if (id) {
    const byId = await Customer.findById(id);
    if (byId) return byId;
  }
  const filter = nameEqualsFilter(data.customerName || data.customerId);
  return filter ? Customer.findOne(filter) : null;
}

async function findSupplier(data) {
  const id = extractObjectId(data.supplierId);
  if (id) {
    const byId = await Supplier.findById(id);
    if (byId) return byId;
  }
  const rawName = data.supplierName || data.relatedName || data.supplierId;
  const candidates = [rawName, cleanPartyName(rawName)].filter(Boolean);
  for (const candidate of candidates) {
    const filter = nameEqualsFilter(candidate);
    if (filter) {
      const found = await Supplier.findOne(filter);
      if (found) return found;
    }
  }
  const cleaned = cleanPartyName(rawName);
  if (cleaned) {
    const escaped = escapeRegex(cleaned);
    const partial = await Supplier.findOne({
      $or: [
        { name: new RegExp(escaped, "i") },
        { companyName: new RegExp(escaped, "i") },
      ],
    });
    if (partial) return partial;
  }
  return null;
}

async function findWorker(data) {
  const id = extractObjectId(data.workerId);
  if (id) {
    const byId = await Worker.findById(id);
    if (byId) return byId;
  }
  const filter = nameEqualsFilter(data.workerName || data.workerId);
  return filter ? Worker.findOne(filter) : null;
}

async function resolvePartyFields(data) {
  const partyType = data.partyType || "None";
  const partyId = extractObjectId(data.partyId);
  if (!partyId || partyType === "None") {
    return { partyType: "None", partyId: undefined, partyName: "" };
  }
  if (partyType === "Supplier") {
    const s = await Supplier.findById(partyId);
    if (!s) throw new Error("Annealing party (supplier) not found");
    return { partyType, partyId: s._id, partyName: s.name };
  }
  if (partyType === "Customer") {
    const c = await Customer.findById(partyId);
    if (!c) throw new Error("Annealing party (customer) not found");
    return { partyType, partyId: c._id, partyName: c.name };
  }
  return { partyType: "None", partyId: undefined, partyName: "" };
}

const DELETE_TYPES = [
  "payment",
  "expense",
  "order",
  "purchase",
  "worker payment",
  "transaction",
];

function normalizeDeleteType(value) {
  const v = String(value || "").toLowerCase().trim();
  if (!v || v === "any" || v === "entry" || v === "record") return "any";
  if (/worker|salary|mazdoor/.test(v)) return "worker payment";
  if (/payment|receipt|wusool/.test(v)) return "payment";
  if (/expense|kharch/.test(v)) return "expense";
  if (/order|sale/.test(v)) return "order";
  if (/purchase|raw|coil/.test(v)) return "purchase";
  if (/transaction|money/.test(v)) return "transaction";
  return "any";
}

function dayRangeFilter(date) {
  if (!date) return null;
  const end = new Date(date.getTime() + 24 * 60 * 60 * 1000);
  return { $gte: date, $lt: end };
}

function shortDate(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

async function fuzzyFindByName(Model, name) {
  const cleaned = String(name || "")
    .replace(/\s*\(id:[a-fA-F0-9]{24}\)\s*$/i, "")
    .trim();
  if (!cleaned) return null;
  return (
    (await Model.findOne({ name: new RegExp(`^${escapeRegex(cleaned)}$`, "i") })) ||
    (await Model.findOne({ name: new RegExp(escapeRegex(cleaned), "i") }))
  );
}

/**
 * Find existing records that match a delete request.
 * Returns candidates only — nothing is removed here.
 */
async function findDeletableEntries(data = {}) {
  const type = normalizeDeleteType(data.entryType || data.recordType);
  const date = parseOptionalDate(
    data.date,
    data.transactionDate,
    data.expenseDate,
    data.orderDate,
    data.purchaseDate
  );
  const range = dayRangeFilter(date);
  const amount = Number(data.amount) > 0 ? Number(data.amount) : null;
  const partyName = String(
    data.customerName ||
      data.supplierName ||
      data.workerName ||
      data.partyName ||
      data.relatedName ||
      ""
  ).trim();

  const [customer, supplier, worker] = await Promise.all([
    (async () =>
      (await findCustomer(data)) ||
      (partyName ? fuzzyFindByName(Customer, partyName) : null))(),
    (async () =>
      (await findSupplier(data)) ||
      (partyName ? fuzzyFindByName(Supplier, partyName) : null))(),
    (async () =>
      (await findWorker(data)) ||
      (partyName ? fuzzyFindByName(Worker, partyName) : null))(),
  ]);

  if (partyName && !customer && !supplier && !worker) {
    return { partyNotFound: partyName, matches: [] };
  }

  const wanted = type === "any" ? DELETE_TYPES.filter((t) => t !== "payment") : [type];
  const matches = [];

  const wantsTxn = wanted.includes("payment") || wanted.includes("transaction");
  if (wantsTxn && !worker) {
    const filter = {
      // Mirrored rows must be removed through their source record
      sourceType: { $nin: ["Order", "RawMaterial", "Expense", "ConsumptionMaterial"] },
    };
    if (wanted.includes("payment") && !wanted.includes("transaction")) {
      filter.transactionType = "Money In";
    }
    if (customer) {
      filter.relatedTo = "Customer";
      filter.relatedId = customer._id;
    } else if (supplier) {
      filter.relatedTo = "Supplier";
      filter.relatedId = supplier._id;
    }
    if (amount) filter.amount = amount;
    if (range) filter.transactionDate = range;

    const rows = await Transaction.find(filter).sort({ transactionDate: -1 }).limit(10).lean();
    rows.forEach((t) => {
      matches.push({
        model: "Transaction",
        id: String(t._id),
        date: t.transactionDate,
        label: `${t.transactionType === "Money In" ? "Payment received" : "Money out"} Rs.${formatRs(
          t.amount
        )}${t.relatedName ? ` — ${t.relatedName}` : ""} (${t.paymentMethod || "Cash"}) on ${shortDate(
          t.transactionDate
        )}`,
      });
    });
  }

  if (wanted.includes("expense") && !customer && !supplier && !worker) {
    const filter = {};
    if (amount) filter.amount = amount;
    if (range) filter.expenseDate = range;
    const category = data.expenseCategory || data.selfExpensePerson;
    if (category) {
      filter.expenseCategory = new RegExp(escapeRegex(String(category).split(" ")[0]), "i");
    }
    const rows = await Expense.find(filter).sort({ expenseDate: -1 }).limit(10).lean();
    rows.forEach((e) => {
      matches.push({
        model: "Expense",
        id: String(e._id),
        date: e.expenseDate,
        label: `Expense Rs.${formatRs(e.amount)} — ${e.expenseCategory || e.expenseGroup || "expense"} on ${shortDate(
          e.expenseDate
        )}`,
      });
    });
  }

  if (wanted.includes("order") && !supplier && !worker) {
    const filter = {};
    if (customer) filter.customerId = customer._id;
    if (amount) filter.totalAmount = amount;
    if (range) filter.orderDate = range;
    const rows = await Order.find(filter).sort({ orderDate: -1 }).limit(10).lean();
    rows.forEach((o) => {
      matches.push({
        model: "Order",
        id: String(o._id),
        date: o.orderDate,
        label: `Order ${o.initialWeightKg}kg ${getWireLabel(o.wireNumber) || o.wireType || ""} for ${
          o.customerName || "customer"
        } — Rs.${formatRs(o.totalAmount)} on ${shortDate(o.orderDate)}`,
      });
    });
  }

  if (wanted.includes("purchase") && !customer && !worker) {
    const filter = {};
    if (supplier) filter.supplierId = supplier._id;
    if (amount) filter.totalAmount = amount;
    if (range) filter.purchaseDate = range;
    const rows = await RawMaterial.find(filter).sort({ purchaseDate: -1 }).limit(10).lean();
    rows.forEach((r) => {
      matches.push({
        model: "RawMaterial",
        id: String(r._id),
        date: r.purchaseDate,
        label: `Purchase ${r.weightInKg}kg ${r.coilCategory || ""} from ${
          r.supplierName || "supplier"
        } — Rs.${formatRs(r.totalAmount)} on ${shortDate(r.purchaseDate)}`,
      });
    });
  }

  if (wanted.includes("worker payment") && !customer && !supplier) {
    const filter = {};
    if (worker) filter.workerId = worker._id;
    if (amount) filter.amount = amount;
    if (range) filter.date = range;
    const rows = await WorkerLedgerEntry.find(filter).sort({ date: -1 }).limit(10).lean();
    rows.forEach((w) => {
      matches.push({
        model: "WorkerLedgerEntry",
        id: String(w._id),
        date: w.date,
        label: `Worker ${w.entryType || "Payment"} Rs.${formatRs(w.amount)}${
          worker ? ` — ${worker.name}` : ""
        } on ${shortDate(w.date)}`,
      });
    });
  }

  matches.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  return { partyNotFound: null, matches: matches.slice(0, 6) };
}

/**
 * Find records whose date can be shifted (expenses v1).
 */
async function findShiftableEntries(data = {}) {
  const entryType = normalizeDeleteType(data.entryType || "expense");
  const fromDate = parseOptionalDate(data.fromDate);
  if (!fromDate) return { matches: [] };

  const range = dayRangeFilter(fromDate);
  const matches = [];

  if (entryType === "expense" || entryType === "any") {
    const rows = await Expense.find({ expenseDate: range })
      .sort({ expenseCategory: 1, amount: -1 })
      .limit(50)
      .lean();
    rows.forEach((e) => {
      matches.push({
        model: "Expense",
        id: String(e._id),
        date: e.expenseDate,
        label: `Expense Rs.${formatRs(e.amount)} — ${e.expenseCategory || e.expenseGroup || "expense"} on ${shortDate(
          e.expenseDate
        )}`,
      });
    });
  }

  return { matches };
}

/**
 * Execute a confirmed AI agent action against live models.
 * @param {string} intent
 * @param {object} extractedData
 * @param {string} [userId]
 */
async function executeAction(intent, extractedData = {}, userId) {
  try {
    const data = { ...(extractedData || {}) };
    // Sanitize LLM id fields like "Name (id:abc...)"
    ["customerId", "supplierId", "workerId", "partyId", "relatedId", "orderId"].forEach(
      (key) => {
        if (data[key] != null) {
          const cleaned = extractObjectId(data[key]);
          if (cleaned) data[key] = cleaned;
          else if (typeof data[key] === "string" && /\(id:/i.test(data[key])) {
            // Invalid composite id — drop so name lookup can run
            delete data[key];
          }
        }
      }
    );
    if (data.customerName) {
      data.customerName = String(data.customerName)
        .replace(/\s*\(id:[a-fA-F0-9]{24}\)\s*$/i, "")
        .trim();
    }
    if (data.supplierName) {
      data.supplierName = String(data.supplierName)
        .replace(/\s*\(id:[a-fA-F0-9]{24}\)\s*$/i, "")
        .trim();
    }
    if (data.workerName) {
      data.workerName = String(data.workerName)
        .replace(/\s*\(id:[a-fA-F0-9]{24}\)\s*$/i, "")
        .trim();
    }

    switch (intent) {
      case "CREATE_ORDER": {
        const customer = await findCustomer(data);
        if (!customer) throw new Error("Customer not found");

        const wireNumber = Number(data.wireNumber);
        if (!wireNumber || wireNumber < 1 || wireNumber > 20) {
          throw new Error("Valid wire number (1-20) is required");
        }
        const initialWeightKg = Number(data.initialWeightKg);
        const ratePerKg = Number(data.ratePerKg);
        if (!initialWeightKg || initialWeightKg <= 0) throw new Error("Valid weight is required");
        if (ratePerKg == null || Number.isNaN(ratePerKg) || ratePerKg < 0) {
          throw new Error("Valid rate per kg is required");
        }

        const coilCategory = resolveCoilCategory(data.coilCategory, wireNumber);
        const amountPaid = Number(data.amountPaid) || 0;
        const { totalAmount, amountDue } = orderTotalAndDue(initialWeightKg, ratePerKg, amountPaid);

        let stockResult = { deductedKg: 0, pendingKg: 0, sufficient: true };
        if (coilCategory) {
          stockResult = await deductStockByCategory(coilCategory, initialWeightKg);
        }

        const orderDate =
          parseOptionalDate(data.orderDate, data.date) || defaultEntryDate(data);

        const orderPayload = {
          customerId: customer._id,
          customerName: customer.name,
          wireNumber,
          wireType: getWireLabel(wireNumber),
          coilCategory,
          initialWeightKg,
          ratePerKg,
          totalAmount,
          amountPaid: customer.customerType === "Daily" ? totalAmount : amountPaid,
          amountDue: customer.customerType === "Daily" ? 0 : amountDue,
          orderStatus: "Outer",
          soldBy: data.soldBy || "",
          notes: cleanOptionalNote(data.notes || ""),
          stockDeductedKg: stockResult.deductedKg,
          stockPendingKg: stockResult.pendingKg,
          lowStockAlert: !stockResult.sufficient,
          bundles: Number(data.bundles) || 0,
          orderDate,
          paymentMethod: data.paymentMethod
            ? normalizePaymentMethod(data.paymentMethod)
            : undefined,
        };

        const order = await Order.create(orderPayload);

        if (customer.customerType === "Daily") {
          await syncTransactionFromOrder(order, customer.name);
        }
        await recalcCustomerTotals(customer._id);

        return {
          success: true,
          savedDoc: order,
          message: `Order created for ${customer.name}`,
          undoInfo: { model: "Order", id: order._id },
        };
      }

      case "RECORD_CUSTOMER_PAYMENT": {
        const customer = await findCustomer(data);
        if (!customer) throw new Error("Customer not found");

        const amount = Number(data.amount);
        if (!amount || amount <= 0) throw new Error("Valid payment amount is required");

        const paymentMethod = normalizePaymentMethod(data.paymentMethod);
        // Daily Book style Manual tx — never attach orderId (ledger skips those)
        const transaction = await Transaction.create({
          transactionType: "Money In",
          relatedTo: "Customer",
          relatedId: customer._id,
          relatedName: customer.name,
          amount,
          paymentMethod,
          description: cleanOptionalNote(data.notes || data.description || ""),
          handledBy: data.receivedBy || "",
          sourceType: "Manual",
          transactionDate:
            parseOptionalDate(data.transactionDate, data.paymentDate, data.date) ||
            defaultEntryDate(data),
        });

        await recalcCustomerTotals(customer._id);

        return {
          success: true,
          savedDoc: transaction,
          message: `Payment of Rs.${formatRs(amount)} recorded from ${customer.name}`,
          undoInfo: { model: "Transaction", id: transaction._id },
        };
      }

      case "CREATE_RAW_MATERIAL_PURCHASE": {
        const supplier = await findSupplier(data);
        if (!supplier) throw new Error("Supplier not found");

        const coilCategory = resolveCoilCategory(data.coilCategory);
        const weightInKg = Number(data.weightInKg);
        const ratePerKg = Number(data.ratePerKg);
        if (!weightInKg || weightInKg <= 0) throw new Error("Valid weight is required");
        if (ratePerKg == null || Number.isNaN(ratePerKg) || ratePerKg < 0) {
          throw new Error("Valid rate per kg is required");
        }

        const totalAmount = weightInKg * ratePerKg;
        const amountPaid = Number(data.amountPaid) || 0;
        const amountDue = totalAmount - amountPaid;
        const purchaseDate =
          parseOptionalDate(data.purchaseDate, data.date) || defaultEntryDate(data);

        const rawMaterial = await RawMaterial.create({
          supplierId: supplier._id,
          supplierName: supplier.name,
          coilCategory,
          materialType: coilCategory,
          weightInKg,
          ratePerKg,
          totalAmount,
          amountPaid,
          amountDue,
          paymentMethod: data.paymentMethod
            ? normalizePaymentMethod(data.paymentMethod)
            : undefined,
          paidBy: data.paidBy || "",
          bundles: Number(data.bundles) || 0,
          currentStock: weightInKg,
          notes: cleanOptionalNote(data.notes || ""),
          purchaseDate,
          isReturn: false,
        });

        await Supplier.findByIdAndUpdate(supplier._id, {
          $addToSet: { materialTypes: coilCategory },
        });
        await syncTransactionFromRawMaterial(rawMaterial, supplier.name);
        await recalcSupplierTotals(supplier._id);
        await fulfillPendingOrdersFromNewStock(coilCategory);
        await refreshLowStockAlerts(coilCategory);

        return {
          success: true,
          savedDoc: rawMaterial,
          message: `Purchase of ${weightInKg}kg ${coilCategory} recorded`,
          undoInfo: { model: "RawMaterial", id: rawMaterial._id },
        };
      }

      case "ADD_EXPENSE": {
        const amount = Number(data.amount);
        if (!amount || amount <= 0) throw new Error("Valid expense amount is required");

        let expenseCategory = String(data.expenseCategory || "Miscellaneous").trim();
        let expenseGroup = String(data.expenseGroup || "Operations").trim();

        const personHint = [
          data.selfExpensePerson,
          expenseCategory,
          expenseGroup,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        const isSelf =
          Boolean(data.selfExpensePerson) ||
          /^self/i.test(expenseGroup) ||
          /\bfayyaz\b|\bfayaz\b|\bfaisal\b|\bmutual\b|\bself\b/.test(personHint);

        if (isSelf) {
          expenseGroup = "Self Expense";
          if (/\bfaisal\b/.test(personHint)) expenseCategory = "Faisal Expense";
          else if (/\bmutual\b/.test(personHint)) expenseCategory = "Mutual Expense";
          else expenseCategory = "Fayyaz Expense";
        } else {
          const key = expenseCategory.toLowerCase();
          if (EXPENSE_CATEGORY_SYNONYMS[key]) {
            expenseCategory = EXPENSE_CATEGORY_SYNONYMS[key];
          } else {
            const syn = Object.entries(EXPENSE_CATEGORY_SYNONYMS).find(([hint]) =>
              key.includes(hint)
            );
            if (syn) expenseCategory = syn[1];
          }
          if (CATEGORY_TO_GROUP[expenseCategory]) {
            expenseGroup = CATEGORY_TO_GROUP[expenseCategory];
          } else if (!EXPENSE_CATEGORIES.includes(expenseCategory)) {
            throw new Error(
              `Unknown expense category "${expenseCategory}". Please use a known category.`
            );
          }
        }

        if (!EXPENSE_CATEGORIES.includes(expenseCategory)) {
          throw new Error(
            `Invalid expense category "${expenseCategory}". Please try again with a clearer category.`
          );
        }

        const paymentMethod = normalizePaymentMethod(data.paymentMethod);
        const description = cleanOptionalNote(data.description || data.notes || "");
        const expenseDate =
          parseOptionalDate(data.expenseDate, data.date) || defaultEntryDate(data);

        // Bank-paid expenses must create a bank Transaction + linked Expense
        // (same as Daily Book → Bank Transfer → record as expense).
        if (paymentMethod === "Bank Transfer") {
          const bankAccount = resolveBankAccount(data);
          const txnDescription = description
            ? `Bank payment — ${expenseCategory}: ${description}`
            : `Bank payment — ${expenseCategory}`;

          const transaction = await Transaction.create({
            transactionType: "Money Out",
            amount,
            paymentMethod: "Bank Transfer",
            relatedTo: "Other",
            relatedName:
              expenseGroup === SELF_EXPENSE_GROUP ? expenseCategory : "Factory Expense",
            description: txnDescription,
            handledBy: data.addedBy || data.handledBy || "",
            sourceType: "Manual",
            bankAccount,
            bankAccountOtherName:
              bankAccount === "Other" ? data.bankAccountOtherName : undefined,
            bankAccountNumber: data.bankAccountNumber || undefined,
            transactionDate: expenseDate,
            expenseGroup,
            expenseCategory,
          });

          await createLinkedExpenseForBankTransfer(transaction, {
            expenseGroup,
            expenseCategory,
            description: txnDescription,
            handledBy: data.addedBy || data.handledBy || "",
          });

          const bankLabel = bankAccountLabel(bankAccount, data.bankAccountOtherName);

          return {
            success: true,
            savedDoc: await Transaction.findById(transaction._id),
            message: `Bank expense of Rs.${formatRs(amount)} recorded — ${expenseCategory} (deducted from ${bankLabel})`,
            undoInfo: { model: "Transaction", id: transaction._id },
          };
        }

        const expense = await Expense.create({
          expenseGroup,
          expenseCategory,
          amount,
          paymentMethod,
          description,
          labourName: data.labourName || "",
          addedBy: data.addedBy || "",
          expenseDate,
        });

        return {
          success: true,
          savedDoc: expense,
          message: `Expense of Rs.${formatRs(amount)} added (${expenseCategory})`,
          undoInfo: { model: "Expense", id: expense._id },
        };
      }

      case "ATM_WITHDRAWAL": {
        const amount = Number(data.amount);
        if (!amount || amount <= 0) throw new Error("Valid ATM amount is required");

        const bankAccount = resolveBankAccount(data);

        const personHint = String(
          data.selfExpensePerson || data.expenseCategory || ""
        ).toLowerCase();
        let expenseCategory = "Fayyaz Expense";
        if (personHint.includes("faisal")) expenseCategory = "Faisal Expense";
        else if (personHint.includes("mutual")) expenseCategory = "Mutual Expense";
        else if (personHint.includes("fayyaz") || personHint.includes("fayaz")) {
          expenseCategory = "Fayyaz Expense";
        } else if (
          ["Fayyaz Expense", "Faisal Expense", "Mutual Expense"].includes(
            data.expenseCategory
          )
        ) {
          expenseCategory = data.expenseCategory;
        }

        const note = cleanOptionalNote(data.description || data.notes || "");
        const txnDate =
          parseOptionalDate(data.transactionDate, data.expenseDate, data.date) ||
          defaultEntryDate(data);

        const transaction = await Transaction.create({
          transactionType: "Money Out",
          amount,
          paymentMethod: "Bank Transfer",
          relatedTo: "Other",
          relatedName: "ATM Withdrawal",
          description: note
            ? `ATM — ${expenseCategory}: ${note}`
            : `ATM — ${expenseCategory}`,
          handledBy: data.handledBy || data.addedBy || "",
          sourceType: "Manual",
          bankAccount,
          bankAccountOtherName:
            bankAccount === "Other" ? data.bankAccountOtherName : undefined,
          bankAccountNumber: data.bankAccountNumber || undefined,
          transactionDate: txnDate,
          expenseGroup: SELF_EXPENSE_GROUP,
          expenseCategory,
        });

        await createLinkedExpenseForBankTransfer(transaction, {
          expenseGroup: SELF_EXPENSE_GROUP,
          expenseCategory,
          description: transaction.description,
          handledBy: data.handledBy || data.addedBy || "",
        });

        const bankLabel = bankAccountLabel(bankAccount, data.bankAccountOtherName);

        return {
          success: true,
          savedDoc: await Transaction.findById(transaction._id),
          message: `ATM withdrawal of Rs.${formatRs(amount)} — deducted from ${bankLabel}, added to ${expenseCategory}`,
          undoInfo: { model: "Transaction", id: transaction._id },
        };
      }

      case "ADD_DAILY_TRANSACTION": {
        const amount = Number(data.amount);
        if (!amount || amount <= 0) throw new Error("Valid amount is required");

        const transactionType =
          String(data.transactionType || "").toLowerCase().includes("out")
            ? "Money Out"
            : "Money In";

        let relatedTo = data.relatedTo || "Other";
        if (!["Customer", "Supplier", "Other"].includes(relatedTo)) relatedTo = "Other";

        let relatedId = extractObjectId(data.relatedId);
        let relatedName = data.relatedName || data.supplierName || data.customerName || "";

        if (relatedTo === "Customer") {
          const customer = await findCustomer({
            customerId: data.customerId,
            customerName: relatedName,
          });
          if (!customer) {
            throw new Error(
              relatedName
                ? `Customer "${cleanPartyName(relatedName) || relatedName}" not found`
                : "Customer not found"
            );
          }
          relatedId = customer._id;
          relatedName = customer.name;
        } else if (relatedTo === "Supplier") {
          const supplier = await findSupplier({
            supplierId: data.supplierId,
            supplierName: relatedName,
          });
          if (!supplier) {
            throw new Error(
              relatedName
                ? `Supplier "${cleanPartyName(relatedName) || relatedName}" not found`
                : "Supplier not found"
            );
          }
          relatedId = supplier._id;
          relatedName = supplier.name;
        }

        const transaction = await Transaction.create({
          transactionType,
          amount,
          paymentMethod: normalizePaymentMethod(data.paymentMethod),
          relatedTo,
          relatedId,
          relatedName,
          description: cleanOptionalNote(data.description || ""),
          handledBy: data.handledBy || data.receivedBy || "",
          sourceType: "Manual",
          transactionDate:
            parseOptionalDate(data.transactionDate, data.date) || defaultEntryDate(data),
        });

        if (relatedTo === "Customer" && relatedId) await recalcCustomerTotals(relatedId);
        if (relatedTo === "Supplier" && relatedId) await recalcSupplierTotals(relatedId);

        return {
          success: true,
          savedDoc: transaction,
          message: `${transactionType} of Rs.${formatRs(amount)} recorded${relatedName ? ` for ${relatedName}` : ""}`,
          undoInfo: { model: "Transaction", id: transaction._id },
        };
      }

      case "SEND_ANNEALING": {
        const coilCategory = resolveCoilCategory(data.coilType || data.coilCategory);
        const weightKg = Number(data.weightKg) || 0;
        const bundles = Number(data.bundles) || 0;
        if (!weightKg && !bundles) throw new Error("Weight or bundles required");

        const party = await resolvePartyFields(data);
        const record = await AnnealingRecord.create({
          entryType: "Send",
          ...party,
          materialType: "Coil",
          coilCategory,
          weightKg,
          bundles,
          date: parseOptionalDate(data.sentDate, data.date) || defaultEntryDate(data),
          notes: cleanOptionalNote(data.notes || ""),
        });

        return {
          success: true,
          savedDoc: record,
          message: `${weightKg || bundles}${weightKg ? "kg" : " bundles"} ${coilCategory} sent to annealing`,
          undoInfo: { model: "AnnealingRecord", id: record._id },
        };
      }

      case "ARRIVE_ANNEALING": {
        const coilCategory = resolveCoilCategory(data.coilType || data.coilCategory);
        const finalWeightKg = Number(data.weightKg) || 0;
        if (!finalWeightKg) throw new Error("Arrival weight is required");

        const weightLossKg = Number(data.weightLossKg) || 0;
        const initialWeightKg = finalWeightKg + weightLossKg;
        const bundles = Number(data.bundles) || 0;
        const party = await resolvePartyFields(data);

        const record = await AnnealingRecord.create({
          entryType: "Arrival",
          ...party,
          materialType: "Coil",
          coilCategory,
          weightKg: initialWeightKg,
          finalWeightKg,
          weightLossKg,
          bundles,
          date: parseOptionalDate(data.arrivedDate, data.date) || defaultEntryDate(data),
          notes: cleanOptionalNote(data.notes || ""),
        });

        await feedPatriFactoryStock(record);

        return {
          success: true,
          savedDoc: record,
          message: `${finalWeightKg}kg arrived from annealing`,
          undoInfo: { model: "AnnealingRecord", id: record._id },
        };
      }

      case "ADD_PROCESSING_DELIVERY": {
        const customer = await findCustomer(data);
        if (!customer) throw new Error("Customer not found");

        const weightKg = Number(data.weightKg);
        if (!weightKg || weightKg <= 0) throw new Error("Valid delivery weight is required");

        const labourAmount = Number(data.labourAmount) || 0;
        const labourRatePerKg =
          labourAmount > 0
            ? Math.round((labourAmount / weightKg) * 100) / 100
            : Number(data.labourRatePerKg) || 0;

        if (!labourRatePerKg || labourRatePerKg <= 0) {
          return {
            success: false,
            message: "Labour amount or labour rate per kg is required for processing delivery",
          };
        }

        const jobWork = await JobWork.findOne({
          customerId: customer._id,
          status: { $in: ["In Stock", "Partially Delivered"] },
        }).sort({ arrivalDate: -1 });

        if (!jobWork) {
          return {
            success: false,
            message:
              "No open processing lot found for this customer. Record coil arrival first, then deliver.",
          };
        }

        const remaining = (jobWork.arrivedWeightKg || 0) - (jobWork.deliveredWeightKg || 0);
        if (weightKg > remaining + 0.001) {
          return {
            success: false,
            message: `Only ${remaining.toFixed(2)} kg remaining in processing stock for this lot`,
          };
        }

        const coilRatePerKg = jobWork.coilRatePerKg || 0;
        const computedLabour =
          labourAmount > 0
            ? labourAmount
            : Math.round(weightKg * labourRatePerKg * 100) / 100;
        const deliveryGroupId = new mongoose.Types.ObjectId();

        jobWork.deliveries.push({
          weightKg,
          labourRatePerKg,
          labourAmount: computedLabour,
          coilRatePerKg,
          sellingRatePerKg: Math.round((coilRatePerKg + labourRatePerKg) * 100) / 100,
          deliveredDate:
            parseOptionalDate(data.deliveryDate, data.date) || defaultEntryDate(data),
          notes: cleanOptionalNote(data.notes || ""),
          deliveryGroupId,
          isGroupPrimary: true,
        });
        await jobWork.save();
        await recalcCustomerTotals(customer._id);

        const delivery = jobWork.deliveries[jobWork.deliveries.length - 1];

        return {
          success: true,
          savedDoc: jobWork,
          message: `Processing delivery of ${weightKg}kg recorded`,
          undoInfo: {
            model: "JobWork",
            id: jobWork._id,
            deliveryId: delivery._id,
          },
        };
      }

      case "ADD_CUSTOMER": {
        const name = String(data.name || "").trim();
        if (!name) throw new Error("Customer name is required");

        const existing = await Customer.findOne(nameEqualsFilter(name));
        if (existing) {
          return { success: false, message: "Customer already exists" };
        }

        const openingBalance = Number(data.openingBalance) || 0;
        let openingBalanceType = data.openingBalanceType || "none";
        if (!["debit", "credit", "none"].includes(openingBalanceType)) {
          openingBalanceType = openingBalance > 0 ? "debit" : "none";
        }

        let customerType = data.customerType || "Ledger";
        if (!["Ledger", "Daily", "Processing"].includes(customerType)) {
          customerType = "Ledger";
        }

        const createBody = {
          name,
          contactNumber: data.contactNumber || "",
          address: data.address || "",
          customerType,
          openingBalance: customerType === "Daily" ? 0 : openingBalance,
          openingBalanceType: customerType === "Daily" ? "none" : openingBalanceType,
        };

        if (
          customerType !== "Daily" &&
          openingBalance > 0 &&
          openingBalanceType !== "none"
        ) {
          Object.assign(
            createBody,
            applyOpeningBalanceToTotals("Customer", openingBalance, openingBalanceType)
          );
        }

        const customer = await Customer.create(createBody);

        return {
          success: true,
          savedDoc: customer,
          message: `Customer ${name} added successfully`,
          undoInfo: { model: "Customer", id: customer._id },
        };
      }

      case "ADD_SUPPLIER": {
        const name = String(data.name || "").trim();
        if (!name) throw new Error("Supplier name is required");

        const existing = await Supplier.findOne(nameEqualsFilter(name));
        if (existing) {
          return { success: false, message: "Supplier already exists" };
        }

        const openingBalance = Number(data.openingBalance) || 0;
        const openingBalanceType =
          openingBalance > 0 ? data.openingBalanceType || "credit" : "none";

        const createBody = {
          name,
          contactNumber: data.contactNumber || "",
          companyName: data.companyName || "",
          address: data.address || "",
          openingBalance,
          openingBalanceType,
        };

        if (openingBalance > 0 && openingBalanceType !== "none") {
          Object.assign(
            createBody,
            applyOpeningBalanceToTotals("Supplier", openingBalance, openingBalanceType)
          );
        }

        const supplier = await Supplier.create(createBody);

        return {
          success: true,
          savedDoc: supplier,
          message: `Supplier ${name} added successfully`,
          undoInfo: { model: "Supplier", id: supplier._id },
        };
      }

      case "ADD_READY_STOCK": {
        const wireNumber = Number(data.wireNumber);
        if (!wireNumber || wireNumber < 1 || wireNumber > 20) {
          throw new Error("Valid wire number (1-20) is required");
        }
        const producedWeightKg = Number(data.producedWeightKg || data.weightKg);
        if (!producedWeightKg || producedWeightKg <= 0) {
          throw new Error("Valid produced weight is required");
        }

        const stock = await ReadyStock.create({
          wireNumber,
          wireLabel: getWireLabel(wireNumber),
          coilCategory: getCoilCategoryForWire(wireNumber),
          weightKg: producedWeightKg,
          source: "Direct Production",
          productionDate:
            parseOptionalDate(data.productionDate, data.date) || defaultEntryDate(data),
          notes: [
            cleanOptionalNote(data.notes || ""),
            data.producedBy ? `Produced by: ${data.producedBy}` : "",
            data.manufacturingCostPerKg
              ? `Mfg cost: ${data.manufacturingCostPerKg}/kg`
              : "",
          ]
            .filter(Boolean)
            .join(" | "),
        });

        return {
          success: true,
          savedDoc: stock,
          message: `${producedWeightKg}kg wire #${wireNumber} added to ready stock`,
          undoInfo: { model: "ReadyStock", id: stock._id },
        };
      }

      case "ADD_WORKER_PAYMENT": {
        const worker = await findWorker(data);
        if (!worker) throw new Error("Worker not found");

        const amount = Number(data.amount);
        if (!amount || amount <= 0) throw new Error("Valid amount is required");

        let entryType = data.entryType || "Payment";
        if (!["Payment", "Advance", "Adjustment", "SalaryDue"].includes(entryType)) {
          entryType = "Payment";
        }

        const entryDate =
          parseOptionalDate(data.weekEndDate, data.weekStartDate, data.date) ||
          defaultEntryDate(data);
        const notes = cleanOptionalNote(data.notes || "");

        const entry = await WorkerLedgerEntry.create({
          workerId: worker._id,
          entryType,
          amount,
          paymentMethod: ["Payment", "Advance"].includes(entryType)
            ? normalizePaymentMethod(data.paymentMethod)
            : undefined,
          notes,
          date: entryDate,
        });

        if (["Payment", "Advance"].includes(entryType)) {
          const expense = await Expense.create({
            expenseGroup: "Labour",
            expenseCategory:
              entryType === "Payment" ? "Labour Salary" : "Labour Advance",
            description:
              notes ||
              `${entryType === "Payment" ? "Salary payment" : "Advance paid"} to ${worker.name}`,
            amount,
            paymentMethod: normalizePaymentMethod(data.paymentMethod),
            expenseDate: entryDate,
            labourName: worker.name,
          });
          entry.expenseId = expense._id;
          await entry.save();
        }

        return {
          success: true,
          savedDoc: entry,
          message: `Payment of Rs.${formatRs(amount)} recorded for ${worker.name}`,
          undoInfo: { model: "WorkerLedgerEntry", id: entry._id },
        };
      }

      case "SHIFT_ENTRY_DATE": {
        const fromDate = parseOptionalDate(data.fromDate);
        const toDate = parseOptionalDate(data.toDate);
        if (!fromDate || !toDate) {
          throw new Error("Both source date and target date are required");
        }
        if (fromDate.getTime() === toDate.getTime()) {
          throw new Error("Source and target dates must be different");
        }

        let ids = Array.isArray(data.ids)
          ? data.ids.map((id) => extractObjectId(id) || String(id)).filter(Boolean)
          : [];
        if (!ids.length) {
          const { matches } = await findShiftableEntries(data);
          if (!matches.length) {
            throw new Error(`No expenses found on ${shortDate(fromDate)}`);
          }
          ids = matches.map((m) => m.id);
        }

        let moved = 0;
        for (const id of ids) {
          const expense = await Expense.findById(id);
          if (!expense) continue;
          expense.expenseDate = toDate;
          await expense.save();
          if (expense.bankTransactionId) {
            await Transaction.findByIdAndUpdate(expense.bankTransactionId, {
              transactionDate: toDate,
            });
          }
          moved += 1;
        }

        if (!moved) throw new Error("No expenses were moved");

        return {
          success: true,
          savedDoc: null,
          message: `Moved ${moved} expense(s) from ${shortDate(fromDate)} to ${shortDate(toDate)}`,
          undoInfo: null,
        };
      }

      case "DELETE_ENTRY": {
        // Preview already resolved the exact record; re-resolve if it did not.
        let model = data.model;
        let targetId = extractObjectId(data.id || data.targetId);

        if (!model || !targetId) {
          const { matches, partyNotFound } = await findDeletableEntries(data);
          if (partyNotFound) {
            throw new Error(`No customer, supplier or worker named "${partyNotFound}" found`);
          }
          if (matches.length === 0) throw new Error("No matching entry found to delete");
          if (matches.length > 1) {
            throw new Error(
              "More than one entry matches — please mention the amount or exact date"
            );
          }
          model = matches[0].model;
          targetId = matches[0].id;
        }

        const { undoAction } = require("./undoService");
        const result = await undoAction(model, targetId, {
          deliveryId: data.deliveryId,
        });
        if (!result.success) throw new Error(result.message || "Delete failed");

        return {
          success: true,
          savedDoc: null,
          message: data.label ? `Deleted: ${data.label}` : result.message,
          undoInfo: null,
        };
      }

      default:
        return { success: false, message: "Unknown action" };
    }
  } catch (error) {
    console.error("executeAction error:", error);
    return { success: false, message: error.message || "Action failed" };
  }
}

module.exports = { executeAction, findDeletableEntries, findShiftableEntries };
