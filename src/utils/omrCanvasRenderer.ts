import {
  CHOICE_OPTIONS,
  type BubbleReadStatus,
  type ChoiceOption,
  type Quiz,
  type StudentIdDigits,
} from '../types/omr';
import {
  buildCanonicalToImageHomography,
  getOmrLayoutSpec,
  mapCanonicalToImage,
  type CornerKey,
  type CornerMarkers,
  type SheetAlignmentAnalysis,
} from './omrEngine';

/**
 * Draws a crisp, print-ready OMR Answer Sheet onto a browser HTMLCanvasElement
 * using the exact canonical coordinates from getOmrLayoutSpec().
 */
export function drawPrintableOmrSheet(
  canvas: HTMLCanvasElement,
  options: {
    quiz: Quiz;
    studentCode?: string;
    studentName?: string;
    studentIdDigits?: StudentIdDigits;
    prefillAnswers?: Record<number, ChoiceOption | ChoiceOption[] | null>;
    schoolName?: string;
    academicYear?: string;
    semester?: string;
  }
): void {
  const {
    quiz,
    studentCode = '',
    studentName = '',
    studentIdDigits = 4,
    prefillAnswers = {},
    schoolName = 'โรงเรียนสาธิตมาตรฐานสากล · GradeScan OMR',
    academicYear,
    semester,
  } = options;

  const width = 800;
  const height = 1132; // A4 portrait ratio
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const spec = getOmrLayoutSpec(quiz.questionCount, quiz.choiceCount, studentIdDigits);

  // Clean paper white background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  // 4 Solid Black Fiducial Alignment Markers
  const markerW = spec.markerSizeU * width;
  const markerH = spec.markerSizeV * height;
  const corners: Array<[number, number]> = [
    [spec.markerMarginX, spec.markerMarginY],
    [1 - spec.markerMarginX, spec.markerMarginY],
    [spec.markerMarginX, 1 - spec.markerMarginY],
    [1 - spec.markerMarginX, 1 - spec.markerMarginY],
  ];

  ctx.fillStyle = '#0F172A';
  for (const [cu, cv] of corners) {
    ctx.fillRect(
      cu * width - markerW / 2,
      cv * height - markerH / 2,
      markerW,
      markerH
    );
  }

  // Header metadata block (left side, cleanly clear of TL/TR markers and ID block)
  const boxX = width * 0.1;
  const boxY = height * 0.085;
  const boxW = width * 0.41;
  const boxH = height * 0.185;

  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(boxX, boxY, boxW, boxH);

  const maxTextW = boxW - 24;

  ctx.fillStyle = '#0F172A';
  ctx.font = '700 15px "Noto Sans Thai", "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('กระดาษคำตอบปรนัย (OMR Answer Sheet)', boxX + 12, boxY + 12, maxTextW);

  const termInfo =
    academicYear && semester
      ? ` · ภาค ${semester}/${academicYear}`
      : '';
  ctx.fillStyle = '#475569';
  ctx.font = '500 10.5px "Noto Sans Thai", "Plus Jakarta Sans", sans-serif';
  ctx.fillText(`${schoolName}${termInfo}`, boxX + 12, boxY + 35, maxTextW);

  ctx.strokeStyle = '#E2E8F0';
  ctx.beginPath();
  ctx.moveTo(boxX + 12, boxY + 56);
  ctx.lineTo(boxX + boxW - 12, boxY + 56);
  ctx.stroke();

  ctx.fillStyle = '#0F172A';
  ctx.font = '600 12px "Noto Sans Thai", "Plus Jakarta Sans", sans-serif';
  ctx.fillText(`ชุดข้อสอบ: ${quiz.title}`, boxX + 12, boxY + 64, maxTextW);

  ctx.fillStyle = '#334155';
  ctx.font = '400 11px "Noto Sans Thai", "Plus Jakarta Sans", sans-serif';
  ctx.fillText(
    `วิชา: ${quiz.subject} · ${quiz.questionCount} ข้อ (${quiz.choiceCount} ตัวเลือก)`,
    boxX + 12,
    boxY + 86,
    maxTextW
  );
  ctx.fillText(
    `ชื่อ-สกุล: ${studentName || '.......................................'}`,
    boxX + 12,
    boxY + 110,
    maxTextW
  );
  ctx.fillText(
    `ห้องเรียน: ${quiz.className}   รหัส: ${studentCode || '______'}`,
    boxX + 12,
    boxY + 132,
    maxTextW
  );
  ctx.fillStyle = '#64748B';
  ctx.font = '400 10px "Noto Sans Thai", sans-serif';
  ctx.fillText(
    'คำแนะนำ: ใช้ดินสอ 2B หรือปากกาดำฝนให้เต็มวงกลม',
    boxX + 12,
    boxY + 160
  );
  ctx.fillText(
    'ห้ามขีดทับจุดสี่เหลี่ยมสีดำทั้ง 4 มุมกระดาษ',
    boxX + 12,
    boxY + 176
  );

  // Student ID Bubble Grid (right side of header)
  const idBoxX = width * 0.53;
  const idBoxY = height * 0.072;
  const idBoxW = width * 0.37;
  const idBoxH = height * 0.205;

  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(idBoxX, idBoxY, idBoxW, idBoxH);

  ctx.fillStyle = '#0F172A';
  ctx.font = '600 12px "Noto Sans Thai", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(
    `รหัสประจำตัวนักเรียน (${spec.studentIdDigits} หลัก)`,
    idBoxX + idBoxW / 2,
    idBoxY + 8
  );

  const cleanDigits = studentCode.replace(/\D/g, '');
  const paddedId = cleanDigits
    ? cleanDigits.padStart(spec.studentIdDigits, '0').slice(-spec.studentIdDigits)
    : '';
  for (let col = 0; col < spec.studentIdDigits; col++) {
    const firstCoord = spec.idBubbles[col][0];
    const cx = firstCoord.u * width;
    // Digit box at top of column
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - 10, idBoxY + 26, 20, 18);
    if (paddedId) {
      ctx.fillStyle = '#0F172A';
      ctx.font = '700 12px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(paddedId[col], cx, idBoxY + 35);
    }

    const targetDigit = paddedId ? Number.parseInt(paddedId[col], 10) : -1;
    for (let d = 0; d <= 9; d++) {
      const b = spec.idBubbles[col][d];
      const bx = b.u * width;
      const by = b.v * height;
      const r = b.rU * width;

      if (d === targetDigit) {
        ctx.fillStyle = '#1E293B';
        ctx.beginPath();
        ctx.arc(bx, by, r * 0.92, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(bx, by, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#64748B';
        ctx.lineWidth = 1.1;
        ctx.stroke();

        ctx.fillStyle = '#64748B';
        ctx.font = '500 8.5px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(d), bx, by + 0.5);
      }
    }
  }

  // Column Headers for Question Grid
  const activeChoices = CHOICE_OPTIONS.slice(0, quiz.choiceCount);
  const cols = quiz.questionCount === 100 ? 4 : 2;
  const rowsPerCol = quiz.questionCount === 20 ? 10 : 25;

  for (let c = 0; c < cols; c++) {
    const firstQ = spec.questionBubbles[c * rowsPerCol];
    if (!firstQ) continue;
    const headerY = firstQ.choices.A.v * height - 22;

    ctx.fillStyle = '#334155';
    ctx.font = '700 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('#', firstQ.choices.A.u * width - 24, headerY);

    for (const opt of activeChoices) {
      const coord = firstQ.choices[opt];
      ctx.fillText(opt, coord.u * width, headerY);
    }
  }

  // Question Bubbles
  for (const qItem of spec.questionBubbles) {
    const firstChoice = qItem.choices.A;
    const qX = firstChoice.u * width - 24;
    const qY = firstChoice.v * height;

    // Alternating subtle row tint
    if (qItem.questionNumber % 2 === 0) {
      const lastChoice = qItem.choices[activeChoices[activeChoices.length - 1]];
      const rowLeft = qX - 14;
      const rowRight = lastChoice.u * width + firstChoice.rU * width + 8;
      const rowH = firstChoice.rU * width * 2.25;
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(rowLeft, qY - rowH / 2, rowRight - rowLeft, rowH);
    }

    ctx.fillStyle = '#1E293B';
    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(qItem.questionNumber), qX + 7, qY + 0.5);

    const prefill = prefillAnswers[qItem.questionNumber];
    const prefillList = Array.isArray(prefill) ? prefill : prefill ? [prefill] : [];

    for (const opt of activeChoices) {
      const b = qItem.choices[opt];
      const bx = b.u * width;
      const by = b.v * height;
      const r = b.rU * width;

      if (prefillList.includes(opt)) {
        ctx.fillStyle = '#1E293B';
        ctx.beginPath();
        ctx.arc(bx, by, r * 0.9, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(bx, by, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 1.15;
        ctx.stroke();

        ctx.fillStyle = '#64748B';
        ctx.font = '500 8.5px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(opt, bx, by + 0.5);
      }
    }
  }

  // Footer
  ctx.fillStyle = '#94A3B8';
  ctx.font = '400 10px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(
    `GradeScan OMR Form · ${quiz.questionCount}Q · ${quiz.choiceCount} Choices · ID:${quiz.id}`,
    width / 2,
    height - 16
  );
}

/**
 * Draws colored grading overlay (corner markers, green correct, red wrong, green key hint, amber blank/multi)
 * onto a canvas containing the scanned OMR image.
 */
export function drawScanOverlayOnCanvas(
  canvas: HTMLCanvasElement,
  sourceImageData: ImageData,
  quiz: Quiz,
  corners: CornerMarkers,
  answers: Record<number, ChoiceOption | null>,
  statuses: Record<number, BubbleReadStatus>
): void {
  canvas.width = sourceImageData.width;
  canvas.height = sourceImageData.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.putImageData(sourceImageData, 0, 0);

  const spec = getOmrLayoutSpec(quiz.questionCount, quiz.choiceCount);
  const H = buildCanonicalToImageHomography(corners);
  const scaleX =
    Math.hypot(corners.tr.x - corners.tl.x, corners.tr.y - corners.tl.y) /
    (1 - 2 * spec.markerMarginX);

  // Draw detected corner alignment frame
  ctx.strokeStyle = '#2563EB';
  ctx.lineWidth = 2.5;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(corners.tl.x, corners.tl.y);
  ctx.lineTo(corners.tr.x, corners.tr.y);
  ctx.lineTo(corners.br.x, corners.br.y);
  ctx.lineTo(corners.bl.x, corners.bl.y);
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);

  for (const pt of [corners.tl, corners.tr, corners.bl, corners.br]) {
    ctx.fillStyle = '#2563EB';
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw per-question grading markers
  for (const qItem of spec.questionBubbles) {
    const qNum = qItem.questionNumber;
    const selected = answers[qNum] ?? null;
    const status = statuses[qNum] ?? 'blank';
    const key = quiz.answerKey[qNum];

    if (status === 'filled' && selected) {
      const coord = qItem.choices[selected];
      const pt = mapCanonicalToImage(coord.u, coord.v, corners, H);
      const r = coord.rU * scaleX * 1.15;

      if (selected === key) {
        ctx.strokeStyle = '#16A34A';
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.strokeStyle = '#DC2626';
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
        ctx.stroke();

        // Highlight the true correct key in green
        const keyCoord = qItem.choices[key];
        const keyPt = mapCanonicalToImage(keyCoord.u, keyCoord.v, corners, H);
        ctx.strokeStyle = '#16A34A';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 2]);
        ctx.beginPath();
        ctx.arc(keyPt.x, keyPt.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    } else {
      // Blank or Multiple mark -> highlight key in amber
      const keyCoord = qItem.choices[key];
      const keyPt = mapCanonicalToImage(keyCoord.u, keyCoord.v, corners, H);
      const r = keyCoord.rU * scaleX * 1.18;
      ctx.strokeStyle = '#D97706';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(keyPt.x, keyPt.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

/**
 * Draws the live camera viewfinder HUD: 4-corner detection locks, perspective polygon,
 * and automatic spirit-level angle indicator on top of a video or virtual camera canvas.
 */
export function drawLiveAlignmentOverlay(
  canvas: HTMLCanvasElement,
  analysis: SheetAlignmentAnalysis,
  stabilityProgress: number // 0..1
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const { detection, tiltAngleDeg, isReadyToAutoScan } = analysis;
  const { corners, detected } = detection;

  // 1. Draw target corner guide brackets at ideal margin positions
  const marginX = w * 0.06;
  const marginY = h * 0.05;
  const bracketLen = Math.round(w * 0.055);
  const targetBrackets: Array<{
    key: CornerKey;
    x: number;
    y: number;
    dx: number;
    dy: number;
  }> = [
    { key: 'tl', x: marginX - 18, y: marginY - 18, dx: 1, dy: 1 },
    { key: 'tr', x: w - marginX + 18, y: marginY - 18, dx: -1, dy: 1 },
    { key: 'bl', x: marginX - 18, y: h - marginY + 18, dx: 1, dy: -1 },
    { key: 'br', x: w - marginX + 18, y: h - marginY + 18, dx: -1, dy: -1 },
  ];

  for (const b of targetBrackets) {
    const ok = detected[b.key];
    ctx.strokeStyle = ok ? '#10B981' : 'rgba(56, 189, 248, 0.85)';
    ctx.lineWidth = ok ? 5 : 3.5;
    ctx.beginPath();
    ctx.moveTo(b.x + b.dx * bracketLen, b.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(b.x, b.y + b.dy * bracketLen);
    ctx.stroke();
  }

  // 2. If >= 2 corners found, draw detected polygon & corner lock rings
  if (detection.detectedCount >= 2) {
    const polyColor = isReadyToAutoScan
      ? '#10B981'
      : detection.detectedCount === 4
      ? '#F59E0B'
      : '#38BDF8';

    ctx.strokeStyle = polyColor;
    ctx.lineWidth = isReadyToAutoScan ? 3.5 : 2.5;
    ctx.setLineDash(isReadyToAutoScan ? [] : [8, 6]);
    ctx.beginPath();
    ctx.moveTo(corners.tl.x, corners.tl.y);
    ctx.lineTo(corners.tr.x, corners.tr.y);
    ctx.lineTo(corners.br.x, corners.br.y);
    ctx.lineTo(corners.bl.x, corners.bl.y);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);

    const cornerEntries: Array<[CornerKey, { x: number; y: number }]> = [
      ['tl', corners.tl],
      ['tr', corners.tr],
      ['bl', corners.bl],
      ['br', corners.br],
    ];
    for (const [k, pt] of cornerEntries) {
      if (!detected[k]) continue;
      ctx.fillStyle = isReadyToAutoScan ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.25)';
      ctx.strokeStyle = isReadyToAutoScan ? '#10B981' : '#F59E0B';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 3. Center Spirit-Level Angle Horizon Gauge (when 4 corners are found)
  if (detection.detectedCount === 4) {
    const cx = w / 2;
    const cy = h / 2;
    const rad = (tiltAngleDeg * Math.PI) / 180;
    const lineHalf = 78;

    // Reference horizontal line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cx - lineHalf, cy);
    ctx.lineTo(cx + lineHalf, cy);
    ctx.stroke();
    ctx.setLineDash([]);

    // Measured sheet tilt line
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);
    ctx.strokeStyle = isReadyToAutoScan ? '#10B981' : '#F59E0B';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx - lineHalf * cosA, cy - lineHalf * sinA);
    ctx.lineTo(cx + lineHalf * cosA, cy + lineHalf * sinA);
    ctx.stroke();

    // Angle pill readout
    const angleLabel = `${tiltAngleDeg >= 0 ? '+' : ''}${tiltAngleDeg.toFixed(1)}°`;
    ctx.fillStyle = isReadyToAutoScan ? 'rgba(6, 95, 70, 0.92)' : 'rgba(120, 53, 15, 0.9)';
    ctx.fillRect(cx - 52, cy - 44, 104, 28);
    ctx.strokeStyle = isReadyToAutoScan ? '#34D399' : '#FBBF24';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cx - 52, cy - 44, 104, 28);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 15px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(angleLabel, cx, cy - 30);

    // Stability lock progress bar below center reticle
    if (stabilityProgress > 0) {
      const barW = 160;
      const barH = 8;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
      ctx.fillRect(cx - barW / 2, cy + 28, barW, barH);
      ctx.fillStyle = '#10B981';
      ctx.fillRect(cx - barW / 2, cy + 28, barW * Math.min(1, stabilityProgress), barH);
    }
  }
}
