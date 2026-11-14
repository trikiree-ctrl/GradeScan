export type QuestionCount = 20 | 50 | 100;

export type ChoiceOption = 'A' | 'B' | 'C' | 'D' | 'E';

export const CHOICE_OPTIONS: ChoiceOption[] = ['A', 'B', 'C', 'D', 'E'];

export type StudentIdDigits = 4 | 5 | 6;

export type AppView =
  | 'dashboard'
  | 'scanner'
  | 'quizzes'
  | 'sheets'
  | 'analysis'
  | 'classes'
  | 'settings'
  | 'guide';

export interface Student {
  id: string;
  studentCode: string; // 4-6 digit OMR ID e.g. "1001" or DMC code
  fullName: string;
  className: string; // normalized e.g. "มัธยมศึกษาปีที่ 1/1"
  numberInClass: number;
  citizenId?: string;
  gender?: string;
  status?: string;
  sourceSystem?: 'manual' | 'dmc' | 'csv' | 'json';
  createdAt: string;
}

export interface Teacher {
  id: string;
  teacherCode: string; // HRMS / Employee / Position ID
  fullName: string;
  position: string;
  department: string; // กลุ่มสาระการเรียนรู้ / กลุ่มวิชาเอก
  homeroomClass?: string;
  positionNumber?: string; // ตำแหน่งเลขที่ (HRMS)
  payrollId?: string; // เลขที่จ่ายตรง (HRMS)
  academicRank?: string; // ระดับ/อันดับ เช่น คศ. 1, คศ. 2, คศ. 3, ครูผู้ช่วย
  major?: string; // กลุ่มวิชาเอกตามมาตรฐานวิชาเอก
  positionStatus?: string; // สถานะตำแหน่ง เช่น มีคนถือครอง
  schoolCode?: string;
  schoolName?: string;
  citizenId?: string;
  email?: string;
  phone?: string;
  sourceSystem?: 'manual' | 'hrms' | 'csv' | 'xlsx' | 'json';
  createdAt: string;
}

export interface Subject {
  id: string;
  subjectCode: string; // e.g. "ว21101"
  subjectName: string;
  learningArea: string;
  gradeLevel: string;
  credits: number;
  periodsPerWeek?: number; // จำนวนคาบ/สัปดาห์ตามตารางสอน
  teacherCode?: string;
  teacherName?: string;
  sourceSystem?: 'manual' | 'dmc' | 'hrms' | 'csv' | 'xlsx' | 'json';
  createdAt: string;
}

export interface ThaiGradeCutoffs {
  g4: number; // >= 80
  g35: number; // >= 75
  g3: number; // >= 70
  g25: number; // >= 65
  g2: number; // >= 60
  g15: number; // >= 55
  g1: number; // >= 50
}

export interface SystemSettings {
  // Stage 1: School & Printable Sheet Configuration
  schoolName: string;
  academicYear: string;
  semester: '1' | '2' | 'summer';
  studentIdDigits: StudentIdDigits;
  defaultQuestionCount: QuestionCount;
  defaultChoiceCount: 4 | 5;

  // Stage 2: Camera & OMR CV Engine
  bubbleFillThreshold: number; // 0.18..0.45 (default 0.28)
  multiMarkGapThreshold: number; // 0.06..0.25 (default 0.14)
  maxTiltAngleDeg: number; // 3..15 (default 10.5)
  autoRectifyPerspective: boolean;
  autoCaptureCamera: boolean;
  autoAdvanceStudent: boolean;
  soundEnabled: boolean;

  // Stage 3: Grading, Psychometrics & 8-Tier Scale
  defaultPassThresholdPct: number;
  defaultWrongPenalty: number;
  upperLowerGroupPct: number; // 25..33 (default 27)
  useThai8GradeScale: boolean;
  gradeCutoffs: ThaiGradeCutoffs;

  // Stage 4: Database Verification & Export
  strictStudentDatabaseMatch: boolean;
  preventDuplicateStudentScan: boolean;
  csvIncludeItemBreakdown: boolean;
  csvIncludeGradeLevel: boolean;
}

export interface Quiz {
  id: string;
  title: string;
  subject: string;
  subjectCode?: string;
  className: string;
  questionCount: QuestionCount;
  choiceCount: 4 | 5;
  pointsPerQuestion: number;
  wrongPenalty?: number; // optional penalty deducted per wrong answer (default 0)
  passThresholdPct?: number; // pass threshold percentage (default 50)
  answerKey: Record<number, ChoiceOption>; // 1-based index -> ChoiceOption
  createdAt: string;
  updatedAt: string;
}

export type BubbleReadStatus = 'filled' | 'blank' | 'multiple';

export interface QuestionScanDetail {
  questionNumber: number;
  detectedChoice: ChoiceOption | null;
  status: BubbleReadStatus;
  confidence: number; // 0..1
  isCorrect: boolean;
  correctChoice: ChoiceOption;
  bubbleDarkness: Record<ChoiceOption, number>; // 0..1 normalized darkness
}

export interface ScannedSheet {
  id: string;
  quizId: string;
  studentId: string | null;
  detectedStudentCode: string;
  studentName: string;
  className: string;
  answers: Record<number, ChoiceOption | null>;
  statuses: Record<number, BubbleReadStatus>;
  score: number;
  maxScore: number;
  percentage: number;
  correctCount: number;
  incorrectCount: number;
  blankCount: number;
  multipleCount: number;
  scanSource: 'camera' | 'upload' | 'simulation' | 'seed';
  scanDurationMs: number;
  scannedAt: string;
  measuredAngleDeg?: number;
  perspectiveSkewPct?: number;
  alignmentQualityPct?: number;
  previewDataUrl?: string;
}

export type ItemQualityLevel = 'ดีมาก' | 'เหมาะสม' | 'ควรปรับปรุง' | 'ง่ายเกินไป' | 'ยากเกินไป';

export interface ItemAnalysisStat {
  questionNumber: number;
  correctChoice: ChoiceOption;
  totalAttempts: number;
  correctCount: number;
  difficultyIndex: number; // p: 0..1
  discriminationIndex: number; // D: -1..1 (Upper 27% - Lower 27%)
  qualityLabel: ItemQualityLevel;
  choiceDistribution: Record<ChoiceOption, number>;
  blankCount: number;
  multipleCount: number;
}

export interface QuizSummaryStats {
  totalScanned: number;
  averageScore: number;
  averagePercentage: number;
  highestScore: number;
  lowestScore: number;
  medianScore: number;
  standardDeviation: number;
  passCount: number; // >= passThresholdPct
  passRate: number;
  kr20Reliability: number | null;
}

export interface HudState {
  active: boolean;
  label: string;
  status: 'running' | 'done' | 'error';
  benchmarkMs: number;
}

export interface SystemBackupPayload {
  schema: 'gradescan-backup-v2';
  exportedAt: string;
  schoolName: string;
  students: Student[];
  teachers: Teacher[];
  subjects: Subject[];
  quizzes: Quiz[];
  scans: ScannedSheet[];
  activeQuizId: string;
  settings: SystemSettings;
}
