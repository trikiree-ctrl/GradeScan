import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckSquare,
  Download,
  FileSpreadsheet,
  Layers,
  Pencil,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type {
  Student,
  Subject,
  SystemSettings,
  Teacher,
} from '../types/omr';
import {
  SAMPLE_DMC_JSON,
  SAMPLE_OBEC_HRMS_JSON,
  SAMPLE_TIMETABLE_SUBJECTS_JSON,
  type AutoJsonImportResult,
} from '../utils/importExport';
import {
  isInvalidStudentRecord,
  normalizeThaiClassName,
} from '../utils/normalization';
import {
  exportRowsToXlsxDownload,
  inspectTextOrSpreadsheetImport,
  inspectWorkbookImport,
  parseExcelWorkbook,
  type ParsedWorkbook,
} from '../utils/spreadsheetImport';

interface ClassesViewProps {
  students: Student[];
  teachers: Teacher[];
  subjects: Subject[];
  settings: SystemSettings;
  onAddStudent: (student: Student) => void;
  onUpdateStudent: (student: Student) => void;
  onDeleteStudent: (studentId: string) => void;
  onBulkAddStudents: (students: Student[]) => void;
  onBulkUpdateStudents: (students: Student[]) => void;
  onBulkDeleteStudents: (studentIds: string[]) => void;
  onImportStudents: (students: Student[], mode: 'merge' | 'replace') => void;
  onAddTeacher: (teacher: Teacher) => void;
  onUpdateTeacher: (teacher: Teacher) => void;
  onDeleteTeacher: (teacherId: string) => void;
  onBulkAddTeachers: (teachers: Teacher[]) => void;
  onBulkUpdateTeachers: (teachers: Teacher[]) => void;
  onBulkDeleteTeachers: (teacherIds: string[]) => void;
  onImportTeachers: (teachers: Teacher[], mode: 'merge' | 'replace') => void;
  onAddSubject: (subject: Subject) => void;
  onUpdateSubject: (subject: Subject) => void;
  onDeleteSubject: (subjectId: string) => void;
  onBulkAddSubjects: (subjects: Subject[]) => void;
  onBulkUpdateSubjects: (subjects: Subject[]) => void;
  onBulkDeleteSubjects: (subjectIds: string[]) => void;
  onImportSubjects: (subjects: Subject[], mode: 'merge' | 'replace') => void;
  onApplyBanAphonPreset?: (mode: 'merge' | 'replace') => void;
}

type EntityTab = 'students' | 'teachers' | 'subjects';

interface BatchStudentDraft {
  key: string;
  studentCode: string;
  fullName: string;
  className: string;
  numberInClass: number;
}

interface BatchTeacherDraft {
  key: string;
  teacherCode: string;
  fullName: string;
  position: string;
  department: string;
  homeroomClass: string;
}

interface BatchSubjectDraft {
  key: string;
  subjectCode: string;
  subjectName: string;
  learningArea: string;
  gradeLevel: string;
  credits: number;
}

function createEmptyStudentRows(
  count: number,
  startNum: number,
  digits: 4 | 5 | 6,
  defaultClass: string
): BatchStudentDraft[] {
  return Array.from({ length: count }, (_, i) => ({
    key: `row_${Date.now()}_${i}_${Math.random()}`,
    studentCode: String(startNum + i).padStart(digits, '0'),
    fullName: '',
    className: defaultClass,
    numberInClass: i + 1,
  }));
}

function createEmptyTeacherRows(count: number, startIdx: number): BatchTeacherDraft[] {
  return Array.from({ length: count }, (_, i) => ({
    key: `trow_${Date.now()}_${i}_${Math.random()}`,
    teacherCode: `T${String(startIdx + i).padStart(3, '0')}`,
    fullName: '',
    position: 'ครูผู้สอน',
    department: 'วิทยาศาสตร์และเทคโนโลยี',
    homeroomClass: 'ม.1/1',
  }));
}

function createEmptySubjectRows(count: number, startIdx: number): BatchSubjectDraft[] {
  return Array.from({ length: count }, (_, i) => ({
    key: `srow_${Date.now()}_${i}_${Math.random()}`,
    subjectCode: `ว2110${startIdx + i}`,
    subjectName: '',
    learningArea: 'วิทยาศาสตร์และเทคโนโลยี',
    gradeLevel: 'ม.1',
    credits: 1.0,
  }));
}

export function ClassesView({
  students,
  teachers,
  subjects,
  settings,
  onAddStudent,
  onUpdateStudent,
  onDeleteStudent,
  onBulkAddStudents,
  onBulkUpdateStudents,
  onBulkDeleteStudents,
  onImportStudents,
  onAddTeacher,
  onUpdateTeacher,
  onDeleteTeacher,
  onBulkAddTeachers,
  onBulkUpdateTeachers,
  onBulkDeleteTeachers,
  onImportTeachers,
  onAddSubject,
  onUpdateSubject,
  onDeleteSubject,
  onBulkAddSubjects,
  onBulkUpdateSubjects,
  onBulkDeleteSubjects,
  onImportSubjects,
  onApplyBanAphonPreset,
}: ClassesViewProps) {
  const [activeTab, setActiveTab] = useState<EntityTab>('students');
  const [searchQuery, setSearchQuery] = useState('');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [subjectGradeFilter, setSubjectGradeFilter] = useState<string>('all');

  // Panel toggles
  const [showBatchAdd, setShowBatchAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);

  // Selection & Inline Bulk Editing + Inline Delete Confirmation (no window.confirm)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkEditing, setBulkEditing] = useState(false);
  const [batchClassTarget, setBatchClassTarget] = useState('ม.1/1');

  // Draft maps for inline spreadsheet editing of selected rows
  const [studentEdits, setStudentEdits] = useState<Record<string, Student>>({});
  const [teacherEdits, setTeacherEdits] = useState<Record<string, Teacher>>({});
  const [subjectEdits, setSubjectEdits] = useState<Record<string, Subject>>({});

  // Single add/edit form state (Students)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [studentCode, setStudentCode] = useState('');
  const [fullName, setFullName] = useState('');
  const [rawClass, setRawClass] = useState('ม.1/1');
  const [numberInClass, setNumberInClass] = useState(1);

  // Single add/edit form state (Teachers)
  const [teacherCode, setTeacherCode] = useState('');
  const [teacherName, setTeacherName] = useState('');
  const [teacherPosition, setTeacherPosition] = useState('ครูชำนาญการ');
  const [teacherDept, setTeacherDept] = useState('วิทยาศาสตร์และเทคโนโลยี');
  const [teacherHomeroom, setTeacherHomeroom] = useState('ม.1/1');

  // Single add/edit form state (Subjects)
  const [subjectCode, setSubjectCode] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [subjectArea, setSubjectArea] = useState('วิทยาศาสตร์และเทคโนโลยี');
  const [subjectGrade, setSubjectGrade] = useState('ม.1');
  const [subjectCredits, setSubjectCredits] = useState(1.5);
  const [subjectTeacherName, setSubjectTeacherName] = useState('');
  const [subjectPeriods, setSubjectPeriods] = useState<number>(2);

  // Multi-row batch add drafts
  const [batchStudentRows, setBatchStudentRows] = useState<BatchStudentDraft[]>(() =>
    createEmptyStudentRows(3, 1020, settings.studentIdDigits, 'ม.1/1')
  );
  const [batchTeacherRows, setBatchTeacherRows] = useState<BatchTeacherDraft[]>(() =>
    createEmptyTeacherRows(3, 10)
  );
  const [batchSubjectRows, setBatchSubjectRows] = useState<BatchSubjectDraft[]>(() =>
    createEmptySubjectRows(3, 5)
  );

  // Excel / CSV / JSON importer state
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [importText, setImportText] = useState(SAMPLE_DMC_JSON);
  const [uploadedWorkbook, setUploadedWorkbook] = useState<ParsedWorkbook | null>(null);
  const [selectedSheetName, setSelectedSheetName] = useState<string>('');
  const [importPreview, setImportPreview] = useState<AutoJsonImportResult | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const digits = settings.studentIdDigits;

  const activeImportHint: 'dmc_students' | 'hrms_teachers' | 'subjects' =
    activeTab === 'students'
      ? 'dmc_students'
      : activeTab === 'teachers'
      ? 'hrms_teachers'
      : 'subjects';

  useEffect(() => {
    setSelectedIds(new Set());
    setConfirmBulkDelete(false);
    setBulkEditing(false);
    setEditingId(null);
    setFormError(null);
    setSearchQuery('');
    setClassFilter('all');
    setSubjectGradeFilter('all');
    setUploadedWorkbook(null);
    setSelectedSheetName('');
    const nextSample =
      activeTab === 'students'
        ? SAMPLE_DMC_JSON
        : activeTab === 'teachers'
        ? SAMPLE_OBEC_HRMS_JSON
        : SAMPLE_TIMETABLE_SUBJECTS_JSON;
    setImportText(nextSample);
    setImportPreview(
      inspectTextOrSpreadsheetImport(
        nextSample,
        activeTab === 'students'
          ? 'dmc_students'
          : activeTab === 'teachers'
          ? 'hrms_teachers'
          : 'subjects',
        digits
      )
    );
  }, [activeTab, digits]);

  // Derived filtered lists
  const normalizedClasses = useMemo(() => {
    const set = new Set<string>();
    for (const s of students) set.add(s.className);
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'th'));
  }, [students]);

  const subjectGrades = useMemo(() => {
    const set = new Set<string>();
    for (const sub of subjects) set.add(sub.gradeLevel);
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'th'));
  }, [subjects]);

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return students
      .filter((s) => (classFilter === 'all' ? true : s.className === classFilter))
      .filter(
        (s) =>
          !q ||
          s.fullName.toLowerCase().includes(q) ||
          s.studentCode.includes(q) ||
          s.className.toLowerCase().includes(q)
      )
      .sort((a, b) => a.studentCode.localeCompare(b.studentCode));
  }, [students, classFilter, searchQuery]);

  const filteredTeachers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return teachers
      .filter(
        (t) =>
          !q ||
          t.fullName.toLowerCase().includes(q) ||
          t.teacherCode.toLowerCase().includes(q) ||
          t.department.toLowerCase().includes(q) ||
          t.position.toLowerCase().includes(q) ||
          (t.academicRank ?? '').toLowerCase().includes(q) ||
          (t.major ?? '').toLowerCase().includes(q) ||
          (t.homeroomClass ?? '').toLowerCase().includes(q)
      )
      .sort((a, b) => a.teacherCode.localeCompare(b.teacherCode));
  }, [teachers, searchQuery]);

  const filteredSubjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return subjects
      .filter((sub) =>
        subjectGradeFilter === 'all' ? true : sub.gradeLevel === subjectGradeFilter
      )
      .filter(
        (sub) =>
          !q ||
          sub.subjectName.toLowerCase().includes(q) ||
          sub.subjectCode.toLowerCase().includes(q) ||
          sub.learningArea.toLowerCase().includes(q) ||
          sub.gradeLevel.toLowerCase().includes(q) ||
          (sub.teacherName ?? '').toLowerCase().includes(q)
      )
      .sort((a, b) => a.gradeLevel.localeCompare(b.gradeLevel, 'th') || a.subjectCode.localeCompare(b.subjectCode));
  }, [subjects, searchQuery, subjectGradeFilter]);

  const currentRowIds = useMemo(() => {
    if (activeTab === 'students') return filteredStudents.map((s) => s.id);
    if (activeTab === 'teachers') return filteredTeachers.map((t) => t.id);
    return filteredSubjects.map((sub) => sub.id);
  }, [activeTab, filteredStudents, filteredTeachers, filteredSubjects]);

  const allVisibleSelected =
    currentRowIds.length > 0 && currentRowIds.every((id) => selectedIds.has(id));

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
      setConfirmBulkDelete(false);
    } else {
      setSelectedIds(new Set(currentRowIds));
    }
  };

  const toggleRowSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setConfirmBulkDelete(false);
  };

  // Start inline spreadsheet editing for all selected rows (or all visible if none selected)
  const startBulkEdit = () => {
    const targetIds =
      selectedIds.size > 0 ? Array.from(selectedIds) : currentRowIds;
    if (targetIds.length === 0) return;

    setSelectedIds(new Set(targetIds));
    if (activeTab === 'students') {
      const map: Record<string, Student> = {};
      for (const s of students) {
        if (targetIds.includes(s.id)) map[s.id] = { ...s };
      }
      setStudentEdits(map);
    } else if (activeTab === 'teachers') {
      const map: Record<string, Teacher> = {};
      for (const t of teachers) {
        if (targetIds.includes(t.id)) map[t.id] = { ...t };
      }
      setTeacherEdits(map);
    } else {
      const map: Record<string, Subject> = {};
      for (const sub of subjects) {
        if (targetIds.includes(sub.id)) map[sub.id] = { ...sub };
      }
      setSubjectEdits(map);
    }
    setBulkEditing(true);
    setConfirmBulkDelete(false);
  };

  const saveBulkEdit = () => {
    if (activeTab === 'students') {
      const list = Object.values(studentEdits).map((s) => ({
        ...s,
        studentCode: s.studentCode.replace(/\D/g, '').padStart(digits, '0').slice(-digits),
        className: normalizeThaiClassName(s.className),
      }));
      onBulkUpdateStudents(list);
      setActionMessage(`บันทึกแก้ไขข้อมูลนักเรียน ${list.length} รายการเรียบร้อย`);
    } else if (activeTab === 'teachers') {
      const list = Object.values(teacherEdits).map((t) => ({
        ...t,
        homeroomClass: t.homeroomClass
          ? normalizeThaiClassName(t.homeroomClass)
          : undefined,
      }));
      onBulkUpdateTeachers(list);
      setActionMessage(`บันทึกแก้ไขข้อมูลครู ${list.length} รายการเรียบร้อย`);
    } else {
      const list = Object.values(subjectEdits).map((sub) => ({
        ...sub,
        gradeLevel: normalizeThaiClassName(sub.gradeLevel),
      }));
      onBulkUpdateSubjects(list);
      setActionMessage(`บันทึกแก้ไขข้อมูลรายวิชา ${list.length} รายการเรียบร้อย`);
    }
    setBulkEditing(false);
    setSelectedIds(new Set());
  };

  const handleApplyBatchClassMove = () => {
    if (activeTab !== 'students' || selectedIds.size === 0) return;
    const normalized = normalizeThaiClassName(batchClassTarget);
    const updated = students
      .filter((s) => selectedIds.has(s.id))
      .map((s) => ({ ...s, className: normalized }));
    onBulkUpdateStudents(updated);
    setActionMessage(`ย้ายห้องเรียนให้ ${updated.length} คน เป็น ${normalized} แล้ว`);
    setSelectedIds(new Set());
    setBulkEditing(false);
  };

  const handleConfirmBulkDelete = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (activeTab === 'students') onBulkDeleteStudents(ids);
    else if (activeTab === 'teachers') onBulkDeleteTeachers(ids);
    else onBulkDeleteSubjects(ids);

    setActionMessage(`ลบข้อมูลที่เลือก ${ids.length} รายการแล้ว`);
    setSelectedIds(new Set());
    setConfirmBulkDelete(false);
    setBulkEditing(false);
  };

  // Single form submit
  const handleSubmitSingle = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const now = new Date().toISOString();

    if (activeTab === 'students') {
      const paddedCode = studentCode.replace(/\D/g, '').padStart(digits, '0').slice(-digits);
      const cleanName = fullName.trim();
      if (isInvalidStudentRecord(paddedCode, cleanName)) {
        setFormError(`กรุณากรอกรหัสนักเรียน (1–${digits} หลัก) และชื่อ-สกุล`);
        return;
      }
      const normalizedClass = normalizeThaiClassName(rawClass);
      if (editingId) {
        const existing = students.find((s) => s.id === editingId);
        if (existing) {
          onUpdateStudent({
            ...existing,
            studentCode: paddedCode,
            fullName: cleanName,
            className: normalizedClass,
            numberInClass: Math.max(1, numberInClass),
          });
        }
        setEditingId(null);
      } else {
        onAddStudent({
          id: `stu_${Date.now()}`,
          studentCode: paddedCode,
          fullName: cleanName,
          className: normalizedClass,
          numberInClass: Math.max(1, numberInClass),
          sourceSystem: 'manual',
          createdAt: now,
        });
      }
      setStudentCode('');
      setFullName('');
      return;
    }

    if (activeTab === 'teachers') {
      const code = teacherCode.trim() || `T${String(teachers.length + 1).padStart(3, '0')}`;
      const name = teacherName.trim();
      if (!name) {
        setFormError('กรุณากรอกชื่อ-นามสกุลครูผู้สอน');
        return;
      }
      if (editingId) {
        const existing = teachers.find((t) => t.id === editingId);
        if (existing) {
          onUpdateTeacher({
            ...existing,
            teacherCode: code,
            fullName: name,
            position: teacherPosition.trim() || 'ครูผู้สอน',
            department: teacherDept.trim() || 'ไม่ระบุกลุ่มสาระ',
            homeroomClass: teacherHomeroom.trim()
              ? normalizeThaiClassName(teacherHomeroom)
              : undefined,
          });
        }
        setEditingId(null);
      } else {
        onAddTeacher({
          id: `tch_${Date.now()}`,
          teacherCode: code,
          fullName: name,
          position: teacherPosition.trim() || 'ครูผู้สอน',
          department: teacherDept.trim() || 'ไม่ระบุกลุ่มสาระ',
          homeroomClass: teacherHomeroom.trim()
            ? normalizeThaiClassName(teacherHomeroom)
            : undefined,
          sourceSystem: 'manual',
          createdAt: now,
        });
      }
      setTeacherCode('');
      setTeacherName('');
      return;
    }

    // Subjects
    const sCode = subjectCode.trim() || `SUB${subjects.length + 1}`;
    const sName = subjectName.trim();
    if (!sName) {
      setFormError('กรุณากรอกชื่อรายวิชา');
      return;
    }
    if (editingId) {
      const existing = subjects.find((sub) => sub.id === editingId);
      if (existing) {
        onUpdateSubject({
          ...existing,
          subjectCode: sCode,
          subjectName: sName,
          learningArea: subjectArea.trim() || 'ไม่ระบุกลุ่มสาระ',
          gradeLevel: normalizeThaiClassName(subjectGrade),
          credits: Math.max(0.5, subjectCredits),
          periodsPerWeek: subjectPeriods > 0 ? subjectPeriods : existing.periodsPerWeek,
          teacherName: subjectTeacherName.trim() || existing.teacherName,
        });
      }
      setEditingId(null);
    } else {
      onAddSubject({
        id: `sub_${Date.now()}`,
        subjectCode: sCode,
        subjectName: sName,
        learningArea: subjectArea.trim() || 'ไม่ระบุกลุ่มสาระ',
        gradeLevel: normalizeThaiClassName(subjectGrade),
        credits: Math.max(0.5, subjectCredits),
        periodsPerWeek: subjectPeriods > 0 ? subjectPeriods : undefined,
        teacherName: subjectTeacherName.trim() || undefined,
        sourceSystem: 'manual',
        createdAt: now,
      });
    }
    setSubjectCode('');
    setSubjectName('');
    setSubjectTeacherName('');
  };

  // Multi-row batch add submit
  const handleSaveBatchAdd = () => {
    const now = new Date().toISOString();
    if (activeTab === 'students') {
      const valid = batchStudentRows
        .filter((r) => r.fullName.trim().length > 0 && r.studentCode.trim().length > 0)
        .map((r, idx) => ({
          id: `stu_batch_${Date.now()}_${idx}`,
          studentCode: r.studentCode.replace(/\D/g, '').padStart(digits, '0').slice(-digits),
          fullName: r.fullName.trim(),
          className: normalizeThaiClassName(r.className),
          numberInClass: Math.max(1, r.numberInClass),
          sourceSystem: 'manual' as const,
          createdAt: now,
        }))
        .filter((s) => !isInvalidStudentRecord(s.studentCode, s.fullName));

      if (valid.length === 0) {
        setFormError('กรุณากรอกข้อมูลอย่างน้อย 1 แถว (รหัสและชื่อ-สกุล)');
        return;
      }
      onBulkAddStudents(valid);
      setBatchStudentRows(createEmptyStudentRows(3, 1025, digits, 'ม.1/1'));
      setShowBatchAdd(false);
      setActionMessage(`เพิ่มนักเรียนพร้อมกัน ${valid.length} คนเรียบร้อย`);
      return;
    }

    if (activeTab === 'teachers') {
      const valid: Teacher[] = batchTeacherRows
        .filter((r) => r.fullName.trim().length > 0)
        .map((r, idx) => ({
          id: `tch_batch_${Date.now()}_${idx}`,
          teacherCode: r.teacherCode.trim() || `T${100 + idx}`,
          fullName: r.fullName.trim(),
          position: r.position.trim() || 'ครูผู้สอน',
          department: r.department.trim() || 'ไม่ระบุกลุ่มสาระ',
          homeroomClass: r.homeroomClass.trim()
            ? normalizeThaiClassName(r.homeroomClass)
            : undefined,
          sourceSystem: 'manual',
          createdAt: now,
        }));
      if (valid.length === 0) {
        setFormError('กรุณากรอกชื่อครูผู้สอนอย่างน้อย 1 แถว');
        return;
      }
      onBulkAddTeachers(valid);
      setBatchTeacherRows(createEmptyTeacherRows(3, 20));
      setShowBatchAdd(false);
      setActionMessage(`เพิ่มครูผู้สอนพร้อมกัน ${valid.length} คนเรียบร้อย`);
      return;
    }

    const validSubs: Subject[] = batchSubjectRows
      .filter((r) => r.subjectName.trim().length > 0)
      .map((r, idx) => ({
        id: `sub_batch_${Date.now()}_${idx}`,
        subjectCode: r.subjectCode.trim() || `SUB${10 + idx}`,
        subjectName: r.subjectName.trim(),
        learningArea: r.learningArea.trim() || 'ไม่ระบุกลุ่มสาระ',
        gradeLevel: normalizeThaiClassName(r.gradeLevel),
        credits: Math.max(0.5, r.credits),
        sourceSystem: 'manual',
        createdAt: now,
      }));
    if (validSubs.length === 0) {
      setFormError('กรุณากรอกชื่อรายวิชาอย่างน้อย 1 แถว');
      return;
    }
    onBulkAddSubjects(validSubs);
    setBatchSubjectRows(createEmptySubjectRows(3, 10));
    setShowBatchAdd(false);
    setActionMessage(`เพิ่มรายวิชาพร้อมกัน ${validSubs.length} วิชาเรียบร้อย`);
  };

  const handleFileUpload = async (file: File) => {
    setFormError(null);
    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
      try {
        const buffer = await file.arrayBuffer();
        const wb = parseExcelWorkbook(buffer, file.name);
        if (wb.sheetNames.length === 0) {
          setFormError(`ไม่พบข้อมูลตารางในไฟล์ ${file.name}`);
          return;
        }
        const defaultSheet = wb.sheetNames[0];
        setUploadedWorkbook(wb);
        setSelectedSheetName(defaultSheet);
        const preview = inspectWorkbookImport(wb, defaultSheet, activeImportHint, digits);
        setImportPreview(preview);
        setActionMessage(`อ่านไฟล์ Excel ${file.name} (${wb.sheetNames.length} ชีต) สำเร็จ — ตรวจสอบตัวอย่างด้านล่างก่อนกดนำเข้า`);
      } catch {
        setFormError(`ไม่สามารถอ่านไฟล์ Excel ${file.name} ได้ กรุณาตรวจสอบไฟล์`);
      }
      return;
    }

    const txt = await file.text();
    setUploadedWorkbook(null);
    setSelectedSheetName('');
    setImportText(txt);
    setImportPreview(inspectTextOrSpreadsheetImport(txt, activeImportHint, digits));
  };

  // Excel / CSV / JSON import runner
  const handleRunImport = () => {
    setFormError(null);
    const res = uploadedWorkbook
      ? inspectWorkbookImport(uploadedWorkbook, selectedSheetName, activeImportHint, digits)
      : inspectTextOrSpreadsheetImport(importText, activeImportHint, digits);

    const skipSuffix =
      res.skippedVacantCount && res.skippedVacantCount > 0
        ? ` (ข้ามตำแหน่งว่าง ${res.skippedVacantCount} อัตรา)`
        : '';

    if (activeTab === 'students' && res.students.length > 0) {
      onImportStudents(res.students, importMode);
      setActionMessage(`นำเข้านักเรียนสำเร็จ ${res.students.length} คน`);
      setShowImport(false);
    } else if (activeTab === 'teachers' && res.teachers.length > 0) {
      onImportTeachers(res.teachers, importMode);
      setActionMessage(`นำเข้าครู/บุคลากรสำเร็จ ${res.teachers.length} คน${skipSuffix}`);
      setShowImport(false);
    } else if (activeTab === 'subjects' && res.subjects.length > 0) {
      onImportSubjects(res.subjects, importMode);
      setActionMessage(`นำเข้ารายวิชาสำเร็จ ${res.subjects.length} รายการ`);
      setShowImport(false);
    } else {
      setFormError(res.summaryText || 'ไม่พบข้อมูลที่ตรงกับหมวดหมู่นี้');
    }
  };

  const handleExportCurrentEntityJson = () => {
    const payload =
      activeTab === 'students'
        ? { source: 'DMC_EXPORT', students }
        : activeTab === 'teachers'
        ? { source: 'HRMS_EXPORT', teachers }
        : { source: 'SUBJECTS_EXPORT', subjects };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeTab}_export.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCurrentEntityXlsx = () => {
    if (activeTab === 'students') {
      exportRowsToXlsxDownload(
        'students_dmc_export.xlsx',
        'Students',
        students.map((s) => ({
          รหัสนักเรียน: s.studentCode,
          เลขที่: s.numberInClass,
          'ชื่อ-นามสกุล': s.fullName,
          ห้องเรียน: s.className,
          แหล่งข้อมูล: s.sourceSystem ?? 'manual',
        }))
      );
    } else if (activeTab === 'teachers') {
      exportRowsToXlsxDownload(
        'teachers_hrms_export.xlsx',
        'Teachers_HRMS',
        teachers.map((t) => ({
          ตำแหน่งเลขที่: t.positionNumber ?? t.teacherCode,
          'ชื่อ-นามสกุล': t.fullName,
          ชื่อตำแหน่ง: t.position,
          'ระดับ/อันดับ': t.academicRank ?? '',
          กลุ่มวิชาเอกตามมาตรฐานวิชาเอก: t.major ?? t.department,
          ชั้นที่ปรึกษา: t.homeroomClass ?? '',
          สถานะตำแหน่ง: t.positionStatus ?? 'มีคนถือครอง',
        }))
      );
    } else {
      exportRowsToXlsxDownload(
        'subjects_timetable_export.xlsx',
        'Timetable_Subjects',
        subjects.map((sub) => ({
          รหัสวิชา: sub.subjectCode,
          ชื่อวิชา: sub.subjectName,
          กลุ่มสาระการเรียนรู้: sub.learningArea,
          ระดับชั้น: sub.gradeLevel,
          'คาบ/สัปดาห์': sub.periodsPerWeek ?? '',
          หน่วยกิต: sub.credits,
          ครูผู้สอน: sub.teacherName ?? '',
        }))
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header + Entity Switcher + Batch Toolbar */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
              ฐานข้อมูลโรงเรียน: นักเรียน · ครูผู้สอน · รายวิชา
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              นำเข้าตรงจากไฟล์{' '}
              <span className="font-mono font-medium">Excel (.xlsx)</span> ·{' '}
              <span className="font-mono font-medium">CSV</span> ·{' '}
              <span className="font-mono font-medium">JSON</span> รองรับ{' '}
              <span className="font-mono font-medium">DMC</span> และ{' '}
              <span className="font-mono font-medium">HRMS</span> พร้อมข้ามตำแหน่งว่างอัตโนมัติ
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setShowBatchAdd((v) => !v);
                setShowImport(false);
              }}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300 whitespace-nowrap"
            >
              <Layers className="h-3.5 w-3.5" aria-hidden="true" />
              <span>เพิ่มทีละหลายคน</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setShowImport((v) => !v);
                setShowBatchAdd(false);
              }}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 whitespace-nowrap"
            >
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              <span>นำเข้า Excel / CSV / JSON</span>
            </button>

            <button
              type="button"
              onClick={handleExportCurrentEntityXlsx}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 whitespace-nowrap"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <span>ส่งออก .XLSX</span>
            </button>

            <button
              type="button"
              onClick={handleExportCurrentEntityJson}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>ส่งออก JSON</span>
            </button>
          </div>
        </div>

        {/* Entity Tabs */}
        <div
          role="tablist"
          aria-label="เลือกหมวดข้อมูล"
          className="mt-5 inline-flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800"
        >
          {(
            [
              ['students', `นักเรียน (${students.length})`],
              ['teachers', `ครูผู้สอน HRMS (${teachers.length})`],
              ['subjects', `รายวิชาตารางสอน (${subjects.length})`],
            ] as Array<[EntityTab, string]>
          ).map(([tabId, label]) => (
            <button
              key={tabId}
              type="button"
              role="tab"
              aria-selected={activeTab === tabId}
              onClick={() => setActiveTab(tabId)}
              className={`min-h-[38px] rounded-lg px-4 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                activeTab === tabId
                  ? 'bg-white text-indigo-700 shadow-sm dark:bg-slate-700 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {actionMessage && (
          <div
            role="status"
            className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200"
          >
            {actionMessage}
          </div>
        )}

        {/* Excel / CSV / JSON Import Drawer */}
        {showImport && (
          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3 dark:border-slate-700 dark:bg-slate-800/40">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold text-slate-800 dark:text-slate-100">
                  นำเข้าข้อมูล{' '}
                  {activeTab === 'students'
                    ? 'นักเรียน (Excel / CSV / DMC JSON)'
                    : activeTab === 'teachers'
                    ? 'บุคลากร HRMS (Excel / CSV / JSON · ข้ามตำแหน่งว่าง)'
                    : 'รายวิชาตามตารางสอน (Excel / CSV / JSON)'}
                </span>
                <select
                  aria-label="โหมดการนำเข้า"
                  value={importMode}
                  onChange={(e) => setImportMode(e.target.value as 'merge' | 'replace')}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                >
                  <option value="merge">ผสานเพิ่ม (Merge)</option>
                  <option value="replace">แทนที่ข้อมูลเดิมทั้งหมด (Replace)</option>
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {onApplyBanAphonPreset && (
                  <button
                    type="button"
                    onClick={() => {
                      onApplyBanAphonPreset('replace');
                      setActionMessage(
                        'โหลดข้อมูลโรงเรียนบ้านอาโพน (1032650660) เรียบร้อย: ครู 20 คน (HRMS 18 + ตารางสอน 2, ข้ามตำแหน่งว่าง 4854) และรายวิชาแยกตามระดับชั้น/ครูครบทุกห้อง'
                      );
                      setShowImport(false);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-200 whitespace-nowrap"
                  >
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>โหลดข้อมูลโรงเรียนบ้านอาโพน (2569)</span>
                  </button>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,.tsv,.json,.txt"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) await handleFileUpload(f);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 whitespace-nowrap"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  <span>อัปโหลด .XLSX / .CSV / .JSON</span>
                </button>
              </div>
            </div>

            {/* Uploaded Excel Sheet Picker OR Text/Paste Area */}
            {uploadedWorkbook ? (
              <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2.5 dark:border-slate-700 dark:bg-slate-900">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="font-medium text-slate-800 dark:text-slate-100">
                    ไฟล์ Excel: <span className="font-mono">{uploadedWorkbook.fileName}</span> ·{' '}
                    <span className="font-mono tabular-nums">{uploadedWorkbook.sheetNames.length}</span> ชีต
                  </div>
                  <div className="flex items-center gap-2">
                    <label htmlFor="classes-excel-sheet" className="text-slate-500 dark:text-slate-400">
                      ชีตที่นำเข้า:
                    </label>
                    <select
                      id="classes-excel-sheet"
                      aria-label="เลือกชีต Excel"
                      value={selectedSheetName}
                      onChange={(e) => {
                        const nextSheet = e.target.value;
                        setSelectedSheetName(nextSheet);
                        setImportPreview(
                          inspectWorkbookImport(uploadedWorkbook, nextSheet, activeImportHint, digits)
                        );
                      }}
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    >
                      {uploadedWorkbook.sheetNames.map((name) => (
                        <option key={name} value={name}>
                          {name} ({uploadedWorkbook.sheets[name]?.length ?? 0} แถว)
                        </option>
                      ))}
                      {uploadedWorkbook.sheetNames.length > 1 && (
                        <option value="__ALL__">รวมทุกชีตในไฟล์</option>
                      )}
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        setUploadedWorkbook(null);
                        setSelectedSheetName('');
                        setImportPreview(
                          inspectTextOrSpreadsheetImport(importText, activeImportHint, digits)
                        );
                      }}
                      className="text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
                    >
                      สลับไปวางข้อความ
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-slate-500 dark:text-slate-400">ตัวอย่างรูปแบบจริง:</span>
                  <button
                    type="button"
                    onClick={() => {
                      const txt =
                        activeTab === 'students'
                          ? SAMPLE_DMC_JSON
                          : activeTab === 'teachers'
                          ? SAMPLE_OBEC_HRMS_JSON
                          : SAMPLE_TIMETABLE_SUBJECTS_JSON;
                      setImportText(txt);
                      setImportPreview(inspectTextOrSpreadsheetImport(txt, activeImportHint, digits));
                    }}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  >
                    {activeTab === 'students'
                      ? 'ตัวอย่าง DMC JSON'
                      : activeTab === 'teachers'
                      ? 'ตัวอย่าง HRMS สพฐ. (บ้านอาโพน)'
                      : 'ตัวอย่างวิชาตามตารางสอน (บ้านอาโพน)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const txt =
                        activeTab === 'students'
                          ? 'รหัสนักเรียน,ชื่อ-สกุล,ห้องเรียน,เลขที่\n1015,เด็กชายธนกฤต สุขใจ,ป.1/1,1\n1016,เด็กหญิงพิมพ์มาดา ใจดี,ม.1,5'
                          : activeTab === 'teachers'
                          ? 'ตำแหน่งเลขที่,คำนำหน้าชื่อ,ชื่อ,นามสกุล,ชื่อตำแหน่ง,ระดับ/อันดับ,กลุ่มวิชาเอกตามมาตรฐานวิชาเอก,สถานะตำแหน่ง\n8209,นาย,อดิเรก,โพธิ์ธรรม,ครู,คศ. 3,วิทยาศาสตร์ (ประถมศึกษา/ม.ต้น),มีคนถือครอง\n4854,,,,ครู,,,ว่างรอเกลี่ย'
                          : 'รหัสวิชา,ชื่อวิชา,กลุ่มสาระการเรียนรู้,ระดับชั้น,คาบ/สัปดาห์,หน่วยกิต,ครูผู้สอน\nค15101-5/1,คณิตศาสตร์,คณิตศาสตร์,ป.5/1,4,1.0,นายอดิเรก โพธิ์ธรรม\nค15101-5/2,คณิตศาสตร์,คณิตศาสตร์,ป.5/2,4,1.0,นายอดิเรก โพธิ์ธรรม';
                      setImportText(txt);
                      setImportPreview(inspectTextOrSpreadsheetImport(txt, activeImportHint, digits));
                    }}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  >
                    ตัวอย่าง CSV / Copy จาก Excel
                  </button>
                </div>
                <textarea
                  aria-label="วางข้อมูล JSON หรือ CSV"
                  rows={5}
                  value={importText}
                  onChange={(e) => {
                    const val = e.target.value;
                    setImportText(val);
                    setImportPreview(inspectTextOrSpreadsheetImport(val, activeImportHint, digits));
                  }}
                  className="w-full rounded-xl border border-slate-300 bg-white p-3 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </>
            )}

            {importPreview && (
              <div
                className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                  importPreview.detectedType === 'unknown'
                    ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200'
                }`}
              >
                {importPreview.summaryText}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowImport(false)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                ปิด
              </button>
              <button
                type="button"
                onClick={handleRunImport}
                className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
              >
                นำเข้าข้อมูลเข้าฐานระบบ
              </button>
            </div>
          </div>
        )}

        {/* Batch Multi-Row Add Drawer */}
        {showBatchAdd && (
          <div className="mt-5 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 space-y-3 dark:border-indigo-900/50 dark:bg-indigo-950/20">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-indigo-900 dark:text-indigo-200">
                เพิ่มข้อมูลพร้อมกันหลายรายการ (กรอกเฉพาะแถวที่ต้องการ)
              </span>
              <button
                type="button"
                onClick={() => {
                  if (activeTab === 'students') {
                    setBatchStudentRows((prev) => [
                      ...prev,
                      ...createEmptyStudentRows(
                        3,
                        1020 + prev.length,
                        digits,
                        prev[0]?.className || 'ม.1/1'
                      ),
                    ]);
                  } else if (activeTab === 'teachers') {
                    setBatchTeacherRows((prev) => [
                      ...prev,
                      ...createEmptyTeacherRows(3, 10 + prev.length),
                    ]);
                  } else {
                    setBatchSubjectRows((prev) => [
                      ...prev,
                      ...createEmptySubjectRows(3, 5 + prev.length),
                    ]);
                  }
                }}
                className="rounded-lg border border-indigo-300 bg-white px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50 dark:border-indigo-700 dark:bg-slate-900 dark:text-indigo-300"
              >
                + เพิ่มแถวว่างอีก 3 แถว
              </button>
            </div>

            {activeTab === 'students' && (
              <div className="space-y-2">
                {batchStudentRows.map((row, idx) => (
                  <div key={row.key} className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                    <input
                      aria-label={`รหัสแถวที่ ${idx + 1}`}
                      value={row.studentCode}
                      maxLength={digits}
                      onChange={(e) =>
                        setBatchStudentRows((prev) =>
                          prev.map((item) =>
                            item.key === row.key
                              ? { ...item, studentCode: e.target.value.replace(/\D/g, '') }
                              : item
                          )
                        )
                      }
                      placeholder="รหัส"
                      className="sm:col-span-2 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                    <input
                      aria-label={`ชื่อ-สกุลแถวที่ ${idx + 1}`}
                      value={row.fullName}
                      onChange={(e) =>
                        setBatchStudentRows((prev) =>
                          prev.map((item) =>
                            item.key === row.key ? { ...item, fullName: e.target.value } : item
                          )
                        )
                      }
                      placeholder="ชื่อ-นามสกุล"
                      className="sm:col-span-5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                    <input
                      aria-label={`ห้องเรียนแถวที่ ${idx + 1}`}
                      value={row.className}
                      onChange={(e) =>
                        setBatchStudentRows((prev) =>
                          prev.map((item) =>
                            item.key === row.key ? { ...item, className: e.target.value } : item
                          )
                        )
                      }
                      placeholder="ห้อง เช่น ม.1/1"
                      className="sm:col-span-3 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                    <input
                      aria-label={`เลขที่แถวที่ ${idx + 1}`}
                      type="number"
                      min={1}
                      value={row.numberInClass}
                      onChange={(e) =>
                        setBatchStudentRows((prev) =>
                          prev.map((item) =>
                            item.key === row.key
                              ? { ...item, numberInClass: Number(e.target.value) || 1 }
                              : item
                          )
                        )
                      }
                      className="sm:col-span-2 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'teachers' && (
              <div className="space-y-2">
                {batchTeacherRows.map((row, idx) => (
                  <div key={row.key} className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                    <input
                      aria-label={`รหัสครูแถวที่ ${idx + 1}`}
                      value={row.teacherCode}
                      onChange={(e) =>
                        setBatchTeacherRows((prev) =>
                          prev.map((item) =>
                            item.key === row.key ? { ...item, teacherCode: e.target.value } : item
                          )
                        )
                      }
                      placeholder="รหัสครู"
                      className="sm:col-span-2 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                    <input
                      aria-label={`ชื่อครูแถวที่ ${idx + 1}`}
                      value={row.fullName}
                      onChange={(e) =>
                        setBatchTeacherRows((prev) =>
                          prev.map((item) =>
                            item.key === row.key ? { ...item, fullName: e.target.value } : item
                          )
                        )
                      }
                      placeholder="ชื่อ-สกุลครู"
                      className="sm:col-span-4 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                    <input
                      aria-label={`ตำแหน่งแถวที่ ${idx + 1}`}
                      value={row.position}
                      onChange={(e) =>
                        setBatchTeacherRows((prev) =>
                          prev.map((item) =>
                            item.key === row.key ? { ...item, position: e.target.value } : item
                          )
                        )
                      }
                      placeholder="ตำแหน่ง"
                      className="sm:col-span-3 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                    <input
                      aria-label={`กลุ่มสาระแถวที่ ${idx + 1}`}
                      value={row.department}
                      onChange={(e) =>
                        setBatchTeacherRows((prev) =>
                          prev.map((item) =>
                            item.key === row.key ? { ...item, department: e.target.value } : item
                          )
                        )
                      }
                      placeholder="กลุ่มสาระ"
                      className="sm:col-span-3 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'subjects' && (
              <div className="space-y-2">
                {batchSubjectRows.map((row, idx) => (
                  <div key={row.key} className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                    <input
                      aria-label={`รหัสวิชาแถวที่ ${idx + 1}`}
                      value={row.subjectCode}
                      onChange={(e) =>
                        setBatchSubjectRows((prev) =>
                          prev.map((item) =>
                            item.key === row.key ? { ...item, subjectCode: e.target.value } : item
                          )
                        )
                      }
                      placeholder="รหัสวิชา"
                      className="sm:col-span-2 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                    <input
                      aria-label={`ชื่อวิชาแถวที่ ${idx + 1}`}
                      value={row.subjectName}
                      onChange={(e) =>
                        setBatchSubjectRows((prev) =>
                          prev.map((item) =>
                            item.key === row.key ? { ...item, subjectName: e.target.value } : item
                          )
                        )
                      }
                      placeholder="ชื่อรายวิชา"
                      className="sm:col-span-4 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                    <input
                      aria-label={`กลุ่มสาระวิชาแถวที่ ${idx + 1}`}
                      value={row.learningArea}
                      onChange={(e) =>
                        setBatchSubjectRows((prev) =>
                          prev.map((item) =>
                            item.key === row.key ? { ...item, learningArea: e.target.value } : item
                          )
                        )
                      }
                      placeholder="กลุ่มสาระ"
                      className="sm:col-span-3 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                    <input
                      aria-label={`ระดับชั้นแถวที่ ${idx + 1}`}
                      value={row.gradeLevel}
                      onChange={(e) =>
                        setBatchSubjectRows((prev) =>
                          prev.map((item) =>
                            item.key === row.key ? { ...item, gradeLevel: e.target.value } : item
                          )
                        )
                      }
                      placeholder="ระดับชั้น"
                      className="sm:col-span-2 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                    <input
                      aria-label={`หน่วยกิตแถวที่ ${idx + 1}`}
                      type="number"
                      step={0.5}
                      min={0.5}
                      value={row.credits}
                      onChange={(e) =>
                        setBatchSubjectRows((prev) =>
                          prev.map((item) =>
                            item.key === row.key
                              ? { ...item, credits: Number(e.target.value) || 1 }
                              : item
                          )
                        )
                      }
                      className="sm:col-span-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowBatchAdd(false)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                ปิด
              </button>
              <button
                type="button"
                onClick={handleSaveBatchAdd}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                <Save className="h-3.5 w-3.5" aria-hidden="true" />
                <span>บันทึกเพิ่มทั้งหมด</span>
              </button>
            </div>
          </div>
        )}

        {/* Quick Single Add / Edit Form */}
        <form
          onSubmit={handleSubmitSingle}
          className="mt-5 grid grid-cols-1 gap-4 border-t border-slate-100 pt-5 sm:grid-cols-12 sm:items-end dark:border-slate-800"
        >
          {activeTab === 'students' && (
            <>
              <div className="sm:col-span-2">
                <label
                  htmlFor="student-code-input"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  รหัส OMR ({digits} หลัก)
                </label>
                <input
                  id="student-code-input"
                  type="text"
                  maxLength={digits}
                  value={studentCode}
                  onChange={(e) => setStudentCode(e.target.value.replace(/\D/g, ''))}
                  placeholder={'1'.padEnd(digits, '0')}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-indigo-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="sm:col-span-4">
                <label
                  htmlFor="student-name-input"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  ชื่อ-นามสกุลนักเรียน
                </label>
                <input
                  id="student-name-input"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="เช่น เด็กหญิงณิชาภัทร ใจงาม"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="sm:col-span-3">
                <label
                  htmlFor="student-class-input"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  ห้องเรียน (เช่น ป 1/1 หรือ ม.1/1)
                </label>
                <input
                  id="student-class-input"
                  type="text"
                  value={rawClass}
                  onChange={(e) => setRawClass(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="sm:col-span-1">
                <label
                  htmlFor="student-num-input"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  เลขที่
                </label>
                <input
                  id="student-num-input"
                  type="number"
                  min={1}
                  value={numberInClass}
                  onChange={(e) => setNumberInClass(Number.parseInt(e.target.value, 10) || 1)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
            </>
          )}

          {activeTab === 'teachers' && (
            <>
              <div className="sm:col-span-2">
                <label
                  htmlFor="teacher-code-input"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  รหัสครู (HRMS)
                </label>
                <input
                  id="teacher-code-input"
                  type="text"
                  value={teacherCode}
                  onChange={(e) => setTeacherCode(e.target.value)}
                  placeholder="T104"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="sm:col-span-3">
                <label
                  htmlFor="teacher-name-input"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  ชื่อ-นามสกุลครูผู้สอน
                </label>
                <input
                  id="teacher-name-input"
                  type="text"
                  value={teacherName}
                  onChange={(e) => setTeacherName(e.target.value)}
                  placeholder="เช่น นางสาวกนกวรรณ มีสุข"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="teacher-position-input"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  ตำแหน่ง / วิทยฐานะ
                </label>
                <input
                  id="teacher-position-input"
                  type="text"
                  value={teacherPosition}
                  onChange={(e) => setTeacherPosition(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="sm:col-span-3">
                <label
                  htmlFor="teacher-dept-input"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  กลุ่มสาระการเรียนรู้
                </label>
                <input
                  id="teacher-dept-input"
                  type="text"
                  value={teacherDept}
                  onChange={(e) => setTeacherDept(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
            </>
          )}

          {activeTab === 'subjects' && (
            <>
              <div className="sm:col-span-2">
                <label
                  htmlFor="subject-code-input"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  รหัสวิชา
                </label>
                <input
                  id="subject-code-input"
                  type="text"
                  value={subjectCode}
                  onChange={(e) => setSubjectCode(e.target.value)}
                  placeholder="ว21102"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="sm:col-span-3">
                <label
                  htmlFor="subject-name-input"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  ชื่อรายวิชา
                </label>
                <input
                  id="subject-name-input"
                  type="text"
                  value={subjectName}
                  onChange={(e) => setSubjectName(e.target.value)}
                  placeholder="เช่น วิทยาศาสตร์"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="subject-grade-input"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  ระดับชั้น/ห้อง
                </label>
                <input
                  id="subject-grade-input"
                  type="text"
                  value={subjectGrade}
                  onChange={(e) => setSubjectGrade(e.target.value)}
                  placeholder="ป.5/1 หรือ ม.1"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="subject-teacher-input"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  ครูผู้สอน
                </label>
                <input
                  id="subject-teacher-input"
                  type="text"
                  value={subjectTeacherName}
                  onChange={(e) => setSubjectTeacherName(e.target.value)}
                  placeholder="ชื่อครูผู้สอน"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="sm:col-span-1">
                <label
                  htmlFor="subject-periods-input"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  คาบ
                </label>
                <input
                  id="subject-periods-input"
                  type="number"
                  min={1}
                  max={12}
                  value={subjectPeriods}
                  onChange={(e) => setSubjectPeriods(Number.parseInt(e.target.value, 10) || 1)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
            </>
          )}

          <div className="sm:col-span-2 flex gap-2">
            <button
              type="submit"
              className="inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 whitespace-nowrap"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>
                {editingId
                  ? 'บันทึกแก้ไข'
                  : activeTab === 'students'
                  ? 'เพิ่มนักเรียน'
                  : activeTab === 'teachers'
                  ? 'เพิ่มครู'
                  : 'เพิ่มวิชา'}
              </span>
            </button>
          </div>
        </form>

        {editingId && (
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setStudentCode('');
                setFullName('');
                setTeacherCode('');
                setTeacherName('');
                setSubjectCode('');
                setSubjectName('');
              }}
              className="text-xs text-indigo-600 hover:underline dark:text-indigo-400"
            >
              ยกเลิกการแก้ไขแถว
            </button>
          </div>
        )}

        {formError && (
          <p className="mt-2 text-xs font-medium text-rose-600 dark:text-rose-400">
            {formError}
          </p>
        )}
      </section>

      {/* Roster / Table with Multi-Select, Bulk Edit & Inline-Confirmed Bulk Delete */}
      <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {/* Bulk Action Bar */}
        {(selectedIds.size > 0 || bulkEditing) && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-indigo-200 bg-indigo-50/70 px-6 py-3 dark:border-indigo-900/60 dark:bg-indigo-950/40">
            <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-indigo-900 dark:text-indigo-200">
              <CheckSquare className="h-4 w-4" aria-hidden="true" />
              <span className="font-mono tabular-nums">
                เลือกแล้ว {selectedIds.size} รายการ
              </span>

              {!bulkEditing ? (
                <button
                  type="button"
                  onClick={startBulkEdit}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50 dark:border-indigo-700 dark:bg-slate-900 dark:text-indigo-300"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>แก้ไขที่เลือกทีละหลายคน</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={saveBulkEdit}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  <Save className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>บันทึกแก้ไขทั้งหมด ({selectedIds.size})</span>
                </button>
              )}

              {activeTab === 'students' && (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    aria-label="ย้ายห้องเรียนเป็น"
                    value={batchClassTarget}
                    onChange={(e) => setBatchClassTarget(e.target.value)}
                    className="w-24 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={handleApplyBatchClassMove}
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  >
                    ย้ายห้องทั้งหมดที่เลือก
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!confirmBulkDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmBulkDelete(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>ลบที่เลือก ({selectedIds.size})</span>
                </button>
              ) : (
                <div className="flex items-center gap-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-1 dark:border-rose-800 dark:bg-rose-950/60">
                  <span className="text-xs font-semibold text-rose-800 dark:text-rose-200">
                    ยืนยันลบ {selectedIds.size} รายการ?
                  </span>
                  <button
                    type="button"
                    onClick={handleConfirmBulkDelete}
                    className="rounded-md bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-700"
                  >
                    ยืนยันลบ
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmBulkDelete(false)}
                    className="rounded-md bg-white px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    ยกเลิก
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setSelectedIds(new Set());
                  setBulkEditing(false);
                  setConfirmBulkDelete(false);
                }}
                aria-label="ล้างการเลือกทั้งหมด"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {/* Filter & Search Toolbar */}
        <div className="flex flex-col gap-3 border-b border-slate-200 px-6 py-4 md:flex-row md:items-center md:justify-between dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            {activeTab === 'students' ? (
              <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => setClassFilter('all')}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                    classFilter === 'all'
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
                  }`}
                >
                  ทุกห้อง ({students.length})
                </button>
                {normalizedClasses.map((cls) => (
                  <button
                    key={cls}
                    type="button"
                    onClick={() => setClassFilter(cls)}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                      classFilter === cls
                        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
                    }`}
                  >
                    {cls}
                  </button>
                ))}
              </div>
            ) : activeTab === 'teachers' ? (
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                รายชื่อครูและบุคลากรทั้งหมด <span className="font-mono tabular-nums">{filteredTeachers.length}</span> คน
              </span>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  รายวิชาตามตารางสอน <span className="font-mono tabular-nums">{filteredSubjects.length}</span> รายการ
                </span>
                <select
                  aria-label="กรองรายวิชาตามระดับชั้น"
                  value={subjectGradeFilter}
                  onChange={(e) => setSubjectGradeFilter(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <option value="all">ทุกระดับชั้น ({subjects.length})</option>
                  {subjectGrades.map((grade) => (
                    <option key={grade} value={grade}>
                      {grade}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {!bulkEditing && currentRowIds.length > 0 && (
              <button
                type="button"
                onClick={startBulkEdit}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <Pencil className="h-3 w-3" aria-hidden="true" />
                <span>แก้ไขแบบตาราง</span>
              </button>
            )}
          </div>

          <div className="relative w-full md:w-64">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label="ค้นหาในตาราง"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหารหัส หรือ ชื่อ..."
              className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-9 pr-3 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
        </div>

        {/* Entity Data Tables */}
        <div className="overflow-x-auto">
          {activeTab === 'students' && (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label="เลือกนักเรียนทั้งหมด"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                    />
                  </th>
                  <th className="px-4 py-3">รหัส OMR</th>
                  <th className="px-4 py-3">เลขที่</th>
                  <th className="px-4 py-3">ชื่อ-นามสกุล</th>
                  <th className="px-4 py-3">ห้องเรียน (มาตรฐาน)</th>
                  <th className="px-4 py-3">แหล่งข้อมูล</th>
                  <th className="px-6 py-3 text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredStudents.map((stu) => {
                  const isChecked = selectedIds.has(stu.id);
                  const editRow = bulkEditing && isChecked ? studentEdits[stu.id] : null;
                  return (
                    <tr
                      key={stu.id}
                      className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 ${
                        isChecked ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label={`เลือกนักเรียน ${stu.fullName}`}
                          checked={isChecked}
                          onChange={() => toggleRowSelection(stu.id)}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                        />
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                        {editRow ? (
                          <input
                            aria-label={`แก้ไขรหัส ${stu.fullName}`}
                            value={editRow.studentCode}
                            maxLength={digits}
                            onChange={(e) =>
                              setStudentEdits((prev) => ({
                                ...prev,
                                [stu.id]: {
                                  ...editRow,
                                  studentCode: e.target.value.replace(/\D/g, ''),
                                },
                              }))
                            }
                            className="w-20 rounded border border-indigo-300 bg-white px-2 py-1 font-mono text-xs text-slate-900 dark:border-indigo-700 dark:bg-slate-900 dark:text-white"
                          />
                        ) : (
                          stu.studentCode
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums text-xs text-slate-600 dark:text-slate-300">
                        {editRow ? (
                          <input
                            type="number"
                            min={1}
                            aria-label={`แก้ไขเลขที่ ${stu.fullName}`}
                            value={editRow.numberInClass}
                            onChange={(e) =>
                              setStudentEdits((prev) => ({
                                ...prev,
                                [stu.id]: {
                                  ...editRow,
                                  numberInClass: Number(e.target.value) || 1,
                                },
                              }))
                            }
                            className="w-14 rounded border border-indigo-300 bg-white px-2 py-1 font-mono text-xs text-slate-900 dark:border-indigo-700 dark:bg-slate-900 dark:text-white"
                          />
                        ) : (
                          stu.numberInClass
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                        {editRow ? (
                          <input
                            aria-label={`แก้ไขชื่อ ${stu.fullName}`}
                            value={editRow.fullName}
                            onChange={(e) =>
                              setStudentEdits((prev) => ({
                                ...prev,
                                [stu.id]: { ...editRow, fullName: e.target.value },
                              }))
                            }
                            className="w-full min-w-[160px] rounded border border-indigo-300 bg-white px-2 py-1 text-xs text-slate-900 dark:border-indigo-700 dark:bg-slate-900 dark:text-white"
                          />
                        ) : (
                          stu.fullName
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                        {editRow ? (
                          <input
                            aria-label={`แก้ไขห้อง ${stu.fullName}`}
                            value={editRow.className}
                            onChange={(e) =>
                              setStudentEdits((prev) => ({
                                ...prev,
                                [stu.id]: { ...editRow, className: e.target.value },
                              }))
                            }
                            className="w-36 rounded border border-indigo-300 bg-white px-2 py-1 text-xs text-slate-900 dark:border-indigo-700 dark:bg-slate-900 dark:text-white"
                          />
                        ) : (
                          stu.className
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                        {(stu.sourceSystem ?? 'manual').toUpperCase()}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(stu.id);
                              setStudentCode(stu.studentCode);
                              setFullName(stu.fullName);
                              setRawClass(stu.className);
                              setNumberInClass(stu.numberInClass);
                            }}
                            aria-label={`แก้ไขข้อมูล ${stu.fullName}`}
                            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteStudent(stu.id)}
                            aria-label={`ลบข้อมูล ${stu.fullName}`}
                            className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {activeTab === 'teachers' && (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label="เลือกครูทั้งหมด"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                    />
                  </th>
                  <th className="px-4 py-3">เลขที่ตำแหน่ง / รหัส</th>
                  <th className="px-4 py-3">ชื่อ-นามสกุล</th>
                  <th className="px-4 py-3">ตำแหน่ง · อันดับ</th>
                  <th className="px-4 py-3">วิชาเอก / กลุ่มสาระ</th>
                  <th className="px-4 py-3">ที่ปรึกษา</th>
                  <th className="px-6 py-3 text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredTeachers.map((t) => {
                  const isChecked = selectedIds.has(t.id);
                  const editRow = bulkEditing && isChecked ? teacherEdits[t.id] : null;
                  const positionLabel = t.academicRank
                    ? `${t.position} · ${t.academicRank}`
                    : t.position;
                  return (
                    <tr
                      key={t.id}
                      className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 ${
                        isChecked ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label={`เลือกครู ${t.fullName}`}
                          checked={isChecked}
                          onChange={() => toggleRowSelection(t.id)}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                        />
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                        {t.positionNumber ?? t.teacherCode}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                        {editRow ? (
                          <input
                            aria-label={`แก้ไขชื่อครู ${t.fullName}`}
                            value={editRow.fullName}
                            onChange={(e) =>
                              setTeacherEdits((prev) => ({
                                ...prev,
                                [t.id]: { ...editRow, fullName: e.target.value },
                              }))
                            }
                            className="w-full rounded border border-indigo-300 bg-white px-2 py-1 text-xs dark:border-indigo-700 dark:bg-slate-900 dark:text-white"
                          />
                        ) : (
                          t.fullName
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                        {editRow ? (
                          <input
                            aria-label={`แก้ไขตำแหน่ง ${t.fullName}`}
                            value={editRow.position}
                            onChange={(e) =>
                              setTeacherEdits((prev) => ({
                                ...prev,
                                [t.id]: { ...editRow, position: e.target.value },
                              }))
                            }
                            className="w-full rounded border border-indigo-300 bg-white px-2 py-1 text-xs dark:border-indigo-700 dark:bg-slate-900 dark:text-white"
                          />
                        ) : (
                          positionLabel
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                        {t.major || t.department}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                        {t.homeroomClass || '—'}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(t.id);
                              setTeacherCode(t.teacherCode);
                              setTeacherName(t.fullName);
                              setTeacherPosition(t.position);
                              setTeacherDept(t.department);
                              setTeacherHomeroom(t.homeroomClass ?? '');
                            }}
                            aria-label={`แก้ไขครู ${t.fullName}`}
                            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteTeacher(t.id)}
                            aria-label={`ลบครู ${t.fullName}`}
                            className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {activeTab === 'subjects' && (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label="เลือกรายวิชาทั้งหมด"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                    />
                  </th>
                  <th className="px-4 py-3">รหัสวิชา</th>
                  <th className="px-4 py-3">ชื่อรายวิชา</th>
                  <th className="px-4 py-3">ระดับชั้น/ห้อง</th>
                  <th className="px-4 py-3">ครูผู้สอน</th>
                  <th className="px-4 py-3 text-right">คาบ/สัปดาห์</th>
                  <th className="px-4 py-3 text-right">หน่วยกิต</th>
                  <th className="px-6 py-3 text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredSubjects.map((sub) => {
                  const isChecked = selectedIds.has(sub.id);
                  const editRow = bulkEditing && isChecked ? subjectEdits[sub.id] : null;
                  return (
                    <tr
                      key={sub.id}
                      className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 ${
                        isChecked ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label={`เลือกรายวิชา ${sub.subjectName}`}
                          checked={isChecked}
                          onChange={() => toggleRowSelection(sub.id)}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                        />
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                        {sub.subjectCode}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                        {editRow ? (
                          <input
                            aria-label={`แก้ไขชื่อวิชา ${sub.subjectName}`}
                            value={editRow.subjectName}
                            onChange={(e) =>
                              setSubjectEdits((prev) => ({
                                ...prev,
                                [sub.id]: { ...editRow, subjectName: e.target.value },
                              }))
                            }
                            className="w-full rounded border border-indigo-300 bg-white px-2 py-1 text-xs dark:border-indigo-700 dark:bg-slate-900 dark:text-white"
                          />
                        ) : (
                          <div>
                            <div>{sub.subjectName}</div>
                            <div className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
                              {sub.learningArea}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-700 dark:text-slate-200">
                        {sub.gradeLevel}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                        {editRow ? (
                          <input
                            aria-label={`แก้ไขครูผู้สอน ${sub.subjectName}`}
                            value={editRow.teacherName ?? ''}
                            onChange={(e) =>
                              setSubjectEdits((prev) => ({
                                ...prev,
                                [sub.id]: { ...editRow, teacherName: e.target.value },
                              }))
                            }
                            className="w-full rounded border border-indigo-300 bg-white px-2 py-1 text-xs dark:border-indigo-700 dark:bg-slate-900 dark:text-white"
                          />
                        ) : (
                          sub.teacherName || '—'
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-xs text-slate-700 dark:text-slate-200">
                        {sub.periodsPerWeek ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-xs text-slate-700 dark:text-slate-200">
                        {sub.credits.toFixed(1)}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(sub.id);
                              setSubjectCode(sub.subjectCode);
                              setSubjectName(sub.subjectName);
                              setSubjectArea(sub.learningArea);
                              setSubjectGrade(sub.gradeLevel);
                              setSubjectCredits(sub.credits);
                              setSubjectTeacherName(sub.teacherName ?? '');
                              setSubjectPeriods(sub.periodsPerWeek ?? 2);
                            }}
                            aria-label={`แก้ไขวิชา ${sub.subjectName}`}
                            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteSubject(sub.id)}
                            aria-label={`ลบวิชา ${sub.subjectName}`}
                            className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
