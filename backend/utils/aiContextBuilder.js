const { parse, isValid } = require("date-fns");
const Customer = require("../models/Customer");
const Supplier = require("../models/Supplier");
const RawMaterial = require("../models/RawMaterial");
const Expense = require("../models/Expense");
const ConsumptionMaterial = require("../models/ConsumptionMaterial");
const Order = require("../models/Order");
const Worker = require("../models/Worker");
const WorkerLedgerEntry = require("../models/WorkerLedgerEntry");
const ReadyStock = require("../models/ReadyStock");
const JobWork = require("../models/JobWork");
const AnnealingRecord = require("../models/AnnealingRecord");
const Cheque = require("../models/Cheque");
const { buildProfitReport } = require("./profitReportService");
const { getCashBookForDate } = require("./cashBookService");
const { currentBankBalance, buildAccountSummaries } = require("./bankBalanceService");
const { buildDailyBookReport } = require("./dailyBookReportService");

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

  // "11th february", "11 the february", "11 february 2026", "11 feb"
  const monthAlt = Object.keys(MONTH_NAMES).join("|");
  const dayThenMonth = text.match(
    new RegExp(
      `\\b(\\d{1,2})(?:\\s*(?:st|nd|rd|th|the))?\\s+(${monthAlt})(?:\\s*,?\\s*(\\d{4}))?\\b`,
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

  // "february 11", "february 11th 2026", "feb 11", "february 11 the"
  const monthThenDay = text.match(
    new RegExp(
      `\\b(${monthAlt})\\s+(\\d{1,2})(?:\\s*(?:st|nd|rd|th|the))?(?:\\s*,?\\s*(\\d{4}))?\\b`,
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

/** Build a local Date for cashBookService/dailyBookReportService from a UTC business-calendar period. */
function localDateForCashBook(period) {
  const y = period.startDate.getUTCFullYear();
  const m = period.startDate.getUTCMonth();
  const d =
    period.kind === "month" || period.kind === "range"
      ? period.endDate.getUTCDate()
      : period.startDate.getUTCDate();
  // Noon local avoids DST edge cases; downstream services use startOfDay(local).
  return new Date(y, m, d, 12, 0, 0, 0);
}

/** Same UTC-midnight → local-noon conversion, for an explicit UTC business date. */
function localNoonForUtcDate(utcDate) {
  return new Date(
    utcDate.getUTCFullYear(),
    utcDate.getUTCMonth(),
    utcDate.getUTCDate(),
    12,
    0,
    0,
    0
  );
}

async function loadExpenseSnapshot(period) {
  const expenseFilter = {
    expenseDate: { $gte: period.startDate, $lte: period.endDate },
  };
  const purchaseFilter = {
    purchaseDate: { $gte: period.startDate, $lte: period.endDate },
  };
  const rowLimit = period.kind === "day" ? 80 : 30;

  const [rows, byGroup, expenseCount, processRows, oldest, newest] = await Promise.all([
    Expense.find(expenseFilter)
      .sort({ expenseDate: -1 })
      .select("expenseDate expenseGroup expenseCategory description amount paymentMethod labourName")
      .limit(rowLimit)
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
      .limit(rowLimit)
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
    expenses: expenses.slice(0, rowLimit),
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

/** Heavily summarized daily book — totals only, never full transaction dumps. */
function summarizeDailyBookReport(report, period) {
  const days = report.days || [];
  const lastDay = days[days.length - 1] || null;
  return {
    periodLabel: period.label,
    periodKind: period.kind,
    mode: report.mode,
    startDate: report.startDate,
    endDate: report.endDate,
    rangeSummary: report.rangeSummary || null,
    latestDay: lastDay
      ? {
          date: formatUtcDMY(new Date(lastDay.date)),
          openingBalance: lastDay.cash?.openingBalance ?? 0,
          totalIn: lastDay.cash?.totalIn ?? 0,
          totalOut: lastDay.cash?.totalOut ?? 0,
          closingBalance: lastDay.cash?.closingBalance ?? 0,
          totalSalesKg: lastDay.totalSalesKg || 0,
          totalPurchasesKg: lastDay.totalPurchasesKg || 0,
          annealingSentKg: lastDay.annealing?.totals?.sentKg || 0,
          annealingArrivedKg: lastDay.annealing?.totals?.arrivedKg || 0,
          processingLabourEarned: lastDay.processing?.totals?.labourEarned || 0,
        }
      : null,
    note:
      report.mode === "range"
        ? "This is a range summary (totals only). Ask for a specific date for a full day-by-day breakdown."
        : "Totals only — for full transaction-level detail, open the Daily Book page.",
  };
}

/** Pull a person name from questions like "who is X" / "X kaun hai". */
function extractPersonQuery(message) {
  const text = String(message || "").trim();
  if (!text) return null;

  const patterns = [
    /^(?:who\s+is|who\s+was|who's)\s+(.+?)\s*[\?!.]*$/i,
    /^(?:tell\s+me\s+about|about)\s+(.+?)\s*[\?!.]*$/i,
    /^(?:kaun\s+hai|kon\s+hai)\s+(.+?)\s*[\?!.]*$/i,
    /^(.+?)\s+(?:kaun|kon)\s+hai\s*[\?!.]*$/i,
    /^(?:details?\s+(?:of|for|about)|info(?:rmation)?\s+(?:on|about|for))\s+(.+?)\s*[\?!.]*$/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const name = match[1]
        .replace(/[?!.]+$/g, "")
        .replace(/\b(please|plz|ji)\b/gi, "")
        .trim();
      if (name.length >= 2) return name;
    }
  }
  return null;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Same running-balance logic as workerController.computeWorkerSummary. */
async function computeWorkerSummary(worker) {
  const entries = await WorkerLedgerEntry.find({ workerId: worker._id }).sort({ date: 1, createdAt: 1 });
  const summary = {
    salaryDue: 0,
    payments: 0,
    advances: 0,
    adjustments: 0,
    remaining: Number(worker.openingBalance) || 0,
  };
  entries.forEach((entry) => {
    if (entry.entryType === "SalaryDue") {
      summary.salaryDue += entry.amount || 0;
      summary.remaining += entry.amount || 0;
    } else if (entry.entryType === "Payment") {
      summary.payments += entry.amount || 0;
      summary.remaining -= entry.amount || 0;
    } else if (entry.entryType === "Advance") {
      summary.advances += entry.amount || 0;
      summary.remaining -= entry.amount || 0;
    } else {
      summary.adjustments += entry.amount || 0;
      summary.remaining += entry.amount || 0;
    }
  });
  return summary;
}

async function searchPeople(query) {
  const cleaned = String(query || "").trim();
  if (cleaned.length < 2) return null;

  const words = cleaned
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 1);

  const nameFilter =
    words.length > 1
      ? { $and: words.map((w) => ({ name: new RegExp(escapeRegex(w), "i") })) }
      : { name: new RegExp(escapeRegex(words[0] || cleaned), "i") };

  const [rawCustomers, rawSuppliers, rawWorkers] = await Promise.all([
    Customer.find(nameFilter)
      .select(
        "name contactNumber address totalAmountDue totalAmountPaid totalAmountPurchased customerType"
      )
      .limit(10)
      .lean(),
    Supplier.find(nameFilter)
      .select(
        "name contactNumber companyName address totalAmountDue totalAmountPaid totalAmountPurchased"
      )
      .limit(10)
      .lean(),
    Worker.find(nameFilter)
      .select("name phone role active openingBalance notes")
      .limit(10)
      .lean(),
  ]);

  const roundMoney = (n) => Math.round(Number(n) || 0);
  const customers = rawCustomers.map((c) => ({
    ...c,
    name: String(c.name || "").trim(),
    totalAmountDue: roundMoney(c.totalAmountDue),
    totalAmountPaid: roundMoney(c.totalAmountPaid),
    totalAmountPurchased: roundMoney(c.totalAmountPurchased),
  }));
  const suppliers = rawSuppliers.map((s) => ({
    ...s,
    name: String(s.name || "").trim(),
    totalAmountDue: roundMoney(s.totalAmountDue),
    totalAmountPaid: roundMoney(s.totalAmountPaid),
    totalAmountPurchased: roundMoney(s.totalAmountPurchased),
  }));
  const workers = await Promise.all(
    rawWorkers.map(async (w) => {
      const summary = await computeWorkerSummary(w);
      return {
        ...w,
        name: String(w.name || "").trim(),
        openingBalance: roundMoney(w.openingBalance),
        ledgerSummary: {
          salaryDue: roundMoney(summary.salaryDue),
          payments: roundMoney(summary.payments),
          advances: roundMoney(summary.advances),
          adjustments: roundMoney(summary.adjustments),
          remaining: roundMoney(summary.remaining),
        },
      };
    })
  );

  const customerNames = customers.map((c) => c.name).filter(Boolean);
  let recentOrders = [];
  if (customerNames.length) {
    recentOrders = await Order.find({
      customerName: { $in: customerNames },
      isReturn: { $ne: true },
    })
      .sort({ orderDate: -1 })
      .limit(8)
      .select("customerName wireNumber totalAmount orderStatus orderDate amountDue")
      .lean();
  }

  const found =
    customers.length > 0 || suppliers.length > 0 || workers.length > 0;

  return {
    query: cleaned,
    found,
    customers,
    suppliers,
    workers,
    recentOrders: recentOrders.map((o) => ({
      ...o,
      orderDate: o.orderDate ? formatUtcDMY(new Date(o.orderDate)) : null,
    })),
    note: found
      ? "Use these matched WMS records to answer who the person is (customer / supplier / worker) and their balances. workers[].ledgerSummary has SalaryDue / Payment / Advance totals and remaining balance."
      : "No customer, supplier, or worker matched this name in WMS.",
  };
}

/** Same pooled-balance logic as dashboardController.annealingPendingTotals. */
async function annealingPendingTotals() {
  const records = await AnnealingRecord.find({
    entryType: { $in: ["Send", "Arrival", "Sold"] },
  }).sort({ date: 1, createdAt: 1 });
  const pools = new Map();
  records.forEach((record) => {
    const key = [
      record.partyType || "None",
      record.partyId ? String(record.partyId) : "none",
      record.materialType || "Coil",
      record.materialType === "Wire" ? "wire" : (record.coilCategory || "Shiplet Coil"),
      record.materialType === "Wire" ? (record.wireNumber || "any") : "-",
    ].join("|");
    if (!pools.has(key)) pools.set(key, { kg: 0, bundles: 0 });
    const pool = pools.get(key);
    if (record.entryType === "Send") {
      pool.kg += record.weightKg || 0;
      pool.bundles += record.bundles || 0;
    } else {
      pool.kg = Math.max(0, pool.kg - (record.weightKg || 0));
      pool.bundles = Math.max(0, pool.bundles - (record.bundles || 0));
    }
  });
  return Array.from(pools.values()).reduce(
    (totals, pool) => ({
      kg: totals.kg + pool.kg,
      bundles: totals.bundles + pool.bundles,
    }),
    { kg: 0, bundles: 0 }
  );
}

/** Comprehensive snapshot of Cheques (in-hand, received, company, personal, endorsed). */
async function loadChequeSnapshot(period, message) {
  const lower = String(message || "").toLowerCase();
  // Check if a specific cheque number is queried (e.g. "cheque 12345", "CHQ-1234", "check #9988")
  const chequeNumMatch =
    lower.match(/(?:cheque|check|chq)(?:\s*(?:#|no\.?|number))?\s*([a-zA-Z0-9_-]+)/i) ||
    lower.match(/\b([0-9]{4,10})\b/);

  let specificLookup = null;
  if (chequeNumMatch?.[1]) {
    const rawNum = chequeNumMatch[1].trim();
    if (rawNum.length >= 3 && !["and", "the", "for", "our", "all"].includes(rawNum.toLowerCase())) {
      const matchDoc = await Cheque.findOne({
        chequeNumber: new RegExp(escapeRegex(rawNum), "i"),
      }).lean();
      if (matchDoc) {
        specificLookup = {
          chequeNumber: matchDoc.chequeNumber,
          chequeType: matchDoc.chequeType,
          direction: matchDoc.direction,
          bankName: matchDoc.bankName,
          amount: matchDoc.amount,
          chequeDate: matchDoc.chequeDate ? formatUtcDMY(new Date(matchDoc.chequeDate)) : null,
          status: matchDoc.status,
          receivedFrom: matchDoc.receivedFrom?.partyName || null,
          givenTo: matchDoc.givenTo?.partyName || null,
          depositBankAccount: matchDoc.depositBankAccount || null,
          notes: matchDoc.notes || "",
        };
      }
    }
  }

  const [
    inHandCheques,
    allReceivedAgg,
    allDepositedAgg,
    allEndorsedAgg,
    allIssuedCompanyAgg,
    allIssuedPersonalAgg,
    recentReceived,
    recentIssued,
  ] = await Promise.all([
    Cheque.find({ direction: "Received", status: "In Hand" })
      .sort({ chequeDate: 1 })
      .limit(25)
      .lean(),
    Cheque.aggregate([
      { $match: { direction: "Received" } },
      { $group: { _id: null, count: { $sum: 1 }, totalAmount: { $sum: "$amount" } } },
    ]),
    Cheque.aggregate([
      { $match: { direction: "Received", status: "Deposited" } },
      { $group: { _id: null, count: { $sum: 1 }, totalAmount: { $sum: "$amount" } } },
    ]),
    Cheque.aggregate([
      { $match: { direction: "Received", status: "Endorsed" } },
      { $group: { _id: null, count: { $sum: 1 }, totalAmount: { $sum: "$amount" } } },
    ]),
    Cheque.aggregate([
      { $match: { direction: "Issued", chequeType: "Company Cheque" } },
      { $group: { _id: null, count: { $sum: 1 }, totalAmount: { $sum: "$amount" } } },
    ]),
    Cheque.aggregate([
      { $match: { direction: "Issued", chequeType: "Personal Cheque" } },
      { $group: { _id: null, count: { $sum: 1 }, totalAmount: { $sum: "$amount" } } },
    ]),
    Cheque.find({ direction: "Received" })
      .sort({ chequeDate: -1, createdAt: -1 })
      .limit(10)
      .lean(),
    Cheque.find({ direction: "Issued" })
      .sort({ chequeDate: -1, createdAt: -1 })
      .limit(10)
      .lean(),
  ]);

  const inHandTotalAmount = inHandCheques.reduce((s, c) => s + (Number(c.amount) || 0), 0);

  return {
    inHandSummary: {
      count: inHandCheques.length,
      totalAmount: inHandTotalAmount,
      cheques: inHandCheques.map((c) => ({
        chequeNumber: c.chequeNumber,
        customerName: c.receivedFrom?.partyName || "Customer",
        bankName: c.bankName,
        amount: c.amount,
        chequeDate: c.chequeDate ? formatUtcDMY(new Date(c.chequeDate)) : null,
        status: c.status,
      })),
    },
    totalReceivedTillNow: {
      count: allReceivedAgg[0]?.count || 0,
      totalAmount: allReceivedAgg[0]?.totalAmount || 0,
    },
    totalDepositedToBank: {
      count: allDepositedAgg[0]?.count || 0,
      totalAmount: allDepositedAgg[0]?.totalAmount || 0,
    },
    totalEndorsedToSuppliers: {
      count: allEndorsedAgg[0]?.count || 0,
      totalAmount: allEndorsedAgg[0]?.totalAmount || 0,
    },
    totalIssuedCompanyCheques: {
      count: allIssuedCompanyAgg[0]?.count || 0,
      totalAmount: allIssuedCompanyAgg[0]?.totalAmount || 0,
    },
    totalIssuedPersonalCheques: {
      count: allIssuedPersonalAgg[0]?.count || 0,
      totalAmount: allIssuedPersonalAgg[0]?.totalAmount || 0,
    },
    totalIssuedAll: {
      count: (allIssuedCompanyAgg[0]?.count || 0) + (allIssuedPersonalAgg[0]?.count || 0),
      totalAmount: (allIssuedCompanyAgg[0]?.totalAmount || 0) + (allIssuedPersonalAgg[0]?.totalAmount || 0),
    },
    recentReceivedCustomerCheques: recentReceived.map((c) => ({
      chequeNumber: c.chequeNumber,
      customerName: c.receivedFrom?.partyName || "Customer",
      bankName: c.bankName,
      amount: c.amount,
      chequeDate: c.chequeDate ? formatUtcDMY(new Date(c.chequeDate)) : null,
      status: c.status,
      endorsedTo: c.givenTo?.partyName || null,
    })),
    recentIssuedCheques: recentIssued.map((c) => ({
      chequeNumber: c.chequeNumber,
      chequeType: c.chequeType,
      bankName: c.bankName,
      givenTo: c.givenTo?.partyName || "Payee",
      amount: c.amount,
      chequeDate: c.chequeDate ? formatUtcDMY(new Date(c.chequeDate)) : null,
      status: c.status,
    })),
    specificLookup,
    note:
      "inHandSummary has active customer cheques in our possession. totalReceivedTillNow is all customer cheques received all time. totalIssuedCompanyCheques & totalIssuedPersonalCheques are our cheques given. totalEndorsedToSuppliers are customer cheques passed to pay suppliers.",
  };
}

// ---------------------------------------------------------------------------
// Intent detection
// ---------------------------------------------------------------------------

const CHEQUE_KEYWORDS = [
  "cheque",
  "cheques",
  "check",
  "checks",
  "chq",
  "in hand",
  "in-hand",
  "hath me",
  "hath mein",
  "cheque book",
];
const CUSTOMER_KEYWORDS = ["customer", "grahak", "baqi", "due", "receivable"];
const SUPPLIER_KEYWORDS = ["supplier", "kharida", "payable"];
const RAW_STOCK_KEYWORDS = ["coil", "shiplet", "patri", "raw material", "raw materials"];
const EXPENSE_KEYWORDS = ["expense", "kharcha", "rent", "bill"];
const PROFIT_KEYWORDS = [
  "profit",
  "loss",
  "munafa",
  "p&l",
  "pnl",
  "gross",
  "net profit",
  "operating profit",
  "profit report",
];
const ORDER_KEYWORDS = ["order", "sale", "sell", "becha", "in process", "outer", "wire sale"];
const CASH_KEYWORDS = [
  "cash",
  "cashbook",
  "cash book",
  "in hand",
  "hath",
  "paisa",
  "opening balance",
  "closing balance",
  "bank balance",
];
const READY_STOCK_KEYWORDS = ["ready stock", "finished stock", "wire stock", "production stock"];
const ANNEALING_KEYWORDS = ["annealing", "anneal", "bhatti"];
const LOW_STOCK_KEYWORDS = ["low stock", "stock alert", "kam stock"];
const DAILY_BOOK_KEYWORDS = ["daily book", "aaj ki book", "day report", "what happened"];
const WORKER_KEYWORDS = ["worker", "salary", "wages", "mazdoor", "payroll", "labour salary", "labour", "labor"];
const FOLLOWUP_WORDS = [
  "what about",
  "how about",
  "and",
  "same for",
  "kitna",
  "kitni",
  "batao",
  "bata",
  "detail",
  "details",
  "breakdown",
  "figures",
  "numbers",
];
const GREETING_WORDS = ["hi", "hello", "hey", "salam", "assalam", "thanks", "thank you", "shukriya", "shukria"];
const HELP_KEYWORDS = [
  "help",
  "capabilit",
  "what can you do",
  "what do you do",
  "kya kar sakte",
  "kya madad",
];

function isCustomersIntent(lower) {
  if (includesAny(lower, CUSTOMER_KEYWORDS)) return true;
  if (lower.includes("payment") && !includesAny(lower, ["cash", "bank"])) return true;
  if (/customer\s+balances?/.test(lower)) return true;
  return false;
}

function isSuppliersIntent(lower) {
  return includesAny(lower, SUPPLIER_KEYWORDS);
}

function isRawStockIntent(lower) {
  if (includesAny(lower, ["ready stock", "finished stock"])) return false;
  return includesAny(lower, RAW_STOCK_KEYWORDS);
}

function isExpensesIntent(lower) {
  return includesAny(lower, EXPENSE_KEYWORDS);
}

function isProfitIntent(lower) {
  return includesAny(lower, PROFIT_KEYWORDS);
}

function isOrdersIntent(lower) {
  return includesAny(lower, ORDER_KEYWORDS);
}

function isCashIntent(lower) {
  if (includesAny(lower, CASH_KEYWORDS)) return true;
  if (lower.includes("balance")) {
    const hasCashBankHand = includesAny(lower, ["cash", "bank", "hand"]);
    const hasCustomerSupplierContext = includesAny(lower, [
      "customer",
      "supplier",
      "due",
      "grahak",
      "baqi",
      "receivable",
      "payable",
    ]);
    if (hasCashBankHand || !hasCustomerSupplierContext) return true;
  }
  return false;
}

function isReadyStockIntent(lower) {
  if (includesAny(lower, READY_STOCK_KEYWORDS)) return true;
  return /wire\s*#/.test(lower);
}

function isAnnealingIntent(lower) {
  return includesAny(lower, ANNEALING_KEYWORDS);
}

function isJobWorkIntent(lower) {
  if (includesAny(lower, ["job work", "jobwork", "processing work"])) return true;
  if (lower.includes("processing") && !lower.includes("process material")) return true;
  return false;
}

function isLowStockIntent(lower) {
  return includesAny(lower, LOW_STOCK_KEYWORDS);
}

function isDailyBookIntent(lower) {
  return includesAny(lower, DAILY_BOOK_KEYWORDS);
}

function isWorkersIntent(lower) {
  if (includesAny(lower, WORKER_KEYWORDS)) return true;
  if (lower.includes("advance") && includesAny(lower, ["worker", "labour", "labor", "mazdoor", "salary"])) {
    return true;
  }
  return false;
}

function historyMentions(history, keywords) {
  const text = history.map((m) => String(m?.content || "").toLowerCase()).join(" ");
  return includesAny(text, keywords);
}

/** Follow-up signal: an explicit period, or words like "what about" / "kitna" / "batao". */
function hasFollowupSignal(message) {
  const lower = String(message || "").toLowerCase();
  if (extractExplicitPeriod(message, new Date())) return true;
  return includesAny(lower, FOLLOWUP_WORDS);
}

function isGreeting(message) {
  const trimmed = String(message || "").toLowerCase().trim();
  if (!trimmed) return false;
  if (trimmed.split(/\s+/).length > 6) return false;
  return includesAny(trimmed, GREETING_WORDS);
}

function isChequeIntent(lower) {
  if (includesAny(lower, ["cheque", "cheques", "check", "checks", "chq"])) return true;
  if (/in\s*-?\s*hand\s+cheque/i.test(lower)) return true;
  if (
    includesAny(lower, [
      "cheque aye",
      "cheque mila",
      "cheque received",
      "cheques received",
      "customer cheque",
      "hamare cheque",
      "apne cheque",
      "company cheque",
      "personal cheque",
      "cheque number",
      "cheque no",
      "cheque kitne",
      "cheques with us",
      "given from us",
    ])
  ) {
    return true;
  }
  return false;
}

function isGeneralSummaryIntent(lower) {
  return includesAny(lower, [
    "summary",
    "overview",
    "overall status",
    "factory status",
    "factory summary",
    "financial overview",
    "business update",
    "business status",
    "kya halaat",
    "sab theek",
    "overall report",
    "overall",
    "update on factory",
  ]);
}

function isHelpRequest(lower) {
  return includesAny(lower, HELP_KEYWORDS);
}

// ---------------------------------------------------------------------------
// Deep links
// ---------------------------------------------------------------------------

const DEEP_LINK_MAP = {
  cheques: { label: "Open Cheques", path: "/cheques" },
  customers: { label: "Open Customers", path: "/customers" },
  suppliers: { label: "Open Suppliers", path: "/suppliers" },
  rawStock: { label: "Open Raw Materials", path: "/raw-materials" },
  expenses: { label: "Open Expenses", path: "/expenses" },
  profit: { label: "Open Reports", path: "/reports" },
  orders: { label: "Open Orders", path: "/orders" },
  cash: [
    { label: "Open Daily Book", path: "/daily-book" },
    { label: "Open Bank", path: "/bank" },
  ],
  readyStock: { label: "Open Ready Stock", path: "/ready-stock" },
  annealing: { label: "Open Daily Book", path: "/daily-book" },
  jobWork: { label: "Open Daily Book", path: "/daily-book" },
  lowStock: { label: "Open Low Stock", path: "/low-stock" },
  workers: { label: "Open Workers", path: "/workers" },
  dailyBook: { label: "Open Daily Book", path: "/daily-book" },
  person: { label: "Open Customers", path: "/customers" },
};

function buildDeepLinks(domainsFetched) {
  const seen = new Set();
  const links = [];
  domainsFetched.forEach((domain) => {
    const entry = DEEP_LINK_MAP[domain];
    if (!entry) return;
    const list = Array.isArray(entry) ? entry : [entry];
    list.forEach((link) => {
      if (seen.has(link.path)) return;
      seen.add(link.path);
      links.push(link);
    });
  });
  return links;
}

const CAPABILITIES_TEXT = `I can answer questions using live WMS data, such as:
- Cheques — customer cheques in hand, cheques received till now, company/personal cheques issued, cheque lookup by number
- Customer dues, payments, and balances
- Supplier payables and purchase history
- Raw material (coil) stock levels and low-stock alerts
- Expenses — factory, self, and process material — for any day, month, or date range
- Profit & loss — gross profit, net profit, operating profit
- Orders — recent sales and status (Outer / In Process / Done)
- Cash book and bank account balances
- Ready stock (finished wire) by wire number
- Annealing pending stock (sent vs. returned)
- Job work / processing pools and labour earned
- Worker salaries, advances, and remaining balances
- Daily Book summaries for a specific date or month
- Looking up a customer, supplier, or worker by name (e.g. "who is Aslam")

Just ask, for example: "how much cheques we have received till now", "cheques in hand", "expenses for 11 february", "who is Bilal", "cash in hand today", or "gross profit this month".`;

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Builds live Mongo context for the WMS AI chatbot: fetches only the data
 * domains implied by the message (+ follow-up context from history), and
 * returns everything the controller needs to prompt Groq (or refuse).
 */
async function buildChatContext(message, conversationHistory = []) {
  const now = new Date();
  const todayFormatted = formatUtcDMY(now);
  const lower = String(message || "").toLowerCase();
  const history = Array.isArray(conversationHistory) ? conversationHistory : [];

  const fetchedData = { today: todayFormatted };
  const domainsFetched = [];

  const [customerPendingAgg, supplierPendingAgg, stockAgg] = await Promise.all([
    Customer.aggregate([{ $group: { _id: null, total: { $sum: "$totalAmountDue" } } }]),
    Supplier.aggregate([{ $group: { _id: null, total: { $sum: "$totalAmountDue" } } }]),
    RawMaterial.aggregate([
      { $group: { _id: "$coilCategory", totalStock: { $sum: "$currentStock" } } },
    ]),
  ]);
  fetchedData.totalPendingFromCustomers = customerPendingAgg[0]?.total || 0;
  fetchedData.totalPendingToSuppliers = supplierPendingAgg[0]?.total || 0;
  const stockMap = {};
  stockAgg.forEach((row) => {
    stockMap[row._id || "Unknown"] = row.totalStock || 0;
  });
  fetchedData.shipletCoilStockKg = stockMap["Shiplet Coil"] || 0;
  fetchedData.patriCoilStockKg = stockMap["Patri Coil"] || 0;

  const wantCheques =
    isChequeIntent(lower) ||
    (historyMentions(history, CHEQUE_KEYWORDS) && hasFollowupSignal(message));
  const wantGeneralSummary = isGeneralSummaryIntent(lower);
  const wantCustomers =
    isCustomersIntent(lower) ||
    (historyMentions(history, CUSTOMER_KEYWORDS) && hasFollowupSignal(message));
  const wantSuppliers = isSuppliersIntent(lower);
  const wantRawStock = isRawStockIntent(lower);
  const wantExpenses =
    isExpensesIntent(lower) ||
    (historyMentions(history, EXPENSE_KEYWORDS) && hasFollowupSignal(message));
  const wantProfit =
    isProfitIntent(lower) ||
    (historyMentions(history, PROFIT_KEYWORDS) && hasFollowupSignal(message));
  const wantOrders =
    isOrdersIntent(lower) ||
    (historyMentions(history, ORDER_KEYWORDS) && hasFollowupSignal(message));
  const wantCash =
    isCashIntent(lower) ||
    (historyMentions(history, CASH_KEYWORDS) && hasFollowupSignal(message));
  const wantReadyStock = isReadyStockIntent(lower);
  const wantAnnealing = isAnnealingIntent(lower);
  const wantJobWork = isJobWorkIntent(lower);
  const wantLowStock = isLowStockIntent(lower);
  const wantDailyBook = isDailyBookIntent(lower);
  const wantWorkers = isWorkersIntent(lower);
  const personQuery = extractPersonQuery(message);

  let period = null;
  if (wantExpenses || wantProfit || wantCash || wantDailyBook || wantCheques) {
    period = resolvePeriod(message, history, now);
  }

  if (wantCheques || wantGeneralSummary) {
    fetchedData.cheques = await loadChequeSnapshot(period, message);
    domainsFetched.push("cheques");
  }

  if (wantCustomers) {
    fetchedData.customers = await Customer.find(
      {},
      "name totalAmountDue totalAmountPaid totalAmountPurchased customerType"
    )
      .sort({ totalAmountDue: -1 })
      .limit(25)
      .lean();
    domainsFetched.push("customers");
  }

  if (wantSuppliers) {
    fetchedData.suppliers = await Supplier.find(
      {},
      "name companyName totalAmountDue totalAmountPaid totalAmountPurchased"
    )
      .sort({ totalAmountDue: -1 })
      .limit(25)
      .lean();
    domainsFetched.push("suppliers");
  }

  if (wantRawStock) {
    fetchedData.rawStockByCategory = await RawMaterial.aggregate([
      { $match: { isReturn: { $ne: true } } },
      { $group: { _id: "$coilCategory", totalStockKg: { $sum: "$currentStock" } } },
    ]);
    domainsFetched.push("rawStock");
  }

  if (wantExpenses) {
    let expensePeriod = period;
    if (expensePeriod.kind === "day") {
      const withExpense = await resolveDayPeriodWithData(expensePeriod, Expense, "expenseDate");
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
    domainsFetched.push("expenses");
  }

  if (wantProfit) {
    const profitPeriod = await resolveDayPeriodWithData(period, Order, "orderDate");
    const report = await buildProfitReport({
      startDate: profitPeriod.startDate,
      endDate: profitPeriod.endDate,
    });
    fetchedData.profitReport = summarizeProfitReport(report, profitPeriod);
    if (profitPeriod.note) fetchedData.profitReport.interpretationNote = profitPeriod.note;
    domainsFetched.push("profit");
  }

  if (wantOrders) {
    const [recentOrders, statusAgg] = await Promise.all([
      Order.find({ isReturn: { $ne: true } })
        .sort({ orderDate: -1 })
        .limit(15)
        .select("customerName wireNumber totalAmount orderStatus orderDate amountDue")
        .lean(),
      Order.aggregate([{ $group: { _id: "$orderStatus", count: { $sum: 1 } } }]),
    ]);
    const orderStatusCounts = { Outer: 0, "In Process": 0, Done: 0 };
    statusAgg.forEach((s) => {
      if (s._id in orderStatusCounts) orderStatusCounts[s._id] = s.count;
    });
    fetchedData.recentOrders = recentOrders.map((o) => ({
      ...o,
      orderDate: o.orderDate ? formatUtcDMY(new Date(o.orderDate)) : null,
    }));
    fetchedData.orderStatusCounts = orderStatusCounts;
    domainsFetched.push("orders");
  }

  if (wantCash) {
    const cashDate = localDateForCashBook(period);
    const [cashBook, accountSummaries, bankBalance] = await Promise.all([
      getCashBookForDate(cashDate),
      buildAccountSummaries(),
      currentBankBalance(),
    ]);
    fetchedData.cashBook = {
      periodLabel: period.kind === "day" ? period.label : formatUtcDMY(period.endDate),
      periodKind: period.kind,
      askedFor: period.label,
      date: formatUtcDMY(
        new Date(Date.UTC(cashDate.getFullYear(), cashDate.getMonth(), cashDate.getDate()))
      ),
      openingBalance: cashBook.openingBalance,
      totalIn: cashBook.totalIn,
      totalOut: cashBook.totalOut,
      closingBalance: cashBook.closingBalance,
      cashInHand: cashBook.closingBalance,
      expenseTotals: cashBook.expenseTotals || null,
      bankIn: cashBook.bankIn,
      bankOut: cashBook.bankOut,
    };
    fetchedData.bankAccounts = accountSummaries.map((a) => ({
      label: a.label,
      balance: a.balance,
      totalIn: a.totalIn,
      totalOut: a.totalOut,
    }));
    fetchedData.currentBankBalance = bankBalance;
    fetchedData.cashNote =
      "cashInHand / closingBalance is the cash in hand at end of that day. openingBalance is start of day. bankAccounts lists each bank's live balance; currentBankBalance is their sum.";
    domainsFetched.push("cash");
  }

  if (personQuery) {
    fetchedData.personLookup = await searchPeople(personQuery);
    domainsFetched.push("person");
    const lookup = fetchedData.personLookup;
    if (lookup?.workers?.length && !lookup?.customers?.length) {
      // Prefer Workers page when only workers matched
      const idx = domainsFetched.indexOf("person");
      // deep link map uses person→customers; add workers domain for link
      if (!domainsFetched.includes("workers")) domainsFetched.push("workers");
    } else if (lookup?.suppliers?.length && !lookup?.customers?.length) {
      if (!domainsFetched.includes("suppliers")) domainsFetched.push("suppliers");
    }
  }

  if (wantReadyStock) {
    fetchedData.readyStockByWire = await ReadyStock.aggregate([
      {
        $group: {
          _id: "$wireNumber",
          totalWeightKg: { $sum: "$weightKg" },
          totalBundles: { $sum: "$bundles" },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    domainsFetched.push("readyStock");
  }

  if (wantAnnealing) {
    fetchedData.annealingPending = await annealingPendingTotals();
    domainsFetched.push("annealing");
  }

  if (wantJobWork) {
    const jobWorks = await JobWork.find()
      .select("customerName arrivedWeightKg deliveredWeightKg labourTotal")
      .lean();
    let remainingTotalKg = 0;
    let labourEarnedTotal = 0;
    const remainingByCustomer = new Map();
    jobWorks.forEach((j) => {
      const remaining = Math.max(0, (j.arrivedWeightKg || 0) - (j.deliveredWeightKg || 0));
      remainingTotalKg += remaining;
      labourEarnedTotal += j.labourTotal || 0;
      if (remaining > 0.001) {
        const key = j.customerName || "Unknown";
        remainingByCustomer.set(key, (remainingByCustomer.get(key) || 0) + remaining);
      }
    });
    const topCustomersWithStock = Array.from(remainingByCustomer.entries())
      .map(([customerName, remainingKg]) => ({ customerName, remainingKg }))
      .sort((a, b) => b.remainingKg - a.remainingKg)
      .slice(0, 10);
    fetchedData.jobWork = {
      remainingTotalKg,
      labourEarnedTotal,
      topCustomersWithStock,
    };
    domainsFetched.push("jobWork");
  }

  if (wantLowStock) {
    const stockByCategory = await RawMaterial.aggregate([
      { $match: { isReturn: { $ne: true } } },
      { $group: { _id: "$coilCategory", totalStockKg: { $sum: "$currentStock" } } },
    ]);
    fetchedData.lowStockAlerts = stockByCategory
      .filter((s) => (s.totalStockKg || 0) < 1000)
      .map((s) => ({ category: s._id || "Unknown", totalStockKg: s.totalStockKg || 0 }));
    domainsFetched.push("lowStock");
  }

  if (wantDailyBook) {
    let report;
    if (period.kind === "day") {
      report = await buildDailyBookReport({ date: localDateForCashBook(period) });
    } else {
      report = await buildDailyBookReport({
        startDate: localNoonForUtcDate(period.startDate),
        endDate: localNoonForUtcDate(period.endDate),
      });
    }
    fetchedData.dailyBook = summarizeDailyBookReport(report, period);
    domainsFetched.push("dailyBook");
  }

  if (wantWorkers) {
    const activeWorkers = await Worker.find({ active: true }).lean();
    const withSummary = await Promise.all(
      activeWorkers.map(async (w) => {
        const summary = await computeWorkerSummary(w);
        return {
          name: w.name,
          role: w.role || "",
          phone: w.phone || "",
          salaryDue: summary.salaryDue,
          payments: summary.payments,
          advances: summary.advances,
          remaining: summary.remaining,
        };
      })
    );
    withSummary.sort((a, b) => b.remaining - a.remaining);
    fetchedData.workers = withSummary.slice(0, 25);
    domainsFetched.push("workers");
  }

  let refusalMessage = null;
  if (isHelpRequest(lower)) {
    refusalMessage = CAPABILITIES_TEXT;
  } else if (domainsFetched.length === 0 && !isGreeting(message)) {
    // If the message is a dynamic question, load a cross-domain snapshot (cash, bank, cheques, customers)
    const isQuestionLike =
      /\b(how|what|who|which|when|where|why|can|is|are|tell|give|show|kitna|kitne|kaun|kya|batao|bataen|balance|hisaab|hisab|paisa|rupaye|rs|factory|wms|cheque|check)\b/i.test(
        lower
      ) || lower.length > 6;

    if (isQuestionLike) {
      fetchedData.cheques = await loadChequeSnapshot(period, message);
      domainsFetched.push("cheques");
      const cashDate = localDateForCashBook(period || defaultThisMonth(now));
      const [cashBook, bankBalance] = await Promise.all([
        getCashBookForDate(cashDate),
        currentBankBalance(),
      ]);
      fetchedData.cashBook = {
        date: formatUtcDMY(new Date(Date.UTC(cashDate.getFullYear(), cashDate.getMonth(), cashDate.getDate()))),
        closingBalance: cashBook.closingBalance,
        cashInHand: cashBook.closingBalance,
      };
      fetchedData.currentBankBalance = bankBalance;
      domainsFetched.push("cash");
    } else {
      refusalMessage = `I'm not sure how to answer that from WMS data yet. Here's what I can help with:\n\n${CAPABILITIES_TEXT}`;
    }
  }

  return {
    fetchedData,
    domainsFetched,
    period: period
      ? {
          label: period.label,
          kind: period.kind,
          start: formatUtcDMY(period.startDate),
          end: formatUtcDMY(period.endDate),
        }
      : null,
    deepLinks: buildDeepLinks(domainsFetched),
    refusalMessage,
    todayFormatted,
  };
}

module.exports = {
  buildChatContext,
  CAPABILITIES_TEXT,
};
