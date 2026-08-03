# STASH — Project Context

> บริบทถาวรของโปรเจกต์ ใช้แทนการอ่าน `docs/PROJECT_AUDIT.md` ฉบับเต็มในงานประจำวัน
>
> **ประกอบใหม่ทั้งฉบับ ไม่ใช่แพตช์ทีละจุด** — การแพตช์ทีละบรรทัดคือกลไกที่ทำให้เอกสารคลาดจากของจริงมาทุกรอบ (เคยค้างที่ migration `0021` ทั้งที่ถึง `0024` แล้ว → สเปกสั่งสร้าง `0022` ผิด · เคยค้างที่ 254 เทสต์ ทั้งที่ 300+) ทุกประโยคในไฟล์นี้มาจากการอ่านไฟล์จริงในรอบนี้ ไม่ได้คัดลอกจากฉบับเดิม
> **กติกาการใช้:** ทุกข้อความควรชี้กลับไปที่ไฟล์จริงได้ จุดไหนยังไม่ได้ตรวจจะเขียนว่า "ยังไม่ได้ตรวจ" ตรง ๆ ไม่เดา · ค่าสี hex และเลขเรขาคณิตของฮีโร่ **ไม่คัดลอกมาไว้ที่นี่** — อ่านจากไฟล์แหล่งความจริง
> **ตัวเลขทุกตัวนับใหม่ในรอบนี้** จากคำสั่งที่รันจริง (ดู §12 ท้ายไฟล์)
> **ตรวจล่าสุดเทียบ repo จริง:** main `bc993f9` — **7 ใบ merge เพิ่มตั้งแต่รอบก่อน** (ใบ 13 งบ · 9 contrast · 10 shell · 6/7/8 กระเป๋าเงิน · 11 คำ) · migration ล่าสุด **`0028`**
> **ชั้น DB ขยับ 1 ก้าวรอบนี้ (ต่างจากรอบก่อนที่ frozen):** `git diff --stat 5242f0a..bc993f9 -- supabase/migrations src/lib/database.types.ts` = **เฉพาะ `0028` + 88 บรรทัดใน `database.types.ts`** (ฟีเจอร์กระเป๋าเงินล้วน) · ที่เหลือทั้งหมดเป็น **client ล้วน** (§12)

---

## 1. โปรเจกต์นี้คืออะไร

PWA บันทึกรายรับ-รายจ่ายส่วนตัว ที่มี **กึ่งระบบสต็อกสินค้า** (เสื้อผ้า/ของมือสอง ขายต่อ) + ระบบ **ยอดค้างกับเพื่อน** + **กระเป๋าเงินหลายใบ** รวมอยู่ในแอปเดียว (`package.json` description)

- **ผู้ใช้:** เจ้าของ + เพื่อนไม่กี่คน · **ต่างคนต่างขายของตัวเอง ไม่แชร์คลัง** · "ยอดค้าง" เป็นฟีเจอร์ cross-user ตัวเดียวในแอป
- **ภาษา:** ไทย (`index.html` `lang="th"`) · **สกุลเงิน:** THB (`lib/format.ts` `Intl.NumberFormat('th-TH')`) · **เขตเวลา:** Asia/Bangkok
- **เขตเวลาเป็นข้อจำกัดทั้งแอป:** ทั้ง client (`lib/dates.ts` `APP_TZ='Asia/Bangkok'`) และ DB (`0010`: `(now() at time zone 'Asia/Bangkok')::date`) เคาะ "วันนี้/เดือนนี้" เป็นเวลาไทยเสมอ ไม่ใช่ timezone ของเครื่อง — ไม่งั้นรายการเวลา 00:30 ICT จากเครื่อง UTC จะลงผิดวัน และยอดรายเดือน drift ที่ขอบเดือน
- **ไม่มีหน้าสมัครสมาชิก** — เจ้าของสร้างบัญชีให้ใน Supabase dashboard · มีเฉพาะเข้าสู่ระบบ + กู้รหัสผ่าน (`/login`, `/forgot-password`, `/reset-password`)
- **Deploy:** Cloudflare Workers (static assets) — worker ชื่อ `stash-web` (`wrangler.jsonc`) · **production URL ที่แน่นอนไม่ได้ pin ในไฟล์ repo** → ยังไม่ได้ตรวจ

---

## 2. Stack + ข้อจำกัดสภาพแวดล้อม

Vite 6 · React 18 · TypeScript · Tailwind 3 · Supabase (Postgres + Auth อีเมล/รหัส + Storage) · TanStack Query 5 · react-router-dom 6 · `vite-plugin-pwa` · Cloudflare Workers · Vitest 2 (รวม guard เบราว์เซอร์จริงด้วย `playwright-core` + Chromium) (จาก `package.json`)

**สคริปต์จริง (`package.json`):** `dev` · `build`=`tsc -b && vite build` · `preview` · `test`=`vitest run` · `test:watch` · **`lint`=`tsc -b`** · `typecheck`=`tsc -b` · `cf:dev`=`wrangler dev` · `cf:typegen` · `deploy`=`npm run build && wrangler deploy`
> **ยังไม่มี ESLint** — `npm run lint` เป็นแค่ `tsc -b` (ตรวจ `package.json` รอบนี้ · ไม่มี dependency/สคริปต์ eslint · ยังจริง)

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
| `ci.yml` | push→`main` + ทุก PR | `npm ci` → `npm run build` → `npx playwright-core install --with-deps chromium` → `npm test` (`vitest run`) · Node 22 · **ไม่ deploy** · ขั้น chromium มีเพื่อให้ guard เบราว์เซอร์จริงรันได้จริงใน CI (ไม่ skip) | **ไม่ใช้ secret** — เทสต์ใช้ dummy Supabase env จาก `vitest.config.ts` |
| `types-drift.yml` | cron รายวัน + `workflow_dispatch` | `supabase gen types` เทียบกับ `database.types.ts` · ต่างเมื่อไร → เปิด/อัปเดต PR branch เดียว `automation/database-types-drift` (label `types-drift`) · เหมือน → เงียบ · **ไม่แตะ `main` ตรง ๆ** | `SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_ID` · optional `GH_PAT` |

> **ทำไมต้องมี `types-drift`:** เจ้าของไม่มีเครื่อง dev → regen จาก dashboard แล้ว paste มือทุกครั้ง · พลาดเมื่อไรฐานข้อมูลกับ repo แยกกันเงียบ ๆ (เกิดจริงกับ `0015`) · workflow นี้ปิดช่องนั้น (หัวไฟล์ `types-drift.yml`)
> **ลำดับที่ถูกเมื่อ migration เปลี่ยน signature ของ RPC ที่ client เรียก:** ห้าม merge PR `types-drift` เดี่ยว — types ใหม่ไม่ตรง call site → `tsc` ล้ม → main แดง · ดึงไฟล์เข้า branch ฟีเจอร์แล้ว merge ทีเดียวพร้อม call site (`0020` พลาดข้อนี้ · §9)
> **ข้อยกเว้นที่พิสูจน์แล้วรอบนี้ (ใบ 6/7):** ถ้า migration ใหม่ **ยังไม่มี call site ฝั่ง client เลย** types-drift merge เดี่ยวได้ปลอดภัย — แต่ถ้าการเพิ่มคอลัมน์ทำให้ **fixture/โค้ดเดิมพัง** (เช่น `opening_balance` not-null เพิ่มใน `wallets.Row` ทำให้ fixture ทดสอบเดิมคอมไพล์ไม่ผ่าน) ต้องดึง types เข้า branch แล้ว merge พร้อมการแก้ทีเดียว (types + fixture ต้องลง atomic ไม่งั้น main แดงกลางทาง)
> (ยังไม่ได้ตรวจซ้ำทุกบรรทัดของ workflow รอบนี้ — ไฟล์ workflow ไม่อยู่ในชุดที่เปลี่ยน `git diff --name-only 5242f0a..bc993f9`)

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
| `src/lib/db.ts` | type alias ระดับแอป derive จาก generated (`Tables<>`/`Enums<>`/`Fns[...]`) · **เพิ่มรอบนี้:** `WalletBalance` (จาก `wallet_balances` Returns) · `WalletTransfer` (จาก `Tables<'wallet_transfers'>`) |
| `src/lib/ledger.ts` | predicate กลางจำแนกแถว: `isSpendingRow` / `isBudgetSpendingRow` (ตัด `is_stock_cogs`/`is_debt_settlement`/`is_shop_operating`) + **`lockedRowInfo()`** แนวคิด "แถวล็อก" ที่เดียว (§5) · **หมายเหตุ: กระเป๋าเงิน (§4-14/§11.8) ไม่ใช้ predicate พวกนี้ — ใช้ `type` ดิบ** |
| `src/lib/budgetable.ts` | `isBudgetableCategory()` — ตั้งงบได้เฉพาะ `kind==='expense' && !is_system && !is_shop_category && !is_stock_category` · pure/structural · **ใบ 13: ใช้ทั้งหน้างบและแถบ "งบที่ตั้งไว้" หน้าแรกแล้ว** (`budgetableRows` ใน `useBudgets.ts` — เดิมตรรกะอยู่สองที่) |
| `src/lib/budgetNote.ts` | ถ้อยคำบรรทัดรองหน้างบที่เดียว: `paceNote(state, {remaining,over}, money)` + atom `overBudgetNote`/`remainingNote` · รับ `money` ฉีดเข้ามาเพื่อ mask ตาม `hideBalance` (§11.4-33/34) |
| `src/lib/shopAccount.ts` | `computeShopProfit()` — สูตร P&L ร้าน (ถังที่ 1 − ถังที่ 2) ที่เดียว (§4) |
| `src/lib/shopCategory.ts` | resolve หมวดร้านฝั่งรายรับด้วย `kind + is_shop_category` (ไม่มี `system_key`) (§11.4-31) |
| `src/lib/spendable.ts` | `computeSpendable(safe, bills, daysLeft)` — บรรทัดรอง SAFE · ไม่ clamp เงียบ |
| `src/lib/debtsSummary.ts` | `computeDebtsHeadline` (หน้ารวม อ่าน `shared_net`) + `computeFriendLedger` (รายคน แยก agreed/private) (§11.6) |
| `src/lib/format.ts` | `formatBaht`/`formatBaht2`/`MASKED_BAHT`/`formatDueDate` ฯลฯ · **เพิ่มรอบนี้ (ใบ 8):** `sanitizeMoneyInput()` — กรองอินพุตเงินที่เดียว (ยอดตั้งต้นกระเป๋า + ยอดโอน ใช้ร่วม) |
| `src/lib/sku.ts` | normalize/validate **prefix** เท่านั้น (`^[A-Z0-9]{3}$`) — ไม่ประกอบ SKU (สูตรอยู่ที่ RPC `stock_sku_build`) |
| `src/lib/username.ts` | กติกา username (`^[a-z0-9_]{3,20}$`) mirror CHECK ใน DB (`0020`) |
| `src/lib/dates.ts` | helper วันที่/เดือนกลาง (Asia/Bangkok) · **"เดือน" = string `YYYY-MM`** เทียบ `<`/`>` ตรง ๆ (§11.4-19) · `todayISO`/`parseMonthParam`/`daysLeftInMonthKey`/`monthBoundsFromKey`/`addMonthsToKey` |
| `src/lib/catColor.ts` | `catColorVar(index)` — slot 1–6 → CSS var **ที่เดียวที่แปลง index→สี** (ไม่มี hex) |
| `src/lib/percent.ts` | `largestRemainderPercents()` — % รวม 100 พอดี (Hamilton) |
| `src/lib/errors.ts` | `translateError()` → ข้อความไทยที่เดียว · จับด้วย `code`/`status` ไม่จับ substring · **ข้อความที่มีอักษรไทยอยู่แล้วส่งผ่านตรง ๆ** (§9) — นี่คือเหตุผลที่ RAISE ภาษาไทยใน RPC ถึงผู้ใช้ตรง ๆ (§10) |
| `src/lib/txCache.ts` / `txRestore.ts` | เติมแถวที่เพิ่ง insert ลง cache / payload คืนแถวที่ลบ · pure · structural (§11.4-16/18) |
| `src/lib/offlineQueue.ts` | write-outbox บน IndexedDB — **ไม่มีไฟล์ไหน import (dead code)** ยืนยัน grep รอบนี้ (§10) |
| `src/lib/useDialogA11y.ts` | โฟกัส/คีย์บอร์ดชีตกลาง · **`onClose` ขี่ ref ไม่เป็น dependency ของ effect** (กันบั๊ก caret หลุด · §9) |
| `src/lib/visual-contrast.ts` | helper วัด contrast ที่ compute จริงในเบราว์เซอร์ (ใช้โดย `AppLayout.theme` + `Toast.contrast` + `StockScrim.contrast` visual guard) |

**15 ตาราง** (นับจาก block `public.Tables` ใน `database.types.ts` รอบนี้ = 15 · **+1 จากรอบก่อน: `wallet_transfers`**):
`budgets` `categories` `debt_events` `debts` `favorites` `friend_connections` `profiles` `recurring` `schema_migrations` `stock_items` `stock_sales` `stock_sku_config` `transactions` `wallet_transfers` `wallets`

- ทุกตาราง RLS เปิด + policy owner-only บน `auth.uid() = user_id` (`0001`) — **ยกเว้น 2 กลุ่ม:**
  - `schema_migrations` (`0011`): RLS เปิด · **0 policy** · revoke สิทธิ์ anon/authenticated (ตั้งใจ)
  - **กลุ่มยอดค้าง** `debts`/`debt_events`/`friend_connections`/`profiles` (`0015`): RLS **select-only** (เห็นได้เมื่อเป็นคู่กรณี/เพื่อน) + **เขียนผ่าน SECURITY DEFINER RPC ที่ re-check `auth.uid()` เอง** (§6 · §11.6)
- **`wallet_transfers` (`0028`) เป็น single-owner ธรรมดา** — RLS owner-only **CRUD ครบ** (select/insert/update/delete) ไม่ใช่ select-only แบบกลุ่มยอดค้าง · FK `from_wallet_id`/`to_wallet_id` → `wallets` **`on delete restrict`** (กระเป๋าที่มีประวัติโอนลบไม่ได้เงียบ)

---

## 4. กฎธุรกิจ — เงิน (สำคัญที่สุดในไฟล์)

ที่มา: `lib/ledger.ts` · `lib/shopAccount.ts` · `0012` (ขาย) · `0015` (ยอดค้าง) · `0026` (หมวดร้าน) · **`0028` (กระเป๋าเงิน — ใหม่รอบนี้)**

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
13. **ห้าม clamp ยอดเงินเป็น 0 เงียบ ๆ ทุกที่ที่แสดงเงิน** — ติดลบ/เกิน บอกตรง ๆ + ไอคอนเตือน (§11.4-8) · `computePace` คืน `remaining` (budget−used, ติดลบได้) + `over` แยก · **กระเป๋าเงินก็ห้าม clamp** — คงเหลือติดลบได้จริง (ยอดตั้งต้นน้อยกว่าที่ใช้ไป) แสดงติดลบ + สี expense
14. **🔑 คงเหลือกระเป๋า = สูตรที่ใช้ `type` ดิบ ต่างจากสูตรงบโดยสิ้นเชิง** (`wallet_balances()` · `0028`):
    ```
    คงเหลือ = opening_balance
            + Σ(transactions ของกระเป๋านี้ที่ type='income')
            − Σ(transactions ของกระเป๋านี้ที่ type='expense')
            + Σ(transfers เข้า) − Σ(transfers ออก)
    ```
    - **ใช้ `type` ดิบ ห้าม `isSpendingRow`/`isBudgetSpendingRow` เด็ดขาด** — สูตรนี้ถามคนละคำถามกับงบ: "เงินในกระเป๋าขยับจริงไหม" ไม่ใช่ "รายการนี้นับเป็นรายจ่ายเชิงบัญชีไหม"
    - **ซื้อเข้าสต็อก (`is_stock_purchase`) ไม่ใช่รายจ่ายเชิงงบ (ข้อ 1) แต่เป็นเงินสดที่ออกจากกระเป๋าจริง → ต้องหัก** · COGS (`is_stock_cogs`, wallet null) → ไม่เข้าสูตรเอง · เคลียร์ยอดค้าง/ค่าดำเนินร้าน (มี wallet) → นับ
    - **ขัดสัญชาตญาณของคนที่คุ้น predicate ชุดงบ — ถ้าเผลอเอา `isBudgetSpendingRow` มาใช้ ตัวเลขผิดเงียบ** · aggregate ฝั่ง SQL คืนส่วนประกอบครบ (`opening/income/expense/transfer_in/transfer_out/balance`) ให้ UI อธิบายที่มา (§11.8)
15. **ห้ามเติมค่าเงินให้ล่วงหน้าในจุดที่ผู้ใช้จะกดผ่าน** — ราคาขาย · ค่าส่ง · **ยอดตั้งต้นกระเป๋า** · **ยอดโอน** เปิดมาว่างเสมอ (§11.4-30/32 · §11.8)

---

## 5. กฎธุรกิจ — สต็อก + แถวที่ล็อก

ที่มา: `0001`/`0012`/`0025`/`0027` · `pages/StockPage.tsx` · `components/StockFields.tsx` · `lib/ledger.ts`

- `qty_remaining` / `status` **คำนวณจากจำนวนเสมอ** (`sold` เหลือ 0 · `partial` < ทั้งหมด · `in_stock` = ทั้งหมด) · CHECK `qty_remaining <= qty_total` (`0001`)
- **`cost_per_unit` และ `qty_total` ล็อกเมื่อขายแล้ว** — trigger `stock_item_lock_after_sale` (`0012`)
- **SKU สร้างจาก DB** ตาม `stock_sku_config` (1 แถว/user) · รูปแบบ **`{PREFIX}-{SEQ}`** · prefix `^[A-Z0-9]{3}$` · seq 4 หลัก zero-pad ขยายไม่ตัด (`0025`)
- **ตัวนับ `next_seq` ผูกกับ user ไม่ผูกกับ prefix** เดินหน้าอย่างเดียว · สูตรประกอบที่ **`stock_sku_build(prefix, seq)` ที่เดียว** (§11.4-24)
- **prefix แก้เองได้ตลอด** (`SkuManager` → `useUpdateSkuPrefix`) — มีผลกับของรับเข้าใหม่เท่านั้น
- สินค้าที่มีประวัติขาย **ลบไม่ได้** (`stock_item_delete` raise · FK `on delete restrict`) ต้อง reverse ก่อน
- **ไม่มี `target_price` แล้ว** (`0027` DROP) — ราคาขายกรอกตอนขายเท่านั้น (§11.4-32/33)
- **ทุนจม (`StockPage.computeSunkCost`)** = Σ `cost_per_unit × qty_remaining` ของของที่ `isStale` (ในสต็อก **และ** ค้างเกิน `AGE_OLD_MAX` วัน) · เงินจริง → mask ตาม `hideBalance` · ฿0 = ข่าวดี → "ไม่มีของค้างนาน"
- **เกณฑ์อายุที่เดียว** (`StockPage.tsx`): `AGE_FRESH_MAX=30` · `AGE_OLD_MAX=60` (`isStale` reuse โดยชิป "ค้างนาน" · `computeSunkCost` · กระดิ่ง) — **คอมเมนต์ยอมรับเองว่าเป็นค่าเดา** ("educated guess for second-hand clothing, not measured") ควรทบทวนหลังใช้จริง (§10)

**แนวคิด "แถวที่ล็อก" — รวมที่ `ledger.ts` `lockedRowInfo(r)` ที่เดียว** คืน `{ kind, dateEditable, reason, actionLabel, actionTo }` ครอบ 3 ชนิด:

| kind | เงื่อนไข | แก้วันที่ | ไปย้อนที่ |
|---|---|---|---|
| `stock_purchase` | `is_stock_purchase` | **ได้** | `/stock` |
| `stock_sale` | `isSaleLinkedRow(r)` | ไม่ได้ | `/stock` |
| `debt_settlement` | `is_debt_settlement` | ไม่ได้ | `/debts` |

- แต่ละชนิดมี **trigger กันที่ DB** (`stock_sale_txn_guard` `0012` · `debt_settlement_txn_guard` `0015`) · `lockedRowInfo` = client mirror เตือนก่อนชน trigger · แก้ note/wallet ได้ แต่ยอด/ประเภท/วันที่ไม่ได้
- **`lockedRowInfo()` ยังเป็นด่านของ undo การลบ** — `txRestore.buildRestoreInsert()` โยน error ถ้า snapshot เป็นแถวล็อก
- **เพิ่มชนิดล็อกใหม่ → แก้ที่เดียว:** union `LockedKind` + 1 branch · **การโอนกระเป๋าไม่ใช่แถวล็อกในตารางนี้ — มันไม่อยู่ใน `transactions` เลย** (§11.8)

---

## 6. RPC ทั้งหมด — 28 ตัว

นับจาก block `public.Functions` ใน `database.types.ts` รอบนี้ = **28** (**+2 จากรอบก่อน: `wallet_balances` · `wallet_transfer_create`**) · definer/invoker อ่านจาก migration เวอร์ชันล่าสุดที่ (re)define

**สต็อก/ระบบ (12):** `stock_intake_create` (INVOKER · `0027` 13-arg) · `stock_item_delete` (`0006`) · `stock_sale_create` (`0013`) · `stock_sale_reverse` (`0013`) · `stock_sales_summary` (`0012`) · `stock_sku_build` (`0025` 2-arg) · `stock_sku_preview` (`0025` 0-arg) · `seed_defaults` (**DEFINER** · `0008` · guard `auth.uid()=uid`) · `seed_defaults_internal` (**DEFINER** · `0026`) · `recurring_run_due` (`0010`) · `recurring_next_date` (`0008`) · `pick_category_color_index` (`0016`)

**ประวัติ/ค้นหา (1):** `transactions_search` (INVOKER · stable · `0024` 6-arg = `p_filter, p_q, p_limit, p_offset, p_month, p_category_id`) — filter+ค้นหา + ยอดรวมทั้งชุด (`count(*) over ()`) query เดียว (§11.4-15)

**กระเป๋าเงิน (2 · ใหม่ `0028`):**
- **`wallet_balances()`** (INVOKER · SQL · 0-arg) — คงเหลือทุกกระเป๋าครั้งเดียว **aggregate ฝั่ง SQL** คืน `wallet_id/opening_balance/income_total/expense_total/transfer_in/transfer_out/balance` (คืนส่วนประกอบด้วย ไม่ใช่แค่ยอดสุทธิ · §4-14)
- **`wallet_transfer_create(p_from,p_to,p_amount,p_date?,p_note?)`** (INVOKER · plpgsql) — คืนแถว `wallet_transfers` · ตรวจ `amount>0` · `from<>to` · ทั้งสองกระเป๋าเป็นของ `auth.uid()` · วันที่ไม่อนาคต (เทียบ Bangkok date) · raise ข้อความ**ไทย**ผ่าน `errors.ts` ตรง ๆ
- **ลบการโอน = ไม่มี RPC** — ใช้ DELETE policy บนแถวตัวเอง (`for delete using auth.uid()=user_id` · `0028`) client `.delete().eq('id',…)` ได้เลย (single-owner ไม่ผูก transactions)

**ยอดค้าง (13):** `debt_create` (**DEFINER** · `0019`) · `debt_confirm` (`0015`) · `debt_reject` (`0015`) · `debt_cancel` (`0018`) · `debt_settle` (`0015`) · `debt_settle_many` (`0021` — วนฝั่งเซิร์ฟเวอร์ ทรานแซกชันเดียว) · `debt_settle_reverse` (`0015`) · `debt_share_private` (`0018`) · `debt_delete_private` (`0015`) · `friend_request_send` (**DEFINER** · `0020` = `p_username`) · `friend_request_respond` (`0015`) · **`friend_debts_summary`** (INVOKER · `0017` 0-arg) · `generate_friend_code` (**DEFINER** · `0015` · เลิกใช้ · §11.4-14)

**สรุป definer/invoker:** cross-user / seed / เขียนยอดค้าง = **DEFINER** (re-check `auth.uid()`) · single-owner read/write + สต็อก RPC + search + **กระเป๋าเงิน** = **INVOKER** (พึ่ง RLS ที่มีอยู่) · **กระเป๋าเงินไม่มี cross-user เลย → INVOKER ทั้งคู่** (DEFINER สงวนไว้ให้ยอดค้าง/seed)

> **ไม่ใช่ RPC (trigger function — ไม่โผล่ใน types):** `set_updated_at` · `handle_new_user` · `stock_item_lock_after_sale` · `system_category_no_delete` · `stock_sale_txn_guard` · `debt_settlement_txn_guard` · `set_category_color_index` · `profiles_username_setonce` · `set_txn_shop_operating` (`0026`) · `sync_shop_operating_on_category` (`0026`)
> **ทุก RPC ที่แก้ข้อมูลต้องถูก "เรียกจริง" ถึงจะพิสูจน์** — `debt_create` มีบั๊ก cast enum ตั้งแต่ `0015` แต่ผ่าน verification ทุกครั้งเพราะไม่มี UI เรียก (แก้ `0019`) → smoke test ต้องเรียกฟังก์ชันจริงและ assert · **`0028` มี smoke test เต็มในหัวไฟล์** (โอน net-zero · from=to/amount≤0/กระเป๋าคนอื่น/วันที่อนาคต raise · **`is_stock_purchase` ถูกหัก** · COGS wallet-null ไม่กระทบ) — ครอบ `begin;…rollback;` (§9)

---

## 7. Seed ของ user ใหม่

`handle_new_user()` (trigger AFTER INSERT บน `auth.users` · DEFINER) → `seed_defaults_internal(uid)` (**DEFINER**)

- **3 wallets** (`เงินสด`/`ธนาคาร`/`พร้อมเพย์`) · seed insert แค่ `(user_id, name, type)` — **`wallets.opening_balance` (numeric not null default 0 · `0028`) ได้ 0 อัตโนมัติ ไม่ต้องแตะ seed** · **ไม่มีคอลัมน์ `balance`** (DROP `0011` — ดู §11.8 ว่าทำไม `opening_balance` ไม่ใช่การกลับคำ)
- **1 แถว `stock_sku_config`** (prefix `STZ`, `next_seq=0`) · **1 แถว `profiles`** (`display_name`=ชื่อก่อน `@` · `friend_code` สุ่มเติมคอลัมน์ NOT NULL · **`username`=null** ตั้งเองทีหลัง)

> **reproduce ล่าสุดของ `seed_defaults_internal` อยู่ที่ `0026` SECTION 6** (chain `0015`→`0016`→`0017`→`0026`) — **migration ตัวถัดไปที่แตะ seed ต้อง reproduce จาก `0026`** ตรวจเลข reproduce ล่าสุดจากไฟล์จริงก่อนเขียนทุกครั้ง · **`0028` ไม่แตะ seed** (default 0 พอ)

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
4. ตารางใหม่ → enable RLS + policy (single-owner CRUD ได้ · cross-user = select-only + DEFINER RPC)
5. เจ้าของรันเอง ครอบ `begin; … commit;` + snapshot ฟังก์ชันเดิม · **หลังรัน ตรวจว่าไฟล์ `.sql` เข้า main จริงด้วย git** (กับดัก `0015` · §9)
6. **อ่าน `pg_constraint` ของทั้งตารางก่อนแก้** ไม่ใช่แค่ `information_schema.columns` (มองไม่เห็น CHECK · §9)

### SQL
7. **`RETURNS TABLE`/OUT param กลายเป็นตัวแปรใน scope** → alias ทุกตาราง qualify ทุกคอลัมน์ (กับดัก `qty_remaining` · §9)
8. **ค่าจาก CASE/`values` list ไม่ cast enum อัตโนมัติ** → cast `::public.enum_type` ตอน INSERT (บั๊ก `debt_create` · §9)
9. **Verification ต้องพิสูจน์ว่า "ทำงานได้" ไม่ใช่แค่ "มีอยู่"** — smoke test เรียกฟังก์ชันจริงใน `begin;…rollback;` แล้ว assert
10. เงินคำนวณใน numeric เท่านั้น

### Client
11. **ห้ามมีตรรกะซ้ำสองที่** — แยกเป็นฟังก์ชันกลางแล้ว import (สี=`catColor` · วันที่=`dates` · แถว ledger=`LedgerRow` · แถวล็อก=`ledger` · P&L ร้าน=`shopAccount` · หมวดร้าน=`shopCategory` · ตั้งงบได้ไหม=`budgetable` · ถ้อยคำบรรทัดรองงบ=`budgetNote` · **กรองอินพุตเงิน=`format.sanitizeMoneyInput`**)
12. **ห้าม `as unknown as` / `as any` / `@ts-ignore` / `@ts-expect-error`** — รับ "รูปร่างขั้นต่ำ" structural แทน · ถ้า generator ประกาศคอลัมน์ nullable เป็น non-null → `Omit` + ประกาศใหม่ใน `db.ts` ไม่ cast
13. `database.types.ts` generated ห้ามแก้มือ · alias อยู่ใน `db.ts`
14. **ห้ามใช้คำว่า "ผ่าน" ถ้ายังไม่ได้รัน `npm run build` + `npm test`** · **รายงาน skipped แยกจาก passed เสมอ** (§9)
15. **จับ error ด้วย code/status เท่านั้น ห้ามจับ substring** · error hint allowlist · **error ต้องถึงผู้ใช้** ห้าม catch ว่าง
16. **ห้ามเผยว่าอีเมลมีบัญชีในระบบหรือไม่** · ค้นหาเพื่อนใช้ `username` ไม่ใช่อีเมล
17. **ห้าม `new Date('YYYY-MM-DD')` แล้วอ่านค่า** (`formatBuildStamp` เป็นข้อยกเว้นมีคอมเมนต์) — helper กลางใน `dates.ts` · วันที่ในฟอร์ม (โอนกระเป๋า) default = `todayISO()` เทียบ string
18. **สีต้องมาจาก token** ห้าม hex ดิบใหม่ใน `src/` · **hex เป็นแหล่งความจริงที่ `tailwind.config.ts` + `src/styles/index.css` เท่านั้น ห้ามคัดลอกไปที่อื่น (รวมเอกสารนี้)**
19. **คำที่ห้ามบนหน้าจอ:** หนี้ · เจ้าหนี้ · ลูกหนี้ · เรียกเก็บ · ทวง — **ชื่อในฐานข้อมูล/โค้ดยังเป็น `debt*` ตั้งใจ** (§11.4-14) · *`src/` สะอาด (คำ "หนี้" เหลือเฉพาะคอมเมนต์/ชื่อเทสต์ใน `budgetable.ts`+test) · แต่ยังค้างใน `RAISE EXCEPTION` ของ RPC ยอดค้าง (§10)*
20. **`transactions.is_shop_operating` เป็น derived column เขียนโดย trigger เท่านั้น** — client ห้ามส่งค่า (§4-6)
21. **1 PR = 1 เรื่อง** แตกจาก main ล่าสุด ไม่ stack · PR ที่ merge แล้ว = เริ่ม branch ใหม่จาก main
22. **กับดัก opacity:** ค่า opacity เปล่าใน Tailwind build นี้ **ต้องเป็นทวีคูณของ 5** (`/90`,`/95`) หรือ arbitrary (`/[0.92]`) — ค่าอย่าง `/92` **ไม่ถูก emit เลย ไม่ error ไม่ warning** · **มีเทสต์สแกนกันไว้: `src/styles/opacity-scale.test.ts`** (อ่านสเกลจริงจาก config · ตัด comment ก่อนสแกน) (§9 · `Toast.tsx`)
23. **คำบนจอต้องตรงกันทั้งแอป (glossary · ใบ 11):** บทบาทหมวดที่ป้อนสต็อก = **`เติมสต็อก`** ทุกที่ (เดิมหน้า intake เรียก "หมวดสต็อก") · การกระทำรับของเข้าคลัง = **`รับเข้าสต็อก`** (กริยา ตั้งใจต่างจากบทบาท) · section/สถานะ = **`สต็อก`/`ในสต็อก`** · **มีเทสต์กันคำเก่ากลับ: `StockIntakePage.wording.test.ts`** (สแกน app source ตัด comment ข้าม `*.test.*`)

---

## 9. กับดักที่เคยเกิดจริง — อย่าให้ซ้ำ

| เหตุการณ์ | บทเรียน |
|---|---|
| **เอกสารค้างหลังของจริงจนสเปกผิด** — เคยเชื่อว่า migration ล่าสุด `0021` ทั้งที่ถึง `0024` → สเปกสั่งสร้าง `0022` ผิด | **สเปกทุกใบต้องให้ agent ยืนยันเลข migration/seed ล่าสุดจากไฟล์จริงก่อนเขียน** (§8-2) |
| **`information_schema.columns` ไม่แสดง CHECK constraint** — migration ล้มเพราะชน CHECK ที่มองไม่เห็น | **อ่าน `pg_constraint` ของทั้งตาราง** (§8-6) |
| **ค่าจาก `values`/CASE ไม่ cast enum ให้** — ชน enum column · ตระกูล `debt_create` | cast `::public.enum_type` ตอน INSERT (§8-8) · `debt_create` มีบั๊กนี้ตั้งแต่ `0015` รอด verification ทุกครั้งเพราะไม่มี UI เรียก (แก้ `0019`) |
| **Supabase คืนแถวได้จำกัด** — รวมยอด/ลิสต์ client ที่ชนเพดานให้ผลน้อยกว่าจริงเงียบ ๆ | **guard เสมอ** — `useShopOperating` `.limit(SHOP_ROW_CAP=1000)` + `capped` · **`useWalletTransfers` `.limit(WALLET_TRANSFER_CAP=100)` + `capped`** → เตือน "แสดง N รายการล่าสุด" |
| `create or replace` ตอนเพิ่มพารามิเตอร์ → ฟังก์ชันซ้อน 2 ตัว | signature เปลี่ยน = drop ก่อนด้วย signature จริง |
| `qty_remaining` เป็นทั้ง OUT param และคอลัมน์ → การขายพังตอนกดจริง ทั้งที่ verification ผ่าน | qualify ทุกคอลัมน์ · smoke test (`0013` แก้เป็น alias) |
| **`0015` รันลง DB แล้วแต่ไฟล์ไม่เคยเข้า main** | `schema_migrations` กับ repo ต้องตรง · **ตรวจหลัง migration ว่าไฟล์เข้า main จริงด้วย git** · workflow `types-drift` ปิดช่องนี้ |
| **`tsc --noEmit` บน solution-style tsconfig → ตรวจ 0 ไฟล์ ผ่านเสมอ** | "ผ่าน" ต้องมาจากคำสั่งเดียวกับ CI (`tsc -b && vite build` + `vitest run`) |
| `getDate()` บน date-only string → วันเลื่อนใน timezone ติดลบ | อ่านวันจาก string ตรง ๆ · helper รวมใน `dates.ts` |
| **ป้ายพับในฮีโร่เป็นแถบเปล่าบน production ทั้งที่โค้ดถูก เทสต์ jsdom เขียว** | **เทสต์ jsdom "อยู่ใน DOM" ≠ ผู้ใช้เห็น** · fix = `flex flex-col` บนปุ่ม + guard `WovenHero.visual.test.ts` |
| **dark mode พื้นหลังทั้งหน้าขาว** ทั้งที่ทุกเทสต์เขียว | guard เบราว์เซอร์จริง `AppLayout.theme.visual.test.tsx` วัดสีที่ compute จริง |
| **ไล่บั๊กที่แก้ไปแล้วหลายชั่วโมง** เพราะบันเดิลค้าง — SW precache | **merged ≠ deployed ≠ สิ่งที่เบราว์เซอร์รัน · อ่าน version stamp ก่อนไล่บั๊ก** · guard `pwa-freshness.visual.test.ts` |
| `grep "mint-" src/` ว่าง แต่สีเก่าอยู่ใน DB | **grep พิสูจน์ได้แค่เรื่องในโค้ด · ค่าที่ seed ลง DB คืออีกแหล่ง** (แก้ `0016`) |
| **รายงานเทสต์ "ผ่าน N" โดยมี skipped ซุกอยู่ — คือ visual guard ทั้งหมด** | guard `ctx.skip()` นอก CI (ใน CI `process.env.CI` → throw ไม่ skip) · อ่าน skipped ทุกครั้ง รายงานแยก |
| **PR ถูกรายงานว่า merge แล้ว ทั้งที่ยังไม่เข้า main** | ยืนยันด้วย `git ls-remote origin main` |
| **`0020` เปลี่ยน signature RPC แล้ว merge PR `types-drift` เดี่ยว → main แดง** | migration ที่เปลี่ยน signature/ทำ fixture พัง **ห้าม merge PR `types-drift` เดี่ยว** — merge พร้อม call site/การแก้ (§2.1) |
| Supabase free tier pause เอง หน้า login ค้างไม่บอกอะไร | error ต้องถึงผู้ใช้ · `errors.ts` `isConnectFailure` ดัก `AuthRetryableFetchError`/status 0,502-524,540,544 |
| **กับดัก opacity — `bg-ink/92` ไม่ compile เลย** · `/92` ไม่ใช่ scale step ที่ Tailwind build นี้ emit → ไม่มีพื้นหลัง · **ไม่ error ไม่ warning** | opacity เปล่าต้องเป็นทวีคูณ 5 หรือ `/[0.xx]` (§8-22) · ตระกูล "grep เห็นว่ามี แต่ของจริงไม่ emit" · guard `Toast.contrast.visual.test.tsx` + **เทสต์สแกน `opacity-scale.test.ts`** |
| **token `toast`/`scrim` จงใจไม่มี dark override** · ถ้าชี้กลับไปที่ `ink` → `ink` พลิกเกือบขาวในโหมดมืด → ตัวอักษรขาวหาย | `--color-toast` และ **`--color-scrim` (ใบ 9)** นิยามใน `:root` และ **ไม่ override ใน `html.dark`** — เป็นพื้นเข้มเสมอทุกธีม · คอมเมนต์ล็อก "do NOT add a dark variant; it is not forgotten" ห้ามเข้าใจว่าลืม |
| **`bg-ink` พลิกเกือบขาวในโหมดมืด** (ใบ 9) · แถบ "ขายแล้ว" + badge ✕ ลบรูป (พื้นเข้ม+ตัวอักษร/ไอคอนขาว) เคยใช้ `bg-ink` → contrast ~2.2:1 / ~1.2:1 ในโหมดมืด อ่านไม่ออก | เพิ่ม token **`scrim`** (theme-independent) แทน `bg-ink` เฉพาะจุดที่มี**เนื้อหาขาวทับบนพื้นเข้ม** · **`bg-ink` ที่เหลือ = จุด "in use" 7px ใน `CategoriesManager` (ไม่มีตัวอักษร ตั้งใจให้พลิกคู่กับ `surface`) ห้ามเปลี่ยนเป็น `scrim`** · guard `StockScrim.contrast.visual.test.tsx` (แถบ ≥4.5 · ไอคอน ≥3) |
| **`useDialogA11y` ทำ input หลุดโฟกัสทุกตัวอักษร** · effect ผูก dependency กับ `onClose` (inline · identity ใหม่ทุก render) → ชีตที่ยกค่าไป state ของหน้า re-render ทุกคีย์ → caret หลุด → คีย์บอร์ดมือถือปิด | `onClose` ขี่ `onCloseRef` · effect depend `[active]` เท่านั้น · **ห้ามเติม `onClose` กลับเข้า dependency** (คอมเมนต์ยาวใน `useDialogA11y.ts` · เทสต์ `BudgetPage.editor.test.tsx`) |
| **`truncate` ตัดชื่อเงียบ** · jsdom ไม่ layout จับไม่ได้ | ยอมรับ + `title` เต็ม + **guard 360px วัด `scrollWidth − clientWidth` assert ≤ budget** (จับ regression ไม่บังคับพอดี) · ตอนนี้ 3 หน้าใช้: หมวด ≤15px · กระเป๋า ≤8px · ประวัติโอน ≤8px (§10) |
| **ช่องว่างขอบล่างระดับ shell** (ใบ 10) · `#root{height:100%}` วัดเทียบ html/body ซึ่งบนมือถือใช้ viewport ใหญ่ (ก่อนแถบ address หด) → เหลือแถบพื้น beige ใต้เนื้อหา (เห็นชัดสุดที่ `/add`) | `#root{height:100dvh}` (ยึด dynamic viewport ตามแถบเครื่องมือจริง) · เก็บ `height:100%` เป็น fallback · **`max-w-3xl` container (`AppLayout`) เป็นข้อจำกัด "แนวนอน" ไม่ใช่สาเหตุ ห้ามแก้** · guard `AppLayout.fill.visual.test.tsx` + `AddPage.fill.visual.test.tsx` (gap ≤1px · เคยพังที่ 240–680px) |
| **สูตรคงเหลือกระเป๋าใช้ predicate งบผิด → ผิดเงียบ** (กระเป๋า · ใบ 6-8) · ซื้อเข้าสต็อกไม่ใช่รายจ่ายงบ แต่เงินออกจากกระเป๋าจริง | คงเหลือกระเป๋าใช้ **`type` ดิบ** ไม่ใช่ `isSpendingRow`/`isBudgetSpendingRow` (§4-14) · smoke test `0028` assert `is_stock_purchase` ถูกหัก + COGS wallet-null ไม่กระทบ |

---

## 10. สถานะปัจจุบัน

**Migration:** `0001`–`0028` (`ls supabase/migrations/*.sql | wc -l` = **28** · ล่าสุด `0028_wallet_opening_balance_transfers.sql`) — **1 migration ใหม่รอบนี้ (กระเป๋าเงิน)** ที่เหลือ client ล้วน

**หน้าจริงในแอป:** **13** ไฟล์ `*Page.tsx` (`find src/pages -name '*Page.tsx' | wc -l` = 13) · `router.tsx` มี **14 route** (13 หน้า + catch-all `*` → `<Navigate to="/" replace />`) — eager import ทั้งหมด · **กระเป๋าเงินไม่ใช่หน้าใหม่** — UI อยู่ใน `WalletsManager` (ชีตย่อยในหน้าตั้งค่า) จึงไม่เพิ่ม route:
- ไม่ต้อง auth: `/login` · `/forgot-password` · `/reset-password`
- ใต้ `RequireAuth` + `AppLayout`: `/` Home · `/history` · `/debts` · `/debts/friend/:friendId` · `/stock` · `/budget` · `/settings`
- ใต้ `RequireAuth` **นอก** `AppLayout` (เต็มจอ ไม่มี bottom nav): `/add` · `/stock/intake` · `/stock/queue`
- *(คอมเมนต์หัว `router.tsx` ยังเขียน "10 screens" = คอมเมนต์ค้าง จดไว้ ไม่แก้ในใบนี้)*

**Bottom nav = 5 ช่อง:** มือถือ (`AppLayout.tsx` `sm:hidden`) = **4 แท็บ + FAB กลาง** — LEFT `หน้าหลัก`/`ประวัติ` · FAB `+`→`/add` · RIGHT `ยอดค้าง`/`สต็อก` · **`ตั้งค่า`/`งบประมาณ` ไม่อยู่ในแถบล่าง** (ตั้งค่าเข้าจากเฟืองมุมขวาบนหน้าแรก · §11.4-37) · จำนวนช่องคี่ทำให้ FAB กึ่งกลางจริง · **rail เดสก์ท็อป (`sm:flex`) ยังครบ 6** (หน้าหลัก/ประวัติ/ยอดค้าง/งบประมาณ/สต็อก/ตั้งค่า) · guard `AppLayout.visual.test.tsx` (5 ช่อง · ≥44px · FAB กึ่งกลาง ≤1px)

**เทสต์:** `npm test` (`vitest run`) รอบนี้ = **62 ไฟล์** (`find src \( -name '*.test.ts' -o -name '*.test.tsx' \) | wc -l` = 62)
- **มี Chromium (แบบ CI):** `Tests 495 passed | 0 skipped (495)` · Test Files 62 passed
- **ไม่มี Chromium (เครื่องเปล่า):** `Tests 481 passed | 14 skipped (495)` — **14 ที่ skip = guard เบราว์เซอร์จริง** `ctx.skip()` นอก CI (ใน CI throw) → **รันในเครื่องพิสูจน์ guard พวกนี้ไม่ได้ ต้องรอ CI**

**Guard เบราว์เซอร์จริง = 13 ไฟล์** (`find src -name '*.visual.test.*'` · เดิม 8 → 13 · ทุกตัวใช้นโยบาย skip-นอก-CI / throw-ใน-CI ผ่าน `visual-harness.ts` เว้น `pwa-freshness` ที่ทำ inline):

| ไฟล์ | กันอะไร · budget |
|---|---|
| `AppLayout.visual.test.tsx` | bottom nav = **5 ช่อง** · แต่ละช่อง **≥44px** · FAB กึ่งกลาง **≤1px** |
| `AppLayout.theme.visual.test.tsx` | dark bg ทึบ (alpha >0.99) + luminance **<0.15** · text contrast **≥4.5** ทั้ง light/dark |
| `AppLayout.fill.visual.test.tsx` | **ใหม่ (ใบ 10)** · shell เต็ม viewport มือถือ **gap ≤1px** (360×640 · 390×740) |
| `WovenHero.visual.test.ts` | ป้ายพับถูกวาดจริงที่จุดกึ่งกลาง (`elementFromPoint`=SELF) · ปุ่มตา **≥44px** |
| `charts.visual.test.ts` | ยอดรวมกลางโดนัทอยู่ในวง (`maxCorner ≤ innerR`) ทุกขนาดเลข + เคส mask |
| `pwa-freshness.visual.test.ts` | client หลัง deploy รันบันเดิลใหม่ (chunk-hash = v2) ไม่ใช่ shell precache |
| `CategoriesManager.visual.test.tsx` | ชื่อหมวดยาวสุดที่ 360px clip **≤15px** (§9 truncate) |
| `Toast.contrast.visual.test.tsx` | toast มีพื้นหลังจริง · text **≥4.5** · ไอคอน **≥3** ทั้งสองธีม (§9 opacity/toast) |
| `StockScrim.contrast.visual.test.tsx` | **ใหม่ (ใบ 9)** · แถบ "ขายแล้ว" text **≥4.5** · badge ✕ ลบรูป **≥3** ในโหมดมืด (`bg-scrim`) |
| `AddPage.keypad.visual.test.tsx` | แป้นเลข dock: ยอดค้างบนจอ · บันทึกเหนือแป้น · padding เคลียร์ (geometry boolean) |
| `AddPage.fill.visual.test.tsx` | **ใหม่ (ใบ 10)** · หน้า `/add` เต็ม viewport **gap ≤1px** |
| `WalletsManager.visual.test.tsx` | **ใหม่ (ใบ 7)** · ชื่อกระเป๋าที่ 360px clip **≤8px** (ยอดอยู่ subline `shrink-0` ไม่มีวันตัด) |
| `WalletsManager.transfers.visual.test.tsx` | **ใหม่ (ใบ 8)** · แถวประวัติโอน "จาก → ไป" clip **≤8px** (พิสูจน์ fail เมื่อย้ายยอดขึ้นบรรทัด = 149px) |

**Cloudflare Worker (`src/worker/`):** `index.ts` fetch เดียวหุ้มทุก response ด้วย security headers · `/api/*` เท่านั้น dynamic · `ai.ts` = AI proxy **ยังเป็น stub** · `security.ts` = HTTP security headers (CSP `default-src 'self'` ฯลฯ) · *(worker ไม่อยู่ในชุดที่เปลี่ยนรอบนี้ — ยังไม่ได้ตรวจซ้ำทุกบรรทัด)*

**Version stamp + PWA:** `vite.config.ts` `define` `__COMMIT_SHA__` + `__BUILD_TIME__` แสดงท้าย `SettingsPage` · PWA navigation ผ่าน **NetworkFirst** (`app-shell`) · `skipWaiting`+`clientsClaim`+`cleanupOutdatedCaches` · *(โครงไม่เปลี่ยน — ยังไม่ได้ตรวจ vite.config ทุกบรรทัดรอบนี้)*

**ทำเสร็จแล้ว (มีในโค้ดจริง):** ระบบขายครบวงจร · บัญชีร้าน 2 ถัง + `ShopProfitCard` · SKU prefix-only · ทุนจม/วันในคลัง · ยอดค้างครบวงจร · ค้นหาประวัติ + ตัวกรองเดือน · หน้างบเลื่อนดูเดือน + ตัวเลขแทนคำตัดสิน + กันตั้งงบนอกงบ (**ใบ 13: รวม `isBudgetableCategory` ทั้งหน้างบและหน้าแรกแล้ว**) · dark mode + guard (**ใบ 9: token `scrim`**) · **shell เต็มจอมือถือ (ใบ 10)** · **คำบนจอ glossary ตรงกัน (ใบ 11)** · **🆕 กระเป๋าเงินครบวงจร (ใบ 6/7/8): ยอดตั้งต้น + คงเหลือรายกระเป๋า + โอนระหว่างกระเป๋า + ประวัติโอน** (§11.8)

**ยังไม่ได้ทำ / หนี้ที่รู้ตัว (ตรวจรอบนี้ว่ายังจริงทุกข้อ):**
- **แถบเลือกยังมีสอง implementation** — `SegmentedControl.tsx` (`role="tablist"` · **ผู้เรียกเดียว = `ShopProfitCard`**) กับ `RolePicker` ใน `CategoriesManager` (`role="radiogroup"`) · คนละ a11y role โดยตั้งใจ · จะยุบหรือไม่เป็นดุลพินิจ (คนละใบ)
- **ค่าดำเนินร้านรวมยอดฝั่ง client ไม่ใช่ RPC** (`useShopOperating` + guard `SHOP_ROW_CAP=1000`) · ชนเพดานจริง → ย้ายเป็น RPC aggregate
- **เกณฑ์ "ค้างนาน 60 วัน" (`AGE_OLD_MAX`) เป็นตัวเลขที่เดา** — คอมเมนต์ยอมรับเอง ควรทบทวนหลังใช้จริง
- **คำที่ห้ามขึ้นจอยังค้างใน `RAISE EXCEPTION` ของ RPC ยอดค้าง** (ใบ 11 สำรวจ) — `src/` สะอาด แต่ยังมี **16 จุด raise** ที่มี "หนี้/เจ้าหนี้/ลูกหนี้": `0015` ×12 · `0018` ×1 · `0019` ×3 (debt_create ล่าสุด) → ผู้ใช้เห็นได้เพราะ `errors.ts` ส่งไทยผ่านตรง ๆ · **แก้ต้อง migration reproduce ~8 ฟังก์ชันจากไฟล์ล่าสุด = ใบแยก** (`0021` หัวไฟล์เคยประกาศ "OUT OF SCOPE โดยตั้งใจ")
- **`friend_code` + `generate_friend_code()` เลิกใช้แต่ยังอยู่** — `profiles.friend_code` ยัง `not null` · ยัง seed เติม · **ไม่มี code path ใน `src/` อ่าน** (มีแต่คอมเมนต์ `ProfileManager` ว่า "gone from the screen") → ยังจริง
- **`src/lib/offlineQueue.ts` ไม่มีใครเรียก (dead code)** — `grep -rn offlineQueue src | grep -v lib/offlineQueue.ts` = ว่าง · คอมเมนต์ workbox + `README.md` ยังพูดถึง = เอกสารค้าง
- **ยังไม่มี ESLint** — `npm run lint` = `tsc -b` (ไม่มี dependency/สคริปต์ eslint)
- **`transactions_search` ยังไม่มีหลักฐานว่าถูกรัน smoke test** ทั้งที่ UI เรียก production (smoke อยู่ในหัวไฟล์ `0022` พร้อมรัน · ยังไม่ได้ตรวจว่ารันแล้ว)
- ถังขยะ/สำรองข้อมูล · ฟีเจอร์ AI (โครงเปล่า `worker/ai.ts`) — ยังไม่ทำ

---

## 11. Redesign + ฟีเจอร์ — สถานะปัจจุบัน (ไม่ใช่แผน)

> **แหล่งความจริงของสี:** `tailwind.config.ts` + `src/styles/index.css` (คอมเมนต์กำกับ locked/role) — **เอกสารนี้ไม่คัดลอกค่า hex**
> **เอกสารดีไซน์:** `docs/design/…`

### 11.1 ฮีโร่ — ป้ายทอคอเสื้อ (`src/components/WovenHero.tsx`)
**หลักการ: กิมมิกต้องเผย ไม่ใช่ซ่อน**
- ป้ายทอ **3 ใบ ล็อกที่ 3 — ไม่มีใบยอดค้าง** · ลำดับ `SAFE TO SPEND` → `BUDGET` → `STOCK PROFIT` · ใบพับโชว์ eyebrow + ตัวเลขย่อ เรนเดอร์ไม่มีเงื่อนไข
- **`flex flex-col` บนปุ่มป้ายเป็น load-bearing** — ห้ามถอด (บั๊กแถบเปล่า · §9)
- **ปุ่มลูกศรเข้า `/budget`** เป็น **sibling button** (แสดงเมื่อ `selected==='budget'`) · ปุ่มตา hideBalance ก็ sibling — **ไม่ซ้อน `<button>` ใน `<button>`**
- บรรทัดรอง SAFE หักบิลรอจ่าย (`computeSpendable`) · เกินยอด → ไอคอนเตือน ไม่ clamp · **เดือนที่จบแล้ว** eyebrow → `LEFT OVER` + recap
- **ชิป "เกินงบ ฿X" ดึงถ้อยคำจาก `lib/budgetNote.overBudgetNote` ที่เดียว** — แหล่งเดียวกับบรรทัดรองต่อหมวดในหน้างบ
- เรขาคณิต (`CONTAINER_H`/`LABEL_H`/`POSITIONS`) มี guard `WovenHero.visual.test.ts` — **ค่าอ่านจากไฟล์ ไม่คัดลอกมาที่นี่**

### 11.2 สี — คราม + สีหมวดต่อ slot (`tailwind.config.ts` + `src/styles/index.css`)
- สีแบรนด์ = คราม · `brand.fabric*`/`thread` ขับ WovenHero (คอมเมนต์ "locked — do NOT change")
- `cat.1–6` + `cat.other` เป็น CSS variable (light `:root` · dark override `html.dark`) — **สีหมวดมาจาก `color_index` ผ่าน `catColorVar()` ที่เดียว** · cat.1 = สีแบรนด์
- **mint ถูกนำกลับมา** — กลับคำจาก PR-C · คอมเมนต์ "do NOT fix back out" ห้ามลบเป็น leftover
- **token theme-independent (พื้นเข้มเสมอทุกธีม ไม่มี dark override โดยตั้งใจ):** `toast` · **`scrim` (ใบ 9 · ใหม่)** — `--color-scrim` นิยามใน `:root` เท่านั้น · ใช้แทน `bg-ink` เฉพาะจุดที่มีเนื้อหาขาวทับพื้นเข้ม (แถบ "ขายแล้ว" ใน `StockPage` · badge ✕ ลบรูปใน `StockFields`) เพราะ `ink` พลิกเกือบขาวในโหมดมืด · คอมเมนต์ล็อก "do NOT add a dark variant" (§9) · **`bg-ink` ที่เหลือ = จุด in-use 7px ใน `CategoriesManager` ตั้งใจให้พลิกคู่กับ `surface`**

### 11.3 โดนัท (`src/components/charts.tsx`)
- ตัวเลขรวม **บรรทัดเดียว** · `donutCenterFontSize(charCount)` = แหล่งเดียวที่ตัดสินขนาด · guard `charts.visual.test.ts` · `largestRemainderPercents()` legend รวม 100 · สี slice จาก `color_index`

### 11.4 การตัดสินใจสำคัญ — ทำไม (หัวใจของไฟล์)
โค้ดบอก "ทำอะไร" เอกสารบอก "ทำไม" · ข้อที่**กลับคำ**สำคัญที่สุด:

1. **สีแบรนด์ย้ายออกจากเขียว** เพราะเขียวถูกจองด้วย "เงินเข้า"
2. **สีหมวดปักหมุดต่อหมวด (`color_index`) ไม่เรียงตามยอด** — เรียงตามยอดจะสลับทุกเดือน
3. **DB เก็บความหมาย client เก็บหน้าตา** — เปลี่ยนพาเลตต์ไม่ต้องแตะ DB
4. **`icon` ไม่มี CHECK** — `lib/icons.tsx` fallback ชื่อผิดเสื่อมนุ่มนวล
5. **โดนัท: ขยายรู ไม่ย่อตัวเลข**
6. **หน้าแรกตอบ "เหลือเงินเท่าไหร่" งบเป็นป้ายใบสอง** — **ระวังพาดหัวที่สองที่ตอบคำถามเดียวกันคนละฐาน:** `safeToSpend` = "รับ−จ่ายเดือนนี้" ต่างจาก "เงินในกระเป๋าทั้งหมด" (§11.8) = "เงินที่มีอยู่จริง" → ยอดรวมกระเป๋าจึงเป็นบรรทัดเงียบในหน้าตั้งค่า มี subtitle แยกความหมาย ไม่ใช่พาดหัวคู่แข่ง
7. **บิลรอจ่าย: หักเฉพาะรายจ่าย ไม่บวกรายรับ**
8. **ห้าม clamp เป็น 0 เงียบ ๆ** — เกิน/ติดลบ บอกตรง ๆ + ไอคอน
9. **texture + เงา = ข้อยกเว้นเฉพาะป้ายทอ** · motion จาก token เคารพ `motion-reduce`
10. **เส้นประถูกใช้กับโซนวางรูปแล้ว** — ห้ามให้ความหมายที่สอง
11. **`hideBalance` = "ซ่อนตอนกวาดตา เปิดตอนตัดสินใจ"** — **ชีตที่ขอให้ยอมรับข้อผูกพัน (`ConfirmDebtSheet`·`SettleSheet`·แผงขายใน `StockEditSheet`·`WalletTransferSheet`) ต้องแสดงเงินเสมอ ไม่รับ prop `hideBalance` (กันเชิงโครงสร้าง — prop ไม่มีอยู่จริง)** · **หน้างบ + ลิสต์คงเหลือ/ประวัติโอนในหน้ากระเป๋า mask ตาม `hideBalance`** (กวาดตา)
12. **private ไม่รวมในพาดหัว และไม่รวมกับ shared** — `computeFriendLedger` แยกถัง
13. **ย้อนการเคลียร์ได้เฉพาะคนที่กดเคลียร์เอง** (`settled_by = auth.uid()`)
14. **ชื่อฟีเจอร์ = "ยอดค้าง"** · คำห้ามบนจอ: หนี้/เจ้าหนี้/ลูกหนี้/เรียกเก็บ/ทวง · **schema/โค้ดยังเป็น `debt*` ตั้งใจ** → gap ระหว่าง "จ่ายคืนเพื่อน" บนจอ กับ `debt_repayment_expense` ใน DB (และคำ "หนี้" ที่ยังค้างใน RAISE · §10)

**— รอบฟีเจอร์หลัง redesign —**

15. **หน้าประวัติใช้ RPC เดียว** (`transactions_search`) — window aggregate ทำให้หน้ากับยอดรวมมาจาก query เดียว ขัดกันไม่ได้เชิงโครงสร้าง
16. **"เติม cache" หลังบันทึก ไม่ใช่ optimistic update** (`txCache`) · `insertRecent` **เรียงใหม่ ไม่ prepend**
17. **effect ที่ seed ฟอร์มต้องผูกกับ `id` ไม่ใช่ object** — `refetchOnWindowFocus` + native picker → object ใหม่ → ทับที่พิมพ์ค้าง
18. **undo การลบคืนแถวด้วย `id` + `created_at` ชุดเดิม** (`txRestore`) · guard "ห้ามคืนแถวล็อก" ใช้ `lockedRowInfo()`
19. **"เดือน" คือ string `YYYY-MM` ไม่ใช่ Date** (`dates.ts`) · `addMonthsToKey` เลขคณิตบน year*12+month
20. **`computeHomeSummary` แยก `month` ออกจาก `now`** · `daysLeftInMonthKey(key)` คืน 0 เมื่อเดือนจบ
21. **`useUpcomingBills` จงใจไม่รับเดือน** — ผูกกับ "ตอนนี้" เสมอ · guard `MAX_OCCURRENCES_PER_RULE=40`
22. **`onTap` ป้ายด่วนอยู่บน `click` ไม่ใช่ `pointerUp`** · `moveTolerancePx` กันปัดเลื่อนกลายเป็นบันทึก

**— รอบ SKU / หมวดร้าน / กำไรร้าน / ค่าส่ง / ทุนจม (`0025`–`0027`) —**

23. **ตัดท่อนแบรนด์ออกจาก SKU** — SKU เป็นเลขอ้างอิงไม่ซ้ำ · คอลัมน์ format ที่ไม่มีใครใช้ drop ทิ้ง
24. **ตัวนับ SKU ผูกกับ user ไม่ผูกกับ prefix** · preview ไม่จองเลข → ถ้อยคำ "โดยประมาณ"
25. **ป้ายอยู่ที่หมวด แต่ธงคัดลอกลงตัวรายการ** (`is_shop_category`→trigger→`is_shop_operating`) — predicate อ่านจากตัวรายการไม่ต้อง join · **แลกกับ: เปลี่ยนป้ายแล้วตัวเลขเดือนเก่าขยับ** ยอมรับโดยตั้งใจ
26. **`is_stock_category` ไม่อยู่ในสูตรงบ** — ป้ายสต็อกคุมแค่ว่าหมวดโผล่หน้ากรอกมือไหม (`isEntrySelectableCategory`)
27. **ปิดการกรอก `stock_sale_income` ด้วยมือ — กลับคำจาก §7 เดิม** เพราะรายรับก้อนนั้นไม่มี COGS คู่ → พองรายรับ · ไม่ลบหมวด แค่ซ่อนจากตัวเลือก
28. **ค่าดำเนินร้านห้ามเกลี่ยลงรายชิ้น** — กำไรขั้นต้นดูรายชิ้น (ถัง 1) · กำไรสุทธิดูรายร้านรายเดือน (ถัง 2)
29. **ป้ายหมวดเป็นตัวเลือกเดียว 3 แบบใน UI แต่ยัง 2 คอลัมน์ใน DB** — mutually exclusive (CHECK) · **ห้ามรวมเป็นคอลัมน์เดียว — งาน UI ล้วน** · `useSetCategoryRole` เขียนสองคอลัมน์ครั้งเดียว · **ปุ่มลบซ่อนเมื่อ `is_system`**
30. **ค่าดำเนินร้านรวมฝั่ง client ไม่ทำ RPC** — merge รวดเดียวไม่รอ types-drift · guard `SHOP_ROW_CAP` · **กำไรสุทธิย้อนหลังไม่นิ่งโดยตั้งใจ** (`REVALUATION_NOTE`)
31. **ป๊อปอัพหลังปิดการขายถามเฉพาะค่าส่งขาเข้า** · **หมวดร้านไม่มี `system_key`** → resolve ด้วย `kind + is_shop_category` (`lib/shopCategory.ts`) · **ไม่ prefill ยอด**
32. **ตัดราคาขายเป้าหมาย + กำไรคาดการณ์ทิ้ง — แทนด้วยทุนจม** (`0027`) · `target_price` = ตัวเลขที่ดูเหมือนเงินแต่ไม่ใช่เงิน · **ห้ามเอากลับมา**
33. **ห้ามเติมราคาขายล่วงหน้าในแผงขาย** — ช่องเปิดมาว่าง+focus

**— รอบงบ: ตัวเลขแทนคำตัดสิน + กันตั้งงบนอกงบ + รวม predicate (ใบ 5 + 13 · client ล้วน) —**

34. **`computePace()` แยกหน้าที่ — ตัดสิน "สถานะ" อย่างเดียว ถ้อยคำอยู่ที่ `paceNote()`** · สถานะ = `over`/`fast`/`unused`/`on_track` · คืน `remaining`/`over` **ไม่ clamp** · `computePaceStatic()` สำหรับเดือนปิดแล้ว แชร์ `baseState()` · บรรทัดรองบอกยอดจริง ไม่ใช่คำตัดสินประดับ
35. **`isBudgetableCategory()` — ตั้งงบได้เฉพาะ `expense` ที่ไม่ใช่ system/shop/stock** · **ใบ 13: ใช้ทั้งชีตตั้งงบ · แถวงบเก่าที่ตกค้าง · และแถบ "งบที่ตั้งไว้" หน้าแรก** — เดิม `useMonthBudgetTotal` `.select('amount')` รวมทุกแถวดิบ (ตรรกะสองที่) · ตอนนี้ทั้ง `useBudgets` + `useMonthBudgetTotal` ผ่าน `budgetableRows()` + `BUDGET_WITH_CATEGORY_SELECT` ตัวเดียวใน `useBudgets.ts` (§10 · หนี้นี้ปิดแล้ว)
36. **ฐานของ "นอกงบ" ถูกอยู่แล้ว — ไม่ต้องแก้** — สามกลุ่มที่ตัดจากงบถูกกัน**ที่ระดับ flag ของธุรกรรม** (`is_stock_cogs`/`is_debt_settlement`/`is_shop_operating`/`is_stock_purchase`) + `isEntrySelectableCategory` → ตัวเลขไม่พอง · **จุดที่ดูเหมือนบั๊กแต่ไม่ใช่**

**— รอบ redesign แถบล่าง + ทางเข้าตั้งค่า + หน้า /add (ใบ 1–4 · client ล้วน) —**

37. **แถบล่างเหลือ 4 แท็บ + FAB กลาง = 5 ช่อง · ตั้งค่าออกจากแถบ** — **ทางเข้าตั้งค่า = เฟืองมุมขวาบนหน้าแรกข้างกระดิ่ง** (`HomePage` เฉพาะหน้าแรก · เฟือง+กระดิ่งปุ่มแยก ≥44px) · rail เดสก์ท็อปยังครบ 6
38. **หน้า `/add` ยกเครื่อง — แป้นเลขเป็น dock ยึดขอบล่าง** · **padding-bottom วัดด้วย `ResizeObserver` จากความสูง dock จริง ไม่ hardcode** (fallback `measure()` เผื่อ jsdom) · guard `AddPage.keypad.visual.test.tsx`
39. **หน้า `/add` ตัดบล็อก "ใช้บ่อย" ที่ซ้ำออก** — `orderByFrequency` เรียง frequent ขึ้นต้นลิสต์เดียว · ranking freeze ต่อ session
40. **`CategoriesManager` เหลือแถวเดียวต่อหมวด + `RoleBadge`** · **ตัวเลือกบทบาทใน `RolePicker`** (`role="radiogroup"`) · **`ROLES_BY_KIND`: expense = [ส่วนตัว, เติมสต็อก, ของร้าน] · income = [ส่วนตัว, ของร้าน]** · **ชื่อบทบาทบนจอ = `ส่วนตัว`/`เติมสต็อก`/`ของร้าน`** — **ชื่อคอลัมน์/ตัวแปรใน DB คงเดิม** (`ROLE_LABEL` เป็น label จอเท่านั้น · glossary ใบ 11 · §8-23)
41. **แถว "หมวดที่ลงสต็อกอัตโนมัติ" ใน `SettingsPage` ถูกลบ** — ทางลัดซ้ำ · ยุบหัวข้อกลุ่ม "สต็อก" มารวมกลุ่มบน

**— รอบ contrast + shell (ใบ 9 + 10 · client ล้วน) —**

42. **`bg-ink` พลิกเกือบขาวในโหมดมืด → เพิ่ม token `scrim`** (ใบ 9) — theme-independent · แทน `bg-ink` เฉพาะจุดเนื้อหาขาวบนพื้นเข้ม · **`bg-ink` in-use dot คงไว้** (§11.2 · §9)
43. **ช่องว่างขอบล่าง shell → `#root{height:100dvh}`** (ใบ 10) — สาเหตุ: `height:100%` วัดเทียบ viewport ใหญ่บนมือถือ · **`max-w-3xl` เป็นข้อจำกัดแนวนอน ไม่ใช่สาเหตุ ห้ามแก้** · guard `AppLayout.fill`/`AddPage.fill` (§9)

### 11.5 บั๊กรอบก่อน — แก้แล้ว
B1–B14 (redesign) · ค้นหาแมตช์แค่ note · ยอดรวมประวัติยิง query ซ้ำ · dark-mode พื้นขาว · ป้าย "บันทึกแล้ว" โกหก · **toast มองไม่เห็น** · **caret หลุดในชีต** · **ชื่อหมวด truncate เงียบ** · **`bg-ink` contrast ต่ำในโหมดมืด (ใบ 9)** · **ช่องว่างขอบล่าง shell (ใบ 10)** · **คำ "หมวดสต็อก" ไม่ตรงบทบาท "เติมสต็อก" (ใบ 11)** — บันทึกที่ §9/§11.4 ตามชนิด

### 11.6 ยอดค้าง (friend outstanding balances) — ครบวงจร
**แนวคิด:** ติดตามยอดค้างระหว่างเพื่อน แยก **"ตกลงกันแล้ว" (shared)** กับ **"จดไว้เอง" (private)** ไม่รวมกันทุกที่ (§11.4-12) · ฟีเจอร์ cross-user ตัวเดียว → security model ต่าง (§3)

- **ตาราง (`0015`):** `profiles` · `friend_connections` (`status`) · `debts` (`creditor_id`/`debtor_id`/`amount`/`visibility`/`status`/`settled_by`/`settlement_transaction_id`) · `debt_events`
- **สถานะ (`debt_status`):** `pending_confirmation` → `confirmed` → `settled` · หรือ `rejected`/`cancelled`
- **Flow + RPC (`useFriends.ts`):** เพิ่มเพื่อน `friend_request_send(p_username)`/`respond` · บันทึก `debt_create` (shared รอ confirm · private confirmed ทันที) · `debt_share_private`/`debt_delete_private`/`debt_cancel` · เคลียร์ `debt_settle`/**`debt_settle_many`** (atomic) · ย้อน `debt_settle_reverse` (เฉพาะคนที่กดเคลียร์ · §11.4-13)
- **เชื่อมเงินหลัก:** เคลียร์ → **transaction จริง 1 แถว `is_debt_settlement=true`** (หมวด `debt_repayment_*`) · `settlement_transaction_id` ผูกกลับ · แถวนี้ "ล็อก" (§5) นับ headline ตัดงบ (§4)
- **สรุป (`debtsSummary.ts`):** `computeFriendLedger` แยก agreed/private/settled/pending/rejected · `computeDebtsHeadline` อ่าน `friend_debts_summary.shared_net`
- **หน้าจอ:** `/debts` · `/debts/friend/:friendId` · ชีต `AddFriendSheet`/`DebtFormSheet`/`ConfirmDebtSheet`/`SettleSheet`/`ProfileManager`
- **username (`0020`):** `^[a-z0-9_]{3,20}$` · **ตั้งครั้งเดียว** (trigger) · เจ้าของแก้ผ่าน SQL Editor ได้

### 11.7 flow หลังปิดการขาย — ค่าส่งขาเข้า
เหตุผล + resolve หมวด: §11.4-31 · `StockEditSheet.doSell` สำเร็จ → ถ้า `hasShopIncomeCategory` แสดง `ConfirmDialog` → `navigate('/add', {state:{prefill, returnTo:'/stock'}})` · เทสต์: `lib/shopCategory.test.ts` · `StockEditSheet.test.tsx` · `AddPage.*`

### 11.8 กระเป๋าเงิน — คงเหลือ + ยอดตั้งต้น + โอน (ใบ 6/7/8 · ครบวงจร)
**แนวคิด:** แอปมีกระเป๋า 3 ใบ (เงินสด/ธนาคาร/พร้อมเพย์) แต่เดิม**ไม่มีที่ไหนบอกว่าแต่ละใบเหลือเท่าไร** · รอบนี้เพิ่มยอดตั้งต้น + คงเหลือคำนวณสด + การโอน · UI ทั้งหมดอยู่ใน `WalletsManager` (ชีตในหน้าตั้งค่า) + `WalletTransferSheet` — **ไม่มี route ใหม่**

- **`wallets.opening_balance` (numeric not null default 0 · `0028`) — ไม่ใช่การเอา `balance` ที่ DROP ไปกลับมา:**
  - `balance` เดิม (`0001`, DROP `0011`) = **ยอดสะสมที่ต้องคอยอัปเดตทุกรายการ** = แหล่งความจริงซ้ำกับ `transactions` (audit F-05 เรียก dead column)
  - `opening_balance` = **ค่าที่ผู้ใช้กรอกครั้งเดียวแล้วคงที่** — คงเหลือยังคำนวณจากรายการเสมอ ไม่มีใครเขียนกลับ · **ถ้าไม่มีมัน คงเหลือจะกลายเป็น "เงินที่ขยับตั้งแต่เริ่มใช้แอป" ไม่ใช่ "เงินที่มีอยู่จริง"** (ตระกูล `target_price`) · **นี่ไม่ใช่การกลับคำจาก `0011`**
  - **แก้ยอดตั้งต้นทีหลังได้ → คงเหลือขยับย้อนหลัง (ตั้งใจ)** — คนละกรณีกับ `cost_at_sale` ที่ snapshot อดีต · มันคือ "การแก้ค่าที่กรอกผิด"
- **สูตรคงเหลือใช้ `type` ดิบ** (`wallet_balances()` · INVOKER · aggregate SQL) — **ห้าม predicate งบ** (§4-14 · กับดัก §9) · คืนส่วนประกอบครบให้ UI กดดูที่มาได้
- **`wallet_transfers` เป็นตารางแยก ไม่ยัดลง `transactions`** (`wallet_transfer_create` · INVOKER) — การโอนไม่ใช่ทั้งรายรับและรายจ่าย ถ้าสร้างสองแถวใน `transactions` พาดหัวรับ/จ่ายจะพอง และต้อง thread flag ผ่าน `ledger.ts`/hooks ทุกจุด (ผิดเงียบง่าย) · **แลกกับ: การโอนจงใจไม่โผล่ในหน้าประวัติ** — ชดเชยด้วยลิสต์ "ประวัติการโอน" ในหน้ากระเป๋า (ที่เดียวที่การโอนโผล่ · guard เพดานแถว `WALLET_TRANSFER_CAP=100`)
- **ลบการโอน = DELETE policy บนแถวตัวเอง ไม่มี RPC** (single-owner ไม่ผูก transactions · §6) · ลบแล้ว invalidate `['wallets']` → คงเหลือ + ลิสต์อัปเดตทันที · มี ConfirmDialog ก่อนลบ
- **`WalletTransferSheet` ไม่รับ `hideBalance`** (โครงสร้าง · §11.4-11) — ยืนยันยอดที่ปิดตาไว้ = ยอมรับแบบตาบอด · **await เซิร์ฟเวอร์ก่อนปิดชีต ไม่ optimistic** (แพทเทิร์น AddPage) · กระเป๋าปลายทางกรอง `!== from` ออกจากตัวเลือก **แต่ RPC ยังเป็นด่านจริง** (raise ถึงผู้ใช้)
- **cache:** balances + transfers key ใต้ `['wallets', …]` → create/delete โอน (invalidate `['wallets']`) refresh ทั้งคู่ · **create โอน invalidate เฉพาะ `['wallets']` ไม่แตะ `['transactions']`** → พิสูจน์ (เทสต์ `useWalletTransfers.test.tsx`) ว่าการโอนไม่รั่วเข้า headline/งบ/donut/ประวัติ/กำไรร้าน
- **หน้าจอ:** `WalletsManager` (ยอดรวมเงียบ "เงินในกระเป๋าทั้งหมด" · §11.4-6 · แถวคงเหลือ + กดกางส่วนประกอบ · ปุ่มโอน header เมื่อ ≥2 กระเป๋า · ประวัติโอน) · `WalletTransferSheet`

---

## 12. คำสั่งตรวจตัวเลขในไฟล์นี้ (ให้เจ้าของรันซ้ำได้)

ทุกตัวเลข/รายชื่อในเอกสารนี้มาจากคำสั่งเหล่านี้ รันบน main `bc993f9` รอบนี้:

| อ้างที่ | คำสั่ง | ผล (รอบนี้) | ฉบับก่อนบอก |
|---|---|---|---|
| main sha (หัวไฟล์) | `git rev-parse --short HEAD` | `bc993f9` | `ddada9e` |
| migration ล่าสุด (§10) | `ls supabase/migrations/*.sql \| wc -l` | **28** (`0028_wallet_opening_balance_transfers.sql`) | 27 |
| ชั้น DB ขยับอะไร | `git diff --stat 5242f0a..bc993f9 -- supabase/migrations src/lib/database.types.ts` | **เฉพาะ `0028` + `database.types.ts` (+88)** | (รอบก่อน ว่าง) |
| 15 ตาราง (§3) | นับ block `public.Tables` ใน `database.types.ts` | **15** (+`wallet_transfers`) | 14 |
| 28 RPC (§6) | extract block `public.Functions` แล้วนับ key `^      \w+: \{` | **28** (+`wallet_balances`/`wallet_transfer_create`) | 26 |
| 8 enum | นับ block `public.Enums` | **8** (`category_kind`/`debt_status`/`debt_visibility`/`friend_status`/`item_condition`/`stock_status`/`transaction_type`/`wallet_type`) | 8 |
| ไฟล์เทสต์ (§10) | `find src \( -name '*.test.ts' -o -name '*.test.tsx' \) \| wc -l` | **62** | 52 |
| visual guard (§10) | `find src -name '*.visual.test.*'` | **13 ไฟล์** | 8 |
| เคสเทสต์ (มี Chromium) | `CHROMIUM_EXECUTABLE=… npm test` | **`Tests 495 passed \| 0 skipped (495)`** · 62 files | 433/9/442 |
| เคสเทสต์ (เครื่องเปล่า) | `npm test` | **`Tests 481 passed \| 14 skipped (495)`** (14 skip = visual guard) | 433/9/442 (มี chromium ไม่ได้ตอนนั้น) |
| 13 หน้า / 14 route (§10) | `find src/pages -name '*Page.tsx' \| wc -l` · อ่าน `router.tsx` | **13 หน้า + catch-all = 14 route** (กระเป๋าไม่ใช่หน้าใหม่) | 13 / 14 |
| bottom nav slots (§10) | อ่าน `AppLayout.tsx` (LEFT+RIGHT+FAB) | **5 ช่อง** (4 แท็บ + FAB) | 5 |
| offlineQueue dead (§10) | `grep -rn offlineQueue src \| grep -v lib/offlineQueue.ts` | ว่าง | ว่าง |
| friend_code อ่านใน src? (§10) | `grep -rn friend_code src` | เฉพาะ `database.types.ts` + คอมเมนต์ `ProfileManager` (ไม่มี code path อ่าน) | ว่าง (โค้ด) |
| useMonthBudgetTotal กรอง? (§10 · ใบ 13) | อ่าน `useBudgets.ts` | **ใช้ `budgetableRows`/`isBudgetableCategory` แล้ว** (เดิมรวมแถวดิบ) | (เดิม: สองที่) |
| `bg-ink` ยังอยู่ไหน (§9 · ใบ 9) | `grep -rn 'bg-ink' src` | เฉพาะจุด in-use dot `CategoriesManager.tsx` (ไม่มีตัวอักษร ตั้งใจ) | (เดิม: StockFields/StockPage ด้วย) |
| คำ "หนี้" ใน src (§8-19) | `grep -rln 'หนี้' src` | `lib/budgetable.ts` + test (คอมเมนต์/ชื่อเทสต์) | เท่าเดิม |
| คำ "หนี้" ใน migrations RAISE (§10) | `grep -rn 'raise exception' supabase/migrations \| grep 'หนี้\|เจ้าหนี้\|ลูกหนี้'` | **16 จุด** (`0015`×12 · `0018`×1 · `0019`×3) | (เดิมนับรวมคอมเมนต์) |
| build/test เขียว | `npm run build` · `npm test` | เขียวทั้งคู่รอบนี้ (build ✓ · 495/0 มี Chromium) | — |

> **ยังไม่ได้ตรวจในรอบนี้ (บันทึกตรง ๆ):**
> - **schema จริงบน DB** — AI ต่อ DB ไม่ได้ · แหล่งความจริงคือ `database.types.ts` (รอบนี้ยืนยันว่าขยับเฉพาะ `0028` ด้วย git diff) ไม่ใช่ query สด
> - **`transactions_search` smoke test** ถูกรันจริงหรือยัง (มีในหัวไฟล์ `0022` · ยังไม่มีหลักฐาน) · **ต่างจาก `0028` ที่ smoke test เต็มอยู่ในหัวไฟล์พร้อมรัน**
> - **production URL ที่แน่นอน** — ไม่ pin ในไฟล์ repo
> - **`.github/workflows/`, `vite.config.ts`, `src/worker/`** — ไม่อยู่ในชุดไฟล์ที่เปลี่ยน (`git diff --name-only 5242f0a..bc993f9`) จึงเชื่อว่าไม่ขยับ แต่ไม่ได้อ่านซ้ำทุกบรรทัดรอบนี้
> - **เนื้อ implementation ของทุก component ไม่ได้อ่านครบทุกบรรทัด** — อ่านตรงไฟล์ที่เปลี่ยน (client + `0028`) + จุดที่คิดเงิน/ตัดสินใจ
> - **คอมเมนต์ค้างที่พบ (จดไว้ ไม่แก้ — นอกขอบเขตใบนี้):** หัว `router.tsx` เขียน "10 screens" (จริง 13) · คอมเมนต์ workbox ใน `vite.config.ts` + `README.md` ยังพูดถึง offline queue ราวกับใช้อยู่ · คอมเมนต์ใน `lib/budgetable.ts` อ้างชื่อหมวด "จ่ายชำระหนี้" (ชื่อ seed ปัจจุบันคือ "จ่ายคืนเพื่อน" ตั้งแต่ `0017`)
