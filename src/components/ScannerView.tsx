import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Camera,
  CheckCircle2,
  Compass,
  FileUp,
  Layers,
  Play,
  RotateCw,
  ScanLine,
  Sparkles,
  Square,
  SwitchCamera,
  Trash2,
  UserCheck,
  VideoOff,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type {
  BubbleReadStatus,
  ChoiceOption,
  Quiz,
  ScannedSheet,
  Student,
} from '../types/omr';
import { playScanSuccessFeedback } from '../utils/feedbackAudio';
import { getActiveChoices } from '../utils/omrAnalytics';
import {
  analyzeSheetAlignment,
  renderOmrPixelBuffer,
  scanOmrImageData,
  warpPerspectiveToCanonical,
  type OmrScanResult,
  type SheetAlignmentAnalysis,
} from '../utils/omrEngine';
import {
  drawLiveAlignmentOverlay,
  drawPrintableOmrSheet,
  drawScanOverlayOnCanvas,
} from '../utils/omrCanvasRenderer';

interface ScannerViewProps {
  activeQuiz: Quiz;
  students: Student[];
  scans: ScannedSheet[];
  inspectedScanId: string | null;
  onSaveScan: (scan: ScannedSheet) => void;
  onUpdateScanAnswer: (
    scanId: string,
    questionNumber: number,
    choice: ChoiceOption | null
  ) => void;
  onReassignStudent: (scanId: string, studentId: string) => void;
  onDeleteScan: (scanId: string) => void;
  onSelectInspectedScan: (scanId: string | null) => void;
  onBenchmark: (label: string, ms: number) => void;
}

type ScannerMode = 'simulate' | 'upload' | 'camera';

const STABILITY_FRAMES_REQUIRED = 2;

export function ScannerView({
  activeQuiz,
  students,
  scans,
  inspectedScanId,
  onSaveScan,
  onUpdateScanAnswer,
  onReassignStudent,
  onDeleteScan,
  onSelectInspectedScan,
  onBenchmark,
}: ScannerViewProps) {
  const [mode, setMode] = useState<ScannerMode>('simulate');
  const [selectedStudentId, setSelectedStudentId] = useState<string>(
    students[0]?.id ?? ''
  );
  const [simPreset, setSimPreset] = useState<'high' | 'average' | 'imperfect'>(
    'imperfect'
  );
  const [autoAdvanceStudent, setAutoAdvanceStudent] = useState<boolean>(true);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [autoCaptureCamera, setAutoCaptureCamera] = useState<boolean>(true);
  const [autoRectifyPerspective, setAutoRectifyPerspective] =
    useState<boolean>(true);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>(
    'environment'
  );

  const [lastResult, setLastResult] = useState<OmrScanResult | null>(null);
  const [activeScanId, setActiveScanId] = useState<string | null>(
    inspectedScanId
  );
  const [sessionScanIds, setSessionScanIds] = useState<string[]>([]);
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [scanFlashBanner, setScanFlashBanner] = useState<string | null>(null);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [virtualCamActive, setVirtualCamActive] = useState(false);
  const [virtualAutoLevel, setVirtualAutoLevel] = useState(true);
  const [virtualManualTiltDeg, setVirtualManualTiltDeg] = useState(0);
  const [liveAlignment, setLiveAlignment] =
    useState<SheetAlignmentAnalysis | null>(null);
  const [stabilityFrames, setStabilityFrames] = useState(0);

  const resultCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const virtualVideoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastAutoSignatureRef = useRef<{ sig: string; at: number }>({
    sig: '',
    at: 0,
  });
  const stabilityCountRef = useRef(0);
  const virtualTickRef = useRef(0);
  const virtualStudentIdxRef = useRef(0);
  const flashTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (inspectedScanId) {
      setActiveScanId(inspectedScanId);
    }
  }, [inspectedScanId]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (flashTimerRef.current) {
        window.clearTimeout(flashTimerRef.current);
      }
    };
  }, []);

  const inspectedScan =
    scans.find((s) => s.id === activeScanId) ?? scans[0] ?? null;

  // Render preview canvas whenever inspectedScan changes and no live scan overlay is shown
  useEffect(() => {
    if (!inspectedScan || !resultCanvasRef.current) return;
    if (lastResult && activeScanId === inspectedScan.id) return;

    const canvas = resultCanvasRef.current;
    drawPrintableOmrSheet(canvas, {
      quiz: activeQuiz,
      studentCode: inspectedScan.detectedStudentCode,
      studentName: inspectedScan.studentName,
      prefillAnswers: inspectedScan.answers,
    });
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const scanned = scanOmrImageData(imgData, activeQuiz);
    drawScanOverlayOnCanvas(
      canvas,
      imgData,
      activeQuiz,
      scanned.corners,
      inspectedScan.answers,
      inspectedScan.statuses
    );
  }, [inspectedScan, activeQuiz, activeScanId, lastResult]);

  const showSuccessFlash = useCallback((message: string) => {
    setScanFlashBanner(message);
    if (flashTimerRef.current) {
      window.clearTimeout(flashTimerRef.current);
    }
    flashTimerRef.current = window.setTimeout(() => {
      setScanFlashBanner(null);
    }, 2600);
  }, []);

  const processPixelImageData = useCallback(
    (
      imgData: ImageData,
      scanSource: ScannedSheet['scanSource'],
      precomputedAlignment?: SheetAlignmentAnalysis
    ): ScannedSheet => {
      const rawAlign = precomputedAlignment ?? analyzeSheetAlignment(imgData);
      let workingImageData = imgData;

      // Auto-rectify tilted or perspective-warped sheets via 3x3 Projective Homography
      if (
        autoRectifyPerspective &&
        rawAlign.detection.detectedCount === 4 &&
        (Math.abs(rawAlign.tiltAngleDeg) > 1.2 ||
          rawAlign.perspectiveSkewPct >= 3)
      ) {
        const rectified = warpPerspectiveToCanonical(
          imgData,
          rawAlign.detection.corners,
          800,
          1132
        );
        workingImageData = new ImageData(
          new Uint8ClampedArray(rectified.data),
          rectified.width,
          rectified.height
        );
      }

      const res = scanOmrImageData(workingImageData, activeQuiz);
      setLastResult(res);

      if (resultCanvasRef.current) {
        drawScanOverlayOnCanvas(
          resultCanvasRef.current,
          workingImageData,
          activeQuiz,
          res.corners,
          res.answers,
          res.statuses
        );
      }

      const matchedStudent = students.find(
        (s) => s.studentCode === res.detectedStudentCode
      );

      const newScanId = `scan_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const newScan: ScannedSheet = {
        id: newScanId,
        quizId: activeQuiz.id,
        studentId: matchedStudent?.id ?? null,
        detectedStudentCode: res.detectedStudentCode,
        studentName:
          matchedStudent?.fullName ??
          `นักเรียนรหัส ${res.detectedStudentCode} (ไม่อยู่ในรายชื่อ)`,
        className: matchedStudent?.className ?? activeQuiz.className,
        answers: res.answers,
        statuses: res.statuses,
        score: res.score,
        maxScore: res.maxScore,
        percentage: res.percentage,
        correctCount: res.correctCount,
        incorrectCount: res.incorrectCount,
        blankCount: res.blankCount,
        multipleCount: res.multipleCount,
        scanSource,
        scanDurationMs: res.benchmarkMs,
        scannedAt: new Date().toISOString(),
        measuredAngleDeg: Number(rawAlign.tiltAngleDeg.toFixed(1)),
        perspectiveSkewPct: rawAlign.perspectiveSkewPct,
        alignmentQualityPct: rawAlign.alignmentQualityPct,
      };

      setActiveScanId(newScanId);
      setSessionScanIds((prev) => [newScanId, ...prev].slice(0, 25));
      onSelectInspectedScan(newScanId);
      onSaveScan(newScan);
      playScanSuccessFeedback(soundEnabled);
      showSuccessFlash(
        `ตรวจสำเร็จ · ${newScan.detectedStudentCode} (${newScan.score}/${newScan.maxScore}) · ปรับมุม ${rawAlign.tiltAngleDeg >= 0 ? '+' : ''}${rawAlign.tiltAngleDeg.toFixed(1)}°`
      );
      onBenchmark(`สแกน OMR สำเร็จ (${res.detectedStudentCode})`, res.benchmarkMs);
      return newScan;
    },
    [
      activeQuiz,
      autoRectifyPerspective,
      students,
      onSelectInspectedScan,
      onSaveScan,
      soundEnabled,
      showSuccessFlash,
      onBenchmark,
    ]
  );

  const buildSimBufferForStudent = useCallback(
    (
      student: Student | undefined,
      presetOverride?: 'high' | 'average' | 'imperfect',
      geom?: {
        rotationRad?: number;
        scale?: number;
        perspectiveTiltY?: number;
        darkDeskBg?: boolean;
        offsetX?: number;
        offsetY?: number;
      }
    ): ImageData => {
      const studentCode = student?.studentCode ?? '1015';
      const preset = presetOverride ?? simPreset;
      const choices = getActiveChoices(activeQuiz.choiceCount);
      const simAnswers: Record<number, ChoiceOption | ChoiceOption[] | null> = {};

      for (let q = 1; q <= activeQuiz.questionCount; q++) {
        const key = activeQuiz.answerKey[q] ?? 'A';
        if (preset === 'high') {
          simAnswers[q] =
            q % 11 === 0 ? choices[(choices.indexOf(key) + 1) % choices.length] : key;
        } else if (preset === 'average') {
          simAnswers[q] =
            q % 3 === 0 ? choices[(choices.indexOf(key) + 2) % choices.length] : key;
        } else {
          if (q === 4) {
            simAnswers[q] = null;
          } else if (q === 9) {
            simAnswers[q] = ['A', 'C'];
          } else if (q % 4 === 0) {
            simAnswers[q] = choices[(choices.indexOf(key) + 1) % choices.length];
          } else {
            simAnswers[q] = key;
          }
        }
      }

      const buf = renderOmrPixelBuffer({
        width: 800,
        height: 1132,
        questionCount: activeQuiz.questionCount,
        choiceCount: activeQuiz.choiceCount,
        studentCode,
        answers: simAnswers,
        offsetX: geom?.offsetX ?? 5,
        offsetY: geom?.offsetY ?? -4,
        rotationRad: geom?.rotationRad ?? 0.012,
        scale: geom?.scale ?? 1,
        perspectiveTiltY: geom?.perspectiveTiltY ?? 0,
        darkDeskBg: geom?.darkDeskBg ?? false,
        noiseLevel: 7,
      });

      return new ImageData(new Uint8ClampedArray(buf.data), buf.width, buf.height);
    },
    [activeQuiz, simPreset]
  );

  const handleSimulateSingleAndAdvance = () => {
    const currentIndex = Math.max(
      0,
      students.findIndex((s) => s.id === selectedStudentId)
    );
    const student = students[currentIndex] ?? students[0];
    const imgData = buildSimBufferForStudent(student);
    processPixelImageData(imgData, 'simulation');

    if (autoAdvanceStudent && students.length > 1) {
      const nextStudent = students[(currentIndex + 1) % students.length];
      setSelectedStudentId(nextStudent.id);
    }
  };

  const handleSimulateBatchThree = async () => {
    if (students.length === 0) return;
    const startIdx = Math.max(
      0,
      students.findIndex((s) => s.id === selectedStudentId)
    );
    const presets: Array<'high' | 'average' | 'imperfect'> = [
      'high',
      'imperfect',
      'average',
    ];
    const batchCount = Math.min(3, students.length);
    setBatchProgress({ current: 0, total: batchCount });

    for (let i = 0; i < batchCount; i++) {
      const stu = students[(startIdx + i) % students.length];
      setBatchProgress({ current: i + 1, total: batchCount });
      const imgData = buildSimBufferForStudent(stu, presets[i % presets.length]);
      processPixelImageData(imgData, 'simulation');
      await new Promise((r) => setTimeout(r, 90));
    }

    if (autoAdvanceStudent) {
      const nextStu = students[(startIdx + batchCount) % students.length];
      setSelectedStudentId(nextStu.id);
    }
    setBatchProgress(null);
  };

  const readFileToImageData = (file: File): Promise<ImageData | null> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const offscreen = document.createElement('canvas');
          offscreen.width = 800;
          offscreen.height = 1132;
          const ctx = offscreen.getContext('2d');
          if (!ctx) {
            resolve(null);
            return;
          }
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, offscreen.width, offscreen.height);
          ctx.drawImage(img, 0, 0, offscreen.width, offscreen.height);
          resolve(ctx.getImageData(0, 0, offscreen.width, offscreen.height));
        };
        img.onerror = () => resolve(null);
        img.src = String(reader.result);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  };

  const handleUploadBatchImages = async (fileList: FileList) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    setBatchProgress({ current: 0, total: files.length });
    for (let i = 0; i < files.length; i++) {
      setBatchProgress({ current: i + 1, total: files.length });
      const imgData = await readFileToImageData(files[i]);
      if (imgData) {
        processPixelImageData(imgData, 'upload');
      }
    }
    setBatchProgress(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    setVirtualCamActive(false);
    setLiveAlignment(null);
    stabilityCountRef.current = 0;
    setStabilityFrames(0);
  }, []);

  const startCamera = async (targetFacing = facingMode) => {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        'เบราว์เซอร์นี้ไม่รองรับการเปิดกล้องจริง สามารถใช้ “จำลองกล้องสดวัดมุม” หรืออัปโหลดภาพถ่ายได้ทันที'
      );
      return;
    }
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: targetFacing,
          width: { ideal: 1280 },
          height: { ideal: 1800 },
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch {
      setCameraError(
        'ไม่สามารถเข้าถึงกล้องจริงได้ (หรือไม่ได้อนุญาตสิทธิ์) — สามารถกด “ทดลองกล้องจำลองวัดมุมอัตโนมัติ” เพื่อดูระบบตรวจจับ 4 มุมและวัดองศาแบบเรียลไทม์ได้ทันที'
      );
      setCameraActive(false);
    }
  };

  const startVirtualLiveCamera = () => {
    stopCamera();
    setCameraError(null);
    virtualTickRef.current = 0;
    virtualStudentIdxRef.current = Math.max(
      0,
      students.findIndex((s) => s.id === selectedStudentId)
    );
    setVirtualCamActive(true);
  };

  const handleFlipCamera = () => {
    const nextFacing = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextFacing);
    if (cameraActive) {
      startCamera(nextFacing);
    }
  };

  const evaluateAndMaybeCaptureFrame = useCallback(
    (imgData: ImageData, isAuto: boolean, source: ScannedSheet['scanSource']) => {
      const alignment = analyzeSheetAlignment(imgData);
      setLiveAlignment(alignment);

      if (isAuto) {
        let nextStability = alignment.isReadyToAutoScan
          ? Math.min(STABILITY_FRAMES_REQUIRED, stabilityCountRef.current + 1)
          : 0;
        stabilityCountRef.current = nextStability;
        setStabilityFrames(nextStability);

        if (overlayCanvasRef.current) {
          overlayCanvasRef.current.width = imgData.width;
          overlayCanvasRef.current.height = imgData.height;
          drawLiveAlignmentOverlay(
            overlayCanvasRef.current,
            alignment,
            nextStability / STABILITY_FRAMES_REQUIRED
          );
        }

        if (!alignment.isReadyToAutoScan || nextStability < STABILITY_FRAMES_REQUIRED) {
          return false;
        }

        const preview = scanOmrImageData(imgData, activeQuiz);
        const sig = `${preview.detectedStudentCode}_${preview.correctCount}_${preview.score}`;
        const now = Date.now();
        if (
          sig === lastAutoSignatureRef.current.sig &&
          now - lastAutoSignatureRef.current.at < 2600
        ) {
          return false;
        }
        lastAutoSignatureRef.current = { sig, at: now };
        stabilityCountRef.current = 0;
        setStabilityFrames(0);
      }

      processPixelImageData(imgData, source, alignment);
      return true;
    },
    [activeQuiz, processPixelImageData]
  );

  const captureFromCamera = useCallback(
    (isAuto = false) => {
      if (virtualCamActive && virtualVideoCanvasRef.current) {
        const vCanvas = virtualVideoCanvasRef.current;
        const ctx = vCanvas.getContext('2d');
        if (!ctx) return;
        const imgData = ctx.getImageData(0, 0, vCanvas.width, vCanvas.height);
        evaluateAndMaybeCaptureFrame(imgData, isAuto, 'camera');
        return;
      }

      const video = videoRef.current;
      if (!video || video.readyState < 2) return;
      const offscreen = document.createElement('canvas');
      offscreen.width = 800;
      offscreen.height = 1132;
      const ctx = offscreen.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, offscreen.width, offscreen.height);
      const imgData = ctx.getImageData(0, 0, offscreen.width, offscreen.height);
      evaluateAndMaybeCaptureFrame(imgData, isAuto, 'camera');
    },
    [virtualCamActive, evaluateAndMaybeCaptureFrame]
  );

  // Real camera continuous auto-alignment & capture polling
  useEffect(() => {
    if (!cameraActive || mode !== 'camera') return;
    const timer = window.setInterval(() => {
      captureFromCamera(autoCaptureCamera);
    }, 380);
    return () => window.clearInterval(timer);
  }, [cameraActive, autoCaptureCamera, mode, captureFromCamera]);

  // Virtual Live Camera animation loop: renders sheet over dark desk, smoothly levels angle, detects 4 corners, and auto-captures
  useEffect(() => {
    if (!virtualCamActive || mode !== 'camera') return;

    const runStep = () => {
      const canvas = virtualVideoCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = 800;
      canvas.height = 1132;

      const tick = virtualTickRef.current++;
      // Cycle smoothly through students; each sheet starts tilted (-9.5 deg) and auto-levels to +0.5 deg
      const phase = tick % 10;
      const tiltDeg = virtualAutoLevel
        ? phase === 0
          ? -9.5
          : phase === 1
          ? -5.8
          : phase === 2
          ? -2.1
          : 0.6
        : virtualManualTiltDeg;

      const perspTilt = virtualAutoLevel ? (phase < 2 ? 0.08 : 0.03) : 0.07;
      const stuList = students.length > 0 ? students : [undefined];
      const stu = stuList[virtualStudentIdxRef.current % stuList.length];

      const presets: Array<'high' | 'average' | 'imperfect'> = [
        'high',
        'imperfect',
        'average',
      ];
      const imgData = buildSimBufferForStudent(
        stu,
        presets[virtualStudentIdxRef.current % presets.length],
        {
          rotationRad: (tiltDeg * Math.PI) / 180,
          scale: 0.8,
          perspectiveTiltY: perspTilt,
          darkDeskBg: true,
          offsetX: 0,
          offsetY: 0,
        }
      );

      ctx.putImageData(imgData, 0, 0);

      const captured = evaluateAndMaybeCaptureFrame(
        imgData,
        autoCaptureCamera,
        'camera'
      );
      if (captured) {
        virtualStudentIdxRef.current += 1;
        virtualTickRef.current = 0;
      }
    };

    runStep();
    const timer = window.setInterval(runStep, 460);
    return () => window.clearInterval(timer);
  }, [
    virtualCamActive,
    mode,
    virtualAutoLevel,
    virtualManualTiltDeg,
    students,
    autoCaptureCamera,
    buildSimBufferForStudent,
    evaluateAndMaybeCaptureFrame,
  ]);

  const sessionScans = sessionScanIds
    .map((id) => scans.find((s) => s.id === id))
    .filter((s): s is ScannedSheet => Boolean(s));

  const duplicateCountForInspected = inspectedScan
    ? scans.filter(
        (s) =>
          s.quizId === activeQuiz.id &&
          s.detectedStudentCode === inspectedScan.detectedStudentCode
      ).length
    : 0;

  const choices = getActiveChoices(activeQuiz.choiceCount);

  return (
    <div className="space-y-6">
      {/* Scanner Mode Selector & Continuous Controls */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-indigo-600 dark:text-indigo-400 font-medium">
              <span>ระบบตรวจจับ 4 มุม &amp; วัดมุมเอียงอัตโนมัติ (Homography)</span>
              <span aria-hidden="true">·</span>
              <span>
                {activeQuiz.questionCount} ข้อ ({activeQuiz.choiceCount} ตัวเลือก)
              </span>
            </div>
            <h1 className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">
              สแกนตรวจกระดาษคำตอบ OMR
            </h1>
            <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
              {activeQuiz.title}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setSoundEnabled((v) => !v)}
              aria-label={
                soundEnabled ? 'ปิดเสียงแจ้งเตือนสแกน' : 'เปิดเสียงแจ้งเตือนสแกน'
              }
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 whitespace-nowrap"
            >
              {soundEnabled ? (
                <Volume2
                  className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
                  aria-hidden="true"
                />
              ) : (
                <VolumeX
                  className="h-4 w-4 text-slate-400"
                  aria-hidden="true"
                />
              )}
              <span>{soundEnabled ? 'เสียงติ๊ด: เปิด' : 'เสียงติ๊ด: ปิด'}</span>
            </button>

            <div
              role="tablist"
              aria-label="โหมดการสแกนกระดาษคำตอบ"
              className="grid w-full grid-cols-3 sm:inline-flex sm:w-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-800"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'simulate'}
                onClick={() => {
                  stopCamera();
                  setMode('simulate');
                }}
                className={`min-h-[40px] rounded-lg px-2 sm:px-3 py-1.5 text-[11px] sm:text-xs font-medium transition-colors whitespace-nowrap text-center ${
                  mode === 'simulate'
                    ? 'bg-white text-indigo-700 shadow-sm dark:bg-slate-700 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                สแกนต่อเนื่องเร็ว
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'upload'}
                onClick={() => {
                  stopCamera();
                  setMode('upload');
                }}
                className={`min-h-[40px] rounded-lg px-2 sm:px-3 py-1.5 text-[11px] sm:text-xs font-medium transition-colors whitespace-nowrap text-center ${
                  mode === 'upload'
                    ? 'bg-white text-indigo-700 shadow-sm dark:bg-slate-700 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                อัปโหลดหลายภาพ
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'camera'}
                onClick={() => setMode('camera')}
                className={`min-h-[40px] rounded-lg px-2 sm:px-3 py-1.5 text-[11px] sm:text-xs font-medium transition-colors whitespace-nowrap text-center ${
                  mode === 'camera'
                    ? 'bg-white text-indigo-700 shadow-sm dark:bg-slate-700 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                กล้องสด 4 มุม
              </button>
            </div>
          </div>
        </div>

        {/* Continuous Scan Feedback Flash Banner */}
        {scanFlashBanner && (
          <div
            role="status"
            className="mt-4 flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-200"
          >
            <div className="flex items-center gap-2.5">
              <CheckCircle2
                className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
              <span>{scanFlashBanner}</span>
            </div>
            <span className="font-mono text-xs tabular-nums shrink-0">
              คิวเซสชันนี้ {sessionScans.length} แผ่น
            </span>
          </div>
        )}

        {/* Batch Progress Bar */}
        {batchProgress && (
          <div className="mt-4 space-y-1.5 rounded-xl border border-sky-200 bg-sky-50/70 p-3 dark:border-sky-900/50 dark:bg-sky-950/30">
            <div className="flex items-center justify-between text-xs font-medium text-sky-800 dark:text-sky-200">
              <span>กำลังสแกนกระดาษคำตอบต่อเนื่อง...</span>
              <span className="font-mono tabular-nums">
                {batchProgress.current} / {batchProgress.total} แผ่น
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-sky-200 dark:bg-sky-900">
              <div
                style={{
                  width: `${(batchProgress.current / batchProgress.total) * 100}%`,
                }}
                className="h-full bg-gradient-to-r from-indigo-600 to-sky-500 transition-all"
              />
            </div>
          </div>
        )}

        {/* Mode Controls */}
        <div className="mt-5 border-t border-slate-100 pt-5 dark:border-slate-800">
          {mode === 'simulate' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-12 md:items-end">
                <div className="md:col-span-5">
                  <label
                    htmlFor="sim-student-select"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    นักเรียนคนปัจจุบัน (เลื่อนคนถัดไปอัตโนมัติหลังสแกน)
                  </label>
                  <select
                    id="sim-student-select"
                    value={selectedStudentId}
                    onChange={(e) => setSelectedStudentId(e.target.value)}
                    className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    {students.map((stu) => (
                      <option key={stu.id} value={stu.id}>
                        {stu.studentCode} · {stu.fullName} ({stu.className})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-4">
                  <label
                    htmlFor="sim-preset-select"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    ลักษณะรอยฝนบนกระดาษ
                  </label>
                  <select
                    id="sim-preset-select"
                    value={simPreset}
                    onChange={(e) =>
                      setSimPreset(
                        e.target.value as 'high' | 'average' | 'imperfect'
                      )
                    }
                    className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="imperfect">
                      สมจริง (มีตอบผิด · เว้นว่าง · ฝนซ้ำ 2 ช่อง)
                    </option>
                    <option value="high">ทำข้อสอบได้ดี (ถูกประมาณ 90%)</option>
                    <option value="average">
                      ทำข้อสอบปานกลาง (ถูกประมาณ 65%)
                    </option>
                  </select>
                </div>

                <div className="md:col-span-3">
                  <button
                    type="button"
                    onClick={handleSimulateSingleAndAdvance}
                    className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:from-indigo-700 hover:to-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 whitespace-nowrap"
                  >
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                    <span>สแกนแผ่นถัดไปทันที</span>
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={autoAdvanceStudent}
                    onChange={(e) => setAutoAdvanceStudent(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                  />
                  <span>
                    เลื่อนไปนักเรียนคนถัดไปอัตโนมัติ (สแกนรัวต่อเนื่องได้ในปุ่มเดียว)
                  </span>
                </label>

                <button
                  type="button"
                  onClick={handleSimulateBatchThree}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-900/60 dark:bg-indigo-950/50 dark:text-indigo-300 whitespace-nowrap"
                >
                  <Layers className="h-4 w-4" aria-hidden="true" />
                  <span>สแกนต่อเนื่อง 3 แผ่นรวด</span>
                </button>
              </div>
            </div>
          )}

          {mode === 'upload' && (
            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/40 p-6 text-center dark:border-indigo-900/60 dark:bg-indigo-950/20">
              <FileUp
                className="h-9 w-9 text-indigo-600 dark:text-indigo-400"
                aria-hidden="true"
              />
              <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">
                อัปโหลดภาพถ่ายกระดาษคำตอบทีละหลายแผ่นพร้อมกัน (Batch Upload)
              </p>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                ระบบจะตรวจจับจุดสี่เหลี่ยม 4 มุม วัดองศาเอียง และปรับมุมให้ตรงอัตโนมัติด้วย Homography ก่อนตรวจคะแนน
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) handleUploadBatchImages(e.target.files);
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-4 inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:from-indigo-700 hover:to-blue-700"
              >
                <FileUp className="h-4 w-4" aria-hidden="true" />
                <span>เลือกหลายภาพเพื่อสแกนต่อเนื่อง</span>
              </button>
            </div>
          )}

          {mode === 'camera' && (
            <div className="space-y-4">
              {cameraError && (
                <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
                  <VideoOff
                    className="mt-0.5 h-4 w-4 shrink-0"
                    aria-hidden="true"
                  />
                  <span>{cameraError}</span>
                </div>
              )}

              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-4">
                  <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={autoCaptureCamera}
                      onChange={(e) => setAutoCaptureCamera(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                    />
                    <span>
                      สแกนอัตโนมัติเมื่อจับครบ 4 มุมและมุมตรง (Hands-Free)
                    </span>
                  </label>

                  <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={autoRectifyPerspective}
                      onChange={(e) =>
                        setAutoRectifyPerspective(e.target.checked)
                      }
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                    />
                    <span>ปรับระนาบกระดาษตรงอัตโนมัติ (Homography)</span>
                  </label>
                </div>

                <button
                  type="button"
                  onClick={handleFlipCamera}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 self-start sm:self-auto"
                >
                  <SwitchCamera className="h-4 w-4" aria-hidden="true" />
                  <span>
                    {facingMode === 'environment' ? 'กล้องหลัง' : 'กล้องหน้า'}
                  </span>
                </button>
              </div>

              {/* Live Viewfinder + Telemetry Split (fits cleanly above the fold) */}
              {(cameraActive || virtualCamActive) && (
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-start">
                  {/* Viewfinder Canvas */}
                  <div className="lg:col-span-5">
                    <div className="relative mx-auto max-w-[330px] overflow-hidden rounded-2xl border-2 border-slate-300 bg-slate-900 shadow-sm dark:border-slate-700">
                      {cameraActive ? (
                        <video
                          ref={videoRef}
                          playsInline
                          muted
                          className="w-full aspect-[800/1132] object-cover block"
                        />
                      ) : (
                        <canvas
                          ref={virtualVideoCanvasRef}
                          data-testid="virtual-camera-canvas"
                          className="w-full aspect-[800/1132] object-cover block"
                        />
                      )}
                      <canvas
                        ref={overlayCanvasRef}
                        data-testid="camera-alignment-overlay"
                        className="pointer-events-none absolute inset-0 h-full w-full"
                      />
                    </div>
                  </div>

                  {/* Live Alignment Telemetry & Controls */}
                  <div className="lg:col-span-7 space-y-4">
                    {liveAlignment && (
                      <div
                        data-testid="live-alignment-telemetry"
                        className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60 space-y-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-100">
                            <Compass
                              className={`h-4 w-4 shrink-0 ${
                                liveAlignment.isReadyToAutoScan
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-amber-600 dark:text-amber-400'
                              }`}
                              aria-hidden="true"
                            />
                            <span>{liveAlignment.guidanceTh}</span>
                          </div>

                          <span
                            className={`font-mono tabular-nums text-xs font-semibold ${
                              liveAlignment.isReadyToAutoScan
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-indigo-700 dark:text-indigo-300'
                            }`}
                          >
                            พร้อมสแกน {liveAlignment.alignmentQualityPct}% · ล็อกนิ่ง{' '}
                            {stabilityFrames}/{STABILITY_FRAMES_REQUIRED}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5 text-xs">
                          <div className="rounded-lg bg-white px-3 py-2.5 border border-slate-200/80 dark:bg-slate-900 dark:border-slate-700">
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                              ตรวจพบมุม 4 จุด
                            </div>
                            <div className="mt-1 flex items-center gap-1.5 font-mono font-semibold">
                              {(['tl', 'tr', 'bl', 'br'] as const).map((k) => (
                                <span
                                  key={k}
                                  className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${
                                    liveAlignment.detection.detected[k]
                                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                                      : 'bg-slate-100 text-slate-400 dark:bg-slate-800'
                                  }`}
                                >
                                  {k}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div className="rounded-lg bg-white px-3 py-2.5 border border-slate-200/80 dark:bg-slate-900 dark:border-slate-700">
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                              มุมเอียงที่วัดได้
                            </div>
                            <div
                              className={`mt-1 font-mono tabular-nums text-sm font-bold ${
                                Math.abs(liveAlignment.tiltAngleDeg) <= 4
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : Math.abs(liveAlignment.tiltAngleDeg) <= 10.5
                                  ? 'text-sky-600 dark:text-sky-400'
                                  : 'text-amber-600 dark:text-amber-400'
                              }`}
                            >
                              {liveAlignment.tiltAngleDeg >= 0 ? '+' : ''}
                              {liveAlignment.tiltAngleDeg.toFixed(1)}°
                            </div>
                          </div>

                          <div className="rounded-lg bg-white px-3 py-2.5 border border-slate-200/80 dark:bg-slate-900 dark:border-slate-700">
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                              ความบิดเบี้ยวมุมมอง
                            </div>
                            <div className="mt-1 font-mono tabular-nums text-sm font-bold text-slate-900 dark:text-white">
                              {liveAlignment.perspectiveSkewPct}% · ครอบคลุม{' '}
                              {liveAlignment.coveragePct}%
                            </div>
                          </div>

                          <div className="rounded-lg bg-white px-3 py-2.5 border border-slate-200/80 dark:bg-slate-900 dark:border-slate-700">
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                              สภาพแสงสว่าง
                            </div>
                            <div
                              className={`mt-1 text-sm font-semibold ${
                                liveAlignment.detection.lightingStatus === 'good'
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-amber-600 dark:text-amber-400'
                              }`}
                            >
                              {liveAlignment.detection.lightingStatus === 'good'
                                ? 'แสงเหมาะสม'
                                : liveAlignment.detection.lightingStatus === 'too_dark'
                                ? 'แสงน้อยเกินไป'
                                : 'มีแสงสะท้อนจ้า'}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Virtual Live Camera Interactive Controls */}
                    {virtualCamActive && (
                      <div className="flex flex-col gap-3 rounded-xl border border-indigo-200 bg-indigo-50/50 p-3.5 sm:flex-row sm:items-center sm:justify-between dark:border-indigo-900/50 dark:bg-indigo-950/30">
                        <label className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 text-xs font-medium text-indigo-900 dark:text-indigo-200">
                          <input
                            type="checkbox"
                            checked={virtualAutoLevel}
                            onChange={(e) => setVirtualAutoLevel(e.target.checked)}
                            className="h-4 w-4 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-600"
                          />
                          <span>
                            สาธิตวางกระดาษเอียงแล้วหมุนตรงอัตโนมัติ (สลับนักเรียนต่อเนื่อง)
                          </span>
                        </label>

                        {!virtualAutoLevel && (
                          <div className="flex items-center gap-3">
                            <label
                              htmlFor="virtual-tilt-slider"
                              className="text-xs font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap"
                            >
                              ลองเอียง: {virtualManualTiltDeg >= 0 ? '+' : ''}
                              {virtualManualTiltDeg}°
                            </label>
                            <input
                              id="virtual-tilt-slider"
                              type="range"
                              min={-15}
                              max={15}
                              step={1}
                              value={virtualManualTiltDeg}
                              onChange={(e) =>
                                setVirtualManualTiltDeg(Number(e.target.value))
                              }
                              className="w-36 accent-indigo-600"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Thumb-friendly Camera Action Bar */}
              <div className="flex flex-wrap items-center gap-3">
                {!cameraActive && !virtualCamActive ? (
                  <>
                    <button
                      type="button"
                      onClick={() => startCamera(facingMode)}
                      className="inline-flex min-h-[48px] w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-5 py-3 text-sm font-medium text-white hover:from-indigo-700 hover:to-blue-700"
                    >
                      <Camera className="h-4 w-4" aria-hidden="true" />
                      <span>เปิดกล้องจริงสแกนต่อเนื่อง</span>
                    </button>
                    <button
                      type="button"
                      onClick={startVirtualLiveCamera}
                      className="inline-flex min-h-[48px] w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-5 py-3 text-sm font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300"
                    >
                      <Play className="h-4 w-4" aria-hidden="true" />
                      <span>จำลองกล้องสดวัดมุมอัตโนมัติ</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => captureFromCamera(false)}
                      className="inline-flex min-h-[48px] flex-1 sm:flex-none items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-medium text-white hover:bg-emerald-700"
                    >
                      <ScanLine className="h-4 w-4" aria-hidden="true" />
                      <span>จับภาพตรวจทันที</span>
                    </button>
                    <button
                      type="button"
                      onClick={stopCamera}
                      className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <Square className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>หยุดกล้อง</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Continuous Session Scan Queue Strip */}
        {sessionScans.length > 0 && (
          <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                คิวกระดาษที่สแกนต่อเนื่องในเซสชันนี้ ({sessionScans.length} แผ่น)
              </span>
              <span className="text-slate-500 dark:text-slate-400">
                แตะเพื่อตรวจทานรายข้อ
              </span>
            </div>
            <div className="mt-2.5 flex gap-2.5 overflow-x-auto pb-1">
              {sessionScans.map((item) => {
                const selected = inspectedScan?.id === item.id;
                const passThreshold = activeQuiz.passThresholdPct ?? 50;
                const pass = item.percentage >= passThreshold;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setLastResult(null);
                      setActiveScanId(item.id);
                      onSelectInspectedScan(item.id);
                    }}
                    className={`min-h-[48px] shrink-0 rounded-xl border px-3.5 py-2 text-left transition-colors ${
                      selected
                        ? 'border-indigo-600 bg-indigo-50/70 dark:border-indigo-500 dark:bg-indigo-950/40'
                        : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-mono text-xs font-semibold text-slate-900 dark:text-white">
                      <span>{item.detectedStudentCode}</span>
                      <span
                        className={
                          pass
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }
                      >
                        {item.score}/{item.maxScore}
                      </span>
                    </div>
                    <div className="mt-0.5 max-w-[140px] truncate text-[11px] text-slate-600 dark:text-slate-300">
                      {item.studentName}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Instant Feedback & Visual Annotated Paper + Question-by-Question Override */}
      {inspectedScan ? (
        <section className="grid grid-cols-1 gap-6 md:grid-cols-12">
          {/* Left: Annotated OMR Image Canvas */}
          <div className="md:col-span-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  ภาพตรวจจับ 4 มุม OMR และปรับระนาบตรง
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  เขียว = ถูก · แดง = ผิด · ส้ม = เว้นว่าง/ฝนซ้ำ
                </p>
              </div>
              <span className="font-mono tabular-nums text-xs font-medium text-indigo-600 dark:text-indigo-400">
                {inspectedScan.scanDurationMs} ms
              </span>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800">
              <canvas
                ref={resultCanvasRef}
                data-testid="omr-result-canvas"
                className="w-full h-auto block"
              />
            </div>
          </div>

          {/* Right: Instant Score Summary + Student Reassign + Touch-Friendly Question Grid Override */}
          <div className="md:col-span-7 space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span>รหัสนักเรียน {inspectedScan.detectedStudentCode}</span>
                    <span aria-hidden="true">·</span>
                    <span>{inspectedScan.className}</span>
                    {inspectedScan.measuredAngleDeg !== undefined && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono text-indigo-600 dark:text-indigo-400">
                          มุมเอียง {inspectedScan.measuredAngleDeg >= 0 ? '+' : ''}
                          {inspectedScan.measuredAngleDeg.toFixed(1)}° → ตรงแล้ว
                        </span>
                      </>
                    )}
                  </div>
                  <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                    {inspectedScan.studentName}
                  </h2>

                  {duplicateCountForInspected > 1 && (
                    <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>
                        พบรหัสนักเรียน {inspectedScan.detectedStudentCode} สแกนซ้ำ{' '}
                        {duplicateCountForInspected} แผ่นในชุดข้อสอบนี้
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                  <div className="text-left sm:text-right">
                    <div className="text-2xl font-bold font-mono tabular-nums text-indigo-600 dark:text-indigo-400">
                      {inspectedScan.score} / {inspectedScan.maxScore}
                    </div>
                    <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      {inspectedScan.percentage.toFixed(1)}%
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteScan(inspectedScan.id)}
                    aria-label={`ลบผลสแกนของ ${inspectedScan.studentName}`}
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:border-slate-700 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              {/* ZipGrade-style Quick Student Reassign */}
              <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
                <label
                  htmlFor="reassign-student-select"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300"
                >
                  <UserCheck className="h-4 w-4 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
                  <span>แก้ไข/เชื่อมนักเรียนเจ้าของกระดาษ (กรณีฝนรหัสจาง):</span>
                </label>
                <select
                  id="reassign-student-select"
                  value={inspectedScan.studentId ?? ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      onReassignStudent(inspectedScan.id, e.target.value);
                    }
                  }}
                  className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-indigo-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <option value="">-- เลือกนักเรียนในรายชื่อ --</option>
                  {students.map((stu) => (
                    <option key={stu.id} value={stu.id}>
                      {stu.studentCode} · {stu.fullName} ({stu.className})
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-4 grid grid-cols-4 gap-3 border-t border-slate-100 pt-4 text-center dark:border-slate-800">
                <div className="rounded-xl bg-emerald-50/70 py-2 dark:bg-emerald-950/30">
                  <div className="text-[11px] text-emerald-700 dark:text-emerald-300">
                    ตอบถูก
                  </div>
                  <div className="mt-0.5 font-mono tabular-nums text-base font-bold text-emerald-700 dark:text-emerald-400">
                    {inspectedScan.correctCount}
                  </div>
                </div>
                <div className="rounded-xl bg-rose-50/70 py-2 dark:bg-rose-950/30">
                  <div className="text-[11px] text-rose-700 dark:text-rose-300">
                    ตอบผิด
                  </div>
                  <div className="mt-0.5 font-mono tabular-nums text-base font-bold text-rose-700 dark:text-rose-400">
                    {inspectedScan.incorrectCount}
                  </div>
                </div>
                <div className="rounded-xl bg-amber-50/70 py-2 dark:bg-amber-950/30">
                  <div className="text-[11px] text-amber-700 dark:text-amber-300">
                    เว้นว่าง
                  </div>
                  <div className="mt-0.5 font-mono tabular-nums text-base font-bold text-amber-700 dark:text-amber-400">
                    {inspectedScan.blankCount}
                  </div>
                </div>
                <div className="rounded-xl bg-orange-50/70 py-2 dark:bg-orange-950/30">
                  <div className="text-[11px] text-orange-700 dark:text-orange-300">
                    ฝนซ้ำ
                  </div>
                  <div className="mt-0.5 font-mono tabular-nums text-base font-bold text-orange-700 dark:text-orange-400">
                    {inspectedScan.multipleCount}
                  </div>
                </div>
              </div>
            </div>

            {/* Question-by-Question Review & Manual Override (Touch >= 44px) */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                    ตรวจทานคำตอบรายข้อและแก้ไขด้วยตนเอง
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    แตะตัวเลือก A–{choices[choices.length - 1]}{' '}
                    เพื่อปรับคำตอบกรณีรอยดินสอจางหรือฝนซ้ำ
                  </p>
                </div>
                {scans.length > 1 && (
                  <select
                    aria-label="เลือกดูผลสแกนแผ่นอื่น"
                    value={inspectedScan.id}
                    onChange={(e) => {
                      setLastResult(null);
                      setActiveScanId(e.target.value);
                      onSelectInspectedScan(e.target.value);
                    }}
                    className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    {scans.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.detectedStudentCode} · {s.studentName} ({s.score}/
                        {s.maxScore})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="mt-4 max-h-[460px] overflow-y-auto divide-y divide-slate-100 pr-1 dark:divide-slate-800">
                {Array.from(
                  { length: activeQuiz.questionCount },
                  (_, i) => i + 1
                ).map((qNum) => {
                  const selected = inspectedScan.answers[qNum] ?? null;
                  const status: BubbleReadStatus =
                    inspectedScan.statuses[qNum] ?? 'blank';
                  const key = activeQuiz.answerKey[qNum];
                  const isCorrect = status === 'filled' && selected === key;

                  return (
                    <div
                      key={qNum}
                      className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
                    >
                      <div className="flex items-center gap-2.5 min-w-[130px]">
                        <span className="w-7 font-mono tabular-nums text-xs font-semibold text-slate-500 dark:text-slate-400">
                          {String(qNum).padStart(2, '0')}
                        </span>
                        {isCorrect ? (
                          <CheckCircle2
                            className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                            aria-hidden="true"
                          />
                        ) : (
                          <AlertCircle
                            className={`h-4 w-4 shrink-0 ${
                              status === 'filled'
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-amber-600 dark:text-amber-400'
                            }`}
                            aria-hidden="true"
                          />
                        )}
                        <span className="text-xs text-slate-600 dark:text-slate-300">
                          เฉลย <strong className="font-mono">{key}</strong>
                          {status === 'multiple' && ' · ฝนซ้ำ'}
                          {status === 'blank' && ' · เว้นว่าง'}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {choices.map((opt) => {
                          const active = status === 'filled' && selected === opt;
                          return (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => {
                                setLastResult(null);
                                onUpdateScanAnswer(inspectedScan.id, qNum, opt);
                              }}
                              aria-label={`ข้อ ${qNum} เลือก ${opt}`}
                              className={`h-11 w-11 sm:h-9 sm:w-9 rounded-lg font-mono text-xs font-semibold transition-colors ${
                                active
                                  ? opt === key
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-rose-600 text-white'
                                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                              }`}
                            >
                              {opt}
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => {
                            setLastResult(null);
                            onUpdateScanAnswer(inspectedScan.id, qNum, null);
                          }}
                          title="ล้างเป็นไม่ตอบ"
                          aria-label={`ล้างคำตอบข้อ ${qNum}`}
                          className="flex h-11 w-11 sm:h-9 sm:w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                        >
                          <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            กดปุ่ม “สแกนแผ่นถัดไปทันที” หรือเปิด “กล้องสด 4 มุม” เพื่อตรวจจับและวัดมุมกระดาษคำตอบแบบเรียลไทม์
          </p>
        </section>
      )}
    </div>
  );
}
