import type {
  Quiz,
  QuizSummaryStats,
  ScannedSheet,
  Student,
  Subject,
  SystemBackupPayload,
  SystemSettings,
  Teacher,
} from '../types/omr';
import {
  BAN_APHON_EXTRA_TIMETABLE_TEACHERS,
  BAN_APHON_RAW_HRMS_ROWS,
  BAN_APHON_SCHOOL_META,
  buildBanAphonTimetableSubjects,
} from './banAphonPreset';
import {
  isInvalidStudentRecord,
  normalizeThaiClassName,
} from './normalization';
import { computeThaiGrade, sanitizeSystemSettings } from './systemSettings';

type AnyRecord = Record<string, unknown>;

function asString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function normalizeRowKeys(row: AnyRecord): AnyRecord {
  const normalized: AnyRecord = { ...row };
  for (const [k, v] of Object.entries(row)) {
    const trimmed = k.trim();
    if (trimmed && !(trimmed in normalized)) {
      normalized[trimmed] = v;
    }
    const lower = trimmed.toLowerCase();
    if (lower && !(lower in normalized)) {
      normalized[lower] = v;
    }
  }
  return normalized;
}

function pickField(obj: AnyRecord, keys: string[]): string {
  for (const k of keys) {
    if (k in obj && obj[k] !== null && obj[k] !== undefined) {
      const val = asString(obj[k]);
      if (val) return val;
    }
    const lower = k.toLowerCase();
    if (lower in obj && obj[lower] !== null && obj[lower] !== undefined) {
      const val = asString(obj[lower]);
      if (val) return val;
    }
  }
  return '';
}

function extractRecordsArray(
  parsed: unknown,
  candidateKeys: string[]
): AnyRecord[] {
  if (Array.isArray(parsed)) {
    return parsed
      .filter((item): item is AnyRecord => Boolean(item) && typeof item === 'object')
      .map(normalizeRowKeys);
  }
  if (!parsed || typeof parsed !== 'object') return [];
  const obj = parsed as AnyRecord;

  for (const key of candidateKeys) {
    const val = obj[key];
    if (Array.isArray(val)) {
      return val
        .filter((item): item is AnyRecord => Boolean(item) && typeof item === 'object')
        .map(normalizeRowKeys);
    }
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const nested = extractRecordsArray(val, candidateKeys);
      if (nested.length > 0) return nested;
    }
  }
  return [];
}

function normalizeOmrDigits(rawCode: string, digitsCount: 4 | 5 | 6 = 4): string {
  const digitsOnly = rawCode.replace(/\D/g, '');
  if (!digitsOnly) return '';
  if (digitsOnly.length <= digitsCount) {
    return digitsOnly.padStart(digitsCount, '0');
  }
  return digitsOnly.length <= 6
    ? digitsOnly
    : digitsOnly.slice(-digitsCount);
}

/**
 * Parses student records from DMC / SchoolMIS / Excel / CSV / JSON formats.
 */
export function parseDmcStudentsJson(
  jsonInput: unknown,
  targetDigits: 4 | 5 | 6 = 4,
  sourceFormat: 'dmc' | 'csv' | 'json' = 'dmc'
): Student[] {
  const rows = extractRecordsArray(jsonInput, [
    'students',
    'student_list',
    'dmc',
    'DMC',
    'data',
    'records',
    'rows',
    'items',
  ]);

  const now = new Date().toISOString();
  const parsed: Student[] = [];
  const seenCodes = new Set<string>();

  rows.forEach((row, idx) => {
    const rawCode = pickField(row, [
      'studentCode',
      'student_code',
      'student_id',
      'stu_id',
      'std_code',
      'code',
      'รหัสนักเรียน',
      'เลขประจำตัวนักเรียน',
      'เลขประจำตัว',
      'รหัส OMR',
      'id',
    ]);

    const combinedName = pickField(row, [
      'fullName',
      'full_name',
      'student_name',
      'stu_name',
      'name',
      'ชื่อ-สกุล',
      'ชื่อ-นามสกุล',
      'ชื่อสกุล',
      'ชื่อนักเรียน',
    ]);
    const prefix = pickField(row, [
      'prefix',
      'title',
      'titlename',
      'prename',
      'คำนำหน้า',
      'คำนำหน้าชื่อ',
    ]);
    const firstName = pickField(row, [
      'firstName',
      'first_name',
      'firstname',
      'fname',
      'stu_fname',
      'ชื่อ',
    ]);
    const lastName = pickField(row, [
      'lastName',
      'last_name',
      'lastname',
      'lname',
      'stu_lname',
      'นามสกุล',
      'สกุล',
    ]);
    const fullName =
      combinedName ||
      `${prefix}${firstName}${lastName ? ' ' + lastName : ''}`.trim();

    const combinedClass = pickField(row, [
      'className',
      'class_name',
      'classroom',
      'class',
      'ห้องเรียน',
      'ชั้นเรียน',
    ]);
    const gradePart = pickField(row, [
      'grade',
      'grade_level',
      'class_level',
      'level',
      'ระดับชั้น',
      'ชั้น',
    ]);
    const roomPart = pickField(row, ['room', 'room_no', 'section', 'ห้อง']);
    let rawClass = combinedClass;
    if (!rawClass && gradePart) {
      rawClass = roomPart && !gradePart.includes('/') ? `${gradePart}/${roomPart}` : gradePart;
    }
    if (!rawClass) rawClass = 'มัธยมศึกษาปีที่ 1/1';

    const numStr = pickField(row, [
      'numberInClass',
      'number_in_class',
      'stu_no',
      'seat_no',
      'no',
      'number',
      'เลขที่',
    ]);
    const numberInClass = Number.parseInt(numStr, 10) || idx + 1;

    const studentCode = normalizeOmrDigits(rawCode || String(1001 + idx), targetDigits);
    if (isInvalidStudentRecord(studentCode, fullName) || seenCodes.has(studentCode)) {
      return;
    }
    seenCodes.add(studentCode);

    const citizenId = pickField(row, [
      'citizenId',
      'citizen_id',
      'pid',
      'id_card',
      'เลขประจำตัวประชาชน',
      'เลขบัตรประชาชน',
    ]);
    const gender = pickField(row, ['gender', 'sex', 'เพศ']);
    const status = pickField(row, ['status', 'สถานะ']);

    parsed.push({
      id: `stu_${sourceFormat}_${Date.now()}_${idx}`,
      studentCode,
      fullName,
      className: normalizeThaiClassName(rawClass),
      numberInClass: Math.max(1, numberInClass),
      citizenId: citizenId || undefined,
      gender: gender || undefined,
      status: status || undefined,
      sourceSystem: sourceFormat,
      createdAt: now,
    });
  });

  return parsed;
}

export interface HrmsParseReport {
  teachers: Teacher[];
  skippedVacantCount: number;
  skippedDuplicateCount: number;
  skippedPositionNumbers: string[];
}

/**
 * Parses teacher & personnel records from real OBEC HRMS exports (PDF/Excel/CSV/JSON).
 * Automatically skips vacant rows ("ว่าง" / "ว่างรอเกลี่ย" / empty names).
 */
export function parseHrmsTeachersWithReport(
  jsonInput: unknown,
  sourceFormat: 'hrms' | 'xlsx' | 'csv' | 'json' = 'hrms'
): HrmsParseReport {
  const rows = extractRecordsArray(jsonInput, [
    'teachers',
    'personnel',
    'staff',
    'employees',
    'hrms',
    'HRMS',
    'data',
    'records',
    'rows',
    'items',
  ]);

  const now = new Date().toISOString();
  const parsed: Teacher[] = [];
  const seenCodes = new Set<string>();
  let skippedVacantCount = 0;
  let skippedDuplicateCount = 0;
  const skippedPositionNumbers: string[] = [];

  rows.forEach((row, idx) => {
    const positionNumber = pickField(row, [
      'positionNumber',
      'position_number',
      'pos_no',
      'ตำแหน่งเลขที่',
      'เลขที่ตำแหน่ง',
    ]);
    const payrollId = pickField(row, [
      'payrollId',
      'payroll_id',
      'เลขที่จ่ายตรง',
    ]);
    const positionStatus = pickField(row, [
      'positionStatus',
      'position_status',
      'status',
      'สถานะตำแหน่ง',
      'สถานะ',
    ]);

    const teacherCode =
      pickField(row, [
        'teacherCode',
        'teacher_code',
        'emp_id',
        'employee_id',
        'staff_id',
        'person_id',
        'teacher_id',
        'รหัสครู',
        'รหัสบุคลากร',
        'รหัสพนักงาน',
        'ตำแหน่งเลขที่',
        'เลขที่ตำแหน่ง',
        'id',
      ]) ||
      positionNumber ||
      `T${String(idx + 1).padStart(3, '0')}`;

    const combinedName = pickField(row, [
      'fullName',
      'full_name',
      'teacher_name',
      'staff_name',
      'name',
      'ชื่อ-สกุล',
      'ชื่อ-นามสกุล',
      'ชื่อสกุล',
    ]);
    const prefix = pickField(row, [
      'prefix',
      'prename',
      'title',
      'คำนำหน้า',
      'คำนำหน้าชื่อ',
    ]);
    const firstName = pickField(row, ['firstName', 'first_name', 'fname', 'ชื่อ']);
    const lastName = pickField(row, ['lastName', 'last_name', 'lname', 'นามสกุล', 'สกุล']);
    const fullName =
      combinedName ||
      `${prefix}${firstName}${lastName ? ' ' + lastName : ''}`.trim();

    // Automatic vacant position filtering for real OBEC HRMS sheets
    const isVacantStatus = positionStatus.includes('ว่าง');
    const isMissingName = !fullName || fullName === '-' || fullName === '*';
    if (isVacantStatus || isMissingName) {
      skippedVacantCount += 1;
      if (positionNumber || positionStatus) {
        skippedPositionNumbers.push(
          `${positionNumber || teacherCode}${positionStatus ? ` (${positionStatus})` : ''}`
        );
      }
      return;
    }

    if (seenCodes.has(teacherCode)) {
      skippedDuplicateCount += 1;
      return;
    }
    seenCodes.add(teacherCode);

    const academicRank = pickField(row, [
      'academicRank',
      'academic_rank',
      'rank',
      'ระดับ/อันดับ',
      'ระดับ',
      'อันดับ',
      'วิทยฐานะ',
    ]);
    const major = pickField(row, [
      'major',
      'subject_major',
      'กลุ่มวิชาเอกตามมาตรฐานวิชาเอก',
      'กลุ่มวิชาเอก',
      'วิชาเอก',
    ]);
    const position =
      pickField(row, ['position', 'position_name', 'ชื่อตำแหน่ง', 'ตำแหน่ง']) ||
      'ครูผู้สอน';
    const department =
      major ||
      pickField(row, [
        'department',
        'learning_area',
        'group_name',
        'faculty',
        'กลุ่มสาระ',
        'กลุ่มสาระการเรียนรู้',
        'กลุ่มงาน',
        'ฝ่าย',
      ]) ||
      'ไม่ระบุกลุ่มสาระ';
    const rawHomeroom = pickField(row, [
      'homeroomClass',
      'homeroom',
      'advisor_class',
      'class_name',
      'ครูที่ปรึกษา',
      'ชั้นที่ปรึกษา',
      'ประจำชั้น',
    ]);

    parsed.push({
      id: `tch_${sourceFormat}_${Date.now()}_${idx}`,
      teacherCode,
      fullName,
      position,
      department,
      homeroomClass: rawHomeroom ? normalizeThaiClassName(rawHomeroom) : undefined,
      positionNumber: positionNumber || undefined,
      payrollId: payrollId || undefined,
      academicRank: academicRank || undefined,
      major: major || undefined,
      positionStatus: positionStatus || undefined,
      schoolCode: pickField(row, ['schoolCode', 'school_code', 'รหัสสถานศึกษา']) || undefined,
      schoolName: pickField(row, ['schoolName', 'school_name', 'ชื่อสถานศึกษา']) || undefined,
      citizenId:
        pickField(row, [
          'citizenId',
          'citizen_id',
          'pid',
          'เลขประจำตัวประชาชน',
          'เลขบัตรประชาชน',
        ]) || undefined,
      email: pickField(row, ['email', 'อีเมล']) || undefined,
      phone: pickField(row, ['phone', 'tel', 'mobile', 'เบอร์โทร']) || undefined,
      sourceSystem: sourceFormat === 'xlsx' ? 'xlsx' : sourceFormat === 'csv' ? 'csv' : 'hrms',
      createdAt: now,
    });
  });

  return {
    teachers: parsed,
    skippedVacantCount,
    skippedDuplicateCount,
    skippedPositionNumbers,
  };
}

export function parseHrmsTeachersJson(jsonInput: unknown): Teacher[] {
  return parseHrmsTeachersWithReport(jsonInput, 'hrms').teachers;
}

/**
 * Parses subject/course records aligned with real per-grade/room & per-teacher timetables.
 * Deduplicates by composite (subjectCode + gradeLevel + teacherName) so multi-room assignments are preserved.
 */
export function parseSubjectsJson(
  jsonInput: unknown,
  sourceFormat: 'json' | 'xlsx' | 'csv' | 'hrms' = 'json'
): Subject[] {
  const rows = extractRecordsArray(jsonInput, [
    'subjects',
    'courses',
    'curriculum',
    'timetable',
    'data',
    'records',
    'rows',
    'items',
  ]);

  const now = new Date().toISOString();
  const parsed: Subject[] = [];
  const seenKeys = new Set<string>();

  rows.forEach((row, idx) => {
    const subjectCode =
      pickField(row, [
        'subjectCode',
        'subject_code',
        'course_code',
        'code',
        'รหัสวิชา',
      ]) || `SUB${String(idx + 1).padStart(3, '0')}`;

    const subjectName = pickField(row, [
      'subjectName',
      'subject_name',
      'course_name',
      'title',
      'name',
      'ชื่อวิชา',
      'รายวิชา',
      'วิชา',
    ]);

    if (!subjectName) return;

    const learningArea =
      pickField(row, [
        'learningArea',
        'learning_area',
        'department',
        'group_name',
        'กลุ่มสาระ',
        'กลุ่มสาระการเรียนรู้',
      ]) || 'ไม่ระบุกลุ่มสาระ';

    const baseGrade = pickField(row, [
      'gradeLevel',
      'grade_level',
      'class_level',
      'className',
      'class_name',
      'level',
      'ระดับชั้น',
      'ชั้นที่สอน',
      'ชั้นเรียน',
      'ชั้น',
      'ห้องเรียน',
    ]);
    const roomPart = pickField(row, ['room', 'room_no', 'section', 'ห้อง']);
    let rawGrade = baseGrade || 'มัธยมศึกษาปีที่ 1';
    if (baseGrade && roomPart && !baseGrade.includes('/')) {
      rawGrade = `${baseGrade}/${roomPart}`;
    }
    const gradeLevel = normalizeThaiClassName(rawGrade);

    const teacherCode =
      pickField(row, [
        'teacherCode',
        'teacher_code',
        'emp_id',
        'รหัสครูผู้สอน',
        'รหัสครู',
        'ตำแหน่งเลขที่',
      ]) || undefined;
    const teacherName =
      pickField(row, [
        'teacherName',
        'teacher_name',
        'instructor',
        'ครูผู้สอน',
        'ผู้สอน',
        'ครู',
      ]) || undefined;

    const dedupKey = `${subjectCode}::${gradeLevel}::${teacherName || teacherCode || ''}`;
    if (seenKeys.has(dedupKey)) return;
    seenKeys.add(dedupKey);

    const periodsStr = pickField(row, [
      'periodsPerWeek',
      'periods_per_week',
      'periods',
      'hours',
      'คาบ',
      'จำนวนคาบ',
      'คาบ/สัปดาห์',
      'ชั่วโมง',
    ]);
    const parsedPeriods = Number.parseFloat(periodsStr);
    const periodsPerWeek =
      Number.isFinite(parsedPeriods) && parsedPeriods > 0 ? parsedPeriods : undefined;

    const creditStr = pickField(row, ['credits', 'credit', 'weight', 'unit', 'หน่วยกิต']);
    const parsedCredits = Number.parseFloat(creditStr);
    const credits =
      Number.isFinite(parsedCredits) && parsedCredits > 0
        ? parsedCredits
        : periodsPerWeek && periodsPerWeek < 2
        ? 0.5
        : 1.0;

    parsed.push({
      id: `sub_${sourceFormat}_${Date.now()}_${idx}`,
      subjectCode,
      subjectName,
      learningArea,
      gradeLevel,
      credits,
      periodsPerWeek,
      teacherCode,
      teacherName,
      sourceSystem: sourceFormat,
      createdAt: now,
    });
  });

  return parsed;
}

export interface AutoJsonImportResult {
  detectedType: 'backup' | 'dmc_students' | 'hrms_teachers' | 'subjects' | 'multi_entity' | 'unknown';
  students: Student[];
  teachers: Teacher[];
  subjects: Subject[];
  skippedVacantCount?: number;
  backup?: SystemBackupPayload;
  summaryText: string;
}

/**
 * Shared auto-detector for tabular rows coming from Excel (.xlsx/.xls), CSV/TSV, or JSON arrays.
 */
export function autoDetectRowsImport(
  rawRows: AnyRecord[],
  preferredHint: 'auto' | 'dmc_students' | 'hrms_teachers' | 'subjects' = 'auto',
  targetDigits: 4 | 5 | 6 = 4,
  sourceFormat: 'json' | 'xlsx' | 'csv' = 'xlsx'
): AutoJsonImportResult {
  const rows = rawRows
    .filter((item): item is AnyRecord => Boolean(item) && typeof item === 'object')
    .map(normalizeRowKeys);

  if (rows.length === 0) {
    return {
      detectedType: 'unknown',
      students: [],
      teachers: [],
      subjects: [],
      summaryText: 'ไม่พบแถวข้อมูลที่อ่านได้ในตารางหรือไฟล์นี้',
    };
  }

  if (preferredHint === 'dmc_students') {
    const students = parseDmcStudentsJson(
      rows,
      targetDigits,
      sourceFormat === 'csv' ? 'csv' : 'dmc'
    );
    return {
      detectedType: 'dmc_students',
      students,
      teachers: [],
      subjects: [],
      summaryText:
        students.length > 0
          ? `อ่านข้อมูลนักเรียนสำเร็จ ${students.length} คน`
          : 'ไม่พบคอลัมน์รหัสหรือชื่อนักเรียนในตาราง',
    };
  }

  if (preferredHint === 'hrms_teachers') {
    const report = parseHrmsTeachersWithReport(
      rows,
      sourceFormat === 'xlsx' ? 'xlsx' : sourceFormat === 'csv' ? 'csv' : 'hrms'
    );
    const skipNote =
      report.skippedVacantCount > 0
        ? ` (ข้ามตำแหน่งว่าง/รอเกลี่ย ${report.skippedVacantCount} อัตรา)`
        : '';
    return {
      detectedType: 'hrms_teachers',
      students: [],
      teachers: report.teachers,
      subjects: [],
      skippedVacantCount: report.skippedVacantCount,
      summaryText:
        report.teachers.length > 0
          ? `อ่านข้อมูลบุคลากร HRMS สำเร็จ ${report.teachers.length} คน${skipNote}`
          : 'ไม่พบข้อมูลบุคลากรที่มีผู้ถือครองในตาราง',
    };
  }

  if (preferredHint === 'subjects') {
    const subjects = parseSubjectsJson(rows, sourceFormat);
    return {
      detectedType: 'subjects',
      students: [],
      teachers: [],
      subjects,
      summaryText:
        subjects.length > 0
          ? `อ่านข้อมูลรายวิชาจากตารางสอนสำเร็จ ${subjects.length} รายการ`
          : 'ไม่พบคอลัมน์ชื่อรายวิชาในตาราง',
    };
  }

  const keyPool = Object.keys(rows[0]).join(',').toLowerCase();

  if (
    /subject_code|subjectcode|course_code|รหัสวิชา|ชื่อวิชา|รายวิชา|วิชา|subjectname|credits|หน่วยกิต|คาบ\/สัปดาห์|จำนวนคาบ/.test(
      keyPool
    ) &&
    !/รหัสนักเรียน|เลขประจำตัวนักเรียน|ตำแหน่งเลขที่|สถานะตำแหน่ง/.test(keyPool)
  ) {
    const subjects = parseSubjectsJson(rows, sourceFormat);
    if (subjects.length > 0) {
      return {
        detectedType: 'subjects',
        students: [],
        teachers: [],
        subjects,
        summaryText: `ตรวจพบข้อมูลรายวิชา ${subjects.length} รายการ (แยกรายชั้นและครูผู้สอน)`,
      };
    }
  }

  if (
    /teachercode|teacher_code|emp_id|employee_id|staff_id|position|ตำแหน่งเลขที่|เลขที่ตำแหน่ง|ชื่อตำแหน่ง|สถานะตำแหน่ง|กลุ่มวิชาเอก|เลขที่จ่ายตรง|ระดับ\/อันดับ|ตำแหน่ง|วิทยฐานะ|รหัสครู|homeroom/.test(
      keyPool
    )
  ) {
    const report = parseHrmsTeachersWithReport(
      rows,
      sourceFormat === 'xlsx' ? 'xlsx' : sourceFormat === 'csv' ? 'csv' : 'hrms'
    );
    if (report.teachers.length > 0) {
      const skipNote =
        report.skippedVacantCount > 0
          ? ` (ข้ามตำแหน่งว่าง ${report.skippedVacantCount} อัตรา)`
          : '';
      return {
        detectedType: 'hrms_teachers',
        students: [],
        teachers: report.teachers,
        subjects: [],
        skippedVacantCount: report.skippedVacantCount,
        summaryText: `ตรวจพบข้อมูลครู/บุคลากร (HRMS) ${report.teachers.length} คน${skipNote}`,
      };
    }
  }

  const students = parseDmcStudentsJson(
    rows,
    targetDigits,
    sourceFormat === 'csv' ? 'csv' : 'dmc'
  );
  if (students.length > 0) {
    return {
      detectedType: 'dmc_students',
      students,
      teachers: [],
      subjects: [],
      summaryText: `ตรวจพบข้อมูลนักเรียน (DMC) ${students.length} คน`,
    };
  }

  return {
    detectedType: 'unknown',
    students: [],
    teachers: [],
    subjects: [],
    summaryText: 'ไม่พบโครงสร้างคอลัมน์ DMC, HRMS หรือรายวิชาในตารางนี้',
  };
}

/**
 * Smartly inspects any uploaded or pasted JSON (Full Backup, DMC, HRMS, Subjects, or Mixed)
 * and extracts normalized records for every recognized domain.
 */
export function autoDetectAndParseJsonImport(
  rawJsonText: string,
  preferredHint: 'auto' | 'dmc_students' | 'hrms_teachers' | 'subjects' | 'backup' = 'auto',
  targetDigits: 4 | 5 | 6 = 4
): AutoJsonImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJsonText);
  } catch {
    return {
      detectedType: 'unknown',
      students: [],
      teachers: [],
      subjects: [],
      summaryText: 'รูปแบบ JSON ไม่ถูกต้อง กรุณาตรวจสอบเครื่องหมาย { } หรือ [ ]',
    };
  }

  // 1. Full System Backup detection
  if (
    parsed &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    ((parsed as AnyRecord).schema === 'gradescan-backup-v2' ||
      (Array.isArray((parsed as AnyRecord).quizzes) &&
        Array.isArray((parsed as AnyRecord).scans)))
  ) {
    const obj = parsed as Partial<SystemBackupPayload>;
    const backup: SystemBackupPayload = {
      schema: 'gradescan-backup-v2',
      exportedAt: obj.exportedAt ?? new Date().toISOString(),
      schoolName: obj.schoolName ?? '',
      students: Array.isArray(obj.students) ? obj.students : [],
      teachers: Array.isArray(obj.teachers) ? obj.teachers : [],
      subjects: Array.isArray(obj.subjects) ? obj.subjects : [],
      quizzes: Array.isArray(obj.quizzes) ? obj.quizzes : [],
      scans: Array.isArray(obj.scans) ? obj.scans : [],
      activeQuizId: obj.activeQuizId ?? (obj.quizzes?.[0]?.id ?? ''),
      settings: sanitizeSystemSettings(obj.settings),
    };
    return {
      detectedType: 'backup',
      students: backup.students,
      teachers: backup.teachers,
      subjects: backup.subjects,
      backup,
      summaryText: `พบไฟล์สำรองข้อมูลทั้งระบบ: นักเรียน ${backup.students.length} · ครู ${backup.teachers.length} · วิชา ${backup.subjects.length} · ชุดข้อสอบ ${backup.quizzes.length} · ผลตรวจ ${backup.scans.length} แผ่น`,
    };
  }

  // 2. Explicit hint routing
  if (preferredHint === 'dmc_students') {
    const students = parseDmcStudentsJson(parsed, targetDigits, 'dmc');
    return {
      detectedType: 'dmc_students',
      students,
      teachers: [],
      subjects: [],
      summaryText:
        students.length > 0
          ? `อ่านข้อมูลนักเรียนรูปแบบ DMC สำเร็จ ${students.length} คน`
          : 'ไม่พบข้อมูลนักเรียนในไฟล์ JSON',
    };
  }
  if (preferredHint === 'hrms_teachers') {
    const report = parseHrmsTeachersWithReport(parsed, 'hrms');
    const skipNote =
      report.skippedVacantCount > 0
        ? ` (ข้ามตำแหน่งว่าง ${report.skippedVacantCount} อัตรา)`
        : '';
    return {
      detectedType: 'hrms_teachers',
      students: [],
      teachers: report.teachers,
      subjects: [],
      skippedVacantCount: report.skippedVacantCount,
      summaryText:
        report.teachers.length > 0
          ? `อ่านข้อมูลครู/บุคลากรรูปแบบ HRMS สำเร็จ ${report.teachers.length} คน${skipNote}`
          : 'ไม่พบข้อมูลครูที่มีผู้ถือครองในไฟล์ JSON',
    };
  }
  if (preferredHint === 'subjects') {
    const subjects = parseSubjectsJson(parsed, 'json');
    return {
      detectedType: 'subjects',
      students: [],
      teachers: [],
      subjects,
      summaryText:
        subjects.length > 0
          ? `อ่านข้อมูลรายวิชาสำเร็จ ${subjects.length} รายการ`
          : 'ไม่พบข้อมูลรายวิชาในไฟล์ JSON',
    };
  }

  // 3. Auto-detect multi-entity object
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const obj = parsed as AnyRecord;
    const hasStudents = Array.isArray(obj.students) || Array.isArray(obj.dmc);
    const hasTeachers =
      Array.isArray(obj.teachers) ||
      Array.isArray(obj.personnel) ||
      Array.isArray(obj.hrms);
    const hasSubjects = Array.isArray(obj.subjects) || Array.isArray(obj.courses);

    if ([hasStudents, hasTeachers, hasSubjects].filter(Boolean).length >= 2) {
      const students = hasStudents
        ? parseDmcStudentsJson(obj.students ?? obj.dmc, targetDigits, 'dmc')
        : [];
      const teacherReport = hasTeachers
        ? parseHrmsTeachersWithReport(obj.teachers ?? obj.personnel ?? obj.hrms, 'hrms')
        : { teachers: [], skippedVacantCount: 0, skippedDuplicateCount: 0, skippedPositionNumbers: [] };
      const subjects = hasSubjects
        ? parseSubjectsJson(obj.subjects ?? obj.courses, 'json')
        : [];
      const skipNote =
        teacherReport.skippedVacantCount > 0
          ? ` · ข้ามตำแหน่งว่าง ${teacherReport.skippedVacantCount}`
          : '';
      return {
        detectedType: 'multi_entity',
        students,
        teachers: teacherReport.teachers,
        subjects,
        skippedVacantCount: teacherReport.skippedVacantCount,
        summaryText: `พบข้อมูลรวมหลายหมวด: นักเรียน ${students.length} · ครู ${teacherReport.teachers.length} · วิชา ${subjects.length}${skipNote}`,
      };
    }
  }

  // 4. Score-based array auto-detection via shared detector
  const sampleRows = extractRecordsArray(parsed, [
    'data',
    'records',
    'rows',
    'items',
    'students',
    'teachers',
    'personnel',
    'hrms',
    'subjects',
    'courses',
  ]);
  if (sampleRows.length > 0) {
    return autoDetectRowsImport(sampleRows, 'auto', targetDigits, 'json');
  }

  return {
    detectedType: 'unknown',
    students: [],
    teachers: [],
    subjects: [],
    summaryText: 'ไม่พบโครงสร้างข้อมูล DMC, HRMS หรือรายวิชาที่รองรับในไฟล์นี้',
  };
}

/**
 * One-click loader for Ban Aphon School (1032650660):
 * 18 occupied HRMS civil servants (auto-skipping 1 vacant position 4854) + 2 timetable teachers + full per-grade/room/teacher timetable subjects.
 */
export function buildBanAphonFullImportResult(): {
  importResult: AutoJsonImportResult;
  schoolMeta: typeof BAN_APHON_SCHOOL_META;
  skippedVacantCount: number;
} {
  const report = parseHrmsTeachersWithReport(BAN_APHON_RAW_HRMS_ROWS, 'hrms');
  const allTeachers = [...report.teachers, ...BAN_APHON_EXTRA_TIMETABLE_TEACHERS];
  const allSubjects = buildBanAphonTimetableSubjects();

  return {
    importResult: {
      detectedType: 'multi_entity',
      students: [],
      teachers: allTeachers,
      subjects: allSubjects,
      skippedVacantCount: report.skippedVacantCount,
      summaryText: `ชุดข้อมูลโรงเรียนบ้านอาโพน (1032650660): ครู/บุคลากร ${allTeachers.length} คน (HRMS ${report.teachers.length} + ตารางสอน ${BAN_APHON_EXTRA_TIMETABLE_TEACHERS.length}, ข้ามตำแหน่งว่าง ${report.skippedVacantCount} อัตรา) · รายวิชาตามตารางสอน ${allSubjects.length} รายการ`,
    },
    schoolMeta: BAN_APHON_SCHOOL_META,
    skippedVacantCount: report.skippedVacantCount,
  };
}

/**
 * Builds complete System Backup JSON string.
 */
export function exportFullSystemBackupJson(payload: Omit<SystemBackupPayload, 'schema' | 'exportedAt'>): string {
  const full: SystemBackupPayload = {
    schema: 'gradescan-backup-v2',
    exportedAt: new Date().toISOString(),
    ...payload,
  };
  return JSON.stringify(full, null, 2);
}

/**
 * Exports complete post-grading results package (quiz metadata, summary stats, Thai 8-tier grades,
 * DB verification status, and per-question responses) as structured JSON.
 */
export function exportPostScanScoresJson(
  quiz: Quiz,
  scans: ScannedSheet[],
  students: Student[],
  summary: QuizSummaryStats,
  settings: SystemSettings
): string {
  const studentMap = new Map(students.map((s) => [s.studentCode, s]));
  const passThreshold = quiz.passThresholdPct ?? settings.defaultPassThresholdPct;

  const payload = {
    exportedAt: new Date().toISOString(),
    schoolName: settings.schoolName,
    academicYear: settings.academicYear,
    semester: settings.semester,
    quiz: {
      id: quiz.id,
      title: quiz.title,
      subject: quiz.subject,
      subjectCode: quiz.subjectCode ?? '',
      className: quiz.className,
      questionCount: quiz.questionCount,
      choiceCount: quiz.choiceCount,
      maxScore: quiz.questionCount * quiz.pointsPerQuestion,
      passThresholdPct: passThreshold,
    },
    summary,
    results: scans.map((scan) => {
      const matched = studentMap.get(scan.detectedStudentCode);
      const thaiGrade = computeThaiGrade(scan.percentage, settings.gradeCutoffs);
      return {
        studentCode: scan.detectedStudentCode,
        databaseMatched: Boolean(matched),
        studentName: matched?.fullName ?? scan.studentName,
        className: matched?.className ?? scan.className,
        numberInClass: matched?.numberInClass ?? null,
        score: scan.score,
        maxScore: scan.maxScore,
        percentage: Number(scan.percentage.toFixed(2)),
        passed: scan.percentage >= passThreshold,
        thaiGrade,
        correctCount: scan.correctCount,
        incorrectCount: scan.incorrectCount,
        blankCount: scan.blankCount,
        multipleCount: scan.multipleCount,
        measuredAngleDeg: scan.measuredAngleDeg ?? null,
        scannedAt: scan.scannedAt,
        answers: scan.answers,
      };
    }),
  };

  return JSON.stringify(payload, null, 2);
}

export const SAMPLE_DMC_JSON = JSON.stringify(
  {
    source: 'DMC_OBEC_EXPORT',
    academic_year: '2569',
    students: [
      {
        student_id: '1015',
        prefix: 'เด็กชาย',
        first_name: 'ธนกฤต',
        last_name: 'รุ่งสว่าง',
        grade: 'ม.1',
        room: '1',
        no: 15,
        citizen_id: '1100501234567',
        gender: 'ชาย',
      },
      {
        student_id: '1016',
        prefix: 'เด็กหญิง',
        first_name: 'นภัสสร',
        last_name: 'จันทร์เพ็ญ',
        grade: 'ม.1',
        room: '1',
        no: 16,
        citizen_id: '1100507654321',
        gender: 'หญิง',
      },
    ],
  },
  null,
  2
);

export const SAMPLE_HRMS_TEACHERS_JSON = JSON.stringify(
  {
    source: 'HRMS_PERSONNEL_EXPORT',
    teachers: [
      {
        emp_id: 'T201',
        prefix: 'นาย',
        first_name: 'สมชาย',
        last_name: 'วิริยะกุล',
        position: 'ครูชำนาญการพิเศษ',
        department: 'วิทยาศาสตร์และเทคโนโลยี',
        homeroom: 'ม.1/1',
        email: 'somchai@school.ac.th',
      },
      {
        emp_id: 'T202',
        prefix: 'นางสาว',
        first_name: 'ปิยะนุช',
        last_name: 'แสงสว่าง',
        position: 'ครูชำนาญการ',
        department: 'คณิตศาสตร์',
        homeroom: 'ม.1/2',
        email: 'piyanuch@school.ac.th',
      },
    ],
  },
  null,
  2
);

export const SAMPLE_OBEC_HRMS_JSON = JSON.stringify(
  {
    source: 'OBEC_HRMS_PERSONNEL_1032650660',
    school: 'โรงเรียนบ้านอาโพน',
    personnel: BAN_APHON_RAW_HRMS_ROWS.slice(0, 5),
  },
  null,
  2
);

export const SAMPLE_SUBJECTS_JSON = JSON.stringify(
  {
    source: 'CURRICULUM_SUBJECTS_EXPORT',
    subjects: [
      {
        subject_code: 'ว21101',
        subject_name: 'วิทยาศาสตร์พื้นฐาน 1',
        learning_area: 'วิทยาศาสตร์และเทคโนโลยี',
        grade_level: 'ม.1',
        credits: 1.5,
        teacher_code: 'T201',
        teacher_name: 'นายสมชาย วิริยะกุล',
      },
      {
        subject_code: 'ค21102',
        subject_name: 'คณิตศาสตร์เพิ่มเติม 1',
        learning_area: 'คณิตศาสตร์',
        grade_level: 'ม.1',
        credits: 1.0,
        teacher_code: 'T202',
        teacher_name: 'นางสาวปิยะนุช แสงสว่าง',
      },
    ],
  },
  null,
  2
);

export const SAMPLE_TIMETABLE_SUBJECTS_JSON = JSON.stringify(
  {
    source: 'TIMETABLE_TERM2_2569',
    school: 'โรงเรียนบ้านอาโพน',
    subjects: buildBanAphonTimetableSubjects().slice(0, 8),
  },
  null,
  2
);
