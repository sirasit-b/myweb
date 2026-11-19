# Tech Department Manager

เว็บบริหารจัดการแผนก Tech (งาน / สมาชิก / โปรเจกต์) แบบ zero dependency และมี **แอปมือถือสำหรับแจ้งปัญหา** ที่ส่งเรื่องเข้า GitHub ให้ทีม AI ลงมือทำต่ออัตโนมัติ

## รัน

```bash
npm start            # http://localhost:3000
npm test             # เทสต์ทั้งหมด (Node 22+)
```

| หน้า | URL |
|---|---|
| เว็บหลัก | `/` |
| Landing | `/simple.html` |
| แอปมือถือแจ้งปัญหา (PWA) | `/app/` |

## แอปมือถือ → GitHub issue

ตั้งค่าตัวแปรตอนรันเซิร์ฟเวอร์ (token อยู่ฝั่งเซิร์ฟเวอร์เท่านั้น ไม่ถูกส่งไปมือถือ):

```bash
GITHUB_TOKEN=<fine-grained token: Issues read/write เฉพาะ repo นี้> GITHUB_REPO=sirasit-b/myweb npm start
```

- เปิด `/app/` บนมือถือ แล้วเลือก *Add to Home Screen* เพื่อติดตั้งเป็นแอป (ต้องเสิร์ฟผ่าน HTTPS ถึงจะติดตั้งและใช้ออฟไลน์ได้)
- แท็บ “แจ้งเรื่อง” สร้าง issue พร้อม label `source:mobile-app`
- แท็บ “เรื่องของฉัน” แสดงสถานะจริงจาก GitHub: รับเรื่อง → คัดแยก → วางแผน → พัฒนา → รีวิว → ปล่อยเวอร์ชัน

| ตัวแปร | ความหมาย |
|---|---|
| `PORT` | พอร์ต (ค่าเริ่มต้น 3000) |
| `DATA_FILE` | ไฟล์ข้อมูล (ค่าเริ่มต้น `data/db.json`) |
| `GITHUB_TOKEN` | token สำหรับสร้าง issue |
| `GITHUB_REPO` | `owner/repo` ที่จะเปิด issue |
| `GITHUB_API` | ใช้ในเทสต์เพื่อชี้ไปที่ GitHub จำลอง |

## AI-native SDLC

ทุก issue ผ่าน agent อัตโนมัติ: triage → plan → พัฒนา (TDD) → review โค้ด/ความปลอดภัย/QA → เอกสาร → merge → release
รายละเอียดและวิธีตั้งค่าอยู่ใน [docs/AI-SDLC.md](docs/AI-SDLC.md)
