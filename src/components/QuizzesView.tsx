import { useState } from 'react';
import { Check, Plus, Shuffle, Trash2 } from 'lucide-react';
import type { ChoiceOption, QuestionCount, Quiz } from '../types/omr';
import { normalizeThaiClassName } from '../utils/normalization';
import { getActiveChoices } from '../utils/omrAnalytics';

interface QuizzesViewProps {
  quizzes: Quiz[];
  activeQuizId: string;
  onSelectQuiz: (quizId: string) => void;
  onCreateQuiz: (quiz: Quiz) => void;
  onUpdateAnswerKey: (
    quizId: string,
    questionNumber: number,
    choice: ChoiceOption
  ) => void;
  onBulkUpdateAnswerKey: (
    quizId: string,
    answerKey: Record<number, ChoiceOption>
  ) => void;
  onDeleteQuiz: (quizId: string) => void;
}

export function QuizzesView({
  quizzes,
  activeQuizId,
  onSelectQuiz,
  onCreateQuiz,
  onUpdateAnswerKey,
  onBulkUpdateAnswerKey,
  onDeleteQuiz,
}: QuizzesViewProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [className, setClassName] = useState('ม.1/1');
  const [questionCount, setQuestionCount] = useState<QuestionCount>(20);
  const [choiceCount, setChoiceCount] = useState<4 | 5>(4);
  const [pointsPerQuestion, setPointsPerQuestion] = useState(1);
  const [wrongPenalty, setWrongPenalty] = useState(0);
  const [passThresholdPct, setPassThresholdPct] = useState(50);
  const [formError, setFormError] = useState<string | null>(null);

  const activeQuiz = quizzes.find((q) => q.id === activeQuizId) ?? quizzes[0];
  const choices = getActiveChoices(activeQuiz.choiceCount);

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    const cleanSubject = subject.trim();
    if (!cleanTitle || !cleanSubject) {
      setFormError('กรุณาระบุชื่อชุดข้อสอบและรายวิชาให้ครบถ้วน');
      return;
    }

    const answerKey: Record<number, ChoiceOption> = {};
    const avail = getActiveChoices(choiceCount);
    for (let i = 1; i <= questionCount; i++) {
      answerKey[i] = avail[(i - 1) % avail.length];
    }

    const now = new Date().toISOString();
    const newQuiz: Quiz = {
      id: `quiz_${Date.now()}`,
      title: cleanTitle,
      subject: cleanSubject,
      className: normalizeThaiClassName(className),
      questionCount,
      choiceCount,
      pointsPerQuestion: Math.max(1, pointsPerQuestion),
      wrongPenalty: Math.max(0, wrongPenalty),
      passThresholdPct: Math.min(100, Math.max(10, passThresholdPct)),
      answerKey,
      createdAt: now,
      updatedAt: now,
    };

    onCreateQuiz(newQuiz);
    setTitle('');
    setSubject('');
    setFormError(null);
    setShowCreate(false);
  };

  const handleRandomizeKey = () => {
    const updated: Record<number, ChoiceOption> = {};
    for (let q = 1; q <= activeQuiz.questionCount; q++) {
      updated[q] = choices[Math.floor(Math.random() * choices.length)];
    }
    onBulkUpdateAnswerKey(activeQuiz.id, updated);
  };

  const handleFillUniformKey = (opt: ChoiceOption) => {
    const updated: Record<number, ChoiceOption> = {};
    for (let q = 1; q <= activeQuiz.questionCount; q++) {
      updated[q] = opt;
    }
    onBulkUpdateAnswerKey(activeQuiz.id, updated);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
              จัดการชุดข้อสอบและกำหนดเฉลย (Answer Key)
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              รองรับชุดข้อสอบแบบ 20 ข้อ, 50 ข้อ และ 100 ข้อ พร้อมกำหนดน้ำหนักคะแนนและตัวเลือก 4–5 ช่อง
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate((prev) => !prev)}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 whitespace-nowrap self-start"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>สร้างชุดข้อสอบใหม่</span>
          </button>
        </div>

        {showCreate && (
          <form
            onSubmit={handleCreateSubmit}
            className="mt-6 grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-5 sm:grid-cols-2 lg:grid-cols-3 dark:border-slate-700 dark:bg-slate-800/40"
          >
            <div>
              <label
                htmlFor="quiz-title-input"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                ชื่อชุดข้อสอบ
              </label>
              <input
                id="quiz-title-input"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="เช่น สอบย่อยครั้งที่ 2 บทที่ 3"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label
                htmlFor="quiz-subject-input"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                รายวิชา
              </label>
              <input
                id="quiz-subject-input"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="เช่น ภาษาไทย / คณิตศาสตร์"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label
                htmlFor="quiz-class-input"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                ระดับชั้น / ห้อง (แปลงมาตรฐานอัตโนมัติ)
              </label>
              <input
                id="quiz-class-input"
                type="text"
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                placeholder="เช่น ป 6/1 หรือ ม.1/2"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
              <span className="mt-1 block text-[11px] text-slate-500 dark:text-slate-400">
                มาตรฐาน: {normalizeThaiClassName(className)}
              </span>
            </div>

            <div>
              <label
                htmlFor="quiz-count-select"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                รูปแบบกระดาษคำตอบ
              </label>
              <select
                id="quiz-count-select"
                value={questionCount}
                onChange={(e) =>
                  setQuestionCount(Number(e.target.value) as QuestionCount)
                }
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              >
                <option value={20}>20 ข้อ (สแกนเร็ว 2 คอลัมน์)</option>
                <option value={50}>50 ข้อ (มาตรฐาน 2 คอลัมน์)</option>
                <option value={100}>100 ข้อ (สอบใหญ่ 4 คอลัมน์)</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="quiz-choices-select"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                จำนวนตัวเลือกต่อข้อ
              </label>
              <select
                id="quiz-choices-select"
                value={choiceCount}
                onChange={(e) => setChoiceCount(Number(e.target.value) as 4 | 5)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              >
                <option value={4}>4 ตัวเลือก (A - D)</option>
                <option value={5}>5 ตัวเลือก (A - E)</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="quiz-points-input"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                คะแนนต่อข้อ
              </label>
              <input
                id="quiz-points-input"
                type="number"
                min={1}
                max={10}
                value={pointsPerQuestion}
                onChange={(e) =>
                  setPointsPerQuestion(Number.parseInt(e.target.value, 10) || 1)
                }
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label
                htmlFor="quiz-pass-input"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                เกณฑ์ผ่าน (%)
              </label>
              <input
                id="quiz-pass-input"
                type="number"
                min={10}
                max={100}
                step={5}
                value={passThresholdPct}
                onChange={(e) =>
                  setPassThresholdPct(Number.parseInt(e.target.value, 10) || 50)
                }
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label
                htmlFor="quiz-penalty-input"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                หักคะแนนเมื่อตอบผิด (0 = ไม่หัก)
              </label>
              <input
                id="quiz-penalty-input"
                type="number"
                min={0}
                max={5}
                step={0.25}
                value={wrongPenalty}
                onChange={(e) =>
                  setWrongPenalty(Number.parseFloat(e.target.value) || 0)
                }
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>

            {formError && (
              <p className="sm:col-span-2 lg:col-span-3 text-xs font-medium text-red-600 dark:text-red-400">
                {formError}
              </p>
            )}

            <div className="sm:col-span-2 lg:col-span-3 flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowCreate(false);
                  setFormError(null);
                }}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700"
              >
                บันทึกชุดข้อสอบ
              </button>
            </div>
          </form>
        )}

        {/* Quiz Selector List */}
        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {quizzes.map((quiz) => {
            const isSelected = quiz.id === activeQuiz.id;
            return (
              <div
                key={quiz.id}
                className={`flex items-start justify-between rounded-xl border p-4 transition-colors ${
                  isSelected
                    ? 'border-blue-600 bg-blue-50/50 dark:border-blue-500 dark:bg-blue-950/30'
                    : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectQuiz(quiz.id)}
                  className="flex-1 text-left"
                >
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span>{quiz.subject}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{quiz.questionCount} ข้อ</span>
                    <span aria-hidden="true">·</span>
                    <span>{quiz.className}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
                    {isSelected && (
                      <Check className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                    )}
                    <span className="line-clamp-1">{quiz.title}</span>
                  </div>
                  <div className="mt-1 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    คะแนนเต็ม {quiz.questionCount * quiz.pointsPerQuestion} ({quiz.pointsPerQuestion} คะแนน/ข้อ · ผ่าน {quiz.passThresholdPct ?? 50}%{(quiz.wrongPenalty ?? 0) > 0 ? ` · หักผิด -${quiz.wrongPenalty}` : ''})
                  </div>
                </button>

                {quizzes.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onDeleteQuiz(quiz.id)}
                    aria-label={`ลบชุดข้อสอบ ${quiz.title}`}
                    className="ml-2 rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Interactive Answer Key Grid */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              เฉลยคำตอบ (Answer Key) — {activeQuiz.title}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              คลิกที่ตัวเลือกแต่ละข้อเพื่อกำหนดเฉลยทันที (บันทึกอัตโนมัติ)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleRandomizeKey}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <Shuffle className="h-3.5 w-3.5" aria-hidden="true" />
              <span>สุ่มเฉลยตัวอย่าง</span>
            </button>
            <button
              type="button"
              onClick={() => handleFillUniformKey('A')}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              ตั้งทั้งหมดเป็น A
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: activeQuiz.questionCount }, (_, i) => i + 1).map(
            (qNum) => {
              const currentKey = activeQuiz.answerKey[qNum] ?? 'A';
              return (
                <div
                  key={qNum}
                  className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-800"
                >
                  <span className="font-mono tabular-nums text-xs font-semibold text-slate-600 dark:text-slate-300">
                    ข้อ {String(qNum).padStart(2, '0')}
                  </span>
                  <div className="flex items-center gap-1">
                    {choices.map((opt) => {
                      const active = currentKey === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() =>
                            onUpdateAnswerKey(activeQuiz.id, qNum, opt)
                          }
                          aria-label={`เฉลยข้อ ${qNum} คือ ${opt}`}
                          aria-pressed={active}
                          className={`h-10 w-10 sm:h-8 sm:w-8 rounded-lg font-mono text-xs font-semibold transition-colors ${
                            active
                              ? 'bg-indigo-600 text-white shadow-sm'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                          }`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            }
          )}
        </div>
      </section>
    </div>
  );
}
