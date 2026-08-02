const { buildChatContext, CAPABILITIES_TEXT } = require("../utils/aiContextBuilder");
const { buildProfitReport } = require("../utils/profitReportService");
const { getCashBookForDate } = require("../utils/cashBookService");
const { currentBankBalance, buildAccountSummaries } = require("../utils/bankBalanceService");
const Customer = require("../models/Customer");
const Supplier = require("../models/Supplier");
const RawMaterial = require("../models/RawMaterial");
const Order = require("../models/Order");
const groq = require("../utils/groqClient");
const { startOfMonth, endOfMonth, subMonths } = require("date-fns");

function formatUtcDMY(d) {
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
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

/** Today's cash, stock, pending, order pipeline — for dashboard-style asks. */
exports.getDailySummary = async (req, res) => {
  try {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();
    const d = now.getUTCDate();
    const cashDate = new Date(y, m, d, 12, 0, 0, 0);

    const [
      cashBook,
      bankBalance,
      accounts,
      customerPending,
      supplierPending,
      stock,
      orderStatus,
    ] = await Promise.all([
      getCashBookForDate(cashDate),
      currentBankBalance(),
      buildAccountSummaries(),
      Customer.aggregate([{ $group: { _id: null, total: { $sum: "$totalAmountDue" } } }]),
      Supplier.aggregate([{ $group: { _id: null, total: { $sum: "$totalAmountDue" } } }]),
      RawMaterial.aggregate([
        { $group: { _id: "$coilCategory", totalStock: { $sum: "$currentStock" } } },
      ]),
      Order.aggregate([
        { $match: { isReturn: { $ne: true } } },
        { $group: { _id: "$orderStatus", count: { $sum: 1 } } },
      ]),
    ]);

    const stockMap = {};
    stock.forEach((row) => {
      stockMap[row._id || "Unknown"] = Math.round((row.totalStock || 0) * 100) / 100;
    });

    const statusMap = { Outer: 0, "In Process": 0, Done: 0 };
    orderStatus.forEach((row) => {
      if (row._id) statusMap[row._id] = row.count;
    });

    return res.json({
      success: true,
      data: {
        date: formatUtcDMY(new Date(Date.UTC(y, m, d))),
        cashInHand: cashBook.closingBalance,
        cashOpening: cashBook.openingBalance,
        cashIn: cashBook.totalIn,
        cashOut: cashBook.totalOut,
        bankBalance,
        bankAccounts: (accounts || []).map((a) => ({
          account: a.label || a.bankAccount,
          balance: a.balance,
        })),
        totalPendingFromCustomers: customerPending[0]?.total || 0,
        totalPendingToSuppliers: supplierPending[0]?.total || 0,
        shipletCoilStockKg: stockMap["Shiplet Coil"] || 0,
        patriCoilStockKg: stockMap["Patri Coil"] || 0,
        orderStatusCounts: statusMap,
        deepLinks: [
          { label: "Daily Book", path: "/daily-book" },
          { label: "Dashboard", path: "/dashboard" },
        ],
      },
    });
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

exports.CAPABILITIES_TEXT = CAPABILITIES_TEXT;
