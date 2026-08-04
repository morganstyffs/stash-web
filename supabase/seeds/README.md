# ชุดข้อมูลทดสอบที่รู้คำตอบล่วงหน้า (Test Data Seeds)

โฟลเดอร์นี้สร้างข้อมูลการเงิน **4 เดือน** ที่ทุกค่าเขียนตายตัว (ไม่สุ่ม) เพื่อให้ทุกใบ
ปรับแต่งผู้ช่วย AI (AI-B … AI-L) มี **ฐานเทียบเดียวกัน** — เวลา AI ตอบตัวเลขมา จะรู้
ได้ทันทีว่าถูกหรือผิด

> 🔴 **ไม่ใช่ migration** — ไฟล์ในโฟลเดอร์นี้ **ห้าม**ย้ายไป `supabase/migrations/`
> และ **ห้าม** `insert` แถวลง `schema_migrations` (จะทำให้เลข migration เพี้ยน)
> เป็นสคริปต์ที่เจ้าของ **รันมือ** ใน Supabase SQL Editor เท่านั้น

## ไฟล์

| ไฟล์ | หน้าที่ | รันในฐานะ |
|---|---|---|
| `reset_test_data.sql` | ล้างข้อมูลที่ผู้ใช้สร้างของ 2 บัญชี (ไม่แตะโครงบัญชี) | **owner** (ต้อง bypass RLS เพื่อลบ debts/stock_sales ที่ไม่มี delete policy) |
| `seed_test_data.sql` | เติมข้อมูล 4 เดือน ครอบ 12 เคส | **impersonate** (RPC เป็น INVOKER — ต้องมี `auth.uid()`) |
| `verify_test_data.sql` | query ค่าจริงผ่าน RPC เทียบค่าคาดหวัง → PROVEN/FAILED | **impersonate** |
| `../../docs/testing/expected-answers.md` | ตาราง "ถามข้อนี้ → ต้องได้เลขนี้" สำหรับทดสอบ AI ด้วยมือ | — |

## ลำดับการรัน

1. **PRE-FLIGHT** — หา uid 2 บัญชี (ตัวเอง + เพื่อนสำหรับหนี้ shared):
   ```sql
   select id, email from auth.users order by created_at;
   ```
   เอา uid ไป **กรอกเองบนหัวไฟล์** `v_me` / `v_friend` ของทั้ง 3 ไฟล์ SQL
   > ⚠️ DB มีหลายบัญชี — **ห้าม**ให้สคริปต์เดา (`limit 1`) เดี๋ยวล้าง/เขียนผิดบัญชี

2. **`reset_test_data.sql`** — รอบแรกจบด้วย `rollback;` เพื่อดูว่าจะลบอะไร
   (แถว "remaining" ควรเป็น 0) → พอใจแล้วเปลี่ยนบรรทัดท้ายเป็น `commit;` รันซ้ำ

3. **`seed_test_data.sql`** — เช่นเดียวกัน: `rollback;` ดูว่าไม่มี error ก่อน แล้ว
   `commit;` · **ต้องรันในวันที่ ≥ 5 ของเดือน** (สคริปต์ raise ถ้าไม่ใช่ — เพราะ
   เดือนปัจจุบันต้องวางรายการวันที่ 1–4 ได้โดยไม่มีรายการวันอนาคต)

4. **`verify_test_data.sql`** — รันได้เลย (ครอบ `rollback;` ไม่แก้ข้อมูล) → อ่าน
   ผลตาราง ต้องได้ **`PROVEN 28/28`** · ถ้ามี FAILED แปลว่า seed ไม่ครบ/ผิด →
   reset + seed ใหม่ก่อน แล้วค่อยเชื่อ expected-answers
   > 28 = 19 ยอดรวม/คงเหลือ/หนี้ + 8 จ่ายแยกหมวด (เดือน -1/-2 ผ่าน `p_category_id`
   > จริง) + 1 "ไม่มี `category_id` null" · assert รายหมวด + null-check เพิ่มในใบ 1b
   > เพื่อจับกรณี seed lookup หมวดไม่เจอแล้ว insert ด้วยหมวดว่างเงียบ ๆ
   > รัน verify **ในเดือนเดียวกับที่ seed** (ยอดที่แบ่งตามเดือน −1/−2/−3 จะเลื่อน
   > ถ้าข้ามเดือน · คงเหลือกระเป๋าไม่สนใจเดือน)

5. ทดสอบ AI ด้วยมือตาม `docs/testing/expected-answers.md`

## ทำไมต้อง `begin; … rollback;` ทุกไฟล์

ทั้ง 3 ไฟล์ทำงานกับข้อมูลจริงของผู้ใช้จริง · การครอบทรานแซกชันให้รัน `rollback;`
ได้ก่อน = ดูผล/จับ error โดยยังไม่เขียนถาวร → พอใจแล้วค่อย `commit;` (verify จบด้วย
`rollback;` เสมอ เพราะไม่ควรแก้อะไรอยู่แล้ว)

## ⚠️ ตารางที่ห้ามลบเด็ดขาด (reset จึงแค่ "รีเซ็ตค่า")

`auth.users` · `profiles` · `wallets` · `categories` · `stock_sku_config` — สร้าง
ครั้งเดียวตอนสมัคร (trigger / seed) และ **ไม่มี insert policy** ลบแล้วกู้ไม่ได้ ·
reset จึง **update** `opening_balance = <ค่า>` / `next_seq = 0` แทนการลบ และหมวด
ระบบมี `system_category_no_delete` กันไว้อีกชั้น

## สิ่งที่ยังพิสูจน์ด้วย verify ไม่ได้ (ต้องเจ้าของลองเอง)

- คำตอบ AI "เป็นบทสนทนา/ถูกบริบทจริงไหม" — output โมเดลไม่ deterministic
- ค่า **กลุ่ม ข** (`days_left` · `daily_allowance` · `oldest_in_stock_days`) ขึ้น
  กับวันที่รัน → เขียนเป็น **สูตร** ใน expected-answers.md ไม่ hardcode
- ก่อนไล่บั๊กหน้าจอ อ่าน version stamp ท้ายหน้าตั้งค่าก่อน (service worker อาจ cache
  บันเดิลเก่า)
