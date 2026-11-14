import { useRef, useState } from 'react';
import {
  CheckCircle2,
  Database,
  Download,
  FileJson,
  FileSpreadsheet,
  RotateCcw,
  Sliders,
  Upload,
} from 'lucide-react';
import type {
  Quiz,
  QuizSummaryStats,
  ScannedSheet,
  Student,
  Subject,
  SystemBackupPayload,
  SystemSettings,
  Teacher,
} from '../types/omr';
import {
  autoDetectAndParseJsonImport,
  exportFullSystemBackupJson,
  exportPostScanScoresJson,
  SAMPLE_DMC_JSON,
  SAMPLE_HRMS_TEACHERS_JSON,
  SAMPLE_SUBJECTS_JSON,
  type AutoJsonImportResult,
} from '../utils/importExport';
import { exportScansToCsv } from '../utils/normalization';
import {
  computeThaiGrade,
  DEFAULT_GRADE_CUTOFFS,
  DEFAULT_SYSTEM_SETTINGS,
  sanitizeSystemSettings,
} from '../utils/systemSettings';

interface SettingsViewProps {
  settings: SystemSettings;
  onUpdateSettings: (next: SystemSettings) => void;
  onResetSettings: () => void;
  students: Student[];
  teachers: Teacher[];
  subjects: Subject[];
  quizzes: Quiz[];
  scans: ScannedSheet[];
  activeQuiz: Quiz;
  activeQuizScans: ScannedSheet[];
  summary: QuizSummaryStats;
  onRestoreBackup: (
    backup: SystemBackupPayload,
    mode: 'merge' | 'replace'
  ) => void;
  onApplyJsonImport: (
    result: AutoJsonImportResult,
    mode: 'merge' | 'replace'
  ) => void;
  onBenchmark: (label: string, ms: number) => void;
}

type SettingsStage = 'stage1' | 'stage2' | 'stage3' | 'stage4' | 'io';

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function SettingsView({
  settings,
  onUpdateSettings,
  onResetSettings,
  students,
  teachers,
  subjects,
  quizzes,
  scans,
  activeQuiz,
  activeQuizScans,
  summary,
  onRestoreBackup,
  onApplyJsonImport,
  onBenchmark,
}: SettingsViewProps) {
  const [stage, setStage] = useState<SettingsStage>('stage1');
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [formatHint, setFormatHint] = useState<
    'auto' | 'dmc_students' | 'hrms_teachers' | 'subjects' | 'backup'
  >('auto');
  const [jsonText, setJsonText] = useState<string>('');
  const [importPreview, setImportPreview] = useState<AutoJsonImportResult | null>(
    null
  );
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const updateField = <K extends keyof SystemSettings>(
    key: K,
    value: SystemSettings[K]
  ) => {
    onUpdateSettings(sanitizeSystemSettings({ ...settings, [key]: value }));
  };

  const updateCutoff = (
    key: keyof SystemSettings['gradeCutoffs'],
    value: number
  ) => {
    onUpdateSettings(
      sanitizeSystemSettings({
        ...settings,
        gradeCutoffs: {
          ...settings.gradeCutoffs,
          [key]: value,
        },
      })
    );
  };

  const handleParseText = (
    raw: string,
    hint: typeof formatHint = formatHint
  ) => {
    setJsonText(raw);
    if (!raw.trim()) {
      setImportPreview(null);
      return;
    }
    const parsed = autoDetectAndParseJsonImport(
      raw,
      hint,
      settings.studentIdDigits
    );
    setImportPreview(parsed);
  };

  const handleFileSelected = async (file: File) => {
    const text = await file.text();
    handleParseText(text, formatHint);
    setStatusNotice(`โหลดไฟล์ ${file.name} สำเร็จ — ตรวจสอบตัวอย่างด้านล่างก่อนกดนำเข้า`);
  };

  const handleConfirmImport = () => {
    if (!importPreview || importPreview.detectedType === 'unknown') return;
    if (importPreview.detectedType === 'backup' && importPreview.backup) {
      onRestoreBackup(importPreview.backup, importMode);
      setStatusNotice(`กู้คืนข้อมูลทั้งระบบเรียบร้อย (${importMode === 'replace' ? 'แทนที่ทั้งหมด' : 'ผสานข้อมูล'})`);
    } else {
      onApplyJsonImport(importPreview, importMode);
      setStatusNotice(`นำเข้าข้อมูลสำเร็จ: ${importPreview.summaryText}`);
    }
    setImportPreview(null);
    setJsonText('');
  };

  const handleExportFullBackup = () => {
    const t0 = performance.now();
    const json = exportFullSystemBackupJson({
      schoolName: settings.schoolName,
      students,
      teachers,
      subjects,
      quizzes,
      scans,
      activeQuizId: activeQuiz.id,
      settings,
    });
    const stamp = new Date().toISOString().slice(0, 10);
    downloadTextFile(
      `gradescan-full-backup-${stamp}.json`,
      json,
      'application/json;charset=utf-8;'
    );
    onBenchmark('ส่งออกสำรองข้อมูลทั้งระบบ JSON', performance.now() - t0);
    setStatusNotice('ส่งออกไฟล์สำรองข้อมูลทั้งระบบ (.json) แล้ว');
  };

  const handleExportPostScoresCsv = () => {
    const t0 = performance.now();
    const csv = exportScansToCsv(activeQuiz, activeQuizScans, {
      settings,
      students,
    });
    downloadTextFile(
      `scores_${activeQuiz.id}.csv`,
      csv,
      'text/csv;charset=utf-8;'
    );
    onBenchmark('ส่งออกคะแนนหลังตรวจ CSV', performance.now() - t0);
  };

  const handleExportPostScoresExcel = () => {
    const t0 = performance.now();
    const passThreshold =
      activeQuiz.passThresholdPct ?? settings.defaultPassThresholdPct;
    const rowsHtml = activeQuizScans
      .map((s) => {
        const grade = computeThaiGrade(s.percentage, settings.gradeCutoffs);
        const passed = s.percentage >= passThreshold ? 'ผ่าน' : 'ไม่ผ่าน';
        return `<tr><td>${s.detectedStudentCode}</td><td>${s.studentName}</td><td>${s.className}</td><td>${s.score}</td><td>${s.maxScore}</td><td>${s.percentage.toFixed(1)}%</td><td>${passed}</td><td>${grade}</td></tr>`;
      })
      .join('');
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8" /></head><body><table><thead><tr><th>รหัส</th><th>ชื่อ-สกุล</th><th>ห้องเรียน</th><th>คะแนน</th><th>เต็ม</th><th>ร้อยละ</th><th>สถานะ</th><th>เกรด</th></tr></thead><tbody>${rowsHtml}</tbody></table></body></html>`;
    downloadTextFile(
      `scores_${activeQuiz.id}.xls`,
      html,
      'application/vnd.ms-excel;charset=utf-8;'
    );
    onBenchmark('ส่งออกคะแนนหลังตรวจ Excel', performance.now() - t0);
  };

  const handleExportPostScoresJson = () => {
    const t0 = performance.now();
    const json = exportPostScanScoresJson(
      activeQuiz,
      activeQuizScans,
      students,
      summary,
      settings
    );
    downloadTextFile(
      `scores_${activeQuiz.id}.json`,
      json,
      'application/json;charset=utf-8;'
    );
    onBenchmark('ส่งออกคะแนนหลังตรวจ JSON', performance.now() - t0);
  };

  const handleExportEntityJson = (type: 'students' | 'teachers' | 'subjects') => {
    const t0 = performance.now();
    if (type === 'students') {
      downloadTextFile(
        'dmc_students_export.json',
        JSON.stringify({ source: 'DMC_EXPORT', students }, null, 2),
        'application/json;charset=utf-8;'
      );
      onBenchmark('ส่งออกนักเรียน DMC JSON', performance.now() - t0);
    } else if (type === 'teachers') {
      downloadTextFile(
        'hrms_teachers_export.json',
        JSON.stringify({ source: 'HRMS_EXPORT', teachers }, null, 2),
        'application/json;charset=utf-8;'
      );
      onBenchmark('ส่งออกครู HRMS JSON', performance.now() - t0);
    } else {
      downloadTextFile(
        'subjects_export.json',
        JSON.stringify({ source: 'SUBJECTS_EXPORT', subjects }, null, 2),
        'application/json;charset=utf-8;'
      );
      onBenchmark('ส่งออกรายวิชา JSON', performance.now() - t0);
    }
  };

  const STAGES: Array<{ id: SettingsStage; label: string }> = [
    { id: 'stage1', label: '1. โรงเรียนและกระดาษ OMR' },
    { id: 'stage2', label: '2. กล้องและการอ่านรอยฝน' },
    { id: 'stage3', label: '3. เกณฑ์คะแนนและเกรด 0–4' },
    { id: 'stage4', label: '4. ตรวจฐานข้อมูลและส่งออก' },
    { id: 'io', label: 'ศูนย์นำเข้า-ส่งออกทั้งระบบ' },
  ];

  return (
    <div className="space-y-6">
      {/* Header & Stage Switcher */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-indigo-600 dark:text-indigo-400">
              <Sliders className="h-3.5 w-3.5" aria-hidden="true" />
              <span>ตั้งค่าระบบครบทุกขั้นตอน &amp; ศูนย์นำเข้า-ส่งออก JSON</span>
            </div>
            <h1 className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">
              ตั้งค่าระบบ OMR และจัดการฐานข้อมูลโรงเรียน
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              กำหนดค่าตั้งแต่หัวกระดาษคำตอบ รหัสนักเรียน {settings.studentIdDigits} หลัก ความไวกล้อง เกณฑ์ตัดเกรด ไปจนถึงนำเข้า DMC / HRMS และสำรองข้อมูลทั้งระบบ
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                onResetSettings();
                setStatusNotice('รีเซ็ตการตั้งค่ากลับเป็นค่ามาตรฐานแล้ว');
              }}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 whitespace-nowrap"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>รีเซ็ตค่าเริ่มต้น</span>
            </button>
            <button
              type="button"
              onClick={handleExportFullBackup}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-700 whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>สำรองข้อมูลทั้งระบบ JSON</span>
            </button>
          </div>
        </div>

        <div
          role="tablist"
          aria-label="ขั้นตอนการตั้งค่าระบบ"
          className="mt-5 flex flex-wrap gap-1.5 rounded-xl bg-slate-100 p-1.5 dark:bg-slate-800"
        >
          {STAGES.map((tab) => {
            const active = stage === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setStage(tab.id)}
                className={`min-h-[38px] rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-white text-indigo-700 shadow-sm dark:bg-slate-700 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {statusNotice && (
          <div
            role="status"
            className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{statusNotice}</span>
          </div>
        )}
      </section>

      {/* Stage 1: School & Printable OMR Form */}
      {stage === 'stage1' && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              ขั้นตอนที่ 1: ข้อมูลสถานศึกษาและโครงสร้างกระดาษคำตอบ OMR
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              ค่าที่กำหนดจะมีผลทันทีกับหัวกระดาษคำตอบที่พิมพ์และจำนวนหลักรหัสประจำตัวนักเรียนที่กล้องตรวจอ่าน
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="sm:col-span-2">
              <label
                htmlFor="setting-school-name"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                ชื่อโรงเรียน / สถานศึกษา (แสดงบนหัวกระดาษและไฟล์ส่งออก)
              </label>
              <input
                id="setting-school-name"
                type="text"
                value={settings.schoolName}
                onChange={(e) => updateField('schoolName', e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div>
              <label
                htmlFor="setting-academic-year"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                ปีการศึกษา (พ.ศ.)
              </label>
              <input
                id="setting-academic-year"
                type="text"
                value={settings.academicYear}
                onChange={(e) => updateField('academicYear', e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 font-mono text-sm text-slate-900 focus:border-indigo-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div>
              <label
                htmlFor="setting-semester"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                ภาคเรียน
              </label>
              <select
                id="setting-semester"
                value={settings.semester}
                onChange={(e) =>
                  updateField(
                    'semester',
                    e.target.value as SystemSettings['semester']
                  )
                }
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="1">ภาคเรียนที่ 1</option>
                <option value="2">ภาคเรียนที่ 2</option>
                <option value="summer">ภาคฤดูร้อน</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="setting-id-digits"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                จำนวนหลักเลขประจำตัวนักเรียนบนกระดาษ OMR
              </label>
              <select
                id="setting-id-digits"
                value={settings.studentIdDigits}
                onChange={(e) =>
                  updateField(
                    'studentIdDigits',
                    Number(e.target.value) as 4 | 5 | 6
                  )
                }
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value={4}>4 หลัก (มาตรฐาน 0000–9999)</option>
                <option value={5}>5 หลัก (โรงเรียนขนาดใหญ่ 00000–99999)</option>
                <option value={6}>6 หลัก (รหัสประจำตัวเต็ม 6 หลัก)</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="setting-default-qcount"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                จำนวนข้อเริ่มต้นเมื่อสร้างชุดสอบใหม่
              </label>
              <select
                id="setting-default-qcount"
                value={settings.defaultQuestionCount}
                onChange={(e) =>
                  updateField(
                    'defaultQuestionCount',
                    Number(e.target.value) as 20 | 50 | 100
                  )
                }
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value={20}>20 ข้อ (2 คอลัมน์)</option>
                <option value={50}>50 ข้อ (2 คอลัมน์)</option>
                <option value={100}>100 ข้อ (4 คอลัมน์)</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="setting-default-choices"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                จำนวนตัวเลือกเริ่มต้น
              </label>
              <select
                id="setting-default-choices"
                value={settings.defaultChoiceCount}
                onChange={(e) =>
                  updateField(
                    'defaultChoiceCount',
                    Number(e.target.value) as 4 | 5
                  )
                }
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value={4}>4 ตัวเลือก (A - D)</option>
                <option value={5}>5 ตัวเลือก (A - E)</option>
              </select>
            </div>
          </div>
        </section>
      )}

      {/* Stage 2: Camera & OMR CV Engine */}
      {stage === 'stage2' && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              ขั้นตอนที่ 2: ค่าความไวกล้องและเอนจินอ่านรอยฝน OMR (Computer Vision)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              ปรับแต่งความเข้มรอยดินสอ ระยะห่างการตรวจฝนซ้ำ และองศาเอียงสูงสุดที่อนุญาตให้สแกนอัตโนมัติ
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <div className="flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-300">
                <label htmlFor="setting-fill-threshold">
                  ความเข้มขั้นต่ำของรอยฝน
                </label>
                <span className="font-mono tabular-nums font-bold text-indigo-600 dark:text-indigo-400">
                  {Math.round(settings.bubbleFillThreshold * 100)}%
                </span>
              </div>
              <input
                id="setting-fill-threshold"
                type="range"
                min={0.18}
                max={0.45}
                step={0.01}
                value={settings.bubbleFillThreshold}
                onChange={(e) =>
                  updateField('bubbleFillThreshold', Number(e.target.value))
                }
                className="mt-3 w-full accent-indigo-600"
              />
              <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                ค่าต่ำ (20%) อ่านดินสอจางได้ดี · ค่ามาตรฐาน 28%
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <div className="flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-300">
                <label htmlFor="setting-multimark-gap">
                  เกณฑ์ตรวจจับการฝนซ้ำ (2 ช่อง)
                </label>
                <span className="font-mono tabular-nums font-bold text-indigo-600 dark:text-indigo-400">
                  {Math.round(settings.multiMarkGapThreshold * 100)}%
                </span>
              </div>
              <input
                id="setting-multimark-gap"
                type="range"
                min={0.06}
                max={0.25}
                step={0.01}
                value={settings.multiMarkGapThreshold}
                onChange={(e) =>
                  updateField('multiMarkGapThreshold', Number(e.target.value))
                }
                className="mt-3 w-full accent-indigo-600"
              />
              <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                ถ้าช่องที่เข้มรองลงมาต่างจากช่องแรกน้อยกว่าเกณฑ์นี้ จะแจ้งว่าฝนซ้ำ
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <div className="flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-300">
                <label htmlFor="setting-max-tilt">
                  มุมเอียงสูงสุดที่สแกนอัตโนมัติ
                </label>
                <span className="font-mono tabular-nums font-bold text-indigo-600 dark:text-indigo-400">
                  ±{settings.maxTiltAngleDeg.toFixed(1)}°
                </span>
              </div>
              <input
                id="setting-max-tilt"
                type="range"
                min={3}
                max={15}
                step={0.5}
                value={settings.maxTiltAngleDeg}
                onChange={(e) =>
                  updateField('maxTiltAngleDeg', Number(e.target.value))
                }
                className="mt-3 w-full accent-indigo-600"
              />
              <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                ค่าน้อย = บังคับตั้งกระดาษตรงมาก · ค่ามาตรฐาน ±10.5°
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pt-2">
            {(
              [
                [
                  'autoRectifyPerspective',
                  'ปรับมุมเอียงและระนาบกระดาษอัตโนมัติ (3x3 Homography)',
                ],
                [
                  'autoCaptureCamera',
                  'ล็อก 4 มุมแล้วถ่ายตรวจอัตโนมัติเมื่อเปิดกล้องสด (Hands-Free)',
                ],
                [
                  'autoAdvanceStudent',
                  'เลื่อนลำดับนักเรียนคนถัดไปอัตโนมัติหลังสแกนต่อเนื่อง',
                ],
                ['soundEnabled', 'เปิดเสียงสัญญาณติ๊ดแจ้งเตือนเมื่อสแกนสำเร็จ'],
              ] as Array<[keyof SystemSettings, string]>
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-800/50"
              >
                <input
                  type="checkbox"
                  checked={Boolean(settings[key])}
                  onChange={(e) => updateField(key, e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </section>
      )}

      {/* Stage 3: Grading, Psychometrics & Thai 8-Tier Scale */}
      {stage === 'stage3' && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              ขั้นตอนที่ 3: เกณฑ์การให้คะแนน เกรด 8 ระดับ (0–4) และการวิเคราะห์ข้อสอบ
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              กำหนดเกณฑ์ผ่านมาตรฐาน การคำนวณค่าอำนาจจำแนก (Upper-Lower Group) และเกณฑ์ตัดเกรดระดับผลการเรียน
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label
                htmlFor="setting-pass-pct"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                เกณฑ์ผ่านมาตรฐานเริ่มต้น (%)
              </label>
              <input
                id="setting-pass-pct"
                type="number"
                min={10}
                max={100}
                value={settings.defaultPassThresholdPct}
                onChange={(e) =>
                  updateField(
                    'defaultPassThresholdPct',
                    Number(e.target.value) || 50
                  )
                }
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div>
              <label
                htmlFor="setting-wrong-penalty"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                หักคะแนนเมื่อตอบผิดเริ่มต้น (คะแนน/ข้อ)
              </label>
              <input
                id="setting-wrong-penalty"
                type="number"
                min={0}
                max={5}
                step={0.25}
                value={settings.defaultWrongPenalty}
                onChange={(e) =>
                  updateField(
                    'defaultWrongPenalty',
                    Number.parseFloat(e.target.value) || 0
                  )
                }
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div>
              <label
                htmlFor="setting-upper-lower"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                สัดส่วนกลุ่มสูง/กลุ่มต่ำสำหรับค่า D (%)
              </label>
              <input
                id="setting-upper-lower"
                type="number"
                min={20}
                max={35}
                value={settings.upperLowerGroupPct}
                onChange={(e) =>
                  updateField('upperLowerGroupPct', Number(e.target.value) || 27)
                }
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>

          <div className="border-t border-slate-100 pt-5 dark:border-slate-800 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm font-medium text-slate-800 dark:text-slate-100">
                <input
                  type="checkbox"
                  checked={settings.useThai8GradeScale}
                  onChange={(e) =>
                    updateField('useThai8GradeScale', e.target.checked)
                  }
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                />
                <span>
                  เปิดใช้งานการคำนวณเกรด 8 ระดับ (4, 3.5, 3, 2.5, 2, 1.5, 1, 0) ในตารางผลสอบและไฟล์ส่งออก
                </span>
              </label>

              <button
                type="button"
                onClick={() =>
                  onUpdateSettings({
                    ...settings,
                    gradeCutoffs: { ...DEFAULT_GRADE_CUTOFFS },
                  })
                }
                className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
              >
                คืนค่าเกณฑ์ 80/75/70/65/60/55/50
              </button>
            </div>

            {settings.useThai8GradeScale && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                {(
                  [
                    ['g4', 'เกรด 4 (≥ %)'],
                    ['g35', 'เกรด 3.5 (≥ %)'],
                    ['g3', 'เกรด 3 (≥ %)'],
                    ['g25', 'เกรด 2.5 (≥ %)'],
                    ['g2', 'เกรด 2 (≥ %)'],
                    ['g15', 'เกรด 1.5 (≥ %)'],
                    ['g1', 'เกรด 1 (≥ %)'],
                  ] as Array<[keyof SystemSettings['gradeCutoffs'], string]>
                ).map(([key, label]) => (
                  <div key={key}>
                    <label
                      htmlFor={`cutoff-${key}`}
                      className="block text-[11px] font-medium text-slate-600 dark:text-slate-300"
                    >
                      {label}
                    </label>
                    <input
                      id={`cutoff-${key}`}
                      type="number"
                      min={10}
                      max={99}
                      value={settings.gradeCutoffs[key]}
                      onChange={(e) =>
                        updateCutoff(key, Number(e.target.value) || 0)
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Stage 4: Database Verification & Export */}
      {stage === 'stage4' && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              ขั้นตอนที่ 4: การตรวจสอบรหัสกับฐานข้อมูลและการส่งออกรายงานคะแนน
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              ควบคุมการจับคู่รหัสนักเรียนกับฐานข้อมูล การเตือนสแกนซ้ำ และคอลัมน์ข้อมูลในไฟล์ CSV / Excel / JSON
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(
              [
                [
                  'strictStudentDatabaseMatch',
                  'ตรวจสอบและแสดงสถานะยืนยันตัวตนกับฐานข้อมูลนักเรียนทุกแผ่นที่สแกน',
                ],
                [
                  'preventDuplicateStudentScan',
                  'แจ้งเตือนชัดเจนทันทีเมื่อพบรหัสนักเรียนซ้ำในชุดข้อสอบเดียวกัน',
                ],
                [
                  'csvIncludeGradeLevel',
                  'แนบคอลัมน์เกรด (0–4) และผลการประเมิน (ผ่าน/ไม่ผ่าน) ในไฟล์ส่งออก CSV',
                ],
                [
                  'csvIncludeItemBreakdown',
                  'แนบคำตอบรายข้อทุกข้อ (ข้อ 1..N) ท้ายตาราง CSV เพื่อส่งต่อฝ่ายวิชาการ',
                ],
              ] as Array<[keyof SystemSettings, string]>
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-800/50"
              >
                <input
                  type="checkbox"
                  checked={Boolean(settings[key])}
                  onChange={(e) => updateField(key, e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300">
            <strong>สรุปฐานข้อมูลปัจจุบัน:</strong> นักเรียน{' '}
            <span className="font-mono font-semibold">{students.length}</span> คน · ครูผู้สอน{' '}
            <span className="font-mono font-semibold">{teachers.length}</span> คน · รายวิชา{' '}
            <span className="font-mono font-semibold">{subjects.length}</span> วิชา · ชุดข้อสอบ{' '}
            <span className="font-mono font-semibold">{quizzes.length}</span> ชุด · ผลสแกนทั้งหมด{' '}
            <span className="font-mono font-semibold">{scans.length}</span> แผ่น (รหัส OMR{' '}
            <span className="font-mono font-semibold">{settings.studentIdDigits}</span> หลัก)
          </div>
        </section>
      )}

      {/* Full System Import / Export Hub */}
      {stage === 'io' && (
        <div className="space-y-6">
          {/* Export Hub */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  ส่งออกข้อมูลทั้งระบบและคะแนนหลังการตรวจ (System &amp; Score Export)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  ส่งออกคะแนนชุดข้อสอบที่กำลังเปิด ({activeQuiz.title} · {activeQuizScans.length} แผ่น) หรือสำรองข้อมูลทั้งหมดเพื่อย้ายเครื่อง
                </p>
              </div>
              <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                เฉลี่ย {summary.averagePercentage.toFixed(1)}%
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <button
                type="button"
                onClick={handleExportPostScoresCsv}
                className="flex min-h-[48px] items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left text-xs font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
              >
                <span>ส่งออกคะแนนหลังตรวจ (CSV Excel ภาษาไทย)</span>
                <Download className="h-4 w-4 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={handleExportPostScoresExcel}
                className="flex min-h-[48px] items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left text-xs font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
              >
                <span>ส่งออกคะแนนหลังตรวจ + เกรด (.XLS)</span>
                <FileSpreadsheet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={handleExportPostScoresJson}
                className="flex min-h-[48px] items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left text-xs font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
              >
                <span>ส่งออกผลคะแนนหลังตรวจครบชุด (JSON)</span>
                <FileJson className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={() => handleExportEntityJson('students')}
                className="flex min-h-[48px] items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left text-xs font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
              >
                <span>ส่งออกนักเรียนรูปแบบ DMC JSON ({students.length})</span>
                <Database className="h-4 w-4 text-slate-500" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={() => handleExportEntityJson('teachers')}
                className="flex min-h-[48px] items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left text-xs font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
              >
                <span>ส่งออกครูรูปแบบ HRMS JSON ({teachers.length})</span>
                <Database className="h-4 w-4 text-slate-500" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={handleExportFullBackup}
                className="flex min-h-[48px] items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50/70 px-4 py-3 text-left text-xs font-semibold text-indigo-800 hover:bg-indigo-100 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-200"
              >
                <span>สำรองข้อมูลทั้งระบบ (Full Backup JSON)</span>
                <Download className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </section>

          {/* Import Hub */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  นำเข้าข้อมูล JSON รองรับ DMC, HRMS, รายวิชา และกู้คืนทั้งระบบ
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  เลือกไฟล์ .json จากระบบ DMC / HRMS หรือวางข้อความ JSON ระบบจะตรวจจับโครงสร้างให้อัตโนมัติ
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelected(file);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>เลือกไฟล์ JSON</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="io-format-hint"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  รูปแบบข้อมูล JSON
                </label>
                <select
                  id="io-format-hint"
                  value={formatHint}
                  onChange={(e) => {
                    const nextHint = e.target.value as typeof formatHint;
                    setFormatHint(nextHint);
                    if (jsonText.trim()) handleParseText(jsonText, nextHint);
                  }}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="auto">ตรวจจับอัตโนมัติ (แนะนำ)</option>
                  <option value="dmc_students">นักเรียนจากระบบ DMC</option>
                  <option value="hrms_teachers">ครูและบุคลากรจากระบบ HRMS</option>
                  <option value="subjects">รายวิชาและกลุ่มสาระ</option>
                  <option value="backup">กู้คืนทั้งระบบ (Full Backup)</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="io-import-mode"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  วิธีการนำเข้า
                </label>
                <select
                  id="io-import-mode"
                  value={importMode}
                  onChange={(e) =>
                    setImportMode(e.target.value as 'merge' | 'replace')
                  }
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="merge">ผสานเพิ่มกับข้อมูลเดิม (Merge)</option>
                  <option value="replace">แทนที่ข้อมูลเดิมในหมวดที่พบ (Replace)</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-500 dark:text-slate-400">
                โหลดตัวอย่างโครงสร้าง:
              </span>
              <button
                type="button"
                onClick={() => handleParseText(SAMPLE_DMC_JSON, 'dmc_students')}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                ตัวอย่าง DMC (นักเรียน)
              </button>
              <button
                type="button"
                onClick={() =>
                  handleParseText(SAMPLE_HRMS_TEACHERS_JSON, 'hrms_teachers')
                }
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                ตัวอย่าง HRMS (ครู)
              </button>
              <button
                type="button"
                onClick={() => handleParseText(SAMPLE_SUBJECTS_JSON, 'subjects')}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                ตัวอย่างรายวิชา JSON
              </button>
            </div>

            <div>
              <label
                htmlFor="io-json-textarea"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                วางข้อมูล JSON ที่นี่
              </label>
              <textarea
                id="io-json-textarea"
                rows={7}
                value={jsonText}
                onChange={(e) => handleParseText(e.target.value)}
                placeholder='{"students": [...]} หรือ {"teachers": [...]} หรือไฟล์สำรองข้อมูล GradeScan'
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white p-3 font-mono text-xs text-slate-900 focus:border-indigo-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            {importPreview && (
              <div
                className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
                  importPreview.detectedType === 'unknown'
                    ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200'
                }`}
              >
                <div className="text-xs font-medium">
                  {importPreview.summaryText}
                </div>
                {importPreview.detectedType !== 'unknown' && (
                  <button
                    type="button"
                    onClick={handleConfirmImport}
                    className="inline-flex min-h-[38px] items-center justify-center rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap"
                  >
                    ยืนยันนำเข้าข้อมูล
                  </button>
                )}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Keep reference to DEFAULT_SYSTEM_SETTINGS visible in module */}
      <div className="sr-only">{DEFAULT_SYSTEM_SETTINGS.academicYear}</div>
    </div>
  );
}
