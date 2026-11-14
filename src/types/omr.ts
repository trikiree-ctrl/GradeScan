export type QuestionCount = 20 | 50 | 100;

export type ChoiceOption = 'A' | 'B' | 'C' | 'D' | 'E';

export const CHOICE_OPTIONS: ChoiceOption[] = ['A', 'B', 'C', 'D', 'E'];

export type AppView =
  | 'dashboard'
  | 'scanner'
  | 'quizzes'
  | 'sheets'
  | 'analysis'
  | 'classes'
  | 'guide';

export interface Student {
  id: string;
  studentCode: string; // 4-digit OMR ID e.g. "1001"
  fullName: string;
  className: string; // normalized e.g. "มัธยมศึกษาปีที่ 1/1"
  numberInClass: number;
  createdAt: string;
}

export interface Quiz {
  id: string;
  title: string;
  subject: string;
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
  passCount: number; // >= 50%
  passRate: number;
  kr20Reliability: number | null;
}

export interface HudState {
  active: boolean;
  label: string;
  status: 'running' | 'done' | 'error';
  benchmarkMs: number;
}
