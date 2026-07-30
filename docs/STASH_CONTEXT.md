# STASH — Project Context

> ไฟล์นี้คือบริบทถาวรของโปรเจกต์ ใช้แทนการอ่าน `docs/PROJECT_AUDIT.md` ฉบับเต็มในงานประจำวัน
> รายละเอียด finding ทั้งหมดยังอยู่ในไฟล์ audit — ที่นี่เก็บเฉพาะสิ่งที่จำเป็นต่อการเขียนโค้ดใหม่
> **วิธีใช้:** ทุกข้อความในไฟล์นี้ควรชี้กลับไปที่ไฟล์/บรรทัดจริงได้ ถ้าจุดไหนยังไม่ได้ตรวจ จะเขียนว่า "ยังไม่ได้ตรวจ" ไว้ตรง ๆ ไม่เดา
> **ตรวจครั้งล่าสุดเทียบ repo จริง:** commit `c193ff8` (ประกอบใหม่ทั้งฉบับจากการอ่านโค้ด ไม่ใช่แก้ทีละบรรทัด)

---

## 1. โปรเจกต์นี้คืออะไร

PWA บันทึกรายรับ-รายจ่ายส่วนตัว ที่มีระบบสต็อกสินค้า (เสื้อผ้ามือสอง/ขายต่อ) รวมอยู่ในตัวเดียวกัน

- ผู้ใช้: เจ้าของ + เพื่อนไม่กี่คน **ต่างคนต่างขายของตัวเอง ไม่แชร์คลัง**
- ภาษา: ไทย · สกุลเงิน: THB · เขตเวลา: Asia/Bangkok
- ไม่มีหน้าสมัครสมาชิก — เจ้าของสร้างบัญชีให้ใน Supabase dashboard (มีหน้ากู้รหัสผ่าน `/forgot-password` + `/reset-password`)
- Production: `https://stash-web.morganstuffs.workers.dev` (ชื่อ worker `stash-web` ใน `wrangler.jsonc`)

---

## 2. Stack และสภาพแวดล้อม

Vite 6 · React 18 · TypeScript (strict) · Supabase (Postgres + Auth + Storage) · TanStack Query · PWA (`vite-plugin-pwa`) · deploy บน Cloudflare Workers · Vitest · GitHub Actions CI

**ข้อจำกัดสำคัญที่กำหนดวิธีทำงานทั้งหมด:**

- เจ้าของทำงาน**ออนไลน์ล้วน ไม่มีเครื่อง dev** — รันคำสั่ง local ไม่ได้ (AI agent รันให้)
- Migration เป็น **raw SQL รันมือใน Supabase SQL Editor** ไม่มี Supabase CLI ไม่มี migration runner
- AI agent **ต่อ DB ไม่ได้** — ต้องส่ง SQL ให้เจ้าของรันแล้วรายงานผลกลับ
- `supabase gen types` ใช้วิธีดาวน์โหลดจาก dashboard แล้ว paste ทับ `src/lib/database.types.ts`
- **Deploy อัตโนมัติผ่าน Cloudflare Workers Git integration** (build จาก git โดยตรง) — **ห้ามเพิ่ม deploy workflow ใน GitHub Actions** จะกลายเป็นสองทางเดินชนกัน
- CI (`.github/workflows/ci.yml`) รัน `npm ci` → `npm run build` → `npm test` เท่านั้น (build + test ไม่ deploy)

---

## 3. โครงสร้าง

```
DB (tables + RPC + trigger)  →  lib/ (pure function)  →  hooks/ (TanStack Query)  →  UI
```

ตรรกะที่แตะเงิน อยู่ใน SQL หรือใน pure function ใน `lib/` เท่านั้น **ห้าม inline ใน component**

**ไฟล์ที่ต้องรู้จัก:**

| ไฟล์ | หน้าที่ |
|---|---|
| `src/lib/database.types.ts` | **generated — ห้ามแก้มือ** (paste จาก dashboard) |
| `src/lib/db.ts` | type alias ระดับแอป (derive จาก generated) รวม `Profile`/`FriendConnection`/`Debt`/`DebtEvent` |
| `src/lib/ledger.ts` | predicate กลาง: อะไรนับเป็นอะไร (`isSpendingRow`/`isBudgetSpendingRow` รวม `is_debt_settlement`) |
| `src/lib/errors.ts` | แปลง error เป็นข้อความผู้ใช้ ที่เดียว |
| `src/lib/auth.ts` | auth helper + recovery gate |
| `src/lib/format.ts` | จัดรูปเงิน/วันที่ (บาท, พ.ศ., `formatBuildStamp` ของ version stamp) |
| `src/lib/dates.ts` | `daysLeftInMonth()` ฯลฯ — helper วันที่ที่หน้าแรก/หน้างบใช้ร่วม |
| `src/hooks/useHome.ts` | `computeHomeSummary` + `FALLBACK_SLICE_COLORS` (mirror ของ `cat.1–6`) |
| `src/hooks/useStock.ts` | `computeStockHero` |
| `src/hooks/useBudgets.ts` | `computePace`, `useMonthSpending` |

**ตาราง (14 ตาราง จาก `database.types.ts`):**
`transactions` `categories` `wallets` `budgets` `stock_items` `stock_sales` `stock_sku_config` `recurring` `favorites` `schema_migrations` — **และกลุ่มหนี้เพื่อน:** `debts` `debt_events` `friend_connections` `profiles`

ทุกตาราง RLS เปิด + policy บน `auth.uid() = user_id`
ยกเว้น `schema_migrations`: RLS เปิด · 0 policy · ถอนสิทธิ์ anon/authenticated ทั้งหมด (ตั้งใจ)

> กลุ่มตาราง/RPC หนี้เพื่อน (`debts`/`profiles`/`friend_connections`/`debt_events`) เข้ามากับ `0015_friend_debts.sql` — เป็น**ฟีเจอร์ cross-user ตัวแรก** จึงใช้ security model ต่างจากตารางอื่น (RLS select-only + เขียนผ่าน SECURITY DEFINER RPC ที่เช็คคู่กรณีเอง) ดู §6 และหัวไฟล์ 0015

---

## 4. กฎธุรกิจ — เงิน

1. **ซื้อของเข้าสต็อกไม่ใช่รายจ่าย** — เป็นการแปลงสินทรัพย์ (`is_stock_purchase=true` ตัดออกจากยอดจ่าย)
2. **ขาย = บันทึกสองแถวเสมอ (Model A gross)**
   - income = ราคาขาย × qty (หมวด `system_key='stock_sale_income'`)
   - expense = ต้นทุน × qty (`is_stock_cogs=true`, หมวด `system_key='stock_cogs'`)
3. `safeToSpend = income − expense` — ไม่ต้องมี accumulator แยกสำหรับ COGS เพราะสูตรนี้ให้ +กำไรสุทธิพอดีอยู่แล้ว
4. **COGS นับใน headline เงินออก + donut ตามปกติ แต่ตัดออกจาก budget** (budget คุมค่าใช้จ่ายส่วนตัว ไม่ใช่ต้นทุนสินค้า)
5. **การจ่ายคืนหนี้ (`is_debt_settlement=true`) เหมือน COGS:** นับใน headline เงินออก (`isSpendingRow`) แต่ **ตัดออกจาก budget** (`isBudgetSpendingRow` — `src/lib/ledger.ts:38-40`) เพราะเป็นการคืนหนี้ที่เป็นภาระอยู่แล้ว ไม่ใช่รายจ่ายใหม่ประจำเดือน
6. เงินทุกตัว**คำนวณใน SQL เป็น numeric** ห้ามคำนวณใน JS แล้วส่งเข้ามา
7. **ขายขาดทุนได้** — สองแถว ledger ยังเป็นบวก มีแค่ `stock_sales.profit` ที่ติดลบ
8. `cost_at_sale` snapshot ต้นทุน/ชิ้น ณ วันขาย → แก้ `cost_per_unit` ทีหลังไม่กระทบกำไรที่รับรู้ไปแล้ว
9. `sale_date` ห้ามเป็นอนาคต (เทียบเวลาไทย)
10. **วันที่ฝั่ง DB ใช้ `(now() at time zone 'Asia/Bangkok')::date` เสมอ** ห้าม `current_date`
11. **การตัดสินว่ารายการอยู่เดือนไหน ต้องอ่านจาก string `YYYY-MM-DD` ตรง ๆ** ห้ามแปลงเป็น Date object แล้วอ่านค่า

---

## 5. กฎธุรกิจ — สต็อก

- `qty_remaining` / `status` **คำนวณจากจำนวนเสมอ** ห้าม toggle
  `sold` เมื่อเหลือ 0 · `partial` เมื่อเหลือ < ทั้งหมด · `in_stock` เมื่อเท่าทั้งหมด
- `cost_per_unit` และ `qty_total` **ถูกล็อกเมื่อมีการขายแล้ว** (trigger ระดับ DB)
- **transaction ที่ผูกกับ `stock_sales` แก้/ลบตรงไม่ได้** (trigger ระดับ DB) ต้องผ่าน `stock_sale_reverse`
  `reverse` ผ่าน guard ได้เพราะลบแถว `stock_sales` **ก่อน** ลบ transaction — ไม่ใช้ flag ใด ๆ
- รายการจ่ายคืนหนี้ก็มี trigger กันแก้/ลบตรงเช่นกัน (`debt_settlement_txn_guard` — `0015` §10) · ย้อนด้วย `debt_settle_reverse` ที่เคลียร์ `debts.settlement_transaction_id` **ก่อน** ลบ transaction (ทริกเดียวกับ `stock_sale_reverse`) · แก้ note/wallet ของรายการเคลียร์หนี้ได้ แต่แก้ยอด/ประเภท/วันที่ไม่ได้
- สินค้าที่มีประวัติขาย **ลบไม่ได้** (FK RESTRICT) ต้อง reverse ก่อน
- **SKU สร้างจาก DB ตาม `stock_sku_config` ของแต่ละ user** ตัวนับเดินหน้าอย่างเดียว ห้ามพึ่ง `count(*)` ห้ามรีเซ็ตเมื่อเปลี่ยนรูปแบบ ห้ามตัดหลักเมื่อเลขยาวเกิน
- สูตรประกอบ SKU อยู่ที่ `stock_sku_build` **ที่เดียว** — ทั้ง intake และ preview เรียกตัวนี้

---

## 6. RPC ทั้งหมด

**จาก `src/lib/database.types.ts` (`Database['public']['Functions']`) — 22 ตัว:**

สต็อก/ระบบ: `stock_intake_create` · `stock_item_delete` · `stock_sale_create` · `stock_sale_reverse` · `stock_sales_summary` · `stock_sku_build` · `stock_sku_preview` · `seed_defaults` · `seed_defaults_internal` · `recurring_run_due` · `recurring_next_date`

หนี้เพื่อน (มาจาก 0015): `debt_create` · `debt_confirm` · `debt_cancel` · `debt_reject` · `debt_settle` · `debt_settle_reverse` · `debt_delete_private` · `friend_debts_summary` · `friend_request_send` · `friend_request_respond` · `generate_friend_code`

ทุกตัว: `security invoker` · `set search_path = ''` · `grant execute to authenticated` · prefix `p_` สำหรับพารามิเตอร์ `v_` สำหรับตัวแปร
**ยกเว้นกลุ่มหนี้เพื่อน (0015) = `security definer`:** ตาราง `friend_connections`/`debts`/`debt_events` เป็น select-only RLS ไม่มี write policy → ทุก RPC เขียนแบบ definer และ **re-check `auth.uid()` ว่าเป็นคู่กรณีเองในแต่ละฟังก์ชัน** (ไม่มี owner column ให้ RLS พึ่ง) · `generate_friend_code()` เป็น definer + **ไม่ grant ให้ role ใด** (เรียกจากใน seed path เท่านั้น) · `friend_debts_summary` เป็น invoker (อ่านผ่าน select policy พอ) · `seed_defaults_internal` definer เหมือนเดิม

---

## 7. Seed ของ user ใหม่

`seed_defaults_internal(uid)` สร้างค่าเริ่มต้นให้ user ใหม่ · **3 wallets** (ไม่มีคอลัมน์ `balance` แล้ว) · **1 แถว `stock_sku_config`** (prefix เริ่มต้น `STZ-` เห็นในหน้าตั้งค่า `SettingsPage.tsx`)

**หมวดหมู่ (categories): 13 หมวด** (ยืนยันจาก `0015` SECTION 5 `seed_defaults_internal`)
- expense 9: อาหาร · เดินทาง · ช้อปปิ้ง · บิล/ค่าบ้าน · บันเทิง · เสื้อเข้าร้าน (stock) · รองเท้าเข้าร้าน (stock) · ต้นทุนขายสต็อก (system `stock_cogs`) · จ่ายชำระหนี้ (system `debt_repayment_expense`)
- income 4: เงินเดือน · ฟรีแลนซ์ · ขายสต็อก (system `stock_sale_income`) · ได้รับชำระหนี้ (system `debt_repayment_income`)

0015 ยัง **backfill** หมวด system คืนหนี้ 2 หมวด + สร้าง `profiles` row (พร้อม `friend_code` สุ่ม) ให้ user เดิมทุกคน · การค้นหาเพื่อน**ไม่ใช้อีเมล** (กันกฎ 16) แต่ใช้ `friend_code` 8 หลัก สุ่มไม่ซ้ำ แชร์นอกแอป

| system_key | หมวด | ลบได้ | เห็นในหน้ากรอกมือ |
|---|---|---|---|
| `stock_sale_income` | ขายสต็อก (income) | ไม่ได้ | **เห็น** (บันทึกการขายนอกคลังด้วยมือได้) |
| `stock_cogs` | ต้นทุนขายสต็อก (expense) | ไม่ได้ | ซ่อน |
| `debt_repayment_income` | คืนหนี้ (income) | ไม่ได้ | ซ่อน (มาจาก `debt_settle` เท่านั้น) |
| `debt_repayment_expense` | คืนหนี้ (expense) | ไม่ได้ | ซ่อน (มาจาก `debt_settle` เท่านั้น) |

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
18. ห้าม `new Date('YYYY-MM-DD')` แล้วอ่านค่าออกมา (timestamp เต็มที่มีเวลา+Z parse ได้ — `formatBuildStamp` ใน `format.ts` เป็นข้อยกเว้นที่ตั้งใจ มีคอมเมนต์กำกับ)
19. 1 PR = 1 เรื่อง แตกจาก main ล่าสุด ไม่ stack · เช็คก่อน push ว่า PR ยังเปิดอยู่
20. ตารางที่ PK เป็น `user_id` (เช่น `stock_sku_config`) เบี่ยงจาก pattern โดยตั้งใจ เพราะเป็นตาราง 1 แถว/user
21. **สีต้องมาจาก token** ห้ามใส่ hex ดิบใหม่ใน `src/` · ค่าใน `index.html`/`vite.config.ts` (เช่น `theme-color`/`manifest.theme_color`) ต้อง mirror ค่าจากพาเลตต์ (`--color-surface` ใน `index.css`) พร้อมคอมเมนต์กำกับ ไม่ใช่ค่าอิสระ · แอปมี dark mode → `theme-color` ต้องเป็น **สีพื้นแอป** และแยกตาม scheme ห้ามใช้ค่าตายตัวค่าเดียว (จะผิดในโหมดใดโหมดหนึ่งเสมอ)

---

## 9. กับดักที่เคยเกิดขึ้นจริง — อย่าให้ซ้ำ

| เหตุการณ์ | บทเรียน |
|---|---|
| `create or replace` ตอนเพิ่มพารามิเตอร์ → เกิดฟังก์ชันซ้อน 2 ตัว ตัวเก่ายังทำงาน migration ไม่ error | signature เปลี่ยน = ต้อง drop ก่อน · verification ต้องนับจำนวนนิยาม = 1 |
| `qty_remaining` เป็นทั้ง OUT param และคอลัมน์ → การขายพังตอนกดจริง ทั้งที่ verification ผ่านครบ | qualify ทุกคอลัมน์ · smoke test ก่อนใช้งานจริง |
| `npm run typecheck` เป็น `tsc --noEmit` บน solution-style tsconfig → **ตรวจ 0 ไฟล์ ผ่านเสมอ** | คำยืนยันว่า "ผ่าน" ต้องมาจากคำสั่งเดียวกับ CI (`npm run build` = `tsc -b && vite build`) |
| `getDate()` บน date-only string → วันที่เลื่อนใน timezone ติดลบ | อ่านวันจาก string ตรง ๆ |
| **DB รัน migration ไปแล้วแต่ไฟล์ยังไม่เข้า main** (เคส `0015_friend_debts.sql`: PR #65 อ้างว่า "apply แล้ว" แต่ diff ไม่มีไฟล์ `.sql` เลย — เจ้าของนำไฟล์ต้นฉบับกลับเข้า main ใน PR นี้ ยืนยันตรงกับ `schema_migrations` + `database.types.ts`) | ไฟล์ migration ต้องอยู่ใน diff ของ PR · `schema_migrations` คือ ledger ของจริง · **ห้ามประกอบไฟล์ migration ขึ้นเองจากการอ่าน types** — ต้องได้ไฟล์ต้นฉบับที่รันไปจริงจากเจ้าของ |
| "test/verification ผ่าน" แต่ของจริงไม่ขึ้น (เช่น ป้ายพับดูเป็นแถบเปล่าบน production) | อาจเป็นเรื่อง **shell เก่าค้าง** ไม่ใช่บั๊ก DOM → ต้องมี version stamp + ปุ่มโหลดใหม่ของ PWA (ดู §10) |
| push งานเข้า branch หลัง PR ปิดไปแล้ว → commit ค้าง เอกสารบน main ล้าสมัย | เช็คว่า PR เปิดอยู่ก่อน push |
| Supabase free tier pause เอง แล้วหน้า login ค้างไม่บอกอะไร | error ต้องถึงผู้ใช้ · `getSession()` ต้องมีตัวดัก |

---

## 10. สถานะปัจจุบัน (ณ commit `c193ff8`)

**ไฟล์ migration บน main: `0001`–`0015`** (ล่าสุด `0015_friend_debts.sql`)
0010 = timezone · 0011 = SKU config + unique + drop `wallets.balance` · 0012 = ระบบขาย · 0013 = แก้ ambiguous column · 0014 = `favorites.wallet_id` + `favorites.note` · 0015 = หนี้เพื่อน (tables + RPC + `is_debt_settlement`)

> ✅ **`0015` เข้า main แล้ว (PR นี้):** เดิมหายไป (DB รันแล้วแต่ PR #65 ไม่ได้ commit ไฟล์ `.sql`) · เจ้าของยืนยัน `schema_migrations` มี `0015` (apply 2026-07-30 11:31) เป็นเลขล่าสุด และส่งไฟล์ต้นฉบับมา · ตรวจ signature/คอลัมน์ทุกตัวตรงกับ `database.types.ts` ก่อน commit

**หน้าจริงในแอป (11 ไฟล์ใน `src/pages/`, 10 เส้นทางใน `router.tsx`):**
Home `/` · History `/history` · Add `/add` · Stock `/stock` · StockIntake `/stock/intake` · StockQueue `/stock/queue` · Budget `/budget` · Settings `/settings` · Login · ForgotPassword · ResetPassword

**ทำเสร็จแล้ว (มีในโค้ดจริง):**
- ระบบขายครบวงจร (ขาย/ย้อน/สรุป) · error ที่ถึงผู้ใช้ · **ชุดทดสอบ 139 เคสใน CI** (Vitest, ไฟล์ `*.test.ts(x)`) · types generate จาก DB จริง · หน้ากู้รหัสผ่าน + recovery gate
- **Dark mode** — ทำแล้ว (PR #63) ผ่าน CSS variables (`html.dark` ใน `src/styles/index.css`) + `useTheme.ts`/`lib/theme.ts` + toggle ในหน้าตั้งค่า → **ไม่ใช่ "งานสุดท้ายที่ยังไม่ทำ" อีกต่อไป**
- **กระดิ่งแจ้งเตือนสต็อก** (PR #56) — `useAttention.ts` นับ "รอเติมข้อมูล" + "ค้างนาน" บนหน้าแรก
- **หน้าคิวสต็อก** `StockQueuePage.tsx` + `useQueue.ts` (รายการ `needs_details`)
- redesign ครบสี่หน้าหลัก + หน้ารอง (ดู §11.4)
- **ชั้นข้อมูลหนี้เพื่อน (PR #65):** thread `is_debt_settlement` เข้า `ledger.ts`/hooks/`AddPage.tsx` + type alias ใน `db.ts` — **แต่ยังไม่มีหน้า/route หนี้เพื่อน** (UI ยังไม่ทำ)

**ยังไม่ได้ทำ:**
- **UI หนี้เพื่อน** (ตาราง+RPC+ไฟล์ 0015 พร้อมแล้ว เหลือหน้า/route ทั้งหมด — เพิ่มเพื่อน · สร้าง/ยืนยัน/เคลียร์หนี้ · สรุปยอดกับเพื่อน)
- หน้าตั้งค่ารูปแบบ SKU แบบแก้ได้ (ตอนนี้ `SettingsPage.tsx` โชว์ `STZ-` แบบ read-only) + ช่องกรอกตัวย่อแบรนด์ตอนรับของเข้า (`p_brand_code` รับได้แล้ว)
- ยอดเงินคงเหลือรายกระเป๋า (ตัดสินใจว่าจะทำหรือไม่ — ถ้าทำต้องคำนวณจาก transactions ไม่ใช่เก็บตัวเลขค้างไว้)
- **ใช้งาน offline** — `src/lib/offlineQueue.ts` มีอยู่แต่ **ไม่มีไฟล์ไหน import** (ยังไม่ต่อเข้าแอป) → ทำต่อหรือลบทิ้ง *(หมายเหตุ: `useQueue.ts` เป็นคิว "รอเติมข้อมูล" ของสต็อก คนละเรื่องกับ offline)*
- ฟีเจอร์ AI (โครงเปล่า — toggle ใน `prefs.ts` เก็บค่าไว้เฉย ๆ, หน้าตั้งค่าเขียนว่า "ยังไม่เปิดใช้จริงในเวอร์ชันนี้")
- ถังขยะ / กู้ข้อมูลที่ลบ + การสำรองข้อมูล
- ESLint (ตอนนี้ `npm run lint` = `tsc -b` เท่านั้น) · drift check อัตโนมัติของ types · ถอนสิทธิ์ `TRUNCATE` จาก anon

**Version stamp + PWA update (เพิ่มใน PR นี้):**
- ฝัง commit SHA (7 ตัว) + เวลา build ผ่าน `define` ใน `vite.config.ts` (`__COMMIT_SHA__`/`__BUILD_TIME__`) หาค่าจาก `WORKERS_CI_COMMIT_SHA` → `CF_PAGES_COMMIT_SHA` → `GITHUB_SHA` → `VITE_COMMIT_SHA` → git → `'dev'` แสดงท้าย `SettingsPage.tsx` แตะแล้วคัดลอก
- `registerType` เปลี่ยนจาก `autoUpdate` → `prompt` + `src/components/PwaUpdater.tsx` ต่อ `virtual:pwa-register/react` → ขึ้น Toast "มีเวอร์ชันใหม่" พร้อมปุ่มโหลดใหม่ (ไม่รีโหลดเงียบ)

---

## 11. Redesign — สถานะและงานที่เหลือ

> **เคาะแล้ว (2026-07-29):** ฮีโร่ = **ป้ายทอสีเข้ม** · สีแบรนด์ = **คราม** · หน้าแรกตอบ **"เหลือเงินเท่าไหร่"** เป็นหลัก
> ขอบเขต redesign ครอบคลุมสี่หน้า: **หน้าแรก · หน้างบ · หน้าคลัง · หน้าเพิ่มรายการ** (ครบทั้งสี่หน้าแล้ว ดู §11.4)
> **เอกสารดีไซน์อยู่ที่:** `docs/design/untitled/project/uploads/design-spec-expense-stock-app.md` (สเปก) · `docs/design/untitled/project/uploads/ui-reference-expense-stock-app.html` (UI reference) · `docs/design/untitled/project/Screens.dc.html` · โฟลเดอร์ชื่อจริงคือ `untitled` (export มาแบบไม่ได้ตั้งชื่อ)
> **หมายเหตุ:** ไฟล์ `claude/NEW_PALETTE.md` และ `claude/HOME_REDESIGN_FINDINGS.md` ที่เอกสารรุ่นก่อนอ้างถึง **ไม่มีอยู่ใน repo** (ไม่มีโฟลเดอร์ `claude/`) — พาเลตต์จริงอยู่ใน `tailwind.config.ts` + `src/styles/index.css`

### ปัญหาที่ต้องแก้ (เรียงตามความสำคัญ) — แก้หมดแล้วในรอบ redesign
1. **มีตัวเลข "ใช้ได้เท่าไหร่" สองตัวที่ขัดกันเอง** — เคาะว่าหน้าแรกตอบ "เหลือใช้ได้" เป็นหลัก งบเป็นป้ายใบที่สอง (ทำแล้ว — `WovenHero`)
2. ฮีโร่ยกพื้นที่กลางจอให้โลโก้ ไม่ใช่ให้ตัวเลข (ทำแล้ว)
3. "สามแถบบนสุด" = หัวการ์ด 3 ใบที่โผล่พ้นซอง → เปลี่ยนฮีโร่แล้วหายไปเอง (ทำแล้ว)
4. Donut ตัดหมวดหายเงียบ (B3 — แก้แล้ว)
5. ปุ่ม "เร็วๆ นี้" กินแถวปุ่มหลัก (แก้แล้วในหน้าเพิ่มรายการ)
6. เงินเข้า/เงินออก แสดงซ้ำสองที่ (กราฟ trend ถูกถอดออกใน PR #64)
7. สีเขียวทำทุกหน้าที่ → ย้ายสีแบรนด์ออกจากเขียวเป็นคราม (ทำแล้ว — §11.3)
8. รายการล่าสุด: ชื่อซ้ำกับหมวด · ไม่มีเส้นแบ่งวัน (B4 — แก้แล้ว)

### 11.1 บั๊กจริงในโค้ด — B1–B11, B13, B14 แก้แล้ว · B12 แก้แล้ว (PR #61)

| # | อาการ | สถานะ |
|---|---|---|
| **B1** | hero คิด `ใช้ไปแล้ว`/`%` จาก `expense` ซึ่งรวม COGS · ฐานที่ถูกคือ `isBudgetSpendingRow` | ✅ PR #44 |
| **B2** | `Math.max(0, budgetTotal - expense)` clamp ที่ 0 → เกินงบเงียบ | ✅ PR #44 |
| **B3** | legend ตัดที่ 3 slice (วงแหวนวาดครบอยู่แล้ว ผิดที่ legend) | ✅ PR #45 |
| **B4** | หัวแถว `note \|\| category.name` ซ้ำเมื่อ note ว่าง · ไม่มีเส้นแบ่งวัน | ✅ PR #45 |
| **B5** | `totalUsed` รวมหมวดที่ไม่ตั้งงบ → หน้างบแดงถาวร | ✅ PR #47 |
| **B6** | `daysLeft` หน้างบไม่นับวันนี้ ต่างจากหน้าแรก | ✅ PR #47 (`daysLeftInMonth()` ใน `lib/dates.ts` ใช้ร่วม) |
| **B7** | `usedPct = Math.min(100, …)` เกินงบเท่าไหร่แถบก็เต็มเท่ากัน | ✅ PR #47 (แถบสองท่อน) |
| **B8** | ไอคอนกรองไม่มี button/onClick/aria — ปุ่มตาย | ✅ PR #48 (ลบ ย้ายเป็นชิป) |
| **B9** | ช่องค้นหาซ่อนหลังไอคอน | ✅ PR #48 (ค้นหาถาวร) |
| **B10** | ตัวกรองไม่มี "ค้างนาน"/"รอเติมข้อมูล" | ✅ PR #48 (ชิป 5 แบบ + ตัวนับ) |
| **B11** | `label: cat?.name` ป้ายด่วนชื่อซ้ำ แยก "กาแฟ 60"/"กาแฟ 120" ไม่ออก | ✅ PR #51 (`favoriteLabel()`) |
| **B12** | กดป้ายด่วนแล้วโน้ต/กระเป๋าไม่ตามมา | ✅ PR #61 (migration 0014 เพิ่ม `favorites.wallet_id`+`note` · `applyFavorite()` พามาด้วย) |
| **B13** | ป้ายไม่มียอดไม่ล้างยอดเดิม | ✅ PR #51 (`setAmountStr` เขียนทับเสมอ) |
| **B14** | ไอคอน error `text-expense` บนพื้น `bg-ink/92` contrast ตก | ✅ PR #49 (`income-soft`/`expense-soft`) |

> `WalletHero.tsx` (B1/B2) ถูกแทนด้วย `WovenHero` ใน PR #46

### 11.2 คอนเซปต์ฮีโร่ — ป้ายทอคอเสื้อ (woven label)

**หลักการที่ต้องยึด: กิมมิกต้องเผย ไม่ใช่ซ่อน** — ของที่ดูทุกวันต้องเห็นทันทีโดยไม่ต้องกด

**รูปแบบ (ตรวจกับ `src/components/WovenHero.tsx` จริง):**
- ป้ายทอ 3 ใบเย็บที่ตะเข็บเดียว พับซ้อนขึ้น · พื้นผิว `.woven`/`.selvedge` เป็น `background-image` ล้วน (`src/styles/index.css`)
- **ใบหน้าสุดแสดงตัวเลขหลักเต็ม เสมอ** · ใบที่พับอยู่โชว์ **แถบชื่อ (`EYEBROW[key]`) + ตัวเลขย่อ** (`safeMini`/`budgetMini`/กำไรสต็อก) เรนเดอร์แบบ**ไม่มีเงื่อนไข** ทุกใบ
- ลำดับใบ: `SAFE TO SPEND` → `BUDGET` → `STOCK PROFIT`
- ป้ายงบพก chip **"เกินงบ ฿X"** พร้อมไอคอน (ไม่สื่อด้วยสีอย่างเดียว)
- ปุ่ม **ซ่อนยอดเงิน** อยู่บนป้ายใบหน้า SAFE · เปิดแล้ว **ยอด SAFE ถูก mask ทั้งใบหน้าและใบพับ** (`safeBig`/`safeMini` คืน `฿ ••••••`/`••••`) ส่วนหัวข้อยังอยู่ (งบ/กำไรสต็อก **ไม่** ถูก mask — ไม่ใช่ "ยอดเงินคงเหลือ")
- **เรขาคณิต (ยืนยันแล้ว):** `CONTAINER_H 254` · `LABEL_H 158` · `POSITIONS` translateY `96/48/0` · header strip `mt-[7px] h-[34px]` (7+34=41px < 48px ที่ใบพับโผล่พ้น → หัวข้อโผล่พ้นทุกใบ) — มีเทสต์ render ป้องกันการถดถอยใน `WovenHero.test.tsx`

**ข้อยกเว้นกฎ flat:** flat เป็นค่าเริ่มต้นของทุกอย่าง ยกเว้นฮีโร่ป้ายทอที่เป็นข้อยกเว้นที่ตั้งใจ มีได้ที่เดียวต่อหน้า

### 11.3 สีแบรนด์ — คราม (ตรวจกับ `tailwind.config.ts` + `src/styles/index.css`)

ย้ายสีแบรนด์ออกจากเขียว เพราะเขียวถูกจองไว้แล้วโดยความหมาย "เงินเข้า"

- **ค่าคงที่ (literal hex, locked ใน `tailwind.config.ts`):** `brand.DEFAULT #4A57B5` · `brand.fabric #1E2547` · `brand.fabric-budget #4A3A14` · `brand.fabric-stock #2B2E34` · `brand.fabric-income #1E3A2C` · `brand.thread #F3ECDB` · `cat.1–6` + `cat.other`
- **ค่าที่ theming ได้ (ย้ายเป็น CSS variable ตอนทำ dark mode — PR #63):** `brand.deep`/`brand.tint`/`brand.ink` และ semantic (`income`/`expense`/`warn`/neutrals) เป็น `rgb(var(--color-*) / <alpha-value>)` · ค่า light อยู่ใน `:root` (เช่น `--color-brand-deep: 46 60 107` = `#2E3C6B`, `--color-brand-tint: 231 233 244` = `#E7E9F4`, `--color-brand-ink: 42 50 96` = `#2A3260`) · ค่า dark อยู่ใน `html.dark`
- **`theme-color` = สีพื้นแอป (surface) แยกตาม scheme:** `index.html` มี `<meta name="theme-color">` สองตัว (`media="(prefers-color-scheme: light/dark)"`) ค่า `#F6F3EC` / `#17160F` = mirror ของ `--color-surface` light/dark ใน `index.css` · `manifest.theme_color` สลับ scheme ไม่ได้ จึงใช้ค่า light `#F6F3EC` (`vite.config.ts` → `APP_SURFACE_LIGHT`) · **ไม่ใช่สี accent** เพราะแอปมี dark mode ค่าตายตัวค่าเดียวจะผิดในโหมดใดโหมดหนึ่งเสมอ (เดิมเป็นมินต์ `#14B8A6` ของพาเลตต์เก่า — แก้ใน PR นี้)
- `FALLBACK_SLICE_COLORS` ใน `useHome.ts:109` เป็น hex ดิบโดยตั้งใจ (mirror ของ `cat.1–6` ตามคอมเมนต์ใน `tailwind.config.ts`) · `.rack-rail` ใน `index.css` เป็น gradient เหล็กแปรงตกแต่งล้วน (ไม่สื่อความหมาย)

### 11.4 ลำดับงาน — redesign เสร็จครบ

1. PR-A ชั้นตรรกะ (`budgetSpending`/`daysLeft`/`dailyAllowance` + B1/B2) — ✅ #44
2. PR-B B3 legend + B4 เส้นแบ่งวัน — ✅ #45
3. PR-C token คราม ทั้งแอป — ✅ #49
4. PR-D `WovenHero` แทน `WalletHero` — ✅ #46
5. PR-E เอกสาร design-spec + B5–B14 — ✅ #50
6. PR-F หน้างบ (B5/B6/B7) — ✅ #47
7. PR-G หน้าคลัง (B8/B9/B10) — ✅ #48
8. PR-H หน้าเพิ่มรายการ (B11/B13) — ✅ #51
9. PR-I ยุบ `new Date(iso+'T00:00:00')` เป็น helper — ⬜ ยังไม่เริ่ม
10. ถัดจากนั้น: หน้ารับเข้าสต็อก (#55) · คิวสต็อก (#58) · ประวัติ (#59) · ตั้งค่า (#60) · **dark mode (#63 — ทำแล้ว)** · กระดิ่งแจ้งเตือน (#56) · หน้าแรกถอด trend (#64)

**งานใหญ่ถัดไปที่ยังเปิดอยู่:** UI หนี้เพื่อน — ชั้น DB + RPC + ไฟล์ `0015` พร้อมครบแล้ว เหลือหน้า/route (เพิ่มเพื่อนด้วย friend_code · สร้าง/ยืนยัน/ปฏิเสธ/เคลียร์/ย้อนหนี้ · สรุปยอดสุทธิกับเพื่อน)
