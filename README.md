# Tech Department Manager

เว็บแอปแบบไม่พึ่งพาไลบรารีภายนอก (zero-dependency) สำหรับบริหารแผนก Tech (งาน / สมาชิก / โปรเจกต์) พร้อม **แอปมือถือสำหรับแจ้งปัญหา** ที่ส่งรายงานไปยัง GitHub เพื่อให้ทีม AI รับเรื่องไปทำงานต่อโดยอัตโนมัติ

## วิธีรัน

```bash
npm start            # http://localhost:3000
npm test             # รันเทสต์ทั้งหมด (Node 22+)
```

- เว็บแอปหลัก: `/`
- หน้า Landing: `/simple.html`
- แอปมือถือสำหรับแจ้งปัญหา (PWA): `/app/`

## แอปมือถือ → GitHub issue

ตั้งค่าตัวแปรเหล่านี้ตอนเริ่มเซิร์ฟเวอร์ (โทเคนอยู่บนเซิร์ฟเวอร์เท่านั้น ไม่ถูกส่งไปที่โทรศัพท์):

```bash
GITHUB_TOKEN=<fine-grained token: Issues read/write for this repo only> GITHUB_REPO=sirasit-b/myweb npm start
```

- เปิด `/app/` บนโทรศัพท์ แล้วเลือก *Add to Home Screen* เพื่อติดตั้งเป็นแอป (ต้องให้บริการผ่าน HTTPS จึงจะติดตั้งและใช้งานออฟไลน์ได้)
- แท็บ "แจ้งเรื่อง" จะสร้าง issue พร้อม label `source:mobile-app`
- แท็บ "เรื่องของฉัน" แสดงสถานะจริงจาก GitHub: รับเรื่อง → คัดแยก → วางแผน → กำลังพัฒนา → รอรีวิว → ปล่อยแล้ว

- `PORT`: พอร์ต (ค่าเริ่มต้น 3000)
- `DATA_FILE`: ไฟล์ข้อมูล (ค่าเริ่มต้น `data/db.json`)
- `GITHUB_TOKEN`: โทเคนที่ใช้สร้าง issue
- `GITHUB_REPO`: `owner/repo` ที่จะเปิด issue
- `GITHUB_API`: ใช้ในเทสต์เพื่อชี้ไปที่ GitHub จำลอง

## AI-native SDLC

ทุก issue ผ่านเอเจนต์อัตโนมัติ: triage → วางแผน → พัฒนา (TDD) → รีวิวโค้ด / ความปลอดภัย / QA → เอกสาร → merge → release
รายละเอียดและวิธีตั้งค่าอยู่ใน [docs/AI-SDLC.md](docs/AI-SDLC.md)
