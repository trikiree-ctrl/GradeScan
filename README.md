# GradeScan OMR Studio

ระบบตรวจข้อสอบปรนัย (OMR) ผ่านกล้องและการวิเคราะห์ข้อสอบรายข้อ (Item Analysis) ที่ทำงานแบบ Static Web Application 100% บนเบราว์เซอร์ (Client-side OMR & Analytics) รองรับทั้งการใช้งานบนเดสก์ท็อป แท็บเล็ต สมาร์ตโฟน และการเผยแพร่ผ่าน **GitHub Pages**

---

## สาเหตุที่หน้า GitHub Pages แสดงผลเป็นหน้าสีขาว (และวิธีแก้ไขที่ทำไว้แล้ว)

ก่อนหน้านี้เมื่อเปิด `https://<username>.github.io/<repo-name>/` แล้วพบ **หน้าสีขาวว่างเปล่า (มีเฉพาะชื่อแท็บ)** เกิดจาก 2 สาเหตุหลัก:
1. GitHub Pages ดึงไฟล์ `index.html` ที่ root ของโปรเจกต์ไปแสดงผลโดยตรง ซึ่งยังชี้ไปที่ `/src/main.tsx` (เบราว์เซอร์ไม่สามารถรัน `.tsx` โดยไม่ผ่าน Vite Build ได้)
2. Path ของ asset ที่ Vite สร้างใช้ `/assets/...` แทน `./assets/...` ทำให้เมื่ออยู่ภายใต้ subpath เช่น `/GradeScan/` เบราว์เซอร์จะเรียกไปที่ root domain แล้วเกิด 404

**สิ่งที่แก้ไขในโปรเจกต์นี้เรียบร้อยแล้ว:**
- ตั้งค่า `base: './'` ใน `vite.config.ts` เพื่อให้ asset path ทำงานได้ถูกต้องทุก subpath (เช่น `/GradeScan/`)
- เพิ่ม `public/.nojekyll` เพื่อป้องกัน GitHub Pages ตัดโฟลเดอร์หรือไฟล์ที่ขึ้นต้นด้วย `_`
- สร้างไฟล์ `.github/workflows/deploy.yml` สำหรับ Deploy อัตโนมัติด้วย **GitHub Actions**
- สร้างโฟลเดอร์ `docs/` (ผ่านคำสั่ง `npm run build:pages`) ที่คอมไพล์พร้อมใช้งานทันทีสำหรับผู้ที่เลือก **Deploy from a branch**

---

## วิธี Deploy ขึ้น GitHub Pages (เลือกได้ 2 วิธี)

หลังจาก Push โค้ดทั้งหมดขึ้น GitHub Repository (`main`) แล้ว ให้ไปที่ **Settings → Pages** บน GitHub:

### วิธีที่ 1 (แนะนำ): ใช้ GitHub Actions อัตโนมัติ
1. ในหน้า **Build and deployment → Source** เลือก **`GitHub Actions`**
2. กลับไปที่แท็บ **Actions** บน GitHub หากยังไม่ได้รันให้กด **Run workflow** (หรือทุกครั้งที่ Push ขึ้น `main` ระบบจะ Build `dist/` และอัปเดตหน้าเว็บให้อัตโนมัติ)

### วิธีที่ 2: Deploy จากโฟลเดอร์ `/docs` (ไม่ต้องตั้งค่า Actions)
1. ในหน้า **Build and deployment → Source** เลือก **`Deploy from a branch`**
2. ช่อง **Branch** เลือก **`main`** และช่องโฟลเดอร์เลือก **`/docs`** แล้วกด **Save**
3. รอประมาณ 1–2 นาที แล้วเปิด `https://<username>.github.io/GradeScan/` (หากมีการแก้ไขโค้ดในอนาคต ให้รัน `npm run build:pages` ก่อน Push)

---

## คำสั่งสำหรับพัฒนาบนเครื่อง (Local Development)

```bash
# ติดตั้งแพ็กเกจ
npm install

# รันเซิร์ฟเวอร์พัฒนา (http://localhost:3000)
npm run dev

# ตรวจสอบ TypeScript
npm run lint

# รัน Unit Tests สำหรับ OMR Engine
npx tsx --test src/utils/omr.test.ts

# คอมไพล์สำหรับ Production (dist/) และ GitHub Pages (/docs)
npm run build
npm run build:pages
```
