import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Moon, Sun } from 'lucide-react';
import { AnswerSheetView } from './components/AnswerSheetView';
import { ClassesView } from './components/ClassesView';
import { DashboardView } from './components/DashboardView';
import { ItemAnalysisView } from './components/ItemAnalysisView';
import { MobileNav } from './components/MobileNav';
import { QuizzesView } from './components/QuizzesView';
import { ScannerView } from './components/ScannerView';
import { SettingsView } from './components/SettingsView';
import { Sidebar } from './components/Sidebar';
import { SmartHud } from './components/SmartHud';
import { StudyGuideView } from './components/StudyGuideView';
import {
  SEED_QUIZZES,
  SEED_SCANS,
  SEED_STUDENTS,
  SEED_SUBJECTS,
  SEED_TEACHERS,
} from './data/seedData';
import type {
  AppView,
  ChoiceOption,
  HudState,
  Quiz,
  ScannedSheet,
  Student,
  Subject,
  SystemBackupPayload,
  SystemSettings,
  Teacher,
} from './types/omr';
import {
  buildBanAphonFullImportResult,
  type AutoJsonImportResult,
} from './utils/importExport';
import { computeStateHash } from './utils/normalization';
import {
  computeItemAnalysis,
  computeQuizSummary,
  gradeResponse,
} from './utils/omrAnalytics';
import {
  DEFAULT_SYSTEM_SETTINGS,
  sanitizeSystemSettings,
} from './utils/systemSettings';

interface PersistedState {
  students: Student[];
  teachers: Teacher[];
  subjects: Subject[];
  quizzes: Quiz[];
  scans: ScannedSheet[];
  activeQuizId: string;
  darkMode: boolean;
  settings: SystemSettings;
}

const STORAGE_KEY = 'gradescan_omr_state_v1';

const VIEW_TITLES: Record<AppView, string> = {
  dashboard: 'ภาพรวมและสถิติ',
  scanner: 'สแกนตรวจข้อสอบ',
  quizzes: 'ชุดข้อสอบและเฉลย',
  sheets: 'กระดาษคำตอบ OMR',
  analysis: 'วิเคราะห์ข้อสอบ',
  classes: 'นักเรียน · ครู · รายวิชา',
  settings: 'ตั้งค่า & นำเข้า/ส่งออก',
  guide: 'คู่มือศึกษา ZipGrade',
};

function mergeByKey<T>(
  existing: T[],
  incoming: T[],
  keyField: keyof T
): T[] {
  const map = new Map<string, T>();
  for (const item of existing) {
    map.set(String(item[keyField]), item);
  }
  for (const item of incoming) {
    map.set(String(item[keyField]), item);
  }
  return Array.from(map.values());
}

function mergeSubjectsComposite(existing: Subject[], incoming: Subject[]): Subject[] {
  const map = new Map<string, Subject>();
  const keyOf = (s: Subject) =>
    `${s.subjectCode}::${s.gradeLevel}::${s.teacherName ?? s.teacherCode ?? ''}`;
  for (const item of existing) {
    map.set(keyOf(item), item);
  }
  for (const item of incoming) {
    map.set(keyOf(item), item);
  }
  return Array.from(map.values());
}

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
          teachers:
            Array.isArray(parsed.teachers) && parsed.teachers.length > 0
              ? parsed.teachers
              : SEED_TEACHERS,
          subjects:
            Array.isArray(parsed.subjects) && parsed.subjects.length > 0
              ? parsed.subjects
              : SEED_SUBJECTS,
          quizzes: parsed.quizzes,
          scans: parsed.scans,
          activeQuizId: parsed.activeQuizId ?? parsed.quizzes[0].id,
          darkMode: Boolean(parsed.darkMode),
          settings: sanitizeSystemSettings(parsed.settings),
        };
      }
    }
  } catch {
    // Fallback to clean seed state if storage is corrupt or unavailable
  }
  return {
    students: SEED_STUDENTS,
    teachers: SEED_TEACHERS,
    subjects: SEED_SUBJECTS,
    quizzes: SEED_QUIZZES,
    scans: SEED_SCANS,
    activeQuizId: SEED_QUIZZES[0].id,
    darkMode: false,
    settings: DEFAULT_SYSTEM_SETTINGS,
  };
}

export default function App() {
  const initial = useMemo(() => loadInitialState(), []);

  const [students, setStudents] = useState<Student[]>(initial.students);
  const [teachers, setTeachers] = useState<Teacher[]>(initial.teachers);
  const [subjects, setSubjects] = useState<Subject[]>(initial.subjects);
  const [quizzes, setQuizzes] = useState<Quiz[]>(initial.quizzes);
  const [scans, setScans] = useState<ScannedSheet[]>(initial.scans);
  const [activeQuizId, setActiveQuizId] = useState<string>(initial.activeQuizId);
  const [darkMode, setDarkMode] = useState<boolean>(initial.darkMode);
  const [settings, setSettings] = useState<SystemSettings>(initial.settings);

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
        teachers,
        subjects,
        quizzes,
        scans,
        activeQuizId,
        darkMode,
        settings,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore quota errors cleanly
    }
  }, [students, teachers, subjects, quizzes, scans, activeQuizId, darkMode, settings]);

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
    () =>
      computeItemAnalysis(
        activeQuiz,
        activeQuizScans,
        settings.upperLowerGroupPct
      ),
    [activeQuiz, activeQuizScans, settings.upperLowerGroupPct]
  );

  const summary = useMemo(
    () => computeQuizSummary(activeQuiz, activeQuizScans, itemStats),
    [activeQuiz, activeQuizScans, itemStats]
  );

  const stateHash = useMemo(
    () =>
      computeStateHash({
        s: students.length,
        t: teachers.length,
        sub: subjects.length,
        q: quizzes.length,
        sc: scans.length,
      }),
    [students.length, teachers.length, subjects.length, quizzes.length, scans.length]
  );

  // Scan CRUD Handlers
  const handleSaveScan = (newScan: ScannedSheet) => {
    setScans((prev) => [newScan, ...prev]);
  };

  const handleDeleteScan = (scanId: string) => {
    const t0 = performance.now();
    setScans((prev) => prev.filter((s) => s.id !== scanId));
    if (inspectedScanId === scanId) setInspectedScanId(null);
    triggerHud('ลบผลตรวจกระดาษคำตอบแล้ว', performance.now() - t0);
  };

  const handleBulkDeleteScans = (scanIds: string[]) => {
    if (scanIds.length === 0) return;
    const t0 = performance.now();
    const idSet = new Set(scanIds);
    setScans((prev) => prev.filter((s) => !idSet.has(s.id)));
    if (inspectedScanId && idSet.has(inspectedScanId)) {
      setInspectedScanId(null);
    }
    triggerHud(`ลบผลตรวจ ${scanIds.length} รายการแล้ว`, performance.now() - t0);
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

  const handleVerifyScanStudentCode = (scanId: string, rawCode: string) => {
    const t0 = performance.now();
    const clean = rawCode.replace(/\D/g, '');
    if (!clean) return;
    const padded = clean
      .padStart(settings.studentIdDigits, '0')
      .slice(-settings.studentIdDigits);
    const matched = students.find(
      (s) => s.studentCode === clean || s.studentCode === padded
    );

    setScans((prev) =>
      prev.map((scan) =>
        scan.id === scanId
          ? matched
            ? {
                ...scan,
                studentId: matched.id,
                detectedStudentCode: matched.studentCode,
                studentName: matched.fullName,
                className: matched.className,
              }
            : {
                ...scan,
                studentId: null,
                detectedStudentCode: padded,
                studentName: `นักเรียนรหัส ${padded} (ไม่พบในฐานข้อมูล)`,
              }
          : scan
      )
    );
    triggerHud(
      matched
        ? `ยืนยันรหัส ${matched.studentCode}: ${matched.fullName}`
        : `ไม่พบรหัส ${padded} ในฐานข้อมูล`,
      performance.now() - t0
    );
  };

  // Quiz CRUD Handlers
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

  // Students CRUD + Bulk
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

  const handleBulkAddStudents = (added: Student[]) => {
    const t0 = performance.now();
    setStudents((prev) => mergeByKey(prev, added, 'studentCode'));
    triggerHud(`เพิ่มนักเรียน ${added.length} คนสำเร็จ`, performance.now() - t0);
  };

  const handleBulkUpdateStudents = (updatedList: Student[]) => {
    const t0 = performance.now();
    const map = new Map(updatedList.map((s) => [s.id, s]));
    setStudents((prev) => prev.map((s) => map.get(s.id) ?? s));
    triggerHud(`อัปเดตนักเรียน ${updatedList.length} คนแล้ว`, performance.now() - t0);
  };

  const handleBulkDeleteStudents = (studentIds: string[]) => {
    const t0 = performance.now();
    const set = new Set(studentIds);
    setStudents((prev) => prev.filter((s) => !set.has(s.id)));
    triggerHud(`ลบนักเรียน ${studentIds.length} คนแล้ว`, performance.now() - t0);
  };

  const handleImportStudents = (
    imported: Student[],
    mode: 'merge' | 'replace'
  ) => {
    const t0 = performance.now();
    setStudents((prev) =>
      mode === 'replace'
        ? imported
        : mergeByKey(prev, imported, 'studentCode')
    );
    triggerHud(`นำเข้านักเรียน ${imported.length} คน`, performance.now() - t0);
  };

  // Teachers CRUD + Bulk
  const handleAddTeacher = (teacher: Teacher) => {
    const t0 = performance.now();
    setTeachers((prev) => [teacher, ...prev]);
    triggerHud(`เพิ่มครู ${teacher.teacherCode}`, performance.now() - t0);
  };

  const handleUpdateTeacher = (teacher: Teacher) => {
    const t0 = performance.now();
    setTeachers((prev) => prev.map((t) => (t.id === teacher.id ? teacher : t)));
    triggerHud(`อัปเดตครู ${teacher.teacherCode}`, performance.now() - t0);
  };

  const handleDeleteTeacher = (teacherId: string) => {
    const t0 = performance.now();
    setTeachers((prev) => prev.filter((t) => t.id !== teacherId));
    triggerHud('ลบรายชื่อครูแล้ว', performance.now() - t0);
  };

  const handleBulkAddTeachers = (added: Teacher[]) => {
    const t0 = performance.now();
    setTeachers((prev) => mergeByKey(prev, added, 'teacherCode'));
    triggerHud(`เพิ่มครู ${added.length} คนสำเร็จ`, performance.now() - t0);
  };

  const handleBulkUpdateTeachers = (updatedList: Teacher[]) => {
    const t0 = performance.now();
    const map = new Map(updatedList.map((t) => [t.id, t]));
    setTeachers((prev) => prev.map((t) => map.get(t.id) ?? t));
    triggerHud(`อัปเดตครู ${updatedList.length} คนแล้ว`, performance.now() - t0);
  };

  const handleBulkDeleteTeachers = (teacherIds: string[]) => {
    const t0 = performance.now();
    const set = new Set(teacherIds);
    setTeachers((prev) => prev.filter((t) => !set.has(t.id)));
    triggerHud(`ลบครู ${teacherIds.length} คนแล้ว`, performance.now() - t0);
  };

  const handleImportTeachers = (
    imported: Teacher[],
    mode: 'merge' | 'replace'
  ) => {
    const t0 = performance.now();
    setTeachers((prev) =>
      mode === 'replace'
        ? imported
        : mergeByKey(prev, imported, 'teacherCode')
    );
    triggerHud(`นำเข้าครู HRMS ${imported.length} คน`, performance.now() - t0);
  };

  // Subjects CRUD + Bulk
  const handleAddSubject = (subject: Subject) => {
    const t0 = performance.now();
    setSubjects((prev) => [subject, ...prev]);
    triggerHud(`เพิ่มวิชา ${subject.subjectCode}`, performance.now() - t0);
  };

  const handleUpdateSubject = (subject: Subject) => {
    const t0 = performance.now();
    setSubjects((prev) => prev.map((s) => (s.id === subject.id ? subject : s)));
    triggerHud(`อัปเดตวิชา ${subject.subjectCode}`, performance.now() - t0);
  };

  const handleDeleteSubject = (subjectId: string) => {
    const t0 = performance.now();
    setSubjects((prev) => prev.filter((s) => s.id !== subjectId));
    triggerHud('ลบรายวิชาแล้ว', performance.now() - t0);
  };

  const handleBulkAddSubjects = (added: Subject[]) => {
    const t0 = performance.now();
    setSubjects((prev) => mergeSubjectsComposite(prev, added));
    triggerHud(`เพิ่มรายวิชา ${added.length} วิชาสำเร็จ`, performance.now() - t0);
  };

  const handleBulkUpdateSubjects = (updatedList: Subject[]) => {
    const t0 = performance.now();
    const map = new Map(updatedList.map((s) => [s.id, s]));
    setSubjects((prev) => prev.map((s) => map.get(s.id) ?? s));
    triggerHud(`อัปเดตวิชา ${updatedList.length} วิชาแล้ว`, performance.now() - t0);
  };

  const handleBulkDeleteSubjects = (subjectIds: string[]) => {
    const t0 = performance.now();
    const set = new Set(subjectIds);
    setSubjects((prev) => prev.filter((s) => !set.has(s.id)));
    triggerHud(`ลบรายวิชา ${subjectIds.length} วิชาแล้ว`, performance.now() - t0);
  };

  const handleImportSubjects = (
    imported: Subject[],
    mode: 'merge' | 'replace'
  ) => {
    const t0 = performance.now();
    setSubjects((prev) =>
      mode === 'replace'
        ? imported
        : mergeSubjectsComposite(prev, imported)
    );
    triggerHud(`นำเข้ารายวิชา ${imported.length} วิชา`, performance.now() - t0);
  };

  // Full System Backup & Multi-Entity JSON Import
  const handleRestoreBackup = (
    backup: SystemBackupPayload,
    mode: 'merge' | 'replace'
  ) => {
    const t0 = performance.now();
    if (mode === 'replace') {
      setStudents(backup.students);
      setTeachers(backup.teachers);
      setSubjects(backup.subjects);
      if (backup.quizzes.length > 0) {
        setQuizzes(backup.quizzes);
        setActiveQuizId(backup.activeQuizId || backup.quizzes[0].id);
      }
      setScans(backup.scans);
      setSettings(sanitizeSystemSettings(backup.settings));
    } else {
      if (backup.students.length > 0) {
        setStudents((prev) => mergeByKey(prev, backup.students, 'studentCode'));
      }
      if (backup.teachers.length > 0) {
        setTeachers((prev) => mergeByKey(prev, backup.teachers, 'teacherCode'));
      }
      if (backup.subjects.length > 0) {
        setSubjects((prev) => mergeSubjectsComposite(prev, backup.subjects));
      }
      if (backup.quizzes.length > 0) {
        setQuizzes((prev) => mergeByKey(prev, backup.quizzes, 'id'));
      }
      if (backup.scans.length > 0) {
        setScans((prev) => mergeByKey(prev, backup.scans, 'id'));
      }
      setSettings(sanitizeSystemSettings(backup.settings));
    }
    triggerHud('กู้คืนข้อมูลทั้งระบบเรียบร้อย', performance.now() - t0);
  };

  const handleApplyJsonImport = (
    result: AutoJsonImportResult,
    mode: 'merge' | 'replace'
  ) => {
    const t0 = performance.now();
    if (result.students.length > 0) {
      handleImportStudents(result.students, mode);
    }
    if (result.teachers.length > 0) {
      handleImportTeachers(result.teachers, mode);
    }
    if (result.subjects.length > 0) {
      handleImportSubjects(result.subjects, mode);
    }
    triggerHud('นำเข้าข้อมูลสำเร็จ', performance.now() - t0);
  };

  const handleApplyBanAphonPreset = (mode: 'merge' | 'replace' = 'replace') => {
    const t0 = performance.now();
    const { importResult, schoolMeta } = buildBanAphonFullImportResult();
    if (importResult.teachers.length > 0) {
      setTeachers((prev) =>
        mode === 'replace'
          ? importResult.teachers
          : mergeByKey(prev, importResult.teachers, 'teacherCode')
      );
    }
    if (importResult.subjects.length > 0) {
      setSubjects((prev) =>
        mode === 'replace'
          ? importResult.subjects
          : mergeSubjectsComposite(prev, importResult.subjects)
      );
    }
    setSettings((prev) =>
      sanitizeSystemSettings({
        ...prev,
        schoolName: schoolMeta.schoolName,
        academicYear: schoolMeta.academicYear,
      })
    );
    triggerHud(
      `โหลดข้อมูล ${schoolMeta.schoolName}: ครู ${importResult.teachers.length} · วิชา ${importResult.subjects.length}`,
      performance.now() - t0
    );
  };

  const handleResetDemoData = () => {
    const t0 = performance.now();
    setStudents(SEED_STUDENTS);
    setTeachers(SEED_TEACHERS);
    setSubjects(SEED_SUBJECTS);
    setQuizzes(SEED_QUIZZES);
    setScans(SEED_SCANS);
    setActiveQuizId(SEED_QUIZZES[0].id);
    setSettings(DEFAULT_SYSTEM_SETTINGS);
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

        {/* Mobile Quick Links */}
        <div className="no-print flex items-center gap-2 overflow-x-auto border-b border-slate-200 bg-white px-4 py-2 md:hidden dark:border-slate-800 dark:bg-slate-900">
          {(
            [
              ['sheets', 'พิมพ์กระดาษ OMR'],
              ['classes', 'นักเรียน · ครู · วิชา'],
              ['quizzes', 'ชุดข้อสอบและเฉลย'],
              ['analysis', 'วิเคราะห์ข้อสอบ'],
              ['settings', 'ตั้งค่า & นำเข้า/ส่งออก'],
              ['guide', 'คู่มือ'],
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
              settings={settings}
              summary={summary}
              itemStats={itemStats}
              onNavigate={setActiveView}
              onDeleteScan={handleDeleteScan}
              onBulkDeleteScans={handleBulkDeleteScans}
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
              settings={settings}
              inspectedScanId={inspectedScanId}
              onSaveScan={handleSaveScan}
              onUpdateScanAnswer={handleUpdateScanAnswer}
              onReassignStudent={handleReassignScanStudent}
              onVerifyScanStudentCode={handleVerifyScanStudentCode}
              onQuickAddStudent={handleAddStudent}
              onDeleteScan={handleDeleteScan}
              onSelectInspectedScan={setInspectedScanId}
              onBenchmark={triggerHud}
            />
          )}

          {activeView === 'quizzes' && (
            <QuizzesView
              quizzes={quizzes}
              subjects={subjects}
              settings={settings}
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
              settings={settings}
              onQuickAddStudent={handleAddStudent}
              onBenchmark={triggerHud}
            />
          )}

          {activeView === 'analysis' && (
            <ItemAnalysisView
              activeQuiz={activeQuiz}
              scans={activeQuizScans}
              students={students}
              settings={settings}
              itemStats={itemStats}
              summary={summary}
              onBenchmark={triggerHud}
            />
          )}

          {activeView === 'classes' && (
            <ClassesView
              students={students}
              teachers={teachers}
              subjects={subjects}
              settings={settings}
              onAddStudent={handleAddStudent}
              onUpdateStudent={handleUpdateStudent}
              onDeleteStudent={handleDeleteStudent}
              onBulkAddStudents={handleBulkAddStudents}
              onBulkUpdateStudents={handleBulkUpdateStudents}
              onBulkDeleteStudents={handleBulkDeleteStudents}
              onImportStudents={handleImportStudents}
              onAddTeacher={handleAddTeacher}
              onUpdateTeacher={handleUpdateTeacher}
              onDeleteTeacher={handleDeleteTeacher}
              onBulkAddTeachers={handleBulkAddTeachers}
              onBulkUpdateTeachers={handleBulkUpdateTeachers}
              onBulkDeleteTeachers={handleBulkDeleteTeachers}
              onImportTeachers={handleImportTeachers}
              onAddSubject={handleAddSubject}
              onUpdateSubject={handleUpdateSubject}
              onDeleteSubject={handleDeleteSubject}
              onBulkAddSubjects={handleBulkAddSubjects}
              onBulkUpdateSubjects={handleBulkUpdateSubjects}
              onBulkDeleteSubjects={handleBulkDeleteSubjects}
              onImportSubjects={handleImportSubjects}
              onApplyBanAphonPreset={handleApplyBanAphonPreset}
            />
          )}

          {activeView === 'settings' && (
            <SettingsView
              settings={settings}
              onUpdateSettings={setSettings}
              onResetSettings={() => setSettings(DEFAULT_SYSTEM_SETTINGS)}
              students={students}
              teachers={teachers}
              subjects={subjects}
              quizzes={quizzes}
              scans={scans}
              activeQuiz={activeQuiz}
              activeQuizScans={activeQuizScans}
              summary={summary}
              onRestoreBackup={handleRestoreBackup}
              onApplyJsonImport={handleApplyJsonImport}
              onApplyBanAphonPreset={handleApplyBanAphonPreset}
              onBenchmark={triggerHud}
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
