# STASH — Project Context

> บริบทถาวรของโปรเจกต์ ใช้แทนการอ่าน `docs/PROJECT_AUDIT.md` ฉบับเต็มในงานประจำวัน
>
> **ประกอบใหม่ทั้งฉบับ ไม่ใช่แพตช์ทีละจุด** — การแพตช์ทีละบรรทัดคือกลไกที่ทำให้เอกสารคลาดจากของจริงมาทุกรอบ (เคยค้างที่ migration `0021` ทั้งที่ถึง `0024` แล้ว → สเปกสั่งสร้าง `0022` ผิด · เคยค้างที่ 254 เทสต์ ทั้งที่ 300+) ทุกประโยคในไฟล์นี้มาจากการอ่านไฟล์จริงในรอบนี้ ไม่ได้คัดลอกจากฉบับเดิม
> **กติกาการใช้:** ทุกข้อความควรชี้กลับไปที่ไฟล์จริงได้ จุดไหนยังไม่ได้ตรวจจะเขียนว่า "ยังไม่ได้ตรวจ" ตรง ๆ ไม่เดา · ค่าสี hex และเลขเรขาคณิตของฮีโร่ **ไม่คัดลอกมาไว้ที่นี่** — อ่านจากไฟล์แหล่งความจริง
> **ตัวเลขทุกตัวนับใหม่ในรอบนี้** จากคำสั่งที่รันจริง (ดู §12 ท้ายไฟล์)
> **ตรวจล่าสุดเทียบ repo จริง:** main `ddada9e` (หลัง merge ใบ 1–5 · ใบ 5 = PR #125 งบ) — migration ล่าสุด `0027` · โครงยึดฉบับเดิม (§1–§12) แต่เนื้อเขียนใหม่
> **ชั้น DB ไม่ขยับตั้งแต่ audit ก่อน:** `git diff 5242f0a..ddada9e -- supabase/migrations src/lib/database.types.ts` = **ว่าง** → §3–§7 (schema · เงิน · สต็อก · RPC · seed) อ้างจากไฟล์เดิมที่พิสูจน์แล้วว่า byte-identical + นับซ้ำรอบนี้ · ที่เปลี่ยนทั้งหมดเป็น **client ล้วน** (รายการไฟล์ที่แตะ: `git diff --name-only 5242f0a..ddada9e`)

---

## 1. โปรเจกต์นี้คืออะไร

PWA บันทึกรายรับ-รายจ่ายส่วนตัว ที่มี **กึ่งระบบสต็อกสินค้า** (เสื้อผ้า/ของมือสอง ขายต่อ) + ระบบ **ยอดค้างกับเพื่อน** รวมอยู่ในแอปเดียว (`package.json` description)

- **ผู้ใช้:** เจ้าของ + เพื่อนไม่กี่คน · **ต่างคนต่างขายของตัวเอง ไม่แชร์คลัง** · "ยอดค้าง" เป็นฟีเจอร์ cross-user ตัวเดียวในแอป
- **ภาษา:** ไทย (`index.html` `lang="th"`) · **สกุลเงิน:** THB (`lib/format.ts` `Intl.NumberFormat('th-TH')`) · **เขตเวลา:** Asia/Bangkok
- **เขตเวลาเป็นข้อจำกัดทั้งแอป:** ทั้ง client (`lib/dates.ts` `APP_TZ='Asia/Bangkok'`) และ DB (`0010`: `(now() at time zone 'Asia/Bangkok')::date`) เคาะ "วันนี้/เดือนนี้" เป็นเวลาไทยเสมอ ไม่ใช่ timezone ของเครื่อง — ไม่งั้นรายการเวลา 00:30 ICT จากเครื่อง UTC จะลงผิดวัน และยอดรายเดือน drift ที่ขอบเดือน
- **ไม่มีหน้าสมัครสมาชิก** — เจ้าของสร้างบัญชีให้ใน Supabase dashboard · มีเฉพาะเข้าสู่ระบบ + กู้รหัสผ่าน (`/login`, `/forgot-password`, `/reset-password`)
- **Deploy:** Cloudflare Workers (static assets) — worker ชื่อ `stash-web` (`wrangler.jsonc`) · **production URL ที่แน่นอนไม่ได้ pin ในไฟล์ repo** → ยังไม่ได้ตรวจ

---

## 2. Stack + ข้อจำกัดสภาพแวดล้อม

Vite 6 · React 18 · TypeScript · Tailwind 3 · Supabase (Postgres + Auth อีเมล/รหัส + Storage) · TanStack Query 5 · react-router-dom 6 · `vite-plugin-pwa` · Cloudflare Workers · Vitest 2 (รวม guard เบราว์เซอร์จริงด้วย `playwright-core` + Chromium) (จาก `package.json`)

**สคริปต์จริง (`package.json`):** `dev` · `build`=`tsc -b && vite build` · `preview` · `test`=`vitest run` · `test:watch` · **`lint`=`tsc -b`** · `typecheck`=`tsc -b` · `cf:dev`=`wrangler dev` · `cf:typegen` · `deploy`=`npm run build && wrangler deploy`
> **ยังไม่มี ESLint** — `npm run lint` เป็นแค่ `tsc -b` (ตรวจ `package.json` รอบนี้ · ยังจริง)

**ข้อจำกัดที่กำหนดวิธีทำงานทั้งหมด:**

- เจ้าของทำงาน**ออนไลน์ล้วน ไม่มีเครื่อง dev** — รันคำสั่ง local เองไม่ได้ (AI agent รันให้)
- **Migration เป็น raw SQL รันมือใน Supabase SQL Editor** — ไม่มี Supabase CLI/migration runner (`schema_migrations` เป็นตารางที่ migration แต่ละไฟล์ insert เอง)
- **AI agent ต่อ DB ไม่ได้** — ส่ง SQL ให้เจ้าของรันแล้วรายงานกลับ · **แหล่งความจริงของ schema ที่ agent อ่านได้คือ `src/lib/database.types.ts`** (generate จาก DB จริง) ไม่ใช่การ query
- **`database.types.ts` regenerate ผ่าน workflow `types-drift`** (ดู §2.1) — ไม่ paste มือ
- **Deploy อัตโนมัติผ่าน Cloudflare Workers Git integration** — **ห้ามเพิ่ม deploy workflow ใน GitHub Actions** จะกลายเป็นสองทางเดินชนกัน (`vite.config.ts` อ่าน `WORKERS_CI_COMMIT_SHA`) · **`build` job ของ GitHub Actions คือด่านที่ต้องเขียวก่อน merge · Cloudflare Workers Builds เป็นคนละทางเดิน ไม่นับ**
- **merged ≠ deployed ≠ สิ่งที่เบราว์เซอร์รันอยู่** — ก่อนไล่บั๊กหน้าจอทุกครั้ง อ่าน version stamp ท้ายหน้าตั้งค่าก่อน (§9 · §10)
- **`refetchOnWindowFocus: true`** (`src/App.tsx`) — PWA ที่ค้าง background กลับมาต้องเห็นตัวเลขสด · **ผลข้างเคียง:** effect ที่ seed ฟอร์มจากผลของ query **ต้องผูกกับ `id` ไม่ใช่ object** ไม่งั้น window blur→focus (native date/file picker) จะ refetch → object ใหม่ → effect ทับสิ่งที่ผู้ใช้พิมพ์ค้าง (§11.4-17)

### 2.1 GitHub workflows (`.github/workflows/` — 2 ไฟล์)

| ไฟล์ | trigger | ทำอะไร | secret |
|---|---|---|---|
| `ci.yml` | push→`main` + ทุก PR | `npm ci` → `npm run build` → ติดตั้ง chromium → `npm test` (`vitest run`) · Node 22 · concurrency cancel-in-progress · **ไม่ deploy** · ขั้น chromium มีเพื่อให้ guard เบราว์เซอร์จริงรันได้จริงใน CI (ไม่ skip) | **ไม่ใช้ secret** — เทสต์ใช้ dummy Supabase env จาก `vitest.config.ts` |
| `types-drift.yml` | cron รายวัน + `workflow_dispatch` | `supabase gen types` เทียบกับ `database.types.ts` · ต่างเมื่อไร → เปิด/อัปเดต PR branch เดียว `automation/database-types-drift` (label `types-drift`) · เหมือน → เงียบ · **ไม่แตะ `main` ตรง ๆ** | `SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_ID` · optional `GH_PAT` |

> **ทำไมต้องมี `types-drift`:** เจ้าของไม่มีเครื่อง dev → regen จาก dashboard แล้ว paste มือทุกครั้ง · พลาดเมื่อไรฐานข้อมูลกับ repo แยกกันเงียบ ๆ (เกิดจริงกับ `0015`) · workflow นี้ปิดช่องนั้น (หัวไฟล์ `types-drift.yml`)
> **ลำดับที่ถูกเมื่อ migration เปลี่ยน signature ของ RPC ที่ client เรียก:** ห้าม merge PR `types-drift` เดี่ยว — types ใหม่ไม่ตรง call site → `tsc` ล้ม → main แดง · ดึงไฟล์เข้า branch ฟีเจอร์แล้ว merge ทีเดียวพร้อม call site (`0020` พลาดข้อนี้ · §9)
> (ยังไม่ได้ตรวจซ้ำทุกบรรทัดของ workflow รอบนี้ — ไฟล์ workflow ไม่อยู่ในชุดที่เปลี่ยน `git diff --name-only 5242f0a..ddada9e`)

---

## 3. โครงสร้างชั้นข้อมูล

```
DB (tables + RPC + trigger)  →  lib/ (pure function)  →  hooks/ (TanStack Query)  →  UI (pages/ + components/)
```

ตรรกะที่แตะเงินอยู่ใน **SQL** หรือใน **pure function ของ `lib/`** เท่านั้น **ห้าม inline ใน component** · `lib/` เดินทางเดียว **ห้าม import จาก `hooks/`** — รับ "รูปร่างขั้นต่ำ" structural แทน (มีคอมเมนต์กำกับที่หัวไฟล์ · convention 11/12)

**ไฟล์ `lib/` ที่ต้องรู้จัก (จากการอ่านจริงรอบนี้):**

| ไฟล์ | หน้าที่ |
|---|---|
| `src/lib/database.types.ts` | **generated — ห้ามแก้มือ** · แหล่งความจริงของ schema ที่ agent อ่านได้ |
| `src/lib/db.ts` | type alias ระดับแอป derive จาก generated (`Tables<>`/`Enums<>`) |
| `src/lib/ledger.ts` | predicate กลางจำแนกแถว: `isSpendingRow` / `isBudgetSpendingRow` (ตัด `is_stock_cogs`/`is_debt_settlement`/`is_shop_operating`) + **`lockedRowInfo()`** แนวคิด "แถวล็อก" ที่เดียว (§5) |
| `src/lib/budgetable.ts` | **ใหม่ (ใบ 5)** · `isBudgetableCategory()` — ตั้งงบได้เฉพาะ `kind==='expense' && !is_system && !is_shop_category && !is_stock_category` · pure/structural (§11.4-34) |
| `src/lib/budgetNote.ts` | **ใหม่ (ใบ 5)** · ถ้อยคำบรรทัดรองหน้างบที่เดียว: `paceNote(state, {remaining,over}, money)` + atom `overBudgetNote`/`remainingNote` · รับ `money` ฉีดเข้ามาเพื่อ mask ตาม `hideBalance` (§11.4-33) |
| `src/lib/shopAccount.ts` | `computeShopProfit()` — สูตร P&L ร้าน (ถังที่ 1 − ถังที่ 2) ที่เดียว (§4) |
| `src/lib/shopCategory.ts` | resolve หมวดร้านฝั่งรายรับด้วย `kind + is_shop_category` (ไม่มี `system_key`) (§11.4-31) |
| `src/lib/spendable.ts` | `computeSpendable(safe, bills, daysLeft)` — บรรทัดรอง SAFE · ไม่ clamp เงียบ |
| `src/lib/debtsSummary.ts` | `computeDebtsHeadline` (หน้ารวม อ่าน `shared_net`) + `computeFriendLedger` (รายคน แยก agreed/private) (§11.6) |
| `src/lib/sku.ts` | normalize/validate **prefix** เท่านั้น (`^[A-Z0-9]{3}$`) — ไม่ประกอบ SKU (สูตรอยู่ที่ RPC `stock_sku_build`) |
| `src/lib/username.ts` | กติกา username (`^[a-z0-9_]{3,20}$`) mirror CHECK ใน DB (`0020`) |
| `src/lib/dates.ts` | helper วันที่/เดือนกลาง (Asia/Bangkok) · **"เดือน" = string `YYYY-MM`** เทียบ `<`/`>` ตรง ๆ (§11.4-19) · `parseMonthParam`/`parseOptionalMonthParam`/`daysLeftInMonthKey`/`monthBoundsFromKey`/`addMonthsToKey` |
| `src/lib/catColor.ts` | `catColorVar(index)` — slot 1–6 → CSS var **ที่เดียวที่แปลง index→สี** (ไม่มี hex) |
| `src/lib/percent.ts` | `largestRemainderPercents()` — % รวม 100 พอดี (Hamilton) |
| `src/lib/errors.ts` | `translateError()` → ข้อความไทยที่เดียว · จับด้วย `code`/`status` ไม่จับ substring · **ข้อความที่มีอักษรไทยอยู่แล้วส่งผ่านตรง ๆ** (§9) |
| `src/lib/txCache.ts` / `txRestore.ts` | เติมแถวที่เพิ่ง insert ลง cache / payload คืนแถวที่ลบ · pure · structural (§11.4-16/18) |
| `src/lib/offlineQueue.ts` | write-outbox บน IndexedDB — **ไม่มีไฟล์ไหน import (dead code)** ยืนยัน grep รอบนี้ (§10) |
| `src/lib/useDialogA11y.ts` | โฟกัส/คีย์บอร์ดชีตกลาง · **`onClose` ขี่ ref ไม่เป็น dependency ของ effect** (กันบั๊ก caret หลุด · §9) |
| `src/lib/visual-contrast.ts` | helper วัด contrast ที่ compute จริงในเบราว์เซอร์ (ใช้โดย `AppLayout.theme` + `Toast.contrast` visual guard) |

**14 ตาราง** (นับจาก block `public.Tables` ใน `database.types.ts` รอบนี้ = 14):
`budgets` `categories` `debt_events` `debts` `favorites` `friend_connections` `profiles` `recurring` `schema_migrations` `stock_items` `stock_sales` `stock_sku_config` `transactions` `wallets`

- ทุกตาราง RLS เปิด + policy owner-only บน `auth.uid() = user_id` (`0001`) — **ยกเว้น 2 กลุ่ม:**
  - `schema_migrations` (`0011`): RLS เปิด · **0 policy** · revoke สิทธิ์ anon/authenticated (ตั้งใจ)
  - **กลุ่มยอดค้าง** `debts`/`debt_events`/`friend_connections`/`profiles` (`0015`): RLS **select-only** (เห็นได้เมื่อเป็นคู่กรณี/เพื่อน) + **เขียนผ่าน SECURITY DEFINER RPC ที่ re-check `auth.uid()` เอง** (§6 · §11.6)

---

## 4. กฎธุรกิจ — เงิน (สำคัญที่สุดในไฟล์)

ที่มา: `lib/ledger.ts` · `lib/shopAccount.ts` · `0012` (ขาย) · `0015` (ยอดค้าง) · `0026` (หมวดร้าน) · **migration byte-identical ตั้งแต่ audit ก่อน**

1. **ซื้อของเข้าสต็อกไม่ใช่รายจ่าย** — `is_stock_purchase=true` ตัดจาก "ยอดจ่าย" (`isSpendingRow` = `type==='expense' && !is_stock_purchase`)
2. **ขาย = สองแถวเสมอ (Model A, gross)** (`stock_sale_create` `0012`/`0013`): income = ราคาขาย×qty (หมวด `stock_sale_income`) · expense = ต้นทุน×qty (`is_stock_cogs=true` · หมวด `stock_cogs` · wallet null)
3. `safeToSpend = income − spending` — **ไม่ต้องมี accumulator แยกสำหรับ COGS** เพราะ COGS ถูกหักกลบด้วย income การขายเองใน Model A
4. **COGS นับใน headline เงินออก + donut แต่ตัดจาก budget** (`isBudgetSpendingRow` ตัด `is_stock_cogs`)
5. **เคลียร์ยอดค้าง (`is_debt_settlement=true`) กติกาเดียวกับ COGS:** นับใน headline ตัดจาก budget
6. **ค่าดำเนินร้าน (`is_shop_operating=true`) กติกาเดียวกับ COGS:** นับใน headline **แต่ตัดจาก budget** (ถังที่ 2 · `0026`) — mirror สองที่: `isBudgetSpendingRow` (client) + query ของ `useMonthSpending` ก็ตัดฝั่ง SQL
   - **`transactions.is_shop_operating` เป็น derived column เขียนโดย trigger `set_txn_shop_operating` เท่านั้น** (`0026` DEFINER) — **client ห้ามส่งค่า** · แหล่งความจริงคือป้าย `categories.is_shop_category`
7. **บัญชีร้านมีสองถังแยกเด็ดขาด** (`computeShopProfit`): ถังที่ 1 = กำไรขั้นต้นจาก `stock_sales` · ถังที่ 2 = ค่าดำเนินร้าน (net: ค่าส่ง/แพ็ค/ฟี/การตลาดจ่าย − ค่าส่งที่เก็บจากลูกค้า) · **กำไรสุทธิ = ถัง 1 − ถัง 2** · **ห้ามเกลี่ยถังที่ 2 ลงรายชิ้น** (§11.4-28)
8. **ขายขาดทุนได้** — สองแถว ledger ยังบวก มีแค่ `stock_sales.profit` ติดลบ · `computeShopProfit` **ไม่ clamp**
9. `cost_at_sale` snapshot ต้นทุน/ชิ้น ณ วันขาย (ต่างจาก `is_shop_operating` ที่ไล่รีไรต์แถวเก่า · §11.4-25)
10. **วันที่ฝั่ง DB ใช้ `(now() at time zone 'Asia/Bangkok')::date` เสมอ** ห้าม `current_date` (`0010`)
11. **ตัดสินว่ารายการอยู่เดือนไหนอ่านจาก string `YYYY-MM-DD` ตรง ๆ** ห้ามแปลงเป็น Date (§11.4-19)
12. **บิลรอจ่ายหักออกจาก "ใช้ได้วันละ" — หักเฉพาะรายจ่าย ไม่บวกรายรับ** (`spendable.ts` + `useUpcomingBills`) · ไม่สมมาตรโดยตั้งใจ (§11.4-7)
13. **ห้าม clamp ยอดเงินเป็น 0 เงียบ ๆ ทุกที่ที่แสดงเงิน** — ติดลบ/เกิน บอกตรง ๆ + ไอคอนเตือน (§11.4-8) · **บังคับใหม่ในใบ 5:** `computePace` คืน `remaining` (budget−used, ติดลบได้) + `over` แยก ไม่ clamp
14. **ห้ามเติมค่าเงินให้ล่วงหน้าในจุดที่ผู้ใช้จะกดผ่าน** — ราคาขาย (แผงขาย) และค่าส่ง (ป๊อปอัพ) เปิดมาว่างเสมอ (§11.4-30/32)

---

## 5. กฎธุรกิจ — สต็อก + แถวที่ล็อก

ที่มา: `0001`/`0012`/`0025`/`0027` · `pages/StockPage.tsx` · `components/StockFields.tsx` · `lib/ledger.ts` (migration ไม่ขยับ; ค่าคงที่ฝั่ง client อ่านซ้ำรอบนี้)

- `qty_remaining` / `status` **คำนวณจากจำนวนเสมอ** (`sold` เหลือ 0 · `partial` < ทั้งหมด · `in_stock` = ทั้งหมด) · CHECK `qty_remaining <= qty_total` (`0001`)
- **`cost_per_unit` และ `qty_total` ล็อกเมื่อขายแล้ว** — trigger `stock_item_lock_after_sale` (`0012`)
- **SKU สร้างจาก DB** ตาม `stock_sku_config` (1 แถว/user) · รูปแบบ **`{PREFIX}-{SEQ}`** · prefix `^[A-Z0-9]{3}$` · seq 4 หลัก zero-pad ขยายไม่ตัด (`0025`)
- **ตัวนับ `next_seq` ผูกกับ user ไม่ผูกกับ prefix** เดินหน้าอย่างเดียว · สูตรประกอบที่ **`stock_sku_build(prefix, seq)` ที่เดียว** (§11.4-24)
- **prefix แก้เองได้ตลอด** (`SkuManager` → `useUpdateSkuPrefix`) — มีผลกับของรับเข้าใหม่เท่านั้น
- สินค้าที่มีประวัติขาย **ลบไม่ได้** (`stock_item_delete` raise · FK `on delete restrict`) ต้อง reverse ก่อน
- **ไม่มี `target_price` แล้ว** (`0027` DROP) — ราคาขายกรอกตอนขายเท่านั้น (§11.4-31/33)
- **ทุนจม (`StockPage.computeSunkCost`)** = Σ `cost_per_unit × qty_remaining` ของของที่ `isStale` (ในสต็อก **และ** ค้างเกิน `AGE_OLD_MAX` วัน) · เงินจริง → mask ตาม `hideBalance` · ฿0 = ข่าวดี → "ไม่มีของค้างนาน"
- **เกณฑ์อายุที่เดียว** (`StockPage.tsx`): `AGE_FRESH_MAX=30` · `AGE_OLD_MAX=60` (`isStale` reuse โดยชิป "ค้างนาน" · `computeSunkCost` · กระดิ่ง) — ไม่ประกาศ 60 ซ้ำ

**แนวคิด "แถวที่ล็อก" — รวมที่ `ledger.ts` `lockedRowInfo(r)` ที่เดียว** คืน `{ kind, dateEditable, reason, actionLabel, actionTo }` ครอบ 3 ชนิด:

| kind | เงื่อนไข | แก้วันที่ | ไปย้อนที่ |
|---|---|---|---|
| `stock_purchase` | `is_stock_purchase` | **ได้** | `/stock` |
| `stock_sale` | `isSaleLinkedRow(r)` | ไม่ได้ | `/stock` |
| `debt_settlement` | `is_debt_settlement` | ไม่ได้ | `/debts` |

- แต่ละชนิดมี **trigger กันที่ DB** (`stock_sale_txn_guard` `0012` · `debt_settlement_txn_guard` `0015`) · `lockedRowInfo` = client mirror เตือนก่อนชน trigger · แก้ note/wallet ได้ แต่ยอด/ประเภท/วันที่ไม่ได้
- **`lockedRowInfo()` ยังเป็นด่านของ undo การลบ** — `txRestore.buildRestoreInsert()` โยน error ถ้า snapshot เป็นแถวล็อก
- **เพิ่มชนิดล็อกใหม่ → แก้ที่เดียว:** union `LockedKind` + 1 branch

---

## 6. RPC ทั้งหมด — 26 ตัว

นับจาก block `public.Functions` ใน `database.types.ts` รอบนี้ = **26** (byte-identical ตั้งแต่ audit ก่อน) · definer/invoker อ่านจาก migration เวอร์ชันล่าสุดที่ (re)define

**สต็อก/ระบบ (12):** `stock_intake_create` (INVOKER · `0027` 13-arg) · `stock_item_delete` (`0006`) · `stock_sale_create` (`0013`) · `stock_sale_reverse` (`0013`) · `stock_sales_summary` (`0012`) · `stock_sku_build` (`0025` 2-arg) · `stock_sku_preview` (`0025` 0-arg) · `seed_defaults` (**DEFINER** · `0008` · guard `auth.uid()=uid`) · `seed_defaults_internal` (**DEFINER** · `0026`) · `recurring_run_due` (`0010`) · `recurring_next_date` (`0008`) · `pick_category_color_index` (`0016`)

**ประวัติ/ค้นหา (1):** `transactions_search` (INVOKER · stable · `0024` 6-arg = `p_filter, p_q, p_limit, p_offset, p_month, p_category_id`) — filter+ค้นหา + ยอดรวมทั้งชุด (`count(*) over ()`) query เดียว (§11.4-15)

**ยอดค้าง (13):** `debt_create` (**DEFINER** · `0019`) · `debt_confirm` (`0015`) · `debt_reject` (`0015`) · `debt_cancel` (`0018`) · `debt_settle` (`0015`) · `debt_settle_many` (`0021` — วนฝั่งเซิร์ฟเวอร์ ทรานแซกชันเดียว) · `debt_settle_reverse` (`0015`) · `debt_share_private` (`0018`) · `debt_delete_private` (`0015`) · `friend_request_send` (**DEFINER** · `0020` = `p_username`) · `friend_request_respond` (`0015`) · **`friend_debts_summary`** (INVOKER · `0017` 0-arg) · `generate_friend_code` (**DEFINER** · `0015` · เลิกใช้ · §11.4-14)

**สรุป definer/invoker:** cross-user / seed / เขียนยอดค้าง = **DEFINER** (re-check `auth.uid()`) · single-owner read + สต็อก RPC + search = **INVOKER** (พึ่ง RLS)

> **ไม่ใช่ RPC (trigger function — ไม่โผล่ใน types):** `set_updated_at` · `handle_new_user` · `stock_item_lock_after_sale` · `system_category_no_delete` · `stock_sale_txn_guard` · `debt_settlement_txn_guard` · `set_category_color_index` · `profiles_username_setonce` · `set_txn_shop_operating` (`0026`) · `sync_shop_operating_on_category` (`0026`)
> **ทุก RPC ที่แก้ข้อมูลต้องถูก "เรียกจริง" ถึงจะพิสูจน์** — `debt_create` มีบั๊ก cast enum ตั้งแต่ `0015` แต่ผ่าน verification ทุกครั้งเพราะไม่มี UI เรียก (แก้ `0019`) → smoke test ต้องเรียกฟังก์ชันจริงและ assert (§9)

---

## 7. Seed ของ user ใหม่

`handle_new_user()` (trigger AFTER INSERT บน `auth.users` · DEFINER) → `seed_defaults_internal(uid)` (**DEFINER**)

- **3 wallets** (ไม่มีคอลัมน์ `balance` — DROP `0011`) · **1 แถว `stock_sku_config`** (prefix `STZ`, `next_seq=0`) · **1 แถว `profiles`** (`display_name`=ชื่อก่อน `@` · `friend_code` สุ่มเติมคอลัมน์ NOT NULL · **`username`=null** ตั้งเองทีหลัง)

> **reproduce ล่าสุดของ `seed_defaults_internal` อยู่ที่ `0026` SECTION 6** (chain `0015`→`0016`→`0017`→`0026`) — **migration ตัวถัดไปที่แตะ seed ต้อง reproduce จาก `0026`** ตรวจเลข reproduce ล่าสุดจากไฟล์จริงก่อนเขียนทุกครั้ง

**หมวดหมู่ที่ seed = 18 หมวด** (13 expense + 5 income · คอลัมน์: `user_id, name, kind, is_stock_category, is_shop_category, is_system, system_key, icon, color_index, sort_order`):

| system_key | หมวด | kind | ป้าย | ลบได้ | เห็นในหน้ากรอกมือ |
|---|---|---|---|---|---|
| `stock_sale_income` | ขายสต็อก | income | — | ไม่ได้ | ซ่อน (`0026` กลับคำ) |
| `stock_cogs` | ต้นทุนขายสต็อก | expense | — | ไม่ได้ | ซ่อน |
| `debt_repayment_income` | ได้รับคืนจากเพื่อน | income | — | ไม่ได้ | ซ่อน (จาก `debt_settle`) |
| `debt_repayment_expense` | จ่ายคืนเพื่อน | expense | — | ไม่ได้ | ซ่อน (จาก `debt_settle`) |
| (null) | อาหาร · เดินทาง · ช้อปปิ้ง · บิล/ค่าบ้าน · บันเทิง | expense | — | ได้ | เห็น |
| (null) | เสื้อเข้าร้าน · รองเท้าเข้าร้าน | expense | `is_stock_category` | ได้ | ซ่อน (ป้ายสต็อก) |
| (null) | ค่าส่ง · บรรจุภัณฑ์ · ค่าธรรมเนียมขาย · การตลาด | expense | **`is_shop_category`** | ได้ | เห็น |
| (null) | เงินเดือน · ฟรีแลนซ์ | income | — | ได้ | เห็น |
| (null) | ค่าส่งที่เก็บจากลูกค้า | income | **`is_shop_category`** | ได้ | เห็น |

- **ชื่อหมวดยอดค้างเปลี่ยนใน `0017` ให้เลี่ยงคำว่า "หนี้"** — เดิม `0015`/`0016` = "จ่ายชำระหนี้"/"ได้รับชำระหนี้" ตอนนี้ = "จ่ายคืนเพื่อน"/"ได้รับคืนจากเพื่อน" (§11.4-14) · seed ปัจจุบัน (`0026`) ใช้ชื่อใหม่
- **`categories`:** `color_index smallint 1–6 NOT NULL` (trigger `set_category_color_index`) · **`categories.color` (hex) DROP แล้ว** (`0016`) · `icon text NOT NULL default 'tag'` **ไม่มี CHECK ชื่อไอคอน** (`lib/icons.tsx` fallback · §11.4-4) · **CHECK `categories_shop_flag_check`: `not (is_shop_category and (is_system or is_stock_category))`** (`0026`)
- **resolve หมวด system ด้วย `system_key` เท่านั้น ห้าม match ชื่อไทย** · หมวดร้านไม่มี `system_key` → resolve ด้วย `kind + is_shop_category` (§11.4-31)

---

## 8. Convention — กฎที่ห้ามละเมิด

### Migration
1. **ห้ามแก้ไฟล์ migration ที่ apply แล้ว** — เขียนไฟล์ใหม่เสมอ
2. **reproduce ฟังก์ชัน/seed จากเวอร์ชันล่าสุดบน main** (seed = `0026`) · **ตรวจเลข migration/seed ล่าสุดจากไฟล์จริงก่อนเขียนสเปกทุกใบ ห้ามอ่านจากเอกสารนี้** (§9)
3. เปลี่ยน signature → `drop function` ด้วย signature จริง (ไม่ใส่ `if exists`) แล้ว re-grant
4. ตารางใหม่ → enable RLS + policy
5. เจ้าของรันเอง ครอบ `begin; … commit;` + snapshot ฟังก์ชันเดิม · **หลังรัน ตรวจว่าไฟล์ `.sql` เข้า main จริงด้วย git** (กับดัก `0015` · §9)
6. **อ่าน `pg_constraint` ของทั้งตารางก่อนแก้** ไม่ใช่แค่ `information_schema.columns` (มองไม่เห็น CHECK · §9)

### SQL
7. **`RETURNS TABLE`/OUT param กลายเป็นตัวแปรใน scope** → alias ทุกตาราง qualify ทุกคอลัมน์ (กับดัก `qty_remaining` · §9)
8. **ค่าจาก CASE/`values` list ไม่ cast enum อัตโนมัติ** → cast `::public.enum_type` ตอน INSERT (บั๊ก `debt_create` · §9)
9. **Verification ต้องพิสูจน์ว่า "ทำงานได้" ไม่ใช่แค่ "มีอยู่"** — smoke test เรียกฟังก์ชันจริงใน `begin;…rollback;` แล้ว assert
10. เงินคำนวณใน numeric เท่านั้น

### Client
11. **ห้ามมีตรรกะซ้ำสองที่** — แยกเป็นฟังก์ชันกลางแล้ว import (สี=`catColor` · วันที่=`dates` · schedule=RPC · แถว ledger=`LedgerRow` · แถวล็อก=`ledger` · P&L ร้าน=`shopAccount` · หมวดร้าน=`shopCategory` · **ตั้งงบได้ไหม=`budgetable`** · **ถ้อยคำบรรทัดรองงบ=`budgetNote`**)
12. **ห้าม `as unknown as` / `as any` / `@ts-ignore` / `@ts-expect-error`** — รับ "รูปร่างขั้นต่ำ" structural แทน
13. `database.types.ts` generated ห้ามแก้มือ · alias อยู่ใน `db.ts`
14. **ห้ามใช้คำว่า "ผ่าน" ถ้ายังไม่ได้รัน `npm run build` + `npm test`** · **รายงาน skipped แยกจาก passed เสมอ** (§9)
15. **จับ error ด้วย code/status เท่านั้น ห้ามจับ substring** · error hint allowlist · **error ต้องถึงผู้ใช้** ห้าม catch ว่าง
16. **ห้ามเผยว่าอีเมลมีบัญชีในระบบหรือไม่** · ค้นหาเพื่อนใช้ `username` ไม่ใช่อีเมล
17. **ห้าม `new Date('YYYY-MM-DD')` แล้วอ่านค่า** (`formatBuildStamp` เป็นข้อยกเว้นมีคอมเมนต์) — helper กลางใน `dates.ts`
18. **สีต้องมาจาก token** ห้าม hex ดิบใหม่ใน `src/` · **hex เป็นแหล่งความจริงที่ `tailwind.config.ts` + `src/styles/index.css` เท่านั้น ห้ามคัดลอกไปที่อื่น (รวมเอกสารนี้)**
19. **คำที่ห้ามบนหน้าจอ:** หนี้ · เจ้าหนี้ · ลูกหนี้ · เรียกเก็บ · ทวง — **ชื่อในฐานข้อมูล/โค้ดยังเป็น `debt*` ตั้งใจ** (§11.4-14) · *หมายเหตุ: คำ "หนี้" ปรากฏใน **คอมเมนต์/ชื่อเทสต์** ของ `lib/budgetable.ts`+`budgetable.test.ts` ได้ (ไม่ใช่ข้อความบนจอ) — ดู §12*
20. **`transactions.is_shop_operating` เป็น derived column เขียนโดย trigger เท่านั้น** — client ห้ามส่งค่า (§4-6)
21. **1 PR = 1 เรื่อง** แตกจาก main ล่าสุด ไม่ stack · PR ที่ merge แล้ว = เริ่ม branch ใหม่จาก main
22. **กับดัก opacity (ใหม่):** ค่า opacity เปล่าใน Tailwind build นี้ **ต้องเป็นทวีคูณของ 5** (`/90`,`/95`) หรือ arbitrary (`/[0.92]`) — ค่าอย่าง `/92` **ไม่ถูก emit เลย ไม่ error ไม่ warning** (§9 · `Toast.tsx`)

---

## 9. กับดักที่เคยเกิดจริง — อย่าให้ซ้ำ

| เหตุการณ์ | บทเรียน |
|---|---|
| **เอกสารค้างหลังของจริงจนสเปกผิด** — เคยเชื่อว่า migration ล่าสุด `0021` ทั้งที่ถึง `0024` → สเปกสั่งสร้าง `0022` ผิด | **สเปกทุกใบต้องให้ agent ยืนยันเลข migration/seed ล่าสุดจากไฟล์จริงก่อนเขียน** (§8-2) |
| **`information_schema.columns` ไม่แสดง CHECK constraint** — migration ล้มเพราะชน CHECK ที่มองไม่เห็น | **อ่าน `pg_constraint` ของทั้งตาราง** (§8-6) |
| **ค่าจาก `values`/CASE ไม่ cast enum ให้** — ชน enum column · ตระกูล `debt_create` | cast `::public.enum_type` ตอน INSERT (§8-8) · `debt_create` มีบั๊กนี้ตั้งแต่ `0015` รอด verification ทุกครั้งเพราะไม่มี UI เรียก (แก้ `0019`) |
| **Supabase คืนแถวได้จำกัด** — รวมยอด client ที่ชนเพดานให้ผลน้อยกว่าจริงเงียบ ๆ | **guard เสมอ** — `useShopOperating` `.limit(SHOP_ROW_CAP=1000)` + `capped` เมื่อ `rows.length >= cap` → การ์ดเตือน "ตัวเลขอาจไม่ครบ" |
| `create or replace` ตอนเพิ่มพารามิเตอร์ → ฟังก์ชันซ้อน 2 ตัว | signature เปลี่ยน = drop ก่อนด้วย signature จริง |
| `qty_remaining` เป็นทั้ง OUT param และคอลัมน์ → การขายพังตอนกดจริง ทั้งที่ verification ผ่าน | qualify ทุกคอลัมน์ · smoke test (`0013` แก้เป็น alias) |
| **`0015` รันลง DB แล้วแต่ไฟล์ไม่เคยเข้า main** | `schema_migrations` กับ repo ต้องตรง · **ตรวจหลัง migration ว่าไฟล์เข้า main จริงด้วย git** · workflow `types-drift` ปิดช่องนี้ |
| **`tsc --noEmit` บน solution-style tsconfig → ตรวจ 0 ไฟล์ ผ่านเสมอ** | "ผ่าน" ต้องมาจากคำสั่งเดียวกับ CI (`tsc -b && vite build` + `vitest run`) |
| `getDate()` บน date-only string → วันเลื่อนใน timezone ติดลบ | อ่านวันจาก string ตรง ๆ · helper รวมใน `dates.ts` |
| **ป้ายพับในฮีโร่เป็นแถบเปล่าบน production ทั้งที่โค้ดถูก เทสต์ jsdom เขียว** — `<button>` จัดกึ่งกลางเนื้อหาเอง jsdom ไม่จำลอง layout | **เทสต์ jsdom "อยู่ใน DOM" ≠ ผู้ใช้เห็น** · fix = `flex flex-col` บนปุ่ม (load-bearing) + guard `WovenHero.visual.test.ts` |
| **dark mode พื้นหลังทั้งหน้าขาว** ทั้งที่ทุกเทสต์เขียว — เทสต์เก่าเช็คแค่ token/คลาส | guard เบราว์เซอร์จริง `AppLayout.theme.visual.test.tsx` วัดสีที่ compute จริง |
| **ไล่บั๊กที่แก้ไปแล้วหลายชั่วโมง** เพราะบันเดิลค้าง — SW precache เสิร์ฟ `index.html` cache-first | **merged ≠ deployed ≠ สิ่งที่เบราว์เซอร์รัน · อ่าน version stamp ก่อนไล่บั๊ก** · guard `pwa-freshness.visual.test.ts` |
| `grep "mint-" src/` ว่าง แต่สีเก่าอยู่ใน `categories.color` ใน DB | **grep พิสูจน์ได้แค่เรื่องในโค้ด · ค่าที่ seed ลง DB คืออีกแหล่งที่ grep มองไม่เห็น** (แก้ `0016`) |
| **รายงานเทสต์ "ผ่าน N" โดยมี skipped ซุกอยู่ — ซึ่งคือ visual guard ทั้งหมด** | guard `ctx.skip()` นอก CI (ใน CI `process.env.CI` → throw ไม่ skip) · อ่าน skipped ทุกครั้ง รายงานแยก · merge ต่อเมื่อ CI เขียว |
| **PR ถูกรายงานว่า merge แล้ว ทั้งที่ยังไม่เข้า main** | ยืนยันด้วย `git ls-remote origin main` |
| **`0020` เปลี่ยน signature RPC แล้ว merge PR `types-drift` เดี่ยว → main แดง** | migration ที่เปลี่ยน signature **ห้าม merge PR `types-drift` เดี่ยว** — merge พร้อม call site (§2.1) |
| Supabase free tier pause เอง หน้า login ค้างไม่บอกอะไร | error ต้องถึงผู้ใช้ · `errors.ts` `isConnectFailure` ดัก `AuthRetryableFetchError`/status 0,502-524,540,544 |
| **กับดัก opacity — `bg-ink/92` ไม่ compile เลย** (ใหม่) · `/92` ไม่ใช่ scale step ที่ Tailwind build นี้ emit → ไม่มีพื้นหลัง → toast ขาวบนพื้นสว่างอ่านไม่ออก · **ไม่ error ไม่ warning** | opacity เปล่าต้องเป็นทวีคูณ 5 หรือ `/[0.xx]` (§8-22) · ตระกูล "grep เห็นว่ามี แต่ของจริงไม่ emit" · guard `Toast.contrast.visual.test.tsx` (`src/components/Toast.tsx` คอมเมนต์เต็ม) |
| **token `toast` จงใจไม่มี dark override** (ใหม่) · ถ้าชี้กลับไปที่ `ink` → `ink` พลิกเกือบขาวในโหมดมืด → ตัวอักษรขาวหาย | `--color-toast` นิยามใน `:root` และ **ไม่ override ใน `html.dark`** — toast เป็นพื้นเข้มเสมอทุกธีม · คอมเมนต์ล็อกไว้ทั้งใน `index.css` และ `Toast.tsx` ("Do not point it back at `ink`") ห้ามเข้าใจว่าลืม dark variant |
| **`useDialogA11y` ทำ input หลุดโฟกัสทุกตัวอักษร** (ใหม่) · effect ย้าย/คืนโฟกัสผูก dependency กับ `onClose` ที่ caller ส่ง inline (identity ใหม่ทุก render) → ชีตที่**ยกค่าไปไว้ใน state ของหน้า** re-render ทุกคีย์ → effect rerun → caret หลุด → คีย์บอร์ดมือถือปิด | `onClose` ขี่ `onCloseRef` · effect depend `[active]` เท่านั้น · **ห้ามเติม `onClose` กลับเข้า dependency** (คอมเมนต์ยาวใน `useDialogA11y.ts` · เทสต์ `BudgetPage.editor.test.tsx`) |
| **`truncate` ตัดชื่อเงียบ** (ใหม่) · แถวหมวดที่ 360px ตัดชื่อยาวสุด ~9px jsdom ไม่เห็น (ไม่ layout) | ยอมรับโดยตั้งใจ + `title={c.name}` ให้เห็นชื่อเต็ม + guard `CategoriesManager.visual.test.tsx` ตรึง clip **≤15px** (จับ regression ไม่ใช่บังคับพอดี · เพิ่ม badge/ปุ่มใดในแถวจะพุ่งเกินทันที) |

---

## 10. สถานะปัจจุบัน

**Migration:** `0001`–`0027` (`ls supabase/migrations/*.sql | wc -l` = **27** · ล่าสุด `0027_drop_target_price.sql`) — **ไม่มี migration ใหม่ตั้งแต่ audit ก่อน** (ใบ 1–5 เป็น client ล้วน)

**หน้าจริงในแอป:** **13** ไฟล์ `*Page.tsx` (`find src/pages -name '*Page.tsx' | wc -l` = 13) · `router.tsx` มี **14 route** (13 หน้า + catch-all `*` → `<Navigate to="/" replace />`) — eager import ทั้งหมด:
- ไม่ต้อง auth: `/login` · `/forgot-password` · `/reset-password`
- ใต้ `RequireAuth` + `AppLayout`: `/` Home · `/history` · `/debts` · `/debts/friend/:friendId` · `/stock` · `/budget` · `/settings`
- ใต้ `RequireAuth` **นอก** `AppLayout` (เต็มจอ ไม่มี bottom nav): `/add` · `/stock/intake` · `/stock/queue`
- *(หมายเหตุ: คอมเมนต์ในหัว `router.tsx` ยังเขียน "10 screens" = คอมเมนต์ค้าง ไม่ตรงกับ 13 หน้าจริง — จดไว้ ไม่แก้ในใบนี้)*

**Bottom nav (เปลี่ยน 6 → 5):** มือถือ (`AppLayout.tsx` `sm:hidden`) = **4 แท็บ + FAB กลาง = 5 ช่อง** — LEFT `หน้าหลัก`/`ประวัติ` · FAB `+`→`/add` · RIGHT `ยอดค้าง`/`สต็อก` · **`ตั้งค่า` ออกจากแถบล่างแล้ว** (เข้าจากไอคอนเฟืองมุมขวาบนหน้าแรก · §11) · **`งบประมาณ` ไม่อยู่ในแถบล่าง** · จำนวนช่องคี่ทำให้ FAB อยู่กึ่งกลางจริง (เดิม 6 ช่องทำให้เยื้อง) · **rail เดสก์ท็อป (`sm:flex`) ยังครบ 6** (หน้าหลัก/ประวัติ/ยอดค้าง/งบประมาณ/สต็อก/ตั้งค่า)

**เทสต์:** `npm test` (`vitest run`) รอบนี้ = **442 เคส / 52 ไฟล์ — ผ่าน 433 · skip 9** (`Tests 433 passed | 9 skipped (442)` · Test Files 52 passed) · 52 = `find src \( -name '*.test.ts' -o -name '*.test.tsx' \) | wc -l`
- **9 ที่ skip = guard เบราว์เซอร์จริงทั้งหมด** (8 ไฟล์ `*.visual.test.*`; `AppLayout.visual` มี 2 เคส → 9) · `ctx.skip()` นอก CI เพราะ Chromium ไม่พร้อม → **รันในเครื่องพิสูจน์ guard พวกนี้ไม่ได้ ต้องรอ CI**

**Guard เบราว์เซอร์จริง = 8 ไฟล์** (`find src -name '*.visual.test.*'`):
- `AppLayout.visual.test.tsx` — bottom nav ทุกช่อง ≥44px + FAB อยู่กึ่งกลางแถบ (2 เคส)
- `AppLayout.theme.visual.test.tsx` — พื้น+อักษร shell อ่านออกจริงทั้ง light/dark
- `WovenHero.visual.test.ts` — ป้ายพับถูกวาดจริงที่จุดกึ่งกลาง
- `charts.visual.test.ts` — ยอดรวมกลางโดนัทอยู่ในวงทุกขนาดเลข + เคส mask
- `pwa-freshness.visual.test.ts` — client เปิดใหม่หลัง deploy รันบันเดิลใหม่ ไม่ใช่ shell ที่ precache
- `CategoriesManager.visual.test.tsx` — **ใหม่** · ชื่อหมวดยาวสุดที่ 360px ถูก clip ≤15px (§9 truncate)
- `Toast.contrast.visual.test.tsx` — **ใหม่** · toast มีพื้นหลังจริง + ตัวอักษรอ่านออก (§9 opacity/toast)
- `AddPage.keypad.visual.test.tsx` — **ใหม่** · แป้นเลข dock ยึดขอบล่างจริง (ใบ AddPage)

**Cloudflare Worker (`src/worker/`):** `index.ts` fetch เดียวหุ้มทุก response ด้วย security headers · `/api/*` เท่านั้น dynamic (`POST /api/ai`→`handleAi`) ที่เหลือ fallback `env.ASSETS.fetch` · `ai.ts` = AI proxy **ยังเป็น stub** · `security.ts` = HTTP security headers (CSP `default-src 'self'`, `frame-ancestors 'none'`, HSTS) · `ANTHROPIC_API_KEY` runtime secret · *(ยังไม่ได้ตรวจซ้ำทุกบรรทัดรอบนี้ — worker ไม่อยู่ในชุดที่เปลี่ยน)*

**Version stamp + PWA:** `vite.config.ts` `define` `__COMMIT_SHA__` + `__BUILD_TIME__` แสดงท้าย `SettingsPage` แตะแล้วคัดลอก · PWA `registerType:'prompt'` · navigation ผ่าน **NetworkFirst** (`app-shell`) · `skipWaiting`+`clientsClaim`+`cleanupOutdatedCaches` · *(ยกจากฉบับเดิม โครงไม่เปลี่ยน — ยังไม่ได้ตรวจ vite.config ทุกบรรทัดรอบนี้)*

**ทำเสร็จแล้ว (มีในโค้ดจริง):** ระบบขายครบวงจร · บัญชีร้าน 2 ถัง + `ShopProfitCard` · หมวดร้าน + ป๊อปอัพค่าส่งขาเข้า · SKU prefix-only · ทุนจม/วันในคลัง · ยอดค้างครบวงจร · ค้นหาประวัติจริง (RPC เดียว) · **หน้าประวัติมี UI ตัวกรองเดือนแล้ว** (`?m=` + ชีตเลือกเดือน · `HistoryPage`) · **หน้างบเลื่อนดูเดือนย้อนหลังแล้ว** (`BudgetPage` ส่ง `month` เข้า `useBudgets`/`useMonthSpending` ผ่าน `MonthSwitcher`) · หน้าแรกเลื่อนดูเดือน · dark mode + guard · ตั้งค่าเข้าจากเฟืองหน้าแรก · redesign แถบล่าง 4+FAB · หน้า `/add` ยกเครื่อง (§11) · หน้างบใช้ตัวเลขแทนคำตัดสิน + กันตั้งงบหมวดนอกงบ (ใบ 5)

**ยังไม่ได้ทำ / หนี้ที่รู้ตัว:**
- **`useMonthBudgetTotal` (แถบ "งบที่ตั้งไว้" หน้าแรก) ยังไม่กรองด้วย `isBudgetableCategory`** — `useBudgets` (หน้างบ) กรองแล้ว แต่ hook นี้ยัง `.select('amount')` + `reduce` รวมทุกแถวดิบ → ตรรกะอยู่สองที่ · ใบ 5 แก้อาการชั่วคราวด้วย SQL ลบแถวงบเก่าที่ตกค้าง แต่จะพองอีกถ้ามีแถวใหม่เกิด → **รวม predicate (ใบ 13)**
- **`bg-ink` + ตัวอักษรขาว ยังเหลือที่ `StockFields.tsx` (badge เลขลำดับ) และ `StockPage.tsx` (`bg-ink/70` overlay รูป)** — `ink` พลิกเป็นเกือบขาวในโหมดมืด (`--color-ink` override ใน `html.dark` · `index.css`) → contrast ต่ำ (ใบ 9) · (`bg-ink` จุด 7px ใน `CategoriesManager` ไม่มีตัวอักษร ไม่นับ)
- **ช่องว่างขอบล่างระดับ shell** — ราก `#root { height: 100% }` ใน `src/styles/index.css` (ใบ 10)
- **คำบทบาทบนจอ "เติมสต็อก" ไม่ตรงกับหัวหน้า `/stock/intake` ("รับเข้าสต็อก")** — `CategoriesManager` `ROLE_LABEL.stock='เติมสต็อก'` vs `StockIntakePage` "รับเข้าสต็อก" (ใบ 11)
- **แถบเลือกยังมีสอง implementation** — `SegmentedControl.tsx` (generic `role="tablist"` · **ผู้เรียกเดียว = `ShopProfitCard`**) กับ `RolePicker` ใน `CategoriesManager` (`role="radiogroup"` เลือกบทบาทหมวด) · **ชื่อไม่ชนกันแล้ว** (เดิมชนชื่อ `SegmentedControl` — ใบก่อนเปลี่ยน inline เป็น `RolePicker`) · คนละ a11y role โดยตั้งใจ (tablist vs radiogroup) → จะยุบหรือไม่เป็นดุลพินิจ (คนละใบ)
- **ค่าดำเนินร้านรวมยอดฝั่ง client ไม่ใช่ RPC** (`useShopOperating` · ตั้งใจไม่มี migration) + guard `SHOP_ROW_CAP=1000` · ชนเพดานจริง → ย้ายเป็น RPC aggregate
- **เกณฑ์ "ค้างนาน 60 วัน" (`AGE_OLD_MAX`) เป็นตัวเลขที่เดา** — คอมเมนต์ยอมรับเอง ควรทบทวนหลังใช้จริง
- **ข้อความ error ในชุด RPC ยอดค้างยังใช้คำที่ห้ามขึ้นจอ (หนี้/เจ้าหนี้/ลูกหนี้)** — ตรวจรอบนี้: **ไม่มีในหน้าจอ** แต่ **ยังอยู่ใน `RAISE EXCEPTION` ของ RPC** (`grep 'หนี้' supabase/migrations` เจอ `0015`/`0018`/`0019`/`0021` — RAISE · และ `0016`/`0017` — คอมเมนต์) → ผู้ใช้เห็นได้จริงเพราะ `errors.ts` ส่งไทยผ่านตรง ๆ · **`0021` หัวไฟล์ประกาศว่ากวาดคำนี้ "OUT OF SCOPE โดยตั้งใจ"**
- **`friend_code` + `generate_friend_code()` เลิกใช้แต่ยังอยู่** — `profiles.friend_code` ยัง `not null` (`database.types.ts`) · ยัง seed เติมคอลัมน์ · **ไม่มี code path ใน `src/` อ่าน** → ยังจริง
- **`src/lib/offlineQueue.ts` ไม่มีใครเรียก (dead code)** — `grep -rn offlineQueue src | grep -v lib/offlineQueue.ts` = ว่าง · stub เผื่อ part 5 ที่ไม่เคยต่อ (คอมเมนต์ workbox + `README.md` ยังพูดถึงราวกับใช้อยู่ = เอกสารค้าง)
- **ยังไม่มี ESLint** — `npm run lint` = `tsc -b`
- **`transactions_search` ยังไม่มีหลักฐานว่าถูกรัน smoke test** ทั้งที่ UI เรียก production (smoke อยู่ในหัวไฟล์ migration พร้อมรัน · ยังไม่ได้ตรวจว่ารันแล้ว)
- ยอดเงินคงเหลือรายกระเป๋า · ถังขยะ/สำรองข้อมูล · ฟีเจอร์ AI (โครงเปล่า) — **migration ถัดไป (กระเป๋าเงิน) จะเป็นก้อนใหญ่**

---

## 11. Redesign + ฟีเจอร์ — สถานะปัจจุบัน (ไม่ใช่แผน)

> **แหล่งความจริงของสี:** `tailwind.config.ts` + `src/styles/index.css` (คอมเมนต์กำกับ locked/role) — **เอกสารนี้ไม่คัดลอกค่า hex**
> **เอกสารดีไซน์:** `docs/design/…`

### 11.1 ฮีโร่ — ป้ายทอคอเสื้อ (`src/components/WovenHero.tsx`)
**หลักการ: กิมมิกต้องเผย ไม่ใช่ซ่อน**
- ป้ายทอ **3 ใบ ล็อกที่ 3 — ไม่มีใบยอดค้าง** · ลำดับ `SAFE TO SPEND` → `BUDGET` → `STOCK PROFIT` · ใบพับโชว์ eyebrow + ตัวเลขย่อ เรนเดอร์ไม่มีเงื่อนไข
- **`flex flex-col` บนปุ่มป้ายเป็น load-bearing** — ห้ามถอด (บั๊กแถบเปล่า · §9)
- **ปุ่มลูกศรเข้า `/budget` บนป้าย BUDGET** เป็น **sibling button** (แสดงเมื่อ `selected==='budget'`) · ปุ่มตา hideBalance ก็ sibling (เมื่อ `selected==='safe'`) — **ไม่ซ้อน `<button>` ใน `<button>`** · **gesture "กดป้ายพับเพื่อสลับ" ยังเดิม** (ป้ายพับ `onClick` → `setSelected`)
- บรรทัดรอง SAFE หักบิลรอจ่าย (`computeSpendable`) · เกินยอด → ไอคอนเตือน ไม่ clamp
- **เดือนที่จบแล้ว** (`monthEnded`): eyebrow → `LEFT OVER` + recap รับ/จ่าย
- **ชิป "เกินงบ ฿X" ดึงถ้อยคำจาก `lib/budgetNote.overBudgetNote` ที่เดียว** (ใบ 5) — แหล่งเดียวกับบรรทัดรองต่อหมวดในหน้างบ ไม่มีสองชุดคำ (`overBudgetChip` delegate)
- เรขาคณิต (`CONTAINER_H`/`LABEL_H`/`POSITIONS`) มี guard `WovenHero.visual.test.ts` — **ค่าอ่านจากไฟล์ ไม่คัดลอกมาที่นี่**

### 11.2 สี — คราม + สีหมวดต่อ slot (`tailwind.config.ts` + `src/styles/index.css`)
- สีแบรนด์ = คราม · `brand.fabric*`/`thread` ขับ WovenHero (คอมเมนต์ "locked — do NOT change")
- `cat.1–6` + `cat.other` เป็น CSS variable (light `:root` · dark override `html.dark`) — **สีหมวดมาจาก `color_index` ผ่าน `catColorVar()` ที่เดียว** · cat.1 = สีแบรนด์
- **mint ถูกนำกลับมา** — กลับคำจาก PR-C · คอมเมนต์ "do NOT fix back out" ห้ามลบเป็น leftover
- **token `toast` theme-independent — พื้นเข้มเสมอทุกธีม ไม่มี dark override โดยตั้งใจ** (§9) · `theme-color`/`manifest.theme_color` mirror `--color-surface`

### 11.3 โดนัท (`src/components/charts.tsx`)
- ตัวเลขรวม **บรรทัดเดียว** · `donutCenterFontSize(charCount)` = แหล่งเดียวที่ตัดสินขนาด · guard `charts.visual.test.ts` · `largestRemainderPercents()` legend รวม 100 · สี slice จาก `color_index`

### 11.4 การตัดสินใจสำคัญ — ทำไม (หัวใจของไฟล์)
โค้ดบอก "ทำอะไร" เอกสารบอก "ทำไม" · ข้อที่**กลับคำ**สำคัญที่สุด:

1. **สีแบรนด์ย้ายออกจากเขียว** เพราะเขียวถูกจองด้วย "เงินเข้า"
2. **สีหมวดปักหมุดต่อหมวด (`color_index`) ไม่เรียงตามยอด** — สีไปโผล่สองที่ (โดนัท+แถว) ถ้าเรียงตามยอดจะสลับทุกเดือน
3. **DB เก็บความหมาย client เก็บหน้าตา** — เปลี่ยนพาเลตต์ไม่ต้องแตะ DB
4. **`icon` ไม่มี CHECK** — `lib/icons.tsx` fallback ชื่อผิดเสื่อมนุ่มนวล
5. **โดนัท: ขยายรู ไม่ย่อตัวเลข**
6. **หน้าแรกตอบ "เหลือเงินเท่าไหร่" งบเป็นป้ายใบสอง**
7. **บิลรอจ่าย: หักเฉพาะรายจ่าย ไม่บวกรายรับ** — บวกรายรับที่ยังไม่เข้า = ชวนใช้เงินที่ยังไม่มี
8. **ห้าม clamp เป็น 0 เงียบ ๆ** — เกิน/ติดลบ บอกตรง ๆ + ไอคอน
9. **texture + เงา = ข้อยกเว้นเฉพาะป้ายทอ มีได้ที่เดียวต่อหน้า** · motion จาก token + เคารพ `motion-reduce`
10. **เส้นประถูกใช้กับโซนวางรูปแล้ว** — ห้ามให้ความหมายที่สอง
11. **`hideBalance` = "ซ่อนตอนกวาดตา เปิดตอนตัดสินใจ"** — **ชีตที่ขอให้ยอมรับข้อผูกพัน (`ConfirmDebtSheet`·`SettleSheet`·แผงขายใน `StockEditSheet`) ต้องแสดงเงินเสมอ ไม่รับ prop `hideBalance`** · **หน้างบ mask ทุกยอด** (ฮีโร่/แถบนอกงบ/แถวต่อหมวด) + ปุ่มตา (ใบ 5)
12. **private ไม่รวมในพาดหัว และไม่รวมกับ shared** — `computeFriendLedger` แยกถัง · net-within-friend แต่ gross-across-friends
13. **ย้อนการเคลียร์ได้เฉพาะคนที่กดเคลียร์เอง** (`settled_by = auth.uid()`)
14. **ชื่อฟีเจอร์ = "ยอดค้าง"** · คำห้ามบนจอ: หนี้/เจ้าหนี้/ลูกหนี้/เรียกเก็บ/ทวง · **schema/โค้ดยังเป็น `debt*` ตั้งใจ** → gap ระหว่าง "จ่ายคืนเพื่อน" บนจอ กับ `debt_repayment_expense` ใน DB (และคำ "หนี้" ที่ยังค้างใน RAISE · §10)

**— รอบฟีเจอร์หลัง redesign —**

15. **หน้าประวัติใช้ RPC เดียว** (`transactions_search`) — window aggregate ทำให้หน้ากับยอดรวมมาจาก query เดียว ขัดกันไม่ได้เชิงโครงสร้าง
16. **"เติม cache" หลังบันทึก ไม่ใช่ optimistic update** (`txCache`) · `insertRecent` **เรียงใหม่ ไม่ prepend** (AddPage ย้อนวันได้)
17. **effect ที่ seed ฟอร์มต้องผูกกับ `id` ไม่ใช่ object** — `refetchOnWindowFocus` + native picker → object ใหม่ → ทับที่พิมพ์ค้าง
18. **undo การลบคืนแถวด้วย `id` + `created_at` ชุดเดิม** (`txRestore`) · guard "ห้ามคืนแถวล็อก" ใช้ `lockedRowInfo()`
19. **"เดือน" คือ string `YYYY-MM` ไม่ใช่ Date** (`dates.ts`) · `addMonthsToKey` เลขคณิตบน year*12+month
20. **`computeHomeSummary` แยก `month` ออกจาก `now`** · `daysLeftInMonthKey(key)` คืน 0 เมื่อเดือนจบ
21. **`useUpcomingBills` จงใจไม่รับเดือน** — ผูกกับ "ตอนนี้" เสมอ · guard `MAX_OCCURRENCES_PER_RULE=40`
22. **`onTap` ป้ายด่วนอยู่บน `click` ไม่ใช่ `pointerUp`** · `moveTolerancePx` กันปัดเลื่อนกลายเป็นบันทึก

**— รอบ SKU prefix-only (`0025`) —**

23. **ตัดท่อนแบรนด์ออกจาก SKU** — แบรนด์ไทยแปลง code ละตินไม่ได้ · SKU เป็นเลขอ้างอิงไม่ซ้ำ · คอลัมน์ format ที่ไม่มีใครใช้ drop ทิ้ง
24. **ตัวนับ SKU ผูกกับ user ไม่ผูกกับ prefix** — ผูก prefix แล้วเปลี่ยนกลับจะชนเลข · preview ไม่จองเลข → ถ้อยคำ "โดยประมาณ"

**— รอบหมวดร้าน (`0026` · ถังที่ 2) —**

25. **ป้ายอยู่ที่หมวด แต่ธงคัดลอกลงตัวรายการ** (`is_shop_category`→trigger→`is_shop_operating`) — predicate ทุกตัวอ่านจากตัวรายการไม่ต้อง join · **แลกกับ: เปลี่ยนป้ายแล้วตัวเลขเดือนเก่าขยับ** (trigger 2 ไล่รีไรต์) ยอมรับโดยตั้งใจ · `CategoriesManager` เตือน
26. **`is_stock_category` ไม่อยู่ในสูตรงบ** — รายการซื้อเข้าถูกตัดด้วย `is_stock_purchase`/`is_stock_cogs` บนตัวรายการ · ป้ายสต็อกคุมแค่ว่าหมวดโผล่หน้ากรอกมือไหม (`isEntrySelectableCategory`)
27. **ปิดการกรอก `stock_sale_income` ด้วยมือ — กลับคำจาก §7 เดิม** เพราะรายรับก้อนนั้นไม่มี COGS คู่ → พองรายรับขณะ STOCK PROFIT นิ่ง · ไม่ลบหมวด แค่ซ่อนจากตัวเลือก (`isEntrySelectableCategory`)
28. **ค่าดำเนินร้านห้ามเกลี่ยลงรายชิ้น** — กำไรขั้นต้นดูรายชิ้น (ถัง 1) · กำไรสุทธิดูรายร้านรายเดือน (ถัง 2)
29. **ป้ายหมวดเป็นตัวเลือกเดียว 3 แบบใน UI แต่ยัง 2 คอลัมน์ใน DB** — `is_stock_category`/`is_shop_category` mutually exclusive (CHECK) · **ห้ามรวมเป็นคอลัมน์เดียวใน DB — งาน UI ล้วน** · `useSetCategoryRole` เขียนสองคอลัมน์ครั้งเดียว (`ROLE_COLUMNS`) กัน (true,true) · **ปุ่มลบซ่อนเมื่อ `is_system`** (ไม่ใช่ disable)

**— รอบสรุปกำไรร้าน (T2) —**

30. **ค่าดำเนินร้านรวมฝั่ง client ไม่ทำ RPC** — merge รวดเดียวไม่รอ types-drift · guard `SHOP_ROW_CAP` + `capped` เตือน · **กำไรสุทธิย้อนหลังไม่นิ่งโดยตั้งใจ** (`REVALUATION_NOTE` ใน `ShopProfitCard`)

**— รอบถามค่าส่งหลังปิดการขาย (T4) —**

31. **ป๊อปอัพหลังปิดการขายถามเฉพาะค่าส่งขาเข้า ไม่ถามขาจ่าย** — ขาจ่ายเกิดรอบเย็นก้อนเดียว ไม่ใช่ตอนขาย · **หมวดร้านไม่มี `system_key`** → resolve ด้วย `kind==='income' && is_shop_category` (`lib/shopCategory.ts`) · เจอ 1 → preselect · หลายตัว → ส่งแค่ `type:'income'` · 0 → ไม่แสดง · **ไม่ prefill ยอด** · `AddPage` รับ `returnTo` ผ่าน `isInternalPath`

**— รอบตัดราคาเป้าหมาย + ทุนจม (`0027`) —**

32. **ตัดราคาขายเป้าหมาย + กำไรคาดการณ์ทิ้ง — แทนด้วยทุนจม** — `target_price` คือราคาที่ "หวัง" · เดิมคูณโชว์ "รอขาย" = ตัวเลขที่ดูเหมือนเงินแต่ไม่ใช่เงิน · แทนด้วย **ทุนจม** (`computeSunkCost` reuse `isStale`) · ฿0 = ข่าวดี · **ห้ามเอา `target_price`/กำไรคาดการณ์กลับมา**
33. **ห้ามเติมราคาขายล่วงหน้าในแผงขาย** — ช่องเปิดมาว่าง+focus · หลักการเดียวกับ "ไม่ prefill ค่าส่ง"

**— รอบงบ: ตัวเลขแทนคำตัดสิน + กันตั้งงบนอกงบ (ใบ 5 · client ล้วน) —**

34. **`computePace()` แยกหน้าที่ — ตัดสิน "สถานะ" อย่างเดียว ถ้อยคำอยู่ที่ `paceNote()`** (`lib/budgetNote`) · สถานะ = `over`/`fast`/`unused`/`on_track` (เพิ่ม `unused` = ตั้งงบแล้วยังไม่ใช้) · คืน `remaining`/`over` **ไม่ clamp** · **`computePaceStatic()` สำหรับเดือนที่ปิดแล้ว** (ไม่มี `fast` — ไม่มีวันเหลือให้เทียบ) แชร์ `baseState()` กับ `computePace` ไม่เขียนตรรกะซ้ำในหน้า · **บรรทัดรองเลิกใช้คำตัดสิน "พอดีจังหวะ"** → บอกยอดจริง (`เหลือ ฿X` / `ยังไม่ได้ใช้` / `เหลือ ฿X · ใช้เร็วกว่าจังหวะ` / `เกินงบ ฿X`) เพราะสถานะต่างกันเคยได้ป้ายเดียวจนอ่านเป็นข้อความประดับ · คำเตือนโผล่เฉพาะตอนมีของให้เตือน (over → ไอคอน + สี expense)
35. **`isBudgetableCategory()` (`lib/budgetable.ts`) — ตั้งงบได้เฉพาะ `expense` ที่ไม่ใช่ system/shop/stock** · ใช้กรอง **ทั้งตัวเลือกในชีตตั้งงบ และแถวงบเก่าที่ตกค้าง** (ซ่อนจากลิสต์ + ไม่นับในยอดรวมหน้างบ) · เดิมกรองแค่ `is_stock_category` → หมวด `ต้นทุนขายสต็อก`/`จ่ายคืนเพื่อน`/หมวดร้าน เคยตั้งงบได้แล้วค้าง 0% ตลอด + เบียดโควตางบรวม · **SQL ลบแถวเก่า** ส่งให้เจ้าของรันเอง (ไม่ใช่ migration)
36. **ฐานของ "นอกงบ" ถูกอยู่แล้ว — ไม่ต้องแก้** — `฿12,380` คำนวณจาก `isBudgetSpendingRow` ผ่าน SQL ของ `useMonthSpending` แล้ว `computeBudgetSummary` รวม key ที่ไม่มีงบ · สามกลุ่มที่ตัดจากงบ (ระบบ/ร้าน/เติมสต็อก) ถูกกัน**ที่ระดับ flag ของธุรกรรม** (`is_stock_cogs`/`is_debt_settlement`/`is_shop_operating`/`is_stock_purchase`) ซึ่ง trigger + CHECK บังคับให้ตรงบทบาทหมวด และ `isEntrySelectableCategory` กันไม่ให้ลงรายการมือเข้าหมวดพวกนี้ → ตัวเลขไม่พอง · **บันทึกไว้เพราะเป็นจุดที่ดูเหมือนบั๊กแต่ไม่ใช่** · แก้ที่ระดับหมวดจะไปแตะสูตรเงิน (`computeBudgetSummary`) → หยุดไว้ (ใบ 13)

**— รอบ redesign แถบล่าง + ทางเข้าตั้งค่า + หน้า /add (ใบ 1–4 · client ล้วน) —**

37. **แถบล่างเหลือ 4 แท็บ + FAB กลาง = 5 ช่อง · ตั้งค่าออกจากแถบ** (§10) — จำนวนคี่ทำให้ FAB กึ่งกลางจริง · **ทางเข้าตั้งค่า = เฟืองมุมขวาบนหน้าแรกข้างกระดิ่ง "เรื่องที่รอดู"** (`HomePage` · เฉพาะหน้าแรก ไม่ใส่ทุกหน้า · เฟือง + กระดิ่งเป็นปุ่มแยก ≥44px · negative margin กันแถวโต) · rail เดสก์ท็อปยังครบ 6 (มีที่พอ)
38. **หน้า `/add` ยกเครื่อง — แป้นเลขเป็น dock ยึดขอบล่าง** (`AddPage`) · เรียง **แถบเตือน → บันทึก → แป้น** ใน dock ที่ `position:absolute` (โตขึ้นบน แป้นไม่ขยับ) · **padding-bottom ของพื้นที่เลื่อนวัดด้วย `ResizeObserver` จากความสูง dock จริง ไม่ hardcode** (มี fallback `measure()` เผื่อ jsdom) · แป้นกางตอนเข้า (`keypadOpen=true`) ยุบเมื่อแตะนอกพื้นที่ยอด (`onPointerDownCapture`) เปิดใหม่ด้วยแตะช่องยอด/หัวสลับ · guard `AddPage.keypad.visual.test.tsx`
39. **หน้า `/add` ตัดบล็อก "ใช้บ่อย" ที่ซ้ำออก** — เดิมมีแถว "ใช้บ่อย" แยกที่ทับหมวดในลิสต์ล่าง (อาหารโผล่ซ้ำ) · ตอนนี้ `orderByFrequency` (ใช้ `topCategories`/`frequentIds`) **เรียง frequent ขึ้นต้นลิสต์เดียว** ไม่โชว์ซ้ำ · ranking freeze ต่อ session กันปุ่มขยับใต้นิ้ว
40. **`CategoriesManager` เหลือแถวเดียวต่อหมวด + `RoleBadge`** (ส่วนตัวไม่ badge) · **ตัวเลือกบทบาทย้ายเข้า `RolePicker`** (ใช้ร่วมทั้งฟอร์มสร้างและชีตแก้ไข · `role="radiogroup"`) · **`ROLES_BY_KIND`: expense = [ส่วนตัว, เติมสต็อก, ของร้าน] · income = [ส่วนตัว, ของร้าน]** (รายรับไม่มี "เติมสต็อก" — ซื้อสต็อกเป็นรายจ่ายเสมอ · สลับ kind แล้ว role ที่ใหม่ไม่มีถูก reset เป็นส่วนตัว) · **ชื่อบทบาทบนจอ = `ส่วนตัว`/`เติมสต็อก`/`ของร้าน`** (เดิม ทั่วไป/เข้าสต็อก/ร้าน) — **ชื่อคอลัมน์/ตัวแปรใน DB คงเดิม** (`ROLE_LABEL` เป็น label จอเท่านั้น)
41. **แถว "หมวดที่ลงสต็อกอัตโนมัติ" ใน `SettingsPage` ถูกลบ** — เป็นทางลัดซ้ำ (`onClick` เดิมไปหน้าจัดการหมวดเดียวกับแถว "หมวด") · เหลือแถวเดียวจึง**ยุบหัวข้อกลุ่ม "สต็อก" มารวมกลุ่มบน** (คอมเมนต์ในไฟล์อธิบาย)

### 11.5 บั๊กรอบก่อน — แก้แล้ว
B1–B14 (รอบ redesign) · รอบฟีเจอร์: ค้นหาแมตช์แค่ note · ยอดรวมประวัติยิง query ซ้ำ · dark-mode พื้นขาว · ป้าย "บันทึกแล้ว" โกหก · **toast มองไม่เห็น (opacity `/92` ไม่ emit + `ink` พลิกในโหมดมืด)** · **caret หลุดในชีตที่ยกค่าไปหน้า (`useDialogA11y`)** · **ชื่อหมวดถูก `truncate` เงียบ** — บันทึกที่ §9/§11.4 ตามชนิด

### 11.6 ยอดค้าง (friend outstanding balances) — ครบวงจร
**แนวคิด:** ติดตามยอดค้างระหว่างเพื่อน แยก **"ตกลงกันแล้ว" (shared)** กับ **"จดไว้เอง" (private)** ไม่รวมกันทุกที่ (§11.4-12) · ฟีเจอร์ cross-user ตัวเดียว → security model ต่าง (§3)

- **ตาราง (`0015`):** `profiles` · `friend_connections` (`status`=`pending|accepted`) · `debts` (`creditor_id`/`debtor_id`/`amount`/`visibility`=`private|shared`/`status`/`settled_by`/`settlement_transaction_id`) · `debt_events` (audit)
- **สถานะ (`debt_status`):** `pending_confirmation` → `confirmed` → `settled` · หรือ `rejected`/`cancelled`
- **Flow + RPC (`useFriends.ts`):** เพิ่มเพื่อน `friend_request_send(p_username)`/`respond` (ค้นด้วย username) · บันทึก `debt_create` (shared รอ `debt_confirm`/`reject` · private `confirmed` ทันที) · `debt_share_private`/`debt_delete_private`/`debt_cancel` · เคลียร์ `debt_settle`/**`debt_settle_many`** (atomic ทรานแซกชันเดียว client ไม่ลูป) · ย้อน `debt_settle_reverse` (เฉพาะคนที่กดเคลียร์ · §11.4-13)
- **เชื่อมเงินหลัก:** เคลียร์ = single-party → **transaction จริง 1 แถว `is_debt_settlement=true`** (หมวด `debt_repayment_*`) · `settlement_transaction_id` ผูกกลับ · อีกฝ่ายมี nudge ให้เพิ่มเอง · แถวนี้ "ล็อก" (§5) นับใน headline ตัดจาก budget (§4)
- **สรุป (`debtsSummary.ts`):** `computeFriendLedger` แยก agreed/private/settled/pending/rejected · `computeDebtsHeadline` อ่าน `friend_debts_summary.shared_net`
- **หน้าจอ:** `/debts` (`DebtsPage`) · `/debts/friend/:friendId` (`FriendHistoryPage`) · ชีต `AddFriendSheet`/`DebtFormSheet`/`ConfirmDebtSheet`/`SettleSheet`/`ProfileManager`
- **username (`0020`):** `^[a-z0-9_]{3,20}$` (CHECK + `USERNAME_RE` mirror · unique) · **ตั้งครั้งเดียว** (trigger `profiles_username_setonce`) · เจ้าของแก้ผ่าน SQL Editor ได้ (`auth.uid()` null → ผ่าน guard)

### 11.7 flow หลังปิดการขาย — ค่าส่งขาเข้า
เหตุผล + resolve หมวด: §11.4-31 · `StockEditSheet.doSell` สำเร็จ → ถ้า `hasShopIncomeCategory` แสดง `ConfirmDialog` "ลูกค้าจ่ายค่าส่งมาด้วยไหม?" → "บันทึกค่าส่ง" → `navigate('/add', {state:{prefill:{type:'income',categoryId?}, returnTo:'/stock'}})` · เทสต์: `lib/shopCategory.test.ts` · `StockEditSheet.test.tsx` · `AddPage.render.test.tsx` + `AddPage.test.ts`

---

## 12. คำสั่งตรวจตัวเลขในไฟล์นี้ (ให้เจ้าของรันซ้ำได้)

ทุกตัวเลข/รายชื่อในเอกสารนี้มาจากคำสั่งเหล่านี้ รันบน main `ddada9e` รอบนี้:

| อ้างที่ | คำสั่ง | ผล (รอบนี้) | ฉบับเดิมบอก |
|---|---|---|---|
| main sha (หัวไฟล์) | `git rev-parse --short HEAD` | `ddada9e` | `5242f0a` |
| migration ล่าสุด (§10) | `ls supabase/migrations/*.sql \| wc -l` | **27** (`0027_drop_target_price.sql`) | 27 (เท่าเดิม) |
| ชั้น DB ขยับไหม | `git diff --stat 5242f0a..ddada9e -- supabase/migrations src/lib/database.types.ts` | **ว่าง** (ไม่ขยับ) | — |
| 14 ตาราง (§3) | นับ block `public.Tables` ใน `database.types.ts` | **14** | 14 (เท่าเดิม) |
| 26 RPC (§6) | นับ block `public.Functions` | **26** | 26 (เท่าเดิม) |
| 8 enum | นับ block `public.Enums` | **8** (`category_kind`/`debt_status`/`debt_visibility`/`friend_status`/`item_condition`/`stock_status`/`transaction_type`/`wallet_type`) | 8 (เท่าเดิม) |
| ไฟล์เทสต์ (§10) | `find src \( -name '*.test.ts' -o -name '*.test.tsx' \) \| wc -l` | **52** | **42** |
| visual guard (§10) | `find src -name '*.visual.test.*'` | **8 ไฟล์** | **5** |
| เคสเทสต์ (§10) | `npm test` | **`Tests 433 passed \| 9 skipped (442)`** · Test Files 52 passed | `370 passed \| 5 skipped (375)` · 42 files |
| 13 หน้า / 14 route (§10) | `find src/pages -name '*Page.tsx' \| wc -l` · อ่าน `router.tsx` | **13 หน้า + catch-all = 14 route** | 13 / 14 (เท่าเดิม) |
| bottom nav slots (§10) | อ่าน `AppLayout.tsx` (LEFT+RIGHT+FAB) | **5 ช่อง** (4 แท็บ + FAB · ตั้งค่าออกแล้ว) | **6** |
| offlineQueue dead (§10) | `grep -rn offlineQueue src \| grep -v lib/offlineQueue.ts` | ว่าง | ว่าง (เท่าเดิม) |
| คำ "หนี้" ใน src (§8-19) | `grep -rln 'หนี้' src` | **`lib/budgetable.ts` + `budgetable.test.ts`** (คอมเมนต์/ชื่อเทสต์ ไม่ใช่ข้อความบนจอ) | **ว่าง** |
| คำ "หนี้" ใน migrations (§10) | `grep -rln 'หนี้' supabase/migrations` | `0015`/`0016`/`0017`/`0018`/`0019`/`0021` (RAISE + คอมเมนต์) | `0015`/`0018`/`0019` |
| build/test เขียว | `npm run build` · `npm test` | เขียวทั้งคู่รอบนี้ (build ✓ · 433/9/442) | ต้องเขียวก่อน merge |

> **ยังไม่ได้ตรวจในรอบนี้ (บันทึกตรง ๆ):**
> - **schema จริงบน DB** — AI ต่อ DB ไม่ได้ · แหล่งความจริงคือ `database.types.ts` (พิสูจน์รอบนี้ว่า byte-identical กับ audit ก่อน) ไม่ใช่ query สด
> - **`transactions_search` smoke test** ถูกรันจริงหรือยัง (มีในหัวไฟล์ `0022` · ยังไม่มีหลักฐาน)
> - **production URL ที่แน่นอน** — ไม่ pin ในไฟล์ repo
> - **`.github/workflows/`, `vite.config.ts`, `src/worker/`** — โครงยกจากฉบับเดิม · ไม่อยู่ในชุดไฟล์ที่เปลี่ยน (`git diff --name-only 5242f0a..ddada9e`) จึงเชื่อว่าไม่ขยับ แต่ไม่ได้อ่านซ้ำทุกบรรทัดรอบนี้
> - **เนื้อ implementation ของทุก component ไม่ได้อ่านครบทุกบรรทัด** — อ่านตรงไฟล์ที่เปลี่ยน (client) + จุดที่คิดเงิน/ตัดสินใจ · ชั้น DB พิสูจน์ว่าไม่ขยับด้วย git diff
> - **คอมเมนต์ค้างที่พบ (จดไว้ ไม่แก้ — นอกขอบเขตใบนี้):** หัว `router.tsx` เขียน "10 screens" (จริง 13) · คอมเมนต์ workbox ใน `vite.config.ts` + `README.md` ยังพูดถึง offline queue ราวกับใช้อยู่ · คอมเมนต์ใน `lib/budgetable.ts` อ้างชื่อหมวด "จ่ายชำระหนี้" (ชื่อ seed ปัจจุบันคือ "จ่ายคืนเพื่อน" ตั้งแต่ `0017`)
