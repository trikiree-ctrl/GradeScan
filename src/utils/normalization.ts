import type { Quiz, ScannedSheet, Student } from '../types/omr';

/**
 * Normalizes Thai classroom names into a consistent standard format.
 * Examples:
 * - "ป 1/1", "ป.1/1", "ชั้นประถมศึกษาปีที่ 1/1" -> "ประถมศึกษาปีที่ 1/1"
 * - "ม 2/3", "ม.2 / 3", "มัธยม 2/3" -> "มัธยมศึกษาปีที่ 2/3"
 */
export function normalizeThaiClassName(rawInput: string): string {
  const cleaned = rawInput
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s*\/\s*/g, '/');

  if (!cleaned) return 'ไม่ระบุห้องเรียน';

  const strippedPrefix = cleaned
    .replace(/^ชั้น\s*/, '')
    .replace(/^ห้อง\s*/, '')
    .trim();

  const primaryMatch = strippedPrefix.match(
    /^(?:ป\.?|ประถม(?:ศึกษา)?(?:ปีที่)?)\s*(\d+)(?:\/(\d+))?$/i
  );
  if (primaryMatch) {
    const grade = primaryMatch[1];
    const room = primaryMatch[2] ? `/${primaryMatch[2]}` : '';
    return `ประถมศึกษาปีที่ ${grade}${room}`;
  }

  const secondaryMatch = strippedPrefix.match(
    /^(?:ม\.?|มัธยม(?:ศึกษา)?(?:ปีที่)?)\s*(\d+)(?:\/(\d+))?$/i
  );
  if (secondaryMatch) {
    const grade = secondaryMatch[1];
    const room = secondaryMatch[2] ? `/${secondaryMatch[2]}` : '';
    return `มัธยมศึกษาปีที่ ${grade}${room}`;
  }

  return strippedPrefix;
}

/**
 * Filters invalid / garbage placeholder records (e.g. "*", "-", empty).
 */
export function isInvalidStudentRecord(studentCode: string, fullName: string): boolean {
  const code = studentCode.trim();
  const name = fullName.trim();
  if (!name || name === '*' || name === '-' || name === 'N/A') return true;
  if (!code || !/^\d{1,6}$/.test(code)) return true;
  return false;
}

/**
 * Deterministic fast state hash (FNV-1a 32-bit hex) for delta/integrity tracking.
 */
export function computeStateHash(payload: unknown): string {
  const text = JSON.stringify(payload);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function formatThaiDateTime(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return date.toLocaleString('th-TH', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function escapeCsvCell(value: string | number): string {
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Exports scanned grades to UTF-8 BOM CSV compatible with Microsoft Excel (Thai characters preserved).
 */
export function exportScansToCsv(quiz: Quiz, scans: ScannedSheet[]): string {
  const headerCols = [
    'รหัสนักเรียน',
    'ชื่อ-นามสกุล',
    'ห้องเรียน',
    'คะแนนที่ได้',
    'คะแนนเต็ม',
    'ร้อยละ (%)',
    'ตอบถูก',
    'ตอบผิด',
    'ไม่ตอบ',
    'ฝนซ้ำ',
    'เวลาสแกน',
  ];

  for (let q = 1; q <= quiz.questionCount; q++) {
    headerCols.push(`ข้อ ${q}`);
  }

  const rows: string[] = [headerCols.map(escapeCsvCell).join(',')];

  for (const scan of scans) {
    const baseCols: Array<string | number> = [
      scan.detectedStudentCode,
      scan.studentName,
      scan.className,
      scan.score,
      scan.maxScore,
      scan.percentage.toFixed(1),
      scan.correctCount,
      scan.incorrectCount,
      scan.blankCount,
      scan.multipleCount,
      formatThaiDateTime(scan.scannedAt),
    ];

    for (let q = 1; q <= quiz.questionCount; q++) {
      const ans = scan.answers[q];
      const status = scan.statuses[q];
      if (status === 'multiple') {
        baseCols.push('MULTI');
      } else if (!ans || status === 'blank') {
        baseCols.push('-');
      } else {
        baseCols.push(ans);
      }
    }

    rows.push(baseCols.map(escapeCsvCell).join(','));
  }

  return '\uFEFF' + rows.join('\r\n');
}

/**
 * Parses CSV or tab-separated student roster text into normalized Student drafts.
 */
export function parseStudentCsv(rawText: string): Array<Omit<Student, 'id' | 'createdAt'>> {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const results: Array<Omit<Student, 'id' | 'createdAt'>> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const parts = line.includes('\t') ? line.split('\t') : line.split(',');
    if (parts.length < 2) continue;

    const first = parts[0].replace(/^"|"$/g, '').trim();
    if (i === 0 && /รหัส|code|id/i.test(first)) continue;

    const studentCode = first.padStart(4, '0').slice(0, 4);
    const fullName = (parts[1] ?? '').replace(/^"|"$/g, '').trim();
    const rawClass = (parts[2] ?? 'มัธยมศึกษาปีที่ 1/1').replace(/^"|"$/g, '').trim();
    const numberInClass = Number.parseInt((parts[3] ?? '').trim(), 10) || results.length + 1;

    if (isInvalidStudentRecord(studentCode, fullName)) continue;

    results.push({
      studentCode,
      fullName,
      className: normalizeThaiClassName(rawClass),
      numberInClass,
    });
  }

  return results;
}
