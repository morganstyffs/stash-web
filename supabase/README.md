# Supabase — schema & migrations

โปรเจกต์ Supabase: **Stash** (region: Singapore) · Data API เปิด · **automatic RLS เปิด**

> ⚠️ **automatic RLS** เปิด RLS ให้ตารางใหม่อัตโนมัติ **แต่ไม่สร้าง policy ให้** —
> ทุกตารางในนี้จึงเขียน policy `auth.uid() = user_id` เอง (select/insert/update/delete)
> ครบทุกตาราง ไม่งั้นจะเข้าข้อมูลไม่ได้

## วิธีรัน (ทำเองใน Supabase SQL Editor)

รันไฟล์ **ตามลำดับ** ใน Dashboard → **SQL Editor** (สิทธิ์ owner):

1. `migrations/0001_init.sql` — enums, 7 ตาราง, index, trigger `updated_at`, และ **RLS policy ครบทุกตาราง**
2. `migrations/0002_seed_defaults.sql` — หมวด/กระเป๋าเริ่มต้น + trigger seed ตอนสมัคร
3. `migrations/0003_storage.sql` — bucket `stock-photos` (private) + RLS ตาม user

ทุกไฟล์เป็น **additive-only** และ **รันซ้ำได้** (idempotent) — รันใหม่ไม่พังของเดิม

### หลังรันเสร็จ
- ตั้งค่า **Auth → Providers → Email** ให้เปิด (อีเมล + รหัสผ่าน)
- ถ้าสมัคร user ไว้ก่อนรัน 0002 ให้ seed ตัวเองครั้งเดียว:
  ```sql
  select public.seed_defaults(auth.uid());   -- ตอนรันในบริบทที่ล็อกอิน
  -- หรือระบุ uid ตรง ๆ:
  select public.seed_defaults('YOUR-USER-UUID');
  ```

## ตาราง (ตาม data model ในสเปก)

`wallets` · `categories` · `transactions` · `stock_items` · `stock_sales` · `favorites` · `recurring`
— ทุกตารางมี `user_id` (FK `auth.users`, default `auth.uid()`) + `created_at`/`updated_at`

## โมเดลบัญชีสต็อก = สินทรัพย์ (ตามที่เลือกไว้)

การซื้อสินค้าเข้าร้านถือเป็น **สินทรัพย์ (inventory)** ไม่ใช่รายจ่ายที่ใช้หมดไป:

- ธุรกรรมซื้อเข้ามี `type='expense'` + `is_stock_purchase=true`
- **กราฟการใช้จ่าย/งบประมาณต้องกรอง `is_stock_purchase=true` ออก** (ไม่นับเป็นการใช้จ่าย)
  เพื่อไม่ให้กราฟเพี้ยนตอนลงของเยอะ
- รับรู้ **กำไรตอนขายจริง** ผ่าน `stock_sales.profit = (sale_price − cost_per_unit) × qty_sold`

> ตรรกะการเขียนข้อมูลแบบ atomic (ซื้อเข้า → สร้าง stock_item + ลิงก์ธุรกรรม, ขายออก → ตัด qty + สร้าง stock_sales)
> จะทำเป็น Postgres RPC ในส่วนที่ 4 (คนละ migration, ยังไม่รวมในชุดนี้)

## หมายเหตุความปลอดภัย
- ทุก policy จำกัดเฉพาะ role `authenticated` และ `auth.uid() = user_id`
- ทดสอบแล้วบน Postgres 16: RLS แยกข้อมูลข้าม user ได้ และ insert ปลอม `user_id` ถูก `WITH CHECK` ปฏิเสธ
- ไม่มี secret ใด ๆ ในไฟล์เหล่านี้
