# STASH — Project Context

> ไฟล์นี้คือบริบทถาวรของโปรเจกต์ ใช้แทนการอ่าน `docs/PROJECT_AUDIT.md` ฉบับเต็มในงานประจำวัน
> **วิธีใช้:** ทุกข้อความในไฟล์นี้ควรชี้กลับไปที่ไฟล์/บรรทัดจริงได้ ถ้าจุดไหนยังไม่ได้ตรวจ จะเขียนว่า "ยังไม่ได้ตรวจ" ไว้ตรง ๆ ไม่เดา
> **ตรวจครั้งล่าสุดเทียบ repo จริง:** หลัง #72 merge (main `15bd710`) + PR นี้ (แก้บันเดิลค้าง + เขียนเอกสารใหม่) — ประกอบใหม่ทั้งฉบับจากการอ่านโค้ด ไม่ใช่แก้ทีละบรรทัด (การแก้ทีละจุดคือวิธีที่ทำให้มันคลาดมาแต่แรก)

---

## 1. โปรเจกต์นี้คืออะไร

PWA บันทึกรายรับ-รายจ่ายส่วนตัว ที่มีระบบสต็อกสินค้า (เสื้อผ้ามือสอง/ขายต่อ) รวมอยู่ในตัวเดียวกัน

- ผู้ใช้: เจ้าของ + เพื่อนไม่กี่คน **ต่างคนต่างขายของตัวเอง ไม่แชร์คลัง**
- ภาษา: ไทย · สกุลเงิน: THB · เขตเวลา: Asia/Bangkok
- ไม่มีหน้าสมัครสมาชิก — เจ้าของสร้างบัญชีให้ใน Supabase dashboard (มีหน้ากู้รหัสผ่าน `/forgot-password` + `/reset-password`)
- Production: `https://stash-web.morganstuffs.workers.dev` (ชื่อ worker `stash-web` ใน `wrangler.jsonc`)

---

## 2. Stack และสภาพแวดล้อม

Vite 6 · React 18 · TypeScript (strict) · Supabase (Postgres + Auth + Storage) · TanStack Query · PWA (`vite-plugin-pwa`) · deploy บน Cloudflare Workers · Vitest (รวม guard ในเบราว์เซอร์จริงด้วย Playwright + Chromium) · GitHub Actions CI

**ข้อจำกัดสำคัญที่กำหนดวิธีทำงานทั้งหมด:**

- เจ้าของทำงาน**ออนไลน์ล้วน ไม่มีเครื่อง dev** — รันคำสั่ง local ไม่ได้ (AI agent รันให้)
- Migration เป็น **raw SQL รันมือใน Supabase SQL Editor** ไม่มี Supabase CLI ไม่มี migration runner
- AI agent **ต่อ DB ไม่ได้** — ต้องส่ง SQL ให้เจ้าของรันแล้วรายงานผลกลับ
- `supabase gen types` ใช้วิธีดาวน์โหลดจาก dashboard แล้ว paste ทับ `src/lib/database.types.ts`
- **Deploy อัตโนมัติผ่าน Cloudflare Workers Git integration** (build จาก git โดยตรง) — **ห้ามเพิ่ม deploy workflow ใน GitHub Actions** จะกลายเป็นสองทางเดินชนกัน
- CI (`.github/workflows/ci.yml`) รัน `npm ci` → `npm run build` → `npx playwright-core install --with-deps chromium` → `npm test` (build + test ไม่ deploy) — ขั้น chromium มีไว้ให้ guard ในเบราว์เซอร์จริงรันได้ (§9)
- **merged ≠ deployed ≠ สิ่งที่เบราว์เซอร์รันอยู่** — ก่อนไล่บั๊กหน้าจอทุกครั้ง อ่าน version stamp ท้ายหน้าตั้งค่าก่อน (ดู §9, §10)

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
| `src/lib/format.ts` | จัดรูปเงิน/วันที่ (บาท, พ.ศ., `MASKED_BAHT`, `formatBuildStamp` ของ version stamp) |
| `src/lib/dates.ts` | `daysLeftInMonth()`/`formatRecentDayLabel`/`formatUpcomingDayLabel` — helper วันที่กลาง (หน้าแรก/หน้างบใช้ร่วม) |
| `src/lib/catColor.ts` | `catColorVar(colorIndex)` — index หมวด 1–6 → `rgb(var(--color-cat-N))` **ที่เดียวที่แปลง index→สี** |
| `src/lib/spendable.ts` | `computeSpendable(safe, bills, daysLeft)` — บรรทัดรอง SAFE (หักบิล/เกินยอด/ต่อวัน) pure |
| `src/lib/percent.ts` | `largestRemainderPercents()` — % รวมได้ 100 พอดี |
| `src/hooks/useHome.ts` | `computeHomeSummary` + `DonutSlice` (สีมาจาก `color_index` ไม่ใช่ hex — `FALLBACK_SLICE_COLORS` ถูกลบแล้ว) |
| `src/hooks/useUpcomingBills.ts` | บิลรอจ่ายเดือนนี้ + `collectMonthOccurrences` (เดินผ่าน `recurring_next_date` RPC) |
| `src/hooks/useStock.ts` | `computeStockHero` |
| `src/hooks/useBudgets.ts` | `computePace`, `useMonthSpending` |
| `src/components/LedgerRow.tsx` | แถว ledger ใช้ร่วม (แท็บ `ล่าสุด` + `รอจ่าย`) · `LedgerIcon.tsx` = ไอคอนไม่มีกรอบ ระบายสีหมวด |

**ตาราง (14 ตาราง จาก `database.types.ts`):**
`transactions` `categories` `wallets` `budgets` `stock_items` `stock_sales` `stock_sku_config` `recurring` `favorites` `schema_migrations` — **และกลุ่มหนี้เพื่อน:** `debts` `debt_events` `friend_connections` `profiles`

ทุกตาราง RLS เปิด + policy บน `auth.uid() = user_id`
ยกเว้น `schema_migrations`: RLS เปิด · 0 policy · ถอนสิทธิ์ anon/authenticated ทั้งหมด (ตั้งใจ)

> กลุ่มตาราง/RPC หนี้เพื่อน (`debts`/`profiles`/`friend_connections`/`debt_events`) เข้ามากับ `0015_friend_debts.sql` — เป็น**ฟีเจอร์ cross-user ตัวแรก** จึงใช้ security model ต่างจากตารางอื่น (RLS select-only + เขียนผ่าน SECURITY DEFINER RPC ที่เช็คคู่กรณีเอง) ดู §6 และหัวไฟล์ 0015

---

## 4. กฎธุรกิจ — เงิน

1. **ซื้อของเข้าสต็อกไม่ใช่รายจ่าย** — เป็นการแปลงสินทรัพย์ (`is_stock_purchase=true` ตัดออกจากยอดจ่าย)
2. **ขาย = บันทึกสองแถวเสมอ (Model A gross)** — income = ราคาขาย×qty (หมวด `system_key='stock_sale_income'`) · expense = ต้นทุน×qty (`is_stock_cogs=true`, หมวด `stock_cogs`)
3. `safeToSpend = income − expense` — ไม่ต้องมี accumulator แยกสำหรับ COGS
4. **COGS นับใน headline เงินออก + donut ตามปกติ แต่ตัดออกจาก budget** (budget คุมค่าใช้จ่ายส่วนตัว ไม่ใช่ต้นทุนสินค้า)
5. **การจ่ายคืนหนี้ (`is_debt_settlement=true`) เหมือน COGS:** นับใน headline (`isSpendingRow`) แต่ตัดออกจาก budget (`isBudgetSpendingRow` — `src/lib/ledger.ts`)
6. เงินทุกตัว**คำนวณใน SQL เป็น numeric** ห้ามคำนวณใน JS แล้วส่งเข้ามา
7. **ขายขาดทุนได้** — สองแถว ledger ยังเป็นบวก มีแค่ `stock_sales.profit` ที่ติดลบ
8. `cost_at_sale` snapshot ต้นทุน/ชิ้น ณ วันขาย → แก้ `cost_per_unit` ทีหลังไม่กระทบกำไรที่รับรู้ไปแล้ว
9. `sale_date` ห้ามเป็นอนาคต (เทียบเวลาไทย)
10. **วันที่ฝั่ง DB ใช้ `(now() at time zone 'Asia/Bangkok')::date` เสมอ** ห้าม `current_date`
11. **การตัดสินว่ารายการอยู่เดือนไหน ต้องอ่านจาก string `YYYY-MM-DD` ตรง ๆ** ห้ามแปลงเป็น Date object แล้วอ่านค่า
12. **บิลรอจ่าย (recurring ที่ยังไม่ถูกตัด) หักออกจากยอด "ใช้ได้วันละ" — หักเฉพาะรายจ่าย ไม่บวกรายรับ** (`lib/spendable.ts` + `hooks/useUpcomingBills.ts`) · เหตุผลไม่สมมาตรอยู่ที่ §11.5 ข้อ 7
13. **ห้าม clamp ยอดเงินเป็น 0 เงียบ ๆ ทุกที่ที่แสดงเงิน** — ถ้าติดลบ/เกิน ให้บอกตรง ๆ พร้อมไอคอนเตือน (บทเรียน B2 — §11.5 ข้อ 8)

---

## 5. กฎธุรกิจ — สต็อก

- `qty_remaining` / `status` **คำนวณจากจำนวนเสมอ** ห้าม toggle (`sold` เมื่อเหลือ 0 · `partial` เมื่อเหลือ < ทั้งหมด · `in_stock` เมื่อเท่าทั้งหมด)
- `cost_per_unit` และ `qty_total` **ถูกล็อกเมื่อมีการขายแล้ว** (trigger ระดับ DB)
- **transaction ที่ผูกกับ `stock_sales` แก้/ลบตรงไม่ได้** (trigger) ต้องผ่าน `stock_sale_reverse` (ลบแถว `stock_sales` **ก่อน** ลบ transaction — ไม่ใช้ flag)
- รายการจ่ายคืนหนี้ก็มี trigger กันแก้/ลบตรง (`debt_settlement_txn_guard` — `0015` §10) · ย้อนด้วย `debt_settle_reverse` (เคลียร์ `debts.settlement_transaction_id` ก่อนลบ transaction) · แก้ note/wallet ได้ แต่ยอด/ประเภท/วันที่ไม่ได้
- สินค้าที่มีประวัติขาย **ลบไม่ได้** (FK RESTRICT) ต้อง reverse ก่อน
- **SKU สร้างจาก DB ตาม `stock_sku_config` ของแต่ละ user** ตัวนับเดินหน้าอย่างเดียว ห้ามพึ่ง `count(*)` ห้ามรีเซ็ต ห้ามตัดหลัก · สูตรประกอบ SKU อยู่ที่ `stock_sku_build` **ที่เดียว** (ทั้ง intake และ preview เรียกตัวนี้)

---

## 6. RPC ทั้งหมด

**จาก `src/lib/database.types.ts` (`Database['public']['Functions']`) — 23 ตัว:**

สต็อก/ระบบ: `stock_intake_create` · `stock_item_delete` · `stock_sale_create` · `stock_sale_reverse` · `stock_sales_summary` · `stock_sku_build` · `stock_sku_preview` · `seed_defaults` · `seed_defaults_internal` · `recurring_run_due` · `recurring_next_date` · **`pick_category_color_index`** (เพิ่มใน 0016)

หนี้เพื่อน (0015): `debt_create` · `debt_confirm` · `debt_cancel` · `debt_reject` · `debt_settle` · `debt_settle_reverse` · `debt_delete_private` · `friend_debts_summary` · `friend_request_send` · `friend_request_respond` · `generate_friend_code`

ทุกตัว: `security invoker` · `set search_path = ''` · `grant execute to authenticated` · prefix `p_`/`v_`
**ยกเว้นกลุ่มหนี้เพื่อน (0015) = `security definer`** (ตาราง select-only RLS → เขียนแบบ definer + re-check `auth.uid()` ว่าเป็นคู่กรณีในทุกฟังก์ชัน) · `generate_friend_code()` definer + ไม่ grant ให้ role ใด · `friend_debts_summary` invoker · `seed_defaults_internal` definer

> `recurring_next_date(p_from, p_schedule)` คืน**วันถัดไปหลัง `p_from` แบบ strict** (คืน null/ค่าที่ไม่ขยับ = schedule ที่เดินต่อไม่ได้ → `recurring_run_due` ปิดกฎนั้น) — `useUpcomingBills` วนเรียกตัวนี้ ห้ามเขียนตรรกะวันที่ schedule ฝั่ง client (§11.5 ข้อ 3 หลักการเดียวกับ SKU)
> **`set_category_color_index` เป็น trigger ไม่ใช่ RPC** (BEFORE INSERT บน `categories`): ถ้าไม่ส่ง `color_index` มา/ส่ง 0/นอกช่วง → เรียก `pick_category_color_index` เติม slot ว่างให้ ทำให้คอลัมน์ NOT NULL แต่ Insert type ยัง optional (§7)

---

## 7. Seed ของ user ใหม่

`seed_defaults_internal(uid)` สร้างค่าเริ่มต้น · **3 wallets** (ไม่มีคอลัมน์ `balance`) · **1 แถว `stock_sku_config`** (prefix `STZ-` เห็นใน `SettingsPage.tsx`)

**หมวดหมู่ (categories): 13 หมวด** — reproduce ล่าสุดใน **`0016` SECTION 7** (0015 เขียนทับครั้งหนึ่ง แล้ว 0016 เขียนทับอีกครั้งเพื่อใส่ `color_index`) → **ตัวถัดไปต้อง reproduce จาก `0016` ไม่ใช่ 0015**
- expense 9: อาหาร · เดินทาง · ช้อปปิ้ง · บิล/ค่าบ้าน · บันเทิง · เสื้อเข้าร้าน (stock) · รองเท้าเข้าร้าน (stock) · ต้นทุนขายสต็อก (`stock_cogs`) · จ่ายชำระหนี้ (`debt_repayment_expense`)
- income 4: เงินเดือน · ฟรีแลนซ์ · ขายสต็อก (`stock_sale_income`) · ได้รับชำระหนี้ (`debt_repayment_income`)

**`categories` หลัง 0016 (ยืนยันจาก `database.types.ts`):**
- `color_index smallint 1–6 NOT NULL` (DB เลือก slot ว่างก่อนผ่าน trigger — §6) · **`categories.color` ถูก DROP แล้ว** (DB เก็บ "ความหมาย" client เก็บ "หน้าตา" — §11.5 ข้อ 3)
- `icon text NOT NULL default 'tag'` · **ไม่มี check constraint ชื่อไอคอน** (`lib/icons.tsx` fallback เป็นไอคอนป้าย ชื่อผิดเสื่อมสภาพนุ่มนวล — §11.5 ข้อ 4)

| system_key | หมวด | ลบได้ | เห็นในหน้ากรอกมือ |
|---|---|---|---|
| `stock_sale_income` | ขายสต็อก (income) | ไม่ได้ | **เห็น** |
| `stock_cogs` | ต้นทุนขายสต็อก (expense) | ไม่ได้ | ซ่อน |
| `debt_repayment_income` | คืนหนี้ (income) | ไม่ได้ | ซ่อน (มาจาก `debt_settle`) |
| `debt_repayment_expense` | คืนหนี้ (expense) | ไม่ได้ | ซ่อน (มาจาก `debt_settle`) |

**resolve หมวด system ด้วย `system_key` เท่านั้น ห้าม match ด้วยชื่อไทย** — ผู้ใช้เปลี่ยนชื่อหมวดได้ (มีหลักฐานว่าเคยเปลี่ยนจริง) · ยกเว้น backfill ครั้งเดียวใน migration ใช้ชื่อได้
0015 ยัง backfill หมวดคืนหนี้ 2 หมวด + สร้าง `profiles` row (`friend_code` สุ่ม 8 หลัก) ให้ user เดิม · ค้นหาเพื่อน**ไม่ใช้อีเมล** (กันกฎ 16) ใช้ `friend_code`

---

## 8. Convention — กฎที่ห้ามละเมิด

### Migration
1. **ห้ามแก้ไฟล์ migration ที่ apply ไปแล้ว** เขียนไฟล์ใหม่เสมอ
2. ทุกไฟล์จบด้วย `insert into schema_migrations` + `notify pgrst, 'reload schema'`
3. reproduce ฟังก์ชันจาก**เวอร์ชันล่าสุดบน main** (ตอนนี้ = `0016`) ห้ามหยิบจากไฟล์ต้นฉบับ
4. เปลี่ยน signature → `drop function` ด้วย signature จริงจาก DB (**ไม่ใส่ `if exists`**) แล้ว re-grant
5. ตารางใหม่ → enable RLS + 4 policy
6. เจ้าของรันเอง ครอบ `begin; … commit;` และ snapshot ฟังก์ชันเดิมก่อนทับ · **หลังรัน ตรวจว่าไฟล์ `.sql` เข้า main จริง** (§9)

### SQL
7. **`RETURNS TABLE` / OUT param กลายเป็นตัวแปรใน scope** → alias ทุกตาราง qualify ทุกคอลัมน์ (ambiguity เกิดตอน runtime → migration ผ่าน แต่ฟีเจอร์พัง)
8. **Verification ต้องพิสูจน์ว่า "ทำงานได้" ไม่ใช่แค่ "มีอยู่"** — smoke test เรียกฟังก์ชันจริง (0016 มี smoke test insert จริงเช็ค `color_index` ได้ 1–6)
9. เงินคำนวณใน numeric เท่านั้น

### Client
10. **ห้ามมีตรรกะซ้ำสองที่** — แยกเป็นฟังก์ชันกลางแล้ว import (เช่น สี = `catColor.ts` · วันที่ schedule = RPC · แถว ledger = `LedgerRow.tsx` · ขนาดตัวเลขโดนัท = `donutCenterFontSize`)
11. **ห้าม `as unknown as` / `as any` / `@ts-ignore` / `@ts-expect-error`**
12. `database.types.ts` generated ห้ามแก้มือ · alias เขียนเองอยู่ใน `db.ts`
13. **ห้ามใช้คำว่า "ผ่าน" ถ้ายังไม่ได้รัน `npm run build` + `npm test`** (คำสั่งเดียวกับ CI)
14. **จับ error ด้วย code เท่านั้น ห้ามจับด้วย substring**
15. **error hint ใช้ allowlist ห้าม denylist**
16. **ห้ามเผยว่าอีเมลมีบัญชีในระบบหรือไม่** ทุกที่ — กัน user enumeration
17. **error ต้องถึงผู้ใช้** ห้าม catch ว่าง ห้ามกลืนเงียบ
18. ห้าม `new Date('YYYY-MM-DD')` แล้วอ่านค่า (timestamp เต็ม parse ได้ — `formatBuildStamp` เป็นข้อยกเว้นที่มีคอมเมนต์)
19. 1 PR = 1 เรื่อง แตกจาก main ล่าสุด ไม่ stack · เช็คก่อน push ว่า PR ยังเปิดอยู่
20. ตารางที่ PK เป็น `user_id` (เช่น `stock_sku_config`) เบี่ยงจาก pattern โดยตั้งใจ (1 แถว/user)
21. **สีต้องมาจาก token** ห้ามใส่ hex ดิบใหม่ใน `src/` · ค่าใน `index.html`/`vite.config.ts` (`theme-color`/`manifest.theme_color`) ต้อง mirror ค่าจากพาเลตต์พร้อมคอมเมนต์ · dark mode → `theme-color` เป็น**สีพื้นแอป**แยกตาม scheme (ปัจจุบัน hex ดิบใน `src/` เหลือ **4 บรรทัด** = gradient ตกแต่งใน `index.css` เท่านั้น)

---

## 9. กับดักที่เคยเกิดขึ้นจริง — อย่าให้ซ้ำ

| เหตุการณ์ | บทเรียน |
|---|---|
| `create or replace` ตอนเพิ่มพารามิเตอร์ → ฟังก์ชันซ้อน 2 ตัว migration ไม่ error | signature เปลี่ยน = drop ก่อน · verification นับจำนวนนิยาม = 1 |
| `qty_remaining` เป็นทั้ง OUT param และคอลัมน์ → การขายพังตอนกดจริง ทั้งที่ verification ผ่าน | qualify ทุกคอลัมน์ · smoke test ก่อนใช้งานจริง |
| `npm run typecheck` = `tsc --noEmit` บน solution-style tsconfig → **ตรวจ 0 ไฟล์ ผ่านเสมอ** | คำว่า "ผ่าน" ต้องมาจากคำสั่งเดียวกับ CI (`tsc -b && vite build`) |
| `getDate()` บน date-only string → วันที่เลื่อนใน timezone ติดลบ | อ่านวันจาก string ตรง ๆ |
| **ป้ายพับในฮีโร่เป็นแถบเปล่าบน production ทั้งที่โค้ดถูกและเทสต์เขียว** — เพราะ `<button>` จัดกึ่งกลางเนื้อหาเอง (jsdom ไม่จำลอง layout) → header strip ถูกดันลงพ้นระยะ 48px ที่ใบพับโผล่ | เทสต์ที่บอกว่า "ข้อความอยู่ใน DOM" ไม่ได้แปลว่าผู้ใช้เห็น · **เรื่อง layout ต้องตรวจในเบราว์เซอร์จริง** · fix คือ `flex flex-col` บนปุ่ม (load-bearing — `WovenHero.tsx`) |
| **ไล่บั๊กที่ถูกแก้ไปแล้วหลายชั่วโมง สองรอบในวันเดียว** เพราะบันเดิลค้างที่ #66 (version stamp อ่านได้ `994e3a6`) — SW precache เสิร์ฟ `index.html` แบบ cache-first ตรึงทั้งแอปไว้ที่ commit ที่ SW ถูกติดตั้งครั้งแรกพอดี | **merged ≠ deployed ≠ สิ่งที่เบราว์เซอร์รันอยู่** · version stamp คือตัวตัดสิน อ่านมันก่อนเริ่มไล่บั๊กหน้าจอทุกครั้ง · fix = shell แบบ network-first + SW self-activate (§10) |
| `grep -rn "mint-" src/` ว่างมานาน ทุกคนเข้าใจว่า PR-C จบ แต่สีเก่าอยู่ในฐานข้อมูล (`categories.color`) ชุดสีใหม่ไม่เคยขึ้นจอ | การ grep พิสูจน์ได้แค่เรื่องในโค้ด · **ค่าที่ seed ลง DB คือแหล่งความจริงอีกที่ที่ grep มองไม่เห็น** (แก้ที่ #71 + migration 0016) |
| **`0015` รันลง DB แล้วแต่ไฟล์ไม่เคยเข้า main** — PR #65 อ้างว่า apply แต่ diff ไม่มีไฟล์ `.sql` | `schema_migrations` กับ repo ต้องตรงกัน · ตรวจทุกครั้งหลัง migration ว่าไฟล์เข้า main จริง · ห้ามประกอบไฟล์ migration ขึ้นเองจากการอ่าน types |
| push งานเข้า branch หลัง PR ปิดไปแล้ว → commit ค้าง เอกสารบน main ล้าสมัย | เช็คว่า PR เปิดอยู่ก่อน push · PR ที่ merge แล้ว = เริ่ม branch ใหม่จาก main |
| Supabase free tier pause เอง แล้วหน้า login ค้างไม่บอกอะไร | error ต้องถึงผู้ใช้ · `getSession()` ต้องมีตัวดัก |

---

## 10. สถานะปัจจุบัน

**ไฟล์ migration บน main: `0001`–`0016`** (ล่าสุด `0016_category_color_index.sql`)
0010 = timezone · 0011 = SKU config + drop `wallets.balance` · 0012 = ระบบขาย · 0013 = แก้ ambiguous · 0014 = `favorites.wallet_id`+`note` · 0015 = หนี้เพื่อน (tables+RPC+`is_debt_settlement`) · **0016 = `categories.color_index` 1–6 + `pick_category_color_index` + trigger `set_category_color_index` + `icon` not null default `'tag'` + DROP `categories.color` + reproduce `seed_defaults_internal` (13 หมวด)**

**หน้าจริงในแอป (11 ไฟล์ `*Page.tsx` ใน `src/pages/`, 11 เส้นทาง + catch-all `*` ใน `router.tsx`):**
Home `/` · History `/history` · Add `/add` · Stock `/stock` · StockIntake `/stock/intake` · StockQueue `/stock/queue` · Budget `/budget` · Settings `/settings` · Login `/login` · ForgotPassword `/forgot-password` · ResetPassword `/reset-password`

**ทำเสร็จแล้ว (มีในโค้ดจริง):**
- ระบบขายครบวงจร · error ที่ถึงผู้ใช้ · **ชุดทดสอบ 175 เคส / 19 ไฟล์ ใน CI** (Vitest) · types generate จาก DB จริง · หน้ากู้รหัสผ่าน + recovery gate
- **Dark mode** (PR #63) · **กระดิ่งแจ้งเตือนสต็อก** (`useAttention.ts`) · **หน้าคิวสต็อก** · redesign ครบสี่หน้าหลัก + หน้ารอง (§11)
- **สี + ไอคอนปักหมุดต่อหมวด (`color_index`)** — โดนัท + แถวรายการระบายสีจาก slot 1–6 ของหมวด (migration 0016 + client #71) · ตัวเลือกสี/ไอคอนใน `CategoriesManager.tsx`
- **โดนัท: ขยายรูให้ยอดรวมพอดี** (#70) — วง 9 · เรนเดอร์ 90px · บรรทัดเดียว · `donutCenterFontSize` คิดจากคอร์ด
- **บิลรอจ่ายในบรรทัดรอง SAFE + แท็บ `รอจ่าย`** (#72) — `useUpcomingBills` + `spendable.ts` + `LedgerRow` ใช้ร่วม · `PendingItem` เผื่อ `source` ให้หนี้เพื่อน (PR-Y)
- **ชั้นข้อมูลหนี้เพื่อน** (tables + RPC + `0015`) — **แต่ยังไม่มีหน้า/route** (UI ยังไม่ทำ)
- **แก้บันเดิลค้าง (PR นี้):** app shell เสิร์ฟ **network-first** + SW **self-activate** (§ ด้านล่าง)

**ยังไม่ได้ทำ:**
- **UI หนี้เพื่อน** (ตาราง+RPC+0015 พร้อม เหลือหน้า/route ทั้งหมด — เพิ่มเพื่อน · สร้าง/ยืนยัน/เคลียร์/ย้อนหนี้ · สรุปยอดกับเพื่อน) — **งานใหญ่ถัดไป**
- หน้าตั้งค่ารูปแบบ SKU แบบแก้ได้ (ตอนนี้ read-only) + ช่องกรอกตัวย่อแบรนด์ตอนรับของ (`p_brand_code` รับได้แล้ว)
- ยอดเงินคงเหลือรายกระเป๋า (ยังไม่เคาะ — ถ้าทำต้องคำนวณจาก transactions ไม่เก็บค้าง)
- **ใช้งาน offline** — `src/lib/offlineQueue.ts` มีอยู่แต่ **ยังไม่มีไฟล์ไหน import** (ยืนยันด้วย grep) → ทำต่อหรือลบทิ้ง
- ฟีเจอร์ AI (โครงเปล่า — toggle ใน `prefs.ts` เก็บค่าเฉย ๆ)
- ถังขยะ / กู้ข้อมูลที่ลบ + สำรองข้อมูล
- ESLint (ตอนนี้ `npm run lint` = `tsc -b`) · drift check types อัตโนมัติ · post-deploy smoke check เทียบ version stamp (เก็บเป็น PR แยก — มันจับได้แค่เคส deploy ค้าง คนละปัญหากับบันเดิลค้างฝั่ง client)

**Version stamp + กลไก PWA (หลังแก้บันเดิลค้าง):**
- version stamp: ฝัง commit SHA (7 ตัว) + เวลา build ผ่าน `define` ใน `vite.config.ts` (`__COMMIT_SHA__`/`__BUILD_TIME__`, หาจาก `WORKERS_CI_COMMIT_SHA`→…→git→`'dev'`) แสดงท้าย `SettingsPage.tsx` แตะแล้วคัดลอก — **อ่านค่านี้ก่อนไล่บั๊กหน้าจอทุกครั้ง**
- **PWA (แก้ใน PR นี้):** `index.html` ไม่อยู่ใน precache แล้ว + `navigateFallback: undefined` → navigation เสิร์ฟผ่าน `runtimeCaching` แบบ **NetworkFirst** (ออนไลน์ได้ shell ใหม่เสมอ ออฟไลน์ fallback จาก cache) · `skipWaiting`+`clientsClaim` ให้ SW ใหม่ทำงานทันทีโดย**ไม่ reload** (ไม่ทับสิ่งที่พิมพ์ค้าง) → เวอร์ชันใหม่มาถึงตอนเปิดแอปครั้งถัดไปเอง · `PwaUpdater.tsx` เหลือแค่ register SW + โยน error ให้ผู้ใช้ (toast "โหลดใหม่" เดิมถูกถอด — มันไม่เคยยิงให้เจ้าของตลอด 4 merge และ fix ใหม่ไม่พึ่งมัน) · **มี guard เบราว์เซอร์จริงกันบันเดิลค้างซ้ำ** (§9 / `pwa-freshness.visual.test.ts`)

---

## 11. Redesign — เสร็จครบ (สถานะปัจจุบัน ไม่ใช่แผน)

> **เคาะแล้ว:** ฮีโร่ = **ป้ายทอสีเข้ม** · สีแบรนด์ = **คราม** · หน้าแรกตอบ **"เหลือเงินเท่าไหร่"** เป็นหลัก
> ครอบคลุมสี่หน้า: หน้าแรก · หน้างบ · หน้าคลัง · หน้าเพิ่มรายการ — **ครบทั้งสี่แล้ว**
> **เอกสารดีไซน์:** `docs/design/untitled/project/uploads/design-spec-expense-stock-app.md` (สเปก) · `...ui-reference-expense-stock-app.html` · `...Screens.dc.html` (โฟลเดอร์ชื่อจริง `untitled` — export แบบไม่ตั้งชื่อ)
> พาเลตต์จริงอยู่ใน `tailwind.config.ts` + `src/styles/index.css` (ไม่มีโฟลเดอร์ `claude/`)

### 11.1 บั๊กจริงในโค้ด — B1–B14 แก้แล้วทั้งหมด
B1/B2 (hero base = `isBudgetSpendingRow`, ไม่ clamp) #44 · B3 legend ตัด slice #45 · B4 หัวแถวซ้ำ/เส้นแบ่งวัน #45 · B5 `totalUsed` #47 · B6 `daysLeft` นับวันนี้ (`daysLeftInMonth` ใช้ร่วม) #47 · B7 แถบสองท่อน #47 · B8/B9/B10 หน้าคลัง (ชิป+ค้นหาถาวร) #48 · B11 `favoriteLabel()` #51 · B12 favorites `wallet_id`+`note` (0014) #61 · B13 ล้างยอดเดิม #51 · B14 contrast ไอคอน error #49 · `WalletHero.tsx` ถูกแทนด้วย `WovenHero` #46

### 11.2 ฮีโร่ — ป้ายทอคอเสื้อ (woven label)
**หลักการ: กิมมิกต้องเผย ไม่ใช่ซ่อน** — ของที่ดูทุกวันต้องเห็นทันทีโดยไม่ต้องกด (ตรวจกับ `src/components/WovenHero.tsx`)
- ป้ายทอ **3 ใบ ล็อกที่ 3 — ไม่มีใบหนี้เพื่อน** (หนี้จะไปอยู่แท็บ `รอจ่าย` ในอนาคต ไม่ใช่ป้ายใบที่ 4) · พื้นผิว `.woven`/`.selvedge` เป็น `background-image` ล้วน
- ใบหน้าสุดแสดงตัวเลขหลักเต็ม · ใบพับโชว์ `EYEBROW[key]` + ตัวเลขย่อ เรนเดอร์**ไม่มีเงื่อนไข**ทุกใบ · ลำดับ `SAFE TO SPEND` → `BUDGET` → `STOCK PROFIT`
- **`flex flex-col` บนปุ่มป้ายเป็น load-bearing** — `<button>` จัดเนื้อหากึ่งกลางเอง ถ้าไม่มีจะดัน header strip ลงพ้นระยะที่ใบพับโผล่ (บั๊ก "แถบเปล่า" บน production — §9) · ห้ามถอด
- **บรรทัดรอง SAFE หักบิลรอจ่าย:** `computeSpendable` → `เหลืออีก N วัน · หักบิลที่จะมาถึง ฿X · ใช้ได้วันละ ฿Y` · บิลเกินยอด → ไอคอนเตือน + `เกินยอดที่ใช้ได้ ฿Z` (ไม่ติดลบ ไม่ clamp) · ไม่มีบิล = บรรทัดเดิม · **มีบิลจะตัด delta chip ทิ้ง** (บรรทัดรองสองบรรทัดจะชนขอบ 158px — วัดในเบราว์เซอร์จริงแล้ว)
- ปุ่มซ่อนยอดบนใบ SAFE · เปิดแล้ว mask ยอด SAFE + บรรทัดรอง + เงินในแท็บ `รอจ่าย` (หัวข้อ/วันที่ยังอยู่ · งบ/กำไรสต็อกไม่ mask)
- **เรขาคณิต:** `CONTAINER_H 254` · `LABEL_H 158` · `POSITIONS` translateY `96/48/0` · header strip `mt-[7px] h-[34px]` — มี guard เบราว์เซอร์จริง `WovenHero.visual.test.ts` (elementFromPoint) กันถดถอย

### 11.3 สีแบรนด์ — คราม + สีหมวดต่อ slot
ย้ายสีแบรนด์ออกจากเขียว เพราะเขียวถูกจองโดยความหมาย "เงินเข้า" (§11.5 ข้อ 1) · ตรวจกับ `tailwind.config.ts` + `src/styles/index.css`
- **literal hex (locked ใน `tailwind.config.ts`):** `brand.DEFAULT #4A57B5` · `brand.fabric #1E2547` · `-budget #4A3A14` · `-stock #2B2E34` · `-income #1E3A2C` · `brand.thread #F3ECDB`
- **`cat.1–6` + `cat.other`** เป็น `rgb(var(--color-cat-N) / <alpha-value>)` (ค่า RGB triplet ใน `:root` + override `--color-cat-1` ใน `html.dark`) — **สีหมวดมาจาก `categories.color_index` ผ่าน `catColorVar()` ที่เดียว** · `FALLBACK_SLICE_COLORS` (hex ดิบใน `useHome`) **ถูกลบแล้ว**
- theming ได้: `brand.deep`/`brand.tint`/`brand.ink` + semantic เป็น CSS variable (light ใน `:root`, dark ใน `html.dark`)
- `theme-color` = สีพื้นแอปแยกตาม scheme (`#F6F3EC`/`#17160F` mirror `--color-surface`) · `manifest.theme_color` ใช้ค่า light (`APP_SURFACE_LIGHT`) — สลับ scheme ไม่ได้ · hex ดิบใน `src/` เหลือแค่ gradient ตกแต่งใน `index.css` (4 บรรทัด)

### 11.4 โดนัท (`src/components/charts.tsx`)
- วง `DONUT_STROKE 9` · `DONUT_RENDER_PX 90` · ตัวเลขรวม **บรรทัดเดียว** อยู่คอร์ดกว้างสุด (ตัด "รวม" ทิ้ง — การ์ดมีหัวข้อ "หมวดใช้จ่าย" แล้ว)
- `donutCenterFontSize(charCount)` = **แหล่งเดียว**ที่ตัดสินขนาด คิดจากคอร์ดที่ระดับข้อความ (`F ≤ 2r/√((k·chars)²+1)`) — ห้ามย่อฟอนต์เงียบ ๆ ถ้าไม่ผ่านเกณฑ์ (ปฏิเสธทาง `฿1.23M` และย้ายเลขออกจากรู — §11.5 ข้อ 5) · guard `charts.visual.test.ts` เช็คทุกมุมกล่องอยู่ในรัศมีใน
- `largestRemainderPercents()` (`lib/percent.ts`) — legend % รวมได้ 100 · สี slice จาก `color_index` · **ห้ามแตะทั้งคู่**

### 11.5 การตัดสินใจสำคัญ — ทำไม (โค้ดบอก "ทำอะไร" เอกสารบอก "ทำไม")
กู้จากการอ่านไฟล์ไม่ได้ — บันทึกไว้:
1. **สีแบรนด์ย้ายออกจากเขียว** เพราะในแอปการเงินเขียวถูกจองโดย "เงินเข้า" แล้ว — สีเดียวทำสองหน้าที่คือรากของ audit ข้อ 7
2. **สีหมวดปักหมุดต่อหมวด (`color_index`) ไม่เรียงตามยอด** — กลับคำจากที่เคยตัดสิน เพราะสีไปโผล่สองที่ (โดนัท + แถวรายการ) ถ้าเรียงตามยอดสีจะสลับทุกเดือนจำไม่ได้
3. **DB เก็บความหมาย client เก็บหน้าตา** — หลักการเดียวกับ `computePace()` คืน `status` ไม่ใช่สี · เปลี่ยนพาเลตต์ครั้งหน้าไม่ต้องแตะ DB (สีอยู่ที่ CSS var) · เดียวกับ schedule-date ที่ DB เป็นเจ้าของ (`recurring_next_date`)
4. **`icon` ไม่มี check constraint** เพราะ `lib/icons.tsx` fallback เป็นไอคอนป้าย ชื่อผิดเสื่อมสภาพนุ่มนวล · ใส่ constraint = ต้องเขียน migration ทุกครั้งที่เพิ่มไอคอน
5. **โดนัท: ขยายรู ไม่ย่อตัวเลข** — ปฏิเสธทางย่อหน่วย (`฿1.23M`) และย้ายเลขออกจากรู
6. **หน้าแรกตอบ "เหลือเงินเท่าไหร่" งบเป็นป้ายใบที่สอง** — และ**ห้ามเพิ่มพาดหัวที่สองที่ตอบคำถามเดียวกัน** (audit ข้อ 1 กลับมา)
7. **บิลรอจ่าย: หักเฉพาะรายจ่าย ไม่บวกรายรับ** — ไม่สมมาตรโดยตั้งใจ เพราะบวกรายรับที่ยังไม่เข้า = ชวนใช้เงินที่ยังไม่มี (ความผิดพลาดสองทางราคาไม่เท่ากัน)
8. **ห้าม clamp เป็น 0 เงียบ ๆ ทุกที่ที่แสดงเงิน** — บทเรียน B2 บนป้ายงบ ตอนนี้บังคับกับบรรทัด spendable ด้วย (เกินยอด → บอกตรง ๆ + ไอคอน)
9. **texture + เงา = ข้อยกเว้นเฉพาะป้ายทอ มีได้ที่เดียวต่อหน้า** (flat เป็นค่าเริ่มต้นของทุกอย่างอื่น) · **motion มาจาก token เท่านั้น + `motion-reduce` บังคับ**
10. **โมเมนต์ (เดือนใหม่ / ขายครั้งแรก) เก็บผ่าน `prefs.ts` ห้ามเรียก `localStorage` ตรง** และห้ามยิงตอนเปิดแอปครั้งแรกของบัญชี (`useHomeMoments.ts`)

**งานใหญ่ถัดไปที่ยังเปิดอยู่:** UI หนี้เพื่อน — ชั้น DB + RPC + `0015` พร้อมครบ เหลือหน้า/route (เพิ่มเพื่อนด้วย `friend_code` · สร้าง/ยืนยัน/ปฏิเสธ/เคลียร์/ย้อนหนี้ · สรุปยอดสุทธิ) · แท็บ `รอจ่าย` ออกแบบ `PendingItem` (วันที่·ป้าย·เงิน·ไอคอน·`source`) เผื่อรับ `source:'debt'` ไว้แล้ว
