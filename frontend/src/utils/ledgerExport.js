import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { formatCurrency, formatDate } from './formatters';

function safeName(name) {
  return String(name || 'ledger').replace(/[^\w\-]+/g, '_').slice(0, 60);
}

function balanceLabel(balance, partyType, isCombined) {
  if (partyType === 'Supplier' && !isCombined) {
    return balance < 0 ? 'We owe them' : balance > 0 ? 'They owe us' : 'Settled';
  }
  return balance > 0 ? 'They owe us' : balance < 0 ? 'We owe them' : 'Settled';
}

function fmtAmt(v) {
  if (v == null || v === '' || Number(v) === 0) return '—';
  return formatCurrency(v);
}

function fmtWt(v) {
  if (v == null || v === '' || Number(v) === 0) return '—';
  return Number(v).toFixed(1);
}

/**
 * Build rows matching the on-screen ledger view.
 * Returns { title, summaryLines, headers, bodyRows, filenameBase }
 */
export function buildLedgerExportPayload(ledger, { title, partyType } = {}) {
  if (!ledger) return null;

  const isDateWise = ledger.ledgerMode === 'datewise';
  const isCombined = ledger.scope === 'combined';
  const partyName = ledger.party?.name || title || 'Ledger';
  const modeLabel = isDateWise ? 'Date-wise' : 'Personal';
  const scopeLabel = isCombined ? 'Combined Net' : '';
  const exportTitle = scopeLabel
    ? `${partyName} — ${scopeLabel} (${modeLabel})`
    : `${partyName} — ${modeLabel}`;

  const summaryLines = [];
  if (isCombined && (ledger.settlement || ledger.summary?.settlement)) {
    const s = ledger.settlement || ledger.summary.settlement;
    summaryLines.push(`Processing side: ${formatCurrency(Math.abs(s.processing?.balance || 0))} (${s.processing?.status || 'Settled'})`);
    summaryLines.push(`Supplier side: ${formatCurrency(Math.abs(s.supplier?.balance || 0))} (${s.supplier?.status || 'Settled'})`);
    summaryLines.push(`They owe us from Processing: ${formatCurrency(s.theyOweUsFromProcessing || 0)}`);
    summaryLines.push(`We owe them as Supplier: ${formatCurrency(s.weOweThemAsSupplier || 0)}`);
    if (s.theyOweUsAsSupplier > 0) {
      summaryLines.push(`They owe us as Supplier (advance): ${formatCurrency(s.theyOweUsAsSupplier)}`);
    }
    if (s.weOweThemFromProcessing > 0) {
      summaryLines.push(`We owe them from Processing: ${formatCurrency(s.weOweThemFromProcessing)}`);
    }
    summaryLines.push(`Deducted against each other: ${formatCurrency(s.deducted || 0)}`);
    summaryLines.push(`FINAL NET: ${formatCurrency(s.netAmount || 0)} (${s.status || 'Settled'})`);
    summaryLines.push(`Combined Credit: ${formatCurrency(ledger.summary?.totalCredit || 0)}`);
    summaryLines.push(`Combined Debit: ${formatCurrency(ledger.summary?.totalDebit || 0)}`);
  } else {
    summaryLines.push(`Credit: ${formatCurrency(ledger.summary?.totalCredit || 0)}`);
    summaryLines.push(`Debit: ${formatCurrency(ledger.summary?.totalDebit || 0)}`);
    const bal = ledger.summary?.balance || 0;
    summaryLines.push(
      `Balance: ${formatCurrency(Math.abs(bal))} (${balanceLabel(bal, partyType, isCombined)})`
    );
    if (ledger.summary?.totalWeight > 0) {
      summaryLines.push(`Weight: ${ledger.summary.totalWeight.toFixed(2)} kg`);
    }
  }

  let headers = [];
  let bodyRows = [];

  if (isDateWise) {
    headers = ['Date', 'Open', 'Credit', 'Debit', 'Wt', 'Close', 'Entries'];
    bodyRows = (ledger.days || []).map((day) => [
      formatDate(day.date),
      formatCurrency(day.openingBalance),
      day.credit ? formatCurrency(day.credit) : '—',
      day.debit ? formatCurrency(day.debit) : '—',
      day.totalWeight ? day.totalWeight.toFixed(1) : '—',
      formatCurrency(day.closingBalance),
      (day.entries || [])
        .map((e) => {
          const role = e.role === 'processing' ? '[Processing] ' : e.role === 'supplier' ? '[Supplier] ' : (e.role ? `[${e.role}] ` : '');
          const wt = e.weightKg ? ` (${e.weightKg} kg)` : '';
          const pay = e.paymentMethod ? ` · ${e.paymentMethod}` : '';
          return `${role}${e.description || ''}${wt}${pay}`;
        })
        .join('; '),
    ]);
  } else {
    headers = ['Date'];
    if (isCombined) headers.push('Role');
    headers.push('Description', 'Source', 'Payment', 'Wt', 'Rate', 'Credit', 'Debit', 'Total', 'Balance');
    bodyRows = (ledger.entries || []).map((row) => {
      const cells = [formatDate(row.date)];
      if (isCombined) cells.push(row.role === 'processing' ? 'Processing' : row.role === 'supplier' ? 'Supplier' : (row.role || ''));
      cells.push(
        row.description || '',
        row.source || '',
        row.paymentMethod || '—',
        fmtWt(row.weightKg),
        row.ratePerKg ? formatCurrency(row.ratePerKg) : '—',
        row.credit ? formatCurrency(row.credit) : '—',
        row.debit ? formatCurrency(row.debit) : '—',
        row.totalPrice ? formatCurrency(row.totalPrice) : '—',
        `${formatCurrency(Math.abs(row.balance || 0))} (${balanceLabel(row.balance || 0, partyType, isCombined)})`
      );
      return cells;
    });
  }

  const filenameBase = `${safeName(partyName)}-ledger-${safeName(scopeLabel || modeLabel)}`;
  return { title: exportTitle, summaryLines, headers, bodyRows, filenameBase };
}

export function exportLedgerExcel(ledger, options = {}) {
  const payload = buildLedgerExportPayload(ledger, options);
  if (!payload) return;

  const aoa = [
    [payload.title],
    [],
    ...payload.summaryLines.map((line) => [line]),
    [],
    payload.headers,
    ...payload.bodyRows,
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = payload.headers.map((_, i) => ({ wch: i === 1 || i === 2 ? 28 : 14 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Ledger');
  XLSX.writeFile(wb, `${payload.filenameBase}.xlsx`);
}

export function exportLedgerPdf(ledger, options = {}) {
  const payload = buildLedgerExportPayload(ledger, options);
  if (!payload) return;

  const doc = new jsPDF({ orientation: payload.headers.length > 7 ? 'landscape' : 'portrait' });
  doc.setFontSize(14);
  doc.text(payload.title, 14, 16);
  doc.setFontSize(9);
  let y = 24;
  payload.summaryLines.forEach((line) => {
    doc.text(line, 14, y);
    y += 5;
  });
  doc.autoTable({
    head: [payload.headers],
    body: payload.bodyRows,
    startY: y + 4,
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [66, 66, 66], fontSize: 7 },
  });
  doc.save(`${payload.filenameBase}.pdf`);
}
