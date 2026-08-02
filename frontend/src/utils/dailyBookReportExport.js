import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { formatCurrency, formatDate } from './formatters';

function safeName(s) {
  return String(s || 'report').replace(/[^\w\-]+/g, '_').slice(0, 40);
}

function kg(v) {
  return Number(v || 0).toFixed(2);
}

function moneyRows(list) {
  return (list || []).map((r) => [
    r.description || r.relatedName || '',
    r.paymentMethod || '',
    r.relatedName || '',
    formatCurrency(r.amount || 0),
  ]);
}

/** Build a clean worksheet with consistent columns, section headers, and widths. */
function buildCleanSheet(sections) {
  const COLS = 7;
  const aoa = [];
  const merges = [];
  const boldRows = new Set();

  const pushBlank = () => aoa.push(Array(COLS).fill(''));

  const pushTitle = (text) => {
    const r = aoa.length;
    aoa.push([text, ...Array(COLS - 1).fill('')]);
    merges.push({ s: { r, c: 0 }, e: { r, c: COLS - 1 } });
    boldRows.add(r);
  };

  const pushKV = (pairs) => {
    // pairs: [[label, value], ...] laid out 2 per row
    for (let i = 0; i < pairs.length; i += 2) {
      const row = Array(COLS).fill('');
      row[0] = pairs[i][0];
      row[1] = pairs[i][1];
      if (pairs[i + 1]) {
        row[3] = pairs[i + 1][0];
        row[4] = pairs[i + 1][1];
      }
      aoa.push(row);
    }
  };

  const pushSection = (title, headers, rows, totalRow) => {
    pushBlank();
    const titleR = aoa.length;
    aoa.push([title, ...Array(COLS - 1).fill('')]);
    merges.push({ s: { r: titleR, c: 0 }, e: { r: titleR, c: COLS - 1 } });
    boldRows.add(titleR);

    const head = [...headers];
    while (head.length < COLS) head.push('');
    const headR = aoa.length;
    aoa.push(head);
    boldRows.add(headR);

    if (!rows.length) {
      aoa.push(['(none)', ...Array(COLS - 1).fill('')]);
    } else {
      rows.forEach((r) => {
        const row = [...r];
        while (row.length < COLS) row.push('');
        aoa.push(row.slice(0, COLS));
      });
    }
    if (totalRow) {
      const tr = [...totalRow];
      while (tr.length < COLS) tr.push('');
      const r = aoa.length;
      aoa.push(tr.slice(0, COLS));
      boldRows.add(r);
    }
  };

  sections.forEach((sec) => {
    if (sec.type === 'title') pushTitle(sec.text);
    else if (sec.type === 'kv') pushKV(sec.pairs);
    else if (sec.type === 'blank') pushBlank();
    else if (sec.type === 'table') pushSection(sec.title, sec.headers, sec.rows, sec.total);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges'] = merges;
  ws['!cols'] = [
    { wch: 28 },
    { wch: 16 },
    { wch: 18 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
  ];

  // Light bold for section titles / headers via cell note isn't available in free xlsx —
  // structure + merges + widths keep it presentable.
  Object.keys(ws).forEach((addr) => {
    if (addr[0] === '!') return;
    const cell = ws[addr];
    if (!cell) return;
    const match = addr.match(/([A-Z]+)(\d+)/);
    if (!match) return;
    const rowIdx = Number(match[2]) - 1;
    if (boldRows.has(rowIdx)) {
      cell.s = { font: { bold: true } };
    }
  });

  return ws;
}

function daySections(day) {
  const sm = day.stockMovements || {};
  const an = day.annealing || {};
  const pr = day.processing || {};

  return [
    { type: 'title', text: `Daily Book Report — ${formatDate(day.date)}` },
    { type: 'blank' },
    {
      type: 'kv',
      pairs: [
        ['Opening Balance', formatCurrency(day.cash?.openingBalance || 0)],
        ['Closing Balance', formatCurrency(day.cash?.closingBalance || 0)],
        ['Money In', formatCurrency(day.cash?.totalIn || 0)],
        ['Money Out', formatCurrency(day.cash?.totalOut || 0)],
        ['Bank Opening', formatCurrency(day.bankSummary?.openingBalance || 0)],
        ['Bank Closing', formatCurrency(day.bankSummary?.closingBalance || 0)],
      ],
    },
    {
      type: 'table',
      title: 'MONEY IN',
      headers: ['Description', 'Method', 'Party', 'Amount', '', '', ''],
      rows: moneyRows(day.moneyIn),
      total: ['TOTAL MONEY IN', '', '', formatCurrency(day.cash?.totalIn || 0), '', '', ''],
    },
    {
      type: 'table',
      title: 'MONEY OUT',
      headers: ['Description', 'Method', 'Party', 'Amount', '', '', ''],
      rows: moneyRows(day.moneyOut),
      total: ['TOTAL MONEY OUT', '', '', formatCurrency(day.cash?.totalOut || 0), '', '', ''],
    },
    {
      type: 'table',
      title: `FACTORY EXPENSE BREAKDOWN (${formatCurrency(day.cash?.expenseTotals?.factoryTotal || 0)})`,
      headers: ['Expense Group', 'Category', 'Amount', '', '', '', ''],
      rows: (day.cash?.factoryExpenseBreakdown || []).map((row) => [
        row.group,
        row.category,
        formatCurrency(row.amount || 0),
        '',
        '',
        '',
        '',
      ]),
      total: [
        'TOTAL FACTORY EXPENSE',
        '',
        formatCurrency(day.cash?.expenseTotals?.factoryTotal || 0),
        '',
        '',
        '',
        '',
      ],
    },
    {
      type: 'table',
      title: 'BANK TRANSFERS (incl. ATM)',
      headers: ['Type', 'Account', 'Party', 'Description', 'Amount', 'Balance', ''],
      rows: (day.bankTransfers || []).map((t) => [
        t.isAtm ? 'ATM Out' : t.transactionType,
        t.bankAccount || '',
        t.relatedName || '',
        t.description || '',
        formatCurrency(t.amount || 0),
        formatCurrency(t.balance || 0),
        '',
      ]),
    },
    {
      type: 'table',
      title: 'STOCK OUT — SALES (to customers)',
      headers: ['Customer', 'Material', 'Bundles', 'Weight (kg)', 'Annealed', '', ''],
      rows: (day.sales || []).map((s) => [
        s.customerName,
        s.wireNumber != null ? `Wire #${s.wireNumber}` : (s.coilCategory || 'Wire'),
        s.bundles || 0,
        kg(s.weightKg),
        s.isAnnealed ? 'Yes' : '',
        '',
        '',
      ]),
      total: ['TOTAL SALES OUT', '', day.totalSalesBundles || 0, kg(day.totalSalesKg), '', '', ''],
    },
    {
      type: 'table',
      title: 'STOCK IN — PURCHASES (from suppliers)',
      headers: ['Supplier', 'Type', 'Category', 'Bundles', 'Weight (kg)', '', ''],
      rows: (day.purchases || []).map((p) => [
        p.supplierName,
        p.materialType,
        p.coilCategory || '',
        p.bundles || 0,
        kg(p.weightKg),
        '',
        '',
      ]),
      total: ['TOTAL PURCHASES IN', '', '', day.totalPurchasesBundles || 0, kg(day.totalPurchasesKg), '', ''],
    },
    {
      type: 'table',
      title: `ANNEALING — SENT OUT (${an.totals?.sentBundles || 0} bundles / ${kg(an.totals?.sentKg)} kg)`,
      headers: ['Party', 'Type', 'Category / Wire', 'Bundles', 'Weight (kg)', '', ''],
      rows: (an.sent || []).map((a) => [
        a.partyName,
        a.materialType,
        a.materialType === 'Wire' ? (a.wireNumber != null ? `#${a.wireNumber}` : 'Wire') : (a.coilCategory || ''),
        a.bundles || 0,
        kg(a.weightKg),
        '',
        '',
      ]),
      total: ['TOTAL SENT FOR ANNEALING', '', '', an.totals?.sentBundles || 0, kg(an.totals?.sentKg), '', ''],
    },
    {
      type: 'table',
      title: `ANNEALING — ARRIVED BACK (${an.totals?.arrivedBundles || 0} bundles / ${kg(an.totals?.arrivedKg)} kg)`,
      headers: ['Party', 'Type', 'Category / Wire', 'Bundles', 'Final Weight (kg)', '', ''],
      rows: (an.arrived || []).map((a) => [
        a.partyName,
        a.materialType,
        a.materialType === 'Wire' ? (a.wireNumber != null ? `#${a.wireNumber}` : 'Wire') : (a.coilCategory || ''),
        a.bundles || 0,
        kg(a.finalWeightKg || a.weightKg),
        '',
        '',
      ]),
      total: ['TOTAL ARRIVED FROM ANNEALING', '', '', an.totals?.arrivedBundles || 0, kg(an.totals?.arrivedKg), '', ''],
    },
    {
      type: 'table',
      title: `ANNEALING — WIRE SOLD (${an.totals?.soldBundles || 0} bundles / ${kg(an.totals?.soldKg)} kg)`,
      headers: ['Customer / Note', 'Wire', 'Bundles', 'Weight (kg)', '', '', ''],
      rows: (an.sold || []).map((a) => [
        a.customerName || a.notes || 'Sale',
        a.wireNumber != null ? `#${a.wireNumber}` : '',
        a.bundles || 0,
        kg(a.weightKg),
        '',
        '',
        '',
      ]),
      total: ['TOTAL ANNEALED WIRE SOLD', '', an.totals?.soldBundles || 0, kg(an.totals?.soldKg), '', '', ''],
    },
    {
      type: 'table',
      title: `PROCESSING — COIL ARRIVAL (${kg(pr.totals?.coilInKg)} kg)`,
      headers: ['Customer', 'Coil Category', 'Weight (kg)', '', '', '', ''],
      rows: (pr.arrivals || []).map((a) => [
        a.customerName,
        a.coilCategory || '',
        kg(a.weightKg),
        '',
        '',
        '',
        '',
      ]),
      total: ['TOTAL PROCESSING COIL IN', '', kg(pr.totals?.coilInKg), '', '', '', ''],
    },
    {
      type: 'table',
      title: `PROCESSING — WIRE DELIVERY (${pr.totals?.wireOutBundles || 0} bundles / ${kg(pr.totals?.wireOutKg)} kg / ${formatCurrency(pr.totals?.labourEarned || 0)} labour)`,
      headers: ['Customer', 'Wire', 'Coil Category', 'Bundles', 'Weight (kg)', 'Labour Rate', 'Labour Amount'],
      rows: (pr.deliveries || []).map((d) => [
        d.customerName,
        d.wireNumber != null ? `#${d.wireNumber}` : '',
        d.coilCategory || '',
        d.bundles || 0,
        kg(d.weightKg),
        formatCurrency(d.labourRatePerKg || 0),
        formatCurrency(d.labourAmount || 0),
      ]),
      total: ['TOTAL PROCESSING WIRE OUT', '', '', pr.totals?.wireOutBundles || 0, kg(pr.totals?.wireOutKg), '', formatCurrency(pr.totals?.labourEarned || 0)],
    },
    {
      type: 'table',
      title: 'CUSTOMER WIRE RETURNS — STOCK IN',
      headers: ['Customer', 'Wire', 'Category', 'Bundles', 'Weight (kg)', '', ''],
      rows: (day.returns || []).map((r) => [
        r.customerName,
        r.wireNumber != null ? `#${r.wireNumber}` : '',
        r.coilCategory || '',
        r.bundles || 0,
        kg(r.weightKg),
        '',
        '',
      ]),
    },
    {
      type: 'table',
      title: 'SUPPLIER COIL RETURNS — STOCK OUT',
      headers: ['Supplier', 'Category', 'Bundles', 'Weight (kg)', '', '', ''],
      rows: (day.coilReturns || []).map((r) => [
        r.supplierName,
        r.coilCategory || r.materialType || 'Coil',
        r.bundles || 0,
        kg(r.weightKg),
        '',
        '',
        '',
      ]),
    },
    {
      type: 'table',
      title: 'STOCK MAINTENANCE — FULL MOVEMENT LEDGER',
      headers: ['Direction', 'Reason', 'Party', 'Material', 'Bundles', 'Weight (kg)', ''],
      rows: (sm.ledger || []).map((r) => [
        r.direction,
        r.reason,
        r.party,
        r.material,
        r.bundles || 0,
        kg(r.weightKg),
        '',
      ]),
    },
    {
      type: 'table',
      title: 'STOCK SUMMARY BY MATERIAL',
      headers: ['Material', 'In (kg)', 'Out (kg)', 'In Bundles', 'Out Bundles', '', ''],
      rows: (sm.byCategory || []).map((c) => [
        c.category,
        kg(c.inKg),
        kg(c.outKg),
        c.inBundles || 0,
        c.outBundles || 0,
        '',
        '',
      ]),
      total: [
        'TOTALS',
        kg((sm.wireInKg || 0) + (sm.coilInKg || 0)),
        kg((sm.wireOutKg || 0) + (sm.coilOutKg || 0)),
        '',
        '',
        '',
        '',
      ],
    },
    {
      type: 'kv',
      pairs: [
        ['Wire In (kg)', kg(sm.wireInKg)],
        ['Wire Out (kg)', kg(sm.wireOutKg)],
        ['Coil In (kg)', kg(sm.coilInKg)],
        ['Coil Out (kg)', kg(sm.coilOutKg)],
      ],
    },
  ];
}

export function exportDailyBookReportExcel(report) {
  if (!report?.days?.length) return;
  const wb = XLSX.utils.book_new();

  if (report.mode === 'range') {
    const summarySecs = [
      { type: 'title', text: 'Daily Book Range Summary' },
      { type: 'blank' },
      {
        type: 'kv',
        pairs: [
          ['From', report.startDate],
          ['To', report.endDate],
          ['Opening Balance', formatCurrency(report.rangeSummary?.openingBalance || 0)],
          ['Closing Balance', formatCurrency(report.rangeSummary?.closingBalance || 0)],
          ['Total Money In', formatCurrency(report.rangeSummary?.totalMoneyIn || 0)],
          ['Total Money Out', formatCurrency(report.rangeSummary?.totalMoneyOut || 0)],
          ['Sales Out (kg)', kg(report.rangeSummary?.totalSalesKg)],
          ['Purchases In (kg)', kg(report.rangeSummary?.totalPurchasesKg)],
          ['Annealing Sent (kg)', kg(report.rangeSummary?.annealSentKg)],
          ['Annealing Arrived (kg)', kg(report.rangeSummary?.annealArrivedKg)],
          ['Processing Coil In (kg)', kg(report.rangeSummary?.processingCoilInKg)],
          ['Processing Wire Out (kg)', kg(report.rangeSummary?.processingWireOutKg)],
          ['Factory Expenses', formatCurrency(report.rangeSummary?.factoryExpenseTotal || 0)],
        ],
      },
      {
        type: 'table',
        title: 'FACTORY EXPENSE BREAKDOWN FOR RANGE',
        headers: ['Expense Group', 'Category', 'Amount', '', '', '', ''],
        rows: (report.rangeSummary?.factoryExpenseBreakdown || []).map((row) => [
          row.group,
          row.category,
          formatCurrency(row.amount || 0),
          '',
          '',
          '',
          '',
        ]),
        total: [
          'TOTAL FACTORY EXPENSE',
          '',
          formatCurrency(report.rangeSummary?.factoryExpenseTotal || 0),
          '',
          '',
          '',
          '',
        ],
      },
      {
        type: 'table',
        title: 'CASH BY DAY',
        headers: ['Date', 'Open', 'In', 'Out', 'Close', '', ''],
        rows: report.days.map((d) => [
          formatDate(d.date),
          formatCurrency(d.cash?.openingBalance || 0),
          formatCurrency(d.cash?.totalIn || 0),
          formatCurrency(d.cash?.totalOut || 0),
          formatCurrency(d.cash?.closingBalance || 0),
          '',
          '',
        ]),
      },
    ];
    XLSX.utils.book_append_sheet(wb, buildCleanSheet(summarySecs), 'Summary');
  }

  report.days.forEach((day) => {
    const sheetName = safeName(formatDate(day.date) || 'day').slice(0, 28) || 'Day';
    XLSX.utils.book_append_sheet(wb, buildCleanSheet(daySections(day)), sheetName);
  });

  const name =
    report.mode === 'range'
      ? `daily-book-${safeName(report.startDate)}-to-${safeName(report.endDate)}.xlsx`
      : `daily-book-${safeName(report.startDate)}.xlsx`;
  XLSX.writeFile(wb, name);
}

function addTable(doc, title, head, body, startY) {
  if (startY > 250) {
    doc.addPage();
    startY = 16;
  }
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.text(title, 14, startY);
  doc.setFont(undefined, 'normal');
  doc.autoTable({
    head: [head],
    body: body.length ? body : [['—']],
    startY: startY + 3,
    styles: { fontSize: 7, cellPadding: 1.2 },
    headStyles: { fillColor: [55, 55, 55], fontSize: 7, fontStyle: 'bold' },
    margin: { left: 14, right: 14 },
  });
  return doc.lastAutoTable.finalY + 7;
}

function addDayToPdf(doc, day, isFirst) {
  if (!isFirst) doc.addPage();
  const sm = day.stockMovements || {};
  const an = day.annealing || {};
  const pr = day.processing || {};
  let y = 16;
  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.text(`Daily Book — ${formatDate(day.date)}`, 14, y);
  doc.setFont(undefined, 'normal');
  y += 7;
  doc.setFontSize(8);
  doc.text(
    `Open ${formatCurrency(day.cash?.openingBalance || 0)}  |  In ${formatCurrency(day.cash?.totalIn || 0)}  |  Out ${formatCurrency(day.cash?.totalOut || 0)}  |  Close ${formatCurrency(day.cash?.closingBalance || 0)}`,
    14,
    y
  );
  y += 5;
  doc.text(
    `Annealing: sent ${kg(an.totals?.sentKg)} kg (${an.totals?.sentBundles || 0} b)  →  arrived ${kg(an.totals?.arrivedKg)} kg (${an.totals?.arrivedBundles || 0} b)   |   Processing: coil in ${kg(pr.totals?.coilInKg)} / wire out ${kg(pr.totals?.wireOutKg)}`,
    14,
    y
  );
  y += 8;

  y = addTable(doc, 'Money In', ['Description', 'Method', 'Party', 'Amount'], moneyRows(day.moneyIn), y);
  y = addTable(doc, 'Money Out', ['Description', 'Method', 'Party', 'Amount'], moneyRows(day.moneyOut), y);
  y = addTable(
    doc,
    `Factory Expense Breakdown — ${formatCurrency(day.cash?.expenseTotals?.factoryTotal || 0)}`,
    ['Expense Group', 'Category', 'Amount'],
    (day.cash?.factoryExpenseBreakdown || []).map((row) => [
      row.group,
      row.category,
      formatCurrency(row.amount || 0),
    ]),
    y
  );
  y = addTable(
    doc,
    'Bank Transfers',
    ['Type', 'Account', 'Party', 'Amount', 'Balance'],
    (day.bankTransfers || []).map((t) => [
      t.isAtm ? 'ATM' : t.transactionType,
      t.bankAccount || '',
      t.relatedName || '',
      formatCurrency(t.amount || 0),
      formatCurrency(t.balance || 0),
    ]),
    y
  );
  y = addTable(
    doc,
    'Stock Out — Sales',
    ['Customer', 'Material', 'Bundles', 'Kg'],
    (day.sales || []).map((s) => [
      s.customerName,
      s.wireNumber != null ? `Wire #${s.wireNumber}` : 'Wire',
      String(s.bundles || 0),
      kg(s.weightKg),
    ]),
    y
  );
  y = addTable(
    doc,
    'Stock In — Purchases',
    ['Supplier', 'Type', 'Category', 'Bundles', 'Kg'],
    (day.purchases || []).map((p) => [
      p.supplierName,
      p.materialType,
      p.coilCategory || '',
      String(p.bundles || 0),
      kg(p.weightKg),
    ]),
    y
  );
  y = addTable(
    doc,
    `Annealing Sent (${an.totals?.sentBundles || 0} b / ${kg(an.totals?.sentKg)} kg)`,
    ['Party', 'Type', 'Cat/Wire', 'Bundles', 'Kg'],
    (an.sent || []).map((a) => [
      a.partyName,
      a.materialType,
      a.materialType === 'Wire' ? (a.wireNumber != null ? `#${a.wireNumber}` : '') : (a.coilCategory || ''),
      String(a.bundles || 0),
      kg(a.weightKg),
    ]),
    y
  );
  y = addTable(
    doc,
    `Annealing Arrived (${an.totals?.arrivedBundles || 0} b / ${kg(an.totals?.arrivedKg)} kg)`,
    ['Party', 'Type', 'Cat/Wire', 'Bundles', 'Final Kg'],
    (an.arrived || []).map((a) => [
      a.partyName,
      a.materialType,
      a.materialType === 'Wire' ? (a.wireNumber != null ? `#${a.wireNumber}` : '') : (a.coilCategory || ''),
      String(a.bundles || 0),
      kg(a.finalWeightKg || a.weightKg),
    ]),
    y
  );
  y = addTable(
    doc,
    `Processing Coil Arrival (${kg(pr.totals?.coilInKg)} kg)`,
    ['Customer', 'Category', 'Kg'],
    (pr.arrivals || []).map((a) => [a.customerName, a.coilCategory || '', kg(a.weightKg)]),
    y
  );
  y = addTable(
    doc,
    `Processing Wire Delivery (${kg(pr.totals?.wireOutKg)} kg)`,
    ['Customer', 'Wire', 'Bundles', 'Kg'],
    (pr.deliveries || []).map((d) => [
      d.customerName,
      d.wireNumber != null ? `#${d.wireNumber}` : '',
      String(d.bundles || 0),
      kg(d.weightKg),
    ]),
    y
  );
  y = addTable(
    doc,
    'Stock Movement Ledger',
    ['Dir', 'Reason', 'Party', 'Material', 'Bndl', 'Kg'],
    (sm.ledger || []).map((r) => [
      r.direction,
      r.reason,
      r.party,
      r.material,
      String(r.bundles || 0),
      kg(r.weightKg),
    ]),
    y
  );
  doc.setFontSize(9);
  doc.text(
    `Wire in ${kg(sm.wireInKg)} / out ${kg(sm.wireOutKg)}   |   Coil in ${kg(sm.coilInKg)} / out ${kg(sm.coilOutKg)}`,
    14,
    y
  );
}

export function exportDailyBookReportPdf(report) {
  if (!report?.days?.length) return;
  const doc = new jsPDF({ orientation: 'portrait' });

  if (report.mode === 'range') {
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('Daily Book Range Summary', 14, 16);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    doc.text(`${report.startDate} to ${report.endDate}`, 14, 24);
    doc.text(
      `Annealing sent ${kg(report.rangeSummary?.annealSentKg)} → arrived ${kg(report.rangeSummary?.annealArrivedKg)} kg  |  Processing coil in ${kg(report.rangeSummary?.processingCoilInKg)} / wire out ${kg(report.rangeSummary?.processingWireOutKg)}`,
      14,
      30
    );
    doc.autoTable({
      head: [['Date', 'Open', 'In', 'Out', 'Close']],
      body: report.days.map((d) => [
        formatDate(d.date),
        formatCurrency(d.cash?.openingBalance || 0),
        formatCurrency(d.cash?.totalIn || 0),
        formatCurrency(d.cash?.totalOut || 0),
        formatCurrency(d.cash?.closingBalance || 0),
      ]),
      startY: 36,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [55, 55, 55] },
    });
    addTable(
      doc,
      `Factory Expense Breakdown — ${formatCurrency(report.rangeSummary?.factoryExpenseTotal || 0)}`,
      ['Expense Group', 'Category', 'Amount'],
      (report.rangeSummary?.factoryExpenseBreakdown || []).map((row) => [
        row.group,
        row.category,
        formatCurrency(row.amount || 0),
      ]),
      doc.lastAutoTable.finalY + 8
    );
    report.days.forEach((day) => addDayToPdf(doc, day, false));
  } else {
    addDayToPdf(doc, report.days[0], true);
  }

  const name =
    report.mode === 'range'
      ? `daily-book-${safeName(report.startDate)}-to-${safeName(report.endDate)}.pdf`
      : `daily-book-${safeName(report.startDate)}.pdf`;
  doc.save(name);
}
