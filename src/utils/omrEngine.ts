import {
  CHOICE_OPTIONS,
  type BubbleReadStatus,
  type ChoiceOption,
  type QuestionCount,
  type QuestionScanDetail,
  type Quiz,
  type StudentIdDigits,
} from '../types/omr';
import { gradeResponse } from './omrAnalytics';

export interface OmrScanOptions {
  studentIdDigits?: StudentIdDigits;
  bubbleFillThreshold?: number;
  multiMarkGapThreshold?: number;
  maxTiltAngleDeg?: number;
}

export interface PixelBuffer {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface Point2D {
  x: number;
  y: number;
}

export interface CornerMarkers {
  tl: Point2D;
  tr: Point2D;
  bl: Point2D;
  br: Point2D;
}

export type CornerKey = keyof CornerMarkers;

export type LightingStatus = 'good' | 'too_dark' | 'glare';

export interface CornerDetectionResult {
  corners: CornerMarkers;
  detected: Record<CornerKey, boolean>;
  scores: Record<CornerKey, number>;
  detectedCount: number;
  avgBrightness: number;
  lightingStatus: LightingStatus;
}

export interface SheetAlignmentAnalysis {
  detection: CornerDetectionResult;
  tiltAngleDeg: number; // positive = clockwise tilt
  isLevel: boolean; // |tiltAngleDeg| <= 4.0°
  perspectiveSkewPct: number; // trapezoidal distortion percentage
  aspectRatioErrorPct: number; // deviation from A4 1.415
  coveragePct: number; // fraction of frame occupied by sheet (0..100)
  alignmentQualityPct: number; // 0..100 readiness score
  isReadyToAutoScan: boolean;
  guidanceTh: string;
}

export interface BubbleCoord {
  u: number; // canonical horizontal 0..1
  v: number; // canonical vertical 0..1
  rU: number; // normalized radius relative to width
}

export interface OmrLayoutSpec {
  questionCount: QuestionCount;
  choiceCount: 4 | 5;
  markerMarginX: number; // canonical center of TL/TR/BL/BR markers
  markerMarginY: number;
  markerSizeU: number;
  markerSizeV: number;
  studentIdDigits: number; // 4 digits
  idBubbles: BubbleCoord[][]; // [digitCol 0..3][digit 0..9]
  questionBubbles: Array<{
    questionNumber: number;
    choices: Record<ChoiceOption, BubbleCoord>;
  }>;
}

export interface OmrScanResult {
  corners: CornerMarkers;
  alignment: SheetAlignmentAnalysis;
  detectedStudentCode: string;
  studentIdConfidence: number;
  answers: Record<number, ChoiceOption | null>;
  statuses: Record<number, BubbleReadStatus>;
  details: QuestionScanDetail[];
  score: number;
  maxScore: number;
  percentage: number;
  correctCount: number;
  incorrectCount: number;
  blankCount: number;
  multipleCount: number;
  benchmarkMs: number;
}

export type HomographyMatrix = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number
];

const MARKER_MARGIN_X = 0.06;
const MARKER_MARGIN_Y = 0.05;
const MARKER_SIZE_U = 0.034;
const MARKER_SIZE_V = 0.024;

/**
 * Generates deterministic normalized [0..1] geometry for 20, 50, or 100 question sheets.
 * Sheet aspect ratio baseline is A4 portrait (~1 : 1.415, e.g., 800 x 1132).
 */
export function getOmrLayoutSpec(
  questionCount: QuestionCount,
  choiceCount: 4 | 5 = 4,
  studentIdDigits: StudentIdDigits = 4
): OmrLayoutSpec {
  const idBubbles: BubbleCoord[][] = [];
  const idStartU =
    studentIdDigits === 4 ? 0.61 : studentIdDigits === 5 ? 0.595 : 0.585;
  const idStepU =
    studentIdDigits === 4 ? 0.054 : studentIdDigits === 5 ? 0.048 : 0.043;
  const idRadiusU = studentIdDigits === 6 ? 0.0112 : 0.012;
  const idStartV = 0.105;
  const idStepV = 0.0155;

  for (let col = 0; col < studentIdDigits; col++) {
    const colBubbles: BubbleCoord[] = [];
    for (let digit = 0; digit <= 9; digit++) {
      colBubbles.push({
        u: idStartU + col * idStepU,
        v: idStartV + digit * idStepV,
        rU: idRadiusU,
      });
    }
    idBubbles.push(colBubbles);
  }

  const gridTopV = 0.305;
  const gridBottomV = 0.905;

  let columns = 2;
  let rowsPerCol = 10;
  if (questionCount === 20) {
    columns = 2;
    rowsPerCol = 10;
  } else if (questionCount === 50) {
    columns = 2;
    rowsPerCol = 25;
  } else {
    columns = 4;
    rowsPerCol = 25;
  }

  const leftMarginU = columns === 4 ? 0.095 : 0.13;
  const rightMarginU = 0.91;
  const totalWidthU = rightMarginU - leftMarginU;
  const colWidthU = totalWidthU / columns;
  const choiceSpanU = colWidthU * (columns === 4 ? 0.62 : 0.56);
  const choiceStartOffsetU = colWidthU * 0.24;
  const choiceStepU = choiceSpanU / Math.max(1, choiceCount - 1);
  const bubbleRadiusU =
    columns === 4 ? 0.0105 : questionCount === 50 ? 0.0115 : 0.0155;

  const usableHeightV = gridBottomV - gridTopV;
  const rowStepV = usableHeightV / Math.max(1, rowsPerCol - 1);

  const questionBubbles: OmrLayoutSpec['questionBubbles'] = [];

  for (let q = 1; q <= questionCount; q++) {
    const colIndex = Math.floor((q - 1) / rowsPerCol);
    const rowIndex = (q - 1) % rowsPerCol;
    const baseU = leftMarginU + colIndex * colWidthU + choiceStartOffsetU;
    const v = gridTopV + rowIndex * rowStepV;

    const choices = {} as Record<ChoiceOption, BubbleCoord>;
    for (let c = 0; c < choiceCount; c++) {
      const opt = CHOICE_OPTIONS[c];
      choices[opt] = {
        u: baseU + c * choiceStepU,
        v,
        rU: bubbleRadiusU,
      };
    }

    questionBubbles.push({
      questionNumber: q,
      choices,
    });
  }

  return {
    questionCount,
    choiceCount,
    markerMarginX: MARKER_MARGIN_X,
    markerMarginY: MARKER_MARGIN_Y,
    markerSizeU: MARKER_SIZE_U,
    markerSizeV: MARKER_SIZE_V,
    studentIdDigits,
    idBubbles,
    questionBubbles,
  };
}

/**
 * Solves a 4-point 2D projective homography mapping source points -> destination points.
 * Uses Gaussian elimination with partial pivoting on an 8x8 linear system.
 */
export function computeHomographyMatrix(
  src: [Point2D, Point2D, Point2D, Point2D],
  dst: [Point2D, Point2D, Point2D, Point2D]
): HomographyMatrix | null {
  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const { x: u, y: v } = src[i];
    const { x, y } = dst[i];
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
    b.push(x);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
    b.push(y);
  }

  const n = 8;
  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let maxVal = Math.abs(A[col][col]);
    for (let r = col + 1; r < n; r++) {
      const val = Math.abs(A[r][col]);
      if (val > maxVal) {
        maxVal = val;
        pivotRow = r;
      }
    }
    if (maxVal < 1e-9) return null;

    if (pivotRow !== col) {
      [A[col], A[pivotRow]] = [A[pivotRow], A[col]];
      [b[col], b[pivotRow]] = [b[pivotRow], b[col]];
    }

    const pivot = A[col][col];
    for (let j = col; j < n; j++) A[col][j] /= pivot;
    b[col] /= pivot;

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = A[r][col];
      if (factor === 0) continue;
      for (let j = col; j < n; j++) {
        A[r][j] -= factor * A[col][j];
      }
      b[r] -= factor * b[col];
    }
  }

  return [b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7], 1];
}

export function applyHomography(H: HomographyMatrix, u: number, v: number): Point2D {
  const w = H[6] * u + H[7] * v + H[8];
  if (Math.abs(w) < 1e-8) return { x: 0, y: 0 };
  return {
    x: (H[0] * u + H[1] * v + H[2]) / w,
    y: (H[3] * u + H[4] * v + H[5]) / w,
  };
}

export function buildCanonicalToImageHomography(
  corners: CornerMarkers
): HomographyMatrix | null {
  return computeHomographyMatrix(
    [
      { x: MARKER_MARGIN_X, y: MARKER_MARGIN_Y },
      { x: 1 - MARKER_MARGIN_X, y: MARKER_MARGIN_Y },
      { x: MARKER_MARGIN_X, y: 1 - MARKER_MARGIN_Y },
      { x: 1 - MARKER_MARGIN_X, y: 1 - MARKER_MARGIN_Y },
    ],
    [corners.tl, corners.tr, corners.bl, corners.br]
  );
}

/**
 * Maps canonical [0..1] sheet coordinate to image pixel coordinates using projective homography
 * (falling back to bilinear interpolation if corners are degenerate).
 */
export function mapCanonicalToImage(
  u: number,
  v: number,
  corners: CornerMarkers,
  cachedHomography?: HomographyMatrix | null
): Point2D {
  const H =
    cachedHomography === undefined
      ? buildCanonicalToImageHomography(corners)
      : cachedHomography;
  if (H) {
    return applyHomography(H, u, v);
  }

  const alpha = (u - MARKER_MARGIN_X) / (1 - 2 * MARKER_MARGIN_X);
  const beta = (v - MARKER_MARGIN_Y) / (1 - 2 * MARKER_MARGIN_Y);

  return {
    x:
      (1 - alpha) * (1 - beta) * corners.tl.x +
      alpha * (1 - beta) * corners.tr.x +
      (1 - alpha) * beta * corners.bl.x +
      alpha * beta * corners.br.x,
    y:
      (1 - alpha) * (1 - beta) * corners.tl.y +
      alpha * (1 - beta) * corners.tr.y +
      (1 - alpha) * beta * corners.bl.y +
      alpha * beta * corners.br.y,
  };
}

/**
 * Warps a tilted/perspective-distorted image back into an upright canonical PixelBuffer
 * using bilinear pixel resampling through the projective homography.
 */
export function warpPerspectiveToCanonical(
  image: PixelBuffer,
  corners: CornerMarkers,
  outWidth = 800,
  outHeight = 1132
): PixelBuffer {
  const H = buildCanonicalToImageHomography(corners);
  const out = new Uint8ClampedArray(outWidth * outHeight * 4);
  const { width, height, data } = image;

  for (let y = 0; y < outHeight; y++) {
    const v = (y + 0.5) / outHeight;
    for (let x = 0; x < outWidth; x++) {
      const u = (x + 0.5) / outWidth;
      const srcPt = mapCanonicalToImage(u, v, corners, H);

      const sx = srcPt.x;
      const sy = srcPt.y;
      const dstIdx = (y * outWidth + x) * 4;

      if (sx < 0 || sx >= width - 1 || sy < 0 || sy >= height - 1) {
        out[dstIdx] = 250;
        out[dstIdx + 1] = 250;
        out[dstIdx + 2] = 250;
        out[dstIdx + 3] = 255;
        continue;
      }

      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const fx = sx - x0;
      const fy = sy - y0;

      const i00 = (y0 * width + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + width * 4;
      const i11 = i01 + 4;

      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;

      out[dstIdx] = Math.round(
        data[i00] * w00 + data[i10] * w10 + data[i01] * w01 + data[i11] * w11
      );
      out[dstIdx + 1] = Math.round(
        data[i00 + 1] * w00 +
          data[i10 + 1] * w10 +
          data[i01 + 1] * w01 +
          data[i11 + 1] * w11
      );
      out[dstIdx + 2] = Math.round(
        data[i00 + 2] * w00 +
          data[i10 + 2] * w10 +
          data[i01 + 2] * w01 +
          data[i11 + 2] * w11
      );
      out[dstIdx + 3] = 255;
    }
  }

  return { width: outWidth, height: outHeight, data: out };
}

/**
 * Multi-scale 4-corner solid square fiducial marker detector using Integral Image box scoring.
 * Reports exact `found` status and confidence score per corner (zero false-positive fallback locks).
 */
export function detectCornerMarkersDetailed(
  image: PixelBuffer
): CornerDetectionResult {
  const { width, height, data } = image;

  // Estimate global sheet/scene luminance
  let globalSum = 0;
  let globalBrightSum = 0;
  let globalCount = 0;
  let glarePixels = 0;
  const step = Math.max(4, Math.floor((width * height) / 4000));
  for (let p = 0; p < width * height; p += step) {
    const idx = p * 4;
    const g = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    globalSum += g;
    if (g > 252) glarePixels++;
    if (g > 140) globalBrightSum += g;
    globalCount++;
  }
  const avgBrightness = globalCount > 0 ? globalSum / globalCount : 200;
  const glareRatio = globalCount > 0 ? glarePixels / globalCount : 0;
  const lightingStatus: LightingStatus =
    avgBrightness < 68 ? 'too_dark' : glareRatio > 0.72 && avgBrightness > 246 ? 'glare' : 'good';

  const findBestCornerInRegion = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    fallback: Point2D,
    cornerKey: CornerKey
  ): { point: Point2D; found: boolean; score: number } => {
    const rw = Math.max(1, x1 - x0);
    const rh = Math.max(1, y1 - y0);

    const lum = new Uint8Array(rw * rh);
    let maxBrightSum = 0;
    let brightSamples = 0;
    let regionSum = 0;
    let regionCount = 0;

    for (let y = 0; y < rh; y++) {
      const iy = y0 + y;
      for (let x = 0; x < rw; x++) {
        const ix = x0 + x;
        const idx = (iy * width + ix) * 4;
        const g = Math.round(
          0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]
        );
        lum[y * rw + x] = g;
        if ((x + y) % 5 === 0) {
          regionSum += g;
          regionCount++;
          if (g > 130) {
            maxBrightSum += g;
            brightSamples++;
          }
        }
      }
    }

    const avgRegion = regionCount > 0 ? regionSum / regionCount : 180;
    const paperRef = brightSamples >= 15 ? maxBrightSum / brightSamples : avgRegion;
    // Need meaningful paper brightness contrast to recognize a black square on paper
    if (paperRef < 85) {
      return { point: fallback, found: false, score: 0 };
    }
    const darkThreshold = Math.min(140, Math.max(55, paperRef * 0.54));

    const stride = rw + 1;
    const integral = new Int32Array((rw + 1) * (rh + 1));
    for (let y = 1; y <= rh; y++) {
      let rowSum = 0;
      const srcRow = (y - 1) * rw;
      const dstRow = y * stride;
      const prevRow = (y - 1) * stride;
      for (let x = 1; x <= rw; x++) {
        const isDark = lum[srcRow + x - 1] < darkThreshold ? 1 : 0;
        rowSum += isDark;
        integral[dstRow + x] = integral[prevRow + x] + rowSum;
      }
    }

    const boxSum = (bx0: number, by0: number, bx1: number, by1: number): number => {
      const cx0 = Math.max(0, bx0);
      const cy0 = Math.max(0, by0);
      const cx1 = Math.min(rw, bx1);
      const cy1 = Math.min(rh, by1);
      if (cx1 <= cx0 || cy1 <= cy0) return 0;
      return (
        integral[cy1 * stride + cx1] -
        integral[cy0 * stride + cx1] -
        integral[cy1 * stride + cx0] +
        integral[cy0 * stride + cx0]
      );
    };

    const targetCornerX = cornerKey === 'tl' || cornerKey === 'bl' ? 0 : rw;
    const targetCornerY = cornerKey === 'tl' || cornerKey === 'tr' ? 0 : rh;
    const maxDiag = Math.hypot(rw, rh) || 1;

    // Multi-scale search supports holding paper closer or farther from camera
    const scales = [1.0, 0.78, 1.22];
    let bestScore = -Infinity;
    let bestCx = fallback.x;
    let bestCy = fallback.y;
    let bestBoxW = Math.max(10, Math.round(width * MARKER_SIZE_U * 0.96));
    let bestBoxH = Math.max(10, Math.round(height * MARKER_SIZE_V * 0.96));

    for (const s of scales) {
      const boxW = Math.max(9, Math.round(width * MARKER_SIZE_U * 0.96 * s));
      const boxH = Math.max(9, Math.round(height * MARKER_SIZE_V * 0.96 * s));
      const margin = Math.max(4, Math.round(boxW * 0.3));
      const subW = Math.max(2, Math.round(boxW * 0.28));
      const subH = Math.max(2, Math.round(boxH * 0.28));
      if (rw <= boxW + 4 || rh <= boxH + 4) continue;

      for (let y = 2; y <= rh - boxH - 2; y += 2) {
        for (let x = 2; x <= rw - boxW - 2; x += 2) {
          const innerArea = boxW * boxH;
          const innerDark = boxSum(x, y, x + boxW, y + boxH);
          const fillRatio = innerDark / innerArea;
          if (fillRatio < 0.78) continue;

          // Verify squareness: solid square markers have dark corners inside the box,
          // whereas circular answer bubbles have bright/empty corners.
          const subArea = subW * subH;
          const cTL = boxSum(x, y, x + subW, y + subH) / subArea;
          const cTR = boxSum(x + boxW - subW, y, x + boxW, y + subH) / subArea;
          const cBL = boxSum(x, y + boxH - subH, x + subW, y + boxH) / subArea;
          const cBR = boxSum(x + boxW - subW, y + boxH - subH, x + boxW, y + boxH) / subArea;
          if (Math.min(cTL, cTR, cBL, cBR) < 0.5) continue;

          const ox0 = Math.max(0, x - margin);
          const oy0 = Math.max(0, y - margin);
          const ox1 = Math.min(rw, x + boxW + margin);
          const oy1 = Math.min(rh, y + boxH + margin);
          const outerDark = boxSum(ox0, oy0, ox1, oy1);
          const ringArea = (ox1 - ox0) * (oy1 - oy0) - innerArea;
          const ringDark = outerDark - innerDark;
          const ringDarkRatio = ringArea > 0 ? ringDark / ringArea : 1;
          if (ringDarkRatio > 0.35) continue;

          const distToCorner = Math.hypot(
            x + boxW / 2 - targetCornerX,
            y + boxH / 2 - targetCornerY
          );
          const cornerProximityBonus = (1 - distToCorner / maxDiag) * 0.25;
          const scalePreference = s === 1.0 ? 0.04 : 0;

          const score =
            fillRatio * 1.5 -
            ringDarkRatio * 1.3 +
            cornerProximityBonus +
            scalePreference;
          if (score > bestScore) {
            bestScore = score;
            bestCx = x0 + x + boxW / 2;
            bestCy = y0 + y + boxH / 2;
            bestBoxW = boxW;
            bestBoxH = boxH;
          }
        }
      }
    }

    // Require strong contrast & clean ring score to prevent false locks on random clutter
    if (bestScore < 0.95) {
      return { point: fallback, found: false, score: Math.max(0, bestScore) };
    }

    const halfWinW = Math.round(bestBoxW * 0.72);
    const halfWinH = Math.round(bestBoxH * 0.72);
    const rx0 = Math.max(0, Math.round(bestCx - x0 - halfWinW));
    const ry0 = Math.max(0, Math.round(bestCy - y0 - halfWinH));
    const rx1 = Math.min(rw - 1, Math.round(bestCx - x0 + halfWinW));
    const ry1 = Math.min(rh - 1, Math.round(bestCy - y0 + halfWinH));

    let sumX = 0;
    let sumY = 0;
    let count = 0;
    for (let y = ry0; y <= ry1; y++) {
      for (let x = rx0; x <= rx1; x++) {
        if (lum[y * rw + x] < darkThreshold) {
          sumX += x0 + x;
          sumY += y0 + y;
          count++;
        }
      }
    }

    const point =
      count > 10 ? { x: sumX / count, y: sumY / count } : { x: bestCx, y: bestCy };
    return {
      point,
      found: true,
      score: Math.min(1, bestScore / 1.7),
    };
  };

  const qW = Math.round(width * 0.3);
  const qH = Math.round(height * 0.26);

  const tlRes = findBestCornerInRegion(
    0,
    0,
    qW,
    qH,
    { x: width * MARKER_MARGIN_X, y: height * MARKER_MARGIN_Y },
    'tl'
  );
  const trRes = findBestCornerInRegion(
    width - qW,
    0,
    width,
    qH,
    { x: width * (1 - MARKER_MARGIN_X), y: height * MARKER_MARGIN_Y },
    'tr'
  );
  const blRes = findBestCornerInRegion(
    0,
    height - qH,
    qW,
    height,
    { x: width * MARKER_MARGIN_X, y: height * (1 - MARKER_MARGIN_Y) },
    'bl'
  );
  const brRes = findBestCornerInRegion(
    width - qW,
    height - qH,
    width,
    height,
    { x: width * (1 - MARKER_MARGIN_X), y: height * (1 - MARKER_MARGIN_Y) },
    'br'
  );

  const detected = {
    tl: tlRes.found,
    tr: trRes.found,
    bl: blRes.found,
    br: brRes.found,
  };
  const detectedCount =
    (detected.tl ? 1 : 0) +
    (detected.tr ? 1 : 0) +
    (detected.bl ? 1 : 0) +
    (detected.br ? 1 : 0);

  return {
    corners: {
      tl: tlRes.point,
      tr: trRes.point,
      bl: blRes.point,
      br: brRes.point,
    },
    detected,
    scores: {
      tl: tlRes.score,
      tr: trRes.score,
      bl: blRes.score,
      br: brRes.score,
    },
    detectedCount,
    avgBrightness,
    lightingStatus,
  };
}

export function detectCornerMarkers(image: PixelBuffer): CornerMarkers {
  return detectCornerMarkersDetailed(image).corners;
}

/**
 * Computes exact live angle, trapezoidal skew, coverage, lighting, and auto-capture readiness
 * from a camera or uploaded image buffer.
 */
export function analyzeSheetAlignment(
  image: PixelBuffer,
  options?: Pick<OmrScanOptions, 'maxTiltAngleDeg'>
): SheetAlignmentAnalysis {
  const detection = detectCornerMarkersDetailed(image);
  const { corners, detectedCount, lightingStatus } = detection;
  const { width, height } = image;
  const maxTiltDeg = options?.maxTiltAngleDeg ?? 10.5;

  const topDx = corners.tr.x - corners.tl.x;
  const topDy = corners.tr.y - corners.tl.y;
  const botDx = corners.br.x - corners.bl.x;
  const botDy = corners.br.y - corners.bl.y;

  const topWidth = Math.hypot(topDx, topDy);
  const bottomWidth = Math.hypot(botDx, botDy);
  const leftHeight = Math.hypot(
    corners.bl.x - corners.tl.x,
    corners.bl.y - corners.tl.y
  );
  const rightHeight = Math.hypot(
    corners.br.x - corners.tr.x,
    corners.br.y - corners.tr.y
  );

  const topAngle = Math.atan2(topDy, topDx);
  const botAngle = Math.atan2(botDy, botDx);
  const tiltAngleDeg = ((topAngle + botAngle) / 2) * (180 / Math.PI);
  const isLevel = Math.abs(tiltAngleDeg) <= 4.0;

  const widthBalance =
    Math.max(topWidth, bottomWidth) > 0
      ? Math.min(topWidth, bottomWidth) / Math.max(topWidth, bottomWidth)
      : 0;
  const heightBalance =
    Math.max(leftHeight, rightHeight) > 0
      ? Math.min(leftHeight, rightHeight) / Math.max(leftHeight, rightHeight)
      : 0;
  const perspectiveSkewPct = Math.round(
    (1 - Math.min(widthBalance, heightBalance)) * 100
  );

  const avgW = (topWidth + bottomWidth) / 2;
  const avgH = (leftHeight + rightHeight) / 2;
  const expectedMarkerRatio =
    (1 - 2 * MARKER_MARGIN_Y) / (1 - 2 * MARKER_MARGIN_X) * 1.415; // ~1.447 in px
  const actualRatio = avgW > 0 ? avgH / avgW : 0;
  const aspectRatioErrorPct =
    expectedMarkerRatio > 0
      ? Math.round(
          (Math.abs(actualRatio - expectedMarkerRatio) / expectedMarkerRatio) *
            100
        )
      : 100;

  // Approximate polygon area / frame area
  const polyArea = avgW * avgH;
  const canonicalFrameSpan = (1 - 2 * MARKER_MARGIN_X) * (1 - 2 * MARKER_MARGIN_Y);
  const estSheetArea = polyArea / canonicalFrameSpan;
  const coveragePct = Math.min(
    100,
    Math.max(0, Math.round((estSheetArea / Math.max(1, width * height)) * 100))
  );

  const allFourFound = detectedCount === 4;
  const sizeOk =
    topWidth >= width * 0.48 &&
    bottomWidth >= width * 0.48 &&
    leftHeight >= height * 0.48 &&
    rightHeight >= height * 0.48;
  const angleOk = Math.abs(tiltAngleDeg) <= maxTiltDeg;
  const skewOk = perspectiveSkewPct <= 18 && aspectRatioErrorPct <= 24;
  const lightOk = lightingStatus === 'good';

  const isReadyToAutoScan = allFourFound && sizeOk && angleOk && skewOk && lightOk;

  // Composite readiness score (0..100)
  const cornerScore = (detectedCount / 4) * 45;
  const angleScore = Math.max(0, 1 - Math.abs(tiltAngleDeg) / 16) * 25;
  const skewScore = Math.max(0, 1 - perspectiveSkewPct / 30) * 20;
  const sizeScore = sizeOk ? 10 : Math.min(10, (coveragePct / 45) * 10);
  const alignmentQualityPct = Math.round(
    Math.min(100, cornerScore + angleScore + skewScore + sizeScore)
  );

  let guidanceTh = '';
  if (lightingStatus === 'too_dark') {
    guidanceTh = 'แสงสว่างน้อยเกินไป กรุณาเพิ่มแสงหรือขยับพ้นเงา';
  } else if (!allFourFound) {
    guidanceTh = `นำกระดาษคำตอบเข้ากรอบให้เห็นจุดดำทั้ง 4 มุม (พบ ${detectedCount}/4 มุม)`;
  } else if (!sizeOk) {
    guidanceTh = 'ขยับกล้องเข้าใกล้กระดาษอีกเล็กน้อยให้เต็มกรอบ';
  } else if (!angleOk) {
    const dir = tiltAngleDeg > 0 ? 'หมุนทวนเข็มนาฬิกา' : 'หมุนตามเข็มนาฬิกา';
    guidanceTh = `กระดาษเอียง ${tiltAngleDeg > 0 ? '+' : ''}${tiltAngleDeg.toFixed(1)}° กรุณา${dir}ให้ตรงแนว`;
  } else if (!skewOk) {
    guidanceTh = `ถือกล้องให้ขนานกับแผ่นกระดาษ (ความบิดเบี้ยว ${perspectiveSkewPct}%)`;
  } else {
    guidanceTh = `ล็อกมุมตรงสมบูรณ์ (${tiltAngleDeg >= 0 ? '+' : ''}${tiltAngleDeg.toFixed(1)}°) · กำลังสแกนอัตโนมัติ`;
  }

  return {
    detection,
    tiltAngleDeg,
    isLevel,
    perspectiveSkewPct,
    aspectRatioErrorPct,
    coveragePct,
    alignmentQualityPct,
    isReadyToAutoScan,
    guidanceTh,
  };
}

/**
 * Samples average inner darkness [0..1] of a circular bubble at (cx, cy) with pixel radius rPx.
 */
function sampleBubbleDarkness(
  image: PixelBuffer,
  cx: number,
  cy: number,
  rPx: number
): number {
  const { width, height, data } = image;
  const innerR = Math.max(2, rPx * 0.62);
  const outerMinR = rPx * 1.35;
  const outerMaxR = rPx * 1.85;

  const minX = Math.max(0, Math.floor(cx - outerMaxR));
  const maxX = Math.min(width - 1, Math.ceil(cx + outerMaxR));
  const minY = Math.max(0, Math.floor(cy - outerMaxR));
  const maxY = Math.min(height - 1, Math.ceil(cy + outerMaxR));

  let innerSum = 0;
  let innerCount = 0;
  let paperSum = 0;
  let paperCount = 0;

  const innerR2 = innerR * innerR;
  const outerMinR2 = outerMinR * outerMinR;
  const outerMaxR2 = outerMaxR * outerMaxR;

  for (let y = minY; y <= maxY; y++) {
    const dy = y - cy;
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx;
      const d2 = dx * dx + dy * dy;
      const idx = (y * width + x) * 4;
      const lum =
        0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];

      if (d2 <= innerR2) {
        innerSum += lum;
        innerCount++;
      } else if (d2 >= outerMinR2 && d2 <= outerMaxR2 && lum > 110) {
        paperSum += lum;
        paperCount++;
      }
    }
  }

  if (innerCount === 0) return 0;
  const innerLum = innerSum / innerCount;
  const localPaperLum = paperCount >= 8 ? paperSum / paperCount : 245;
  const darkness = (localPaperLum - innerLum) / Math.max(80, localPaperLum);
  return Math.max(0, Math.min(1, darkness));
}

/**
 * Full Computer-Vision OMR Scanner: detects 4 fiducial corners, measures angle & alignment,
 * applies projective homography to sample local perspective-adjusted bubbles, grades, and benchmarks.
 */
export function scanOmrImageData(
  image: PixelBuffer,
  quiz: Quiz,
  options?: OmrScanOptions
): OmrScanResult {
  const t0 = performance.now();
  const idDigits: StudentIdDigits = options?.studentIdDigits ?? 4;
  const spec = getOmrLayoutSpec(quiz.questionCount, quiz.choiceCount, idDigits);
  const alignment = analyzeSheetAlignment(image, options);
  const corners = alignment.detection.corners;
  const H = buildCanonicalToImageHomography(corners);

  const localRadiusPx = (u: number, v: number, rU: number): number => {
    const p0 = mapCanonicalToImage(u, v, corners, H);
    const p1 = mapCanonicalToImage(u + rU, v, corners, H);
    return Math.max(3, Math.hypot(p1.x - p0.x, p1.y - p0.y));
  };

  // 1. Read 4-digit Student ID
  let detectedStudentCode = '';
  let idConfSum = 0;
  for (let col = 0; col < spec.studentIdDigits; col++) {
    let bestDigit = 0;
    let bestDark = -1;
    let secondDark = -1;

    for (let d = 0; d <= 9; d++) {
      const coord = spec.idBubbles[col][d];
      const pt = mapCanonicalToImage(coord.u, coord.v, corners, H);
      const dark = sampleBubbleDarkness(
        image,
        pt.x,
        pt.y,
        localRadiusPx(coord.u, coord.v, coord.rU)
      );
      if (dark > bestDark) {
        secondDark = bestDark;
        bestDark = dark;
        bestDigit = d;
      } else if (dark > secondDark) {
        secondDark = dark;
      }
    }

    if (bestDark >= 0.24) {
      detectedStudentCode += String(bestDigit);
      idConfSum += Math.min(1, Math.max(0.2, bestDark - Math.max(0, secondDark)));
    } else {
      detectedStudentCode += '0';
    }
  }

  // 2. Read Question Bubbles
  const answers: Record<number, ChoiceOption | null> = {};
  const statuses: Record<number, BubbleReadStatus> = {};
  const details: QuestionScanDetail[] = [];

  const activeChoices = CHOICE_OPTIONS.slice(0, quiz.choiceCount);

  for (const qItem of spec.questionBubbles) {
    const bubbleDarkness: Record<ChoiceOption, number> = {
      A: 0,
      B: 0,
      C: 0,
      D: 0,
      E: 0,
    };

    for (const opt of activeChoices) {
      const coord = qItem.choices[opt];
      const pt = mapCanonicalToImage(coord.u, coord.v, corners, H);
      bubbleDarkness[opt] = sampleBubbleDarkness(
        image,
        pt.x,
        pt.y,
        localRadiusPx(coord.u, coord.v, coord.rU)
      );
    }

    const sorted = activeChoices
      .map((opt) => ({ opt, val: bubbleDarkness[opt] }))
      .sort((a, b) => b.val - a.val);

    const top = sorted[0];
    const second = sorted[1];

    const MIN_FILL_DARKNESS = options?.bubbleFillThreshold ?? 0.28;
    const MULTI_MARK_FLOOR = Math.max(0.18, MIN_FILL_DARKNESS - 0.01);
    const MULTI_MARK_GAP = options?.multiMarkGapThreshold ?? 0.14;

    let detectedChoice: ChoiceOption | null = null;
    let status: BubbleReadStatus = 'blank';
    let confidence = 1;

    if (top.val < MIN_FILL_DARKNESS) {
      status = 'blank';
      detectedChoice = null;
      confidence = Math.max(0.5, 1 - top.val / MIN_FILL_DARKNESS);
    } else if (
      second &&
      second.val >= MULTI_MARK_FLOOR &&
      top.val - second.val < MULTI_MARK_GAP
    ) {
      status = 'multiple';
      detectedChoice = null;
      confidence = 0.35;
    } else {
      status = 'filled';
      detectedChoice = top.opt;
      confidence = Math.min(1, (top.val - (second?.val ?? 0)) * 1.4 + 0.35);
    }

    const correctChoice = quiz.answerKey[qItem.questionNumber] ?? 'A';
    const isCorrect = status === 'filled' && detectedChoice === correctChoice;

    answers[qItem.questionNumber] = detectedChoice;
    statuses[qItem.questionNumber] = status;
    details.push({
      questionNumber: qItem.questionNumber,
      detectedChoice,
      status,
      confidence,
      isCorrect,
      correctChoice,
      bubbleDarkness,
    });
  }

  const grade = gradeResponse(quiz, answers, statuses);
  const benchmarkMs = Math.max(1, Math.round(performance.now() - t0));

  return {
    corners,
    alignment,
    detectedStudentCode,
    studentIdConfidence: idConfSum / spec.studentIdDigits,
    answers,
    statuses,
    details,
    ...grade,
    benchmarkMs,
  };
}

/**
 * Validates whether 4 detected corner markers form a well-aligned sheet rectangle
 * suitable for continuous hands-free camera auto-capture.
 */
export function areCornersWellAligned(
  corners: CornerMarkers,
  width: number,
  height: number
): boolean {
  const topWidth = Math.hypot(
    corners.tr.x - corners.tl.x,
    corners.tr.y - corners.tl.y
  );
  const bottomWidth = Math.hypot(
    corners.br.x - corners.bl.x,
    corners.br.y - corners.bl.y
  );
  const leftHeight = Math.hypot(
    corners.bl.x - corners.tl.x,
    corners.bl.y - corners.tl.y
  );
  const rightHeight = Math.hypot(
    corners.br.x - corners.tr.x,
    corners.br.y - corners.tr.y
  );

  if (topWidth < width * 0.48 || bottomWidth < width * 0.48) return false;
  if (leftHeight < height * 0.48 || rightHeight < height * 0.48) return false;

  const widthBalance =
    Math.min(topWidth, bottomWidth) / Math.max(topWidth, bottomWidth);
  const heightBalance =
    Math.min(leftHeight, rightHeight) / Math.max(leftHeight, rightHeight);

  return widthBalance >= 0.8 && heightBalance >= 0.8;
}

/**
 * Pure pixel-buffer renderer (zero DOM dependency) for generating realistic OMR test images
 * with optional rotation, scale, perspective trapezoid tilt, and dark desk background.
 */
export function renderOmrPixelBuffer(options: {
  width: number;
  height: number;
  questionCount: QuestionCount;
  choiceCount: 4 | 5;
  studentIdDigits?: StudentIdDigits;
  studentCode: string;
  answers: Record<number, ChoiceOption | ChoiceOption[] | null>;
  offsetX?: number;
  offsetY?: number;
  rotationRad?: number;
  scale?: number;
  perspectiveTiltY?: number; // -0.18..0.18 narrows top vs widens bottom
  darkDeskBg?: boolean;
  noiseLevel?: number;
}): PixelBuffer {
  const {
    width,
    height,
    questionCount,
    choiceCount,
    studentIdDigits = 4,
    studentCode,
    answers,
    offsetX = 0,
    offsetY = 0,
    rotationRad = 0,
    scale = 1,
    perspectiveTiltY = 0,
    darkDeskBg = false,
    noiseLevel = 0,
  } = options;

  const data = new Uint8ClampedArray(width * height * 4);

  const spec = getOmrLayoutSpec(questionCount, choiceCount, studentIdDigits);
  const cosR = Math.cos(rotationRad);
  const sinR = Math.sin(rotationRad);
  const cx0 = width / 2;
  const cy0 = height / 2;

  const toPixel = (u: number, v: number): Point2D => {
    const wProj = Math.max(0.5, 1 - (v - 0.5) * perspectiveTiltY);
    const rx = ((u - 0.5) * width * scale) / wProj;
    const ry = ((v - 0.5) * height * scale) / wProj;
    return {
      x: cx0 + rx * cosR - ry * sinR + offsetX,
      y: cy0 + rx * sinR + ry * cosR + offsetY,
    };
  };

  if (darkDeskBg) {
    // Fill dark slate desk surface, then paint crisp white paper quad inside transformed sheet bounds
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 30;
      data[i + 1] = 41;
      data[i + 2] = 59;
      data[i + 3] = 255;
    }

    const pTL = toPixel(0, 0);
    const pTR = toPixel(1, 0);
    const pBL = toPixel(0, 1);
    const pBR = toPixel(1, 1);
    const invH = computeHomographyMatrix(
      [pTL, pTR, pBL, pBR],
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
        { x: 1, y: 1 },
      ]
    );
    if (invH) {
      const minX = Math.max(0, Math.floor(Math.min(pTL.x, pTR.x, pBL.x, pBR.x)));
      const maxX = Math.min(width - 1, Math.ceil(Math.max(pTL.x, pTR.x, pBL.x, pBR.x)));
      const minY = Math.max(0, Math.floor(Math.min(pTL.y, pTR.y, pBL.y, pBR.y)));
      const maxY = Math.min(height - 1, Math.ceil(Math.max(pTL.y, pTR.y, pBL.y, pBR.y)));
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const uv = applyHomography(invH, x, y);
          if (uv.x >= 0 && uv.x <= 1 && uv.y >= 0 && uv.y <= 1) {
            const idx = (y * width + x) * 4;
            const jitter =
              noiseLevel > 0 ? Math.round(Math.sin(idx * 0.13) * 0.5 * noiseLevel) : 0;
            const v = Math.max(225, Math.min(255, 251 + jitter));
            data[idx] = v;
            data[idx + 1] = v;
            data[idx + 2] = v;
          }
        }
      }
    }
  } else {
    for (let i = 0; i < data.length; i += 4) {
      const jitter =
        noiseLevel > 0 ? Math.round(Math.sin(i * 0.13) * 0.5 * noiseLevel) : 0;
      const v = Math.max(220, Math.min(255, 250 + jitter));
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }

  const paintRect = (cu: number, cv: number, wU: number, hV: number, shade: number) => {
    const center = toPixel(cu, cv);
    const wProj = Math.max(0.5, 1 - (cv - 0.5) * perspectiveTiltY);
    const halfW = (wU * width * scale) / wProj / 2;
    const halfH = (hV * height * scale) / wProj / 2;
    const x0 = Math.max(0, Math.floor(center.x - halfW - 3));
    const x1 = Math.min(width - 1, Math.ceil(center.x + halfW + 3));
    const y0 = Math.max(0, Math.floor(center.y - halfH - 3));
    const y1 = Math.min(height - 1, Math.ceil(center.y + halfH + 3));

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = (x - center.x) * cosR + (y - center.y) * sinR;
        const dy = -(x - center.x) * sinR + (y - center.y) * cosR;
        if (Math.abs(dx) <= halfW && Math.abs(dy) <= halfH) {
          const idx = (y * width + x) * 4;
          data[idx] = shade;
          data[idx + 1] = shade;
          data[idx + 2] = shade;
        }
      }
    }
  };

  const paintBubble = (coord: BubbleCoord, filled: boolean) => {
    const center = toPixel(coord.u, coord.v);
    const wProj = Math.max(0.5, 1 - (coord.v - 0.5) * perspectiveTiltY);
    const r = (coord.rU * width * scale) / wProj;
    const x0 = Math.max(0, Math.floor(center.x - r - 2));
    const x1 = Math.min(width - 1, Math.ceil(center.x + r + 2));
    const y0 = Math.max(0, Math.floor(center.y - r - 2));
    const y1 = Math.min(height - 1, Math.ceil(center.y + r + 2));

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dist = Math.hypot(x - center.x, y - center.y);
        const idx = (y * width + x) * 4;
        if (filled && dist <= r * 0.88) {
          const shade = 28;
          data[idx] = shade;
          data[idx + 1] = shade;
          data[idx + 2] = shade;
        } else if (dist >= r * 0.85 && dist <= r * 1.05) {
          const ringShade = 90;
          data[idx] = ringShade;
          data[idx + 1] = ringShade;
          data[idx + 2] = ringShade;
        }
      }
    }
  };

  const cornerPts: Array<[number, number]> = [
    [spec.markerMarginX, spec.markerMarginY],
    [1 - spec.markerMarginX, spec.markerMarginY],
    [spec.markerMarginX, 1 - spec.markerMarginY],
    [1 - spec.markerMarginX, 1 - spec.markerMarginY],
  ];
  for (const [mu, mv] of cornerPts) {
    paintRect(mu, mv, spec.markerSizeU, spec.markerSizeV, 12);
  }

  const digits = spec.studentIdDigits;
  const paddedCode = studentCode.replace(/\D/g, '').padStart(digits, '0').slice(-digits);
  for (let col = 0; col < digits; col++) {
    const targetDigit = Number.parseInt(paddedCode[col] ?? '0', 10);
    for (let d = 0; d <= 9; d++) {
      paintBubble(spec.idBubbles[col][d], d === targetDigit);
    }
  }

  const activeChoices = CHOICE_OPTIONS.slice(0, choiceCount);
  for (const qItem of spec.questionBubbles) {
    const ans = answers[qItem.questionNumber];
    const selectedList = Array.isArray(ans) ? ans : ans ? [ans] : [];
    for (const opt of activeChoices) {
      paintBubble(qItem.choices[opt], selectedList.includes(opt));
    }
  }

  return { width, height, data };
}
