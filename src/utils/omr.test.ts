import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeThaiClassName,
  isInvalidStudentRecord,
  parseStudentCsv,
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
