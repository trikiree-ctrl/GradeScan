import { useMemo, useState } from 'react';
import { Pencil, Plus, Search, Trash2, Upload } from 'lucide-react';
import type { Student } from '../types/omr';
import {
  isInvalidStudentRecord,
  normalizeThaiClassName,
  parseStudentCsv,
} from '../utils/normalization';

interface ClassesViewProps {
  students: Student[];
  onAddStudent: (student: Student) => void;
  onUpdateStudent: (student: Student) => void;
  onDeleteStudent: (studentId: string) => void;
  onBulkImportStudents: (students: Student[]) => void;
}

export function ClassesView({
  students,
  onAddStudent,
  onUpdateStudent,
  onDeleteStudent,
  onBulkImportStudents,
}: ClassesViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [showImport, setShowImport] = useState(false);
  const [csvText, setCsvText] = useState(
    '1015,เด็กชายธนกฤต สุขใจ,ป 1/1,1\n1016,เด็กหญิงพิมพ์มาดา ใจดี,ม.1 / 2,5'
  );

  // Add/Edit form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [studentCode, setStudentCode] = useState('');
  const [fullName, setFullName] = useState('');
  const [rawClass, setRawClass] = useState('ม.1/1');
  const [numberInClass, setNumberInClass] = useState(1);
  const [formError, setFormError] = useState<string | null>(null);

  const normalizedClasses = useMemo(() => {
    const set = new Set<string>();
    for (const s of students) set.add(s.className);
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'th'));
  }, [students]);

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

  const handleSubmitStudent = (e: React.FormEvent) => {
    e.preventDefault();
    const paddedCode = studentCode.trim().padStart(4, '0').slice(0, 4);
    const cleanName = fullName.trim();

    if (isInvalidStudentRecord(paddedCode, cleanName)) {
      setFormError('กรุณากรอกรหัสนักเรียนเป็นตัวเลข (1–4 หลัก) และชื่อ-สกุลที่ถูกต้อง');
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
        createdAt: new Date().toISOString(),
      });
    }

    setStudentCode('');
    setFullName('');
    setFormError(null);
  };

  const handleStartEdit = (stu: Student) => {
    setEditingId(stu.id);
    setStudentCode(stu.studentCode);
    setFullName(stu.fullName);
    setRawClass(stu.className);
    setNumberInClass(stu.numberInClass);
    setFormError(null);
  };

  const handleBulkImport = () => {
    const parsed = parseStudentCsv(csvText);
    if (parsed.length === 0) {
      setFormError('ไม่พบข้อมูลนักเรียนที่ถูกต้องในรูปแบบ CSV');
      return;
    }
    const created: Student[] = parsed.map((draft, idx) => ({
      ...draft,
      id: `stu_${Date.now()}_${idx}`,
      createdAt: new Date().toISOString(),
    }));
    onBulkImportStudents(created);
    setShowImport(false);
    setFormError(null);
  };

  return (
    <div className="space-y-6">
      {/* Add / Edit Student Card */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
              จัดการชั้นเรียนและรายชื่อนักเรียน (Student Roster)
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              รวมมาตรฐานชื่อห้องเรียนภาษาไทยอัตโนมัติ (เช่น ป 1/1 → ประถมศึกษาปีที่ 1/1) เพื่อเชื่อมรหัส OMR 4 หลัก
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowImport((prev) => !prev)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 whitespace-nowrap self-start"
          >
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            <span>นำเข้ารายชื่อ CSV</span>
          </button>
        </div>

        {showImport && (
          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3 dark:border-slate-700 dark:bg-slate-800/40">
            <label
              htmlFor="bulk-csv-textarea"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              วางข้อมูลรูปแบบ: รหัสนักเรียน,ชื่อ-สกุล,ห้องเรียน,เลขที่
            </label>
            <textarea
              id="bulk-csv-textarea"
              rows={4}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white p-3 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
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
                onClick={handleBulkImport}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              >
                นำเข้าและแปลงมาตรฐานห้องเรียน
              </button>
            </div>
          </div>
        )}

        <form
          onSubmit={handleSubmitStudent}
          className="mt-5 grid grid-cols-1 gap-4 border-t border-slate-100 pt-5 sm:grid-cols-12 sm:items-end dark:border-slate-800"
        >
          <div className="sm:col-span-2">
            <label
              htmlFor="student-code-input"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              รหัส OMR (4 หลัก)
            </label>
            <input
              id="student-code-input"
              type="text"
              maxLength={4}
              value={studentCode}
              onChange={(e) => setStudentCode(e.target.value.replace(/\D/g, ''))}
              placeholder="1015"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
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
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div className="sm:col-span-3">
            <label
              htmlFor="student-class-input"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              ห้องเรียน (พิมพ์ย่อได้ เช่น ป 1/1)
            </label>
            <input
              id="student-class-input"
              type="text"
              value={rawClass}
              onChange={(e) => setRawClass(e.target.value)}
              placeholder="ป 1/1 หรือ ม.1/1"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
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
              onChange={(e) =>
                setNumberInClass(Number.parseInt(e.target.value, 10) || 1)
              }
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div className="sm:col-span-2 flex gap-2">
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 whitespace-nowrap"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>{editingId ? 'บันทึกแก้ไข' : 'เพิ่มนักเรียน'}</span>
            </button>
          </div>
        </form>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-slate-500 dark:text-slate-400">
            ชื่อห้องหลังปรับมาตรฐาน:{' '}
            <strong className="font-medium text-slate-700 dark:text-slate-200">
              {normalizeThaiClassName(rawClass)}
            </strong>
          </span>
          {editingId && (
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setStudentCode('');
                setFullName('');
              }}
              className="text-blue-600 hover:underline dark:text-blue-400"
            >
              ยกเลิกการแก้ไข
            </button>
          )}
        </div>

        {formError && (
          <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">
            {formError}
          </p>
        )}
      </section>

      {/* Roster Filter & Table */}
      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-6 py-4 md:flex-row md:items-center md:justify-between dark:border-slate-800">
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

          <div className="relative w-full md:w-64">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label="ค้นหารหัสนักเรียนหรือชื่อ"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหารหัส หรือ ชื่อ-สกุล..."
              className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-9 pr-3 text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
                <th className="px-6 py-3">รหัส OMR</th>
                <th className="px-4 py-3">เลขที่</th>
                <th className="px-4 py-3">ชื่อ-นามสกุล</th>
                <th className="px-4 py-3">ห้องเรียน (มาตรฐาน)</th>
                <th className="px-6 py-3 text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredStudents.map((stu) => (
                <tr
                  key={stu.id}
                  className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                >
                  <td className="px-6 py-3 font-mono tabular-nums text-xs font-semibold text-blue-600 dark:text-blue-400">
                    {stu.studentCode}
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums text-xs text-slate-600 dark:text-slate-300">
                    {stu.numberInClass}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                    {stu.fullName}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                    {stu.className}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleStartEdit(stu)}
                        aria-label={`แก้ไขข้อมูล ${stu.fullName}`}
                        className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteStudent(stu.id)}
                        aria-label={`ลบข้อมูล ${stu.fullName}`}
                        className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
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
