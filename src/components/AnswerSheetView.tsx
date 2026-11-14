import { useEffect, useRef, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import type { ChoiceOption, Quiz, Student } from '../types/omr';
import { drawPrintableOmrSheet } from '../utils/omrCanvasRenderer';
import { getActiveChoices } from '../utils/omrAnalytics';

interface AnswerSheetViewProps {
  activeQuiz: Quiz;
  students: Student[];
  onBenchmark: (label: string, ms: number) => void;
}

export function AnswerSheetView({
  activeQuiz,
  students,
  onBenchmark,
}: AnswerSheetViewProps) {
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [includeSampleFill, setIncludeSampleFill] = useState<boolean>(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const selectedStudent = students.find((s) => s.id === selectedStudentId);

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
      studentCode: selectedStudent?.studentCode ?? '',
      studentName: selectedStudent?.fullName ?? '',
      prefillAnswers: sampleAnswers,
    });

    const elapsed = Math.max(1, Math.round(performance.now() - t0));
    onBenchmark(`เรนเดอร์แบบฟอร์ม OMR ${activeQuiz.questionCount} ข้อ`, elapsed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeQuiz, selectedStudentId, includeSampleFill]);

  const handleDownloadPng = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    const suffix = selectedStudent ? `_${selectedStudent.studentCode}` : '_blank';
    link.download = `OMR_${activeQuiz.questionCount}Q${suffix}.png`;
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
    onBenchmark('ดาวน์โหลดกระดาษคำตอบ PNG', 4);
  };

  return (
    <div className="space-y-6">
      <section className="no-print rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
              พิมพ์กระดาษคำตอบมาตรฐาน OMR (20 / 50 / 100 ข้อ)
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              แนะนำให้พิมพ์ลงบนกระดาษขาวหนาปานกลาง (80 แกรมขึ้นไป) โดยเว้นขอบสี่เหลี่ยมสีดำทั้ง 4 มุมให้ชัดเจน
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleDownloadPng}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 whitespace-nowrap"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              <span>ดาวน์โหลด PNG</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 whitespace-nowrap"
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
              <span>สั่งพิมพ์ / บันทึก PDF</span>
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2 dark:border-slate-800">
          <div>
            <label
              htmlFor="sheet-student-select"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              พิมพ์รหัสและชื่อนักเรียนล่วงหน้า (ไม่บังคับ)
            </label>
            <select
              id="sheet-student-select"
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="">กระดาษเปล่า (ให้นักเรียนฝนรหัส 4 หลักเอง)</option>
              {students.map((stu) => (
                <option key={stu.id} value={stu.id}>
                  {stu.studentCode} · {stu.fullName} ({stu.className})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end pb-1">
            <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={includeSampleFill}
                onChange={(e) => setIncludeSampleFill(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
              />
              <span>ฝนตัวอย่างคำตอบลงในภาพ (ใช้ดาวน์โหลดไปอัปโหลดทดสอบสแกน)</span>
            </label>
          </div>
        </div>

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
