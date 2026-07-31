# STASH — Project Context

> ไฟล์นี้คือบริบทถาวรของโปรเจกต์ ใช้แทนการอ่าน `docs/PROJECT_AUDIT.md` ฉบับเต็มในงานประจำวัน
> **วิธีใช้:** ทุกข้อความในไฟล์นี้ควรชี้กลับไปที่ไฟล์จริงได้ ถ้าจุดไหนยังไม่ได้ตรวจ จะเขียนว่า "ยังไม่ได้ตรวจ" ไว้ตรง ๆ ไม่เดา
> **ตรวจครั้งล่าสุดเทียบ repo จริง:** หลัง #87 merge (main `7677c9c`, migration ล่าสุด `0021`) — **ประกอบใหม่ทั้งฉบับจากการอ่านโค้ด/SQL จริง ไม่ใช่แก้ทีละบรรทัด** เพราะการแพตช์ทีละจุดคือวิธีที่ทำให้เอกสารคลาดจากของจริงมาแต่แรก (เคยเขียนว่า UI ยอดค้างยังไม่ทำและ migration หยุดที่ 0016 ทั้งที่ทำจบถึง 0021 แล้ว)

---

## 1. โปรเจกต์นี้คืออะไร

PWA บันทึกรายรับ-รายจ่ายส่วนตัว ที่มีระบบสต็อกสินค้า (เสื้อผ้ามือสอง/ขายต่อ) + ระบบ **ยอดค้างกับเพื่อน** รวมอยู่ในตัวเดียวกัน

- ผู้ใช้: เจ้าของ + เพื่อนไม่กี่คน **ต่างคนต่างขายของตัวเอง ไม่แชร์คลัง** · ยอดค้างเป็นฟีเจอร์ cross-user ตัวเดียวในแอป
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
- `database.types.ts` regenerate ผ่าน **workflow `types-drift`** (`supabase gen types` บน CI) เปิด PR ให้ ไม่ paste มือ (ดู §2.1 + §9)
- **Deploy อัตโนมัติผ่าน Cloudflare Workers Git integration** (build จาก git โดยตรง) — **ห้ามเพิ่ม deploy workflow ใน GitHub Actions** จะกลายเป็นสองทางเดินชนกัน
- **merged ≠ deployed ≠ สิ่งที่เบราว์เซอร์รันอยู่** — ก่อนไล่บั๊กหน้าจอทุกครั้ง อ่าน version stamp ท้ายหน้าตั้งค่าก่อน (§9, §10)

### 2.1 GitHub workflows (`.github/workflows/` — 2 ตัว)

| ไฟล์ | trigger | ทำอะไร | secret |
|---|---|---|---|
| `ci.yml` | push→main + ทุก PR | `npm ci` → `npm run build` (`tsc -b && vite build`) → `npx playwright-core install --with-deps chromium` → `npm test` (`vitest run`) · Node 22 · **ไม่ deploy** · ขั้น chromium มีไว้ให้ guard เบราว์เซอร์จริงรันได้ (§9) | **ไม่ใช้ secret เลย** (เทสต์ใช้ dummy Supabase env จาก `vitest.config.ts`) |
| `types-drift.yml` | cron `0 18 * * *` (01:00 ไทย) + `workflow_dispatch` | รัน `supabase gen types` เทียบกับ `src/lib/database.types.ts` · ถ้า drift → เปิด/อัปเดต PR บน branch เดียว `automation/database-types-drift` (label `types-drift`) ผ่าน `peter-evans/create-pull-request@v6` · **ไม่แตะ main ตรง ๆ** | `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID` (project ref) · optional `GH_PAT` (ถ้าไม่มี ใช้ `GITHUB_TOKEN` แต่จะ trigger `ci.yml` ต่อไม่ได้) |

> **ลำดับที่ถูกเมื่อ migration เปลี่ยน/เพิ่ม signature ของ RPC ที่ client เรียก:** ห้าม merge PR `types-drift` เดี่ยว — types ใหม่จะไม่ตรงกับ call site เก่า → `tsc` ล้ม → main แดง ดึงไฟล์ `database.types.ts` จาก branch นั้นเข้า branch ฟีเจอร์ (`git checkout origin/automation/database-types-drift -- src/lib/database.types.ts`) แล้ว **merge ทีเดียวพร้อม call site** · รอบถัดไป PR `types-drift` จะไม่มี diff เอง (`0020` พลาดข้อนี้ · `0021` ทำถูกแล้ว — §9)

---

## 3. โครงสร้าง

```
DB (tables + RPC + trigger)  →  lib/ (pure function)  →  hooks/ (TanStack Query)  →  UI
```

ตรรกะที่แตะเงิน อยู่ใน SQL หรือใน pure function ใน `lib/` เท่านั้น **ห้าม inline ใน component**

**ไฟล์ที่ต้องรู้จัก:**

| ไฟล์ | หน้าที่ |
|---|---|
| `src/lib/database.types.ts` | **generated — ห้ามแก้มือ** (มาจาก workflow `types-drift`) |
| `src/lib/db.ts` | type alias ระดับแอป (derive จาก generated) รวม `Profile`/`FriendConnection`/`Debt`/`DebtEvent`/`FriendDebtsSummary` |
| `src/lib/ledger.ts` | predicate กลาง: `isSpendingRow`/`isBudgetSpendingRow` (`is_debt_settlement`) + **`lockedRowInfo()`** แนวคิด "แถวล็อก" ที่เดียว (§5, §11.5-13) |
| `src/lib/debtsSummary.ts` | pure function สรุปยอดค้าง: `computeDebtsHeadline` (หน้ารวม) + `computeFriendLedger` (รายคน) — จัดกลุ่มยอด ห้ามรวมข้ามกลุ่ม (§11.6) |
| `src/lib/errors.ts` | แปลง error เป็นข้อความผู้ใช้ ที่เดียว — จับด้วย code/status ไม่จับ substring · **ข้อความที่มีอักษรไทยอยู่แล้วถูกส่งผ่านตรง ๆ** (`errors.ts:86-87`) |
| `src/lib/username.ts` | กติกา username ฝั่ง client (`USERNAME_RE = /^[a-z0-9_]{3,20}$/`) mirror CHECK ใน DB (0020) |
| `src/lib/format.ts` | จัดรูปเงิน/วันที่ (บาท, พ.ศ., `MASKED_BAHT`, `formatBuildStamp` ของ version stamp) |
| `src/lib/dates.ts` | `daysLeftInMonth()`/`formatRecentDayLabel`/`formatUpcomingDayLabel` — helper วันที่กลาง |
| `src/lib/catColor.ts` | `catColorVar(colorIndex)` — index หมวด 1–6 → CSS var **ที่เดียวที่แปลง index→สี** |
| `src/lib/spendable.ts` | `computeSpendable(safe, bills, daysLeft)` — บรรทัดรอง SAFE pure |
| `src/lib/percent.ts` | `largestRemainderPercents()` — % รวมได้ 100 พอดี |
| `src/hooks/useHome.ts` | `computeHomeSummary` + `DonutSlice` (สีมาจาก `color_index` ไม่ใช่ hex) |
| `src/hooks/useUpcomingBills.ts` | บิลรอจ่ายเดือนนี้ + `collectMonthOccurrences` (เดินผ่าน `recurring_next_date` RPC) |
| `src/hooks/useFriends.ts` | ชั้นข้อมูลยอดค้าง — query + mutation hook ทั้งหมด (เขียนผ่าน RPC เว้น display_name/username) |
| `src/components/LedgerRow.tsx` | แถว ledger ใช้ร่วม (แท็บ `ล่าสุด`/`รอจ่าย`/ประวัติ) · รับ prop `locked` → ไอคอนกุญแจ `IconLock` |

**ตาราง (14 ตาราง จาก `database.types.ts`):**
`transactions` `categories` `wallets` `budgets` `stock_items` `stock_sales` `stock_sku_config` `recurring` `favorites` `schema_migrations` — **และกลุ่มยอดค้าง:** `debts` `debt_events` `friend_connections` `profiles`

ทุกตาราง RLS เปิด + policy บน `auth.uid() = user_id`
ยกเว้น `schema_migrations`: RLS เปิด · 0 policy · ถอนสิทธิ์ anon/authenticated ทั้งหมด (ตั้งใจ · สร้างใน `0011`)

> กลุ่มตาราง/RPC ยอดค้าง (`debts`/`profiles`/`friend_connections`/`debt_events`) เข้ามากับ `0015_friend_debts.sql` — เป็น**ฟีเจอร์ cross-user ตัวแรก** จึงใช้ security model ต่างจากตารางอื่น (RLS select-only + เขียนผ่าน SECURITY DEFINER RPC ที่เช็คคู่กรณีเอง) ดู §6, §11.6 และหัวไฟล์ 0015

---

## 4. กฎธุรกิจ — เงิน

1. **ซื้อของเข้าสต็อกไม่ใช่รายจ่าย** — เป็นการแปลงสินทรัพย์ (`is_stock_purchase=true` ตัดออกจากยอดจ่าย)
2. **ขาย = บันทึกสองแถวเสมอ (Model A gross)** — income = ราคาขาย×qty (หมวด `system_key='stock_sale_income'`) · expense = ต้นทุน×qty (`is_stock_cogs=true`, หมวด `stock_cogs`)
3. `safeToSpend = income − expense` — ไม่ต้องมี accumulator แยกสำหรับ COGS
4. **COGS นับใน headline เงินออก + donut ตามปกติ แต่ตัดออกจาก budget** (budget คุมค่าใช้จ่ายส่วนตัว ไม่ใช่ต้นทุนสินค้า)
5. **การเคลียร์ยอดค้าง (`is_debt_settlement=true`) เหมือน COGS:** นับใน headline (`isSpendingRow`/income) แต่ตัดออกจาก budget (`isBudgetSpendingRow` — `src/lib/ledger.ts`)
6. เงินทุกตัว**คำนวณใน SQL เป็น numeric** ห้ามคำนวณใน JS แล้วส่งเข้ามา (แต่ **รวมยอดเพื่อแสดงผล** ใน pure function ของ `lib/` ได้ เช่น `computeHomeSummary`/`computeFriendLedger` — ห้ามเขียนกลับ DB)
7. **ขายขาดทุนได้** — สองแถว ledger ยังเป็นบวก มีแค่ `stock_sales.profit` ที่ติดลบ
8. `cost_at_sale` snapshot ต้นทุน/ชิ้น ณ วันขาย → แก้ `cost_per_unit` ทีหลังไม่กระทบกำไรที่รับรู้ไปแล้ว
9. `sale_date` ห้ามเป็นอนาคต (เทียบเวลาไทย)
10. **วันที่ฝั่ง DB ใช้ `(now() at time zone 'Asia/Bangkok')::date` เสมอ** ห้าม `current_date`
11. **การตัดสินว่ารายการอยู่เดือนไหน ต้องอ่านจาก string `YYYY-MM-DD` ตรง ๆ** ห้ามแปลงเป็น Date object แล้วอ่านค่า
12. **บิลรอจ่ายหักออกจากยอด "ใช้ได้วันละ" — หักเฉพาะรายจ่าย ไม่บวกรายรับ** (`lib/spendable.ts` + `hooks/useUpcomingBills.ts`) · เหตุผลไม่สมมาตรที่ §11.5 ข้อ 7
13. **ห้าม clamp ยอดเงินเป็น 0 เงียบ ๆ ทุกที่ที่แสดงเงิน** — ถ้าติดลบ/เกิน ให้บอกตรง ๆ พร้อมไอคอนเตือน (§11.5 ข้อ 8)

---

## 5. กฎธุรกิจ — สต็อก + แถวที่ล็อก

- `qty_remaining` / `status` **คำนวณจากจำนวนเสมอ** ห้าม toggle (`sold` เมื่อเหลือ 0 · `partial` เมื่อเหลือ < ทั้งหมด · `in_stock` เมื่อเท่าทั้งหมด)
- `cost_per_unit` และ `qty_total` **ถูกล็อกเมื่อมีการขายแล้ว** (trigger ระดับ DB)
- **SKU สร้างจาก DB ตาม `stock_sku_config` ของแต่ละ user** ตัวนับเดินหน้าอย่างเดียว ห้ามพึ่ง `count(*)` ห้ามรีเซ็ต · สูตรประกอบ SKU อยู่ที่ `stock_sku_build` **ที่เดียว** (intake + preview เรียกตัวเดียวกัน)
- สินค้าที่มีประวัติขาย **ลบไม่ได้** (FK RESTRICT) ต้อง reverse ก่อน

**แนวคิด "แถวที่ล็อก" — รวมที่ `lib/ledger.ts` `lockedRowInfo(r)` ที่เดียว:** แถวใน ledger บางประเภทแก้/ลบตรงไม่ได้เพราะผูกกับสิ่งอื่น มี trigger กันที่ DB และ UI ต้องบอกผู้ใช้ว่า "ล็อกไหม/เพราะอะไร/ไปย้อนที่ไหน" — `lockedRowInfo` คืน `{ kind, dateEditable, reason, actionLabel, actionTo }` ครอบ 3 ชนิด:

| kind | เงื่อนไข | แก้วันที่ได้ | ไปย้อนที่ |
|---|---|---|---|
| `stock_purchase` | `is_stock_purchase` | **ได้** | `/stock` |
| `stock_sale` | `isSaleLinkedRow(r)` (แถวที่ผูก `stock_sales`) | ไม่ได้ | `/stock` |
| `debt_settlement` | `is_debt_settlement` | ไม่ได้ | `/debts` |

- แถวขายสต็อกแก้/ลบตรงไม่ได้ (trigger) ต้องผ่าน `stock_sale_reverse` (ลบแถว `stock_sales` **ก่อน** ลบ transaction) · แถวเคลียร์ยอดก็มี trigger กัน (`debt_settlement_txn_guard` — 0015) · ย้อนด้วย `debt_settle_reverse` · ทั้งคู่ **แก้ note/wallet ได้ แต่ยอด/ประเภท/วันที่ไม่ได้**
- **เพิ่มชนิดล็อกใหม่ → แก้ที่เดียว:** เพิ่มใน union `LockedKind` + เพิ่ม 1 branch ใน `lockedRowInfo()` (`ledger.ts`) แล้วทุกหน้า (Home/History/ชีตแก้ไข) รับไปเอง · `LedgerRow` โชว์ไอคอนกุญแจจาก prop `locked` (ไอคอน ไม่พึ่งสีอย่างเดียว)

---

## 6. RPC ทั้งหมด

**จาก `src/lib/database.types.ts` (`Database['public']['Functions']`) — 25 ตัว:**

สต็อก/ระบบ (12): `stock_intake_create` · `stock_item_delete` · `stock_sale_create` · `stock_sale_reverse` · `stock_sales_summary` · `stock_sku_build` · `stock_sku_preview` · `seed_defaults` · `seed_defaults_internal` · `recurring_run_due` · `recurring_next_date` · `pick_category_color_index` (0016)

ยอดค้าง (13): `debt_create` (0015 · cast enum แก้ 0019) · `debt_confirm` · `debt_reject` · `debt_cancel` (reproduce 0018) · `debt_settle` · **`debt_settle_many` (0021)** · `debt_settle_reverse` · **`debt_share_private` (0018)** · `debt_delete_private` · `friend_debts_summary` (แยก private/shared 0017) · `friend_request_send` (`p_username` 0020) · `friend_request_respond` · `generate_friend_code` (เลิกใช้ · §11.5-14)

- ส่วนใหญ่: `security invoker` · `set search_path = ''` · `grant execute to authenticated` · prefix `p_`/`v_`
- **กลุ่มยอดค้างที่เขียนข้อมูล (0015+) = `security definer`** (ตาราง select-only RLS → เขียนแบบ definer + re-check `auth.uid()` ว่าเป็นคู่กรณีในทุกฟังก์ชัน) · `friend_debts_summary` = invoker (อ่านอย่างเดียว) · `generate_friend_code()` = definer + ไม่ grant ให้ role ใด · `seed_defaults_internal` = definer

> `recurring_next_date(p_from, p_schedule)` คืน**วันถัดไปหลัง `p_from` แบบ strict** — `useUpcomingBills` วนเรียกตัวนี้ ห้ามเขียนตรรกะวันที่ schedule ฝั่ง client (§11.5-3 หลักการเดียวกับ SKU)
> **`set_category_color_index` เป็น trigger ไม่ใช่ RPC** (BEFORE INSERT บน `categories`): ไม่ส่ง `color_index`/ส่ง 0/นอกช่วง → เรียก `pick_category_color_index` เติม slot ว่าง (คอลัมน์ NOT NULL แต่ Insert type ยัง optional — §7)
> **ทุก RPC ที่แก้ข้อมูลต้อง "ถูกเรียกจริง" ถึงจะพิสูจน์แล้ว** — `debt_create` มีบั๊ก cast enum มาตั้งแต่ 0015 แต่ผ่าน verification ทุกครั้งเพราะไม่มี UI เรียก จับได้ตอนต่อ UI จริง (แก้ 0019) → smoke test ต้อง**เรียกฟังก์ชันจริงและ assert ผล** ไม่ใช่แค่เช็คว่ามีอยู่ (§9)

---

## 7. Seed ของ user ใหม่

`seed_defaults_internal(uid)` สร้างค่าเริ่มต้น · **3 wallets** (ไม่มีคอลัมน์ `balance`) · **1 แถว `stock_sku_config`** · **1 แถว `profiles`** (`display_name` จากชื่อก่อน `@` ของอีเมล · `friend_code` สุ่มผ่าน `generate_friend_code()` · **`username` = null** ตั้งเองทีหลัง)

**หมวดหมู่ (categories): 13 หมวด** — reproduce ล่าสุดใน **`0017_debts_summary_visibility.sql` SECTION 2** (0015→0016→0017 เขียนทับต่อกัน) → **ตัวถัดไปต้อง reproduce จาก `0017` ไม่ใช่ 0016** คอลัมน์ที่ seed: `user_id, name, kind, is_stock_category, is_system, system_key, icon, color_index, sort_order`
- expense 9: อาหาร · เดินทาง · ช้อปปิ้ง · บิล/ค่าบ้าน · บันเทิง · เสื้อเข้าร้าน (stock) · รองเท้าเข้าร้าน (stock) · ต้นทุนขายสต็อก (`stock_cogs`) · **จ่ายคืนเพื่อน (`debt_repayment_expense`)**
- income 4: เงินเดือน · ฟรีแลนซ์ · ขายสต็อก (`stock_sale_income`) · **ได้รับคืนจากเพื่อน (`debt_repayment_income`)**

> **ชื่อหมวดยอดค้างถูกเปลี่ยนใน 0017 ให้เลี่ยงคำว่า "หนี้"** — เดิม 0015/0016 คือ "จ่ายชำระหนี้"/"ได้รับชำระหนี้" ตอนนี้เป็น "จ่ายคืนเพื่อน"/"ได้รับคืนจากเพื่อน" (§11.5-14) · **แต่ข้อความ error ในตัว RPC 0015 ยังใช้คำว่า "หนี้/เจ้าหนี้/ลูกหนี้" อยู่** = หนี้ที่รู้ตัว (§10)

**`categories` (หลัง 0016, ยืนยันจาก `database.types.ts`):**
- `color_index smallint 1–6 NOT NULL` (DB เลือก slot ว่างก่อนผ่าน trigger — §6) · **`categories.color` ถูก DROP แล้ว** (DB เก็บ "ความหมาย" client เก็บ "หน้าตา" — §11.5-3)
- `icon text NOT NULL default 'tag'` · **ไม่มี check constraint ชื่อไอคอน** (`lib/icons.tsx` fallback เป็นไอคอนป้าย — §11.5-4)

| system_key | หมวด | ลบได้ | เห็นในหน้ากรอกมือ |
|---|---|---|---|
| `stock_sale_income` | ขายสต็อก (income) | ไม่ได้ | **เห็น** (เผื่อขายนอกระบบสต็อก) |
| `stock_cogs` | ต้นทุนขายสต็อก (expense) | ไม่ได้ | ซ่อน |
| `debt_repayment_income` | ได้รับคืนจากเพื่อน (income) | ไม่ได้ | ซ่อน (มาจาก `debt_settle`) |
| `debt_repayment_expense` | จ่ายคืนเพื่อน (expense) | ไม่ได้ | ซ่อน (มาจาก `debt_settle`) |

**resolve หมวด system ด้วย `system_key` เท่านั้น ห้าม match ด้วยชื่อไทย** — ผู้ใช้เปลี่ยนชื่อหมวดได้ · ยกเว้น backfill ครั้งเดียวใน migration ใช้ชื่อได้ · การกรองหมวดยอดค้างออกจากหน้ากรอกมืออยู่ที่ `AddPage.tsx` (กรอง `stock_cogs`/`debt_repayment_income`/`debt_repayment_expense`)

---

## 8. Convention — กฎที่ห้ามละเมิด

### Migration
1. **ห้ามแก้ไฟล์ migration ที่ apply ไปแล้ว** เขียนไฟล์ใหม่เสมอ
2. ทุกไฟล์จบด้วย `insert into schema_migrations` + `notify pgrst, 'reload schema'`
3. reproduce ฟังก์ชัน/seed จาก**เวอร์ชันล่าสุดบน main** (seed ตอนนี้ = `0017`) ห้ามหยิบจากไฟล์ต้นฉบับ
4. เปลี่ยน signature → `drop function` ด้วย signature จริงจาก DB (**ไม่ใส่ `if exists`**) แล้ว re-grant
5. ตารางใหม่ → enable RLS + policy
6. เจ้าของรันเอง ครอบ `begin; … commit;` และ snapshot ฟังก์ชันเดิมก่อนทับ · **หลังรัน ตรวจว่าไฟล์ `.sql` เข้า main จริง** (§9)

### SQL
7. **`RETURNS TABLE` / OUT param กลายเป็นตัวแปรใน scope** → alias ทุกตาราง qualify ทุกคอลัมน์ (ambiguity เกิดตอน runtime → migration ผ่าน แต่ฟีเจอร์พัง)
8. **Verification ต้องพิสูจน์ว่า "ทำงานได้" ไม่ใช่แค่ "มีอยู่"** — smoke test เรียกฟังก์ชันจริงใน `begin;…rollback;` (impersonate ด้วย `request.jwt.claims`) แล้ว assert ผล (§9)
9. เงินคำนวณใน numeric เท่านั้น

### Client
10. **ห้ามมีตรรกะซ้ำสองที่** — แยกเป็นฟังก์ชันกลางแล้ว import (สี = `catColor.ts` · วันที่ schedule = RPC · แถว ledger = `LedgerRow.tsx` · แถวล็อก = `ledger.ts` `lockedRowInfo` · ขนาดตัวเลขโดนัท = `donutCenterFontSize`)
11. **ห้าม `as unknown as` / `as any` / `@ts-ignore` / `@ts-expect-error`**
12. `database.types.ts` generated ห้ามแก้มือ · alias เขียนเองอยู่ใน `db.ts`
13. **ห้ามใช้คำว่า "ผ่าน" ถ้ายังไม่ได้รัน `npm run build` + `npm test`** (คำสั่งเดียวกับ CI)
14. **จับ error ด้วย code เท่านั้น ห้ามจับด้วย substring** · error hint ใช้ allowlist ห้าม denylist
15. **ห้ามเผยว่าอีเมลมีบัญชีในระบบหรือไม่** ทุกที่ — กัน user enumeration · **ค้นหาเพื่อนใช้ `username` ไม่ใช่อีเมล**
16. **error ต้องถึงผู้ใช้** ห้าม catch ว่าง ห้ามกลืนเงียบ
17. ห้าม `new Date('YYYY-MM-DD')` แล้วอ่านค่า (`formatBuildStamp` เป็นข้อยกเว้นที่มีคอมเมนต์)
18. 1 PR = 1 เรื่อง แตกจาก main ล่าสุด ไม่ stack · เช็คก่อน push ว่า PR ยังเปิดอยู่ · PR ที่ merge แล้ว = เริ่ม branch ใหม่จาก main
19. **สีต้องมาจาก token** ห้ามใส่ hex ดิบใหม่ใน `src/` · ค่าสีจริงเป็นแหล่งความจริงที่ `tailwind.config.ts` + `src/styles/index.css` เท่านั้น **ห้ามคัดลอกเลข hex มาไว้ที่อื่น (รวมถึงเอกสารนี้)** · `theme-color`/`manifest.theme_color` ต้อง mirror ค่าจากพาเลตต์พร้อมคอมเมนต์
20. **คำที่ห้ามบนหน้าจอ** (§11.5-14): หนี้ · เจ้าหนี้ · ลูกหนี้ · เรียกเก็บ · ทวง — ชื่อในฐานข้อมูล/โค้ดยังเป็น `debt*` ตั้งใจ

---

## 9. กับดักที่เคยเกิดขึ้นจริง — อย่าให้ซ้ำ

| เหตุการณ์ | บทเรียน |
|---|---|
| `create or replace` ตอนเพิ่มพารามิเตอร์ → ฟังก์ชันซ้อน 2 ตัว migration ไม่ error | signature เปลี่ยน = drop ก่อน · verification นับจำนวนนิยาม = 1 |
| `qty_remaining` เป็นทั้ง OUT param และคอลัมน์ → การขายพังตอนกดจริง ทั้งที่ verification ผ่าน | qualify ทุกคอลัมน์ · smoke test ก่อนใช้งานจริง |
| `npm run typecheck` = `tsc --noEmit` บน solution-style tsconfig → **ตรวจ 0 ไฟล์ ผ่านเสมอ** | คำว่า "ผ่าน" ต้องมาจากคำสั่งเดียวกับ CI (`tsc -b && vite build` + `vitest run`) |
| `getDate()` บน date-only string → วันที่เลื่อนใน timezone ติดลบ | อ่านวันจาก string ตรง ๆ |
| **ป้ายพับในฮีโร่เป็นแถบเปล่าบน production ทั้งที่โค้ดถูกและเทสต์ jsdom เขียว** — `<button>` จัดกึ่งกลางเนื้อหาเอง (jsdom ไม่จำลอง layout) ดัน header strip พ้นระยะที่ใบพับโผล่ | **เทสต์ jsdom ที่บอกว่า "ข้อความอยู่ใน DOM" ไม่ได้แปลว่าผู้ใช้เห็น · เรื่อง layout ต้องตรวจในเบราว์เซอร์จริง** · fix = `flex flex-col` บนปุ่ม (load-bearing, `WovenHero.tsx`) |
| **ไล่บั๊กที่แก้ไปแล้วหลายชั่วโมง** เพราะบันเดิลค้าง — SW precache เสิร์ฟ `index.html` แบบ cache-first ตรึงแอปไว้ที่ commit ที่ SW ถูกติดตั้งครั้งแรก | **merged ≠ deployed ≠ สิ่งที่เบราว์เซอร์รันอยู่ · อ่าน version stamp ก่อนไล่บั๊กหน้าจอทุกครั้ง** · fix = shell แบบ network-first + SW self-activate (§10) |
| `grep -rn "mint-" src/` ว่าง ทุกคนเข้าใจว่า PR-C จบ แต่สีเก่าอยู่ใน `categories.color` ในฐานข้อมูล ชุดสีใหม่ไม่เคยขึ้นจอ | **การ grep พิสูจน์ได้แค่เรื่องในโค้ด · ค่าที่ seed ลง DB คือแหล่งความจริงอีกที่ที่ grep มองไม่เห็น** (แก้ #71 + 0016) |
| **`0015` รันลง DB แล้วแต่ไฟล์ไม่เคยเข้า main** — PR อ้างว่า apply แต่ diff ไม่มีไฟล์ `.sql` | `schema_migrations` กับ repo ต้องตรงกัน · **ตรวจทุกครั้งหลัง migration ว่าไฟล์เข้า main จริง (ด้วย git ไม่ใช่ความจำ)** · ห้ามประกอบไฟล์ migration ขึ้นเองจากการอ่าน types |
| push งานเข้า branch หลัง PR ปิดไปแล้ว → commit ค้าง เอกสารบน main ล้าสมัย | เช็คว่า PR เปิดอยู่ก่อน push · PR ที่ merge แล้ว = เริ่ม branch ใหม่จาก main |
| Supabase free tier pause เอง แล้วหน้า login ค้างไม่บอกอะไร | error ต้องถึงผู้ใช้ · `getSession()` ต้องมีตัวดัก |
| **`0020` เปลี่ยน signature RPC ที่ client เรียก (`friend_request_send` `p_code`→`p_username`) แล้ว merge PR `types-drift` เดี่ยว → types ใหม่ + call site เก่าไม่ตรง → `tsc` ล้ม → main แดง → ต้องแก้สามใบ** | migration ที่เปลี่ยน/เพิ่ม signature RPC ที่ client เรียก **ห้าม merge PR `types-drift` เดี่ยว** · ดึงไฟล์เข้า branch ฟีเจอร์แล้ว **merge ทีเดียวพร้อม call site** (`0021` ทำถูกแล้ว = ใบเดียวจบ — §2.1) |
| **`debt_create` มีบั๊ก cast text→enum ตั้งแต่ `0015` แต่ผ่าน verification มาตลอด** เพราะไม่มี UI เรียก จับได้ตอนต่อ UI จริง (แก้ 0019) | **RPC ที่ไม่เคยถูกเรียกจริง = ยังไม่ถูกพิสูจน์** · smoke test ต้องเรียกฟังก์ชันจริงและ assert ผล ไม่ใช่แค่เช็คว่ามีอยู่ · CASE ที่รวม literal เป็น `text` ต้อง cast `::public.enum_type` ตอน INSERT (bare literal coerce ได้ text expression ไม่ได้) |

---

## 10. สถานะปัจจุบัน

**ไฟล์ migration บน main: `0001`–`0021`** (ล่าสุด `0021_debt_settle_many.sql`) — ทุกฟังก์ชัน/ตารางใน `database.types.ts` มีไฟล์ migration รองรับครบ (ตรวจ cross-check แล้ว ไม่มี "อยู่ใน types แต่ไม่มีไฟล์")
`0015` = ยอดค้าง (tables+RPC+`is_debt_settlement`) · `0016` = `color_index` 1–6 + DROP `categories.color` · `0017` = `friend_debts_summary` แยก private/shared + rename หมวดยอดค้าง + seed 13 หมวด · `0018` = `debt_share_private` + reproduce `debt_cancel` · `0019` = fix cast enum ใน `debt_create` · `0020` = `username` (+ trigger set-once) · `0021` = `debt_settle_many`

**หน้าจริงในแอป (13 ไฟล์ `*Page.tsx`, 13 route + catch-all `*` → `/` ใน `router.tsx`):**
Home `/` · History `/history` · **Debts `/debts`** · **FriendHistory `/debts/friend/:friendId`** · Stock `/stock` · StockIntake `/stock/intake` · StockQueue `/stock/queue` · Budget `/budget` · Settings `/settings` · Login `/login` · ForgotPassword `/forgot-password` · ResetPassword `/reset-password` · Add `/add`
(`/add`, `/stock/intake`, `/stock/queue` อยู่ใต้ `RequireAuth` แต่นอก `AppLayout` = เต็มจอ ไม่มี bottom nav · nav มี 6 ช่อง)

**Guard เบราว์เซอร์จริง (Playwright + Chromium, 4 ไฟล์ `*.visual.test.*`):** ทุกตัวใช้ `visual-harness.ts` launch Chromium (`executablePath = CHROMIUM_EXECUTABLE`) แล้วเรนเดอร์ด้วย CSS จริงจาก `dist/` · **กติกา:** ถ้า Chromium/CSS ไม่พร้อม — **ใน CI (`process.env.CI`) → throw (fail) · นอก CI → `ctx.skip()`** (ไม่ให้ dev เผลอเข้าใจว่าเขียวทั้งที่ไม่ได้รัน)
- `AppLayout.visual.test.tsx` — bottom nav ทุกช่อง ≥ 44×44px
- `WovenHero.visual.test.ts` — ป้ายพับ (BUDGET/STOCK PROFIT) ถูก "วาดจริง" ที่จุดกึ่งกลาง (กันบั๊กแถบเปล่า)
- `charts.visual.test.ts` — ยอดรวมกลางโดนัทอยู่ในวงทุกขนาดเลข + เคส mask
- `pwa-freshness.visual.test.ts` — client ที่เปิดใหม่หลัง deploy รันบันเดิลใหม่ ไม่ใช่ shell ที่ precache ไว้ (กันบันเดิลค้าง)

**ทำเสร็จแล้ว (มีในโค้ดจริง):**
- ระบบขายครบวงจร · error ที่ถึงผู้ใช้ · **ชุดทดสอบ 192 เคส / 22 ไฟล์ ใน CI** (Vitest) · types generate จาก DB จริง (workflow) · หน้ากู้รหัสผ่าน + recovery gate
- Dark mode · กระดิ่งแจ้งเตือนสต็อก (`useAttention.ts`) · หน้าคิวสต็อก · redesign สี่หน้าหลัก + หน้ารอง (§11)
- สี + ไอคอนปักหมุดต่อหมวด (`color_index`, 0016 + #71) · โดนัทขยายรูให้ยอดรวมพอดี · บิลรอจ่ายในบรรทัดรอง SAFE + แท็บ `รอจ่าย`
- **ฟีเจอร์ยอดค้างครบวงจร** (§11.6) — PR-W เพิ่มเพื่อน/โปรไฟล์ · PR-X สร้าง/ยืนยัน/ปฏิเสธ/ประวัติ · username (0020) · PR-Y เคลียร์/ย้อน/แถวล็อก
- แก้บันเดิลค้าง: app shell **network-first** + SW **self-activate**

**ยังไม่ได้ทำ / หนี้ที่รู้ตัว:**
- **กวาดข้อความ error ภาษาไทยในชุด RPC `0015` ที่ยังใช้คำว่า "หนี้/เจ้าหนี้/ลูกหนี้"** (0015/0018/0019) — ผู้ใช้เห็นได้จริงเพราะ `errors.ts` ส่งข้อความไทยผ่านตรง ๆ = migration เดี่ยว reproduce ทั้งชุดเปลี่ยน literal
- **`top: 98` ใน `WovenHero.tsx` (~บรรทัด 287)** เป็นเลขที่คำนวณมือจากค่าคงที่สี่ตัว (ดูคอมเมนต์บรรทัด 279) — เปราะถ้าเรขาคณิตฮีโร่เปลี่ยน
- **`friend_code` + `generate_friend_code()`** เลิกใช้แล้วแต่ยังอยู่ในตาราง/ยัง seed อยู่ (ไม่ drop เลี่ยง migration destructive · ไม่มี code path อ่าน) — PR ทีหลังค่อย drop เมื่อมั่นใจ
- หน้าตั้งค่ารูปแบบ SKU แบบแก้ได้ (ตอนนี้ read-only) · ยอดเงินคงเหลือรายกระเป๋า · ถังขยะ/กู้ข้อมูล/สำรองข้อมูล · ฟีเจอร์ AI (โครงเปล่า toggle ใน `prefs.ts`)
- **`src/lib/offlineQueue.ts` มีอยู่แต่ยังไม่มีไฟล์ไหน import** (ยืนยันด้วย grep) → ทำต่อหรือลบทิ้ง
- ESLint (ตอนนี้ `npm run lint` = `tsc -b`)
- **ตรวจแล้วไม่พบ:** คำเตือน Node 20 deprecated ใน workflow — `ci.yml` ใช้ `node-version: 22` + `checkout@v4`/`setup-node@v4` (major ปัจจุบัน) ไม่มี action ที่ pin เวอร์ชัน runtime เก่า

**Version stamp + กลไก PWA:**
- version stamp: `vite.config.ts` `define` `__COMMIT_SHA__`/`__BUILD_TIME__` (SHA จาก `WORKERS_CI_COMMIT_SHA`→`CF_PAGES_COMMIT_SHA`→`GITHUB_SHA`→`VITE_COMMIT_SHA`→git→`'dev'`) แสดงท้าย `SettingsPage.tsx` แตะแล้วคัดลอก — **อ่านค่านี้ก่อนไล่บั๊กหน้าจอทุกครั้ง**
- PWA: `registerType: 'prompt'` · `index.html` ไม่อยู่ใน `globPatterns` (ไม่ precache) + `navigateFallback: undefined` → navigation เสิร์ฟผ่าน `runtimeCaching` แบบ **NetworkFirst** (cacheName `app-shell`, `networkTimeoutSeconds: 3`) · `skipWaiting`+`clientsClaim`+`cleanupOutdatedCaches` ให้ SW ใหม่ทำงานทันทีโดย**ไม่ reload** (ไม่ทับสิ่งที่พิมพ์ค้าง) · `PwaUpdater.tsx` เหลือแค่ register SW + โยน error ให้ผู้ใช้ (ไม่มี toast "โหลดใหม่" แล้ว — คอมเมนต์อธิบายไว้) · guard `pwa-freshness.visual.test.ts` กันถดถอย

---

## 11. Redesign + ฟีเจอร์ยอดค้าง — สถานะปัจจุบัน (ไม่ใช่แผน)

> **เคาะแล้ว:** ฮีโร่ = ป้ายทอสีเข้ม · สีแบรนด์ = คราม · หน้าแรกตอบ "เหลือเงินเท่าไหร่" เป็นหลัก · redesign ครบสี่หน้าหลัก (หน้าแรก/งบ/คลัง/เพิ่มรายการ) + หน้ารอง
> **แหล่งความจริงของสี:** `tailwind.config.ts` + `src/styles/index.css` (มีคอมเมนต์กำกับ locked/role) — เอกสารนี้ไม่คัดลอกค่า hex
> **เอกสารดีไซน์:** `docs/design/untitled/project/uploads/design-spec-expense-stock-app.md` + `...ui-reference-expense-stock-app.html` + `.../Screens.dc.html`

### 11.1 ฮีโร่ — ป้ายทอคอเสื้อ (`src/components/WovenHero.tsx`)
**หลักการ: กิมมิกต้องเผย ไม่ใช่ซ่อน** — ของที่ดูทุกวันต้องเห็นทันทีโดยไม่ต้องกด
- ป้ายทอ **3 ใบ ล็อกที่ 3 — ไม่มีใบยอดค้าง** (ยอดค้างไปอยู่แท็บ/หน้าแยก ไม่ใช่ป้ายใบที่ 4) · ลำดับ `SAFE TO SPEND` → `BUDGET` → `STOCK PROFIT` · ใบพับโชว์ eyebrow + ตัวเลขย่อ เรนเดอร์**ไม่มีเงื่อนไข**ทุกใบ
- **`flex flex-col` บนปุ่มป้ายเป็น load-bearing** — ห้ามถอด (บั๊กแถบเปล่าบน production — §9)
- บรรทัดรอง SAFE หักบิลรอจ่าย (`computeSpendable`) · เกินยอด → ไอคอนเตือน ไม่ clamp · ปุ่มซ่อนยอด mask SAFE + บรรทัดรอง + เงินในแท็บ `รอจ่าย` (งบ/กำไรสต็อกไม่ mask)
- เรขาคณิต (`CONTAINER_H`/`LABEL_H`/`POSITIONS` ใน `WovenHero.tsx`) มี guard เบราว์เซอร์จริง `WovenHero.visual.test.ts` กันถดถอย — **ค่าตัวเลขอ่านจากไฟล์ ไม่คัดลอกมาที่นี่**

### 11.2 สี — คราม + สีหมวดต่อ slot (`tailwind.config.ts` + `src/styles/index.css`)
- สีแบรนด์ = คราม (indigo) · `brand.fabric*`/`thread` ขับ WovenHero (คอมเมนต์ในไฟล์เขียน "locked — do NOT change")
- `cat.1–6` + `cat.other` เป็น CSS variable (light ใน `:root` · dark override ใน `html.dark`) — **สีหมวดมาจาก `categories.color_index` ผ่าน `catColorVar()` ที่เดียว** · `FALLBACK_SLICE_COLORS` (hex ดิบใน `useHome`) ถูกลบแล้ว
- `theme-color` = สีพื้นแอปแยกตาม scheme · hex ดิบใน `src/` เหลือแค่ gradient ตกแต่งใน `index.css`

### 11.3 โดนัท (`src/components/charts.tsx`)
- ตัวเลขรวม **บรรทัดเดียว** อยู่คอร์ดกว้างสุด · `donutCenterFontSize(charCount)` = **แหล่งเดียว**ที่ตัดสินขนาด (คิดจากคอร์ด) — ห้ามย่อฟอนต์เงียบ ๆ (§11.5-5) · guard `charts.visual.test.ts` · `largestRemainderPercents()` (`lib/percent.ts`) — legend % รวม 100 · สี slice จาก `color_index`

### 11.4 การตัดสินใจสำคัญ — ทำไม (โค้ดบอก "ทำอะไร" เอกสารบอก "ทำไม")
กู้จากการอ่านไฟล์ไม่ได้ — โดยเฉพาะข้อที่**กลับคำ**จากที่เคยตัดสิน (ไม่งั้นอีกสามเดือนมีคนมองเป็นบั๊กแล้วแก้กลับ):

1. **สีแบรนด์ย้ายออกจากเขียว** เพราะในแอปการเงินเขียวถูกจองโดยความหมาย "เงินเข้า" — สีเดียวทำสองหน้าที่คือรากของบั๊ก
2. **สีหมวดปักหมุดต่อหมวด (`color_index`) ไม่เรียงตามยอด** — กลับคำ เพราะสีไปโผล่สองที่ (โดนัท + แถวรายการ) ถ้าเรียงตามยอดสีจะสลับทุกเดือนจำไม่ได้
3. **DB เก็บความหมาย client เก็บหน้าตา** — หลักการเดียวกับ `computePace()` คืน `status` ไม่ใช่สี · เปลี่ยนพาเลตต์ไม่ต้องแตะ DB · เดียวกับ schedule-date ที่ DB เป็นเจ้าของ (`recurring_next_date`)
4. **`icon` ไม่มี check constraint** เพราะ `lib/icons.tsx` fallback เป็นไอคอนป้าย ชื่อผิดเสื่อมสภาพนุ่มนวล · ใส่ constraint = ต้องเขียน migration ทุกครั้งที่เพิ่มไอคอน
5. **โดนัท: ขยายรู ไม่ย่อตัวเลข** — ปฏิเสธทั้งย่อหน่วย (`฿1.23M`) และย้ายเลขออกจากรู
6. **หน้าแรกตอบ "เหลือเงินเท่าไหร่" งบเป็นป้ายใบที่สอง** — และ**ห้ามเพิ่มพาดหัวที่สองที่ตอบคำถามเดียวกัน**
7. **บิลรอจ่าย: หักเฉพาะรายจ่าย ไม่บวกรายรับ** — ไม่สมมาตรโดยตั้งใจ เพราะบวกรายรับที่ยังไม่เข้า = ชวนใช้เงินที่ยังไม่มี (ความผิดพลาดสองทางราคาไม่เท่ากัน)
8. **ห้าม clamp เป็น 0 เงียบ ๆ ทุกที่ที่แสดงเงิน** — เกินยอด → บอกตรง ๆ + ไอคอน
9. **texture + เงา = ข้อยกเว้นเฉพาะป้ายทอ มีได้ที่เดียวต่อหน้า** (flat เป็นค่าเริ่มต้น) · **motion มาจาก token เท่านั้น + `motion-reduce` บังคับ**
10. **เส้นประถูกใช้กับโซนวางรูปอยู่แล้ว** (drop zone) — ห้ามให้ความหมายที่สอง
11. **`hideBalance` = "ซ่อนตอนกวาดตา เปิดตอนตัดสินใจ"** — ปิดยอดในลิสต์/พาดหัว/รายคน (กวาดตา) ได้ · แต่ **ชีตที่ขอให้ผู้ใช้ยอมรับข้อผูกพัน (`ConfirmDebtSheet` ยืนยันยอด · `SettleSheet` เคลียร์ยอด) ต้องแสดงจำนวนเงินเสมอ** และ**ไม่รับ prop `hideBalance` เลย** เพื่อกันเชิงโครงสร้าง — ยืนยันยอดที่ถูกปิดอยู่ = ยอมรับแบบตาบอด (คอมเมนต์กำกับที่หัวไฟล์ทั้งสอง)
12. **ยอดที่จดไว้เอง (private) ไม่รวมในพาดหัว และไม่รวมกับยอดที่ตกลงกันแล้ว (shared) ทุกที่** — `computeFriendLedger` แยก `agreedNet`/`privateNet` คนละถัง ไม่บวกกัน · หน้ารวมอ่าน `shared_net` เท่านั้น
13. **ย้อนการเคลียร์ (`debt_settle_reverse`) ได้เฉพาะคนที่กดเคลียร์เอง** (`settled_by = auth.uid()`, 0015) — ข้อจำกัดที่ตั้งใจ: ถ้าอีกฝ่ายไม่เห็นด้วยว่าจ่ายแล้ว ทำอะไรในแอปไม่ได้ ต้องคุยกันข้างนอก · ปลอดภัยกว่าให้ใครก็ได้ย้อน/ลบรายการเงินของอีกฝ่าย · UI โชว์ปุ่มย้อนเฉพาะแถวที่ "เราเป็นคนกดเคลียร์"
14. **ชื่อฟีเจอร์คือ "ยอดค้าง"** · คำที่ห้ามบนหน้าจอ: หนี้ · เจ้าหนี้ · ลูกหนี้ · เรียกเก็บ · ทวง · **ชื่อในฐานข้อมูล/โค้ดยังเป็น `debt*` ตั้งใจ** (เปลี่ยนชื่อ schema = migration destructive ไม่คุ้ม) — เพราะงั้นถึงมี gap ระหว่าง "จ่ายคืนเพื่อน" บนจอ กับ `debt_repayment_expense` ใน DB

### 11.5 บั๊กจริงในโค้ด — B1–B14 แก้แล้วทั้งหมด
B1/B2 (hero base = `isBudgetSpendingRow`, ไม่ clamp) · B3 legend ตัด slice · B4 หัวแถวซ้ำ/เส้นแบ่งวัน · B5 `totalUsed` · B6 `daysLeft` นับวันนี้ · B7 แถบสองท่อน · B8–B10 หน้าคลัง · B11 `favoriteLabel()` · B12 favorites `wallet_id`+`note` (0014) · B13 ล้างยอดเดิม · B14 contrast ไอคอน error · `WalletHero` → `WovenHero`

### 11.6 ฟีเจอร์ยอดค้าง (friend outstanding balances) — ครบวงจร

**แนวคิด:** ติดตามยอดที่ค้างกันระหว่างเพื่อน แยกชัดระหว่าง **"ตกลงกันแล้ว" (shared)** กับ **"จดไว้เอง" (private)** ไม่รวมกันทุกที่ (§11.5-12) · เป็นฟีเจอร์ cross-user ตัวเดียว → security model ต่าง (§3)

**ตาราง (0015):** `profiles` (1/user: `display_name`, `username`, `friend_code` เลิกใช้) · `friend_connections` (`requester_id`/`addressee_id`/`status` = `pending|accepted`) · `debts` (`creditor_id`/`debtor_id`/`amount`/`visibility` = `private|shared`/`status`/`settled_by`/`settlement_transaction_id`/…) · `debt_events` (audit)

**สถานะ `debts.status`:** `pending_confirmation` → `confirmed` → `settled` · หรือ `rejected` / `cancelled` (enum `debt_status`)

**Flow + RPC (เรียกผ่าน `useFriends.ts`):**
1. **เพิ่มเพื่อน** — `friend_request_send(p_username)` / `friend_request_respond(p_connection_id, p_accept)` · ค้นด้วย **username** ไม่ใช่อีเมล (`AddFriendSheet.tsx`)
2. **บันทึกยอด** — `debt_create` (`DebtFormSheet.tsx`) · shared = ค้าง `pending_confirmation` จนอีกฝ่ายกด `debt_confirm`/`debt_reject` (`ConfirmDebtSheet.tsx`) · private "จดไว้เอง" = `confirmed` ทันที เห็นฝ่ายเดียว · เปลี่ยน private→shared ด้วย `debt_share_private` · ลบ private ด้วย `debt_delete_private` · ยกเลิก shared ด้วย `debt_cancel`
3. **เคลียร์ยอด** — `debt_settle(p_debt_id, p_wallet_id)` (ใบเดียว) หรือ **`debt_settle_many(p_debt_ids, p_wallet_id)`** (หลายใบ atomic — reuse `debt_settle` ในลูปฝั่งเซิร์ฟเวอร์ ทรานแซกชันเดียว) (`SettleSheet.tsx`) · **client ไม่ลูปเอง**
4. **ย้อนการเคลียร์** — `debt_settle_reverse(p_debt_id)` เฉพาะคนที่กดเคลียร์ (§11.5-13)

**การเชื่อมกับเงินหลัก:** เคลียร์ยอดเป็น **single-party** — คนที่กด "เคลียร์แล้ว" เลือกกระเป๋าตัวเอง แล้วได้ **transaction จริง 1 แถว `is_debt_settlement=true`** ทันที (หมวด `debt_repayment_income`/`debt_repayment_expense` ตามทิศ) · `debts.settlement_transaction_id` ผูกกลับไปที่แถวนั้น · **อีกฝ่ายไม่ได้ transaction อัตโนมัติ** — ถ้าอยากบันทึกฝั่งตัวเองมี nudge ให้ไปเพิ่มผ่าน add-flow ที่เติมค่าให้ล่วงหน้า (ข้ามได้) · แถวนี้ "ล็อก" (§5) · นับใน headline แต่ตัดจาก budget (§4-5)

**สรุปยอด (`debtsSummary.ts`):** `computeFriendLedger` แยก `agreedItems`(shared confirmed) · `privateItems`(private confirmed) · `settledItems`(settled ทุก visibility) · `pendingIncoming/Outgoing` · `rejectedMine` — `agreedNet`/`privateNet` คนละถัง · `computeDebtsHeadline` อ่าน `friend_debts_summary.shared_net` ต่อคน (บวก = เขาค้างเรา / ลบ = เราค้างเขา)

**หน้าจอ:** `/debts` (`DebtsPage.tsx` — ภาพรวมทุกคน) · `/debts/friend/:friendId` (`FriendHistoryPage.tsx` — รายคน แยกบล็อกตกลงกันแล้ว/จดไว้เอง) · ชีต: `AddFriendSheet`/`DebtFormSheet`/`ConfirmDebtSheet`/`SettleSheet`/`ProfileManager`

**username (0020):** พิมพ์เล็ก `^[a-z0-9_]{3,20}$` (CHECK ใน DB + `USERNAME_RE` ใน `lib/username.ts` mirror กัน · unique index) · **ตั้งครั้งเดียว** — trigger `profiles_username_setonce` (BEFORE UPDATE) บล็อกการแก้ค่าที่ไม่ null เมื่อ `auth.uid()` ไม่ null · **เจ้าของแก้ให้ได้** ผ่าน SQL Editor เพราะไม่มี JWT → `auth.uid()` null → ผ่าน guard (escape hatch ตั้งใจ) · `useSetUsername`/`useUpdateDisplayName` เขียน `profiles` ตรง (ไม่ผ่าน RPC) · `friend_code` ยังอยู่แต่เลิกใช้ (§10)
