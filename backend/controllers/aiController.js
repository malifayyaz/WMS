const { buildChatContext, CAPABILITIES_TEXT } = require("../utils/aiContextBuilder");
const { buildProfitReport } = require("../utils/profitReportService");
const { buildDayReport } = require("../utils/dailyBookReportService");
const { currentBankBalance } = require("../utils/bankBalanceService");
const Customer = require("../models/Customer");
const RawMaterial = require("../models/RawMaterial");
const Order = require("../models/Order");
const groq = require("../utils/groqClient");
const { parseUserIntent } = require("../utils/actionParserService");
const {
  executeAction,
  findDeletableEntries,
  findShiftableEntries,
} = require("../utils/actionExecutorService");
const { undoAction } = require("../utils/undoService");
const { startOfMonth, endOfMonth, subMonths, startOfDay, endOfDay } = require("date-fns");

/** Bump when summary context/prompt logic changes so stale wrong text is not served. */
const SUMMARY_CACHE_VERSION = 4;
const summaryCache = {};

function formatUtcDMY(d) {
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

function formatRs(amount) {
  const n = Math.round(Number(amount) || 0);
  return `Rs. ${n.toLocaleString("en-PK")}`;
}

function formatKg(kg) {
  const n = Number(kg) || 0;
  return `${n.toLocaleString("en-PK", { maximumFractionDigits: 2 })} kg`;
}

function toUtcDateKey(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Resolve ?date=YYYY-MM-DD as a WMS business calendar day.
 * cashDate MUST be the YYYY-MM-DD string (or Date from that string) — same as Daily Book
 * transactionsAPI.getCashBook({ date }). On servers west of UTC, local-noon shifts the
 * day window forward and picks the NEXT calendar day's UTC-midnight expenses.
 */
function resolveBusinessDay(dateStr) {
  let y;
  let m;
  let d;
  if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(String(dateStr))) {
    [y, m, d] = String(dateStr).split("-").map(Number);
    m -= 1;
  } else {
    const now = new Date();
    y = now.getUTCFullYear();
    m = now.getUTCMonth();
    d = now.getUTCDate();
  }
  const dateKey = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return {
    y,
    m,
    d,
    dateKey,
    dateLabel: `${String(d).padStart(2, "0")}/${String(m + 1).padStart(2, "0")}/${y}`,
    utcStart: new Date(Date.UTC(y, m, d, 0, 0, 0, 0)),
    utcEnd: new Date(Date.UTC(y, m, d, 23, 59, 59, 999)),
    // Same input Daily Book uses — NOT local noon
    cashDate: dateKey,
  };
}

function sumBy(rows, pred) {
  return (rows || []).reduce((s, r) => (pred(r) ? s + (Number(r.amount) || 0) : s), 0);
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

    const context = await buildChatContext(message, conversationHistory);
    const {
      fetchedData,
      domainsFetched,
      period,
      deepLinks,
      refusalMessage,
      todayFormatted,
    } = context;

    if (refusalMessage) {
      return res.json({
        success: true,
        data: {
          answer: refusalMessage,
          domainsFetched: domainsFetched || [],
          period: period || null,
          deepLinks: deepLinks || [],
        },
      });
    }

    const systemPrompt =
      `You are a helpful business assistant for a wire manufacturing factory in Pakistan called WMS. Today is ${todayFormatted} (DD/MM/YYYY).\n` +
      `Live business data (JSON):\n${JSON.stringify(fetchedData, null, 2)}\n` +
      `Domains loaded for this question: ${(domainsFetched || []).join(", ") || "snapshot only"}.\n` +
      `Rules:
- Answer using ONLY this live data. Be concise, friendly, and specific with numbers.
- Respond in the same language the user used (English or Urdu).
- Format currency as Rs. X,XXX. Read integers exactly (275022 is Rs. 275,022).
- Dates are DD/MM/YYYY.
- If a domain section is present, use it; if a figure is 0 say so — do not invent numbers.
- For cash: cashInHand/closingBalance is cash in hand for that date.
- For expenses: use totalAmount and list items when asked for a day.
- For profit: use finalNetProfit / gross figures from profitReport for periodLabel.
- For personLookup: identify Customer/Supplier/Worker and balances.
- For readyStock / annealing / jobWork / lowStock / workers / dailyBook: use those sections.
- Mention the period when relevant. Never invent figures from chat memory.`;

    const history = Array.isArray(conversationHistory)
      ? conversationHistory.slice(-10)
      : [];

    const messages = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: message },
    ];

    let answer;
    try {
      const response = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages,
        max_tokens: 1024,
        temperature: 0.25,
      });
      answer = response.choices[0]?.message?.content;
    } catch (modelErr) {
      console.warn("Primary Groq model failed, falling back to 8b:", modelErr.message);
      const response = await groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        messages,
        max_tokens: 1024,
        temperature: 0.25,
      });
      answer = response.choices[0]?.message?.content;
    }

    return res.json({
      success: true,
      data: {
        answer: answer || "I could not generate a response.",
        domainsFetched: domainsFetched || [],
        period: period || null,
        deepLinks: deepLinks || [],
      },
    });
  } catch (error) {
    console.error("AI chat error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "AI chat failed",
    });
  }
};

/** AI-written daily business summary (cached 1 hour per date). Optional ?date=YYYY-MM-DD. */
exports.getDailySummary = async (req, res) => {
  try {
    const day = resolveBusinessDay(req.query.date);
    const todayKey = toUtcDateKey(new Date());

    if (day.dateKey > todayKey) {
      return res.status(400).json({
        success: false,
        message: "Cannot generate a summary for a future date",
      });
    }

    const cacheKey = `v${SUMMARY_CACHE_VERSION}:${day.dateKey}`;
    const cached = summaryCache[cacheKey];
    if (
      cached &&
      cached.generatedAt &&
      Date.now() - new Date(cached.generatedAt).getTime() < 60 * 60 * 1000
    ) {
      return res.json({ success: true, data: cached });
    }

    const isToday = day.dateKey === todayKey;

    // Same day window Daily Book / getCashBookForDate use for YYYY-MM-DD
    const reportStart = startOfDay(new Date(day.dateKey));
    const reportEnd = endOfDay(reportStart);

    const [dayReport, dayOrders, rawStock, customerDueAgg, liveBankBalance] = await Promise.all([
      buildDayReport(day.cashDate),
      Order.find({
        orderDate: { $gte: reportStart, $lte: reportEnd },
        isReturn: { $ne: true },
      }).select("totalAmount initialWeightKg finalWeightKg"),
      RawMaterial.aggregate([
        { $group: { _id: "$coilCategory", totalStock: { $sum: "$currentStock" } } },
      ]),
      Customer.aggregate([
        { $group: { _id: null, total: { $sum: "$totalAmountDue" } } },
      ]),
      currentBankBalance(),
    ]);

    const cash = dayReport.cash || {};
    const expenseTotals = cash.expenseTotals || {};
    const factoryTotal = expenseTotals.factoryTotal || 0;
    const selfTotal = expenseTotals.selfTotal || 0;
    const processMaterialTotal = expenseTotals.processMaterialTotal || 0;
    const fayyaz = expenseTotals.fayyaz || 0;
    const faisal = expenseTotals.faisal || 0;
    const mutual = expenseTotals.mutual || 0;
    const expensesCashTotal = factoryTotal + selfTotal;

    // Cash Money In/Out from Daily Book (excludes Bank Transfer; expense lines already in cash.totalOut)
    const cashMoneyInTotal = cash.totalIn || 0;
    const cashMoneyOutTotal = cash.totalOut || 0;
    const customerPaymentsCash = sumBy(
      dayReport.moneyIn,
      (t) => !t.relatedTo || t.relatedTo === "Customer"
    );
    const supplierPaymentsCash = sumBy(
      dayReport.moneyOut,
      (t) => t.relatedTo === "Supplier" && t.source !== "Expense"
    );

    const bankDay = dayReport.bankSummary || {};
    const bankInDay = bankDay.totalIn || cash.bankIn || 0;
    const bankOutDay = bankDay.totalOut || cash.bankOut || 0;
    const bankTransfers = (dayReport.bankTransfers || []).map((t) => ({
      type: t.transactionType,
      amount: t.amount || 0,
      amountDisplay: formatRs(t.amount || 0),
      relatedName: t.relatedName || "",
      bankAccount: t.bankAccount || "",
      description: t.description || "",
      isAtm: !!t.isAtm,
    }));

    const chequeInRows = (dayReport.moneyIn || []).filter((t) => t.paymentMethod === "Cheque");
    const chequeOutRows = (dayReport.moneyOut || []).filter(
      (t) => t.paymentMethod === "Cheque" && t.source !== "Expense"
    );
    const chequeInTotal = chequeInRows.reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const chequeOutTotal = chequeOutRows.reduce((s, t) => s + (Number(t.amount) || 0), 0);

    const anneal = dayReport.annealing?.totals || {};
    const processing = dayReport.processing?.totals || {};
    const purchasesKg = dayReport.totalPurchasesKg || 0;

    const totalSalesKg = dayOrders.reduce(
      (sum, o) => sum + (o.finalWeightKg ?? o.initialWeightKg ?? 0),
      0
    );
    const totalSalesAmount = dayOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    const salesKg =
      dayOrders.length > 0 ? totalSalesKg : dayReport.totalSalesKg || 0;

    const stockMap = {};
    rawStock.forEach((row) => {
      stockMap[row._id || "Unknown"] = row.totalStock || 0;
    });
    const shipletCoilStock = stockMap["Shiplet Coil"] || 0;
    const patriCoilStock = stockMap["Patri Coil"] || 0;
    const totalCustomerDue = customerDueAgg[0]?.total || 0;

    const hasBankActivity = bankInDay > 0 || bankOutDay > 0 || bankTransfers.length > 0;
    const hasChequeActivity = chequeInTotal > 0 || chequeOutTotal > 0;
    const hasAnnealing =
      (anneal.sentKg || 0) > 0 || (anneal.arrivedKg || 0) > 0 || (anneal.soldKg || 0) > 0;
    const hasProcessing =
      (processing.coilInKg || 0) > 0 ||
      (processing.wireOutKg || 0) > 0 ||
      (processing.labourEarned || 0) > 0;

    const context = {
      date: day.dateLabel,
      isToday,
      cashOpening: cash.openingBalance ?? 0,
      cashIn: cashMoneyInTotal,
      cashOut: cashMoneyOutTotal,
      cashClosing: cash.closingBalance ?? 0,
      cashOpeningDisplay: formatRs(cash.openingBalance ?? 0),
      cashInDisplay: formatRs(cashMoneyInTotal),
      cashOutDisplay: formatRs(cashMoneyOutTotal),
      cashClosingDisplay: formatRs(cash.closingBalance ?? 0),
      expenses: {
        factoryTotal,
        selfTotal,
        processMaterialTotal,
        fayyaz,
        faisal,
        mutual,
        cashExpensesTotal: expensesCashTotal,
        factoryTotalDisplay: formatRs(factoryTotal),
        selfTotalDisplay: formatRs(selfTotal),
        cashExpensesTotalDisplay: formatRs(expensesCashTotal),
        note: "Cash expense totals (factory + self, including process materials; excluding bank-paid expenses) are already included in cashOut / cashClosing.",
      },
      payments: {
        customerPaymentsCash,
        supplierPaymentsCash,
        cashMoneyInTotal,
        customerPaymentsCashDisplay: formatRs(customerPaymentsCash),
        supplierPaymentsCashDisplay: formatRs(supplierPaymentsCash),
        cashMoneyInDisplay: formatRs(cashMoneyInTotal),
        note: "Cash channel only. Bank and cheque are under bankDay / cheques.",
      },
      bankDay: {
        hasActivity: hasBankActivity,
        bankIn: bankInDay,
        bankOut: bankOutDay,
        dayOpening: bankDay.openingBalance ?? null,
        dayClosing: bankDay.closingBalance ?? null,
        bankInDisplay: formatRs(bankInDay),
        bankOutDisplay: formatRs(bankOutDay),
        dayOpeningDisplay:
          bankDay.openingBalance != null ? formatRs(bankDay.openingBalance) : null,
        dayClosingDisplay:
          bankDay.closingBalance != null ? formatRs(bankDay.closingBalance) : null,
        transferCount: bankTransfers.length,
        transfers: bankTransfers.slice(0, 12),
        note: "Bank Transfer Money In/Out for this date (separate from cash in hand).",
      },
      cheques: {
        hasActivity: hasChequeActivity,
        chequeInTotal,
        chequeOutTotal,
        chequeInCount: chequeInRows.length,
        chequeOutCount: chequeOutRows.length,
        chequeInDisplay: formatRs(chequeInTotal),
        chequeOutDisplay: formatRs(chequeOutTotal),
        note: "Cheque amounts are also included in cashIn/cashOut; mention them explicitly when non-zero.",
      },
      sales: {
        orderCount: dayOrders.length || (dayReport.sales || []).length,
        totalSalesKg: salesKg,
        totalSalesAmount,
        totalSalesKgDisplay: formatKg(salesKg),
        totalSalesAmountDisplay: formatRs(totalSalesAmount),
        purchasesKg,
        purchasesKgDisplay: formatKg(purchasesKg),
      },
      annealing: {
        hasActivity: hasAnnealing,
        sentKg: anneal.sentKg || 0,
        sentBundles: anneal.sentBundles || 0,
        arrivedKg: anneal.arrivedKg || 0,
        arrivedBundles: anneal.arrivedBundles || 0,
        soldKg: anneal.soldKg || 0,
        soldBundles: anneal.soldBundles || 0,
        sentKgDisplay: formatKg(anneal.sentKg || 0),
        arrivedKgDisplay: formatKg(anneal.arrivedKg || 0),
        soldKgDisplay: formatKg(anneal.soldKg || 0),
      },
      processing: {
        hasActivity: hasProcessing,
        coilInKg: processing.coilInKg || 0,
        wireOutKg: processing.wireOutKg || 0,
        wireOutBundles: processing.wireOutBundles || 0,
        labourEarned: processing.labourEarned || 0,
        coilInKgDisplay: formatKg(processing.coilInKg || 0),
        wireOutKgDisplay: formatKg(processing.wireOutKg || 0),
        labourEarnedDisplay: formatRs(processing.labourEarned || 0),
        note: "Job work / processing: customer coil in, finished wire out, labour earned.",
      },
      currentSnapshot: {
        liveBankBalanceAllAccounts: liveBankBalance ?? 0,
        liveBankBalanceDisplay: formatRs(liveBankBalance ?? 0),
        shipletCoilStockKg: shipletCoilStock,
        patriCoilStockKg: patriCoilStock,
        shipletCoilStockDisplay: formatKg(shipletCoilStock),
        patriCoilStockDisplay: formatKg(patriCoilStock),
        totalCustomerDue,
        totalCustomerDueDisplay: formatRs(totalCustomerDue),
        lowStockAlert: shipletCoilStock < 1000 || patriCoilStock < 1000,
      },
      coverageHints: {
        mentionBankIf: hasBankActivity,
        mentionChequesIf: hasChequeActivity,
        mentionAnnealingIf: hasAnnealing,
        mentionProcessingIf: hasProcessing,
      },
      note: isToday
        ? "Day figures are from Daily Book. currentSnapshot is live stock/dues/all-time bank."
        : "Day figures are from Daily Book for this past date. currentSnapshot is live — not that day's historical closing.",
    };

    const systemPrompt =
      "You are a daily business summary writer for a wire manufacturing factory in Pakistan. " +
      "Write a friendly, professional summary of that day's business activity. " +
      "Rules: write 4 to 6 sentences in English as a flowing paragraph (no bullet points); " +
      "always end with one actionable suggestion if relevant (reorder stock, follow up on dues, chase annealing returns, etc.). " +
      "CRITICAL: Use ONLY the provided Display strings for money and kg. Do NOT recalculate amounts. " +
      "Cash closing already includes cash expenses; do not subtract expenses again. " +
      "When coverageHints.mentionBankIf is true, mention bank Money In/Out (and notable transfers/ATM if listed). " +
      "When coverageHints.mentionChequesIf is true, mention cheque in/out totals. " +
      "When coverageHints.mentionAnnealingIf is true, mention annealing sent/arrived/sold kg. " +
      "When coverageHints.mentionProcessingIf is true, mention processing (job work) coil in, wire out, and labour earned. " +
      "Skip sections whose hasActivity/coverageHints flag is false. " +
      "If isToday is false, refer to that past date (not \"today\") and do not treat currentSnapshot as that day's closing.";

    const userMessage =
      "Write the business summary for " +
      context.date +
      " using these exact figures (prefer *Display fields): " +
      JSON.stringify(context);

    const response = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      max_tokens: 400,
      temperature: 0.3,
    });

    const answer =
      response.choices[0]?.message?.content ||
      "No summary could be generated for this date.";

    summaryCache[cacheKey] = {
      summary: answer,
      generatedAt: new Date(),
      date: day.dateKey,
    };
    return res.json({ success: true, data: summaryCache[cacheKey] });
  } catch (error) {
    console.error("AI daily summary error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Daily summary failed",
    });
  }
};

/** Compare current vs previous month P&L (trend hint — not ML prediction). */
exports.predictProfit = async (req, res) => {
  try {
    const now = new Date();
    const thisStart = startOfMonth(now);
    const thisEnd = endOfMonth(now);
    const prev = subMonths(now, 1);
    const prevStart = startOfMonth(prev);
    const prevEnd = endOfMonth(prev);

    const [current, previous] = await Promise.all([
      buildProfitReport({ startDate: thisStart, endDate: thisEnd }),
      buildProfitReport({ startDate: prevStart, endDate: prevEnd }),
    ]);

    const curNet = current.combined?.finalNetProfit ?? 0;
    const prevNet = previous.combined?.finalNetProfit ?? 0;
    const delta = curNet - prevNet;

    return res.json({
      success: true,
      data: {
        basis: "month-over-month comparison (not a machine-learning forecast)",
        currentMonth: {
          label: formatUtcDMY(thisStart).slice(3),
          finalNetProfit: curNet,
          grossProfit: current.combined?.grossProfit ?? 0,
          hasActivity: current.hasActivity,
        },
        previousMonth: {
          label: formatUtcDMY(prevStart).slice(3),
          finalNetProfit: prevNet,
          grossProfit: previous.combined?.grossProfit ?? 0,
          hasActivity: previous.hasActivity,
        },
        change: delta,
        trend: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
        note: "Use Reports page for full P&L detail.",
        deepLinks: [{ label: "Open Reports", path: "/reports" }],
      },
    });
  } catch (error) {
    console.error("AI predict profit error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Predict profit failed",
    });
  }
};

/**
 * Lightweight natural-language order sketch parser (not order creation).
 * Example: "sell 500kg wire 12 to ali @ 280"
 */
exports.parseOrder = async (req, res) => {
  try {
    const text = String(req.body?.text || "").trim();
    if (!text) {
      return res.status(400).json({ success: false, message: "text is required" });
    }

    const lower = text.toLowerCase();
    const wireMatch = lower.match(/wire\s*#?\s*(\d{1,2})\b/) || lower.match(/\b#\s*(\d{1,2})\b/);
    const kgMatch = lower.match(/(\d+(?:\.\d+)?)\s*kg/);
    const rateMatch = lower.match(/(?:@|rate|per\s*kg)\s*(\d+(?:\.\d+)?)/i);
    const customerMatch =
      text.match(/(?:to|for|customer)\s+([A-Za-z][A-Za-z\s.'-]{1,40})/i) ||
      text.match(/^([A-Za-z][A-Za-z\s.'-]{1,40})\s+\d/);

    const parsed = {
      rawText: text,
      wireNumber: wireMatch ? Number(wireMatch[1]) : null,
      weightKg: kgMatch ? Number(kgMatch[1]) : null,
      ratePerKg: rateMatch ? Number(rateMatch[1]) : null,
      customerName: customerMatch ? customerMatch[1].trim() : null,
      confidence: "low",
    };

    let hits = 0;
    if (parsed.wireNumber) hits += 1;
    if (parsed.weightKg) hits += 1;
    if (parsed.ratePerKg) hits += 1;
    if (parsed.customerName) hits += 1;
    parsed.confidence = hits >= 3 ? "high" : hits >= 2 ? "medium" : "low";
    parsed.note =
      "This only extracts fields from text. Create the order in the Orders page after reviewing.";
    parsed.deepLinks = [{ label: "Open Orders", path: "/orders" }];

    return res.json({ success: true, data: parsed });
  } catch (error) {
    console.error("AI parse order error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Parse order failed",
    });
  }
};

function formatPreviewRs(n) {
  return Number(n || 0).toLocaleString("en-PK");
}

/**
 * Date the client is currently working on in Daily Book (YYYY-MM-DD).
 * Used when the user does not mention a date.
 */
function sanitizeDefaultDate(value) {
  const s = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function buildPreviewMessage(intent, data = {}) {
  switch (intent) {
    case "CREATE_ORDER": {
      const total =
        Number(data.initialWeightKg || 0) * Number(data.ratePerKg || 0);
      return `Create order for ${data.customerName || "customer"}: ${data.initialWeightKg}kg Wire #${data.wireNumber} at Rs.${formatPreviewRs(data.ratePerKg)}/kg\nTotal: Rs.${formatPreviewRs(total)}`;
    }
    case "RECORD_CUSTOMER_PAYMENT": {
      const via = data.paymentMethod || "Cash";
      const bankBit =
        String(via).toLowerCase().includes("bank") && data.bankAccount
          ? ` (${data.bankAccount})`
          : "";
      return `Record payment of Rs.${formatPreviewRs(data.amount)} from ${data.customerName || "customer"} via ${via}${bankBit}`;
    }
    case "CREATE_RAW_MATERIAL_PURCHASE": {
      const total = Number(data.weightInKg || 0) * Number(data.ratePerKg || 0);
      return `Record purchase of ${data.weightInKg}kg ${data.coilCategory || "coil"} from ${data.supplierName || "supplier"} at Rs.${formatPreviewRs(data.ratePerKg)}/kg\nTotal: Rs.${formatPreviewRs(total)}`;
    }
    case "ADD_EXPENSE": {
      const viaBank =
        String(data.paymentMethod || "")
          .toLowerCase()
          .includes("bank") || /\bbank\b|\btransfer\b/.test(String(data.paymentMethod || ""));
      const bankNote = viaBank
        ? ` via ${data.bankAccount || "MBL"} (bank balance will be deducted)`
        : "";
      return `Add expense of Rs.${formatPreviewRs(data.amount)} (${data.expenseCategory || data.expenseGroup || "expense"})${bankNote}`;
    }
    case "ATM_WITHDRAWAL":
      return `ATM withdrawal of Rs.${formatPreviewRs(data.amount)} for ${data.expenseCategory || data.selfExpensePerson || "Fayyaz Expense"} from ${data.bankAccount || "MBL"} (bank balance will be deducted)`;
    case "ADD_DAILY_TRANSACTION": {
      const dir = data.transactionType || "transaction";
      const party = data.relatedName || data.supplierName || data.customerName || "";
      const via = data.paymentMethod || "Cash";
      const bankBit =
        String(via).toLowerCase().includes("bank") && data.bankAccount
          ? ` (${data.bankAccount})`
          : "";
      return `Record ${dir} of Rs.${formatPreviewRs(data.amount)}${party ? ` — ${party}` : ""} via ${via}${bankBit}`;
    }
    case "SEND_ANNEALING":
      return `Send ${data.weightKg || data.bundles || "?"}kg ${data.coilType || data.coilCategory || "coil"} to annealing`;
    case "ARRIVE_ANNEALING":
      return `Record annealing arrival of ${data.weightKg}kg ${data.coilType || data.coilCategory || "coil"}${data.weightLossKg ? ` (loss ${data.weightLossKg}kg)` : ""}`;
    case "ADD_PROCESSING_DELIVERY":
      return `Record processing delivery of ${data.weightKg}kg for ${data.customerName || "customer"}${data.labourAmount ? ` — labour Rs.${formatPreviewRs(data.labourAmount)}` : ""}`;
    case "ADD_CUSTOMER":
      return `Add new customer "${data.name}" (${data.customerType || "Ledger"})`;
    case "ADD_SUPPLIER":
      return `Add new supplier "${data.name}"${data.companyName ? ` — ${data.companyName}` : ""}`;
    case "ADD_READY_STOCK":
      return `Add ${data.producedWeightKg || data.weightKg}kg wire #${data.wireNumber} to ready stock`;
    case "ADD_WORKER_PAYMENT":
      return `Record ${data.entryType || "Payment"} of Rs.${formatPreviewRs(data.amount)} for ${data.workerName || "worker"}`;
    case "DELETE_ENTRY":
      return `Delete this entry (cannot be undone):\n${data.label || "matched record"}`;
    case "SHIFT_ENTRY_DATE": {
      const from = String(data.fromDate || "").slice(0, 10);
      const to = String(data.toDate || "").slice(0, 10);
      const count = Array.isArray(data.items)
        ? data.items.length
        : Array.isArray(data.ids)
          ? data.ids.length
          : 0;
      const kind =
        data.entryType === "expense"
          ? "expense(s)"
          : data.entryType === "payment"
            ? "payment(s)"
            : data.entryType === "order"
              ? "order(s)"
              : data.entryType === "purchase"
                ? "purchase(s)"
                : data.entryType === "worker payment"
                  ? "worker payment(s)"
                  : "transaction(s)";
      const amountNote = data.amount ? ` of Rs.${formatPreviewRs(data.amount)}` : "";
      const list = (data.labels || [])
        .map((label, i) => `${i + 1}. ${label}`)
        .join("\n");
      return `Move ${count} ${kind}${amountNote} from ${from} → ${to} (cannot be undone):\n${list}`;
    }
    default:
      return `Confirm action: ${intent}`;
  }
}

function missingFieldsQuestion(missingFields = []) {
  if (!missingFields.length) {
    return "Could you give more details? What would you like to do?";
  }
  const labels = missingFields.map((f) => f.replace(/([A-Z])/g, " $1").toLowerCase().trim());
  if (labels.length === 1) {
    return `Please provide the ${labels[0]}.`;
  }
  const last = labels[labels.length - 1];
  return `Please provide: ${labels.slice(0, -1).join(", ")} and ${last}.`;
}

const REQUIRED_FIELDS_BY_INTENT = {
  CREATE_ORDER: ["customerId|customerName", "wireNumber", "initialWeightKg", "ratePerKg"],
  RECORD_CUSTOMER_PAYMENT: ["customerId|customerName", "amount"],
  CREATE_RAW_MATERIAL_PURCHASE: [
    "supplierId|supplierName",
    "coilCategory",
    "weightInKg",
    "ratePerKg",
  ],
  ADD_EXPENSE: ["amount", "expenseCategory|selfExpensePerson|expenseGroup"],
  ATM_WITHDRAWAL: ["amount"],
  ADD_DAILY_TRANSACTION: ["amount", "transactionType", "relatedName|supplierName|customerName"],
  SEND_ANNEALING: ["coilType|coilCategory", "weightKg|bundles"],
  ARRIVE_ANNEALING: ["coilType|coilCategory", "weightKg"],
  ADD_PROCESSING_DELIVERY: [
    "customerId|customerName",
    "weightKg",
    "labourAmount|labourRatePerKg",
  ],
  ADD_CUSTOMER: ["name"],
  ADD_SUPPLIER: ["name"],
  ADD_READY_STOCK: ["wireNumber", "producedWeightKg|weightKg"],
  ADD_WORKER_PAYMENT: ["workerId|workerName", "amount"],
  DELETE_ENTRY: [],
  SHIFT_ENTRY_DATE: ["fromDate", "toDate"],
};

function fieldPresent(data, fieldSpec) {
  const alts = fieldSpec.split("|");
  return alts.some((key) => {
    const v = data?.[key];
    if (v === null || v === undefined || v === "") return false;
    if (typeof v === "number" && Number.isNaN(v)) return false;
    return true;
  });
}

/**
 * Only fields in REQUIRED_FIELDS_BY_INTENT can block a preview.
 * LLM-reported missingFields are ignored — the model often invents
 * optional contact/address/soldBy/etc as "required".
 */
function collectRequiredMissing(intent, extractedData, _reportedMissing = []) {
  const required = REQUIRED_FIELDS_BY_INTENT[intent] || [];
  const data = extractedData || {};
  const missing = [];
  required.forEach((spec) => {
    if (!fieldPresent(data, spec)) {
      missing.push(spec.split("|")[0]);
    }
  });
  return missing;
}

/** Reuse existing chat() without modifying it — capture its JSON response. */
function runExistingChat(message, conversationHistory) {
  return new Promise((resolve, reject) => {
    const fakeReq = { body: { message, conversationHistory } };
    const fakeRes = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        resolve({ statusCode: this.statusCode || 200, payload });
      },
    };
    Promise.resolve(exports.chat(fakeReq, fakeRes)).catch(reject);
  });
}

async function handleShiftPreview(res, parsed) {
  const data = parsed.extractedData || {};
  const { matches } = await findShiftableEntries(data);
  const fromLabel = String(data.fromDate || "").slice(0, 10);
  const kindLabel =
    data.entryType === "expense"
      ? "expenses"
      : data.entryType === "payment"
        ? "payments"
        : data.entryType === "order"
          ? "orders"
          : data.entryType === "purchase"
            ? "purchases"
            : data.entryType === "worker payment"
              ? "worker payments"
              : "transactions";

  if (matches.length === 0) {
    const amountNote = data.amount ? ` of Rs.${Number(data.amount).toLocaleString("en-PK")}` : "";
    return res.json({
      success: true,
      type: "clarification",
      message: `No ${kindLabel}${amountNote} found on ${fromLabel || "that date"}.`,
    });
  }

  const extractedData = {
    fromDate: data.fromDate,
    toDate: data.toDate,
    entryType: data.entryType || "any",
    amount: data.amount || undefined,
    shiftAll: Boolean(data.shiftAll),
    items: matches.map((m) => ({ model: m.model, id: m.id })),
    ids: matches.map((m) => m.id),
    labels: matches.map((m) => m.label),
  };

  return res.json({
    success: true,
    type: "preview",
    intent: "SHIFT_ENTRY_DATE",
    extractedData,
    confidence: "high",
    missingFields: [],
    previewMessage: buildPreviewMessage("SHIFT_ENTRY_DATE", extractedData),
  });
}

/**
 * Deletes are destructive, so resolve the actual record before previewing:
 * show exactly what will be removed, or ask the user to narrow it down.
 */
async function handleDeletePreview(res, parsed) {
  const data = parsed.extractedData || {};
  const { matches, partyNotFound } = await findDeletableEntries(data);

  if (partyNotFound) {
    return res.json({
      success: true,
      type: "clarification",
      message: `I could not find anyone named "${partyNotFound}". Please check the name.`,
    });
  }

  if (matches.length === 0) {
    return res.json({
      success: true,
      type: "clarification",
      message:
        "I could not find a matching entry to delete. Please mention the type (payment, expense, order, purchase), the party name, the amount or the date.",
    });
  }

  if (matches.length > 1) {
    const list = matches.map((m, i) => `${i + 1}. ${m.label}`).join("\n");
    return res.json({
      success: true,
      type: "clarification",
      message: `I found ${matches.length} matching entries:\n${list}\nPlease tell me the exact amount or date of the one to delete.`,
    });
  }

  const match = matches[0];
  const extractedData = {
    model: match.model,
    id: match.id,
    label: match.label,
  };

  return res.json({
    success: true,
    type: "preview",
    intent: "DELETE_ENTRY",
    extractedData,
    confidence: "high",
    missingFields: [],
    previewMessage: buildPreviewMessage("DELETE_ENTRY", extractedData),
  });
}

exports.agentChat = async (req, res) => {
  try {
    const { message, conversationHistory = [] } = req.body;
    const defaultDate = sanitizeDefaultDate(req.body.defaultDate);
    if (!message || typeof message !== "string") {
      return res.status(400).json({
        success: false,
        message: "message is required",
      });
    }

    const parsed = await parseUserIntent(message, conversationHistory);

    if (parsed.intent === "SHIFT_ENTRY_DATE") {
      return handleShiftPreview(res, parsed);
    }

    if (parsed.intent === "DELETE_ENTRY") {
      return handleDeletePreview(res, parsed);
    }

    if (parsed.intent === "READ_QUERY") {
      const chatResult = await runExistingChat(message, conversationHistory);
      const chatData = chatResult.payload?.data || {};
      const answer =
        chatData.answer ||
        chatResult.payload?.answer ||
        chatResult.payload?.message ||
        "Sorry, I could not generate a response.";
      if (chatResult.statusCode >= 400) {
        return res.status(chatResult.statusCode).json(chatResult.payload);
      }
      return res.json({
        success: true,
        type: "answer",
        answer,
        data: {
          answer,
          domainsFetched: chatData.domainsFetched || [],
          period: chatData.period || null,
          deepLinks: chatData.deepLinks || [],
        },
      });
    }

    if (parsed.intent === "UNKNOWN" || parsed.confidence === "low") {
      return res.json({
        success: true,
        type: "clarification",
        message:
          parsed.clarificationNeeded ||
          "Could you give more details? What would you like to do?",
      });
    }

    const missingFields = collectRequiredMissing(
      parsed.intent,
      parsed.extractedData,
      Array.isArray(parsed.missingFields) ? parsed.missingFields : []
    );

    if (missingFields.length > 0) {
      return res.json({
        success: true,
        type: "clarification",
        message: missingFieldsQuestion(missingFields),
        missingFields,
      });
    }

    return res.json({
      success: true,
      type: "preview",
      intent: parsed.intent,
      extractedData: {
        ...(parsed.extractedData || {}),
        ...(defaultDate ? { defaultDate } : {}),
      },
      confidence: parsed.confidence,
      missingFields: [],
      previewMessage: buildPreviewMessage(
        parsed.intent,
        parsed.extractedData || {}
      ),
    });
  } catch (error) {
    console.error("AI agentChat error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "AI agent chat failed",
    });
  }
};

exports.executeAgentAction = async (req, res) => {
  try {
    const { intent, extractedData } = req.body;
    if (!intent) {
      return res.status(400).json({
        success: false,
        message: "intent is required",
      });
    }
    const defaultDate = sanitizeDefaultDate(req.body.defaultDate);
    const userId = req.user?._id || req.user?.id;
    const payload = { ...(extractedData || {}) };
    if (defaultDate && !payload.defaultDate) payload.defaultDate = defaultDate;
    const result = await executeAction(intent, payload, userId);
    return res.json(result);
  } catch (error) {
    console.error("AI executeAgentAction error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Action execution failed",
    });
  }
};

exports.undoAgentAction = async (req, res) => {
  try {
    const { model, id, deliveryId } = req.body;
    if (!model || !id) {
      return res.status(400).json({
        success: false,
        message: "model and id are required",
      });
    }
    const result = await undoAction(model, id, { deliveryId });
    return res.json(result);
  } catch (error) {
    console.error("AI undoAgentAction error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Undo failed",
    });
  }
};

exports.CAPABILITIES_TEXT = CAPABILITIES_TEXT;
