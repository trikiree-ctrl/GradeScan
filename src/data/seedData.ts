import type {
  ChoiceOption,
  Quiz,
  ScannedSheet,
  Student,
  Subject,
  Teacher,
} from '../types/omr';
import { gradeResponse } from '../utils/omrAnalytics';

export const SEED_STUDENTS: Student[] = [
  { id: 'stu_1001', studentCode: '1001', fullName: 'เด็กชายกิตติพงศ์ วัฒนา', className: 'มัธยมศึกษาปีที่ 1/1', numberInClass: 1, sourceSystem: 'dmc', createdAt: '2026-10-01T08:00:00Z' },
  { id: 'stu_1002', studentCode: '1002', fullName: 'เด็กหญิงชนากานต์ ศรีสุข', className: 'มัธยมศึกษาปีที่ 1/1', numberInClass: 2, sourceSystem: 'dmc', createdAt: '2026-10-01T08:00:00Z' },
  { id: 'stu_1003', studentCode: '1003', fullName: 'เด็กชายณัฐวุฒิ แสงทอง', className: 'มัธยมศึกษาปีที่ 1/1', numberInClass: 3, sourceSystem: 'dmc', createdAt: '2026-10-01T08:00:00Z' },
  { id: 'stu_1004', studentCode: '1004', fullName: 'เด็กหญิงธัญญารัตน์ อินทร์แก้ว', className: 'มัธยมศึกษาปีที่ 1/1', numberInClass: 4, sourceSystem: 'dmc', createdAt: '2026-10-01T08:00:00Z' },
  { id: 'stu_1005', studentCode: '1005', fullName: 'เด็กชายปวริศร์ ใจมั่น', className: 'มัธยมศึกษาปีที่ 1/1', numberInClass: 5, sourceSystem: 'dmc', createdAt: '2026-10-01T08:00:00Z' },
  { id: 'stu_1006', studentCode: '1006', fullName: 'เด็กหญิงพิมพ์ชนก บุญมา', className: 'มัธยมศึกษาปีที่ 1/1', numberInClass: 6, sourceSystem: 'dmc', createdAt: '2026-10-01T08:00:00Z' },
  { id: 'stu_1007', studentCode: '1007', fullName: 'เด็กชายภานุพงศ์ วงศ์ใหญ่', className: 'มัธยมศึกษาปีที่ 1/1', numberInClass: 7, sourceSystem: 'dmc', createdAt: '2026-10-01T08:00:00Z' },
  { id: 'stu_1008', studentCode: '1008', fullName: 'เด็กหญิงมณีรัตน์ พูลสวัสดิ์', className: 'มัธยมศึกษาปีที่ 1/1', numberInClass: 8, sourceSystem: 'dmc', createdAt: '2026-10-01T08:00:00Z' },
  { id: 'stu_1009', studentCode: '1009', fullName: 'เด็กชายวรากร รุ่งเรือง', className: 'มัธยมศึกษาปีที่ 1/1', numberInClass: 9, sourceSystem: 'dmc', createdAt: '2026-10-01T08:00:00Z' },
  { id: 'stu_1010', studentCode: '1010', fullName: 'เด็กหญิงสุพิชชา คงคา', className: 'มัธยมศึกษาปีที่ 1/1', numberInClass: 10, sourceSystem: 'dmc', createdAt: '2026-10-01T08:00:00Z' },
  { id: 'stu_1011', studentCode: '1011', fullName: 'เด็กชายอนันตชัย แก้วมณี', className: 'มัธยมศึกษาปีที่ 1/2', numberInClass: 1, sourceSystem: 'dmc', createdAt: '2026-10-01T08:00:00Z' },
  { id: 'stu_1012', studentCode: '1012', fullName: 'เด็กหญิงอริสา ทองดี', className: 'มัธยมศึกษาปีที่ 1/2', numberInClass: 2, sourceSystem: 'dmc', createdAt: '2026-10-01T08:00:00Z' },
  { id: 'stu_1013', studentCode: '1013', fullName: 'เด็กชายเอกพล สุขเจริญ', className: 'มัธยมศึกษาปีที่ 1/2', numberInClass: 3, sourceSystem: 'dmc', createdAt: '2026-10-01T08:00:00Z' },
  { id: 'stu_1014', studentCode: '1014', fullName: 'เด็กหญิงกนกวรรณ ชัยชนะ', className: 'มัธยมศึกษาปีที่ 1/2', numberInClass: 4, sourceSystem: 'dmc', createdAt: '2026-10-01T08:00:00Z' },
];

export const SEED_TEACHERS: Teacher[] = [
  { id: 'tch_101', teacherCode: 'T101', fullName: 'นายวรพจน์ ศรีมงคล', position: 'ครูชำนาญการพิเศษ', department: 'วิทยาศาสตร์และเทคโนโลยี', homeroomClass: 'มัธยมศึกษาปีที่ 1/1', email: 'worapoj@school.ac.th', sourceSystem: 'hrms', createdAt: '2026-10-01T08:00:00Z' },
  { id: 'tch_102', teacherCode: 'T102', fullName: 'นางสาวณัฐธิดา ปัญญาดี', position: 'ครูชำนาญการ', department: 'คณิตศาสตร์', homeroomClass: 'มัธยมศึกษาปีที่ 1/2', email: 'natthida@school.ac.th', sourceSystem: 'hrms', createdAt: '2026-10-01T08:00:00Z' },
  { id: 'tch_103', teacherCode: 'T103', fullName: 'นายธนากร สุขสันต์', position: 'ครูผู้ช่วย', department: 'ภาษาไทย', email: 'thanakorn@school.ac.th', sourceSystem: 'hrms', createdAt: '2026-10-01T08:00:00Z' },
];

export const SEED_SUBJECTS: Subject[] = [
  { id: 'sub_sci', subjectCode: 'ว21101', subjectName: 'วิทยาศาสตร์พื้นฐาน 1', learningArea: 'วิทยาศาสตร์และเทคโนโลยี', gradeLevel: 'มัธยมศึกษาปีที่ 1', credits: 1.5, teacherCode: 'T101', teacherName: 'นายวรพจน์ ศรีมงคล', sourceSystem: 'dmc', createdAt: '2026-10-01T08:00:00Z' },
  { id: 'sub_math', subjectCode: 'ค21201', subjectName: 'คณิตศาสตร์เพิ่มเติม 1', learningArea: 'คณิตศาสตร์', gradeLevel: 'มัธยมศึกษาปีที่ 1', credits: 1.0, teacherCode: 'T102', teacherName: 'นางสาวณัฐธิดา ปัญญาดี', sourceSystem: 'dmc', createdAt: '2026-10-01T08:00:00Z' },
  { id: 'sub_thai', subjectCode: 'ท21101', subjectName: 'ภาษาไทย 1', learningArea: 'ภาษาไทย', gradeLevel: 'มัธยมศึกษาปีที่ 1', credits: 1.5, teacherCode: 'T103', teacherName: 'นายธนากร สุขสันต์', sourceSystem: 'dmc', createdAt: '2026-10-01T08:00:00Z' },
];

const sciKey: Record<number, ChoiceOption> = {
  1: 'B', 2: 'C', 3: 'A', 4: 'D', 5: 'B',
  6: 'A', 7: 'D', 8: 'C', 9: 'B', 10: 'A',
  11: 'C', 12: 'D', 13: 'B', 14: 'A', 15: 'C',
  16: 'D', 17: 'B', 18: 'A', 19: 'C', 20: 'D',
};

const mathKey: Record<number, ChoiceOption> = {};
const opts4: ChoiceOption[] = ['A', 'B', 'C', 'D'];
for (let q = 1; q <= 50; q++) {
  mathKey[q] = opts4[(q * 7 + 1) % 4];
}

export const SEED_QUIZZES: Quiz[] = [
  {
    id: 'quiz_sci_m1',
    title: 'แบบทดสอบกลางภาค วิทยาศาสตร์พื้นฐาน',
    subject: 'วิทยาศาสตร์',
    className: 'มัธยมศึกษาปีที่ 1/1',
    questionCount: 20,
    choiceCount: 4,
    pointsPerQuestion: 1,
    answerKey: sciKey,
    createdAt: '2026-11-01T09:00:00Z',
    updatedAt: '2026-11-10T10:30:00Z',
  },
  {
    id: 'quiz_math_m1',
    title: 'ประเมินผลปลายภาค คณิตศาสตร์เพิ่มเติม',
    subject: 'คณิตศาสตร์',
    className: 'มัธยมศึกษาปีที่ 1/2',
    questionCount: 50,
    choiceCount: 4,
    pointsPerQuestion: 2,
    answerKey: mathKey,
    createdAt: '2026-11-05T09:00:00Z',
    updatedAt: '2026-11-12T14:00:00Z',
  },
];

function buildSeedScan(
  quiz: Quiz,
  student: Student,
  abilityRatio: number,
  seedOffset: number,
  minutesAgo: number
): ScannedSheet {
  const answers: Record<number, ChoiceOption | null> = {};
  const statuses: Record<number, 'filled' | 'blank' | 'multiple'> = {};
  const choices: ChoiceOption[] = ['A', 'B', 'C', 'D'];

  for (let q = 1; q <= quiz.questionCount; q++) {
    const key = quiz.answerKey[q];
    // Deterministic psychometric pattern so difficulty & discrimination vary realistically per question
    const itemDifficultyBias = ((q * 13 + 5) % 10) / 15; // 0 .. 0.6
    const studentSuccessProb = Math.min(0.96, Math.max(0.15, abilityRatio - itemDifficultyBias * 0.45));
    const pseudoRand = ((q * 37 + seedOffset * 19) % 100) / 100;

    if (q === 18 && seedOffset === 4) {
      answers[q] = null;
      statuses[q] = 'blank';
    } else if (q === 12 && seedOffset === 7) {
      answers[q] = null;
      statuses[q] = 'multiple';
    } else if (pseudoRand <= studentSuccessProb) {
      answers[q] = key;
      statuses[q] = 'filled';
    } else {
      const wrongChoices = choices.filter((c) => c !== key);
      answers[q] = wrongChoices[(q + seedOffset) % wrongChoices.length];
      statuses[q] = 'filled';
    }
  }

  const grade = gradeResponse(quiz, answers, statuses);
  const scannedDate = new Date(Date.now() - minutesAgo * 60_000).toISOString();

  return {
    id: `scan_${quiz.id}_${student.studentCode}`,
    quizId: quiz.id,
    studentId: student.id,
    detectedStudentCode: student.studentCode,
    studentName: student.fullName,
    className: student.className,
    answers,
    statuses,
    ...grade,
    scanSource: 'seed',
    scanDurationMs: 14 + (seedOffset % 9),
    scannedAt: scannedDate,
  };
}

const sciQuiz = SEED_QUIZZES[0];
const abilities = [0.95, 0.9, 0.85, 0.78, 0.72, 0.68, 0.6, 0.52, 0.45, 0.35];

export const SEED_SCANS: ScannedSheet[] = SEED_STUDENTS.slice(0, 10).map((stu, idx) =>
  buildSeedScan(sciQuiz, stu, abilities[idx], idx + 1, (idx + 1) * 18)
);
