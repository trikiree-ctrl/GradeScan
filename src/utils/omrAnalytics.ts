import {
  CHOICE_OPTIONS,
  type BubbleReadStatus,
  type ChoiceOption,
  type ItemAnalysisStat,
  type ItemQualityLevel,
  type Quiz,
  type QuizSummaryStats,
  type ScannedSheet,
} from '../types/omr';

export interface GradeComputation {
  score: number;
  maxScore: number;
  percentage: number;
  correctCount: number;
  incorrectCount: number;
  blankCount: number;
  multipleCount: number;
}

export function gradeResponse(
  quiz: Quiz,
  answers: Record<number, ChoiceOption | null>,
  statuses: Record<number, BubbleReadStatus>
): GradeComputation {
  let correctCount = 0;
  let incorrectCount = 0;
  let blankCount = 0;
  let multipleCount = 0;
  let wrongMarkedCount = 0;

  for (let q = 1; q <= quiz.questionCount; q++) {
    const status = statuses[q] ?? (answers[q] ? 'filled' : 'blank');
    const selected = answers[q] ?? null;
    const key = quiz.answerKey[q];

    if (status === 'multiple') {
      multipleCount++;
      incorrectCount++;
      wrongMarkedCount++;
    } else if (status === 'blank' || !selected) {
      blankCount++;
      incorrectCount++;
    } else if (selected === key) {
      correctCount++;
    } else {
      incorrectCount++;
      wrongMarkedCount++;
    }
  }

  const maxScore = quiz.questionCount * quiz.pointsPerQuestion;
  const penalty = Math.max(0, quiz.wrongPenalty ?? 0);
  const rawScore =
    correctCount * quiz.pointsPerQuestion - wrongMarkedCount * penalty;
  const score = Math.max(0, Math.round(rawScore * 100) / 100);
  const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;

  return {
    score,
    maxScore,
    percentage,
    correctCount,
    incorrectCount,
    blankCount,
    multipleCount,
  };
}

export function classifyItemQuality(p: number, d: number): ItemQualityLevel {
  if (p > 0.85) return 'ง่ายเกินไป';
  if (p < 0.2) return 'ยากเกินไป';
  if (d >= 0.4 && p >= 0.25 && p <= 0.8) return 'ดีมาก';
  if (d >= 0.2) return 'เหมาะสม';
  return 'ควรปรับปรุง';
}

export function computeItemAnalysis(quiz: Quiz, scans: ScannedSheet[]): ItemAnalysisStat[] {
  const n = scans.length;
  const sorted = [...scans].sort((a, b) => b.score - a.score);
  const groupSize = n >= 4 ? Math.max(1, Math.round(n * 0.27)) : 0;
  const upperGroup = groupSize > 0 ? sorted.slice(0, groupSize) : [];
  const lowerGroup = groupSize > 0 ? sorted.slice(n - groupSize) : [];

  const stats: ItemAnalysisStat[] = [];

  for (let q = 1; q <= quiz.questionCount; q++) {
    const correctChoice = quiz.answerKey[q] ?? 'A';
    const choiceDistribution: Record<ChoiceOption, number> = {
      A: 0,
      B: 0,
      C: 0,
      D: 0,
      E: 0,
    };

    let correctCount = 0;
    let blankCount = 0;
    let multipleCount = 0;

    for (const scan of scans) {
      const status = scan.statuses[q] ?? (scan.answers[q] ? 'filled' : 'blank');
      const choice = scan.answers[q];

      if (status === 'multiple') {
        multipleCount++;
      } else if (status === 'blank' || !choice) {
        blankCount++;
      } else {
        choiceDistribution[choice]++;
        if (choice === correctChoice) {
          correctCount++;
        }
      }
    }

    const difficultyIndex = n > 0 ? correctCount / n : 0;

    let discriminationIndex = 0;
    if (groupSize > 0) {
      const upperCorrect = upperGroup.filter(
        (s) => s.statuses[q] !== 'multiple' && s.answers[q] === correctChoice
      ).length;
      const lowerCorrect = lowerGroup.filter(
        (s) => s.statuses[q] !== 'multiple' && s.answers[q] === correctChoice
      ).length;
      discriminationIndex = (upperCorrect - lowerCorrect) / groupSize;
    }

    stats.push({
      questionNumber: q,
      correctChoice,
      totalAttempts: n,
      correctCount,
      difficultyIndex,
      discriminationIndex,
      qualityLabel: classifyItemQuality(difficultyIndex, discriminationIndex),
      choiceDistribution,
      blankCount,
      multipleCount,
    });
  }

  return stats;
}

export function computeQuizSummary(
  quiz: Quiz,
  scans: ScannedSheet[],
  itemStats?: ItemAnalysisStat[]
): QuizSummaryStats {
  const n = scans.length;
  if (n === 0) {
    return {
      totalScanned: 0,
      averageScore: 0,
      averagePercentage: 0,
      highestScore: 0,
      lowestScore: 0,
      medianScore: 0,
      standardDeviation: 0,
      passCount: 0,
      passRate: 0,
      kr20Reliability: null,
    };
  }

  const scores = scans.map((s) => s.score).sort((a, b) => a - b);
  const sum = scores.reduce((acc, v) => acc + v, 0);
  const mean = sum / n;
  const maxScore = quiz.questionCount * quiz.pointsPerQuestion;
  const averagePercentage = maxScore > 0 ? (mean / maxScore) * 100 : 0;
  const highestScore = scores[n - 1];
  const lowestScore = scores[0];
  const medianScore =
    n % 2 === 1 ? scores[(n - 1) / 2] : (scores[n / 2 - 1] + scores[n / 2]) / 2;

  const variance =
    scores.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / n;
  const standardDeviation = Math.sqrt(variance);

  const passThreshold = quiz.passThresholdPct ?? 50;
  const passCount = scans.filter((s) => s.percentage >= passThreshold).length;
  const passRate = (passCount / n) * 100;

  let kr20Reliability: number | null = null;
  const items = itemStats ?? computeItemAnalysis(quiz, scans);
  const k = quiz.questionCount;
  if (k > 1 && variance > 0 && n >= 3) {
    const pqSum = items.reduce((acc, item) => {
      const p = item.difficultyIndex;
      const q = 1 - p;
      return acc + p * q * Math.pow(quiz.pointsPerQuestion, 2);
    }, 0);
    const rawKr20 = (k / (k - 1)) * (1 - pqSum / variance);
    kr20Reliability = Math.max(-1, Math.min(1, rawKr20));
  }

  return {
    totalScanned: n,
    averageScore: mean,
    averagePercentage,
    highestScore,
    lowestScore,
    medianScore,
    standardDeviation,
    passCount,
    passRate,
    kr20Reliability,
  };
}

export function getActiveChoices(choiceCount: 4 | 5): ChoiceOption[] {
  return CHOICE_OPTIONS.slice(0, choiceCount);
}
