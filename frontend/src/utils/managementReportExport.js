import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { formatCurrency, formatDate } from './formatters';

const kg = (value) => Number(value || 0).toFixed(2);
const money = (value) => formatCurrency(value || 0);

function cleanSheet(title, summaryRows, headers, rows) {
  const width = Math.max(headers.length, 6);
  const aoa = [
    [title, ...Array(width - 1).fill('')],
    [],
    ...summaryRows.map(([label, value]) => [label, value, ...Array(width - 2).fill('')]),
    [],
    headers,
    ...rows,
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: width - 1 } }];
  ws['!cols'] = headers.map((header, index) => ({
    wch: index === 0 ? 24 : index === 1 ? 26 : Math.max(14, String(header).length + 3),
  }));
  return ws;
}

function statementRows(statement) {
  return (statement || []).map((row) => [row.label, money(row.amount)]);
}

function appendExpenseSheet(wb, breakdown, sheetName = 'Expenses') {
  if (!breakdown) return;
  const rows = [
    ['— Factory expenses by group —', ''],
    ...(breakdown.factoryByGroup || []).map((row) => [row.label, money(row.amount)]),
    ['Total factory expenses', money(breakdown.factoryTotal)],
    ['', ''],
    ['— Factory expenses by category —', ''],
    ...(breakdown.factoryByCategory || []).map((row) => [row.label, money(row.amount)]),
    ['', ''],
    ['— Consumption materials —', ''],
    ...(breakdown.consumptionByType || []).map((row) => [row.label, money(row.amount)]),
    ['Total consumption materials', money(breakdown.consumptionTotal)],
  ];
  if (breakdown.selfByCategory) {
    rows.push(
      ['', ''],
      ['— Self expenses —', ''],
      ...breakdown.selfByCategory.map((row) => [row.label, money(row.amount)]),
      ['Total self expenses', money(breakdown.selfTotal)]
    );
  }
  XLSX.utils.book_append_sheet(wb, cleanSheet(
    'Expense Deductions Used in Profit',
    [],
    ['Expense', 'Amount', '', '', '', ''],
    rows
  ), sheetName);
}

function appendMainSheet(wb, report) {
  const main = report.main || {};
  const rows = [
    ...(main.sales || []).map((row) => [
      formatDate(row.date), 'Sale', row.customerName, row.wireNumber ? `Wire #${row.wireNumber}` : row.wireType,
      row.bundles || 0, kg(row.weightKg), money(row.amount),
    ]),
    ...(main.returns || []).map((row) => [
      formatDate(row.date), 'Wire Return', row.customerName, row.wireNumber ? `Wire #${row.wireNumber}` : row.wireType,
      row.bundles || 0, kg(row.weightKg), money(-row.amount),
    ]),
    ...(main.purchases || []).map((row) => [
      formatDate(row.date), 'Coil Purchase', row.supplierName, row.coilCategory,
      row.bundles || 0, kg(row.weightKg), money(-row.amount),
    ]),
    ...(main.coilReturns || []).map((row) => [
      formatDate(row.date), 'Coil Return', row.supplierName, row.coilCategory,
      row.bundles || 0, kg(row.weightKg), money(row.amount),
    ]),
    ...(main.annealing?.rows || []).map((row) => [
      formatDate(row.date), `Annealing ${row.entryType}`, row.partyName,
      row.materialType === 'Wire' ? `Wire #${row.wireNumber || '?'}` : row.coilCategory,
      row.bundles || 0, kg(row.weightKg), '',
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, cleanSheet(
    'Main Business Profit Report',
    [
      ...statementRows(main.statement),
      ['', ''],
      ['Sales Volume', `${kg(main.salesWeightKg)} kg / ${main.salesBundles || 0} bundles`],
      ['Purchase Volume', `${kg(main.purchaseWeightKg)} kg / ${main.purchaseBundles || 0} bundles`],
      ['Annealing Sent', `${kg(main.annealing?.sentKg)} kg / ${main.annealing?.sentBundles || 0} bundles`],
      ['Annealing Arrived', `${kg(main.annealing?.arrivedKg)} kg / ${main.annealing?.arrivedBundles || 0} bundles`],
      ['Annealing Sold', `${kg(main.annealing?.soldKg)} kg / ${main.annealing?.soldBundles || 0} bundles`],
      ['Annealing Pending Now', `${kg(main.annealing?.pendingKg)} kg / ${main.annealing?.pendingBundles || 0} bundles`],
    ],
    ['Date', 'Work', 'Party', 'Material', 'Bundles', 'Weight (kg)', 'Amount'],
    rows
  ), 'Main Business');
}

function appendProcessingSheet(wb, report) {
  const processing = report.processing || {};
  const rows = [
    ...(processing.arrivals || []).map((row) => [
      formatDate(row.date), 'Coil Arrival', row.customerName, row.coilCategory,
      '', kg(row.weightKg), '',
    ]),
    ...(processing.deliveries || []).map((row) => [
      formatDate(row.date), 'Wire Delivery', row.customerName, row.wireNumber ? `Wire #${row.wireNumber}` : '',
      row.bundles || 0, kg(row.weightKg), money(row.labourAmount),
    ]),
    ...(processing.payments || []).map((row) => [
      formatDate(row.date), 'Labour Payment', row.customerName, row.paymentMethod,
      '', '', money(row.amount),
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, cleanSheet(
    'Processing / Labour Report',
    [
      ...statementRows(processing.statement),
      ['', ''],
      ['Customer Coil In', `${kg(processing.coilInKg)} kg`],
      ['Wire Delivered', `${kg(processing.wireOutKg)} kg / ${processing.wireOutBundles || 0} bundles`],
      ['Current Processing WIP', `${kg(processing.currentWipKg)} kg`],
    ],
    ['Date', 'Work', 'Customer', 'Material / Method', 'Bundles', 'Weight (kg)', 'Labour / Payment'],
    rows
  ), 'Processing Labour');
}

function appendCombinedSheet(wb, report) {
  const combined = report.combined || {};
  const rows = statementRows(combined.statement);
  XLSX.utils.book_append_sheet(wb, cleanSheet(
    'Combined Profit & Loss',
    [
      ['Basis', 'Accrual — earned sales and labour'],
      ['Period', `${report.startDate || 'All'} to ${report.endDate || 'All'}`],
    ],
    ['Line', 'Amount', '', '', '', ''],
    rows
  ), 'Combined Summary');
}

export function exportProfitExcel(report, scope = 'combined') {
  if (!report) return;
  const wb = XLSX.utils.book_new();
  if (scope === 'main') {
    appendMainSheet(wb, report);
    appendExpenseSheet(wb, report.main?.expenseBreakdown);
  } else if (scope === 'processing') {
    appendProcessingSheet(wb, report);
  } else {
    appendCombinedSheet(wb, report);
    appendMainSheet(wb, report);
    appendProcessingSheet(wb, report);
    appendExpenseSheet(wb, report.combined?.expenseBreakdown);
  }
  XLSX.writeFile(wb, `profit-${scope}-${report.startDate || 'all'}-${report.endDate || 'all'}.xlsx`);
}

export function exportProfitPdf(report, scope = 'combined') {
  if (!report) return;
  const doc = new jsPDF({ orientation: 'landscape' });
  const section = scope === 'main' ? report.main : scope === 'processing' ? report.processing : report.combined;
  doc.setFontSize(15);
  doc.text(`${scope === 'main' ? 'Main Business' : scope === 'processing' ? 'Processing / Labour' : 'Combined'} Profit Report`, 14, 16);
  doc.setFontSize(9);
  doc.text(`${report.startDate || 'All'} to ${report.endDate || 'All'} — Accrual basis`, 14, 23);
  doc.autoTable({
    head: [['Profit Calculation', 'Amount']],
    body: statementRows(section.statement),
    startY: 30,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [55, 55, 55] },
  });

  const breakdown = section.expenseBreakdown;
  if (breakdown) {
    const expenseRows = [
      ...(breakdown.factoryByGroup || []).map((row) => ['Factory', row.label, money(row.amount)]),
      ...(breakdown.consumptionByType || []).map((row) => ['Consumption', row.label, money(row.amount)]),
      ...(breakdown.selfByCategory || []).map((row) => ['Self', row.label, money(row.amount)]),
    ];
    if (expenseRows.length) {
      doc.autoTable({
        head: [['Type', 'Expense', 'Amount']],
        body: expenseRows,
        startY: doc.lastAutoTable.finalY + 8,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [120, 60, 60] },
      });
    }
  }
  doc.save(`profit-${scope}-${report.startDate || 'all'}-${report.endDate || 'all'}.pdf`);
}

export function exportFinancialExcel(data, startDate, endDate) {
  if (!data) return;
  const wb = XLSX.utils.book_new();
  const summary = data.summary || {};
  XLSX.utils.book_append_sheet(wb, cleanSheet(
    'Cash & Bank Financial Report',
    [
      ['Period', `${startDate} to ${endDate}`],
      ['Cash Opening', money(data.cash?.openingBalance)],
      ['Cash In', money(data.cash?.totalIn)],
      ['Cash Out', money(data.cash?.totalOut)],
      ['Cash Closing', money(data.cash?.closingBalance)],
      ['Bank Opening', money(data.bank?.openingBalance)],
      ['Bank In', money(data.bank?.totalIn)],
      ['Bank Out', money(data.bank?.totalOut)],
      ['Bank Closing', money(data.bank?.closingBalance)],
      ['Combined Closing', money(summary.cashAndBankClosing)],
    ],
    ['Date', 'Cash Open', 'Cash In', 'Cash Out', 'Cash Close', '', ''],
    (data.cash?.days || []).map((day) => [
      formatDate(day.date), money(day.openingBalance), money(day.totalIn), money(day.totalOut), money(day.closingBalance), '', '',
    ])
  ), 'Cash Summary');
  XLSX.utils.book_append_sheet(wb, cleanSheet(
    'Bank Transactions',
    [],
    ['Date', 'Type', 'Account', 'Party', 'Description', 'Amount', 'Balance'],
    (data.bank?.transactions || []).map((row) => [
      formatDate(row.date), row.type, row.account, row.party, row.description, money(row.amount), money(row.balance),
    ])
  ), 'Bank Transactions');
  XLSX.writeFile(wb, `cash-bank-${startDate}-${endDate}.xlsx`);
}

export function exportInventoryExcel(data) {
  if (!data) return;
  const wb = XLSX.utils.book_new();
  const totals = data.totals || {};
  XLSX.utils.book_append_sheet(wb, cleanSheet(
    'Inventory Summary',
    [
      ['Own Coil Stock', `${kg(totals.ownCoilKg)} kg`],
      ['Ready Wire Stock', `${kg(totals.readyWireKg)} kg / ${totals.readyWireBundles || 0} bundles`],
      ['Pending at Annealing', `${kg(totals.annealingPendingKg)} kg / ${totals.annealingPendingBundles || 0} bundles`],
      ['Processing WIP', `${kg(totals.processingRemainingKg)} kg`],
    ],
    ['Area', 'Material / Party', 'Bundles', 'Weight (kg)', '', ''],
    [
      ...(data.rawStock || []).map((row) => ['Own Coil', row._id, '', kg(row.totalStock), '', '']),
      ...(data.readyStock || []).map((row) => ['Ready Wire', row.wireLabel || `Wire #${row._id}`, row.bundles || 0, kg(row.totalStock), '', '']),
      ...(data.annealingPending || []).map((row) => ['Annealing', row.partyName, row.remainingBundles || 0, kg(row.remainingKg), '', '']),
      ...(data.processingStock || []).map((row) => ['Processing', row.customerName, '', kg(row.remainingKg), '', '']),
    ]
  ), 'Inventory');
  XLSX.writeFile(wb, 'inventory-report.xlsx');
}
