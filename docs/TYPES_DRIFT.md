# Types drift check (`database.types.ts`)

เจ้าของไม่มีเครื่อง dev → `src/lib/database.types.ts` ถูก **regenerate จาก Supabase
dashboard แล้ว paste มือ** ทุกครั้งหลังมี migration ผลคือ DB กับ repo หลุดจากกันได้
โดยไม่มีใครรู้ — ซึ่งเกิดจริงกับ `0015` (schema apply ลง DB แต่ migration + types ไม่เคย
เข้า main และไม่มีอะไรส่งสัญญาณ)

`.github/workflows/types-drift.yml` ปิดช่องนี้: ทุกคืน (และสั่งเองได้) มัน regenerate
types จาก DB จริง แล้วเทียบกับไฟล์ที่ commit ไว้

- **ต่างกัน** → เปิด PR พร้อมไฟล์ใหม่ (ไม่ push เข้า main ตรง ๆ — main มี branch
  protection, ดู `BRANCH_PROTECTION.md` — และ PR "types เปลี่ยน" คือสัญญาณที่ต้องการ)
- **เหมือนกัน** → ไม่ทำอะไร ไม่ส่งเสียง

## ทำไมมันไม่ส่งเสียงทุกคืนทั้งที่ไม่มี drift จริง

types มาจาก `supabase gen types typescript --project-id` ซึ่งเป็น client บาง ๆ ที่เรียก
**Supabase Management API** — คือ generator ตัวเดียวกับที่ dashboard ใช้ ดังนั้น header,
ลำดับ, การจัดรูปแบบจึงตรงกับไฟล์ที่ paste มือ ไม่ต่างกันเพราะ cosmetic

## secret ที่ต้องตั้ง

ตั้งที่ **Settings → Secrets and variables → Actions → New repository secret**:

| secret | จำเป็น | เอามาจากไหน |
| --- | --- | --- |
| `SUPABASE_ACCESS_TOKEN` | ✅ | supabase.com → Account → **Access Tokens** → Generate new token |
| `SUPABASE_PROJECT_ID` | ✅ | Supabase → Project Settings → General → **Reference ID** (เช่น `abcdefghijklmno`) |
| `GH_PAT` | ทางเลือก | GitHub token (repo scope) — ถ้าตั้ง PR จะ trigger CI (`build`) เองจน merge ได้ตาม branch protection |

> ทำไมต้องมี `GH_PAT`? PR ที่เปิดด้วย `GITHUB_TOKEN` มาตรฐาน **จะไม่ trigger** `ci.yml`
> (กัน workflow วน) → status check `build` ไม่รัน → merge ไม่ได้ตาม branch protection
> ถ้าตั้ง `GH_PAT` ไว้ PR จะถูกเปิดด้วย token นั้นแทน CI จึงรันเอง ถ้าไม่ตั้ง PR ยังเปิด
> (ได้สัญญาณ) แต่ต้องไป re-run CI เองก่อน merge

## วิธีเดินเครื่องครั้งแรก

1. ตั้ง secret ข้างบนให้ครบ
2. ไปที่ **Actions → Types drift check → Run workflow** (`workflow_dispatch`)
3. ดูผล:
   - **ไม่มี PR เปิด** = types ตรงกับ DB แล้ว (นี่คือผลที่คาดไว้ตอนนี้ เพราะ types เพิ่ง
     regenerate หลัง `0016`) ✅
   - **มี PR เปิด** = มี drift → เปิดดู diff

## ถ้า diff ไม่ว่างตั้งแต่ครั้งแรก

diff จะบอกเองว่าเป็นอะไร:

- **schema เปลี่ยนจริง** (มี/หาย table, column, enum, type) → มี migration ที่ยังไม่เข้า
  repo commit migration นั้นใต้ `supabase/migrations/` แล้ว merge PR
- **cosmetic ล้วน** (เช่น ordering เพี้ยนเล็กน้อย) → แปลว่าไฟล์ที่ paste มือถูกแก้ด้วยมือ
  หลัง generate merge PR ครั้งเดียวเพื่อให้ output ของ Management API เป็น baseline
  จากนั้นจะเงียบจนกว่าจะมี drift จริงครั้งถัดไป

## หมายเหตุ

- workflow นี้ **ไม่แตะ `ci.yml`** และ **ไม่มี deploy step**
- **ทดสอบใน sandbox ไม่ได้** เพราะต่อ Supabase ไม่ได้ (egress policy) จึงออกแบบให้เจ้าของ
  รัน `workflow_dispatch` ครั้งเดียวแล้วดูผลได้เอง
