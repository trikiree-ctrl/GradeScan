import {
  AlertTriangle,
  ArrowRight,
  Award,
  BarChart2,
  Camera,
  CheckCircle2,
  FileCheck2,
  Printer,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import type {
  AppView,
  ItemAnalysisStat,
  Quiz,
  QuizSummaryStats,
  ScannedSheet,
  Student,
} from '../types/omr';
import { formatThaiDateTime } from '../utils/normalization';

interface DashboardViewProps {
  activeQuiz: Quiz;
  scans: ScannedSheet[];
  students: Student[];
  summary: QuizSummaryStats;
  itemStats: ItemAnalysisStat[];
  onNavigate: (view: AppView) => void;
  onDeleteScan: (scanId: string) => void;
  onInspectScan: (scanId: string) => void;
}

export function DashboardView({
  activeQuiz,
  scans,
  students,
  summary,
  itemStats,
  onNavigate,
  onDeleteScan,
  onInspectScan,
}: DashboardViewProps) {
  // Build 5 score percentage buckets with vibrant semantic gradient colors
  const buckets = [
    { label: '0–39%', min: 0, max: 39.99, count: 0, barColor: 'bg-rose-500 dark:bg-rose-500' },
    { label: '40–49%', min: 40, max: 49.99, count: 0, barColor: 'bg-amber-500 dark:bg-amber-400' },
    { label: '50–64%', min: 50, max: 64.99, count: 0, barColor: 'bg-sky-500 dark:bg-sky-400' },
    { label: '65–79%', min: 65, max: 79.99, count: 0, barColor: 'bg-indigo-600 dark:bg-indigo-500' },
    { label: '80–100%', min: 80, max: 100.01, count: 0, barColor: 'bg-emerald-500 dark:bg-emerald-400' },
  ];

  for (const s of scans) {
    const b = buckets.find((bk) => s.percentage >= bk.min && s.percentage <= bk.max);
    if (b) b.count++;
  }
  const maxBucketCount = Math.max(1, ...buckets.map((b) => b.count));

  const problematicItems = [...itemStats]
    .filter((item) => item.totalAttempts > 0)
    .sort((a, b) => a.discriminationIndex - b.discriminationIndex || a.difficultyIndex - b.difficultyIndex)
    .slice(0, 4);

  const maxPossible = activeQuiz.questionCount * activeQuiz.pointsPerQuestion;

  return (
    <div className="space-y-6">
      {/* Vibrant Hero Banner */}
      <section className="rounded-2xl bg-gradient-to-br from-indigo-600 via-blue-600 to-sky-600 p-6 text-white shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-blue-100 font-medium">
              <span>ชุดข้อสอบที่กำลังใช้งาน</span>
              <span aria-hidden="true">·</span>
              <span>{activeQuiz.subject}</span>
              <span aria-hidden="true">·</span>
              <span>{activeQuiz.className}</span>
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
              {activeQuiz.title}
            </h1>
            <p className="text-sm text-blue-50">
              รองรับกระดาษคำตอบ {activeQuiz.questionCount} ข้อ ({activeQuiz.choiceCount} ตัวเลือก) · คะแนนเต็ม{' '}
              <span className="font-mono tabular-nums font-semibold text-white">{maxPossible}</span> คะแนน · นักเรียนในระบบ{' '}
              <span className="font-mono tabular-nums font-semibold text-white">{students.length}</span> คน
            </p>
          </div>

          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('sheets')}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/30 bg-white/15 px-4 py-2.5 text-sm font-medium text-white backdrop-blur-sm hover:bg-white/25 whitespace-nowrap"
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
              <span>พิมพ์กระดาษคำตอบ</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('scanner')}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-indigo-700 shadow-sm hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white whitespace-nowrap"
            >
              <Camera className="h-4 w-4" aria-hidden="true" />
              <span>สแกนตรวจต่อเนื่อง</span>
            </button>
          </div>
        </div>
      </section>

      {/* 4 KPI Summary Strip with Vibrant Category Icon Accents */}
      <section aria-label="ตัวชี้วัดหลัก" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              จำนวนกระดาษที่ตรวจแล้ว
            </p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
              <FileCheck2 className="h-4 w-4" aria-hidden="true" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-white">
            {summary.totalScanned} แผ่น
          </p>
          <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
            ผ่านเกณฑ์ (≥50%) {summary.passCount} คน · {summary.passRate.toFixed(0)}%
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              คะแนนเฉลี่ย (Mean ± SD)
            </p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400">
              <BarChart2 className="h-4 w-4" aria-hidden="true" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-white">
            {summary.averageScore.toFixed(1)} / {maxPossible}
          </p>
          <p className="mt-1 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
            เฉลี่ย {summary.averagePercentage.toFixed(1)}% · SD {summary.standardDeviation.toFixed(2)}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              ช่วงคะแนน (สูงสุด / ต่ำสุด)
            </p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
              <Award className="h-4 w-4" aria-hidden="true" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-white">
            {summary.highestScore} / {summary.lowestScore}
          </p>
          <p className="mt-1 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
            มัธยฐาน (Median) {summary.medianScore.toFixed(1)} คะแนน
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              ความเชื่อมั่นข้อสอบ (KR-20)
            </p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-950/60 dark:text-violet-400">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-white">
            {summary.kr20Reliability !== null ? summary.kr20Reliability.toFixed(2) : '—'}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {summary.kr20Reliability === null
              ? 'ต้องตรวจอย่างน้อย 3 แผ่น'
              : summary.kr20Reliability >= 0.7
              ? 'เกณฑ์ดี (≥ 0.70)'
              : 'ควรทบทวนข้อสอบรายข้อ'}
          </p>
        </div>
      </section>

      {/* Score Histogram + Item Alert Split */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                การกระจายตัวของช่วงคะแนน
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                จำนวนผู้เข้าสอบจำแนกตามช่วงร้อยละคะแนน
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('analysis')}
              className="inline-flex min-h-[40px] items-center gap-1 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400 whitespace-nowrap"
            >
              <span>ดูวิเคราะห์ข้อสอบ</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-6 grid grid-cols-5 items-end gap-3 h-48 pt-6">
            {buckets.map((bucket) => {
              const heightPct =
                scans.length === 0 ? 6 : Math.max(10, (bucket.count / maxBucketCount) * 100);
              return (
                <div key={bucket.label} className="flex flex-col items-center h-full justify-end gap-2">
                  <span className="text-xs font-mono tabular-nums font-semibold text-slate-700 dark:text-slate-300">
                    {bucket.count}
                  </span>
                  <div className="w-full flex-1 flex items-end justify-center">
                    <div
                      style={{ height: `${heightPct}%` }}
                      className={`w-full max-w-[56px] rounded-t-lg transition-all ${
                        bucket.count === 0
                          ? 'bg-slate-100 dark:bg-slate-800'
                          : bucket.barColor
                      }`}
                      title={`${bucket.label}: ${bucket.count} คน`}
                    />
                  </div>
                  <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {bucket.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              ข้อสอบที่ควรทบทวน (Item Alert)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              อ้างอิงค่าอำนาจจำแนก (D) และความยาก (p)
            </p>
          </div>

          {problematicItems.length === 0 ? (
            <div className="mt-8 text-center text-sm text-slate-500 dark:text-slate-400">
              ยังไม่มีข้อมูลสแกนสำหรับชุดข้อสอบนี้
            </div>
          ) : (
            <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
              {problematicItems.map((item) => {
                const needsAttention = item.qualityLabel === 'ควรปรับปรุง' || item.discriminationIndex < 0.2;
                return (
                  <div
                    key={item.questionNumber}
                    className="flex items-center justify-between py-3 text-sm"
                  >
                    <div className="flex items-center gap-3">
                      {needsAttention ? (
                        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                      )}
                      <div>
                        <p className="font-medium text-slate-900 dark:text-white">
                          ข้อที่ {item.questionNumber} · เฉลย {item.correctChoice}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {item.qualityLabel} · ตอบถูก {item.correctCount}/{item.totalAttempts}
                        </p>
                      </div>
                    </div>
                    <div className="text-right font-mono tabular-nums text-xs">
                      <div className="text-slate-700 dark:text-slate-200">
                        p = {item.difficultyIndex.toFixed(2)}
                      </div>
                      <div className="text-slate-500 dark:text-slate-400">
                        D = {item.discriminationIndex.toFixed(2)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Recent Scanned Papers Table */}
      <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-2 border-b border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              ผลการตรวจกระดาษคำตอบล่าสุด
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              แตะที่รายชื่อเพื่อดูคำตอบรายข้อหรือแก้ไขรอยฝนที่อ่านผิดพลาด
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
            ทั้งหมด {scans.length} รายการ
          </span>
        </div>

        {scans.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              ยังไม่มีกระดาษคำตอบที่สแกนสำหรับชุดข้อสอบนี้
            </p>
            <button
              type="button"
              onClick={() => onNavigate('scanner')}
              className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              <Camera className="h-4 w-4" aria-hidden="true" />
              <span>เริ่มสแกนแผ่นแรก</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
                  <th className="px-6 py-3">รหัส</th>
                  <th className="px-4 py-3">ชื่อ-นามสกุล</th>
                  <th className="hidden sm:table-cell px-4 py-3">ห้องเรียน</th>
                  <th className="px-4 py-3 text-right">คะแนน</th>
                  <th className="px-4 py-3 text-right">ร้อยละ</th>
                  <th className="hidden md:table-cell px-4 py-3">สถานะการอ่าน</th>
                  <th className="hidden lg:table-cell px-4 py-3">เวลาตรวจ</th>
                  <th className="px-6 py-3 text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {scans.map((scan) => {
                  const passed = scan.percentage >= 50;
                  return (
                    <tr
                      key={scan.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-6 py-3 font-mono tabular-nums text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                        {scan.detectedStudentCode}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                        <button
                          type="button"
                          onClick={() => onInspectScan(scan.id)}
                          className="min-h-[40px] text-left hover:text-indigo-600 hover:underline dark:hover:text-indigo-400"
                        >
                          {scan.studentName}
                        </button>
                      </td>
                      <td className="hidden sm:table-cell px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                        {scan.className}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                        {scan.score}/{scan.maxScore}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-xs">
                        <span
                          className={
                            passed
                              ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                              : 'text-rose-600 dark:text-rose-400 font-semibold'
                          }
                        >
                          {scan.percentage.toFixed(1)}%
                        </span>
                      </td>
                      <td className="hidden md:table-cell px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                        ถูก {scan.correctCount} · ผิด {scan.incorrectCount}
                        {scan.blankCount > 0 ? ` · เว้น ${scan.blankCount}` : ''}
                        {scan.multipleCount > 0 ? ` · ซ้ำ ${scan.multipleCount}` : ''}
                      </td>
                      <td className="hidden lg:table-cell px-4 py-3 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {formatThaiDateTime(scan.scannedAt)}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => onDeleteScan(scan.id)}
                          aria-label={`ลบผลตรวจของ ${scan.studentName}`}
                          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
