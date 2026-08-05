const Customer = require("../models/Customer");
const Supplier = require("../models/Supplier");
const Worker = require("../models/Worker");
const groq = require("./groqClient");

const MONTH_ALIASES = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

function monthIndexFromToken(token) {
  const key = String(token || "").toLowerCase();
  if (MONTH_ALIASES[key] != null) return MONTH_ALIASES[key];
  const short = key.slice(0, 3);
  return MONTH_ALIASES[short] != null ? MONTH_ALIASES[short] : null;
}

/** Parse "22 feb", "22feb", "22nd february 2026" → UTC midnight ISO */
function parseDateFragment(fragment, defaultYear = new Date().getFullYear()) {
  const s = String(fragment || "").trim();
  if (!s) return null;

  let m = s.match(
    /^(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(\d{4}))?$/i
  );
  if (!m) {
    m = s.match(
      /^(\d{1,2})(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(\d{4}))?$/i
    );
  }
  if (!m) return null;

  const day = Number(m[1]);
  const month = monthIndexFromToken(m[2]);
  const year = m[3] ? Number(m[3]) : defaultYear;
  if (month == null || day < 1 || day > 31) return null;
  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0)).toISOString();
}

/**
 * Extract source + target dates from shift/move phrasing.
 * e.g. "on 22feb to 23 feb", "from 22 feb to 23 feb"
 */
function extractFromToDates(message) {
  const text = String(message || "");
  const defaultYear = new Date().getFullYear();

  const dateToken =
    "(\\d{1,2}(?:st|nd|rd|th)?\\s*(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)|\\d{1,2}(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?))(?:\\s+(\\d{4}))?";

  const rangeMatch = text.match(
    new RegExp(
      `(?:\\bon\\b|\\bfrom\\b|\\boccur(?:s|ring)?\\s+on\\b)\\s+${dateToken}\\s+to\\s+${dateToken}`,
      "i"
    )
  );
  if (rangeMatch) {
    const fromDate = parseDateFragment(
      rangeMatch[1] + (rangeMatch[2] ? ` ${rangeMatch[2]}` : ""),
      defaultYear
    );
    const toDate = parseDateFragment(
      rangeMatch[3] + (rangeMatch[4] ? ` ${rangeMatch[4]}` : ""),
      defaultYear
    );
    if (fromDate && toDate) return { fromDate, toDate };
  }

  // Fallback: first two distinct calendar dates in message order
  const pattern = new RegExp(dateToken, "gi");
  const seen = new Set();
  const ordered = [];
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const iso = parseDateFragment(
      match[1] + (match[2] ? ` ${match[2]}` : ""),
      defaultYear
    );
    if (iso && !seen.has(iso)) {
      seen.add(iso);
      ordered.push(iso);
    }
    if (ordered.length >= 2) break;
  }
  if (ordered.length >= 2) {
    return { fromDate: ordered[0], toDate: ordered[1] };
  }
  return { fromDate: null, toDate: null };
}

function cleanPartyName(name) {
  return String(name || "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract payee + amount from "payment to X of 100000" phrasing */
function extractPaymentToParty(message) {
  const raw = String(message || "");
  let name = null;
  let amount = null;

  const m1 = raw.match(
    /\b(?:record|add)?\s*(?:a\s+)?payment(?:\s*\([^)]*\))?\s+to\s+(?:supplier\s+)?(.+?)\s+of\s+(?:rs\.?\s*)?([\d,]+)/i
  );
  if (m1) {
    name = m1[1].trim();
    amount = Number(String(m1[2]).replace(/,/g, ""));
    return { name, amount };
  }

  const m2 = raw.match(/\b(?:payment|paid)\s+to\s+(?:supplier\s+)?(.+?)(?:\s+of\s+|\s+via\b|$)/i);
  if (m2) name = m2[1].trim();

  const amt =
    raw.match(/\bof\s+(?:rs\.?\s*)?([\d,]+)/i) ||
    raw.match(/(?:rs\.?\s*)?([\d,]+)(?:\s*(?:rs|rupees?))?/i);
  if (amt) amount = Number(String(amt[1]).replace(/,/g, ""));

  return { name, amount };
}

function resolveSupplierFromList(data, suppliers) {
  const candidates = [
    data.supplierName,
    data.relatedName,
    cleanPartyName(data.supplierName),
    cleanPartyName(data.relatedName),
  ].filter(Boolean);
  for (const cand of candidates) {
    const lower = cand.toLowerCase();
    const exact = suppliers.find((s) => s.name.toLowerCase() === lower);
    if (exact) return exact;
    const cleaned = cleanPartyName(cand).toLowerCase();
    const partial = suppliers.find((s) => {
      const sn = s.name.toLowerCase();
      return (
        cleaned.includes(sn) ||
        sn.includes(cleaned) ||
        (s.companyName && cleaned.includes(s.companyName.toLowerCase()))
      );
    });
    if (partial) return partial;
  }
  return null;
}

/**
 * Normalize common layman phrases the LLM often misses,
 * and strip bogus description/notes fields.
 */
function enrichParsedIntent(parsed, message) {
  const result = {
    intent: parsed.intent || "UNKNOWN",
    confidence: parsed.confidence || "low",
    extractedData: { ...(parsed.extractedData || {}) },
    missingFields: Array.isArray(parsed.missingFields)
      ? [...parsed.missingFields]
      : [],
    clarificationNeeded: parsed.clarificationNeeded || null,
  };

  const text = String(message || "").toLowerCase();
  const data = result.extractedData;

  // Shift/move date commands win over delete — compound phrasing like
  // "shift ... to ... and then delete the old date" is a move, not a delete.
  const shiftDates = extractFromToDates(message);
  const isShiftRequest =
    /\b(shift|move|reschedule|change\s+date|date\s+badal)\b/.test(text) &&
    Boolean(shiftDates.fromDate && shiftDates.toDate);

  if (isShiftRequest) {
    result.intent = "SHIFT_ENTRY_DATE";
    data.fromDate = shiftDates.fromDate;
    data.toDate = shiftDates.toDate;
    data.shiftAll = /\ball\b/.test(text);
    if (!data.entryType) {
      if (/\bexpense\b|\bkharcha\b|\bkharch\b/.test(text)) data.entryType = "expense";
      else data.entryType = "expense";
    }
    result.missingFields = [];
    result.clarificationNeeded = null;
    result.confidence = "high";
  }

  // Delete requests must win over every "create" intent — otherwise the LLM
  // turns "delete the payment of 10000" into a negative payment.
  const asksAQuestion = /^\s*(how|what|why|when|where|can i|should i|kya|kaise|kaisay)\b/.test(
    text
  );
  const isDeleteRequest =
    !isShiftRequest &&
    !asksAQuestion &&
    (/\b(delete|remove|cancel|erase)\b/.test(text) ||
      /\b(hata\s?do|hatao|mita\s?do|mitao|khatam\s?kar)\b/.test(text));

  if (isDeleteRequest) {
    result.intent = "DELETE_ENTRY";
    if (!data.entryType) {
      if (/\bpayment\b|\bwusool\b|\breceipt\b/.test(text)) data.entryType = "payment";
      else if (/\bexpense\b|\bkharcha\b|\bkharch\b/.test(text)) data.entryType = "expense";
      else if (/\border\b|\bsale\b|\bbecha\b/.test(text)) data.entryType = "order";
      else if (/\bpurchase\b|\bkharida\b|\bcoil\b|\braw material\b/.test(text))
        data.entryType = "purchase";
      else if (/\bworker\b|\bsalary\b|\bmazdoor\b/.test(text)) data.entryType = "worker payment";
      else if (/\btransaction\b|\bentry\b/.test(text)) data.entryType = "transaction";
      else data.entryType = "any";
    }
    // The model happily invents a party/amount/date for vague delete requests,
    // so keep only filters that really appear in the user's message.
    ["customerName", "supplierName", "workerName", "partyName", "relatedName"].forEach(
      (key) => {
        const v = String(data[key] || "").trim();
        const firstWord = v.split(/\s+/)[0].toLowerCase();
        if (!firstWord || !text.includes(firstWord)) delete data[key];
      }
    );
    delete data.date;
    const digitsOnlyText = text.replace(/[,\s]/g, "");
    if (data.amount != null) {
      const amt = Math.abs(Number(data.amount));
      data.amount =
        amt > 0 && digitsOnlyText.includes(String(amt)) ? amt : undefined;
    }
    if (!data.amount) {
      // Ignore the day number of a date like "5 aug" when looking for an amount
      const withoutDate = text
        .replace(
          /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/g,
          " "
        )
        .replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ");
      const amountMatch =
        withoutDate.match(/(?:rs\.?|rupees?)[.\s]*(\d[\d,]*(?:\.\d+)?)/i) ||
        withoutDate.match(/(\d[\d,]*(?:\.\d+)?)\s*(?:rs\.?|rupees?)/i) ||
        withoutDate.match(/\b(\d[\d,]*(?:\.\d+)?)\b/);
      if (amountMatch) {
        const n = Number(String(amountMatch[1]).replace(/,/g, ""));
        if (n > 0) data.amount = n;
      }
    }
    if (/\btoday'?s?\b|\baaj\b/.test(text)) {
      const now = new Date();
      data.date = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
      ).toISOString();
    } else if (/\byesterday'?s?\b|\bkal\b/.test(text)) {
      const now = new Date();
      data.date = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)
      ).toISOString();
    }
    if (data.entryType === "expense" && !data.expenseCategory) {
      if (/\bfayyaz\b|\bfayaz\b|\bfayiaz\b/.test(text)) data.expenseCategory = "Fayyaz Expense";
      else if (/\bfaisal\b/.test(text)) data.expenseCategory = "Faisal Expense";
      else if (/\bmutual\b/.test(text)) data.expenseCategory = "Mutual Expense";
    }
    result.missingFields = [];
    result.clarificationNeeded = null;
    result.confidence = "high";
  }

  // ATM withdrawal: bank Money Out + linked self expense (takes priority over plain expense)
  const mentionsAtm =
    !isDeleteRequest &&
    (/\batm\b/.test(text) ||
      /\batm\s*withdrawal\b/.test(text) ||
      (/\bwithdraw/.test(text) && /\bbank\b|\batm\b/.test(text)));

  if (mentionsAtm) {
    result.intent = "ATM_WITHDRAWAL";
    const mentionsFaisal = /\bfaisal\b/.test(text);
    const mentionsMutual = /\bmutual\b|\bdono\b/.test(text);
    if (mentionsFaisal) {
      data.selfExpensePerson = "Faisal";
      data.expenseCategory = "Faisal Expense";
    } else if (mentionsMutual) {
      data.selfExpensePerson = "Mutual";
      data.expenseCategory = "Mutual Expense";
    } else {
      data.selfExpensePerson = "Fayyaz";
      data.expenseCategory = "Fayyaz Expense";
    }
    data.expenseGroup = "Self Expense";

    if (!data.amount) {
      const amountMatch =
        text.match(/(?:rs\.?|rupees?)[.\s]*(\d+(?:\.\d+)?)/i) ||
        text.match(/(\d+(?:\.\d+)?)\s*(?:rs\.?|rupees?)/i) ||
        text.match(/\b(?:atm|withdrawal|withdraw)\s+(?:of\s+)?(\d+(?:\.\d+)?)\b/i) ||
        text.match(/\b(\d+(?:\.\d+)?)\b/);
      if (amountMatch) data.amount = Number(amountMatch[1]);
    }

    if (!data.bankAccount) {
      if (/\bubl\b/.test(text)) data.bankAccount = "UBL";
      else if (/\bfaisal\s*bank\b/.test(text)) data.bankAccount = "Faisal Bank";
      else data.bankAccount = "MBL";
    }

    result.missingFields = result.missingFields.filter(
      (f) =>
        !["expenseGroup", "expenseCategory", "selfExpensePerson", "bankAccount", "paymentMethod"].includes(f) &&
        !(f === "amount" && data.amount)
    );
    if (data.amount) {
      result.confidence = "high";
      result.clarificationNeeded = null;
    } else {
      result.confidence = "medium";
      result.missingFields.push("amount");
    }
  }

  // Self-expense shortcuts: "fayyaz", "faisal", "mera kharcha" etc.
  // Only force ADD_EXPENSE when already that intent / UNKNOWN, or expense keywords dominate
  // (avoid hijacking "Faisal payment" / order messages).
  // Skip if already classified as ATM withdrawal.
  const mentionsFaisal = /\bfaisal\b/.test(text);
  const mentionsFayyaz = /\bfayyaz\b|\bfayaz\b|\bfayiaz\b/.test(text);
  const mentionsMutual = /\bmutual\b|\bdono\b/.test(text);
  const mentionsSelf =
    /\bself\b|\bapna\b|\bmera\b|\bmeri\b|\bpersonal\b/.test(text) ||
    mentionsFaisal ||
    mentionsFayyaz ||
    mentionsMutual;
  const hasExpenseKeyword =
    /\bexpense\b|\bkharcha\b|\bkharch\b|\bspent\b|\bspend\b/.test(text);
  const looksLikePaymentOrOrder =
    /\bpayment\b|\bpaid\b|\bwusool\b|\border\b|\bbecha\b|\bsold\b|\bsale\b/.test(
      text
    );
  const canForceExpense =
    result.intent !== "ATM_WITHDRAWAL" &&
    result.intent !== "DELETE_ENTRY" &&
    result.intent !== "SHIFT_ENTRY_DATE" &&
    (result.intent === "ADD_EXPENSE" ||
      result.intent === "UNKNOWN" ||
      (hasExpenseKeyword && !looksLikePaymentOrOrder));

  if (
    canForceExpense &&
    (hasExpenseKeyword ||
      result.intent === "ADD_EXPENSE" ||
      (result.intent === "UNKNOWN" &&
        (mentionsFayyaz || mentionsFaisal || mentionsMutual || mentionsSelf))) &&
    (mentionsSelf || mentionsFayyaz || mentionsFaisal || mentionsMutual)
  ) {
    result.intent = "ADD_EXPENSE";
    data.expenseGroup = "Self Expense";
    if (mentionsFaisal) {
      data.selfExpensePerson = "Faisal";
      data.expenseCategory = "Faisal Expense";
    } else if (mentionsMutual) {
      data.selfExpensePerson = "Mutual";
      data.expenseCategory = "Mutual Expense";
    } else {
      data.selfExpensePerson = "Fayyaz";
      data.expenseCategory = "Fayyaz Expense";
    }

    if (!data.amount) {
      const amountMatch =
        text.match(/(?:rs\.?|rupees?)[.\s]*(\d+(?:\.\d+)?)/i) ||
        text.match(/(\d+(?:\.\d+)?)\s*(?:rs\.?|rupees?)/i) ||
        text.match(/\b(?:add|expense|kharcha|spent)\s+(\d+(?:\.\d+)?)\b/i) ||
        text.match(/\b(\d+(?:\.\d+)?)\b/);
      if (amountMatch) data.amount = Number(amountMatch[1]);
    }

    if (!data.paymentMethod) {
      if (/\bbank\b|\btransfer\b/.test(text)) data.paymentMethod = "Bank Transfer";
      else if (/\bcheque\b|\bcheck\b/.test(text)) data.paymentMethod = "Cheque";
      else data.paymentMethod = "Cash";
    }

    result.missingFields = result.missingFields.filter(
      (f) =>
        !["expenseGroup", "expenseCategory", "selfExpensePerson", "paymentMethod"].includes(f) &&
        !(f === "amount" && data.amount)
    );

    if (data.amount && result.confidence === "low") {
      result.confidence = "medium";
    }
    if (data.amount && data.expenseCategory) {
      result.confidence = "high";
      result.clarificationNeeded = null;
    }

    if (!data.expenseDate) {
      const months = {
        jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
        apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
        aug: 7, august: 7, sep: 8, sept: 8, september: 8,
        oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
      };
      const dm = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(\d{4}))?\b/i);
      if (dm) {
        const day = Number(dm[1]);
        const month = months[dm[2].toLowerCase()];
        const year = dm[3] ? Number(dm[3]) : new Date().getFullYear();
        if (month != null && day >= 1 && day <= 31) {
          data.expenseDate = new Date(Date.UTC(year, month, day, 0, 0, 0, 0)).toISOString();
        }
      }
    }
  }

  // Factory annealing expenses — category + bank payment method for Daily Book
  const mentionsAnnealing = /\bann?ealing\b|\bbhatti\b/.test(text);
  if (
    result.intent !== "ATM_WITHDRAWAL" &&
    result.intent !== "DELETE_ENTRY" &&
    result.intent !== "SHIFT_ENTRY_DATE" &&
    mentionsAnnealing &&
    !mentionsFayyaz &&
    !mentionsFaisal &&
    !mentionsMutual &&
    !mentionsSelf
  ) {
    result.intent = "ADD_EXPENSE";
    data.expenseCategory = data.expenseCategory || "Annealing";
    data.expenseGroup = "Manufacturing";
    if (!data.amount) {
      const amountMatch =
        text.match(/(?:rs\.?|rupees?)[.\s]*(\d[\d,]*(?:\.\d+)?)/i) ||
        text.match(/(\d[\d,]*(?:\.\d+)?)\s*(?:rs\.?|rupees?)/i) ||
        text.match(/\b(\d[\d,]*(?:\.\d+)?)\b/);
      if (amountMatch) {
        data.amount = Number(String(amountMatch[1]).replace(/,/g, ""));
      }
    }
  }

  if (
    result.intent === "ADD_EXPENSE" &&
    !/\batm\b/.test(text) &&
    (/\bbank\b|\btransfer\b/.test(text) || /\bvia\s+bank\b/.test(text))
  ) {
    data.paymentMethod = "Bank Transfer";
    if (!data.bankAccount) {
      if (/\bubl\b/.test(text)) data.bankAccount = "UBL";
      else if (/\bfaisal\s*bank\b/.test(text)) data.bankAccount = "Faisal Bank";
      else data.bankAccount = "MBL";
    }
  }

  // Payment direction: TO supplier/party = Money Out; FROM customer = Money In
  const isPaymentFromCustomer =
    /\b(?:received|wusool)\s+from\b/.test(text) ||
    (/\b(?:payment|paid)\b/.test(text) &&
      /\bfrom\b/.test(text) &&
      !/\bpayment\s+to\b/.test(text));

  const isPaymentToParty =
    !isPaymentFromCustomer &&
    (/\bpayment\s+to\b/.test(text) ||
      /\bpaid\s+to\b/.test(text) ||
      /\bmoney\s*out\b/.test(text) ||
      (/\bpayment\b/.test(text) && /\bsupplier\b/.test(text)));

  if (
    isPaymentToParty &&
    !isShiftRequest &&
    !isDeleteRequest &&
    result.intent !== "ATM_WITHDRAWAL"
  ) {
    result.intent = "ADD_DAILY_TRANSACTION";
    data.transactionType = "Money Out";
    data.relatedTo = "Supplier";

    const payTo = extractPaymentToParty(message);
    if (payTo.name) {
      data.relatedName = payTo.name;
      data.supplierName = cleanPartyName(payTo.name) || payTo.name;
    }
    if (payTo.amount && !data.amount) data.amount = payTo.amount;

    if (!data.paymentMethod) {
      if (/\bbank\b|\btransfer\b/.test(text)) data.paymentMethod = "Bank Transfer";
      else if (/\bcheque\b|\bcheck\b/.test(text)) data.paymentMethod = "Cheque";
      else data.paymentMethod = "Cash";
    }

    result.missingFields = (result.missingFields || []).filter(
      (f) =>
        ![
          "receivedBy",
          "orderId",
          "handledBy",
          "customerId",
          "customerName",
          "description",
          "notes",
        ].includes(f)
    );
    delete data.customerId;
    delete data.customerName;
    delete data.orderId;
    delete data.receivedBy;
    if (data.amount && (data.relatedName || data.supplierName)) {
      result.confidence = "high";
      result.clarificationNeeded = null;
    }
  }

  // Generic date extraction for other intents (orderDate / purchaseDate / transactionDate)
  const months = MONTH_ALIASES;
  const dmGeneric = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(\d{4}))?\b/i);
  let parsedDateIso = null;
  if (dmGeneric) {
    const day = Number(dmGeneric[1]);
    const month = months[dmGeneric[2].toLowerCase()];
    const year = dmGeneric[3] ? Number(dmGeneric[3]) : new Date().getFullYear();
    if (month != null && day >= 1 && day <= 31) {
      parsedDateIso = new Date(Date.UTC(year, month, day, 0, 0, 0, 0)).toISOString();
    }
  }
  // Prefer calendar date parsed from the user message over LLM guesses
  if (parsedDateIso) {
    if (result.intent === "CREATE_ORDER") data.orderDate = parsedDateIso;
    if (result.intent === "CREATE_RAW_MATERIAL_PURCHASE") data.purchaseDate = parsedDateIso;
    if (result.intent === "ADD_DAILY_TRANSACTION") data.transactionDate = parsedDateIso;
    if (result.intent === "ADD_WORKER_PAYMENT") data.date = parsedDateIso;
    if (result.intent === "RECORD_CUSTOMER_PAYMENT") data.transactionDate = parsedDateIso;
    if (result.intent === "ADD_EXPENSE") data.expenseDate = parsedDateIso;
    if (result.intent === "ATM_WITHDRAWAL") data.transactionDate = parsedDateIso;
    if (result.intent === "SEND_ANNEALING") data.sentDate = parsedDateIso;
    if (result.intent === "ARRIVE_ANNEALING") data.arrivedDate = parsedDateIso;
    if (result.intent === "DELETE_ENTRY") data.date = parsedDateIso;
  }

  // Description / notes: only keep if user explicitly asked for a note
  const explicitNote =
    /\b(?:note|notes|description|detail|details|baabat|remark|remarks)\s*[:=-]?\s*.+/i.test(
      message || ""
    ) ||
    /\b(?:with note|with description|note that|description is)\b/i.test(message || "");

  if (!explicitNote) {
    delete data.description;
    // Keep short free-form notes only if they don't look like the full command
    if (data.notes) {
      const notes = String(data.notes).trim();
      const msg = String(message || "").trim();
      if (
        !notes ||
        notes.toLowerCase() === msg.toLowerCase() ||
        /^(add|record|create|expense|payment|order|purchase)\b/i.test(notes)
      ) {
        delete data.notes;
      }
    }
  }

  result.extractedData = data;

  // Clean LLM id fields like "Name (id:hex)" → hex only
  ["customerId", "supplierId", "workerId", "partyId", "relatedId", "orderId"].forEach(
    (key) => {
      if (!data[key]) return;
      const s = String(data[key]);
      const m = s.match(/\b([a-fA-F0-9]{24})\b/);
      if (m) data[key] = m[1];
    }
  );
  ["customerName", "supplierName", "workerName", "relatedName"].forEach((key) => {
    if (!data[key]) return;
    data[key] = String(data[key])
      .replace(/\s*\(id:[a-fA-F0-9]{24}\)\s*$/i, "")
      .trim();
  });

  // Optional fields the LLM often wrongly marks as required
  const optionalByIntent = {
    RECORD_CUSTOMER_PAYMENT: ["receivedBy", "orderId", "notes", "description"],
    ADD_DAILY_TRANSACTION: ["handledBy", "description", "notes", "relatedId", "supplierId"],
  };
  const optional = optionalByIntent[result.intent] || [];
  if (optional.length) {
    result.missingFields = (result.missingFields || []).filter(
      (f) => !optional.includes(f)
    );
  }

  return result;
}

/**
 * Classify a user message into a WMS action intent and extract fields.
 * @param {string} message
 * @param {Array<{role: string, content: string}>} conversationHistory
 */
async function parseUserIntent(message, conversationHistory = []) {
  try {
    const [customers, suppliers, workers] = await Promise.all([
      Customer.find({}, "name _id customerType").lean(),
      Supplier.find({}, "name _id companyName").lean(),
      Worker.find({}, "name _id").lean(),
    ]);

    const customerList = customers
      .map((c) => `${c.name} (id:${c._id})`)
      .join(", ") || "none";
    const supplierList = suppliers
      .map((s) => `${s.name}${s.companyName ? ` / ${s.companyName}` : ""} (id:${s._id})`)
      .join(", ") || "none";
    const workerList = workers
      .map((w) => `${w.name} (id:${w._id})`)
      .join(", ") || "none";

    const systemPrompt = `You are an intent classifier and data extractor for a wire
manufacturing factory management system in Pakistan.
The user may type in English, Urdu, or Roman Urdu. Be generous with layman phrasing.

Available customers: ${customerList}
Available suppliers: ${supplierList}
Available workers:   ${workerList}

Wire numbers: 1-19 = Number Wire (Shiplet Coil)
              20   = Binding Wire (Patri Coil)

Common Urdu: diya/becha=sold, liya/kharida=bought,
aya=received/arrived, gaya/bheja=sent,
salary/payment=payment, kharcha=expense,
naya=new, baqi=remaining/due, taar=wire,
coil=coil, bhatti=annealing furnace,
hafte=week, aaj=today, kal=yesterday,
cash=cash, bank=bank, cheque=cheque

SELF EXPENSE SHORTCUTS (important):
- "Fayyaz", "Fayyaz expense", "Fayyaz ka kharcha", "add 250 fayyaz" → ADD_EXPENSE,
  expenseGroup="Self Expense", selfExpensePerson="Fayyaz", expenseCategory="Fayyaz Expense"
- "Faisal", "Faisal expense", "Faisal ka kharcha" → ADD_EXPENSE,
  expenseGroup="Self Expense", selfExpensePerson="Faisal", expenseCategory="Faisal Expense"
- "Mutual", "dono", "self mutual" → Mutual Expense
- User does NOT need to say the word "Self". Just "Fayyaz" or "Faisal" is enough.
- Default paymentMethod to "Cash" if not mentioned.

ATM WITHDRAWAL (important — different from cash expense):
- "ATM", "ATM withdrawal", "withdraw from bank/ATM", "atm se 1000 nikaale" → ATM_WITHDRAWAL
- This deducts from BANK balance (not cash in hand) and creates a Self Expense.
- Fields: amount, selfExpensePerson/expenseCategory (Fayyaz/Faisal/Mutual),
  bankAccount (MBL/UBL/Faisal Bank/Other, default MBL), description (only if explicit note)
- Example: "ATM withdrawal of 1000 for Fayyaz" → ATM_WITHDRAWAL amount=1000, Fayyaz Expense, bankAccount=MBL

Classify the user message into EXACTLY ONE of these intents:
1.  CREATE_ORDER
2.  RECORD_CUSTOMER_PAYMENT
3.  CREATE_RAW_MATERIAL_PURCHASE
4.  ADD_EXPENSE
5.  ADD_DAILY_TRANSACTION
6.  SEND_ANNEALING
7.  ARRIVE_ANNEALING
8.  ADD_PROCESSING_DELIVERY
9.  ADD_CUSTOMER
10. ADD_SUPPLIER
11. ADD_READY_STOCK
12. ADD_WORKER_PAYMENT
13. ATM_WITHDRAWAL
14. DELETE_ENTRY (user wants to delete/remove an existing record)
15. SHIFT_ENTRY_DATE (user wants to move/change dates of existing records)
16. READ_QUERY  (user is asking a question, not taking action)
17. UNKNOWN     (cannot determine intent)

SHIFT RULE (critical):
- "shift", "move", "reschedule", "change date" with TWO dates → SHIFT_ENTRY_DATE
- Example: "shift all expenses on 22 Feb to 23 Feb" → fromDate=22 Feb, toDate=23 Feb, entryType=expense
- If message also says "delete" the old date, still use SHIFT_ENTRY_DATE (move only)

DELETE RULE (critical):
- "delete", "remove", "cancel", "hata do", "mita do" → DELETE_ENTRY, never a create intent.
- NEVER return a negative amount. Amounts are always positive.

You MUST respond with ONLY valid JSON. No markdown. No explanation.
JSON structure:
{
  "intent": "one of the 17 intents above",
  "confidence": "high" | "medium" | "low",
  "extractedData": {
    // Fields depend on intent — see below
  },
  "missingFields": ["list of required fields not found in text"],
  "clarificationNeeded": "question to ask user if low confidence or null"
}

EXTRACTED DATA FIELDS BY INTENT:

CREATE_ORDER:
  customerId, customerName, wireNumber (1-20),
  initialWeightKg, ratePerKg, soldBy, notes

RECORD_CUSTOMER_PAYMENT:
  customerId, customerName, amount,
  paymentMethod (Cash/Bank Transfer/Cheque),
  receivedBy (optional), orderId (optional — rarely used), notes

PAYMENT DIRECTION (critical):
- "payment FROM customer" / "received from X" → RECORD_CUSTOMER_PAYMENT (Money In)
- "payment TO supplier" / "paid to X" / "money out to X" → ADD_DAILY_TRANSACTION,
  transactionType="Money Out", relatedTo="Supplier", relatedName=party name
- receivedBy and orderId are OPTIONAL — never put them in missingFields

CREATE_RAW_MATERIAL_PURCHASE:
  supplierId, supplierName,
  coilCategory (Shiplet Coil / Patri Coil),
  weightInKg, ratePerKg, amountPaid,
  paymentMethod, paidBy, bundles, notes

ADD_EXPENSE:
  expenseGroup (Labour/Rental/Operations/Manufacturing/Self Expense),
  expenseCategory, amount, paymentMethod,
  description, labourName (if labour), addedBy,
  selfExpensePerson (Fayyaz/Faisal/Mutual if Self Expense),
  expenseDate (if a date is mentioned)

ATM_WITHDRAWAL:
  amount, selfExpensePerson (Fayyaz/Faisal/Mutual),
  expenseCategory (Fayyaz Expense / Faisal Expense / Mutual Expense),
  bankAccount (MBL / UBL / Faisal Bank / Other — default MBL),
  bankAccountOtherName (only if Other), description (only if explicit note),
  transactionDate (if a date is mentioned)

ADD_DAILY_TRANSACTION:
  transactionType (Money In / Money Out),
  amount, paymentMethod,
  relatedTo (Customer/Supplier/Other),
  relatedName, description, handledBy

SEND_ANNEALING:
  coilType (Shiplet Coil / Patri Coil),
  weightKg, bundles, sentDate, notes

ARRIVE_ANNEALING:
  coilType, weightKg, bundles,
  arrivedDate, weightLossKg, notes

ADD_PROCESSING_DELIVERY:
  customerId, customerName,
  weightKg, labourAmount,
  deliveryDate, notes

ADD_CUSTOMER:
  name, contactNumber, address,
  customerType (Ledger/Daily/Processing),
  openingBalance, openingBalanceType (debit/credit/none)

ADD_SUPPLIER:
  name, contactNumber, companyName,
  address, openingBalance

ADD_READY_STOCK:
  wireType (Number Wire / Binding Wire),
  wireNumber, producedWeightKg,
  manufacturingCostPerKg, producedBy, notes

ADD_WORKER_PAYMENT:
  workerId, workerName, entryType (Payment/Advance/Adjustment),
  amount, paymentMethod,
  weekStartDate, weekEndDate, notes

DELETE_ENTRY:
  entryType (payment / expense / order / purchase / worker payment / transaction / any),
  customerName, supplierName, workerName (whichever party is mentioned),
  amount (positive, only if mentioned), date (if a date is mentioned)

SHIFT_ENTRY_DATE:
  entryType (expense — default), fromDate, toDate, shiftAll (true if "all" mentioned)

For READ_QUERY and UNKNOWN: extractedData = {}

DESCRIPTION / NOTES RULE (critical):
- Do NOT put the user's full command into description or notes.
- Leave description and notes empty/null unless the user EXPLICITLY gives a note,
  e.g. "note: petrol", "description is tea", "baabat: office".
- Amount, person name, category, and date are NOT a description.

Match customerId / supplierId / workerId from the available lists when a name is mentioned.
If a required field is missing, list it in missingFields and set confidence to medium or low.
For self expenses, expenseGroup/expenseCategory/selfExpensePerson are NOT missing if Fayyaz or Faisal is mentioned.`;

    const history = Array.isArray(conversationHistory)
      ? conversationHistory.slice(-4)
      : [];

    const response = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: message },
      ],
      max_tokens: 400,
      temperature: 0.1,
    });

    let raw = response.choices[0].message.content.trim();
    raw = raw.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(raw);
    const enriched = enrichParsedIntent(parsed, message);

    if (
      enriched.intent === "ADD_DAILY_TRANSACTION" &&
      enriched.extractedData?.relatedTo === "Supplier"
    ) {
      const supplier = resolveSupplierFromList(enriched.extractedData, suppliers);
      if (supplier) {
        enriched.extractedData.supplierId = String(supplier._id);
        enriched.extractedData.relatedName = supplier.name;
        enriched.extractedData.supplierName = supplier.name;
      }
    }

    return enriched;
  } catch (error) {
    console.error("parseUserIntent error:", error.message);
    // Last-chance heuristic for simple self expenses even if JSON fails
    const fallback = enrichParsedIntent(
      {
        intent: "UNKNOWN",
        confidence: "low",
        extractedData: {},
        missingFields: [],
        clarificationNeeded:
          "Sorry, I did not understand. Please try again with more details.",
      },
      message
    );
    if (fallback.intent !== "UNKNOWN") return fallback;
    return fallback;
  }
}

module.exports = { parseUserIntent };
