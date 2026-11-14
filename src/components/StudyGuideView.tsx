import {
  ArrowRight,
  BarChart3,
  Camera,
  CheckCircle2,
  Cloud,
  FileSpreadsheet,
  GraduationCap,
  Printer,
  ShieldAlert,
  Users,
  Zap,
} from 'lucide-react';
import type { AppView } from '../types/omr';

interface StudyGuideViewProps {
  onNavigate: (view: AppView) => void;
}

export function StudyGuideView({ onNavigate }: StudyGuideViewProps) {
  const keyFeatures = [
    {
      title: '1. ความเร็วในการตรวจระดับวินาที',
      desc: 'ใช้กล้องสมาร์ตโฟนหรือแท็บเล็ตตรวจจับมุมกระดาษทั้ง 4 มุม (Optical Mark Recognition) ได้ภายในเสี้ยววินาทีโดยไม่ต้องใช้เครื่องอ่าน OMR ราคาแพง',
      icon: Zap,
      actionLabel: 'ทดลองสแกน OMR',
      targetView: 'scanner' as AppView,
    },
    {
      title: '2. การแสดงผลทันที (Instant Feedback)',
      desc: 'แสดงคะแนนรวม ร้อยละ และวงกลมสีแยกข้อถูก-ผิด-เว้นว่างทับลงบนภาพกระดาษคำตอบทันทีหลังสแกน พร้อมแก้ไขรอยดินสอจางได้ด้วยตนเอง',
      icon: Camera,
      actionLabel: 'ดูหน้าผลตรวจ',
      targetView: 'scanner' as AppView,
    },
    {
      title: '3. กระดาษคำตอบมาตรฐานหลายรูปแบบ',
      desc: 'รองรับชุดข้อสอบ 20 ข้อ, 50 ข้อ และ 100 ข้อ พร้อมช่องฝนรหัสประจำตัวนักเรียน 4 หลัก ดาวน์โหลดไปพิมพ์ได้ทันที',
      icon: Printer,
      actionLabel: 'พิมพ์กระดาษคำตอบ',
      targetView: 'sheets' as AppView,
    },
    {
      title: '4. การซิงค์และจัดเก็บข้อมูลอย่างเป็นระบบ',
      desc: 'จัดเก็บฐานข้อมูลชุดข้อสอบ เฉลย รายชื่อนักเรียน และประวัติผลสแกนอย่างต่อเนื่อง พร้อมระบบตรวจสอบความสมบูรณ์ของข้อมูล (Sync Hash)',
      icon: Cloud,
      actionLabel: 'จัดการชั้นเรียน',
      targetView: 'classes' as AppView,
    },
    {
      title: '5. ส่งออกข้อมูล (CSV / Excel / PDF)',
      desc: 'ส่งออกคะแนนรายบุคคลและคำตอบรายข้อเป็นไฟล์ CSV (รองรับภาษาไทยใน Excel), ไฟล์ Excel และรายงานพิมพ์ PDF เพื่อนำเข้าระบบโรงเรียน',
      icon: FileSpreadsheet,
      actionLabel: 'เปิดหน้าส่งออกข้อมูล',
      targetView: 'analysis' as AppView,
    },
    {
      title: '6. การวิเคราะห์ข้อสอบ (Item Analysis)',
      desc: 'คำนวณค่าความยากง่าย (p), ค่าอำนาจจำแนก (D), ความเชื่อมั่น KR-20 และสัดส่วนการเลือกตัวลวง A–E เพื่อนำไปปรับปรุงข้อสอบ',
      icon: BarChart3,
      actionLabel: 'ดูผลวิเคราะห์ข้อสอบ',
      targetView: 'analysis' as AppView,
    },
  ];

  const steps = [
    {
      step: '01',
      title: 'เตรียมชั้นเรียนและรายชื่อนักเรียน',
      detail: 'เพิ่มรายชื่อนักเรียนพร้อมรหัส 4 หลัก หรือนำเข้าผ่านไฟล์ CSV ระบบจะรวมมาตรฐานชื่อห้องเรียนให้อัตโนมัติ',
      view: 'classes' as AppView,
    },
    {
      step: '02',
      title: 'สร้างชุดข้อสอบและกำหนดเฉลย',
      detail: 'เลือกจำนวนข้อ (20 / 50 / 100 ข้อ) จำนวนตัวเลือก (4 หรือ 5 ตัวเลือก) และกำหนดเฉลยแต่ละข้อ',
      view: 'quizzes' as AppView,
    },
    {
      step: '03',
      title: 'พิมพ์กระดาษคำตอบ (Answer Sheets)',
      detail: 'ดาวน์โหลดหรือสั่งพิมพ์กระดาษขาวหนาปานกลาง โดยรักษาจุดสี่เหลี่ยมสีดำทั้ง 4 มุมให้คมชัด',
      view: 'sheets' as AppView,
    },
    {
      step: '04',
      title: 'สแกนตรวจกระดาษคำตอบ',
      detail: 'เปิดกล้องสแกนเล็งให้เห็นครบ 4 มุม หรืออัปโหลดภาพถ่าย ระบบจะอ่านรหัสและตรวจให้คะแนนทันที',
      view: 'scanner' as AppView,
    },
    {
      step: '05',
      title: 'ตรวจสอบและวิเคราะห์ผลสัมฤทธิ์',
      detail: 'ดูคะแนนรายบุคคล ค่าความยากง่าย อำนาจจำแนก และส่งออกคะแนนเข้าสู่ระบบงานวัดผล',
      view: 'analysis' as AppView,
    },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="max-w-3xl space-y-2">
          <div className="text-xs font-medium text-blue-600 dark:text-blue-400">
            คู่มือศึกษาและสถาปัตยกรรมระบบตรวจข้อสอบ OMR
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            การศึกษาแอปพลิเคชัน ZipGrade อย่างละเอียด
          </h1>
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            ZipGrade เป็นเครื่องมือดิจิทัลที่เปลี่ยนสมาร์ตโฟน แท็บเล็ต และเว็บเบราว์เซอร์ให้กลายเป็นเครื่องตรวจกระดาษคำตอบปรนัยอัตโนมัติ (OMR — Optical Mark Recognition) เพื่อช่วยครูผู้สอนลดภาระการตรวจข้อสอบจำนวนมากได้อย่างรวดเร็วและแม่นยำ
          </p>
        </div>
      </section>

      {/* Section 1: Key Features */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">
          1. คุณสมบัติหลักและความสามารถ (Key Features)
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {keyFeatures.map((feat) => {
            const Icon = feat.icon;
            return (
              <div
                key={feat.title}
                className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
              >
                <div>
                  <Icon className="h-5 w-5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                  <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">
                    {feat.title}
                  </h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                    {feat.desc}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate(feat.targetView)}
                  className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400 self-start"
                >
                  <span>{feat.actionLabel}</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Section 2: Getting Started Workflow */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">
          2. วิธีการใช้งานเบื้องต้น 5 ขั้นตอน (Getting Started)
        </h2>
        <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
          {steps.map((s) => (
            <div
              key={s.step}
              className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-4">
                <span className="font-mono tabular-nums text-sm font-bold text-blue-600 dark:text-blue-400">
                  {s.step}.
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {s.title}
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                    {s.detail}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigate(s.view)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap self-start sm:self-center"
              >
                <span>เปิดเครื่องมือ</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Section 3: Pros & Cons */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
            <h2 className="text-base font-semibold">3.1 ข้อดี (Pros)</h2>
          </div>
          <ul className="mt-4 space-y-3 text-sm text-slate-700 dark:text-slate-300">
            <li>
              <strong className="text-slate-900 dark:text-white">ประหยัดงบประมาณ:</strong>{' '}
              ต้นทุนต่ำกว่าเครื่องตรวจกระดาษคำตอบ OMR แบบดั้งเดิมมาก และใช้กระดาษ A4 พิมพ์ทั่วไปได้
            </li>
            <li>
              <strong className="text-slate-900 dark:text-white">ใช้งานง่าย เรียนรู้ไว:</strong>{' '}
              ขั้นตอนชัดเจนตั้งแต่สร้างเฉลย สแกน ดูคะแนน และส่งออกข้อมูล
            </li>
            <li>
              <strong className="text-slate-900 dark:text-white">พกพาสะดวก ตรวจได้ทุกที่:</strong>{' '}
              ตรวจข้อสอบในห้องเรียนหรือนอกสถานที่ได้ทันทีโดยไม่ต้องพึ่งพาเครื่องสแกนขนาดใหญ่
            </li>
          </ul>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <ShieldAlert className="h-5 w-5" aria-hidden="true" />
            <h2 className="text-base font-semibold">3.2 ข้อจำกัดและข้อควรระวัง (Cons)</h2>
          </div>
          <ul className="mt-4 space-y-3 text-sm text-slate-700 dark:text-slate-300">
            <li>
              <strong className="text-slate-900 dark:text-white">ข้อจำกัดโควตาในรุ่นฟรีของแอปต้นฉบับ:</strong>{' '}
              รุ่นฟรีมักจำกัดจำนวนการสแกนต่อเดือน (ในระบบจำลอง GradeScan นี้ใช้งานสแกนและวิเคราะห์ได้ไม่จำกัด)
            </li>
            <li>
              <strong className="text-slate-900 dark:text-white">ความคมชัดและสภาพกระดาษ:</strong>{' '}
              หากกระดาษยับ รอยฝนดินสอจางเกินไป หรือบังจุดสี่เหลี่ยม 4 มุม อาจทำให้อ่านพลาด (แก้ไขได้ในหน้าตรวจทานรายข้อ)
            </li>
            <li>
              <strong className="text-slate-900 dark:text-white">รองรับเฉพาะข้อสอบปรนัย:</strong>{' '}
              ออกแบบมาสำหรับคำตอบแบบเลือกตอบ (Multiple Choice) ไม่สามารถตรวจข้อเขียนอัตนัยอัตโนมัติได้
            </li>
          </ul>
        </div>
      </section>

      {/* Section 4: Target Audience */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">
          4. เหมาะกับใคร? (Target Audience)
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex items-start gap-3 rounded-lg border border-slate-100 p-4 dark:border-slate-800">
            <GraduationCap className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                ครูและอาจารย์ทุกระดับชั้น
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                ครูระดับประถมศึกษา มัธยมศึกษา และอาจารย์มหาวิทยาลัยที่ต้องตรวจข้อสอบปรนัยและวิเคราะห์คุณภาพข้อสอบจำนวนมาก
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg border border-slate-100 p-4 dark:border-slate-800">
            <Users className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                ผู้จัดอบรมและวิทยากร
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                วิทยากรหรือฝ่ายพัฒนาบุคลากรที่ต้องการประเมินผล Pre-Test / Post-Test ของผู้เข้าร่วมอบรมอย่างรวดเร็ว
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 5: Researched ZipGrade & Computer Vision Best Practices */}
      <section className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-6 dark:border-indigo-900/50 dark:bg-indigo-950/20">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              5. เทคนิคการตรวจจับ 4 มุม วัดองศา และสแกนให้แม่นยำตามมาตรฐาน ZipGrade
            </h2>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
              หลักการทำงานของระบบ Projective Homography และแนวทางปฏิบัติที่ช่วยลดการอ่านพลาด
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('scanner')}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-indigo-700 whitespace-nowrap self-start"
          >
            <span>ทดสอบกล้องวัดมุมอัตโนมัติ</span>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-lg bg-white p-4 border border-slate-200/80 dark:bg-slate-900 dark:border-slate-800">
            <h3 className="text-xs font-semibold text-indigo-700 dark:text-indigo-400">
              การวัดมุมและปรับระนาบภาพอัตโนมัติ (4-Corner Homography)
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              ระบบตรวจหาจุดสี่เหลี่ยมสีดำทึบทั้ง 4 มุม (Fiducial Markers) คำนวณมุมเอียงเป็นองศาและความบิดเบี้ยวมุมมองแบบเรียลไทม์ เมื่อถือกล้องนิ่งครบ 2 เฟรม จะจับภาพและปรับระนาบกระดาษที่เอียงให้ตั้งตรงอัตโนมัติก่อนอ่านวงกลม
            </p>
          </div>
          <div className="rounded-lg bg-white p-4 border border-slate-200/80 dark:bg-slate-900 dark:border-slate-800">
            <h3 className="text-xs font-semibold text-indigo-700 dark:text-indigo-400">
              การจัดแสงและพื้นหลังขณะสแกน
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              ใช้แสงสว่างสม่ำเสมอหลีกเลี่ยงแสงสะท้อนจ้าหรือเงาแขนพาดทับกระดาษ และวางกระดาษคำตอบสีขาวบนพื้นโต๊ะสีเข้มเพื่อช่วยให้กล้องแยกขอบและจุดมุมทั้ง 4 ได้รวดเร็วยิ่งขึ้น
            </p>
          </div>
          <div className="rounded-lg bg-white p-4 border border-slate-200/80 dark:bg-slate-900 dark:border-slate-800">
            <h3 className="text-xs font-semibold text-indigo-700 dark:text-indigo-400">
              การพิมพ์กระดาษคำตอบสเกล 100% (Actual Size)
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              ห้ามเลือก Fit to Page เมื่อสั่งพิมพ์ PDF เพราะอาจทำให้อัตราส่วนระยะห่างจุดมุมทั้ง 4 ผิดเพี้ยน ควรใช้กระดาษขาวด้าน 80 แกรมขึ้นไปเพื่อไม่ให้หมึกด้านหลังทะลุ
            </p>
          </div>
          <div className="rounded-lg bg-white p-4 border border-slate-200/80 dark:bg-slate-900 dark:border-slate-800">
            <h3 className="text-xs font-semibold text-indigo-700 dark:text-indigo-400">
              การลบแก้ไขและระบุตัวตนกรณีรหัสจาง
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              แนะนำให้นักเรียนฝนให้เต็มวงด้วยดินสอ 2B หรือปากกาดำและลบให้สะอาดหากเปลี่ยนคำตอบ หากพบรอยจางหรือฝนซ้ำ ครูสามารถแตะแก้ไขคำตอบรายข้อหรือเปลี่ยนชื่อนักเรียนเจ้าของกระดาษได้ทันทีในหน้าตรวจทาน
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
