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
  isInvalidStudentRecord,
  normalizeThaiClassName,
} from './normalization';
import { computeThaiGrade, sanitizeSystemSettings } from './systemSettings';

type AnyRecord = Record<string, unknown>;

function asString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function pickField(obj: AnyRecord, keys: string[]): string {
  for (const k of keys) {
    if (k in obj && obj[k] !== null && obj[k] !== undefined) {
      const val = asString(obj[k]);
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
    return parsed.filter(
      (item): item is AnyRecord => Boolean(item) && typeof item === 'object'
    );
  }
  if (!parsed || typeof parsed !== 'object') return [];
  const obj = parsed as AnyRecord;

  for (const key of candidateKeys) {
    const val = obj[key];
    if (Array.isArray(val)) {
      return val.filter(
        (item): item is AnyRecord => Boolean(item) && typeof item === 'object'
      );
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
  // Keep trailing N digits for long national/school IDs while preserving full uniqueness if <= 6
  return digitsOnly.length <= 6
    ? digitsOnly
    : digitsOnly.slice(-digitsCount);
}

/**
 * Parses student records from DMC / SchoolMIS / standard JSON formats.
 */
export function parseDmcStudentsJson(
  jsonInput: unknown,
  targetDigits: 4 | 5 | 6 = 4
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
      `${prefix}${prefix ? '' : ''}${firstName}${lastName ? ' ' + lastName : ''}`.trim();

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
      id: `stu_dmc_${Date.now()}_${idx}`,
      studentCode,
      fullName,
      className: normalizeThaiClassName(rawClass),
      numberInClass: Math.max(1, numberInClass),
      citizenId: citizenId || undefined,
      gender: gender || undefined,
      status: status || undefined,
      sourceSystem: 'dmc',
      createdAt: now,
    });
  });

  return parsed;
}

/**
 * Parses teacher & personnel records from HRMS / OBEC personnel JSON formats.
 */
export function parseHrmsTeachersJson(jsonInput: unknown): Teacher[] {
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

  rows.forEach((row, idx) => {
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
        'เลขที่ตำแหน่ง',
        'id',
      ]) || `T${String(idx + 1).padStart(3, '0')}`;

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
    const prefix = pickField(row, ['prefix', 'prename', 'title', 'คำนำหน้า']);
    const firstName = pickField(row, ['firstName', 'first_name', 'fname', 'ชื่อ']);
    const lastName = pickField(row, ['lastName', 'last_name', 'lname', 'นามสกุล']);
    const fullName =
      combinedName ||
      `${prefix}${firstName}${lastName ? ' ' + lastName : ''}`.trim();

    if (!fullName || fullName === '-' || seenCodes.has(teacherCode)) return;
    seenCodes.add(teacherCode);

    const position =
      pickField(row, ['position', 'rank', 'academic_rank', 'ตำแหน่ง', 'วิทยฐานะ']) ||
      'ครูผู้สอน';
    const department =
      pickField(row, [
        'department',
        'learning_area',
        'group_name',
        'faculty',
        'กลุ่มสาระ',
        'กลุ่มสาระการเรียนรู้',
        'ฝ่าย',
      ]) || 'ไม่ระบุกลุ่มสาระ';
    const rawHomeroom = pickField(row, [
      'homeroomClass',
      'homeroom',
      'advisor_class',
      'class_name',
      'ครูที่ปรึกษา',
      'ชั้นที่ปรึกษา',
    ]);

    parsed.push({
      id: `tch_hrms_${Date.now()}_${idx}`,
      teacherCode,
      fullName,
      position,
      department,
      homeroomClass: rawHomeroom ? normalizeThaiClassName(rawHomeroom) : undefined,
      citizenId:
        pickField(row, ['citizenId', 'citizen_id', 'pid', 'เลขบัตรประชาชน']) ||
        undefined,
      email: pickField(row, ['email', 'อีเมล']) || undefined,
      phone: pickField(row, ['phone', 'tel', 'mobile', 'เบอร์โทร']) || undefined,
      sourceSystem: 'hrms',
      createdAt: now,
    });
  });

  return parsed;
}

/**
 * Parses subject/course records from DMC / HRMS / SGS curriculum JSON formats.
 */
export function parseSubjectsJson(jsonInput: unknown): Subject[] {
  const rows = extractRecordsArray(jsonInput, [
    'subjects',
    'courses',
    'curriculum',
    'data',
    'records',
    'rows',
    'items',
  ]);

  const now = new Date().toISOString();
  const parsed: Subject[] = [];
  const seenCodes = new Set<string>();

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
    ]);

    if (!subjectName || seenCodes.has(subjectCode)) return;
    seenCodes.add(subjectCode);

    const learningArea =
      pickField(row, [
        'learningArea',
        'learning_area',
        'department',
        'group_name',
        'กลุ่มสาระ',
        'กลุ่มสาระการเรียนรู้',
      ]) || 'ไม่ระบุกลุ่มสาระ';

    const rawGrade =
      pickField(row, [
        'gradeLevel',
        'grade_level',
        'class_level',
        'level',
        'ระดับชั้น',
        'ชั้น',
      ]) || 'มัธยมศึกษาปีที่ 1';

    const creditStr = pickField(row, ['credits', 'credit', 'weight', 'unit', 'หน่วยกิต']);
    const credits = Math.max(0.5, Number.parseFloat(creditStr) || 1.0);

    parsed.push({
      id: `sub_${Date.now()}_${idx}`,
      subjectCode,
      subjectName,
      learningArea,
      gradeLevel: normalizeThaiClassName(rawGrade),
      credits,
      teacherCode:
        pickField(row, ['teacherCode', 'teacher_code', 'รหัสครูผู้สอน']) || undefined,
      teacherName:
        pickField(row, [
          'teacherName',
          'teacher_name',
          'instructor',
          'ครูผู้สอน',
          'ผู้สอน',
        ]) || undefined,
      sourceSystem: 'json',
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
  backup?: SystemBackupPayload;
  summaryText: string;
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
    const students = parseDmcStudentsJson(parsed, targetDigits);
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
    const teachers = parseHrmsTeachersJson(parsed);
    return {
      detectedType: 'hrms_teachers',
      students: [],
      teachers,
      subjects: [],
      summaryText:
        teachers.length > 0
          ? `อ่านข้อมูลครู/บุคลากรรูปแบบ HRMS สำเร็จ ${teachers.length} คน`
          : 'ไม่พบข้อมูลครูในไฟล์ JSON',
    };
  }
  if (preferredHint === 'subjects') {
    const subjects = parseSubjectsJson(parsed);
    return {
      detectedType: 'subjects',
      students: [],
      teachers: [],
      subjects,
      summaryText:
        subjects.length > 0
          ? `อ่านข้อมูลรายวิชาสำเร็จ ${subjects.length} วิชา`
          : 'ไม่พบข้อมูลรายวิชาในไฟล์ JSON',
    };
  }

  // 3. Auto-detect multi-entity object (e.g. { students: [...], teachers: [...], subjects: [...] })
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const obj = parsed as AnyRecord;
    const hasStudents = Array.isArray(obj.students) || Array.isArray(obj.dmc);
    const hasTeachers =
      Array.isArray(obj.teachers) ||
      Array.isArray(obj.personnel) ||
      Array.isArray(obj.hrms);
    const hasSubjects = Array.isArray(obj.subjects) || Array.isArray(obj.courses);

    if (
      [hasStudents, hasTeachers, hasSubjects].filter(Boolean).length >= 2
    ) {
      const students = hasStudents
        ? parseDmcStudentsJson(obj.students ?? obj.dmc, targetDigits)
        : [];
      const teachers = hasTeachers
        ? parseHrmsTeachersJson(obj.teachers ?? obj.personnel ?? obj.hrms)
        : [];
      const subjects = hasSubjects
        ? parseSubjectsJson(obj.subjects ?? obj.courses)
        : [];
      return {
        detectedType: 'multi_entity',
        students,
        teachers,
        subjects,
        summaryText: `พบข้อมูลรวมหลายหมวด: นักเรียน ${students.length} · ครู ${teachers.length} · วิชา ${subjects.length}`,
      };
    }
  }

  // 4. Score-based array auto-detection
  const sampleRows = extractRecordsArray(parsed, [
    'data',
    'records',
    'rows',
    'items',
    'students',
    'teachers',
    'personnel',
    'subjects',
    'courses',
  ]);
  const firstKeys = sampleRows[0] ? Object.keys(sampleRows[0]).join(',').toLowerCase() : '';

  if (
    /subject_code|subjectcode|course_code|รหัสวิชา|ชื่อวิชา|subjectname|credits|หน่วยกิต/.test(
      firstKeys
    )
  ) {
    const subjects = parseSubjectsJson(parsed);
    return {
      detectedType: 'subjects',
      students: [],
      teachers: [],
      subjects,
      summaryText: `ตรวจพบข้อมูลรายวิชา ${subjects.length} รายการ`,
    };
  }

  if (
    /teachercode|teacher_code|emp_id|employee_id|staff_id|position|ตำแหน่ง|วิทยฐานะ|รหัสครู|department|homeroom/.test(
      firstKeys
    )
  ) {
    const teachers = parseHrmsTeachersJson(parsed);
    return {
      detectedType: 'hrms_teachers',
      students: [],
      teachers,
      subjects: [],
      summaryText: `ตรวจพบข้อมูลครู/บุคลากร (HRMS) ${teachers.length} รายการ`,
    };
  }

  const students = parseDmcStudentsJson(parsed, targetDigits);
  if (students.length > 0) {
    return {
      detectedType: 'dmc_students',
      students,
      teachers: [],
      subjects: [],
      summaryText: `ตรวจพบข้อมูลนักเรียน (DMC) ${students.length} รายการ`,
    };
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
