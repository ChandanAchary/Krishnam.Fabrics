import { downloadBlob } from './utils';

function escapeField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function exportCSV(filename: string, headers: string[], rows: Array<Array<unknown>>) {
  const lines: string[] = [];
  lines.push(headers.map(escapeField).join(','));
  for (const row of rows) {
    lines.push(row.map(escapeField).join(','));
  }
  const csv = '﻿' + lines.join('\r\n'); // BOM for Excel UTF-8
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), filename);
}
