import React from 'react';
import { Button, ButtonGroup } from '@mui/material';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import TableChartIcon from '@mui/icons-material/TableChart';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

/**
 * data: array of objects, columns: [{ id, label }], filename: string, title: string
 */
export default function ExportButtons({ data = [], columns = [], filename = 'report', title = 'Report' }) {
  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, `${filename}.xlsx`);
  };

  const exportPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(title, 14, 20);
    const head = columns.map((c) => c.label);
    const body = data.map((row) => columns.map((c) => (row[c.id] != null ? String(row[c.id]) : '')));
    doc.autoTable({ head: [head], body, startY: 28 });
    doc.save(`${filename}.pdf`);
  };

  return (
    <ButtonGroup size="small">
      <Button startIcon={<TableChartIcon />} onClick={exportExcel}>Export Excel</Button>
      <Button startIcon={<PictureAsPdfIcon />} onClick={exportPdf}>Export PDF</Button>
    </ButtonGroup>
  );
}
