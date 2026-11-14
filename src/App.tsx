import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Moon, Sun } from 'lucide-react';
import { AnswerSheetView } from './components/AnswerSheetView';
import { ClassesView } from './components/ClassesView';
import { DashboardView } from './components/DashboardView';
import { ItemAnalysisView } from './components/ItemAnalysisView';
import { MobileNav } from './components/MobileNav';
import { QuizzesView } from './components/QuizzesView';
import { ScannerView } from './components/ScannerView';
import { Sidebar } from './components/Sidebar';
import { SmartHud } from './components/SmartHud';
import { StudyGuideView } from './components/StudyGuideView';
import { SEED_QUIZZES, SEED_SCANS, SEED_STUDENTS } from './data/seedData';
import type {
  AppView,
  ChoiceOption,
  HudState,
  Quiz,
  ScannedSheet,
  Student,
} from './types/omr';
import { computeStateHash } from './utils/normalization';
import {
  computeItemAnalysis,
  computeQuizSummary,
  gradeResponse,
} from './utils/omrAnalytics';

interface PersistedState {
  students: Student[];
  quizzes: Quiz[];
  scans: ScannedSheet[];
  activeQuizId: string;
  darkMode: boolean;
}

const STORAGE_KEY = 'gradescan_omr_state_v1';

const VIEW_TITLES: Record<AppView, string> = {
  dashboard: 'ภาพรวมและสถิติ',
  scanner: 'สแกนตรวจข้อสอบ',
  quizzes: 'ชุดข้อสอบและเฉลย',
  sheets: 'กระดาษคำตอบ OMR',
  analysis: 'วิเคราะห์ข้อสอบ',
  classes: 'ชั้นเรียนและนักเรียน',
  guide: 'คู่มือศึกษา ZipGrade',
};

function loadInitialState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      if (
        Array.isArray(parsed.quizzes) &&
        parsed.quizzes.length > 0 &&
        Array.isArray(parsed.students) &&
        Array.isArray(parsed.scans)
      ) {
        return {
          students: parsed.students,
          quizzes: parsed.quizzes,
          scans: parsed.scans,
          activeQuizId: parsed.activeQuizId ?? parsed.quizzes[0].id,
          darkMode: Boolean(parsed.darkMode),
        };
      }
    }
  } catch {
    // Fallback to clean seed state if storage is corrupt or unavailable
  }
  return {
    students: SEED_STUDENTS,
    quizzes: SEED_QUIZZES,
    scans: SEED_SCANS,
    activeQuizId: SEED_QUIZZES[0].id,
    darkMode: false,
  };
}

export default function App() {
  const initial = useMemo(() => loadInitialState(), []);

  const [students, setStudents] = useState<Student[]>(initial.students);
  const [quizzes, setQuizzes] = useState<Quiz[]>(initial.quizzes);
  const [scans, setScans] = useState<ScannedSheet[]>(initial.scans);
  const [activeQuizId, setActiveQuizId] = useState<string>(initial.activeQuizId);
  const [darkMode, setDarkMode] = useState<boolean>(initial.darkMode);

  const [activeView, setActiveView] = useState<AppView>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [inspectedScanId, setInspectedScanId] = useState<string | null>(null);
  const [hud, setHud] = useState<HudState>({
    active: false,
    label: '',
    status: 'done',
    benchmarkMs: 0,
  });

  const hudTimerRef = useRef<number | null>(null);

  const triggerHud = (label: string, ms: number) => {
    if (hudTimerRef.current) {
      window.clearTimeout(hudTimerRef.current);
    }
    setHud({
      active: true,
      label,
      status: 'done',
      benchmarkMs: Math.max(1, Math.round(ms)),
    });
    hudTimerRef.current = window.setTimeout(() => {
      setHud((prev) => ({ ...prev, active: false }));
    }, 1800);
  };

  // Sync dark mode class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [darkMode]);

  // Persist to localStorage immediately on state updates
  useEffect(() => {
    try {
      const payload: PersistedState = {
        students,
        quizzes,
        scans,
        activeQuizId,
        darkMode,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore quota errors cleanly
    }
  }, [students, quizzes, scans, activeQuizId, darkMode]);

  const activeQuiz = useMemo(
    () => quizzes.find((q) => q.id === activeQuizId) ?? quizzes[0],
    [quizzes, activeQuizId]
  );

  const activeQuizScans = useMemo(
    () =>
      scans
        .filter((s) => s.quizId === activeQuiz.id)
        .sort(
          (a, b) =>
            new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime()
        ),
    [scans, activeQuiz.id]
  );

  const itemStats = useMemo(
    () => computeItemAnalysis(activeQuiz, activeQuizScans),
    [activeQuiz, activeQuizScans]
  );

  const summary = useMemo(
    () => computeQuizSummary(activeQuiz, activeQuizScans, itemStats),
    [activeQuiz, activeQuizScans, itemStats]
  );

  const stateHash = useMemo(
    () => computeStateHash({ s: students.length, q: quizzes.length, sc: scans.length }),
    [students.length, quizzes.length, scans.length]
  );

  // CRUD Handlers
  const handleSaveScan = (newScan: ScannedSheet) => {
    setScans((prev) => [newScan, ...prev]);
  };

  const handleDeleteScan = (scanId: string) => {
    const t0 = performance.now();
    setScans((prev) => prev.filter((s) => s.id !== scanId));
    if (inspectedScanId === scanId) setInspectedScanId(null);
    triggerHud('ลบผลตรวจกระดาษคำตอบแล้ว', performance.now() - t0);
  };

  const handleUpdateScanAnswer = (
    scanId: string,
    questionNumber: number,
    choice: ChoiceOption | null
  ) => {
    const t0 = performance.now();
    setScans((prev) =>
      prev.map((scan) => {
        if (scan.id !== scanId) return scan;
        const quiz = quizzes.find((q) => q.id === scan.quizId) ?? activeQuiz;
        const nextAnswers = { ...scan.answers, [questionNumber]: choice };
        const nextStatuses = {
          ...scan.statuses,
          [questionNumber]: choice ? ('filled' as const) : ('blank' as const),
        };
        const grade = gradeResponse(quiz, nextAnswers, nextStatuses);
        return {
          ...scan,
          answers: nextAnswers,
          statuses: nextStatuses,
          ...grade,
        };
      })
    );
    triggerHud(`ปรับปรุงคำตอบข้อ ${questionNumber}`, performance.now() - t0);
  };

  const handleReassignScanStudent = (scanId: string, studentId: string) => {
    const t0 = performance.now();
    const stu = students.find((s) => s.id === studentId);
    if (!stu) return;
    setScans((prev) =>
      prev.map((scan) =>
        scan.id === scanId
          ? {
              ...scan,
              studentId: stu.id,
              detectedStudentCode: stu.studentCode,
              studentName: stu.fullName,
              className: stu.className,
            }
          : scan
      )
    );
    triggerHud(`เชื่อมเจ้าของกระดาษเป็น ${stu.studentCode}`, performance.now() - t0);
  };

  const handleCreateQuiz = (newQuiz: Quiz) => {
    const t0 = performance.now();
    setQuizzes((prev) => [newQuiz, ...prev]);
    setActiveQuizId(newQuiz.id);
    triggerHud('สร้างชุดข้อสอบใหม่แล้ว', performance.now() - t0);
  };

  const handleUpdateAnswerKey = (
    quizId: string,
    questionNumber: number,
    choice: ChoiceOption
  ) => {
    const t0 = performance.now();
    let updatedQuiz: Quiz | null = null;
    setQuizzes((prev) =>
      prev.map((q) => {
        if (q.id !== quizId) return q;
        updatedQuiz = {
          ...q,
          answerKey: { ...q.answerKey, [questionNumber]: choice },
          updatedAt: new Date().toISOString(),
        };
        return updatedQuiz;
      })
    );
    // Re-grade existing scans for this quiz optimistically
    setScans((prev) =>
      prev.map((scan) => {
        if (scan.quizId !== quizId || !updatedQuiz) return scan;
        const grade = gradeResponse(updatedQuiz, scan.answers, scan.statuses);
        return { ...scan, ...grade };
      })
    );
    triggerHud(`บันทึกเฉลยข้อ ${questionNumber}`, performance.now() - t0);
  };

  const handleBulkUpdateAnswerKey = (
    quizId: string,
    answerKey: Record<number, ChoiceOption>
  ) => {
    const t0 = performance.now();
    let updatedQuiz: Quiz | null = null;
    setQuizzes((prev) =>
      prev.map((q) => {
        if (q.id !== quizId) return q;
        updatedQuiz = {
          ...q,
          answerKey,
          updatedAt: new Date().toISOString(),
        };
        return updatedQuiz;
      })
    );
    setScans((prev) =>
      prev.map((scan) => {
        if (scan.quizId !== quizId || !updatedQuiz) return scan;
        const grade = gradeResponse(updatedQuiz, scan.answers, scan.statuses);
        return { ...scan, ...grade };
      })
    );
    triggerHud('อัปเดตเฉลยทั้งชุดแล้ว', performance.now() - t0);
  };

  const handleDeleteQuiz = (quizId: string) => {
    if (quizzes.length <= 1) return;
    const t0 = performance.now();
    const remaining = quizzes.filter((q) => q.id !== quizId);
    setQuizzes(remaining);
    setScans((prev) => prev.filter((s) => s.quizId !== quizId));
    if (activeQuizId === quizId && remaining[0]) {
      setActiveQuizId(remaining[0].id);
    }
    triggerHud('ลบชุดข้อสอบแล้ว', performance.now() - t0);
  };

  const handleAddStudent = (student: Student) => {
    const t0 = performance.now();
    setStudents((prev) => [student, ...prev]);
    triggerHud(`เพิ่มนักเรียน ${student.studentCode}`, performance.now() - t0);
  };

  const handleUpdateStudent = (student: Student) => {
    const t0 = performance.now();
    setStudents((prev) => prev.map((s) => (s.id === student.id ? student : s)));
    triggerHud(`อัปเดตข้อมูล ${student.studentCode}`, performance.now() - t0);
  };

  const handleDeleteStudent = (studentId: string) => {
    const t0 = performance.now();
    setStudents((prev) => prev.filter((s) => s.id !== studentId));
    triggerHud('ลบรายชื่อนักเรียนแล้ว', performance.now() - t0);
  };

  const handleBulkImportStudents = (imported: Student[]) => {
    const t0 = performance.now();
    setStudents((prev) => [...imported, ...prev]);
    triggerHud(`นำเข้ารายชื่อ ${imported.length} คน`, performance.now() - t0);
  };

  const handleResetDemoData = () => {
    const t0 = performance.now();
    setStudents(SEED_STUDENTS);
    setQuizzes(SEED_QUIZZES);
    setScans(SEED_SCANS);
    setActiveQuizId(SEED_QUIZZES[0].id);
    setInspectedScanId(null);
    triggerHud('รีเซ็ตข้อมูลตัวอย่างสำเร็จ', performance.now() - t0);
  };

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Sidebar
        activeView={activeView}
        onSelectView={setActiveView}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((d) => !d)}
        onResetDemoData={handleResetDemoData}
        stateHash={stateHash}
      />

      <div className="flex flex-1 flex-col min-w-0">
        {/* Clean 3-Zone Top Header */}
        <header className="no-print md:sticky md:top-0 z-30 flex h-14 sm:h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur-sm sm:px-6 dark:border-slate-800 dark:bg-slate-900/95">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="md:hidden inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-600 text-white font-mono text-[11px] font-bold">
              OMR
            </span>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="hidden lg:inline font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
                GradeScan
              </span>
              <span className="hidden lg:inline text-slate-300 dark:text-slate-600" aria-hidden="true">
                /
              </span>
              <span className="font-semibold text-slate-900 dark:text-white truncate">
                {VIEW_TITLES[activeView]}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <label htmlFor="header-quiz-select" className="sr-only">
              เลือกชุดข้อสอบที่ใช้งาน
            </label>
            <select
              id="header-quiz-select"
              value={activeQuiz.id}
              onChange={(e) => setActiveQuizId(e.target.value)}
              className="max-w-[132px] md:max-w-[175px] lg:max-w-[260px] rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              {quizzes.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.title} ({q.questionCount} ข้อ)
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setDarkMode((d) => !d)}
              aria-label={darkMode ? 'สลับเป็นโหมดสว่าง' : 'สลับเป็นโหมดมืด'}
              className="md:hidden flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"
            >
              {darkMode ? <Sun className="h-4 w-4 text-amber-500" /> : <Moon className="h-4 w-4" />}
            </button>

            <button
              type="button"
              onClick={() => setActiveView('scanner')}
              className="hidden sm:inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-3.5 py-1.5 text-xs font-medium text-white shadow-sm hover:from-indigo-700 hover:to-blue-700 whitespace-nowrap shrink-0"
            >
              <Camera className="h-3.5 w-3.5" aria-hidden="true" />
              <span>สแกนต่อเนื่อง</span>
            </button>
          </div>
        </header>

        {/* Mobile Quick Links for secondary pages (Sheets & Classes) */}
        <div className="no-print flex items-center gap-2 overflow-x-auto border-b border-slate-200 bg-white px-4 py-2 md:hidden dark:border-slate-800 dark:bg-slate-900">
          {(
            [
              ['sheets', 'พิมพ์กระดาษ OMR'],
              ['classes', 'ชั้นเรียนและนักเรียน'],
              ['quizzes', 'ชุดข้อสอบและเฉลย'],
              ['analysis', 'วิเคราะห์ข้อสอบ'],
            ] as Array<[AppView, string]>
          ).map(([viewId, label]) => (
            <button
              key={viewId}
              type="button"
              onClick={() => setActiveView(viewId)}
              className={`min-h-[38px] rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                activeView === viewId
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <main className="flex-1 p-4 pb-24 sm:p-6 md:pb-8 max-w-[1360px] w-full mx-auto">
          {activeView === 'dashboard' && (
            <DashboardView
              activeQuiz={activeQuiz}
              scans={activeQuizScans}
              students={students}
              summary={summary}
              itemStats={itemStats}
              onNavigate={setActiveView}
              onDeleteScan={handleDeleteScan}
              onInspectScan={(scanId) => {
                setInspectedScanId(scanId);
                setActiveView('scanner');
              }}
            />
          )}

          {activeView === 'scanner' && (
            <ScannerView
              activeQuiz={activeQuiz}
              students={students}
              scans={activeQuizScans}
              inspectedScanId={inspectedScanId}
              onSaveScan={handleSaveScan}
              onUpdateScanAnswer={handleUpdateScanAnswer}
              onReassignStudent={handleReassignScanStudent}
              onDeleteScan={handleDeleteScan}
              onSelectInspectedScan={setInspectedScanId}
              onBenchmark={triggerHud}
            />
          )}

          {activeView === 'quizzes' && (
            <QuizzesView
              quizzes={quizzes}
              activeQuizId={activeQuiz.id}
              onSelectQuiz={setActiveQuizId}
              onCreateQuiz={handleCreateQuiz}
              onUpdateAnswerKey={handleUpdateAnswerKey}
              onBulkUpdateAnswerKey={handleBulkUpdateAnswerKey}
              onDeleteQuiz={handleDeleteQuiz}
            />
          )}

          {activeView === 'sheets' && (
            <AnswerSheetView
              activeQuiz={activeQuiz}
              students={students}
              onBenchmark={triggerHud}
            />
          )}

          {activeView === 'analysis' && (
            <ItemAnalysisView
              activeQuiz={activeQuiz}
              scans={activeQuizScans}
              itemStats={itemStats}
              summary={summary}
              onBenchmark={triggerHud}
            />
          )}

          {activeView === 'classes' && (
            <ClassesView
              students={students}
              onAddStudent={handleAddStudent}
              onUpdateStudent={handleUpdateStudent}
              onDeleteStudent={handleDeleteStudent}
              onBulkImportStudents={handleBulkImportStudents}
            />
          )}

          {activeView === 'guide' && <StudyGuideView onNavigate={setActiveView} />}
        </main>
      </div>

      <MobileNav activeView={activeView} onSelectView={setActiveView} />
      <SmartHud hud={hud} />
    </div>
  );
}
