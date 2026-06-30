import * as XLSX from 'xlsx';
import type { BankCode } from '@/lib/bankStatement/types';
import { parseTabularRows, type TabularParseResult } from '@/lib/bankStatement/tabularParse';
import type { TabularColumnMap } from '@/lib/bankStatement/columnMap';
import { scoreRowAsTransactionHeader } from '@/lib/bankStatement/tablePrep';

function cellToString(cell: XLSX.CellObject | undefined): string {
  if (cell == null) return '';
  if (cell.v instanceof Date) {
    const d = cell.v;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}.${mm}.${yyyy}`;
  }
  const w = cell.w != null ? String(cell.w).trim() : '';
  if (w) return w;
  return cell.v == null ? '' : String(cell.v).trim();
}

function sheetToRows(sheet: XLSX.WorkSheet): string[][] {
  const ref = sheet['!ref'];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  const rows: string[][] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      row.push(cellToString(sheet[addr]));
    }
    if (row.some((x) => x.trim())) rows.push(row);
  }
  return rows;
}

function pickBestSheet(wb: XLSX.WorkBook): XLSX.WorkSheet {
  let best = wb.Sheets[wb.SheetNames[0]];
  let bestScore = 0;
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    const rows = sheetToRows(sheet);
    if (rows.length < 2) continue;
    const headerIdx = rows.findIndex((_, i) => i < 50 && scoreRowAsTransactionHeader(rows[i]) >= 80);
    const idx = headerIdx >= 0 ? headerIdx : 0;
    let score = scoreRowAsTransactionHeader(rows[idx]);
    if (rows.length > 10) score += 2;
    if (score > bestScore) {
      bestScore = score;
      best = sheet;
    }
  }
  return best;
}

export function parseExcelBuffer(
  buffer: ArrayBuffer,
  bankCode: BankCode,
  userMap?: TabularColumnMap
): TabularParseResult {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true, raw: false });
  const sheet = pickBestSheet(wb);
  const rows = sheetToRows(sheet);
  return parseTabularRows(rows, bankCode, 'xlsx', userMap);
}
