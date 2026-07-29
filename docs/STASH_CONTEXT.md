# STASH — Project Context

> ไฟล์นี้คือบริบทถาวรของโปรเจกต์ ใช้แทนการอ่าน `docs/PROJECT_AUDIT.md` ฉบับเต็มในงานประจำวัน
> รายละเอียด finding ทั้งหมดยังอยู่ในไฟล์ audit — ที่นี่เก็บเฉพาะสิ่งที่จำเป็นต่อการเขียนโค้ดใหม่
> **ก่อนใช้ครั้งแรก:** ให้ Claude Code ตรวจสอบไฟล์นี้เทียบกับ repo จริงหนึ่งรอบ แล้วแก้จุดที่ไม่ตรง

---

## 1. โปรเจกต์นี้คืออะไร

PWA บันทึกรายรับ-รายจ่ายส่วนตัว ที่มีระบบสต็อกสินค้า (เสื้อผ้ามือสอง/ขายต่อ) รวมอยู่ในตัวเดียวกัน

- ผู้ใช้: เจ้าของ + เพื่อนไม่กี่คน **ต่างคนต่างขายของตัวเอง ไม่แชร์คลัง**
- ภาษา: ไทย · สกุลเงิน: THB · เขตเวลา: Asia/Bangkok
- ไม่มีหน้าสมัครสมาชิก — เจ้าของสร้างบัญชีให้ใน Supabase dashboard
- Production: `https://stash-web.morganstuffs.workers.dev`

---

## 2. Stack และสภาพแวดล้อม

Vite 6 · React 18 · TypeScript (strict) · Supabase (Postgres + Auth + Storage) · TanStack Query · PWA · deploy บน Cloudflare Workers · Vitest · GitHub Actions CI

**ข้อจำกัดสำคัญที่กำหนดวิธีทำงานทั้งหมด:**

- เจ้าของทำงาน**ออนไลน์ล้วน ไม่มีเครื่อง dev** — รันคำสั่ง local ไม่ได้
- Migration เป็น **raw SQL รันมือใน Supabase SQL Editor** ไม่มี Supabase CLI ไม่มี migration runner
- AI agent **ต่อ DB ไม่ได้** — ต้องส่ง SQL ให้เจ้าของรันแล้วรายงานผลกลับ
- `supabase gen types` ใช้วิธีดาวน์โหลดจาก dashboard แล้ว paste

---

## 3. โครงสร้าง

```
DB (tables + RPC + trigger)  →  lib/ (pure function)  →  hooks/ (TanStack Query)  →  UI
```

ตรรกะที่แตะเงิน อยู่ใน SQL หรือใน pure function ใน `lib/` เท่านั้น **ห้าม inline ใน component**

**ไฟล์ที่ต้องรู้จัก:**

| ไฟล์ | หน้าที่ |
|---|---|
| `src/lib/database.types.ts` | **generated — ห้ามแก้มือ** |
| `src/lib/db.ts` | type alias ระดับแอป (derive จาก generated) |
| `src/lib/ledger.ts` | predicate กลาง: อะไรนับเป็นอะไร |
| `src/lib/errors.ts` | แปลง error เป็นข้อความผู้ใช้ ที่เดียว |
| `src/lib/auth.ts` | auth helper + recovery gate |
| `src/hooks/useHome.ts` | `computeHomeSummary` |
| `src/hooks/useStock.ts` | `computeStockHero` |
| `src/hooks/useBudgets.ts` | `computePace`, `useMonthSpending` |

**ตาราง:** `transactions` `categories` `wallets` `budgets` `stock_items` `stock_sales` `stock_sku_config` `recurring` `favorites` `schema_migrations`

ทุกตาราง RLS เปิด + 4 policy บน `auth.uid() = user_id`
ยกเว้น `schema_migrations`: RLS เปิด · 0 policy · ถอนสิทธิ์ anon/authenticated ทั้งหมด (ตั้งใจ)

---

## 4. กฎธุรกิจ — เงิน

1. **ซื้อของเข้าสต็อกไม่ใช่รายจ่าย** — เป็นการแปลงสินทรัพย์ (`is_stock_purchase=true` ตัดออกจากยอดจ่าย)
2. **ขาย = บันทึกสองแถวเสมอ (Model A gross)**
   - income = ราคาขาย × qty (หมวด `system_key='stock_sale_income'`)
   - expense = ต้นทุน × qty (`is_stock_cogs=true`, หมวด `system_key='stock_cogs'`)
3. `safeToSpend = income − expense` — ไม่ต้องมี accumulator แยกสำหรับ COGS เพราะสูตรนี้ให้ +กำไรสุทธิพอดีอยู่แล้ว
4. **COGS นับใน headline เงินออก + donut ตามปกติ แต่ตัดออกจาก budget** (budget คุมค่าใช้จ่ายส่วนตัว ไม่ใช่ต้นทุนสินค้า)
5. เงินทุกตัว**คำนวณใน SQL เป็น numeric** ห้ามคำนวณใน JS แล้วส่งเข้ามา
6. **ขายขาดทุนได้** — สองแถว ledger ยังเป็นบวก มีแค่ `stock_sales.profit` ที่ติดลบ
7. `cost_at_sale` snapshot ต้นทุน/ชิ้น ณ วันขาย → แก้ `cost_per_unit` ทีหลังไม่กระทบกำไรที่รับรู้ไปแล้ว
8. `sale_date` ห้ามเป็นอนาคต (เทียบเวลาไทย)
9. **วันที่ฝั่ง DB ใช้ `(now() at time zone 'Asia/Bangkok')::date` เสมอ** ห้าม `current_date`
10. **การตัดสินว่ารายการอยู่เดือนไหน ต้องอ่านจาก string `YYYY-MM-DD` ตรง ๆ** ห้ามแปลงเป็น Date object แล้วอ่านค่า

---

## 5. กฎธุรกิจ — สต็อก

- `qty_remaining` / `status` **คำนวณจากจำนวนเสมอ** ห้าม toggle
  `sold` เมื่อเหลือ 0 · `partial` เมื่อเหลือ < ทั้งหมด · `in_stock` เมื่อเท่าทั้งหมด
- `cost_per_unit` และ `qty_total` **ถูกล็อกเมื่อมีการขายแล้ว** (trigger ระดับ DB)
- **transaction ที่ผูกกับ `stock_sales` แก้/ลบตรงไม่ได้** (trigger ระดับ DB) ต้องผ่าน `stock_sale_reverse`
  `reverse` ผ่าน guard ได้เพราะลบแถว `stock_sales` **ก่อน** ลบ transaction — ไม่ใช้ flag ใด ๆ
- สินค้าที่มีประวัติขาย **ลบไม่ได้** (FK RESTRICT) ต้อง reverse ก่อน
- **SKU สร้างจาก DB ตาม `stock_sku_config` ของแต่ละ user** ตัวนับเดินหน้าอย่างเดียว ห้ามพึ่ง `count(*)` ห้ามรีเซ็ตเมื่อเปลี่ยนรูปแบบ ห้ามตัดหลักเมื่อเลขยาวเกิน
- สูตรประกอบ SKU อยู่ที่ `stock_sku_build` **ที่เดียว** — ทั้ง intake และ preview เรียกตัวนี้

---

## 6. RPC ทั้งหมด

`stock_intake_create` · `stock_item_delete` · `stock_sale_create` · `stock_sale_reverse` · `stock_sales_summary` · `stock_sku_build` · `stock_sku_preview` · `seed_defaults_internal` · `recurring_run_due` · `recurring_next_date`

ทุกตัว: `security invoker` (ยกเว้น `seed_defaults_internal` = definer) · `set search_path = ''` · `grant execute to authenticated` · prefix `p_` สำหรับพารามิเตอร์ `v_` สำหรับตัวแปร

---

## 7. Seed ของ user ใหม่

**11 categories** — expense 8 (รวมหมวดสต็อก 2 + หมวด system COGS 1) · income 3 (รวม system 1)
**3 wallets** (ไม่มีคอลัมน์ `balance` แล้ว) · **1 แถว `stock_sku_config`**

| system_key | หมวด | ลบได้ | เห็นในหน้ากรอกมือ |
|---|---|---|---|
| `stock_sale_income` | ขายสต็อก (income) | ไม่ได้ | **เห็น** (บันทึกการขายนอกคลังด้วยมือได้) |
| `stock_cogs` | ต้นทุนขายสต็อก (expense) | ไม่ได้ | ซ่อน |

**resolve หมวด system ด้วย `system_key` เท่านั้น ห้าม match ด้วยชื่อไทย** — ผู้ใช้เปลี่ยนชื่อหมวดได้ (มีหลักฐานว่าเคยเปลี่ยนจริง)
ยกเว้น: การ backfill ครั้งเดียวใน migration ใช้ชื่อได้ เพราะรันครั้งเดียว ณ เวลาที่รู้สถานะแน่นอน

---

## 8. Convention — กฎที่ห้ามละเมิด

### Migration
1. **ห้ามแก้ไฟล์ migration ที่ apply ไปแล้ว** เขียนไฟล์ใหม่เสมอ
2. ทุกไฟล์จบด้วย `insert into schema_migrations` + `notify pgrst, 'reload schema'`
3. reproduce ฟังก์ชันจาก**เวอร์ชันล่าสุดบน main** ห้ามหยิบจากไฟล์ต้นฉบับ
4. เปลี่ยน signature → `drop function` ด้วย signature จริงจาก DB (**ไม่ใส่ `if exists`** จะได้พังเสียงดังถ้าผิด) แล้ว re-grant
5. ตารางใหม่ → enable RLS + 4 policy
6. เจ้าของรันเอง ครอบ `begin; … commit;` และ snapshot ฟังก์ชันเดิมก่อนทุกครั้งที่มีการทับ

### SQL
7. **`RETURNS TABLE` / OUT param กลายเป็นตัวแปรใน scope** → ต้อง alias ทุกตารางและ qualify ทุกคอลัมน์ในทุก statement
   (ambiguity เกิดตอน runtime ไม่ใช่ตอน create function → migration ผ่าน แต่ฟีเจอร์พัง)
8. **Verification ต้องพิสูจน์ว่า "ทำงานได้" ไม่ใช่แค่ "มีอยู่"** — ต้องมี smoke test ที่เรียกฟังก์ชันจริง
9. เงินคำนวณใน numeric เท่านั้น

### Client
10. **ห้ามมีตรรกะซ้ำสองที่** — แยกเป็นฟังก์ชันกลางแล้ว import
11. **ห้าม `as unknown as` / `as any` / `@ts-ignore` / `@ts-expect-error`**
12. `database.types.ts` generated ห้ามแก้มือ · alias เขียนเองอยู่ใน `db.ts`
13. **ห้ามใช้คำว่า "ผ่าน" ถ้ายังไม่ได้รัน `npm run build`** (คำสั่งเดียวกับ CI)
14. **จับ error ด้วย code เท่านั้น ห้ามจับด้วย substring ของข้อความ**
15. **error hint ใช้ allowlist ห้าม denylist** (ของใหม่ต้องถูกซ่อนโดยปริยาย)
16. **ห้ามเผยว่าอีเมลมีบัญชีในระบบหรือไม่** ทุกที่ (login, กู้รหัส, error hint) — กัน user enumeration
17. **error ต้องถึงผู้ใช้** ห้าม catch ว่าง ห้ามกลืนเงียบ
18. ห้าม `new Date('YYYY-MM-DD')` แล้วอ่านค่าออกมา
19. 1 PR = 1 เรื่อง แตกจาก main ล่าสุด ไม่ stack · เช็คก่อน push ว่า PR ยังเปิดอยู่
20. ตารางที่ PK เป็น `user_id` (เช่น `stock_sku_config`) เบี่ยงจาก pattern โดยตั้งใจ เพราะเป็นตาราง 1 แถว/user

---

## 9. กับดักที่เคยเกิดขึ้นจริง — อย่าให้ซ้ำ

| เหตุการณ์ | บทเรียน |
|---|---|
| `create or replace` ตอนเพิ่มพารามิเตอร์ → เกิดฟังก์ชันซ้อน 2 ตัว ตัวเก่ายังทำงาน migration ไม่ error | signature เปลี่ยน = ต้อง drop ก่อน · verification ต้องนับจำนวนนิยาม = 1 |
| `qty_remaining` เป็นทั้ง OUT param และคอลัมน์ → การขายพังตอนกดจริง ทั้งที่ verification ผ่านครบ | qualify ทุกคอลัมน์ · smoke test ก่อนใช้งานจริง |
| `npm run typecheck` เป็น `tsc --noEmit` บน solution-style tsconfig → **ตรวจ 0 ไฟล์ ผ่านเสมอ** | คำยืนยันว่า "ผ่าน" ต้องมาจากคำสั่งเดียวกับ CI |
| `getDate()` บน date-only string → วันที่เลื่อนใน timezone ติดลบ | อ่านวันจาก string ตรง ๆ |
| DB รัน migration ไปแล้วแต่ไฟล์ยังไม่เข้า main | merge ก่อนทำงานถัดไป · `schema_migrations` เป็น ledger |
| push งานเข้า branch หลัง PR ปิดไปแล้ว → commit ค้าง เอกสารบน main ล้าสมัย | เช็คว่า PR เปิดอยู่ก่อน push |
| Supabase free tier pause เอง แล้วหน้า login ค้างไม่บอกอะไร | error ต้องถึงผู้ใช้ · `getSession()` ต้องมีตัวดัก |

---

## 10. สถานะปัจจุบัน

**Migration 0001–0013 apply แล้วทั้งหมด**
0010 = timezone · 0011 = SKU config + unique + drop `wallets.balance` · 0012 = ระบบขาย · 0013 = แก้ ambiguous column

**ทำเสร็จแล้ว:** ระบบขายครบวงจร (ขาย/ย้อน/สรุป) · error ที่ถึงผู้ใช้ · ชุดทดสอบ 57 เคสใน CI · types generate จาก DB จริง · หน้ากู้รหัสผ่าน + recovery gate · empty-state หน้ารับของเข้า

**ยังไม่ได้ทำ:**
- หน้าตั้งค่ารูปแบบ SKU (ฝั่ง DB พร้อมแล้ว เหลือ UI) + ช่องกรอกตัวย่อแบรนด์ตอนรับของเข้า (`p_brand_code` รับได้แล้ว)
- ยอดเงินคงเหลือรายกระเป๋า (ตัดสินใจว่าจะทำหรือไม่ — ถ้าทำต้องคำนวณจาก transactions ไม่ใช่เก็บตัวเลขค้างไว้)
- ใช้งาน offline (โค้ดเขียนไว้ครึ่งหนึ่ง ไม่เคยเปิดใช้ — ทำต่อหรือลบทิ้ง)
- ฟีเจอร์ AI (โครงเปล่า)
- ถังขยะ / กู้ข้อมูลที่ลบ + การสำรองข้อมูล
- ESLint · drift check อัตโนมัติของ types · ค้นหาประวัติที่จับได้แค่โน้ต · ถอนสิทธิ์ `TRUNCATE` จาก anon

---

## 11. งานถัดไป — Redesign หน้าแรก

### ปัญหาที่ต้องแก้ (เรียงตามความสำคัญ)

1. **มีตัวเลข "ใช้ได้เท่าไหร่" สองตัวที่ขัดกันเอง** — ฮีโร่บอก "เหลือใช้ได้ ฿1,948" ขณะที่แถบบนบอกงบ ฿10,000 แต่จ่ายไป ฿48,052 (เกินงบ ฿38,000) ไม่มีอะไรเตือนว่าเกินงบ **ต้องเคาะก่อนว่าหน้าแรกตอบคำถามไหนเป็นหลัก** แล้วให้อีกตัวเป็นบริบท
2. ฮีโร่ยกพื้นที่กลางจอให้โลโก้ ไม่ใช่ให้ตัวเลข
3. สามแถบบนสุดคือข้อมูลสำคัญที่สุด แต่ถูกบีบเป็นแถบบางและถูกการ์ดฮีโร่บังครึ่งหนึ่ง
4. Donut ตัดหมวดหายเงียบ (ผลรวม legend ไม่เท่ายอดจ่ายจริง) ต้องมี "อื่นๆ"
5. ปุ่ม "เร็วๆ นี้" สองปุ่มกินครึ่งแถวปุ่มหลัก
6. เงินเข้า/เงินออก แสดงซ้ำสองที่ (แถบบน + หัวกราฟ)
7. สีเขียวทำทุกหน้าที่ ไม่มีลำดับความสำคัญ · แถบรายจ่ายสีเข้มอ่านเหมือนปุ่มปิดใช้งาน
8. รายการล่าสุด: ชื่อซ้ำกับหมวด · ไม่มีเส้นแบ่งวัน เห็นแต่เวลา

### คอนเซปต์ฮีโร่ใหม่ — ป้ายห้อยสินค้า (hangtag)

**แทนที่** คอนเซปต์เดิม (ซองเก็บบัตร + สไลด์การ์ดขึ้นมา) ซึ่งซ่อนข้อมูลสำคัญไว้ครึ่งหนึ่ง

**หลักการที่ต้องยึด: กิมมิกต้องเผย ไม่ใช่ซ่อน** — ของที่ดูทุกวันต้องเห็นทันทีโดยไม่ต้องกด ลูกเล่นเก็บไว้ให้ของที่ดูนาน ๆ ครั้ง

**รูปแบบ:**
- ป้ายราคาหลายใบคล้องห่วงเดียวกัน มีรูเจาะด้านบน
- **ใบหน้าสุดแสดงตัวเลขหลักเต็ม ๆ เสมอ** ไม่มีอะไรมาบัง
- ใบหลังโผล่ขอบให้รู้ว่ามีอีก · ปัดนิ้วเพื่อสลับใบ
- ตัวเลขบนป้าย**พลิกทีละหลักตอนเปิดแอป** (split-flap) ให้ความรู้สึกว่าข้อมูลสด — ได้ลูกเล่นโดยไม่แลกกับการอ่านง่าย

**เหตุผลที่เลือก:** ตรงกับธุรกิจโดยตรง (ขายเสื้อผ้า ป้ายห้อยคือของจริงในมือทุกวัน) · ทรงป้ายรองรับเลขเดียวเด่น ๆ พอดี · แก้ปัญหาข้อ 2 และ 3 ไปในตัว

**ทางเลือกที่พิจารณาแล้วไม่เลือก:** ม้วนใบเสร็จ (ดึงลงคลี่) · ป้ายพลิกตัวเลขล้วน (ปลอดภัยสุดแต่ไม่มีตัวตน) · ซองรูดซิป (ตรงกับชื่อแอปที่สุด แต่ยังต้องกดถึงจะเห็น)

### สิ่งที่ต้องเคาะก่อนลงมือ

หน้าแรกควรตอบคำถามไหนก่อน — **"เดือนนี้เหลือเงินเท่าไหร่"** หรือ **"เดือนนี้ใช้เกินที่ตั้งใจไปแค่ไหน"**
คำตอบนี้กำหนดว่าป้ายใบแรกแสดงอะไร และป้ายใบถัด ๆ ไปเรียงยังไง
