const { format, parse, isValid } = require("date-fns");
const Customer = require("../models/Customer");
const Supplier = require("../models/Supplier");
const RawMaterial = require("../models/RawMaterial");
const Expense = require("../models/Expense");
const ConsumptionMaterial = require("../models/ConsumptionMaterial");
const Order = require("../models/Order");
const { buildProfitReport } = require("../utils/profitReportService");
const { getCashBookForDate } = require("../utils/cashBookService");
const { currentBankBalance } = require("../utils/bankBalanceService");
const groq = require("../utils/groqClient");

function includesAny(text, keywords) {
  return keywords.some((kw) => text.includes(kw));
}

const MONTH_NAMES = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** WMS stores business calendar dates as UTC midnight — query with UTC day/month bounds. */
function formatUtcDMY(d) {
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

function formatUtcMonthLabel(year, monthIndex) {
  return `${MONTH_LABELS[monthIndex]} ${year}`;
}

function utcDayPeriod(year, monthIndex, day) {
  return {
    startDate: new Date(Date.UTC(year, monthIndex, day, 0, 0, 0, 0)),
    endDate: new Date(Date.UTC(year, monthIndex, day, 23, 59, 59, 999)),
    label: `${String(day).padStart(2, "0")}/${String(monthIndex + 1).padStart(2, "0")}/${year}`,
    kind: "day",
  };
}

function utcMonthPeriod(year, monthIndex) {
  return {
    startDate: new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0)),
    endDate: new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999)),
    label: formatUtcMonthLabel(year, monthIndex),
    kind: "month",
  };
}

function utcRangePeriod(startYmd, endYmd) {
  return {
    startDate: new Date(Date.UTC(startYmd.y, startYmd.m, startYmd.d, 0, 0, 0, 0)),
    endDate: new Date(Date.UTC(endYmd.y, endYmd.m, endYmd.d, 23, 59, 59, 999)),
    label: `${String(startYmd.d).padStart(2, "0")}/${String(startYmd.m + 1).padStart(2, "0")}/${startYmd.y} to ${String(endYmd.d).padStart(2, "0")}/${String(endYmd.m + 1).padStart(2, "0")}/${endYmd.y}`,
    kind: "range",
  };
}

function ymdFromLocalParsed(date) {
  return { y: date.getFullYear(), m: date.getMonth(), d: date.getDate() };
}

function ymdFromUtc(date) {
  return { y: date.getUTCFullYear(), m: date.getUTCMonth(), d: date.getUTCDate() };
}

/**
 * Extract an explicit period from text, or null if none mentioned.
 * Does NOT default to current month.
 */
function extractExplicitPeriod(message, now = new Date()) {
  const text = String(message || "").toLowerCase().trim();
  if (!text) return null;
  const nowYmd = ymdFromUtc(now);

  // Explicit date range: 01/01/2026 to 31/01/2026
  const rangeMatch = text.match(
    /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\s*(?:to|till|until|-|se)\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i
  );
  if (rangeMatch) {
    const start = parseFlexibleDateParts(rangeMatch[1], now);
    const end = parseFlexibleDateParts(rangeMatch[2], now);
    if (start && end) return utcRangePeriod(start, end);
  }

  const isoRange = text.match(
    /(\d{4}-\d{2}-\d{2})\s*(?:to|till|until|-)\s*(\d{4}-\d{2}-\d{2})/i
  );
  if (isoRange) {
    const start = parseFlexibleDateParts(isoRange[1], now);
    const end = parseFlexibleDateParts(isoRange[2], now);
    if (start && end) return utcRangePeriod(start, end);
  }

  if (
    includesAny(text, ["this month", "current month", "is mahine", "is mahina", "iss mahine"])
  ) {
    return utcMonthPeriod(nowYmd.y, nowYmd.m);
  }

  if (
    includesAny(text, [
      "today",
      "aaj",
      "for today",
      "today's",
      "todays",
    ])
  ) {
    const p = utcDayPeriod(nowYmd.y, nowYmd.m, nowYmd.d);
    return { ...p, label: `Today (${p.label})` };
  }

  if (includesAny(text, ["yesterday", "kal", "pichla din"])) {
    const y = new Date(Date.UTC(nowYmd.y, nowYmd.m, nowYmd.d - 1));
    const p = utcDayPeriod(y.getUTCFullYear(), y.getUTCMonth(), y.getUTCDate());
    return { ...p, label: `Yesterday (${p.label})` };
  }

  if (
    includesAny(text, [
      "last month",
      "previous month",
      "pichla mahina",
      "pichle mahine",
      "last mahina",
    ])
  ) {
    const m = nowYmd.m === 0 ? 11 : nowYmd.m - 1;
    const y = nowYmd.m === 0 ? nowYmd.y - 1 : nowYmd.y;
    return utcMonthPeriod(y, m);
  }

  const singleDate =
    text.match(/\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/) ||
    text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (singleDate) {
    const parts = parseFlexibleDateParts(singleDate[1], now);
    if (parts) return utcDayPeriod(parts.y, parts.m, parts.d);
  }

  // "11th february", "11 february 2026", "11 feb"
  const monthAlt = Object.keys(MONTH_NAMES).join("|");
  const dayThenMonth = text.match(
    new RegExp(
      `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthAlt})(?:\\s*,?\\s*(\\d{4}))?\\b`,
      "i"
    )
  );
  if (dayThenMonth) {
    const day = Number(dayThenMonth[1]);
    const monthIndex = MONTH_NAMES[dayThenMonth[2].toLowerCase()];
    let year = dayThenMonth[3] ? Number(dayThenMonth[3]) : nowYmd.y;
    if (!dayThenMonth[3] && monthIndex > nowYmd.m) year -= 1;
    if (day >= 1 && day <= 31 && monthIndex != null) {
      return utcDayPeriod(year, monthIndex, day);
    }
  }

  // "february 11", "february 11th 2026", "feb 11"
  const monthThenDay = text.match(
    new RegExp(
      `\\b(${monthAlt})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*,?\\s*(\\d{4}))?\\b`,
      "i"
    )
  );
  if (monthThenDay) {
    const monthIndex = MONTH_NAMES[monthThenDay[1].toLowerCase()];
    const day = Number(monthThenDay[2]);
    let year = monthThenDay[3] ? Number(monthThenDay[3]) : nowYmd.y;
    if (!monthThenDay[3] && monthIndex > nowYmd.m) year -= 1;
    if (day >= 1 && day <= 31 && monthIndex != null) {
      return utcDayPeriod(year, monthIndex, day);
    }
  }

  // Bare month only — e.g. "february expenses" (day+month forms already handled above)
  const monthOnly = text.match(
    new RegExp(`\\b(${monthAlt})\\b(?:\\s*[,-]?\\s*(\\d{4}))?`, "i")
  );
  if (monthOnly) {
    const monthIndex = MONTH_NAMES[monthOnly[1].toLowerCase()];
    let year = monthOnly[2] ? Number(monthOnly[2]) : nowYmd.y;
    if (!monthOnly[2] && monthIndex > nowYmd.m) year -= 1;
    return utcMonthPeriod(year, monthIndex);
  }

  return null;
}

function defaultThisMonth(now = new Date()) {
  const { y, m } = ymdFromUtc(now);
  return utcMonthPeriod(y, m);
}

/** Prefer period in current message; else last period mentioned in chat history. */
function resolvePeriod(message, conversationHistory, now = new Date()) {
  const fromMessage = extractExplicitPeriod(message, now);
  if (fromMessage) return fromMessage;

  const history = Array.isArray(conversationHistory) ? conversationHistory : [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const fromHist = extractExplicitPeriod(history[i]?.content || "", now);
    if (fromHist) return fromHist;
  }

  return defaultThisMonth(now);
}

const PROFIT_KEYWORDS = [
  "profit",
  "loss",
  "munafa",
  "report",
  "p&l",
  "pnl",
  "gross",
  "net profit",
  "operating profit",
];

function historyMentionsProfit(conversationHistory) {
  const history = Array.isArray(conversationHistory) ? conversationHistory : [];
  return history.some((m) =>
    includesAny(String(m?.content || "").toLowerCase(), PROFIT_KEYWORDS)
  );
}

/** Fetch P&L for direct asks and follow-ups like "february" / "gross profit". */
function shouldFetchProfit(message, conversationHistory) {
  const lower = String(message || "").toLowerCase();
  if (includesAny(lower, PROFIT_KEYWORDS)) return true;

  const inProfitThread = historyMentionsProfit(conversationHistory);
  if (!inProfitThread) return false;

  if (extractExplicitPeriod(message, new Date())) return true;

  return includesAny(lower, [
    "what about",
    "how about",
    "and",
    "same for",
    "kitna",
    "batao",
    "bata",
    "net",
    "gross",
    "operating",
    "breakdown",
    "detail",
    "figures",
    "numbers",
  ]);
}

/** Parse date string into {y,m,d} using DD/MM/YYYY (Pakistan). */
function parseFlexibleDateParts(str, now) {
  const raw = String(str).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(`${raw}T00:00:00.000Z`);
    if (!isValid(d)) return null;
    return ymdFromUtc(d);
  }
  for (const fmt of ["dd/MM/yyyy", "d/M/yyyy", "dd-MM-yyyy", "d-M-yyyy", "dd/MM/yy", "d/M/yy"]) {
    const d = parse(raw, fmt, now);
    if (isValid(d)) return ymdFromLocalParsed(d);
  }
  return null;
}

function swapDayMonthParts(parts) {
  if (!parts || parts.d > 12) return null;
  return { y: parts.y, m: parts.d - 1, d: parts.m + 1 };
}

/**
 * If DD/MM day has no rows but swapped MM/DD does, use the swapped date
 * (e.g. 02/11/2026 → 11 Feb when Nov 2 is empty).
 */
async function resolveDayPeriodWithData(period, Model, dateField) {
  if (!period || period.kind !== "day") return period;

  const primaryCount = await Model.countDocuments({
    [dateField]: { $gte: period.startDate, $lte: period.endDate },
  });
  if (primaryCount > 0) return period;

  const parts = ymdFromUtc(period.startDate);
  const swappedParts = swapDayMonthParts(parts);
  if (!swappedParts) return period;

  const alt = utcDayPeriod(swappedParts.y, swappedParts.m, swappedParts.d);
  if (alt.label === period.label) return period;

  const altCount = await Model.countDocuments({
    [dateField]: { $gte: alt.startDate, $lte: alt.endDate },
  });
  if (altCount > 0) {
    return {
      ...alt,
      label: `${alt.label} (${MONTH_LABELS[alt.startDate.getUTCMonth()]} ${alt.startDate.getUTCDate()})`,
      interpretedFrom: period.label,
      note: `Interpreted ${period.label} as ${alt.label} because that date has records (DD/MM vs MM/DD ambiguity).`,
    };
  }
  return period;
}

async function loadExpenseSnapshot(period) {
  const expenseFilter = {
    expenseDate: { $gte: period.startDate, $lte: period.endDate },
  };
  const purchaseFilter = {
    purchaseDate: { $gte: period.startDate, $lte: period.endDate },
  };

  const [rows, byGroup, expenseCount, processRows, oldest, newest] = await Promise.all([
    Expense.find(expenseFilter)
      .sort({ expenseDate: -1 })
      .select("expenseDate expenseGroup expenseCategory description amount paymentMethod labourName")
      .limit(period.kind === "day" ? 100 : 40)
      .lean(),
    Expense.aggregate([
      { $match: expenseFilter },
      { $group: { _id: "$expenseGroup", totalAmount: { $sum: "$amount" } } },
      { $sort: { totalAmount: -1 } },
    ]),
    Expense.countDocuments(expenseFilter),
    ConsumptionMaterial.find(purchaseFilter)
      .sort({ purchaseDate: -1 })
      .select("purchaseDate materialType totalCost notes quantity unit")
      .limit(period.kind === "day" ? 50 : 20)
      .lean(),
    Expense.findOne().sort({ expenseDate: 1 }).select("expenseDate").lean(),
    Expense.findOne().sort({ expenseDate: -1 }).select("expenseDate").lean(),
  ]);

  const processTotal = processRows.reduce((s, m) => s + (Number(m.totalCost) || 0), 0);
  const expenseTotal = byGroup.reduce((s, g) => s + (Number(g.totalAmount) || 0), 0);
  const totalAmount = expenseTotal + processTotal;

  const byGroupMerged = byGroup.map((g) => ({
    group: g._id || "Other",
    totalAmount: g.totalAmount || 0,
  }));
  if (processTotal > 0) {
    byGroupMerged.push({ group: "Process Material", totalAmount: processTotal });
    byGroupMerged.sort((a, b) => b.totalAmount - a.totalAmount);
  }

  const processExpenses = processRows.map((m) => ({
    date: formatUtcDMY(new Date(m.purchaseDate)),
    group: "Process Material",
    category: m.materialType || "",
    description: m.notes || m.materialType || "",
    amount: m.totalCost || 0,
    paymentMethod: "",
  }));

  const expenses = [
    ...rows.map((r) => ({
      date: formatUtcDMY(new Date(r.expenseDate)),
      group: r.expenseGroup || "",
      category: r.expenseCategory || "",
      description: r.description || r.labourName || "",
      amount: r.amount || 0,
      paymentMethod: r.paymentMethod || "",
    })),
    ...processExpenses,
  ].sort((a, b) => b.amount - a.amount);

  return {
    periodLabel: period.label,
    periodKind: period.kind,
    periodStart: formatUtcDMY(period.startDate),
    periodEnd: formatUtcDMY(period.endDate),
    interpretedFrom: period.interpretedFrom || null,
    interpretationNote: period.note || null,
    expenseCount: expenseCount + processRows.length,
    expenseOnlyTotal: expenseTotal,
    processMaterialTotal: processTotal,
    totalAmount,
    byGroup: byGroupMerged,
    expenses: expenses.slice(0, period.kind === "day" ? 100 : 50),
    availableExpenseDateRange:
      oldest?.expenseDate && newest?.expenseDate
        ? {
            first: formatUtcDMY(new Date(oldest.expenseDate)),
            last: formatUtcDMY(new Date(newest.expenseDate)),
          }
        : null,
    note:
      totalAmount > 0
        ? "totalAmount includes normal expenses + Process Material purchases (same as Expenses page). Use this number."
        : "No expenses recorded in this period (totalAmount is Rs. 0). Tell the user clearly. If availableExpenseDateRange is present, mention those dates. Dates are DD/MM/YYYY.",
  };
}

function summarizeProfitReport(report, period) {
  return {
    periodLabel: period.label,
    periodKind: period.kind,
    periodStart: formatUtcDMY(period.startDate),
    periodEnd: formatUtcDMY(period.endDate),
    hasActivity: !!report.hasActivity,
    availableDataRange: report.availableDataRange || null,
    main: {
      salesEarned: report.main?.salesEarned ?? 0,
      netRevenue: report.main?.netRevenue ?? 0,
      netMaterialCost: report.main?.netMaterialCost ?? 0,
      grossProfit: report.main?.grossProfit ?? 0,
      netProfit: report.main?.netProfit ?? 0,
    },
    processing: {
      labourEarned: report.processing?.labourEarned ?? 0,
      labourReceived: report.processing?.labourReceived ?? 0,
      labourOutstanding: report.processing?.labourOutstanding ?? 0,
      directProfit: report.processing?.directProfit ?? 0,
    },
    combined: {
      mainGrossProfit: report.combined?.mainGrossProfit ?? 0,
      processingDirectProfit: report.combined?.processingDirectProfit ?? 0,
      grossProfit: report.combined?.grossProfit ?? 0,
      factoryExpenses: report.combined?.factoryExpenses ?? 0,
      consumptionMaterials: report.combined?.consumptionMaterials ?? 0,
      selfExpenses: report.combined?.selfExpenses ?? 0,
      operatingProfit: report.combined?.operatingProfit ?? 0,
      finalNetProfit: report.combined?.finalNetProfit ?? 0,
      statement: report.combined?.statement || [],
      expenseBreakdown: {
        factoryByGroup: report.combined?.expenseBreakdown?.factoryByGroup || [],
        factoryTotal: report.combined?.expenseBreakdown?.factoryTotal ?? 0,
        selfTotal: report.combined?.expenseBreakdown?.selfTotal ?? 0,
        consumptionTotal: report.combined?.expenseBreakdown?.consumptionTotal ?? 0,
      },
    },
    finalNetProfit: report.combined?.finalNetProfit ?? 0,
    mainGrossProfit: report.combined?.mainGrossProfit ?? report.main?.grossProfit ?? 0,
    combinedGrossProfit: report.combined?.grossProfit ?? 0,
    note: report.hasActivity
      ? "These are live DB figures for periodLabel. For 'gross profit' use combined.grossProfit or main.grossProfit / combined.mainGrossProfit. For overall profit use finalNetProfit."
      : "No activity in this period — all profit figures are Rs. 0. If availableDataRange exists, mention those dates to the user.",
  };
}

exports.chat = async (req, res) => {
  try {
    const { message, conversationHistory = [] } = req.body;
    if (!message || typeof message !== "string") {
      return res.status(400).json({
        success: false,
        message: "message is required",
      });
    }

    const lower = message.toLowerCase();
    const now = new Date();
    const todayFormatted = formatUtcDMY(now);

    const fetchedData = {
      today: todayFormatted,
    };

    // Always-include business snapshot
    const [customerPendingAgg, supplierPendingAgg, alwaysStock] = await Promise.all([
      Customer.aggregate([{ $group: { _id: null, total: { $sum: "$totalAmountDue" } } }]),
      Supplier.aggregate([{ $group: { _id: null, total: { $sum: "$totalAmountDue" } } }]),
      RawMaterial.aggregate([
        { $group: { _id: "$coilCategory", totalStock: { $sum: "$currentStock" } } },
      ]),
    ]);

    fetchedData.totalPendingFromCustomers = customerPendingAgg[0]?.total || 0;
    fetchedData.totalPendingToSuppliers = supplierPendingAgg[0]?.total || 0;

    const stockMap = {};
    alwaysStock.forEach((row) => {
      stockMap[row._id || "Unknown"] = row.totalStock || 0;
    });
    fetchedData.shipletCoilStockKg = stockMap["Shiplet Coil"] || 0;
    fetchedData.patriCoilStockKg = stockMap["Patri Coil"] || 0;

    if (
      includesAny(lower, [
        "customer",
        "baqi",
        "due",
        "payment",
        "receivable",
        "grahak",
      ])
    ) {
      fetchedData.customers = await Customer.find(
        {},
        "name totalAmountDue totalAmountPaid totalAmountPurchased customerType"
      ).sort({ totalAmountDue: -1 });
    }

    if (
      includesAny(lower, [
        "supplier",
        "coil",
        "stock",
        "raw",
        "material",
        "kharida",
      ])
    ) {
      fetchedData.suppliers = await Supplier.find({}, "name totalAmountDue companyName");
      fetchedData.stockByCoilCategory = await RawMaterial.aggregate([
        { $group: { _id: "$coilCategory", totalStock: { $sum: "$currentStock" } } },
      ]);
    }

    if (
      includesAny(lower, [
        "expense",
        "kharcha",
        "labour",
        "salary",
        "rent",
        "bill",
      ])
    ) {
      let expensePeriod = resolvePeriod(message, conversationHistory, now);
      // Prefer a day that has Expense OR Process Material rows
      if (expensePeriod.kind === "day") {
        const withExpense = await resolveDayPeriodWithData(
          expensePeriod,
          Expense,
          "expenseDate"
        );
        if (withExpense !== expensePeriod || withExpense.interpretedFrom) {
          expensePeriod = withExpense;
        } else {
          expensePeriod = await resolveDayPeriodWithData(
            expensePeriod,
            ConsumptionMaterial,
            "purchaseDate"
          );
        }
      }
      fetchedData.expenseReport = await loadExpenseSnapshot(expensePeriod);
    }

    if (shouldFetchProfit(message, conversationHistory)) {
      let period = resolvePeriod(message, conversationHistory, now);
      period = await resolveDayPeriodWithData(period, Order, "orderDate");
      const report = await buildProfitReport({
        startDate: period.startDate,
        endDate: period.endDate,
      });
      fetchedData.profitReport = summarizeProfitReport(report, period);
      if (period.note) fetchedData.profitReport.interpretationNote = period.note;
    }

    if (includesAny(lower, ["order", "wire", "sale", "sell", "becha"])) {
      fetchedData.recentOrders = await Order.find({ isReturn: false })
        .sort({ orderDate: -1 })
        .limit(15)
        .select("customerName wireNumber totalAmount orderStatus orderDate amountDue");
    }

    if (includesAny(lower, ["cash", "bank", "balance", "paisa"])) {
      const [cashBook, bankBalance] = await Promise.all([
        getCashBookForDate(new Date()),
        currentBankBalance(),
      ]);
      fetchedData.cashBookToday = {
        date: formatUtcDMY(now),
        openingBalance: cashBook.openingBalance,
        totalIn: cashBook.totalIn,
        totalOut: cashBook.totalOut,
        closingBalance: cashBook.closingBalance,
      };
      fetchedData.bankBalance = bankBalance;
    }

    const systemPrompt =
      `You are a helpful business assistant for a wire manufacturing factory in Pakistan called WMS. You have access to the following live business data as of today ${todayFormatted}:\n` +
      JSON.stringify(fetchedData, null, 2) +
      `\nRules:
- Answer accurately using ONLY this live data. Be concise, friendly, and specific with numbers.
- Respond in the same language the user used (English or Urdu).
- Format currency as Rs. X,XXX. Do not make up numbers.
- Dates in this factory are DD/MM/YYYY.
- When profitReport is present, use periodLabel as the period you are answering for.
- If user asks gross profit → report mainGrossProfit / combined.mainGrossProfit / main.grossProfit and combined.grossProfit.
- If user asks net / overall / final profit → report finalNetProfit.
- When expenseReport is present: ALWAYS start with periodLabel, totalAmount, and expenseCount from expenseReport, then list items from expenses[]. Do not invent or merge amounts. If totalAmount is 0, say no expenses that day and mention availableExpenseDateRange. If interpretationNote is set, briefly mention how the date was read.
- Always mention the period. Never invent figures from chat memory.`;

    const history = Array.isArray(conversationHistory)
      ? conversationHistory.slice(-8)
      : [];

    const response = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: message },
      ],
      max_tokens: 700,
      temperature: 0.3,
    });

    const answer = response.choices[0].message.content;
    return res.json({ success: true, data: { answer } });
  } catch (error) {
    console.error("AI chat error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "AI chat failed",
    });
  }
};
