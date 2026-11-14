import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Printer,
  UserPlus,
} from 'lucide-react';
import type { ChoiceOption, Quiz, Student, SystemSettings } from '../types/omr';
import { normalizeThaiClassName } from '../utils/normalization';
import { getActiveChoices } from '../utils/omrAnalytics';
import { drawPrintableOmrSheet } from '../utils/omrCanvasRenderer';

interface AnswerSheetViewProps {
  activeQuiz: Quiz;
  students: Student[];
  settings: SystemSettings;
  onQuickAddStudent: (student: Student) => void;
  onBenchmark: (label: string, ms: number) => void;
}

export function AnswerSheetView({
  activeQuiz,
  students,
  settings,
  onQuickAddStudent,
  onBenchmark,
}: AnswerSheetViewProps) {
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [typedStudentCode, setTypedStudentCode] = useState<string>('');
  const [quickAddName, setQuickAddName] = useState<string>('');
  const [quickAddClass, setQuickAddClass] = useState<string>(activeQuiz.className);
  const [includeSampleFill, setIncludeSampleFill] = useState<boolean>(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const digits = settings.studentIdDigits;

  const matchedStudent = useMemo(() => {
    const clean = typedStudentCode.replace(/\D/g, '');
    if (clean.length > 0) {
      const padded = clean.padStart(digits, '0').slice(-digits);
      const exact = students.find(
        (s) => s.studentCode === clean || s.studentCode === padded
      );
      if (exact) return exact;
    }
    return students.find((s) => s.id === selectedStudentId);
  }, [typedStudentCode, selectedStudentId, students, digits]);

  const effectiveStudentCode = useMemo(() => {
    const clean = typedStudentCode.replace(/\D/g, '');
    if (clean.length > 0) {
      return clean.length < digits ? clean.padStart(digits, '0') : clean.slice(0, digits);
    }
    return matchedStudent?.studentCode ?? '';
  }, [typedStudentCode, matchedStudent, digits]);

  const hasTypedCode = typedStudentCode.replace(/\D/g, '').length > 0;
  const isDatabaseMatch = Boolean(matchedStudent);

  useEffect(() => {
    if (!canvasRef.current) return;
    const t0 = performance.now();

    const sampleAnswers: Record<number, ChoiceOption | null> = {};
    if (includeSampleFill) {
      const choices = getActiveChoices(activeQuiz.choiceCount);
      for (let q = 1; q <= activeQuiz.questionCount; q++) {
        const key = activeQuiz.answerKey[q] ?? 'A';
        sampleAnswers[q] =
          q % 5 === 0 ? choices[(choices.indexOf(key) + 1) % choices.length] : key;
      }
    }

    drawPrintableOmrSheet(canvasRef.current, {
      quiz: activeQuiz,
      studentCode: effectiveStudentCode,
      studentName: matchedStudent?.fullName ?? '',
      studentIdDigits: digits,
      prefillAnswers: sampleAnswers,
      schoolName: settings.schoolName,
      academicYear: settings.academicYear,
      semester: settings.semester,
    });

    const elapsed = Math.max(1, Math.round(performance.now() - t0));
    onBenchmark(`เรนเดอร์แบบฟอร์ม OMR ${activeQuiz.questionCount} ข้อ`, elapsed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeQuiz,
    effectiveStudentCode,
    matchedStudent,
    includeSampleFill,
    digits,
    settings.schoolName,
    settings.academicYear,
    settings.semester,
  ]);

  const handleDownloadPng = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    const suffix = effectiveStudentCode ? `_${effectiveStudentCode}` : '_blank';
    link.download = `OMR_${activeQuiz.questionCount}Q${suffix}.png`;
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
    onBenchmark('ดาวน์โหลดกระดาษคำตอบ PNG', 4);
  };

  const handleQuickAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = quickAddName.trim();
    if (!effectiveStudentCode || !cleanName) return;
    const newStudent: Student = {
      id: `stu_sheet_${Date.now()}`,
      studentCode: effectiveStudentCode,
      fullName: cleanName,
      className: normalizeThaiClassName(quickAddClass || activeQuiz.className),
      numberInClass: students.length + 1,
      sourceSystem: 'manual',
      createdAt: new Date().toISOString(),
    };
    onQuickAddStudent(newStudent);
    setSelectedStudentId(newStudent.id);
    setQuickAddName('');
  };

  return (
    <div className="space-y-6">
      <section className="no-print rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
              พิมพ์กระดาษคำตอบมาตรฐาน OMR (20 / 50 / 100 ข้อ)
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {settings.schoolName} · รองรับเลขประจำตัว {digits} หลัก พร้อมกรอกรหัสตรวจสอบกับฐานข้อมูลนักเรียนทันที
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleDownloadPng}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 whitespace-nowrap"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              <span>ดาวน์โหลด PNG</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 whitespace-nowrap"
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
              <span>สั่งพิมพ์ / บันทึก PDF</span>
            </button>
          </div>
        </div>

        {/* Direct Student ID Input + Dropdown Selector */}
        <div className="mt-5 grid grid-cols-1 gap-4 border-t border-slate-100 pt-5 lg:grid-cols-12 dark:border-slate-800">
          <div className="lg:col-span-4">
            <label
              htmlFor="sheet-student-code-input"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              กรอกเลขประจำตัวนักเรียน ({digits} หลัก) เพื่อตรวจสอบฐานข้อมูล
            </label>
            <input
              id="sheet-student-code-input"
              type="text"
              maxLength={digits}
              value={typedStudentCode}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '');
                setTypedStudentCode(val);
                const match = students.find(
                  (s) =>
                    s.studentCode === val ||
                    s.studentCode === val.padStart(digits, '0')
                );
                setSelectedStudentId(match ? match.id : '');
              }}
              placeholder={`พิมพ์รหัส เช่น 1001`}
              className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 font-mono text-sm text-slate-900 focus:border-indigo-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div className="lg:col-span-5">
            <label
              htmlFor="sheet-student-select"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              หรือเลือกจากฐานข้อมูลนักเรียน ({students.length} คน)
            </label>
            <select
              id="sheet-student-select"
              value={selectedStudentId}
              onChange={(e) => {
                const id = e.target.value;
                setSelectedStudentId(id);
                const stu = students.find((s) => s.id === id);
                setTypedStudentCode(stu ? stu.studentCode : '');
              }}
              className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="">กระดาษเปล่า (ให้นักเรียนฝนรหัส {digits} หลักเอง)</option>
              {students.map((stu) => (
                <option key={stu.id} value={stu.id}>
                  {stu.studentCode} · {stu.fullName} ({stu.className})
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-3 flex items-end pb-1">
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={includeSampleFill}
                onChange={(e) => setIncludeSampleFill(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
              />
              <span>ฝนตัวอย่างคำตอบในภาพ</span>
            </label>
          </div>
        </div>

        {/* Live Database Lookup Feedback */}
        {(hasTypedCode || selectedStudentId) && (
          <div className="mt-4">
            {isDatabaseMatch && matchedStudent ? (
              <div
                data-testid="sheet-db-match-status"
                className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200"
              >
                <CheckCircle2
                  className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                  aria-hidden="true"
                />
                <span>
                  พบข้อมูลตรงกับฐานข้อมูล:{' '}
                  <strong className="font-mono">{matchedStudent.studentCode}</strong> ·{' '}
                  {matchedStudent.fullName} · {matchedStudent.className} (เลขที่{' '}
                  {matchedStudent.numberInClass})
                </span>
              </div>
            ) : (
              <div
                data-testid="sheet-db-unmatched-status"
                className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30 space-y-3"
              >
                <div className="flex items-center gap-2 text-xs font-medium text-amber-900 dark:text-amber-200">
                  <AlertTriangle
                    className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
                    aria-hidden="true"
                  />
                  <span>
                    ไม่พบรหัส <strong className="font-mono">{effectiveStudentCode}</strong>{' '}
                    ในฐานข้อมูลนักเรียน — ระบบฝนรหัสบนกระดาษให้แล้ว หรือกรอกชื่อเพื่อบันทึกเข้าฐานข้อมูลทันที
                  </span>
                </div>

                <form
                  onSubmit={handleQuickAddSubmit}
                  className="grid grid-cols-1 gap-2 sm:grid-cols-12"
                >
                  <input
                    aria-label="ชื่อนักเรียนสำหรับรหัสใหม่"
                    type="text"
                    value={quickAddName}
                    onChange={(e) => setQuickAddName(e.target.value)}
                    placeholder="ชื่อ-สกุลนักเรียนใหม่"
                    className="sm:col-span-5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs text-slate-900 dark:border-amber-700 dark:bg-slate-900 dark:text-white"
                  />
                  <input
                    aria-label="ห้องเรียนนักเรียนใหม่"
                    type="text"
                    value={quickAddClass}
                    onChange={(e) => setQuickAddClass(e.target.value)}
                    placeholder="ห้องเรียน เช่น ม.1/1"
                    className="sm:col-span-4 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs text-slate-900 dark:border-amber-700 dark:bg-slate-900 dark:text-white"
                  />
                  <button
                    type="submit"
                    className="sm:col-span-3 inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
                  >
                    <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>เพิ่มเข้าฐานข้อมูล</span>
                  </button>
                </form>
              </div>
            )}
          </div>
        )}

        <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/70 px-4 py-3 text-xs text-indigo-900 dark:border-indigo-900/50 dark:bg-indigo-950/30 dark:text-indigo-200">
          <strong>มาตรฐานการพิมพ์เพื่อให้สแกนมุมแม่นยำ 100%:</strong> ตั้งค่า Scale เป็น{' '}
          <span className="font-mono font-semibold">100% / Actual Size</span> (ห้ามเลือก Fit to Page), ใช้กระดาษด้าน 80 แกรมขึ้นไป และวางบนโต๊ะสีเข้มขณะสแกนด้วยกล้อง
        </div>
      </section>

      {/* Printable A4 Sheet Preview */}
      <section className="flex justify-center">
        <div className="print-only-sheet w-full max-w-[780px] overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800">
          <canvas
            ref={canvasRef}
            data-testid="printable-omr-canvas"
            className="w-full h-auto block"
          />
        </div>
      </section>
    </div>
  );
}
