import { useState } from 'react';
import { Download, FileSpreadsheet, Printer } from 'lucide-react';
import type {
  ItemAnalysisStat,
  ItemQualityLevel,
  Quiz,
  QuizSummaryStats,
  ScannedSheet,
} from '../types/omr';
import { exportScansToCsv } from '../utils/normalization';
import { getActiveChoices } from '../utils/omrAnalytics';

interface ItemAnalysisViewProps {
  activeQuiz: Quiz;
  scans: ScannedSheet[];
  itemStats: ItemAnalysisStat[];
  summary: QuizSummaryStats;
  onBenchmark: (label: string, ms: number) => void;
}

type QualityFilter = 'all' | 'ดีมาก' | 'เหมาะสม' | 'ควรปรับปรุง' | 'extreme';

export function ItemAnalysisView({
  activeQuiz,
  scans,
  itemStats,
  summary,
  onBenchmark,
}: ItemAnalysisViewProps) {
  const [filter, setFilter] = useState<QualityFilter>('all');
  const choices = getActiveChoices(activeQuiz.choiceCount);

  const avgDifficulty =
    itemStats.length > 0
      ? itemStats.reduce((acc, i) => acc + i.difficultyIndex, 0) / itemStats.length
      : 0;
  const avgDiscrimination =
    itemStats.length > 0
      ? itemStats.reduce((acc, i) => acc + i.discriminationIndex, 0) /
        itemStats.length
      : 0;

  const filteredItems = itemStats.filter((item) => {
    if (filter === 'all') return true;
    if (filter === 'extreme') {
      return (
        item.qualityLabel === 'ง่ายเกินไป' || item.qualityLabel === 'ยากเกินไป'
      );
    }
    return item.qualityLabel === filter;
  });

  const handleExportCsv = () => {
    const t0 = performance.now();
    const csv = exportScansToCsv(activeQuiz, scans);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gradescan_${activeQuiz.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onBenchmark('ส่งออกไฟล์ CSV คะแนนนักเรียน', Math.max(1, Math.round(performance.now() - t0)));
  };

  const handleExportExcelHtml = () => {
    const t0 = performance.now();
    const rowsHtml = scans
      .map(
        (s) =>
          `<tr><td>${s.detectedStudentCode}</td><td>${s.studentName}</td><td>${s.className}</td><td>${s.score}</td><td>${s.maxScore}</td><td>${s.percentage.toFixed(1)}%</td></tr>`
      )
      .join('');
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8" /></head><body><table><thead><tr><th>รหัส</th><th>ชื่อ-สกุล</th><th>ห้องเรียน</th><th>คะแนน</th><th>เต็ม</th><th>ร้อยละ</th></tr></thead><tbody>${rowsHtml}</tbody></table></body></html>`;
    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gradescan_${activeQuiz.id}.xls`;
    a.click();
    URL.revokeObjectURL(url);
    onBenchmark('ส่งออกไฟล์ Excel (.xls)', Math.max(1, Math.round(performance.now() - t0)));
  };

  const handleExportItemAnalysisCsv = () => {
    const t0 = performance.now();
    const header = [
      'ข้อที่',
      'เฉลย',
      'จำนวนเข้าสอบ',
      'ตอบถูก',
      'ค่าความยาก (p)',
      'อำนาจจำแนก (D)',
      'คุณภาพข้อสอบ',
      ...choices.map((c) => `เลือก_${c}`),
      'เว้นว่าง',
      'ฝนซ้ำ',
    ];
    const rows = itemStats.map((item) => [
      String(item.questionNumber),
      item.correctChoice,
      String(item.totalAttempts),
      String(item.correctCount),
      item.difficultyIndex.toFixed(2),
      item.discriminationIndex.toFixed(2),
      item.qualityLabel,
      ...choices.map((c) => String(item.choiceDistribution[c] ?? 0)),
      String(item.blankCount),
      String(item.multipleCount),
    ]);
    const csv = '\uFEFF' + [header, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gradescan_item_analysis_${activeQuiz.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onBenchmark(
      'ส่งออกวิเคราะห์รายข้อ CSV',
      Math.max(1, Math.round(performance.now() - t0))
    );
  };

  const qualityTextClass = (q: ItemQualityLevel): string => {
    if (q === 'ดีมาก') return 'text-emerald-700 dark:text-emerald-400 font-medium';
    if (q === 'เหมาะสม') return 'text-blue-700 dark:text-blue-400 font-medium';
    if (q === 'ควรปรับปรุง') return 'text-red-600 dark:text-red-400 font-medium';
    return 'text-amber-700 dark:text-amber-400 font-medium';
  };

  // Scatter plot dimensions (Difficulty p on X: 0..1, Discrimination D on Y: -0.4..1.0)
  const plotW = 560;
  const plotH = 240;
  const padL = 52;
  const padR = 24;
  const padT = 18;
  const padB = 38;
  const innerW = plotW - padL - padR;
  const innerH = plotH - padT - padB;

  const mapX = (p: number) => padL + Math.max(0, Math.min(1, p)) * innerW;
  const mapY = (d: number) => {
    const clamped = Math.max(-0.4, Math.min(1, d));
    const norm = (clamped - -0.4) / 1.4;
    return padT + (1 - norm) * innerH;
  };

  // Compute collision-free display coordinates for points sharing identical (p, D)
  const coordBuckets = new Map<string, number>();
  const plottedPoints = itemStats.map((item) => {
    const key = `${item.difficultyIndex.toFixed(2)}_${item.discriminationIndex.toFixed(2)}`;
    const idx = coordBuckets.get(key) ?? 0;
    coordBuckets.set(key, idx + 1);
    const angle = idx * 2.2;
    const radius = idx === 0 ? 0 : Math.min(16, 7 + idx * 2.5);
    return {
      item,
      cx: mapX(item.difficultyIndex) + Math.cos(angle) * radius,
      cy: mapY(item.discriminationIndex) + Math.sin(angle) * radius,
    };
  });

  return (
    <div className="space-y-6">
      {/* Header & Export Toolbar */}
      <section className="no-print rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
              วิเคราะห์คุณภาพข้อสอบรายข้อ (Item Analysis) และส่งออกข้อมูล
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {activeQuiz.title} · วิเคราะห์จากกระดาษคำตอบที่ตรวจแล้ว{' '}
              <span className="font-mono tabular-nums font-medium">{scans.length}</span> แผ่น
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>ส่งออกคะแนน CSV</span>
            </button>
            <button
              type="button"
              onClick={handleExportItemAnalysisCsv}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>ส่งออกวิเคราะห์รายข้อ CSV</span>
            </button>
            <button
              type="button"
              onClick={handleExportExcelHtml}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 whitespace-nowrap"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
              <span>ส่งออก Excel</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-blue-700 whitespace-nowrap"
            >
              <Printer className="h-3.5 w-3.5" aria-hidden="true" />
              <span>พิมพ์รายงาน PDF</span>
            </button>
          </div>
        </div>

        {/* Summary Metrics */}
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-slate-100 pt-5 sm:grid-cols-4 dark:border-slate-800">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">ค่าความยากเฉลี่ย (p̄)</div>
            <div className="mt-1 font-mono tabular-nums text-lg font-semibold text-slate-900 dark:text-white">
              {avgDifficulty.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">อำนาจจำแนกเฉลี่ย (D̄)</div>
            <div className="mt-1 font-mono tabular-nums text-lg font-semibold text-slate-900 dark:text-white">
              {avgDiscrimination.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">ความเชื่อมั่น KR-20</div>
            <div className="mt-1 font-mono tabular-nums text-lg font-semibold text-slate-900 dark:text-white">
              {summary.kr20Reliability !== null ? summary.kr20Reliability.toFixed(2) : '—'}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">ข้อที่ได้เกณฑ์ดีมาก</div>
            <div className="mt-1 font-mono tabular-nums text-lg font-semibold text-emerald-600 dark:text-emerald-400">
              {itemStats.filter((i) => i.qualityLabel === 'ดีมาก').length} / {activeQuiz.questionCount}
            </div>
          </div>
        </div>
      </section>

      {/* Scatter Plot: Difficulty p vs Discrimination D */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              แผนภาพความสัมพันธ์ค่าความยาก (p) และอำนาจจำแนก (D)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              พื้นที่สีฟ้าแสดงเกณฑ์ข้อสอบมาตรฐาน (p 0.25–0.80 และ D ≥ 0.20)
            </p>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <svg
            viewBox={`0 0 ${plotW} ${plotH}`}
            className="w-full max-w-3xl h-auto"
            role="img"
            aria-label="กราฟกระจายค่าความยากและอำนาจจำแนก"
          >
            {/* Ideal zone rectangle */}
            <rect
              x={mapX(0.25)}
              y={mapY(1.0)}
              width={mapX(0.8) - mapX(0.25)}
              height={mapY(0.2) - mapY(1.0)}
              fill="rgba(37, 99, 235, 0.08)"
              stroke="rgba(37, 99, 235, 0.25)"
              strokeDasharray="4 3"
            />
            {/* Zero discrimination axis */}
            <line
              x1={padL}
              y1={mapY(0)}
              x2={plotW - padR}
              y2={mapY(0)}
              stroke="currentColor"
              className="text-slate-300 dark:text-slate-700"
              strokeWidth={1}
            />
            {/* X & Y Axes */}
            <line
              x1={padL}
              y1={padT}
              x2={padL}
              y2={plotH - padB}
              stroke="currentColor"
              className="text-slate-300 dark:text-slate-700"
            />
            <line
              x1={padL}
              y1={plotH - padB}
              x2={plotW - padR}
              y2={plotH - padB}
              stroke="currentColor"
              className="text-slate-300 dark:text-slate-700"
            />

            {[0, 0.25, 0.5, 0.75, 1].map((pTick) => (
              <text
                key={pTick}
                x={mapX(pTick)}
                y={plotH - 20}
                textAnchor="middle"
                className="fill-slate-500 dark:fill-slate-400 text-[10px] font-mono"
              >
                {pTick.toFixed(2)}
              </text>
            ))}

            <text
              x={padL + innerW / 2}
              y={plotH - 4}
              textAnchor="middle"
              className="fill-slate-500 dark:fill-slate-400 text-[10px]"
            >
              ค่าความยาก (p)
            </text>

            {[-0.2, 0, 0.2, 0.5, 0.8].map((dTick) => (
              <text
                key={dTick}
                x={padL - 8}
                y={mapY(dTick) + 3}
                textAnchor="end"
                className="fill-slate-500 dark:fill-slate-400 text-[10px] font-mono"
              >
                {dTick.toFixed(1)}
              </text>
            ))}

            {plottedPoints.map(({ item, cx, cy }) => {
              const color =
                item.qualityLabel === 'ดีมาก'
                  ? '#16A34A'
                  : item.qualityLabel === 'เหมาะสม'
                  ? '#2563EB'
                  : item.qualityLabel === 'ควรปรับปรุง'
                  ? '#DC2626'
                  : '#D97706';
              return (
                <g key={item.questionNumber}>
                  <title>{`ข้อ ${item.questionNumber} (เฉลย ${item.correctChoice}): p = ${item.difficultyIndex.toFixed(2)}, D = ${item.discriminationIndex.toFixed(2)} (${item.qualityLabel})`}</title>
                  <circle cx={cx} cy={cy} r={8} fill={color} opacity={0.92} />
                  <text
                    x={cx}
                    y={cy + 3}
                    textAnchor="middle"
                    className="fill-white text-[8.5px] font-mono font-semibold pointer-events-none"
                  >
                    {item.questionNumber}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </section>

      {/* Detailed Item Table */}
      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            ตารางวิเคราะห์รายข้อและการกระจายตัวลวง (Distractor Analysis)
          </h2>

          <div className="no-print flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            {(
              [
                ['all', 'ทั้งหมด'],
                ['ดีมาก', 'ดีมาก'],
                ['เหมาะสม', 'เหมาะสม'],
                ['ควรปรับปรุง', 'ควรปรับปรุง'],
                ['extreme', 'ง่าย/ยากเกินไป'],
              ] as Array<[QualityFilter, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  filter === key
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
                <th className="px-6 py-3">ข้อที่</th>
                <th className="px-4 py-3">เฉลย</th>
                <th className="px-4 py-3 text-right">ตอบถูก</th>
                <th className="px-4 py-3 text-right">ความยาก (p)</th>
                <th className="px-4 py-3 text-right">อำนาจจำแนก (D)</th>
                <th className="px-4 py-3">สัดส่วนการเลือกตัวเลือก</th>
                <th className="px-6 py-3">ผลการประเมิน</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredItems.map((item) => (
                <tr
                  key={item.questionNumber}
                  className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                >
                  <td className="px-6 py-3 font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                    {String(item.questionNumber).padStart(2, '0')}
                  </td>
                  <td className="px-4 py-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                    {item.correctChoice}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-xs text-slate-700 dark:text-slate-300">
                    {item.correctCount}/{item.totalAttempts}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-xs text-slate-900 dark:text-white">
                    {item.difficultyIndex.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-xs text-slate-900 dark:text-white">
                    {item.discriminationIndex.toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2 font-mono tabular-nums text-[11px]">
                      {choices.map((opt) => {
                        const count = item.choiceDistribution[opt] ?? 0;
                        const isKey = opt === item.correctChoice;
                        return (
                          <span
                            key={opt}
                            className={
                              isKey
                                ? 'font-bold text-emerald-700 dark:text-emerald-400'
                                : 'text-slate-500 dark:text-slate-400'
                            }
                          >
                            {opt}:{count}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                  <td className={`px-6 py-3 text-xs ${qualityTextClass(item.qualityLabel)}`}>
                    {item.qualityLabel}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
