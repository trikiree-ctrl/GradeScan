import * as XLSX from 'xlsx';
import {
  autoDetectAndParseJsonImport,
  autoDetectRowsImport,
  type AutoJsonImportResult,
} from './importExport';

export interface ParsedWorkbook {
  fileName: string;
  sheetNames: string[];
  sheets: Record<string, Array<Record<string, unknown>>>;
}

const HEADER_MATCH_REGEX =
  /รหัส|ชื่อ|นามสกุล|คำนำหน้า|ตำแหน่ง|สถานะ|วิชาเอก|อันดับ|วิทยฐานะ|กลุ่มสาระ|รายวิชา|วิชา|ระดับชั้น|ชั้นเรียน|ห้อง|คาบ|หน่วยกิต|เลขที่|student|teacher|subject|course|prefix|first|last|grade|class|position|department|credit/i;

function isLikelyHeaderRow(cells: string[]): boolean {
  const nonEmpty = cells.map((c) => c.trim()).filter(Boolean);
  if (nonEmpty.length < 2) return false;
  const matchedHeaders = nonEmpty.filter((cell) => HEADER_MATCH_REGEX.test(cell));
  return matchedHeaders.length >= 2;
}

function matrixToRecords(matrix: unknown[][]): Array<Record<string, unknown>> {
  const cleanRows = matrix.map((row) =>
    Array.isArray(row) ? row.map((cell) => (cell === null || cell === undefined ? '' : String(cell).trim())) : []
  );

  let headerRowIdx = -1;
  const scanLimit = Math.min(cleanRows.length, 10);
  for (let i = 0; i < scanLimit; i++) {
    if (isLikelyHeaderRow(cleanRows[i])) {
      headerRowIdx = i;
      break;
    }
  }

  if (headerRowIdx === -1) {
    headerRowIdx = cleanRows.findIndex(
      (r) => r.filter((c) => c.length > 0).length >= 2
    );
  }
  if (headerRowIdx === -1) return [];

  const rawHeaders = cleanRows[headerRowIdx];
  const headers = rawHeaders.map((h, idx) => h || `col_${idx + 1}`);
  const records: Array<Record<string, unknown>> = [];

  for (let r = headerRowIdx + 1; r < cleanRows.length; r++) {
    const row = cleanRows[r];
    if (!row || row.every((c) => c === '')) continue;

    const record: Record<string, unknown> = {};
    let populated = 0;
    headers.forEach((h, cIdx) => {
      const val = row[cIdx] ?? '';
      if (val !== '') populated += 1;
      record[h] = val;
    });
    if (populated > 0) {
      records.push(record);
    }
  }

  return records;
}

/**
 * Parses an Excel workbook (.xlsx / .xls) from an ArrayBuffer into named sheets of row objects.
 * Automatically skips top banner/title rows common in OBEC HRMS & school timetable exports.
 */
export function parseExcelWorkbook(
  buffer: ArrayBuffer,
  fileName = 'workbook.xlsx'
): ParsedWorkbook {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheets: Record<string, Array<Record<string, unknown>>> = {};
  const validSheetNames: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    if (!ws) continue;
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      defval: '',
    });
    const rows = matrixToRecords(matrix);
    if (rows.length > 0) {
      sheets[sheetName] = rows;
      validSheetNames.push(sheetName);
    }
  }

  return {
    fileName,
    sheetNames: validSheetNames,
    sheets,
  };
}

function splitDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

/**
 * Parses comma-CSV, semicolon-CSV, or tab-delimited TSV (e.g. copy-pasted directly from Excel).
 */
export function parseDelimitedTextToRows(
  rawText: string
): Array<Record<string, unknown>> {
  const cleanText = rawText.replace(/^\uFEFF/, '').trim();
  if (!cleanText) return [];

  const lines = cleanText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return [];

  const sample = lines[0];
  const delimiter = sample.includes('\t')
    ? '\t'
    : sample.includes(',')
    ? ','
    : sample.includes(';')
    ? ';'
    : ',';

  const matrix = lines.map((line) => splitDelimitedLine(line, delimiter));
  const firstRow = matrix[0];

  if (isLikelyHeaderRow(firstRow)) {
    return matrixToRecords(matrix);
  }

  // Fallback for headerless student roster lines: studentCode, fullName, className, numberInClass
  return matrix.map((cols, idx) => ({
    studentCode: cols[0] ?? '',
    fullName: cols[1] ?? '',
    className: cols[2] ?? 'ม.1/1',
    numberInClass: cols[3] ?? String(idx + 1),
  }));
}

/**
 * Inspects a selected Excel sheet (or '__ALL__' sheets combined) with automatic entity & vacant-row detection.
 */
export function inspectWorkbookImport(
  workbook: ParsedWorkbook,
  selectedSheet: string,
  preferredHint: 'auto' | 'dmc_students' | 'hrms_teachers' | 'subjects' = 'auto',
  targetDigits: 4 | 5 | 6 = 4
): AutoJsonImportResult {
  if (workbook.sheetNames.length === 0) {
    return {
      detectedType: 'unknown',
      students: [],
      teachers: [],
      subjects: [],
      summaryText: 'ไม่พบข้อมูลตารางในไฟล์ Excel นี้',
    };
  }

  if (selectedSheet === '__ALL__' && workbook.sheetNames.length > 1) {
    const combined: AutoJsonImportResult = {
      detectedType: 'multi_entity',
      students: [],
      teachers: [],
      subjects: [],
      skippedVacantCount: 0,
      summaryText: '',
    };

    for (const name of workbook.sheetNames) {
      const sheetRes = autoDetectRowsImport(
        workbook.sheets[name] ?? [],
        preferredHint,
        targetDigits,
        'xlsx'
      );
      combined.students.push(...sheetRes.students);
      combined.teachers.push(...sheetRes.teachers);
      combined.subjects.push(...sheetRes.subjects);
      combined.skippedVacantCount =
        (combined.skippedVacantCount ?? 0) + (sheetRes.skippedVacantCount ?? 0);
    }

    const total =
      combined.students.length + combined.teachers.length + combined.subjects.length;
    if (total === 0) {
      return {
        detectedType: 'unknown',
        students: [],
        teachers: [],
        subjects: [],
        summaryText: 'ไม่พบคอลัมน์ข้อมูลที่รองรับในชีตของไฟล์ Excel นี้',
      };
    }

    const skipNote =
      (combined.skippedVacantCount ?? 0) > 0
        ? ` · ข้ามตำแหน่งว่าง ${combined.skippedVacantCount} อัตรา`
        : '';
    combined.summaryText = `รวมข้อมูลจาก ${workbook.sheetNames.length} ชีต: นักเรียน ${combined.students.length} · ครู ${combined.teachers.length} · วิชา ${combined.subjects.length}${skipNote}`;
    return combined;
  }

  const targetSheetName =
    selectedSheet && workbook.sheets[selectedSheet]
      ? selectedSheet
      : workbook.sheetNames[0];
  const rows = workbook.sheets[targetSheetName] ?? [];
  return autoDetectRowsImport(rows, preferredHint, targetDigits, 'xlsx');
}

/**
 * Inspects any pasted or uploaded text (JSON, CSV, or Excel TSV paste).
 */
export function inspectTextOrSpreadsheetImport(
  rawText: string,
  preferredHint: 'auto' | 'dmc_students' | 'hrms_teachers' | 'subjects' | 'backup' = 'auto',
  targetDigits: 4 | 5 | 6 = 4
): AutoJsonImportResult {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return {
      detectedType: 'unknown',
      students: [],
      teachers: [],
      subjects: [],
      summaryText: 'กรุณาอัปโหลดไฟล์หรือวางข้อมูล',
    };
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return autoDetectAndParseJsonImport(trimmed, preferredHint, targetDigits);
  }

  const rows = parseDelimitedTextToRows(trimmed);
  const hintForRows = preferredHint === 'backup' ? 'auto' : preferredHint;
  return autoDetectRowsImport(rows, hintForRows, targetDigits, 'csv');
}

/**
 * Exports rows to a real .xlsx file download.
 */
export function exportRowsToXlsxDownload(
  filename: string,
  sheetName: string,
  rows: Array<Record<string, unknown>>
): void {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const blob = new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
