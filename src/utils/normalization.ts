import type { Quiz, ScannedSheet, Student, SystemSettings } from '../types/omr';
import { computeThaiGrade, DEFAULT_GRADE_CUTOFFS } from './systemSettings';

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
export function exportScansToCsv(
  quiz: Quiz,
  scans: ScannedSheet[],
  options?: {
    settings?: SystemSettings;
    students?: Student[];
  }
): string {
  const settings = options?.settings;
  const studentSet = options?.students
    ? new Set(options.students.map((s) => s.studentCode))
    : null;
  const includeGrade = settings?.csvIncludeGradeLevel ?? true;
  const includeItems = settings?.csvIncludeItemBreakdown ?? true;
  const passThreshold = quiz.passThresholdPct ?? settings?.defaultPassThresholdPct ?? 50;
  const cutoffs = settings?.gradeCutoffs ?? DEFAULT_GRADE_CUTOFFS;

  const headerCols = [
    'รหัสนักเรียน',
    'ชื่อ-นามสกุล',
    'ห้องเรียน',
    ...(studentSet ? ['สถานะฐานข้อมูล'] : []),
    'คะแนนที่ได้',
    'คะแนนเต็ม',
    'ร้อยละ (%)',
    'ผลการประเมิน',
    ...(includeGrade ? ['เกรด (0-4)'] : []),
    'ตอบถูก',
    'ตอบผิด',
    'ไม่ตอบ',
    'ฝนซ้ำ',
    'เวลาสแกน',
  ];

  if (includeItems) {
    for (let q = 1; q <= quiz.questionCount; q++) {
      headerCols.push(`ข้อ ${q}`);
    }
  }

  const rows: string[] = [headerCols.map(escapeCsvCell).join(',')];

  for (const scan of scans) {
    const passed = scan.percentage >= passThreshold ? 'ผ่าน' : 'ไม่ผ่าน';
    const dbStatus = studentSet
      ? studentSet.has(scan.detectedStudentCode)
        ? 'ตรงฐานข้อมูล'
        : 'ไม่พบรหัส'
      : '';
    const baseCols: Array<string | number> = [
      scan.detectedStudentCode,
      scan.studentName,
      scan.className,
      ...(studentSet ? [dbStatus] : []),
      scan.score,
      scan.maxScore,
      scan.percentage.toFixed(1),
      passed,
      ...(includeGrade ? [computeThaiGrade(scan.percentage, cutoffs)] : []),
      scan.correctCount,
      scan.incorrectCount,
      scan.blankCount,
      scan.multipleCount,
      formatThaiDateTime(scan.scannedAt),
    ];

    if (includeItems) {
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
    }

    rows.push(baseCols.map(escapeCsvCell).join(','));
  }

  return '\uFEFF' + rows.join('\r\n');
}

/**
 * Parses CSV or tab-separated student roster text into normalized Student drafts.
 */
export function parseStudentCsv(
  rawText: string,
  targetDigits: 4 | 5 | 6 = 4
): Array<Omit<Student, 'id' | 'createdAt'>> {
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

    const digitsOnly = first.replace(/\D/g, '');
    const studentCode =
      digitsOnly.length <= targetDigits
        ? digitsOnly.padStart(targetDigits, '0')
        : digitsOnly.slice(0, 6);
    const fullName = (parts[1] ?? '').replace(/^"|"$/g, '').trim();
    const rawClass = (parts[2] ?? 'มัธยมศึกษาปีที่ 1/1').replace(/^"|"$/g, '').trim();
    const numberInClass = Number.parseInt((parts[3] ?? '').trim(), 10) || results.length + 1;

    if (isInvalidStudentRecord(studentCode, fullName)) continue;

    results.push({
      studentCode,
      fullName,
      className: normalizeThaiClassName(rawClass),
      numberInClass,
      sourceSystem: 'csv',
    });
  }

  return results;
}

export const STANDARD_THAI_LEARNING_AREAS = [
  'ภาษาไทย',
  'คณิตศาสตร์',
  'วิทยาศาสตร์และเทคโนโลยี',
  'สังคมศึกษา ศาสนา และวัฒนธรรม',
  'สุขศึกษาและพลศึกษา',
  'ศิลปะ',
  'การงานอาชีพ',
  'ภาษาต่างประเทศ',
  'กิจกรรมพัฒนาผู้เรียน',
] as const;

export const STANDARD_SCHOOL_CLASSROOMS = [
  'ประถมศึกษาปีที่ 1/1',
  'ประถมศึกษาปีที่ 1/2',
  'ประถมศึกษาปีที่ 2/1',
  'ประถมศึกษาปีที่ 2/2',
  'ประถมศึกษาปีที่ 3/1',
  'ประถมศึกษาปีที่ 3/2',
  'ประถมศึกษาปีที่ 4',
  'ประถมศึกษาปีที่ 5/1',
  'ประถมศึกษาปีที่ 5/2',
  'ประถมศึกษาปีที่ 6',
  'มัธยมศึกษาปีที่ 1',
  'มัธยมศึกษาปีที่ 2',
  'มัธยมศึกษาปีที่ 3',
] as const;

export function formatClassroomShort(cls: string): string {
  const normalized = normalizeThaiClassName(cls);
  const pMatch = normalized.match(/ประถมศึกษาปีที่\s*(\d+)(?:\/(\d+))?/);
  if (pMatch) {
    return `ป.${pMatch[1]}${pMatch[2] ? `/${pMatch[2]}` : ''}`;
  }
  const mMatch = normalized.match(/มัธยมศึกษาปีที่\s*(\d+)(?:\/(\d+))?/);
  if (mMatch) {
    return `ม.${mMatch[1]}${mMatch[2] ? `/${mMatch[2]}` : ''}`;
  }
  return normalized;
}

export function formatClassroomLabel(cls: string): string {
  const short = formatClassroomShort(cls);
  const full = normalizeThaiClassName(cls);
  if (short !== full) {
    return `${short} (${full})`;
  }
  return full;
}

export function collectKnownClassrooms(
  students: { className: string }[] = [],
  subjects: { gradeLevel: string }[] = [],
  teachers: { homeroomClass?: string }[] = []
): string[] {
  const set = new Set<string>(STANDARD_SCHOOL_CLASSROOMS);
  for (const s of students) {
    if (s.className) set.add(normalizeThaiClassName(s.className));
  }
  for (const sub of subjects) {
    if (sub.gradeLevel) set.add(normalizeThaiClassName(sub.gradeLevel));
  }
  for (const t of teachers) {
    if (t.homeroomClass) set.add(normalizeThaiClassName(t.homeroomClass));
  }
  return Array.from(set).sort((a, b) => {
    const orderScore = (name: string): number => {
      const p = name.match(/ประถมศึกษาปีที่\s*(\d+)(?:\/(\d+))?/);
      if (p) return 100 + Number(p[1]) * 10 + (p[2] ? Number(p[2]) : 0);
      const m = name.match(/มัธยมศึกษาปีที่\s*(\d+)(?:\/(\d+))?/);
      if (m) return 200 + Number(m[1]) * 10 + (m[2] ? Number(m[2]) : 0);
      return 300;
    };
    const diff = orderScore(a) - orderScore(b);
    return diff !== 0 ? diff : a.localeCompare(b, 'th');
  });
}
