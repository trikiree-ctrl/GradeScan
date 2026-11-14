import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeThaiClassName,
  isInvalidStudentRecord,
  parseStudentCsv,
  exportScansToCsv,
} from './normalization';
import {
  gradeResponse,
  computeItemAnalysis,
  computeQuizSummary,
} from './omrAnalytics';
import {
  renderOmrPixelBuffer,
  scanOmrImageData,
  detectCornerMarkers,
  detectCornerMarkersDetailed,
  analyzeSheetAlignment,
  warpPerspectiveToCanonical,
  areCornersWellAligned,
  type PixelBuffer,
} from './omrEngine';
import * as XLSX from 'xlsx';
import {
  BAN_APHON_RAW_HRMS_ROWS,
  buildBanAphonTimetableSubjects,
} from './banAphonPreset';
import {
  parseDmcStudentsJson,
  parseHrmsTeachersJson,
  parseHrmsTeachersWithReport,
  parseSubjectsJson,
  autoDetectAndParseJsonImport,
  buildBanAphonFullImportResult,
  exportFullSystemBackupJson,
  exportPostScanScoresJson,
  SAMPLE_DMC_JSON,
  SAMPLE_HRMS_TEACHERS_JSON,
  SAMPLE_SUBJECTS_JSON,
} from './importExport';
import {
  inspectTextOrSpreadsheetImport,
  inspectWorkbookImport,
  parseExcelWorkbook,
} from './spreadsheetImport';
import {
  computeThaiGrade,
  DEFAULT_SYSTEM_SETTINGS,
  sanitizeSystemSettings,
} from './systemSettings';
import type { ChoiceOption, Quiz, ScannedSheet } from '../types/omr';

test('normalizeThaiClassName standardizes Thai primary and secondary shorthand', () => {
  assert.equal(normalizeThaiClassName('ป 1/1'), 'ประถมศึกษาปีที่ 1/1');
  assert.equal(normalizeThaiClassName('ชั้นประถมศึกษาปีที่ 4/2'), 'ประถมศึกษาปีที่ 4/2');
  assert.equal(normalizeThaiClassName('ม.2 / 3'), 'มัธยมศึกษาปีที่ 2/3');
  assert.equal(normalizeThaiClassName('มัธยม 6/1'), 'มัธยมศึกษาปีที่ 6/1');
  assert.equal(normalizeThaiClassName('   '), 'ไม่ระบุห้องเรียน');
});

test('isInvalidStudentRecord filters garbage entries and parses CSV cleanly', () => {
  assert.equal(isInvalidStudentRecord('1001', '*'), true);
  assert.equal(isInvalidStudentRecord('abc', 'สมชาย ใจดี'), true);
  assert.equal(isInvalidStudentRecord('1001', 'สมชาย ใจดี'), false);

  const parsed = parseStudentCsv(
    'รหัส,ชื่อ,ห้อง\n1001,เด็กชายกิตติ,ม.1/1\n1002,*,ม.1/1\n1003,เด็กหญิงมานี,ป 6/2'
  );
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].className, 'มัธยมศึกษาปีที่ 1/1');
  assert.equal(parsed[1].className, 'ประถมศึกษาปีที่ 6/2');
});

test('gradeResponse and computeItemAnalysis compute accurate p, D, KR-20, and optional penalty', () => {
  const quiz: Quiz = {
    id: 'q1',
    title: 'Test Quiz',
    subject: 'Science',
    className: 'มัธยมศึกษาปีที่ 1/1',
    questionCount: 20,
    choiceCount: 4,
    pointsPerQuestion: 1,
    answerKey: Object.fromEntries(
      Array.from({ length: 20 }, (_, i) => [i + 1, 'A' as ChoiceOption])
    ),
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  const makeScan = (id: string, correctCount: number): ScannedSheet => {
    const answers: Record<number, ChoiceOption | null> = {};
    const statuses: Record<number, 'filled' | 'blank' | 'multiple'> = {};
    for (let q = 1; q <= 20; q++) {
      answers[q] = q <= correctCount ? 'A' : 'B';
      statuses[q] = 'filled';
    }
    const g = gradeResponse(quiz, answers, statuses);
    return {
      id,
      quizId: quiz.id,
      studentId: id,
      detectedStudentCode: id,
      studentName: `Student ${id}`,
      className: quiz.className,
      answers,
      statuses,
      ...g,
      scanSource: 'seed',
      scanDurationMs: 12,
      scannedAt: '2026-01-01T00:00:00Z',
    };
  };

  const scans = [
    makeScan('1001', 20),
    makeScan('1002', 18),
    makeScan('1003', 10),
    makeScan('1004', 4),
  ];

  const itemStats = computeItemAnalysis(quiz, scans);
  assert.equal(itemStats.length, 20);
  assert.equal(itemStats[0].difficultyIndex, 1);
  assert.equal(itemStats[14].difficultyIndex, 0.5);
  assert.equal(itemStats[14].discriminationIndex, 1);

  const summary = computeQuizSummary(quiz, scans, itemStats);
  assert.equal(summary.totalScanned, 4);
  assert.equal(summary.highestScore, 20);
  assert.equal(summary.lowestScore, 4);
  assert.equal(summary.averageScore, 13);

  // Verify wrongPenalty & custom passThresholdPct
  const penaltyQuiz: Quiz = { ...quiz, wrongPenalty: 0.25, passThresholdPct: 60 };
  const answersPenalty: Record<number, ChoiceOption | null> = {};
  const statusesPenalty: Record<number, 'filled' | 'blank' | 'multiple'> = {};
  for (let q = 1; q <= 20; q++) {
    answersPenalty[q] = q <= 12 ? 'A' : q <= 16 ? 'B' : null;
    statusesPenalty[q] = q <= 16 ? 'filled' : 'blank';
  }
  const penaltyGrade = gradeResponse(penaltyQuiz, answersPenalty, statusesPenalty);
  assert.equal(penaltyGrade.score, 11); // 12*1 - 4*0.25 = 11
  assert.equal(penaltyGrade.blankCount, 4);
});

test('OMR CV engine detects 4 corner markers and reads 20Q sheet with offset & rotation', () => {
  const answerKey: Record<number, ChoiceOption> = {};
  const studentAnswers: Record<number, ChoiceOption | ChoiceOption[] | null> = {};
  const choices: ChoiceOption[] = ['A', 'B', 'C', 'D'];

  for (let q = 1; q <= 20; q++) {
    answerKey[q] = choices[(q - 1) % 4];
    studentAnswers[q] = choices[(q - 1) % 4];
  }
  studentAnswers[5] = 'D';
  studentAnswers[10] = null;
  studentAnswers[15] = ['A', 'C'];

  const quiz: Quiz = {
    id: 'q-cv-20',
    title: 'CV Test 20Q',
    subject: 'Math',
    className: 'มัธยมศึกษาปีที่ 1/1',
    questionCount: 20,
    choiceCount: 4,
    pointsPerQuestion: 1,
    answerKey,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  const pixelBuffer = renderOmrPixelBuffer({
    width: 800,
    height: 1132,
    questionCount: 20,
    choiceCount: 4,
    studentCode: '1408',
    answers: studentAnswers,
    offsetX: 6,
    offsetY: -5,
    rotationRad: 0.015,
    noiseLevel: 6,
  });

  const corners = detectCornerMarkers(pixelBuffer);
  assert.ok(corners.tl.x > 25 && corners.tl.x < 80);
  assert.ok(corners.br.x > 720 && corners.br.x < 785);
  assert.equal(areCornersWellAligned(corners, 800, 1132), true);
  assert.equal(
    areCornersWellAligned(
      { tl: { x: 100, y: 100 }, tr: { x: 200, y: 100 }, bl: { x: 100, y: 200 }, br: { x: 200, y: 200 } },
      800,
      1132
    ),
    false
  );

  const result = scanOmrImageData(pixelBuffer, quiz);
  assert.equal(result.detectedStudentCode, '1408');
  assert.equal(result.statuses[5], 'filled');
  assert.equal(result.answers[5], 'D');
  assert.equal(result.statuses[10], 'blank');
  assert.equal(result.statuses[15], 'multiple');
  assert.equal(result.correctCount, 17);
  assert.equal(result.score, 17);
  assert.equal(result.blankCount, 1);
  assert.equal(result.multipleCount, 1);
});

test('OMR CV engine accurately grades 50-question 5-choice sheet', () => {
  const answerKey: Record<number, ChoiceOption> = {};
  const studentAnswers: Record<number, ChoiceOption> = {};
  const choices: ChoiceOption[] = ['A', 'B', 'C', 'D', 'E'];

  for (let q = 1; q <= 50; q++) {
    const pick = choices[(q * 3) % 5];
    answerKey[q] = pick;
    studentAnswers[q] = q <= 45 ? pick : choices[(q * 3 + 1) % 5];
  }

  const quiz: Quiz = {
    id: 'q-cv-50',
    title: 'CV Test 50Q',
    subject: 'Physics',
    className: 'มัธยมศึกษาปีที่ 4/1',
    questionCount: 50,
    choiceCount: 5,
    pointsPerQuestion: 2,
    answerKey,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  const pixelBuffer = renderOmrPixelBuffer({
    width: 800,
    height: 1132,
    questionCount: 50,
    choiceCount: 5,
    studentCode: '2509',
    answers: studentAnswers,
  });

  const result = scanOmrImageData(pixelBuffer, quiz);
  assert.equal(result.detectedStudentCode, '2509');
  assert.equal(result.correctCount, 45);
  assert.equal(result.score, 90);
  assert.equal(result.maxScore, 100);
});

test('Auto-alignment rejects empty camera backgrounds and rectifies tilted perspective sheets', () => {
  // 1. Blank dark frame must NOT lock corners
  const blankFrame: PixelBuffer = {
    width: 400,
    height: 566,
    data: new Uint8ClampedArray(400 * 566 * 4).fill(35),
  };
  const blankDet = detectCornerMarkersDetailed(blankFrame);
  assert.equal(blankDet.detectedCount, 0);
  const blankAlign = analyzeSheetAlignment(blankFrame);
  assert.equal(blankAlign.isReadyToAutoScan, false);
  assert.equal(blankAlign.detection.lightingStatus, 'too_dark');

  // 2. Tilted & perspective-warped 20Q sheet (-8 deg, 88% scale, trapezoid tilt) on dark desk
  const choices: ChoiceOption[] = ['A', 'B', 'C', 'D'];
  const key: Record<number, ChoiceOption> = {};
  for (let q = 1; q <= 20; q++) key[q] = choices[(q * 2) % 4];
  const quiz: Quiz = {
    id: 'q-persp',
    title: 'Perspective 20Q',
    subject: 'Sci',
    className: 'มัธยมศึกษาปีที่ 1/1',
    questionCount: 20,
    choiceCount: 4,
    pointsPerQuestion: 1,
    answerKey: key,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  const warpedBuf = renderOmrPixelBuffer({
    width: 800,
    height: 1132,
    questionCount: 20,
    choiceCount: 4,
    studentCode: '3729',
    answers: key,
    rotationRad: (-8 * Math.PI) / 180,
    scale: 0.82,
    perspectiveTiltY: 0.12,
    darkDeskBg: true,
    noiseLevel: 6,
  });

  const align = analyzeSheetAlignment(warpedBuf);
  assert.equal(align.detection.detectedCount, 4);
  assert.ok(align.tiltAngleDeg < -6 && align.tiltAngleDeg > -10, `Measured tilt=${align.tiltAngleDeg}`);
  assert.equal(align.isReadyToAutoScan, true);

  // Rectify back to upright canonical sheet and verify near-zero tilt & 100% score
  const rectified = warpPerspectiveToCanonical(warpedBuf, align.detection.corners, 800, 1132);
  const rectifiedScan = scanOmrImageData(rectified, quiz);
  assert.ok(Math.abs(rectifiedScan.alignment.tiltAngleDeg) < 1.2);
  assert.equal(rectifiedScan.detectedStudentCode, '3729');
  assert.equal(rectifiedScan.correctCount, 20);
  assert.equal(rectifiedScan.score, 20);
});

test('DMC & HRMS & Subject JSON importers parse Thai government/school formats cleanly', () => {
  const dmcStudents = parseDmcStudentsJson(JSON.parse(SAMPLE_DMC_JSON), 4);
  assert.equal(dmcStudents.length, 2);
  assert.equal(dmcStudents[0].studentCode, '1015');
  assert.equal(dmcStudents[0].fullName, 'เด็กชายธนกฤต รุ่งสว่าง');
  assert.equal(dmcStudents[0].className, 'มัธยมศึกษาปีที่ 1/1');
  assert.equal(dmcStudents[0].sourceSystem, 'dmc');

  // Auto-detect HRMS Teachers
  const hrmsResult = autoDetectAndParseJsonImport(SAMPLE_HRMS_TEACHERS_JSON);
  assert.equal(hrmsResult.detectedType, 'hrms_teachers');
  assert.equal(hrmsResult.teachers.length, 2);
  assert.equal(hrmsResult.teachers[0].teacherCode, 'T201');
  assert.equal(hrmsResult.teachers[0].homeroomClass, 'มัธยมศึกษาปีที่ 1/1');

  // Auto-detect Subjects
  const subResult = autoDetectAndParseJsonImport(SAMPLE_SUBJECTS_JSON);
  assert.equal(subResult.detectedType, 'subjects');
  assert.equal(subResult.subjects.length, 2);
  assert.equal(subResult.subjects[0].subjectCode, 'ว21101');
  assert.equal(subResult.subjects[0].credits, 1.5);

  // Combined multi-entity JSON package
  const combined = JSON.stringify({
    students: [{ student_id: '55012', prefix: 'เด็กหญิง', first_name: 'สุชาดา', last_name: 'ใจใส', grade: 'ป.6', room: '2' }],
    personnel: [{ emp_id: 'T901', ชื่อสกุล: 'นายประเสริฐ ดีงาม', ตำแหน่ง: 'ครู', กลุ่มสาระ: 'สังคมศึกษา' }],
    courses: [{ course_code: 'ส16101', course_name: 'สังคมศึกษา 6', grade_level: 'ป.6', credits: 1 }],
  });
  const multi = autoDetectAndParseJsonImport(combined, 'auto', 5);
  assert.equal(multi.detectedType, 'multi_entity');
  assert.equal(multi.students[0].studentCode, '55012');
  assert.equal(multi.students[0].className, 'ประถมศึกษาปีที่ 6/2');
  assert.equal(multi.teachers[0].teacherCode, 'T901');
  assert.equal(multi.subjects[0].subjectCode, 'ส16101');
});

test('Full system backup round-trip, Thai 8-tier grades, and post-scan exports work accurately', () => {
  assert.equal(computeThaiGrade(85), '4');
  assert.equal(computeThaiGrade(76), '3.5');
  assert.equal(computeThaiGrade(67), '2.5');
  assert.equal(computeThaiGrade(48), '0');

  const settings = sanitizeSystemSettings({
    schoolName: 'โรงเรียนทดสอบมาตรฐาน',
    studentIdDigits: 5,
    upperLowerGroupPct: 30,
  });
  assert.equal(settings.studentIdDigits, 5);
  assert.equal(settings.upperLowerGroupPct, 30);

  const students = parseDmcStudentsJson(JSON.parse(SAMPLE_DMC_JSON), 4);
  const teachers = parseHrmsTeachersJson(JSON.parse(SAMPLE_HRMS_TEACHERS_JSON));
  const subjects = parseSubjectsJson(JSON.parse(SAMPLE_SUBJECTS_JSON));
  const quiz: Quiz = {
    id: 'q-exp',
    title: 'Quiz Export',
    subject: 'วิทย์',
    className: 'มัธยมศึกษาปีที่ 1/1',
    questionCount: 20,
    choiceCount: 4,
    pointsPerQuestion: 1,
    answerKey: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i + 1, 'A' as ChoiceOption])),
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
  const scan: ScannedSheet = {
    id: 'sc1',
    quizId: quiz.id,
    studentId: students[0].id,
    detectedStudentCode: students[0].studentCode,
    studentName: students[0].fullName,
    className: students[0].className,
    answers: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i + 1, i < 16 ? ('A' as ChoiceOption) : ('B' as ChoiceOption)])),
    statuses: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i + 1, 'filled' as const])),
    score: 16,
    maxScore: 20,
    percentage: 80,
    correctCount: 16,
    incorrectCount: 4,
    blankCount: 0,
    multipleCount: 0,
    scanSource: 'simulation',
    scanDurationMs: 18,
    scannedAt: '2026-01-01T00:00:00Z',
  };

  const backupJson = exportFullSystemBackupJson({
    schoolName: settings.schoolName,
    students,
    teachers,
    subjects,
    quizzes: [quiz],
    scans: [scan],
    activeQuizId: quiz.id,
    settings,
  });
  const restored = autoDetectAndParseJsonImport(backupJson);
  assert.equal(restored.detectedType, 'backup');
  assert.equal(restored.backup?.students.length, 2);
  assert.equal(restored.backup?.teachers.length, 2);
  assert.equal(restored.backup?.subjects.length, 2);
  assert.equal(restored.backup?.scans.length, 1);

  const summary = computeQuizSummary(quiz, [scan]);
  const postJson = JSON.parse(exportPostScanScoresJson(quiz, [scan], students, summary, settings));
  assert.equal(postJson.results[0].thaiGrade, '4');
  assert.equal(postJson.results[0].databaseMatched, true);

  const csv = exportScansToCsv(quiz, [scan], { settings: DEFAULT_SYSTEM_SETTINGS, students });
  assert.ok(csv.includes('ตรงฐานข้อมูล'));
  assert.ok(csv.includes('ผ่าน'));
});

test('OMR CV engine supports configurable 5-digit and 6-digit student ID grids', () => {
  const key = Object.fromEntries(
    Array.from({ length: 20 }, (_, i) => [i + 1, (['A', 'B', 'C', 'D'] as ChoiceOption[])[i % 4]])
  );
  const quiz: Quiz = {
    id: 'q-6digit',
    title: '6 Digit ID Test',
    subject: 'Sci',
    className: 'มัธยมศึกษาปีที่ 1/1',
    questionCount: 20,
    choiceCount: 4,
    pointsPerQuestion: 1,
    answerKey: key,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  const buf5 = renderOmrPixelBuffer({
    width: 800,
    height: 1132,
    questionCount: 20,
    choiceCount: 4,
    studentIdDigits: 5,
    studentCode: '54321',
    answers: key,
  });
  const res5 = scanOmrImageData(buf5, quiz, { studentIdDigits: 5 });
  assert.equal(res5.detectedStudentCode, '54321');
  assert.equal(res5.correctCount, 20);

  const buf6 = renderOmrPixelBuffer({
    width: 800,
    height: 1132,
    questionCount: 20,
    choiceCount: 4,
    studentIdDigits: 6,
    studentCode: '650412',
    answers: key,
  });
  const res6 = scanOmrImageData(buf6, quiz, { studentIdDigits: 6 });
  assert.equal(res6.detectedStudentCode, '650412');
  assert.equal(res6.correctCount, 20);
});

test('Real OBEC HRMS parser extracts 18 Ban Aphon civil servants and skips vacant position 4854', () => {
  const report = parseHrmsTeachersWithReport(BAN_APHON_RAW_HRMS_ROWS);
  assert.equal(report.teachers.length, 18);
  assert.equal(report.skippedVacantCount, 1);
  assert.ok(report.skippedPositionNumbers[0].includes('4854'));
  assert.equal(
    report.teachers.some((t) => t.positionNumber === '4854' || t.teacherCode === '4854'),
    false
  );

  const director = report.teachers.find((t) => t.positionNumber === '8197');
  assert.ok(director);
  assert.equal(director.fullName, 'นางสาววรรณฤดี เพิ่มทรัพย์');
  assert.equal(director.position, 'ผู้อำนวยการสถานศึกษา');

  const adirek = report.teachers.find((t) => t.positionNumber === '8209');
  assert.ok(adirek);
  assert.equal(adirek.fullName, 'นายอดิเรก โพธิ์ธรรม');
  assert.equal(adirek.academicRank, 'คศ. 3');
  assert.equal(adirek.major, 'วิทยาศาสตร์ (ประถมศึกษา/ม.ต้น)');
  assert.equal(adirek.homeroomClass, 'มัธยมศึกษาปีที่ 1');
});

test('Ban Aphon preset and timetable subjects split per grade/room and teacher without collapsed ranges', () => {
  const timetableSubjects = buildBanAphonTimetableSubjects();
  assert.ok(timetableSubjects.length >= 120);
  assert.equal(
    timetableSubjects.some((s) => s.subjectName.includes('ป.5–ม.3') || s.subjectName.includes('ป.1–ม.3')),
    false
  );

  // Verify Science / Math in separate rooms keep separate teacher assignments and period counts
  const mathP51 = timetableSubjects.find(
    (s) => s.subjectName === 'คณิตศาสตร์' && s.gradeLevel === 'ประถมศึกษาปีที่ 5/1'
  );
  const mathP52 = timetableSubjects.find(
    (s) => s.subjectName === 'คณิตศาสตร์' && s.gradeLevel === 'ประถมศึกษาปีที่ 5/2'
  );
  assert.ok(mathP51 && mathP52);
  assert.equal(mathP51.teacherName, 'นายอดิเรก โพธิ์ธรรม');
  assert.equal(mathP51.periodsPerWeek, 4);
  assert.notEqual(mathP51.subjectCode, mathP52.subjectCode);

  const fullPreset = buildBanAphonFullImportResult();
  assert.equal(fullPreset.importResult.teachers.length, 20); // 18 HRMS + 2 timetable teachers
  assert.equal(fullPreset.skippedVacantCount, 1);
  assert.equal(fullPreset.schoolMeta.schoolCode, '1032650660');
  assert.equal(fullPreset.schoolMeta.schoolName, 'โรงเรียนบ้านอาโพน');
});

test('Excel (.xlsx) multi-sheet & banner-row parser imports HRMS, Subjects, and Students accurately', () => {
  const wb = XLSX.utils.book_new();

  // Sheet 1: HRMS with a Thai school banner row above the real header row + vacant row
  const hrmsMatrix = [
    ['บัญชีรายละเอียดข้าราชการครูและบุคลากรทางการศึกษา โรงเรียนบ้านอาโพน (1032650660)'],
    [],
    ['ตำแหน่งเลขที่', 'คำนำหน้าชื่อ', 'ชื่อ', 'นามสกุล', 'ชื่อตำแหน่ง', 'ระดับ/อันดับ', 'กลุ่มวิชาเอกตามมาตรฐานวิชาเอก', 'สถานะตำแหน่ง'],
    ['8209', 'นาย', 'อดิเรก', 'โพธิ์ธรรม', 'ครู', 'คศ. 3', 'วิทยาศาสตร์', 'มีคนถือครอง'],
    ['4854', '', '', '', 'ครู', '', '', 'ว่างรอเกลี่ย'],
    ['9329', 'นาง', 'ถาวร', 'สิงห์โตทอง', 'ครู', 'คศ. 2', 'คณิตศาสตร์', 'มีคนถือครอง'],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(hrmsMatrix), 'HRMS');

  // Sheet 2: Timetable subjects with duplicate base subject code across 2 rooms
  const subjectSheet = XLSX.utils.json_to_sheet([
    { รหัสวิชา: 'ค15101', ชื่อวิชา: 'คณิตศาสตร์', กลุ่มสาระการเรียนรู้: 'คณิตศาสตร์', ระดับชั้น: 'ป.5/1', 'คาบ/สัปดาห์': 4, หน่วยกิต: 1.0, ครูผู้สอน: 'นายอดิเรก โพธิ์ธรรม' },
    { รหัสวิชา: 'ค15101', ชื่อวิชา: 'คณิตศาสตร์', กลุ่มสาระการเรียนรู้: 'คณิตศาสตร์', ระดับชั้น: 'ป.5/2', 'คาบ/สัปดาห์': 4, หน่วยกิต: 1.0, ครูผู้สอน: 'นายอดิเรก โพธิ์ธรรม' },
  ]);
  XLSX.utils.book_append_sheet(wb, subjectSheet, 'Timetable');

  const outBuf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const parsedWb = parseExcelWorkbook(outBuf, 'ban_aphon.xlsx');
  assert.deepEqual(parsedWb.sheetNames, ['HRMS', 'Timetable']);

  const hrmsRes = inspectWorkbookImport(parsedWb, 'HRMS', 'auto', 4);
  assert.equal(hrmsRes.detectedType, 'hrms_teachers');
  assert.equal(hrmsRes.teachers.length, 2);
  assert.equal(hrmsRes.skippedVacantCount, 1);
  assert.equal(hrmsRes.teachers[0].academicRank, 'คศ. 3');

  const allRes = inspectWorkbookImport(parsedWb, '__ALL__', 'auto', 4);
  assert.equal(allRes.teachers.length, 2);
  assert.equal(allRes.subjects.length, 2);
  assert.equal(allRes.subjects[0].gradeLevel, 'ประถมศึกษาปีที่ 5/1');
  assert.equal(allRes.subjects[1].gradeLevel, 'ประถมศึกษาปีที่ 5/2');

  // Also test TSV paste from Excel for HRMS
  const tsvText =
    'ตำแหน่งเลขที่\tคำนำหน้าชื่อ\tชื่อ\tนามสกุล\tชื่อตำแหน่ง\tสถานะตำแหน่ง\n10012\tนางสาว\tนรีกานต์\tแก่นมั่น\tครู\tมีคนถือครอง\n4854\t\t\t\tครู\tว่างรอเกลี่ย';
  const tsvRes = inspectTextOrSpreadsheetImport(tsvText, 'auto', 4);
  assert.equal(tsvRes.detectedType, 'hrms_teachers');
  assert.equal(tsvRes.teachers.length, 1);
  assert.equal(tsvRes.teachers[0].fullName, 'นางสาวนรีกานต์ แก่นมั่น');
  assert.equal(tsvRes.skippedVacantCount, 1);
});

