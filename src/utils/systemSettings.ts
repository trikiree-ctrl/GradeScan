import type { SystemSettings, ThaiGradeCutoffs } from '../types/omr';

export const DEFAULT_GRADE_CUTOFFS: ThaiGradeCutoffs = {
  g4: 80,
  g35: 75,
  g3: 70,
  g25: 65,
  g2: 60,
  g15: 55,
  g1: 50,
};

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  schoolName: 'โรงเรียนสาธิตมาตรฐานสากล · GradeScan OMR',
  academicYear: '2569',
  semester: '1',
  studentIdDigits: 4,
  defaultQuestionCount: 20,
  defaultChoiceCount: 4,

  bubbleFillThreshold: 0.28,
  multiMarkGapThreshold: 0.14,
  maxTiltAngleDeg: 10.5,
  autoRectifyPerspective: true,
  autoCaptureCamera: true,
  autoAdvanceStudent: true,
  soundEnabled: true,

  defaultPassThresholdPct: 50,
  defaultWrongPenalty: 0,
  upperLowerGroupPct: 27,
  useThai8GradeScale: true,
  gradeCutoffs: { ...DEFAULT_GRADE_CUTOFFS },

  strictStudentDatabaseMatch: true,
  preventDuplicateStudentScan: false,
  csvIncludeItemBreakdown: true,
  csvIncludeGradeLevel: true,
};

export function sanitizeSystemSettings(
  raw?: Partial<SystemSettings> | null
): SystemSettings {
  if (!raw || typeof raw !== 'object') {
    return {
      ...DEFAULT_SYSTEM_SETTINGS,
      gradeCutoffs: { ...DEFAULT_GRADE_CUTOFFS },
    };
  }

  const clamp = (val: unknown, fallback: number, min: number, max: number) => {
    const n = typeof val === 'number' ? val : Number(val);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  };

  const rawCutoffs = raw.gradeCutoffs ?? ({} as Partial<ThaiGradeCutoffs>);
  const gradeCutoffs: ThaiGradeCutoffs = {
    g4: clamp(rawCutoffs.g4, 80, 50, 99),
    g35: clamp(rawCutoffs.g35, 75, 45, 95),
    g3: clamp(rawCutoffs.g3, 70, 40, 90),
    g25: clamp(rawCutoffs.g25, 65, 35, 85),
    g2: clamp(rawCutoffs.g2, 60, 30, 80),
    g15: clamp(rawCutoffs.g15, 55, 25, 75),
    g1: clamp(rawCutoffs.g1, 50, 10, 70),
  };

  const digits = raw.studentIdDigits;
  const studentIdDigits = digits === 5 || digits === 6 ? digits : 4;

  const qCount = raw.defaultQuestionCount;
  const defaultQuestionCount = qCount === 50 || qCount === 100 ? qCount : 20;

  const cCount = raw.defaultChoiceCount;
  const defaultChoiceCount = cCount === 5 ? 5 : 4;

  const semester =
    raw.semester === '2' || raw.semester === 'summer' ? raw.semester : '1';

  return {
    schoolName:
      typeof raw.schoolName === 'string' && raw.schoolName.trim()
        ? raw.schoolName.trim()
        : DEFAULT_SYSTEM_SETTINGS.schoolName,
    academicYear:
      typeof raw.academicYear === 'string' && raw.academicYear.trim()
        ? raw.academicYear.trim()
        : DEFAULT_SYSTEM_SETTINGS.academicYear,
    semester,
    studentIdDigits,
    defaultQuestionCount,
    defaultChoiceCount,

    bubbleFillThreshold: clamp(raw.bubbleFillThreshold, 0.28, 0.16, 0.48),
    multiMarkGapThreshold: clamp(raw.multiMarkGapThreshold, 0.14, 0.05, 0.28),
    maxTiltAngleDeg: clamp(raw.maxTiltAngleDeg, 10.5, 3, 15),
    autoRectifyPerspective:
      typeof raw.autoRectifyPerspective === 'boolean'
        ? raw.autoRectifyPerspective
        : true,
    autoCaptureCamera:
      typeof raw.autoCaptureCamera === 'boolean' ? raw.autoCaptureCamera : true,
    autoAdvanceStudent:
      typeof raw.autoAdvanceStudent === 'boolean' ? raw.autoAdvanceStudent : true,
    soundEnabled:
      typeof raw.soundEnabled === 'boolean' ? raw.soundEnabled : true,

    defaultPassThresholdPct: clamp(raw.defaultPassThresholdPct, 50, 10, 100),
    defaultWrongPenalty: clamp(raw.defaultWrongPenalty, 0, 0, 5),
    upperLowerGroupPct: clamp(raw.upperLowerGroupPct, 27, 20, 35),
    useThai8GradeScale:
      typeof raw.useThai8GradeScale === 'boolean' ? raw.useThai8GradeScale : true,
    gradeCutoffs,

    strictStudentDatabaseMatch:
      typeof raw.strictStudentDatabaseMatch === 'boolean'
        ? raw.strictStudentDatabaseMatch
        : true,
    preventDuplicateStudentScan:
      typeof raw.preventDuplicateStudentScan === 'boolean'
        ? raw.preventDuplicateStudentScan
        : false,
    csvIncludeItemBreakdown:
      typeof raw.csvIncludeItemBreakdown === 'boolean'
        ? raw.csvIncludeItemBreakdown
        : true,
    csvIncludeGradeLevel:
      typeof raw.csvIncludeGradeLevel === 'boolean'
        ? raw.csvIncludeGradeLevel
        : true,
  };
}

/**
 * Computes Thai 8-tier academic grade (4, 3.5, 3, 2.5, 2, 1.5, 1, 0) from percentage score.
 */
export function computeThaiGrade(
  percentage: number,
  cutoffs: ThaiGradeCutoffs = DEFAULT_GRADE_CUTOFFS
): string {
  const pct = Number.isFinite(percentage) ? percentage : 0;
  if (pct >= cutoffs.g4) return '4';
  if (pct >= cutoffs.g35) return '3.5';
  if (pct >= cutoffs.g3) return '3';
  if (pct >= cutoffs.g25) return '2.5';
  if (pct >= cutoffs.g2) return '2';
  if (pct >= cutoffs.g15) return '1.5';
  if (pct >= cutoffs.g1) return '1';
  return '0';
}
