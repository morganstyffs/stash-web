# STASH — Project Context

> บริบทถาวรของโปรเจกต์ ใช้แทนการอ่าน `docs/PROJECT_AUDIT.md` ฉบับเต็มในงานประจำวัน
>
> **ประกอบใหม่ทั้งฉบับ ไม่ใช่แพตช์ทีละจุด** — การแพตช์ทีละบรรทัดคือกลไกที่ทำให้เอกสารคลาดจากของจริงมาทุกรอบ (เคยค้างที่ migration `0021` ทั้งที่ถึง `0024` แล้ว → สเปกสั่งสร้าง `0022` ผิด · เคยค้างที่ 254 เทสต์ ทั้งที่ 300+) ทุกประโยคในไฟล์นี้มาจากการอ่านไฟล์จริงในรอบนี้ ไม่ได้คัดลอกจากฉบับเดิม
> **กติกาการใช้:** ทุกข้อความควรชี้กลับไปที่ไฟล์จริงได้ จุดไหนยังไม่ได้ตรวจจะเขียนว่า "ยังไม่ได้ตรวจ" ตรง ๆ ไม่เดา · ค่าสี hex และเลขเรขาคณิตของฮีโร่ **ไม่คัดลอกมาไว้ที่นี่** — อ่านจากไฟล์แหล่งความจริง
> **ตัวเลขทุกตัวนับใหม่ในรอบนี้** จากคำสั่งที่รันจริง (ดู §12 ท้ายไฟล์)
> **ตรวจล่าสุดเทียบ repo จริง:** main `5242f0a` (PR-T3 · #118 · หลัง T3 merge) — migration ล่าสุด `0027` · โครงยึดฉบับเดิม (ใช้ได้ดี) แต่เนื้อเขียนใหม่ทั้งหมด

---

## 1. โปรเจกต์นี้คืออะไร

PWA บันทึกรายรับ-รายจ่ายส่วนตัว ที่มี **กึ่งระบบสต็อกสินค้า** (เสื้อผ้า/ของมือสอง ขายต่อ) + ระบบ **ยอดค้างกับเพื่อน** รวมอยู่ในแอปเดียว (`package.json` description · `README.md`)

- **ผู้ใช้:** เจ้าของ + เพื่อนไม่กี่คน · **ต่างคนต่างขายของตัวเอง ไม่แชร์คลัง** · "ยอดค้าง" เป็นฟีเจอร์ cross-user ตัวเดียวในแอป
- **ภาษา:** ไทย (`index.html` `lang="th"`) · **สกุลเงิน:** THB (`lib/format.ts` `Intl.NumberFormat('th-TH')`) · **เขตเวลา:** Asia/Bangkok
- **เขตเวลาเป็นข้อจำกัดทั้งแอป:** ทั้งฝั่ง client (`lib/dates.ts` `APP_TZ='Asia/Bangkok'`) และ DB (`0010`: `(now() at time zone 'Asia/Bangkok')::date`) เคาะ "วันนี้/เดือนนี้" เป็นเวลาไทยเสมอ ไม่ใช่ timezone ของเครื่อง — ไม่งั้นรายการเวลา 00:30 ICT จากเครื่อง UTC จะลงผิดวัน และยอดรายเดือนจะ drift ที่ขอบเดือน
- **ไม่มีหน้าสมัครสมาชิก** — เจ้าของสร้างบัญชีให้ใน Supabase dashboard · มีเฉพาะหน้าเข้าสู่ระบบ + กู้รหัสผ่าน (`/login`, `/forgot-password`, `/reset-password`)
- **Deploy:** Cloudflare Workers (static assets) — worker ชื่อ `stash-web` (`wrangler.jsonc`) เสิร์ฟทั้ง SPA และ `/api/*` · **production URL ที่แน่นอนไม่ได้ pin ไว้ในไฟล์ repo** (`.env.example` ใช้ placeholder) → ยังไม่ได้ตรวจจากไฟล์

---

## 2. Stack + ข้อจำกัดสภาพแวดล้อม

Vite 6 · React 18 · TypeScript · Tailwind 3 · Supabase (Postgres + Auth อีเมล/รหัส + Storage) · TanStack Query 5 · react-router-dom 6 · `vite-plugin-pwa` · Cloudflare Workers · Vitest 2 (รวม guard เบราว์เซอร์จริงด้วย `playwright-core` + Chromium) (ทั้งหมดจาก `package.json` dependencies)

**สคริปต์จริง (`package.json`):** `dev` · `build`=`tsc -b && vite build` · `preview` · `test`=`vitest run` · `test:watch` · **`lint`=`tsc -b`** · `typecheck`=`tsc -b` · `cf:dev`=`wrangler dev` · `cf:typegen` · `deploy`=`npm run build && wrangler deploy`
> **ยังไม่มี ESLint** — `npm run lint` เป็นแค่ `tsc -b` (ตรวจจาก `package.json` scripts รอบนี้ · ยังจริง)

**ข้อจำกัดที่กำหนดวิธีทำงานทั้งหมด:**

- เจ้าของทำงาน**ออนไลน์ล้วน ไม่มีเครื่อง dev** — รันคำสั่ง local เองไม่ได้ (AI agent รันให้)
- **Migration เป็น raw SQL รันมือใน Supabase SQL Editor** — ไม่มี Supabase CLI ไม่มี migration runner ในเวิร์กโฟลว์นี้ (`schema_migrations` เป็นตารางที่ migration แต่ละไฟล์ insert เอง)
- **AI agent ต่อ DB ไม่ได้** — ต้องส่ง SQL ให้เจ้าของรันแล้วรายงานผลกลับ · เพราะงั้น**แหล่งความจริงของ schema ที่ agent อ่านได้คือ `src/lib/database.types.ts`** (generate มาจาก DB จริง) ไม่ใช่การ query
- **`database.types.ts` regenerate ผ่าน workflow `types-drift`** (ดู §2.1) — ไม่ paste มือ
- **Deploy อัตโนมัติผ่าน Cloudflare Workers Git integration** (build จาก git ตรง) — **ห้ามเพิ่ม deploy workflow ใน GitHub Actions** จะกลายเป็นสองทางเดินชนกัน (`vite.config.ts` อ่าน `WORKERS_CI_COMMIT_SHA` = ทางเดิน Cloudflare Workers Builds)
- **merged ≠ deployed ≠ สิ่งที่เบราว์เซอร์รันอยู่** — ก่อนไล่บั๊กหน้าจอทุกครั้ง อ่าน version stamp ท้ายหน้าตั้งค่าก่อน (§9 · §10)
- **`refetchOnWindowFocus: true`** (`src/App.tsx:18` · `staleTime: 30_000` `App.tsx:12` · `retry: 1` `App.tsx:13`) — PWA ที่ค้าง background กลับมาต้องเห็นตัวเลขสด · **ผลข้างเคียง:** effect ที่ seed ฟอร์มจากผลของ query **ต้องผูกกับ `id` ไม่ใช่ object** ไม่งั้น window blur→focus (เช่น native date/file picker) จะ refetch → object ใหม่ → effect ทับสิ่งที่ผู้ใช้พิมพ์ค้าง (§11.4-17)

### 2.1 GitHub workflows (`.github/workflows/` — 2 ไฟล์)

| ไฟล์ | trigger | ทำอะไร | secret |
|---|---|---|---|
| `ci.yml` | push→`main` + ทุก PR | `npm ci` → `npm run build` (`tsc -b && vite build`) → `npx playwright-core install --with-deps chromium` → `npm test` (`vitest run`) · Node 22 · `concurrency` cancel-in-progress · **ไม่ deploy** · ขั้น chromium มีเพื่อให้ guard เบราว์เซอร์จริงรันได้จริงใน CI (ไม่ใช่ skip) | **ไม่ใช้ secret เลย** — เทสต์ใช้ dummy Supabase env จาก `vitest.config.ts` (`VITE_SUPABASE_URL=http://localhost:54321`) |
| `types-drift.yml` | cron `0 18 * * *` (18:00 UTC = 01:00 ไทย) + `workflow_dispatch` | `supabase gen types typescript --project-id` (Management API — generator เดียวกับ dashboard) เทียบกับ `src/lib/database.types.ts` · ต่างเมื่อไร → เปิด/อัปเดต PR บน branch เดียว `automation/database-types-drift` (label `types-drift`) ผ่าน `peter-evans/create-pull-request@v6` · เหมือนกัน → เงียบ · **ไม่แตะ `main` ตรง ๆ** (main protected) | `SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_ID` · optional `GH_PAT` (ถ้าไม่มี ใช้ `GITHUB_TOKEN` แต่ PR นั้นจะ trigger `ci.yml` ต่อไม่ได้) |

> **ทำไมต้องมี `types-drift`:** เจ้าของไม่มีเครื่อง dev → `database.types.ts` regen จาก dashboard แล้ว paste มือหลัง migration ทุกครั้ง · **พลาดเมื่อไรฐานข้อมูลกับ repo แยกกันเงียบ ๆ** — ซึ่งเกิดจริงกับ `0015` (schema apply แล้ว แต่ migration + types ไม่เคยเข้า main ไม่มีอะไรฟ้อง) · workflow นี้ปิดช่องนั้น (หัวไฟล์ `types-drift.yml`)
> **ลำดับที่ถูกเมื่อ migration เปลี่ยน/เพิ่ม signature ของ RPC ที่ client เรียก:** ห้าม merge PR `types-drift` เดี่ยว — types ใหม่จะไม่ตรงกับ call site → `tsc` ล้ม → main แดง · ดึงไฟล์เข้า branch ฟีเจอร์ (`git checkout origin/automation/database-types-drift -- src/lib/database.types.ts`) แล้ว **merge ทีเดียวพร้อม call site** (`0020` พลาดข้อนี้ · §9)

---

## 3. โครงสร้างชั้นข้อมูล

```
DB (tables + RPC + trigger)  →  lib/ (pure function)  →  hooks/ (TanStack Query)  →  UI (pages/ + components/)
```

ตรรกะที่แตะเงินอยู่ใน **SQL** หรือใน **pure function ของ `lib/`** เท่านั้น **ห้าม inline ใน component** · `lib/` เดินทางเดียว **ห้าม import จาก `hooks/`** — รับ "รูปร่างขั้นต่ำ" แบบ structural แทน (`txCache.ts`/`txRestore.ts`/`entryHints.ts`/`ledger.ts` ทำแบบนี้ · มีคอมเมนต์กำกับที่หัวไฟล์)

**ไฟล์ที่ต้องรู้จัก (จากการอ่านจริงรอบนี้):**

| ไฟล์ | หน้าที่ |
|---|---|
| `src/lib/database.types.ts` | **generated — ห้ามแก้มือ** (ทุก regen ทับหมด) · แหล่งความจริงของ schema ที่ agent อ่านได้ |
| `src/lib/db.ts` | type alias ระดับแอป derive จาก generated (`Tables<>`/`Enums<>`/`Fns[...]`) — ถ้า generator declare คอลัมน์ left-join เป็น non-null ให้ `Omit` + ประกาศ nullable ใหม่ **ไม่ cast** |
| `src/lib/ledger.ts` | predicate กลางจำแนกแถว: `isSpendingRow` / `isBudgetSpendingRow` (ตัด `is_stock_cogs`/`is_debt_settlement`/`is_shop_operating`) + **`lockedRowInfo()`** แนวคิด "แถวล็อก" ที่เดียว (§5) |
| `src/lib/shopAccount.ts` | **`computeShopProfit()`** — สูตร P&L ร้าน (ถังที่ 1 − ถังที่ 2) ที่เดียว · pure ไม่แตะ DB (§4) |
| `src/lib/shopCategory.ts` | resolve หมวดร้านฝั่งรายรับด้วย `kind + is_shop_category` (ไม่มี `system_key`) · `hasShopIncomeCategory`/`pickShopIncomeCategory` (§11.4-30) |
| `src/lib/spendable.ts` | `computeSpendable(safe, bills, daysLeft)` — บรรทัดรอง SAFE · ไม่ print rate ติดลบ ไม่ clamp เงียบ |
| `src/lib/debtsSummary.ts` | สรุปยอดค้าง: `computeDebtsHeadline` (หน้ารวม อ่าน `shared_net`) + `computeFriendLedger` (รายคน แยก agreed/private คนละถัง) (§11.6) |
| `src/lib/sku.ts` | normalize/validate **prefix** เท่านั้น (`^[A-Z0-9]{3}$`) — **ไม่ประกอบ SKU** (สูตรอยู่ที่ RPC `stock_sku_build`) |
| `src/lib/username.ts` | กติกา username (`^[a-z0-9_]{3,20}$`) mirror CHECK ใน DB (0020) |
| `src/lib/dates.ts` | helper วันที่/เดือนกลางทั้งแอป (Asia/Bangkok) · **"เดือน" = string `YYYY-MM`** เทียบ `<`/`>` ตรง ๆ ไม่แปลงเป็น Date (§11.4-19) · `daysSince`/`daysLeftInMonthKey`/`trailingMonthsBounds`/`monthBoundsFromKey` |
| `src/lib/catColor.ts` | `catColorVar(index)` — slot หมวด 1–6 → CSS var **ที่เดียวที่แปลง index→สี** (ไม่มี hex) |
| `src/lib/percent.ts` | `largestRemainderPercents()` — % รวมได้ 100 พอดี (Hamilton) |
| `src/lib/errors.ts` | `translateError()` แปลง error → ข้อความไทยที่เดียว · จับด้วย `code`/`status` ไม่จับ substring · **ข้อความที่มีอักษรไทยอยู่แล้วถูกส่งผ่านตรง ๆ** (สำคัญ · §9) |
| `src/lib/txCache.ts` / `txRestore.ts` | เติมแถวที่เพิ่ง insert ลง cache หน้าแรก / payload คืนแถวที่ลบ (undo) · pure · structural · **ไม่ใช่ optimistic update** (§11.4-16/18) |
| `src/lib/offlineQueue.ts` | write-outbox บน IndexedDB — **ไม่มีไฟล์ไหน import (dead code)** ยืนยันด้วย grep รอบนี้ (§10) |
| `src/hooks/useShopOperating.ts` | รวมยอดถังที่ 2 ฝั่ง client + **`SHOP_ROW_CAP=1000` guard** (§4 · §10 · §11.4-29) |
| `src/hooks/useHome.ts` | `computeHomeSummary(rows, cats, month, now)` — **แยก `month` ("เดือนไหน") ออกจาก `now` ("วันนี้")** (§11.4-20) |
| `src/hooks/useHistory.ts` | ค้นหาผ่าน **RPC เดียว `transactions_search`** ที่คืนทั้งหน้าและยอดรวมทั้งชุด (window aggregate) (§11.4-15) |
| `src/hooks/useUpcomingBills.ts` | บิลรอจ่ายเดือนนี้ (เดิน `recurring_next_date` RPC) · **จงใจไม่รับ `month`** ผูกกับ "ตอนนี้" เสมอ + guard `MAX_OCCURRENCES_PER_RULE=40` (§11.4-21) |
| `src/components/LedgerRow.tsx` | แถว ledger ใช้ร่วม (หน้าแรก/ประวัติ) · ไอคอนกุญแจจาก prop `locked` |
| `src/components/SegmentedControl.tsx` | pill segmented control กลาง (generic · `role="tablist"`) — **ผู้เรียกจริงมีตัวเดียว: `ShopProfitCard`** (§10 หนี้ที่รู้ตัว) |

**14 ตาราง** (นับจาก block `public.Tables` ใน `database.types.ts`):
`budgets` `categories` `debt_events` `debts` `favorites` `friend_connections` `profiles` `recurring` `schema_migrations` `stock_items` `stock_sales` `stock_sku_config` `transactions` `wallets`

- ทุกตาราง RLS เปิด + policy owner-only บน `auth.uid() = user_id` (`0001` สำหรับตารางแกน) — **ยกเว้น 2 กลุ่ม:**
  - `schema_migrations` (`0011`): RLS เปิด · **0 policy** · revoke สิทธิ์ anon/authenticated ทั้งหมด (ตั้งใจ)
  - **กลุ่มยอดค้าง** `debts`/`debt_events`/`friend_connections`/`profiles` (`0015`): ฟีเจอร์ cross-user ตัวแรก → RLS **select-only** (เห็นได้เมื่อเป็นคู่กรณี/เพื่อน) + **เขียนผ่าน SECURITY DEFINER RPC ที่ re-check `auth.uid()` เอง** (§6 · §11.6)

---

## 4. กฎธุรกิจ — เงิน (สำคัญที่สุดในไฟล์)

ที่มา: `lib/ledger.ts` · `lib/shopAccount.ts` · `0012` (ขาย) · `0015` (ยอดค้าง) · `0026` (หมวดร้าน)

1. **ซื้อของเข้าสต็อกไม่ใช่รายจ่าย** — เป็นการแปลงสินทรัพย์ · `is_stock_purchase=true` ตัดออกจาก "ยอดจ่าย" (`isSpendingRow` = `type==='expense' && !is_stock_purchase`)
2. **ขาย = บันทึกสองแถวเสมอ (Model A, gross)** (`stock_sale_create` · `0012`/`0013`): income = ราคาขาย×qty (หมวด `system_key='stock_sale_income'`) · expense = ต้นทุน×qty (`is_stock_cogs=true` · หมวด `stock_cogs` · wallet null) · เงินคำนวณใน SQL เป็น numeric ทั้งหมด
3. `safeToSpend = income − spending` — **ไม่ต้องมี accumulator แยกสำหรับ COGS** เพราะ COGS ถูกหักกลบด้วย income ของการขายเองใน Model A gross เหลือแต่กำไร
4. **COGS นับใน headline เงินออก + donut ตามปกติ แต่ตัดออกจาก budget** (`isBudgetSpendingRow` ตัด `is_stock_cogs`) — budget คุมค่าใช้จ่ายส่วนตัว ไม่ใช่ต้นทุนสินค้า
5. **เคลียร์ยอดค้าง (`is_debt_settlement=true`) กติกาเดียวกับ COGS:** นับใน headline แต่ตัดจาก budget
6. **ค่าดำเนินร้าน (`is_shop_operating=true`) กติกาเดียวกับ COGS/เคลียร์ยอดค้าง:** นับใน headline **แต่ตัดจาก budget** (ถังที่ 2 บัญชีร้าน · `0026`) — mirror สองที่: `isBudgetSpendingRow` ตัด `is_shop_operating` (client) + query ของ budget spending ก็ตัดฝั่ง SQL
   - **`transactions.is_shop_operating` เป็น derived column เขียนโดย trigger `set_txn_shop_operating` เท่านั้น** (`0026` · `DEFINER` · เขียน `new.is_shop_operating := coalesce(<category.is_shop_category>, false)` แบบไม่มีเงื่อนไข) — **client ห้ามส่งค่านี้** · แหล่งความจริงคือป้าย `categories.is_shop_category` ที่ผู้ใช้ติด
7. **บัญชีร้านมีสองถังแยกกันเด็ดขาด** (`lib/shopAccount.ts` `computeShopProfit`):
   - **ถังที่ 1 = กำไรขั้นต้น** จาก `stock_sales` (`stock_sales_summary` RPC) — ยอดขาย − ต้นทุนที่ขายไป
   - **ถังที่ 2 = ค่าดำเนินร้าน** จาก `is_shop_operating` — เป็น **net** (ค่าส่ง/แพ็ค/ฟี/การตลาดที่จ่าย − ค่าส่งที่เก็บจากลูกค้า)
   - **กำไรสุทธิ = ถังที่ 1 − ถังที่ 2** · **ห้ามเกลี่ยถังที่ 2 ลงรายชิ้น** — ไม่มีคำตอบที่ถูกว่าค่าโฆษณา/ค่าส่งควรตกกับสินค้าชิ้นไหน (§11.4-27)
8. **ขายขาดทุนได้** — สองแถว ledger ยังเป็นบวก มีแค่ `stock_sales.profit` ที่ติดลบ · `computeShopProfit` **ไม่ clamp** ปล่อยติดลบให้การ์ดโชว์คำเตือน
9. `cost_at_sale` snapshot ต้นทุน/ชิ้น ณ วันขาย → แก้ `cost_per_unit` ทีหลังไม่กระทบกำไรที่รับรู้ไปแล้ว (ต่างจาก `is_shop_operating` ที่ไล่รีไรต์แถวเก่า · §11.4-25)
10. **วันที่ฝั่ง DB ใช้ `(now() at time zone 'Asia/Bangkok')::date` เสมอ** ห้าม `current_date` (`0010`) · `sale_date` ห้ามเป็นอนาคต (เทียบเวลาไทย)
11. **ตัดสินว่ารายการอยู่เดือนไหนต้องอ่านจาก string `YYYY-MM-DD` ตรง ๆ** ห้ามแปลงเป็น Date object แล้วอ่านค่า (§11.4-19)
12. **บิลรอจ่ายหักออกจาก "ใช้ได้วันละ" — หักเฉพาะรายจ่าย ไม่บวกรายรับ** (`lib/spendable.ts` + `useUpcomingBills`) · ไม่สมมาตรโดยตั้งใจ (§11.4-7)
13. **ห้าม clamp ยอดเงินเป็น 0 เงียบ ๆ ทุกที่ที่แสดงเงิน** — ติดลบ/เกิน ให้บอกตรง ๆ + ไอคอนเตือน (§11.4-8)
14. **ห้ามเติมค่าเงินให้ล่วงหน้าในจุดที่ผู้ใช้จะกดผ่าน** — ราคาขาย (แผงขาย) และค่าส่ง (ป๊อปอัพ) เปิดมาว่างเสมอ · ค่าที่เดาให้แล้วกดผ่าน = ราคาผิดที่ไหลเข้ากำไรทันที (§11.4-30/32)

---

## 5. กฎธุรกิจ — สต็อก + แถวที่ล็อก

ที่มา: `0001`/`0012`/`0025`/`0027` · `pages/StockPage.tsx` · `hooks/useStock.ts` · `lib/ledger.ts`

- `qty_remaining` / `status` **คำนวณจากจำนวนเสมอ** (`sold` เมื่อเหลือ 0 · `partial` เมื่อ < ทั้งหมด · `in_stock` เมื่อเท่าทั้งหมด) · CHECK `qty_remaining <= qty_total` (`0001`)
- **`cost_per_unit` และ `qty_total` ล็อกเมื่อมีการขายแล้ว** — trigger `stock_item_lock_after_sale` (`0012`)
- **SKU สร้างจาก DB** ตาม `stock_sku_config` (1 แถวต่อ user) · รูปแบบ **`{PREFIX}-{SEQ}`** เช่น `STZ-0000` (`0025` · เดิม 3 ท่อนมีแบรนด์ `STZ-GEN-0002`) · prefix `^[A-Z0-9]{3}$` 3 ตัวพอดี · seq 4 หลัก zero-pad, `lpad(x, greatest(4, len))` **ขยายไม่ตัด** เกิน 9999
- **ตัวนับ `next_seq` ผูกกับ user ไม่ผูกกับ prefix** เริ่ม 0 เดินหน้าอย่างเดียว (`0025`: default 0, CHECK `>= 0`) · bump แบบ atomic `update ... set next_seq = next_seq + 1 returning next_seq - 1` + retry เมื่อชน unique `(user_id, sku)` · สูตรประกอบอยู่ที่ **`stock_sku_build(prefix, seq)` ที่เดียว** (intake + preview เรียกตัวเดียวกัน · client มีแค่ normalize/validate prefix)
- **prefix แก้เองได้ตลอด** (`SkuManager.tsx` → `useUpdateSkuPrefix` upsert `stock_sku_config` ตรงผ่าน own-row policy) — **มีผลกับของรับเข้าใหม่เท่านั้น** ของเก่าไม่เปลี่ยน · ตัวนับไม่รีเซ็ต (`STZ-0042` → `ABC-0043`) (§11.4-24)
- สินค้าที่มีประวัติขาย **ลบไม่ได้** (`stock_item_delete` เช็ค `stock_sales` แล้ว raise · FK `on delete restrict`) ต้อง reverse ก่อน
- **ไม่มี `target_price` แล้ว** (`0027` DROP คอลัมน์) — **ราคาขายกรอกตอนขายเท่านั้น** (แผงขายใน `StockEditSheet` เปิดมาว่าง+focus ไม่เติมค่า) · เดิมเก็บ "ราคาที่หวัง" แล้วคูณโชว์ "รอขาย/กำไรคาดการณ์" = ตัวเลขที่ดูเหมือนเงินแต่ไม่ใช่เงิน (§11.4-31)
- **ทุนจม (`StockPage.computeSunkCost`)** แทนที่กำไรคาดการณ์บนหน้าคลัง = Σ `cost_per_unit × qty_remaining` ของของที่ **`isStale`** (ในสต็อก **และ** ค้างเกิน `AGE_OLD_MAX` วัน) · เป็นเงินจริง → mask ตาม `hideBalance` · ฿0 = ข่าวดี → โชว์ "ไม่มีของค้างนาน" ไม่ใช่เลข 0
- การ์ดสินค้าโชว์ **ต้นทุน (mask ได้) + จำนวนวันในคลัง** (`daysSince(created_at)`) — **จำนวนวันไม่ mask** (ไม่ใช่จำนวนเงิน) · ของที่ขายหมดไม่โชว์วัน
- **เกณฑ์อายุอยู่ที่เดียว** (`StockPage.tsx:36-37`): `AGE_FRESH_MAX=30` · `AGE_OLD_MAX=60` (≤30 fresh · 31–60 aging · >60 old/"ค้างนาน") · `isStale` (ใช้โดยทั้งชิป "ค้างนาน" · `computeSunkCost` · กระดิ่ง `useAttention`) reuse ค่าเดียวกัน ไม่ประกาศ 60 ซ้ำ

**แนวคิด "แถวที่ล็อก" — รวมที่ `ledger.ts` `lockedRowInfo(r)` ที่เดียว** คืน `{ kind, dateEditable, reason, actionLabel, actionTo }` ครอบ 3 ชนิด:

| kind | เงื่อนไข | แก้วันที่ได้ | ไปย้อนที่ |
|---|---|---|---|
| `stock_purchase` | `is_stock_purchase` | **ได้** | `/stock` |
| `stock_sale` | `isSaleLinkedRow(r)` (`is_stock_cogs` หรือ income ที่ผูก `stock_item_id`) | ไม่ได้ | `/stock` |
| `debt_settlement` | `is_debt_settlement` | ไม่ได้ | `/debts` |

- แต่ละชนิดมี **trigger กันที่ DB** (`stock_sale_txn_guard` `0012` · `debt_settlement_txn_guard` `0015`) · `lockedRowInfo` คือ client mirror บอกผู้ใช้ **ก่อน** ชน trigger · ทั้งคู่ **แก้ note/wallet ได้ แต่ยอด/ประเภท/วันที่ไม่ได้**
- แถวขายต้องย้อนผ่าน `stock_sale_reverse` (ลบ `stock_sales` **ก่อน** ลบ transaction) · แถวเคลียร์ย้อนผ่าน `debt_settle_reverse`
- **`lockedRowInfo()` ยังเป็นด่านของ undo การลบด้วย** — `txRestore.buildRestoreInsert()` โยน error ถ้า snapshot เป็นแถวล็อก (คืนตรง ๆ = transaction กำพร้าไม่ผูก stock_sales/debts) · guard อยู่ที่ชั้นข้อมูล ไม่พึ่งว่า UI ไม่เรียก
- **เพิ่มชนิดล็อกใหม่ → แก้ที่เดียว:** เพิ่มใน union `LockedKind` + 1 branch ใน `lockedRowInfo()` แล้วทุกหน้ารับไปเอง

---

## 6. RPC ทั้งหมด — 26 ตัว

นับจาก block `public.Functions` ใน `database.types.ts` (26 entry) · definer/invoker อ่านจากไฟล์ migration **เวอร์ชันล่าสุดที่ (re)define** (PostgreSQL default = INVOKER เมื่อไม่ระบุ clause)

**สต็อก/ระบบ (12):**
`stock_intake_create` (INVOKER · ล่าสุด `0027` 13-arg) · `stock_item_delete` (INVOKER · `0006`) · `stock_sale_create` (INVOKER · `0013`) · `stock_sale_reverse` (INVOKER · `0013`) · `stock_sales_summary` (INVOKER · `0012`) · `stock_sku_build` (INVOKER · `0025` 2-arg) · `stock_sku_preview` (INVOKER · `0025` 0-arg) · `seed_defaults` (**DEFINER** · `0008` · guard `auth.uid()=uid`) · `seed_defaults_internal` (**DEFINER** · ล่าสุด `0026`) · `recurring_run_due` (INVOKER · `0010`) · `recurring_next_date` (INVOKER · `0008`) · `pick_category_color_index` (INVOKER · `0016`)

**ประวัติ/ค้นหา (1):**
`transactions_search` (INVOKER · stable · ล่าสุด **`0024`** 6-arg = `p_filter, p_q, p_limit, p_offset, p_month, p_category_id`) — filter+ค้นหา note/ชื่อหมวด/ยอด + ยอดรวมทั้งชุด (`count(*) over ()`, sum income/expense) ใน query เดียว (§11.4-15)

**ยอดค้าง (13 · เขียนข้อมูล = ทั้งหมด `DEFINER` เว้น summary):**
`debt_create` (**DEFINER** · ล่าสุด `0019` — fix cast enum) · `debt_confirm` (`0015`) · `debt_reject` (`0015`) · `debt_cancel` (ล่าสุด `0018`) · `debt_settle` (`0015`) · `debt_settle_many` (`0021` — วน `debt_settle` ฝั่งเซิร์ฟเวอร์ ทรานแซกชันเดียว · **client ไม่ลูปเอง**) · `debt_settle_reverse` (`0015` · เฉพาะคนที่กดเคลียร์) · `debt_share_private` (`0018`) · `debt_delete_private` (`0015`) · `friend_request_send` (**DEFINER** · ล่าสุด `0020` = `p_username`) · `friend_request_respond` (`0015`) · **`friend_debts_summary`** (**INVOKER** · ล่าสุด `0017` 0-arg — อ่านอย่างเดียว) · `generate_friend_code` (**DEFINER** · `0015` · ไม่ grant ให้ role ใด · เลิกใช้ · §11.4-14)

**สรุป definer/invoker (กติกาที่ไฟล์ยืนยัน):** cross-user / seed / เขียนยอดค้าง = **DEFINER** (ตาราง select-only → เขียนแบบ definer + re-check `auth.uid()` เป็นคู่กรณีในทุกฟังก์ชัน) · single-owner read + สต็อก RPC + search = **INVOKER** (พึ่ง RLS `auth.uid()=user_id` ที่มีอยู่แล้ว)

> **ไม่ใช่ RPC (trigger function — ไม่โผล่ใน types):** `set_updated_at` · `handle_new_user` · `stock_item_lock_after_sale` · `system_category_no_delete` · `stock_sale_txn_guard` · `debt_settlement_txn_guard` · `set_category_color_index` · `profiles_username_setonce` · **`set_txn_shop_operating`** (`0026` DEFINER — คัดลอกป้ายลง `is_shop_operating`) · **`sync_shop_operating_on_category`** (`0026` DEFINER — ไล่รีไรต์แถวเก่าเมื่อป้ายเปลี่ยน)
> **cross-check สองทาง (ทำรอบนี้):** ทุกฟังก์ชันใน `public.Functions` (26 ตัว) **มีไฟล์ migration รองรับครบ** — ไม่มี "อยู่ใน types แต่ไม่มีไฟล์" (กับดัก `0015`) · และ trigger function ทุกตัวข้างบน **ไม่อยู่ใน types อย่างถูกต้อง** (trigger ไม่ใช่ RPC) → ไม่มี orphan
> **`recurring_next_date` คืนวันถัดไปหลัง `p_from` แบบ strict** — `useUpcomingBills` วนเรียก ห้ามเขียนตรรกะวันที่ schedule ฝั่ง client (หลักการเดียวกับ SKU)
> **ทุก RPC ที่แก้ข้อมูลต้องถูก "เรียกจริง" ถึงจะพิสูจน์** — `debt_create` มีบั๊ก cast enum ตั้งแต่ `0015` แต่ผ่าน verification ทุกครั้งเพราะไม่มี UI เรียก จับได้ตอนต่อ UI จริง (แก้ `0019`) → smoke test ต้องเรียกฟังก์ชันจริงและ assert ผล (§9)

---

## 7. Seed ของ user ใหม่

`handle_new_user()` (trigger AFTER INSERT บน `auth.users` · DEFINER) → `seed_defaults_internal(uid)` (**DEFINER**)

- **3 wallets** (ไม่มีคอลัมน์ `balance` แล้ว — DROP ใน `0011`) · **1 แถว `stock_sku_config`** (prefix `STZ`, `next_seq=0`) · **1 แถว `profiles`** (`display_name` = ชื่อก่อน `@` ของอีเมล · `friend_code` สุ่มผ่าน `generate_friend_code()` เพื่อเติมคอลัมน์ NOT NULL · **`username`=null** ตั้งเองทีหลัง)

> **reproduce ล่าสุดของ seed_defaults_internal อยู่ที่ `0026` SECTION 6** (chain: `0015`→`0016`→`0017`→`0026` เขียนทับต่อกัน) — **migration ตัวถัดไปที่แตะ seed ต้อง reproduce จาก `0026` ไม่ใช่ `0017`** · (จุดนี้พลาดบ่อย — ตรวจเลข reproduce ล่าสุดจากไฟล์จริงก่อนเขียนทุกครั้ง)

**หมวดหมู่ที่ seed = 18 หมวด** (13 expense + 5 income · คอลัมน์ที่ seed: `user_id, name, kind, is_stock_category, is_shop_category, is_system, system_key, icon, color_index, sort_order`):

| system_key | หมวด | kind | ป้าย | ลบได้ | เห็นในหน้ากรอกมือ |
|---|---|---|---|---|---|
| `stock_sale_income` | ขายสต็อก | income | — | ไม่ได้ | **ซ่อน** (`0026` กลับคำ — เดิมเห็น) |
| `stock_cogs` | ต้นทุนขายสต็อก | expense | — | ไม่ได้ | ซ่อน |
| `debt_repayment_income` | ได้รับคืนจากเพื่อน | income | — | ไม่ได้ | ซ่อน (มาจาก `debt_settle`) |
| `debt_repayment_expense` | จ่ายคืนเพื่อน | expense | — | ไม่ได้ | ซ่อน (มาจาก `debt_settle`) |
| (null) | อาหาร · เดินทาง · ช้อปปิ้ง · บิล/ค่าบ้าน · บันเทิง | expense | — | ได้ | เห็น |
| (null) | เสื้อเข้าร้าน · รองเท้าเข้าร้าน | expense | `is_stock_category` | ได้ | ซ่อน (ป้ายสต็อก) |
| (null) | ค่าส่ง · บรรจุภัณฑ์ · ค่าธรรมเนียมขาย · การตลาด | expense | **`is_shop_category`** | ได้ | เห็น |
| (null) | เงินเดือน · ฟรีแลนซ์ | income | — | ได้ | เห็น |
| (null) | ค่าส่งที่เก็บจากลูกค้า | income | **`is_shop_category`** | ได้ | เห็น |

- **ชื่อหมวดยอดค้างถูกเปลี่ยนใน `0017` ให้เลี่ยงคำว่า "หนี้"** — เดิม `0015`/`0016` = "จ่ายชำระหนี้"/"ได้รับชำระหนี้" ตอนนี้ = "จ่ายคืนเพื่อน"/"ได้รับคืนจากเพื่อน" (§11.4-14) · seed ปัจจุบัน (`0026`) ใช้ชื่อใหม่
- **`categories`:** `color_index smallint 1–6 NOT NULL` (trigger `set_category_color_index` เลือก slot ว่างเมื่อไม่ส่ง/ส่ง 0/นอกช่วง) · **`categories.color` (hex) DROP แล้ว** (`0016`) · `icon text NOT NULL default 'tag'` **ไม่มี CHECK ชื่อไอคอน** (`lib/icons.tsx` fallback · §11.4-4) · `is_stock_category` / `is_shop_category` boolean NOT NULL default false · **CHECK `categories_shop_flag_check`: `not (is_shop_category and (is_system or is_stock_category))`** (`0026`) — หมวดระบบ/สต็อกติดป้ายร้านไม่ได้
- **resolve หมวด system ด้วย `system_key` เท่านั้น ห้าม match ชื่อไทย** (ผู้ใช้เปลี่ยนชื่อได้) · ยกเว้น backfill ครั้งเดียวใน migration · **หมวดร้านไม่มี `system_key`** จึง resolve ด้วย `kind + is_shop_category` แทน (§11.4-30)

---

## 8. Convention — กฎที่ห้ามละเมิด

### Migration
1. **ห้ามแก้ไฟล์ migration ที่ apply แล้ว** — เขียนไฟล์ใหม่เสมอ
2. **reproduce ฟังก์ชัน/seed จากเวอร์ชันล่าสุดบน main** (seed ตอนนี้ = `0026`) ห้ามหยิบจากไฟล์ต้นฉบับ · **ตรวจเลข migration/seed ล่าสุดจากไฟล์จริงก่อนเขียนสเปกทุกใบ** ห้ามอ่านจากเอกสารนี้ (§9)
3. เปลี่ยน signature → `drop function` ด้วย signature จริงจาก DB (**ไม่ใส่ `if exists`**) แล้ว re-grant
4. ตารางใหม่ → enable RLS + policy
5. เจ้าของรันเอง ครอบ `begin; … commit;` และ snapshot ฟังก์ชันเดิมก่อนทับ · **หลังรัน ตรวจว่าไฟล์ `.sql` เข้า main จริงด้วย git** (กับดัก `0015` · §9)
6. **อ่าน `pg_constraint` ของทั้งตารางก่อนแก้** ไม่ใช่แค่ `information_schema.columns` (มองไม่เห็น CHECK · §9)

### SQL
7. **`RETURNS TABLE`/OUT param กลายเป็นตัวแปรใน scope** → alias ทุกตาราง qualify ทุกคอลัมน์ (ambiguity เกิดตอน runtime → migration ผ่านแต่ฟีเจอร์พัง · กับดัก `qty_remaining` · §9)
8. **ค่าจาก CASE/`values` list ไม่ cast enum ให้อัตโนมัติ** → cast `::public.enum_type` ตอน INSERT (บั๊ก `debt_create` · §9)
9. **Verification ต้องพิสูจน์ว่า "ทำงานได้" ไม่ใช่แค่ "มีอยู่"** — smoke test เรียกฟังก์ชันจริงใน `begin;…rollback;` (impersonate ด้วย `request.jwt.claims`) แล้ว assert ผล
10. เงินคำนวณใน numeric เท่านั้น

### Client
11. **ห้ามมีตรรกะซ้ำสองที่** — แยกเป็นฟังก์ชันกลางแล้ว import (สี=`catColor.ts` · วันที่=`dates.ts` · schedule=RPC · แถว ledger=`LedgerRow` · แถวล็อก=`ledger.ts` · P&L ร้าน=`shopAccount.ts` · หมวดร้าน=`shopCategory.ts`)
12. **ห้าม `as unknown as` / `as any` / `@ts-ignore` / `@ts-expect-error`** — รับ "รูปร่างขั้นต่ำ" structural แทน (เทสต์เรียกตรงได้)
13. `database.types.ts` generated ห้ามแก้มือ · alias เขียนเองอยู่ใน `db.ts`
14. **ห้ามใช้คำว่า "ผ่าน" ถ้ายังไม่ได้รัน `npm run build` + `npm test`** (คำสั่งเดียวกับ CI) · **รายงานจำนวน skipped แยกจาก passed เสมอ** (§9)
15. **จับ error ด้วย code/status เท่านั้น ห้ามจับ substring** · error hint ใช้ allowlist ห้าม denylist · **error ต้องถึงผู้ใช้** ห้าม catch ว่าง
16. **ห้ามเผยว่าอีเมลมีบัญชีในระบบหรือไม่** ทุกที่ (กัน user enumeration) · **ค้นหาเพื่อนใช้ `username` ไม่ใช่อีเมล**
17. **ห้าม `new Date('YYYY-MM-DD')` แล้วอ่านค่า** (`formatBuildStamp` เป็นข้อยกเว้นที่มีคอมเมนต์) — helper กลางใน `dates.ts`
18. **สีต้องมาจาก token** ห้ามใส่ hex ดิบใหม่ใน `src/` · **ค่าสี hex เป็นแหล่งความจริงที่ `tailwind.config.ts` + `src/styles/index.css` เท่านั้น ห้ามคัดลอกไปที่อื่น (รวมเอกสารนี้)** · `theme-color`/`manifest.theme_color` ต้อง mirror ค่าจากพาเลตต์พร้อมคอมเมนต์
19. **คำที่ห้ามบนหน้าจอ:** หนี้ · เจ้าหนี้ · ลูกหนี้ · เรียกเก็บ · ทวง — **ชื่อในฐานข้อมูล/โค้ดยังเป็น `debt*` ตั้งใจ** (§11.4-14)
20. **`transactions.is_shop_operating` เป็น derived column เขียนโดย trigger เท่านั้น** — client ห้ามส่งค่า (§4-6)
21. **1 PR = 1 เรื่อง** แตกจาก main ล่าสุด ไม่ stack · เช็คก่อน push ว่า PR ยังเปิด · PR ที่ merge แล้ว = เริ่ม branch ใหม่จาก main

---

## 9. กับดักที่เคยเกิดจริง — อย่าให้ซ้ำ

| เหตุการณ์ | บทเรียน |
|---|---|
| **เอกสารค้างหลังของจริงจนสเปกผิด** — เคยเชื่อเอกสารว่า migration ล่าสุด `0021` ทั้งที่ถึง `0024` แล้ว สเปกเลยสั่งสร้าง `0022` ผิด | **สเปกทุกใบต้องให้ agent ยืนยันเลข migration/seed ล่าสุดจากไฟล์จริงก่อนเขียน ห้ามอ่านจากเอกสารนี้** (§8-2) · เอกสารคือสรุป ไม่ใช่แหล่งความจริงของตัวเลข |
| **`information_schema.columns` ไม่แสดง CHECK constraint** — อ่านคอลัมน์แล้วคิดว่ารู้จักตารางแล้ว migration ล้มเพราะชน CHECK ที่มองไม่เห็น | **อ่าน `pg_constraint` ของทั้งตาราง** ไม่ใช่แค่คอลัมน์ที่ฟ้อง (§8-6) |
| **ค่าจาก `values`/CASE ไม่ cast enum ให้** — `insert ... select` จากตาราง values ทำให้ค่ากลายเป็น `text` แล้วชน enum column (ต่างจาก literal ตรง ๆ) · ตระกูลเดียวกับบั๊ก `debt_create` | cast `::public.enum_type` ตอน INSERT เสมอ (§8-8) · `debt_create` มีบั๊กนี้ตั้งแต่ `0015` แต่รอด verification ทุกครั้งเพราะไม่มี UI เรียก (แก้ `0019`) |
| **Supabase คืนแถวได้จำกัด** — การรวมยอดฝั่ง client ที่ชนเพดานให้ผลน้อยกว่าจริงโดยไม่มี error | **ต้องมี guard เสมอ** — `useShopOperating` `.limit(SHOP_ROW_CAP=1000)` แล้วตั้ง `capped` เมื่อ `rows.length >= cap` → การ์ดขึ้นคำเตือน "ตัวเลขอาจไม่ครบ" (ห้ามแสดงยอดที่รู้ว่าไม่ครบเงียบ ๆ) |
| `create or replace` ตอนเพิ่มพารามิเตอร์ → ฟังก์ชันซ้อน 2 ตัว migration ไม่ error | signature เปลี่ยน = drop ก่อนด้วย signature จริง · verification นับจำนวนนิยาม = 1 |
| `qty_remaining` เป็นทั้ง OUT param และคอลัมน์ → การขายพังตอนกดจริง ทั้งที่ verification ผ่าน | qualify ทุกคอลัมน์ · smoke test ก่อนใช้จริง (`0013` แก้เป็น alias · `0022` ทำตามบทเรียนนี้) |
| **`0015` รันลง DB แล้วแต่ไฟล์ไม่เคยเข้า main** — PR อ้างว่า apply แต่ diff ไม่มีไฟล์ `.sql` | `schema_migrations` กับ repo ต้องตรงกัน · **ตรวจหลัง migration ว่าไฟล์เข้า main จริงด้วย git** · ห้ามประกอบไฟล์ migration ขึ้นเองจากการอ่าน types · workflow `types-drift` ปิดช่องนี้ |
| **`npm run typecheck` = `tsc --noEmit` บน solution-style tsconfig → ตรวจ 0 ไฟล์ ผ่านเสมอ** | คำว่า "ผ่าน" ต้องมาจากคำสั่งเดียวกับ CI (`tsc -b && vite build` + `vitest run`) · ตอนนี้ `lint`/`typecheck` = `tsc -b` (build ทั้ง project) |
| `getDate()` บน date-only string → วันเลื่อนใน timezone ติดลบ | อ่านวันจาก string ตรง ๆ · helper รวมใน `dates.ts` |
| **ป้ายพับในฮีโร่เป็นแถบเปล่าบน production ทั้งที่โค้ดถูก เทสต์ jsdom เขียว** — `<button>` จัดกึ่งกลางเนื้อหาเอง jsdom ไม่จำลอง layout | **เทสต์ jsdom ที่บอก "ข้อความอยู่ใน DOM" ไม่ได้แปลว่าผู้ใช้เห็น** · layout/สัมผัส ต้องตรวจในเบราว์เซอร์จริง · fix = `flex flex-col` บนปุ่ม (load-bearing) + guard `WovenHero.visual.test.ts` |
| **dark mode พื้นหลังทั้งหน้าขาว** ทั้งที่ทุกเทสต์เขียว — เทสต์เก่าเช็คแค่ token/คลาส ไม่วัดสีที่ render จริง | guard เบราว์เซอร์จริง `AppLayout.theme.visual.test.tsx` วัดสีพื้น+อักษรที่ compute จริงทั้ง light/dark |
| **ไล่บั๊กที่แก้ไปแล้วหลายชั่วโมง** เพราะบันเดิลค้าง — SW precache เสิร์ฟ `index.html` cache-first ตรึงแอปไว้ที่ commit แรกที่ติดตั้ง SW | **merged ≠ deployed ≠ สิ่งที่เบราว์เซอร์รันอยู่ · อ่าน version stamp ก่อนไล่บั๊กหน้าจอทุกครั้ง** · fix = shell network-first + SW self-activate + guard `pwa-freshness.visual.test.ts` |
| `grep -rn "mint-" src/` ว่าง ทุกคนเข้าใจว่า PR-C จบ แต่สีเก่าอยู่ใน `categories.color` ใน DB | **grep พิสูจน์ได้แค่เรื่องในโค้ด · ค่าที่ seed ลง DB คือแหล่งความจริงอีกที่ที่ grep มองไม่เห็น** (แก้ `0016`) |
| **รายงานเทสต์ "ผ่าน N" โดยมี 5 skipped ซุกอยู่ — และ 5 ตัวนั้นคือ visual guard ทั้งหมด** | guard เบราว์เซอร์จริง `ctx.skip()` นอก CI (ที่ไหน `process.env.CI` ถูกตั้ง → throw ไม่ skip) · **รันในเครื่องไม่พิสูจน์ guard พวกนั้น** · อ่าน skipped ทุกครั้ง รายงานแยก · merge ต่อเมื่อ CI เขียว |
| **PR ถูกรายงานว่า merge แล้ว ทั้งที่ยังไม่เข้า main** | ยืนยันด้วย `git ls-remote origin main` ไม่ใช่ความจำ/หน้าจอ GitHub ที่ค้าง |
| **`0020` เปลี่ยน signature RPC ที่ client เรียก แล้ว merge PR `types-drift` เดี่ยว → types ใหม่ + call site เก่าไม่ตรง → `tsc` ล้ม → main แดง** | migration ที่เปลี่ยน/เพิ่ม signature (หรือเพิ่ม RPC ใหม่ที่ client เรียก) **ห้าม merge PR `types-drift` เดี่ยว** — merge ทีเดียวพร้อม call site (§2.1) |
| Supabase free tier pause เอง แล้วหน้า login ค้างไม่บอกอะไร | error ต้องถึงผู้ใช้ · `errors.ts` `isConnectFailure` ดัก `AuthRetryableFetchError` / status 0,502-524,540,544 |

---

## 10. สถานะปัจจุบัน

**Migration:** `0001`–`0027` (นับ `ls supabase/migrations/*.sql | wc -l` = 27 · ล่าสุด `0027_drop_target_price.sql`)
`0027` ตัด `target_price` (DROP คอลัมน์ + reproduce `stock_intake_create` 14→13 args) แทนด้วยทุนจมฝั่ง client · `0026` หมวดร้าน (ถังที่ 2) · `0025` SKU prefix-only · `0022`–`0024` `transactions_search` (สร้าง+เพิ่มตัวกรองเดือน+หมวด) · `0021` `debt_settle_many` · `0015`–`0020` ยอดค้าง+username · (รายละเอียดต่อไฟล์: §6 + หัวไฟล์แต่ละใบ)

**หน้าจริงในแอป:** 13 ไฟล์ `*Page.tsx` (`find src/pages -name '*Page.tsx' | wc -l` = 13) · `router.tsx` มี **14 route** (13 หน้า + catch-all `*` → `<Navigate to="/" replace />`) — ทุกอย่าง eager import ไม่มี lazy:
- ไม่ต้อง auth: `/login` · `/forgot-password` · `/reset-password`
- ใต้ `RequireAuth` + `AppLayout` (มี bottom nav): `/` Home · `/history` · `/debts` · `/debts/friend/:friendId` · `/stock` · `/budget` · `/settings`
- ใต้ `RequireAuth` **นอก** `AppLayout` (เต็มจอ ไม่มี bottom nav): `/add` · `/stock/intake` · `/stock/queue`
- **bottom nav 6 ช่อง** (`AppLayout.tsx` `sm:hidden`): หน้าหลัก/ประวัติ/ยอดค้าง + FAB `+`→`/add` + สต็อก/ตั้งค่า · **งบประมาณไม่อยู่ใน bottom nav** (เข้าจาก nav rail เดสก์ท็อป/ตั้งค่า) · ปุ่ม "ถาม AI · เร็วๆ นี้" disabled

**เทสต์:** `npm test` (`vitest run`) จริงในรอบนี้ = **375 เคส / 42 ไฟล์ — ผ่าน 370 · skip 5** (`Tests 370 passed | 5 skipped (375)`) · 42 = `find src -name '*.test.ts' -o -name '*.test.tsx' | wc -l`
- **5 ที่ skip = guard เบราว์เซอร์จริงทั้งหมด** (`*.visual.test.*` · `find src -name '*.visual.test.*'` = 5) · `ctx.skip()` นอก CI เพราะ Chromium/CSS ไม่พร้อม → **รันในเครื่องพิสูจน์ guard พวกนี้ไม่ได้ ต้องรอ CI** (ใน CI `process.env.CI` ตั้ง → guard throw ไม่ skip)

**Guard เบราว์เซอร์จริง (Playwright + Chromium · `visual-harness.ts` launch จริงเรนเดอร์ CSS จาก `dist/`):**
- `AppLayout.visual.test.tsx` — bottom nav ทุกช่อง ≥ 44×44px
- `AppLayout.theme.visual.test.tsx` — พื้น+อักษร shell อ่านออกจริงทั้ง light/dark (กันบั๊กพื้นขาว dark mode)
- `WovenHero.visual.test.ts` — ป้ายพับถูก "วาดจริง" ที่จุดกึ่งกลาง (กันบั๊กแถบเปล่า)
- `charts.visual.test.ts` — ยอดรวมกลางโดนัทอยู่ในวงทุกขนาดเลข + เคส mask
- `pwa-freshness.visual.test.ts` — client เปิดใหม่หลัง deploy รันบันเดิลใหม่ ไม่ใช่ shell ที่ precache (กันบันเดิลค้าง)

**Cloudflare Worker (`src/worker/`):** `index.ts` = fetch เดียว หุ้มทุก response ด้วย security headers · route `/api/*` เท่านั้นที่ dynamic (`POST /api/ai`→`handleAi`) ที่เหลือ fallback `env.ASSETS.fetch` · `ai.ts` = **AI proxy ยังเป็น stub** (non-POST→405 · ไม่มี key→503 · TODO→501 · เก็บ key ฝั่ง server อย่างเดียว) · `security.ts` = **HTTP response security headers เท่านั้น** (CSP `default-src 'self'`, `frame-ancestors 'none'`, allowlist `*.supabase.co` + fonts · `X-Frame-Options DENY` · HSTS 180 วัน · ไม่มี CORS/auth/rate-limit ใน worker) · `wrangler.jsonc`: `run_worker_first: true` (worker + CSP รันทุก request), `not_found_handling: single-page-application`, `observability: true` · **ไม่มี routes/vars/binding อื่น** · `ANTHROPIC_API_KEY` เป็น runtime secret

**Version stamp + PWA:** `vite.config.ts` `define` `__COMMIT_SHA__` (จาก `WORKERS_CI_COMMIT_SHA`→`CF_PAGES_COMMIT_SHA`→`GITHUB_SHA`→`VITE_COMMIT_SHA`→git→`'dev'`) + `__BUILD_TIME__` แสดงท้าย `SettingsPage` แตะแล้วคัดลอก — **อ่านก่อนไล่บั๊กหน้าจอ** · PWA: `registerType:'prompt'` · `index.html` ไม่อยู่ใน `globPatterns` + `navigateFallback:undefined` → navigation เสิร์ฟผ่าน **NetworkFirst** (`app-shell`, `networkTimeoutSeconds:3`) · `skipWaiting`+`clientsClaim`+`cleanupOutdatedCaches` ให้ SW ใหม่ทำงานทันทีโดย**ไม่ reload**

**ทำเสร็จแล้ว (มีในโค้ดจริง):** ระบบขายครบวงจร · บัญชีร้าน 2 ถัง + การ์ดกำไรร้าน (`ShopProfitCard`) · หมวดร้าน + ป๊อปอัพค่าส่งขาเข้า · SKU prefix-only แก้ได้ · ทุนจม/วันในคลัง · ยอดค้างครบวงจร (เพิ่มเพื่อน/บันทึก/ยืนยัน/เคลียร์/ย้อน) · ค้นหาประวัติจริง (RPC เดียว) · หน้าแรกเลื่อนดูเดือนย้อนหลัง · dark mode + guard · types generate จาก DB จริง (workflow) · error ที่ถึงผู้ใช้ · หน้ากู้รหัสผ่าน + recovery gate

**ยังไม่ได้ทำ / หนี้ที่รู้ตัว:**
- **คอมโพเนนต์แถบเลือกซ้ำสองตัว** — `src/components/SegmentedControl.tsx` (generic `role="tablist"` · ผู้เรียกเดียว = `ShopProfitCard`) กับ **ตัว inline ใน `CategoriesManager.tsx:68`** (`function SegmentedControl` · `role="radiogroup"` · เลือกบทบาทหมวด) ชื่อชนกันคนละ implementation · จาก T2/T5 อนุญาตไว้เองเพื่อไม่ให้ใบไหนต้องรอ · **ควรยุบ (คนละใบ)** · (นอกจากนี้มี pill/toggle inline อีกหลายจุดที่ไม่ได้ใช้ตัวกลาง เช่น rack/list toggle `StockPage.tsx:416`)
- **ค่าดำเนินร้านรวมยอดฝั่ง client ไม่ใช่ RPC** (`useShopOperating` · ตั้งใจไม่มี migration) + **guard เพดานแถว `SHOP_ROW_CAP=1000`** · **ถ้าชนเพดานจริงต้องย้ายไปเป็น RPC aggregate** (คอมเมนต์กำกับใน hook)
- **เกณฑ์ "ค้างนาน 60 วัน" (`AGE_OLD_MAX`) เป็นตัวเลขที่เดา** — คอมเมนต์ใน `StockPage.tsx:32-35` ยอมรับเองว่าเป็นค่าประมาณสำหรับเสื้อผ้ามือสอง ไม่ได้วัดจาก turnover จริง → **ควรทบทวนหลังใช้จริงสัก 3 เดือน**
- **ข้อความ error ในชุด RPC ยอดค้างยังใช้คำที่ห้ามขึ้นจอ (หนี้/เจ้าหนี้/ลูกหนี้)** — ตรวจรอบนี้: **ไม่มีใน`src/`เลย** (grep ว่าง) แต่ **ยังอยู่ใน `RAISE EXCEPTION` ของ RPC เวอร์ชันปัจจุบัน** (`0015` เช่น `'เจ้าหนี้และลูกหนี้ต้องเป็นคนละคน'`, `'ไม่พบรายการหนี้นี้'`, `'การเคลียร์หนี้'` · `0018` · `0019`) → ผู้ใช้เห็นได้จริงเพราะ `errors.ts` ส่งข้อความไทยผ่านตรง ๆ · **`0021` หัวไฟล์ประกาศเองว่าการกวาดคำนี้ "OUT OF SCOPE โดยตั้งใจ"** → migration เดี่ยว reproduce ทั้งชุดเปลี่ยน literal
- **`friend_code` + `generate_friend_code()` เลิกใช้แล้วแต่ยังอยู่** — ตรวจรอบนี้: `profiles.friend_code` ยังเป็นคอลัมน์ (`database.types.ts` · `not null`) · `0020` เลิกใช้เป็น lookup key (เปลี่ยนเป็น `username`) แต่ไม่ drop · ยัง seed อยู่เพื่อเติมคอลัมน์ NOT NULL · **ไม่มี code path ใน `src/` อ่าน** → ยังจริง
- **`src/lib/offlineQueue.ts` ไม่มีใครเรียก (dead code)** — ตรวจด้วย grep รอบนี้: string `offlineQueue` ไม่ปรากฏใน `src/` เลยนอกไฟล์ตัวเอง (ไม่มีแม้แต่ไฟล์เทสต์) · เป็น stub เผื่อ part 5 ที่ไม่เคยต่อ · (หมายเหตุ: `vite.config.ts` workbox comment + `README.md` ยังพูดถึง offline queue ราวกับใช้อยู่ = เอกสาร/คอมเมนต์ค้าง) → ทำต่อหรือลบ
- **ยังไม่มี ESLint** — `npm run lint` = `tsc -b` (ตรวจ `package.json` รอบนี้ · ยังจริง)
- **`transactions_search` ยังไม่มีหลักฐานว่าถูกรัน smoke test** ทั้งที่ UI เรียกบน production — smoke test อยู่ในหัวไฟล์ migration พร้อมรัน (ยังไม่ได้ตรวจว่ารันแล้ว)
- **หน้าประวัติยังไม่มี UI ตัวกรองเดือน** ต่อครบ (RPC รองรับแล้วตั้งแต่ `0023`/`0024`) · **หน้างบยังผูกเดือนปัจจุบัน** (`useBudgets(month)` รับเดือนได้แต่ `BudgetPage` ยังไม่ส่ง) — ยังไม่ได้ตรวจซ้ำรอบนี้ว่ายังจริง (ยกมาจากฉบับเดิม → **ต้องตรวจก่อนพึ่ง**)
- ยอดเงินคงเหลือรายกระเป๋า · ถังขยะ/สำรองข้อมูล · ฟีเจอร์ AI (โครงเปล่า — `prefs.ts` toggle + `worker/ai.ts` stub)

---

## 11. Redesign + ฟีเจอร์ — สถานะปัจจุบัน (ไม่ใช่แผน)

> **เคาะแล้ว:** ฮีโร่ = ป้ายทอสีเข้ม · สีแบรนด์ = คราม (indigo) · หน้าแรกตอบ "เหลือเงินเท่าไหร่" เป็นหลัก · redesign ครบสี่หน้าหลัก + หน้ารอง
> **แหล่งความจริงของสี:** `tailwind.config.ts` + `src/styles/index.css` (มีคอมเมนต์กำกับ locked/role) — **เอกสารนี้ไม่คัดลอกค่า hex**
> **เอกสารดีไซน์:** `docs/design/…` (design-spec + ui-reference + Screens)

### 11.1 ฮีโร่ — ป้ายทอคอเสื้อ (`src/components/WovenHero.tsx`)
**หลักการ: กิมมิกต้องเผย ไม่ใช่ซ่อน** — ของที่ดูทุกวันต้องเห็นทันทีไม่ต้องกด
- ป้ายทอ **3 ใบ ล็อกที่ 3 — ไม่มีใบยอดค้าง** · ลำดับ `SAFE TO SPEND` → `BUDGET` → `STOCK PROFIT` · ใบพับโชว์ eyebrow + ตัวเลขย่อ เรนเดอร์**ไม่มีเงื่อนไข**ทุกใบ
- **`flex flex-col` บนปุ่มป้ายเป็น load-bearing** — ห้ามถอด (บั๊กแถบเปล่า · §9)
- บรรทัดรอง SAFE หักบิลรอจ่าย (`computeSpendable`) · เกินยอด → ไอคอนเตือน ไม่ clamp
- **เดือนที่จบแล้ว** (prop `monthEnded`): SAFE eyebrow → `LEFT OVER` + บรรทัดรอง recap รับ/จ่าย แทน "ใช้ได้วันละ" (ที่กลายเป็นคำโกหกเมื่อเดือนปิด)
- เรขาคณิต (`CONTAINER_H`/`LABEL_H`/`POSITIONS`) มี guard `WovenHero.visual.test.ts` — **ค่าตัวเลขอ่านจากไฟล์ ไม่คัดลอกมาที่นี่**

### 11.2 สี — คราม + สีหมวดต่อ slot (`tailwind.config.ts` + `src/styles/index.css`)
- สีแบรนด์ = คราม · `brand.fabric*`/`thread` ขับ WovenHero (คอมเมนต์ในไฟล์เขียน "locked — do NOT change")
- `cat.1–6` + `cat.other` เป็น CSS variable (light ใน `:root` · dark override ใน `html.dark`) — **สีหมวดมาจาก `categories.color_index` ผ่าน `catColorVar()` ที่เดียว** · cat.1 = สีแบรนด์
- **mint ถูกนำกลับมา** (logo v2 = เปลือกตู้เซฟ mint หุ้ม dial คราม) — **กลับคำจาก PR-C ที่เคยตัด mint ออกเพื่อคราม** · คอมเมนต์ในไฟล์เตือน "do NOT fix back out" (design-spec §11.4-1) · ห้ามลบเป็น leftover
- `theme-color`/`manifest.theme_color` = สีพื้นแอปแยกตาม scheme (mirror `--color-surface` พร้อมคอมเมนต์) · hex ดิบใน `src/` เหลือแค่ gradient ตกแต่งใน `index.css` + boot splash ใน `index.html`

### 11.3 โดนัท (`src/components/charts.tsx`)
- ตัวเลขรวม **บรรทัดเดียว** อยู่คอร์ดกว้างสุด · `donutCenterFontSize(charCount)` = แหล่งเดียวที่ตัดสินขนาด — ห้ามย่อฟอนต์เงียบ · guard `charts.visual.test.ts` · `largestRemainderPercents()` legend % รวม 100 · สี slice จาก `color_index`

### 11.4 การตัดสินใจสำคัญ — ทำไม (หัวใจของไฟล์)
โค้ดบอก "ทำอะไร" เอกสารบอก "ทำไม" · ข้อที่**กลับคำ**จากที่เคยตัดสินสำคัญที่สุด — ไม่บันทึกไว้ อีกสามเดือนมีคนมองเป็นบั๊กแล้วแก้กลับ:

1. **สีแบรนด์ย้ายออกจากเขียว** เพราะในแอปการเงิน เขียวถูกจองด้วยความหมาย "เงินเข้า" — สีเดียวทำสองหน้าที่คือรากของบั๊ก
2. **สีหมวดปักหมุดต่อหมวด (`color_index`) ไม่เรียงตามยอด** — กลับคำ เพราะสีไปโผล่สองที่ (โดนัท + แถวรายการ) ถ้าเรียงตามยอดสีจะสลับทุกเดือนจำไม่ได้
3. **DB เก็บความหมาย client เก็บหน้าตา** — เปลี่ยนพาเลตต์ไม่ต้องแตะ DB · เดียวกับ schedule-date ที่ DB เป็นเจ้าของ (`recurring_next_date`)
4. **`icon` ไม่มี CHECK constraint** — `lib/icons.tsx` fallback เป็นไอคอนป้าย ชื่อผิดเสื่อมนุ่มนวล · ใส่ constraint = ต้องเขียน migration ทุกครั้งที่เพิ่มไอคอน
5. **โดนัท: ขยายรู ไม่ย่อตัวเลข** — ปฏิเสธทั้งย่อหน่วย (`฿1.23M`) และย้ายเลขออกจากรู
6. **หน้าแรกตอบ "เหลือเงินเท่าไหร่" งบเป็นป้ายใบสอง** — ห้ามเพิ่มพาดหัวที่สองที่ตอบคำถามเดียวกัน
7. **บิลรอจ่าย: หักเฉพาะรายจ่าย ไม่บวกรายรับ** — ไม่สมมาตรโดยตั้งใจ เพราะบวกรายรับที่ยังไม่เข้า = ชวนใช้เงินที่ยังไม่มี (ความผิดพลาดสองทางราคาไม่เท่ากัน)
8. **ห้าม clamp เป็น 0 เงียบ ๆ ทุกที่ที่แสดงเงิน** — เกิน/ติดลบ → บอกตรง ๆ + ไอคอน (`computeShopProfit` ก็ไม่ clamp กำไรติดลบ)
9. **texture + เงา = ข้อยกเว้นเฉพาะป้ายทอ มีได้ที่เดียวต่อหน้า** (flat เป็นค่าเริ่มต้น) · motion จาก token เท่านั้น + เคารพ `motion-reduce`
10. **เส้นประถูกใช้กับโซนวางรูปแล้ว** (drop zone) — ห้ามให้ความหมายที่สอง
11. **`hideBalance` = "ซ่อนตอนกวาดตา เปิดตอนตัดสินใจ"** — ปิดยอดในลิสต์/พาดหัวได้ · แต่ **ชีตที่ขอให้ผู้ใช้ยอมรับข้อผูกพัน (`ConfirmDebtSheet` · `SettleSheet` · และแผงขายใน `StockEditSheet`) ต้องแสดงจำนวนเงินเสมอ และไม่รับ prop `hideBalance` เลย** (กันเชิงโครงสร้าง — ยืนยันยอดที่ถูกปิด = ยอมรับแบบตาบอด)
12. **ยอดที่จดไว้เอง (private) ไม่รวมในพาดหัว และไม่รวมกับยอดที่ตกลงกันแล้ว (shared) ทุกที่** — `computeFriendLedger` แยก `agreedNet`/`privateNet` คนละถัง · หน้ารวมอ่าน `shared_net` เท่านั้น · net-within-friend แต่ gross-across-friends (ยอดข้ามเพื่อนไม่หักกลบ)
13. **ย้อนการเคลียร์ (`debt_settle_reverse`) ได้เฉพาะคนที่กดเคลียร์เอง** (`settled_by = auth.uid()`) — ถ้าอีกฝ่ายไม่เห็นด้วยว่าจ่ายแล้ว ต้องคุยกันนอกแอป · ปลอดภัยกว่าให้ใครก็ได้ย้อนรายการเงินของอีกฝ่าย
14. **ชื่อฟีเจอร์คือ "ยอดค้าง"** · คำที่ห้ามบนจอ: หนี้ · เจ้าหนี้ · ลูกหนี้ · เรียกเก็บ · ทวง · **ชื่อ schema/โค้ดยังเป็น `debt*` ตั้งใจ** (เปลี่ยนชื่อ schema = migration destructive ไม่คุ้ม) — จึงมี gap ระหว่าง "จ่ายคืนเพื่อน" บนจอ กับ `debt_repayment_expense` ใน DB (และคำ "หนี้" ที่ยังค้างใน RAISE ของ RPC · §10)

**— รอบฟีเจอร์หลัง redesign —**

15. **หน้าประวัติใช้ RPC ตัวเดียว ไม่ใช่สองตัว** (`transactions_search`) — window aggregate (`count(*) over ()`) ทำให้หน้ากับยอดรวมมาจาก query เดียว **ขัดกันไม่ได้เชิงโครงสร้าง** · window คำนวณ **หลัง where/join แต่ก่อน `LIMIT`** (โค้ดเดิมยิง query ที่สองดึงทุกแถวมานับ + คัดลอก predicate มาเอง คอมเมนต์มันเองยอมรับว่าเสี่ยง)
16. **"เติม cache" หลังบันทึก ไม่ใช่ optimistic update** (`txCache`) — `AddPage` `await` แถวจริงจากเซิร์ฟเวอร์ก่อน navigate อยู่แล้ว · `insertRecent` ต้อง **เรียงใหม่ ไม่ prepend** เพราะ AddPage ย้อนวันที่ได้
17. **effect ที่ seed ฟอร์มต้องผูกกับ `id` ไม่ใช่ object** — `refetchOnWindowFocus` เปิด → native picker ทำให้ blur→focus → refetch → object ใหม่ (อ้างอิงเปลี่ยนทั้งที่ค่าเท่าเดิม) → effect ทับสิ่งที่พิมพ์ค้าง
18. **undo การลบคืนแถวด้วย `id` + `created_at` ชุดเดิม** (`txRestore`) — `created_at` เดิม → กลับตำแหน่งเดิมใน "ล่าสุด" · `id` เดิม → กดเลิกทำซ้ำชน PK แทนได้แถวซ้ำเงียบ · guard "ห้ามคืนแถวล็อก" ใช้ `lockedRowInfo()` ที่เดียว
19. **"เดือน" คือ string `YYYY-MM` ไม่ใช่ Date** (`dates.ts`) — slot ลง queryKey/URL ตรง ๆ + เทียบ `<`/`>` ได้โดยไม่สร้าง Date (ซึ่งจะ parse เดือนเปล่าเป็น UTC แล้ว drift) · `addMonthsToKey` เลขคณิตล้วนบน year*12+month
20. **`computeHomeSummary` แยก `month` ออกจาก `now`** — เดิม `now` ทำสองหน้าที่ ("เดือนไหน" + "วันนี้") พอดูเดือนย้อนหลังต้องแยก · `daysLeftInMonthKey(key)` คืน 0 เมื่อเดือนจบแล้ว
21. **`useUpcomingBills` จงใจไม่รับเดือน** — "บิลที่ยังไม่ถูกตัด" ผูกกับตอนนี้ ไม่ใช่เดือนที่เลือกดู (ใช้ `monthBounds()` = ปัจจุบันเสมอ) · guard `MAX_OCCURRENCES_PER_RULE=40` throw แทนวนไม่จบ · เดือนที่จบแล้วซ่อนลิสต์ "ล่าสุด" (recent ไม่ผูกเดือน)
22. **`onTap` ของป้ายด่วนอยู่บน `click` ไม่ใช่ `pointerUp`** — Enter/Space ยิง `click` อย่างเดียว ย้ายไป `pointerUp` แล้วคีย์บอร์ดพังเงียบ · `moveTolerancePx` กันปัดเลื่อนใน `overflow-x-auto` กลายเป็นบันทึกเงิน · กดค้างบันทึกทันทีแล้ว**ไม่แตะฟอร์ม** ลงวันตาม `dateStr` ที่เลือก

**— รอบ SKU prefix-only (`0025`) —**

23. **ตัดท่อนแบรนด์ออกจาก SKU** (`STZ-GEN-0002` → `STZ-0002`) — แบรนด์ไทยแปลงเป็น code ละตินไม่ได้ ของส่วนใหญ่กองที่ท่อน `GEN` ที่ไม่ให้ข้อมูล · SKU เป็นแค่เลขอ้างอิงไม่ซ้ำ (แบรนด์อยู่ในฟิลด์ `brand` ของสินค้า ไม่หาย) · คอลัมน์ format ที่ไม่มีใครใช้ (`use_brand_code`/`brand_len`/`seq_digits`/`separator`) **drop ทิ้ง ไม่ปล่อยเป็นคอลัมน์ตาย** (ยังไม่มีข้อมูลจริง)
24. **ตัวนับ SKU ผูกกับ user ไม่ผูกกับ prefix** — ถ้าผูกกับ prefix การเปลี่ยน `STZ`→`ABC`→`STZ` จะทำเลขนับกลับมาชน (`STZ-0000` ซ้ำ) · ผูกกับ user แล้วเดินหน้าอย่างเดียวไม่ว่า prefix เปลี่ยนกี่รอบ → แก้ prefix ปลอดภัยและให้แก้ได้ตลอด (มีผลกับของใหม่เท่านั้น) · preview (`stock_sku_preview` STABLE) **ไม่จองเลข** เลขจริงออกตอนกดบันทึก → ถ้อยคำบนหน้ารับเข้าต้อง "โดยประมาณ"

**— รอบหมวดร้าน (`0026` · ถังที่ 2) —**

25. **ป้ายอยู่ที่หมวด แต่ธงคัดลอกลงตัวรายการ** (`is_shop_category` → trigger → `is_shop_operating`) — ผู้ใช้ตั้งครั้งเดียวที่หมวด แต่ predicate ทุกตัว (`isBudgetSpendingRow` + query SQL) ยังอ่านจากตัวรายการเหมือนธงอื่น (`is_stock_cogs`/`is_debt_settlement`) **ไม่ต้อง join หมวด** · ถ้าปล่อยให้อยู่บนหมวดอย่างเดียว ทุกจุดที่คิดเงินต้อง resolve หมวดเอง ลืมจุดไหน = ตัวเลขผิดเงียบ (รูปแบบบั๊กที่โปรเจกต์เจอซ้ำ) · **แลกกับ: เปลี่ยนป้ายแล้วตัวเลขเดือนเก่าขยับ** (trigger 2 `sync_shop_operating_on_category` ไล่อัปเดตแถวเก่า) — **ยอมรับโดยตั้งใจ** ทุกเดือนคิดด้วยกฎปัจจุบันเดียวกัน ไม่ snapshot ต่อแถวเหมือน `cost_at_sale` · `CategoriesManager` เตือนผู้ใช้เรื่องนี้
26. **`is_stock_category` ไม่อยู่ในสูตรงบเลย** — รายการซื้อเข้าถูกตัดด้วย `is_stock_purchase`/`is_stock_cogs` บนตัวรายการ (§5) · ป้ายสต็อกควบคุมแค่ว่าหมวดโผล่ในหน้ากรอกมือไหม (`isEntrySelectableCategory`) · **ต่างจาก `is_shop_category` ที่ตัดงบจริงและไล่รีไรต์รายการเก่า** — เพราะงั้นคำอธิบายใต้ตัวเลือก "ร้าน" ต้องบอกว่า "ตัวเลขเดือนก่อนจะขยับตาม"
27. **ปิดการกรอก `stock_sale_income` ด้วยมือ — กลับคำจาก §7 เดิม** (เดิมเปิดให้ขายนอกระบบ) เพราะรายรับก้อนนั้น**ไม่มี COGS คู่และไม่เข้า `stock_sales`** → พองรายรับขณะที่ STOCK PROFIT นิ่ง = "ขายได้แล้วทำไมกำไรร้านไม่ขึ้น" โดยไม่มีอะไรอธิบาย · **ไม่ลบหมวดจาก DB** (`stock_sale_create` ยังใช้) แค่ซ่อนจากตัวเลือก (`isEntrySelectableCategory` pure/เทสต์ได้) · สามไฟล์ (`Favorites`/`Recurring`/`TransactionEditSheet`) เดิมกรองแค่ `is_stock_category` → เพิ่มเฉพาะ `stock_sale_income` ไม่ขยาย scope
28. **ค่าดำเนินร้านห้ามเกลี่ยลงรายชิ้น** — ไม่มีคำตอบที่ถูกว่าค่าโฆษณา/ค่าส่งควรตกกับชิ้นไหน ฝืนเกลี่ย = กำไรรายชิ้นกลายเป็นตัวเลขแต่งขึ้น → **กำไรขั้นต้นดูรายชิ้น (ถังที่ 1) · กำไรสุทธิดูรายร้านรายเดือน (ถังที่ 2)**
29. **ป้ายหมวดเป็นตัวเลือกเดียว 3 แบบใน UI แต่ยังเป็น 2 คอลัมน์ใน DB** (`CategoriesManager` · role ทั่วไป/เข้าสต็อก/ร้าน) — `is_stock_category` กับ `is_shop_category` mutually exclusive อยู่แล้ว (CHECK) การรวมเป็นตัวเลือกเดียวใน UI สะท้อนความจริง **ไม่ต้องเขียน migration ทำลายของเดิม** · **ห้ามรวมสองคอลัมน์เป็นคอลัมน์เดียวใน DB — เป็นงาน UI ล้วน** · `useSetCategoryRole` เขียนสองคอลัมน์ครั้งเดียว (`ROLE_COLUMNS`) เพื่อไม่เกิด (true,true) แม้ชั่วขณะที่จะชน CHECK · **ปุ่มลบซ่อนเมื่อ `is_system`** (ไม่ใช่ disable) — หมวดระบบลบไม่ได้แน่ ผู้ใช้รู้ก่อนกด ต่างจากหมวดปกติที่มีรายการผูก (23503) ที่รู้ล่วงหน้าไม่ได้ ปุ่มเลยต้องอยู่

**— รอบสรุปกำไรร้าน (T2 · หน้าคลัง · ไม่มี migration) —**

30. **ค่าดำเนินร้านรวมฝั่ง client ไม่ทำ RPC** — ใบ T2 ตั้งใจไม่มี migration (merge รวดเดียว ไม่รอ types-drift) · แถวที่กรอง (`is_shop_operating=true`) เป็น subset เล็ก ไม่มี pagination · **กับดัก:** PostgREST cap หน้า → `.limit(SHOP_ROW_CAP=1000)` แล้วตั้ง `capped` เมื่อชน → การ์ดขึ้นคำเตือน (ห้ามแสดงยอดที่รู้ว่าไม่ครบเงียบ) · **ชนเพดานจริงเมื่อไรย้ายไป RPC aggregate** · **กำไรสุทธิย้อนหลังไม่นิ่งโดยตั้งใจ** (ธง `is_shop_operating` ถูกรีไรต์เมื่อเปลี่ยนป้าย ต่างจาก `stock_sales.profit` ที่ snapshot) → การ์ดเขียนบอก (`REVALUATION_NOTE` ใน `ShopProfitCard`) ไม่ใช่แค่ในตั้งค่า

**— รอบถามค่าส่งหลังปิดการขาย (T4 · ไม่มี migration) —**

31. **ป๊อปอัพหลังปิดการขายถามเฉพาะ "ค่าส่งที่เก็บจากลูกค้า" (ขาเข้า) ไม่ถามขาจ่าย** — ปัญหา: ขาย 2 ตัว (500+700) ค่าส่ง 100 → ลูกค้าโอน 1,300 แต่ระบบบันทึกแค่ 1,200 (ปิดการขายทีละตัว) อีก 100 หาย · **ทำไมไม่ถามขาจ่าย:** ค่าส่งขาจ่ายเกิดตอนเย็นรอบเดียว (ส่งหลายบิลจ่ายก้อนเดียว) ไม่ได้เกิดตอนขาย → ถามสองขาตอนขาย = รบกวนโดยไม่ตรงพฤติกรรม · ขาจ่ายกรอกเป็นรายจ่ายปกติในหมวดร้าน · **หมวดร้านไม่มี `system_key`** จึง resolve ด้วย `kind === 'income' && is_shop_category` (`lib/shopCategory.ts` pure) · เจอ 1 → preselect · เจอหลายตัว → ส่งแค่ `type:'income'` ให้เลือกเอง · เจอ 0 → ไม่แสดงป๊อปอัพ (กันปุ่มที่กดแล้วเจอหน้าว่าง) · **ห้าม match ชื่อไทยเด็ดขาด** · **ไม่ prefill ยอด** — ระบบไม่รู้ค่าส่งเท่าไร เดายอดแล้วกดผ่าน = ตัวเลขผิดที่ดูเหมือนถูก · `AddPage` รับ `returnTo` ผ่าน `isInternalPath` (กัน open redirect)

**— รอบตัดราคาเป้าหมาย + ทุนจม (`0027` · PR-T3) —**

32. **ตัดราคาขายเป้าหมายและกำไรคาดการณ์ทิ้ง — แทนด้วยทุนจม** — `target_price` คือราคาที่เจ้าของ "หวัง" ไม่ใช่ราคาที่ตลาดยอมจ่าย · เดิมคูณโชว์ "รอขาย +฿X ถ้าขายได้ตามราคาตั้ง" = **ตัวเลขที่ดูเหมือนเงินแต่ไม่ใช่เงิน** ทำให้รู้สึกรวยกว่าจริงตลอด — อันตรายกับคนขายมือสองที่มัก "กำไรดีแต่เงินสดหมด" · แทนด้วย **ทุนจม** = ต้นทุนจริงที่กองในของค้างเกิน `AGE_OLD_MAX` วัน (`computeSunkCost` reuse `isStale`) ตอบ "เงินหายไปกองตรงไหน / หยุดซื้อเข้าได้แล้ว" · ฿0 = ข่าวดี → โชว์ "ไม่มีของค้างนาน" · **ห้ามเอา `target_price`/กำไรคาดการณ์กลับมาไม่ว่ารูปแบบใด**
33. **ห้ามเติมค่าราคาขายล่วงหน้าในแผงขาย** (`StockEditSheet` · `0027`) — ช่องราคาเปิดมา**ว่างและ focus** ไม่เดาจาก `target_price` (ตัดแล้ว)/ต้นทุน/ราคาครั้งก่อน · ค่าที่เดาแล้วกดผ่านโดยไม่ดู = **ราคาขายผิดที่ไหลเข้ากำไรทันที** · หลักการเดียวกับ "ไม่ prefill ค่าส่ง" (§11.4-31) · แผงขายยังแสดงเงินเสมอ ไม่รับ `hideBalance` (§11.4-11)

### 11.5 บั๊กรอบก่อน — แก้แล้ว
B1–B14 (รอบ redesign · hero base = `isBudgetSpendingRow` ไม่ clamp · legend · หัวแถว/เส้นแบ่งวัน · `daysLeft` นับวันนี้ · หน้าคลัง · favorites `wallet_id`+`note` `0014` · contrast ไอคอน error · `WalletHero`→`WovenHero`) · รอบฟีเจอร์: ค้นหาแมตช์แค่ note · ยอดรวมประวัติยิง query ซ้ำ · dark-mode พื้นขาว · ป้าย "บันทึกแล้ว" โกหก — บันทึกไว้ที่ §9/§11.4 ตามชนิด

### 11.6 ยอดค้าง (friend outstanding balances) — ครบวงจร
**แนวคิด:** ติดตามยอดที่ค้างระหว่างเพื่อน แยกชัด **"ตกลงกันแล้ว" (shared)** กับ **"จดไว้เอง" (private)** ไม่รวมกันทุกที่ (§11.4-12) · ฟีเจอร์ cross-user ตัวเดียว → security model ต่าง (§3)

- **ตาราง (`0015`):** `profiles` (1/user: `display_name`, `username`, `friend_code` เลิกใช้) · `friend_connections` (`requester_id`/`addressee_id`/`status`=`pending|accepted`) · `debts` (`creditor_id`/`debtor_id`/`amount`/`visibility`=`private|shared`/`status`/`settled_by`/`settlement_transaction_id`/…) · `debt_events` (audit)
- **สถานะ (`debt_status`):** `pending_confirmation` → `confirmed` → `settled` · หรือ `rejected`/`cancelled`
- **Flow + RPC (ผ่าน `useFriends.ts`):**
  1. **เพิ่มเพื่อน** — `friend_request_send(p_username)` / `friend_request_respond` · ค้นด้วย **username** ไม่ใช่อีเมล (`AddFriendSheet`)
  2. **บันทึกยอด** — `debt_create` (`DebtFormSheet`) · shared = ค้าง `pending_confirmation` จนอีกฝ่าย `debt_confirm`/`debt_reject` (`ConfirmDebtSheet`) · private = `confirmed` ทันที เห็นฝ่ายเดียว · `debt_share_private` เปลี่ยน private→shared · `debt_delete_private` ลบ private · `debt_cancel` ยกเลิก shared
  3. **เคลียร์ยอด** — `debt_settle` (ใบเดียว) หรือ **`debt_settle_many`** (หลายใบ atomic ทรานแซกชันเดียว · `SettleSheet`) · client ไม่ลูปเอง
  4. **ย้อนการเคลียร์** — `debt_settle_reverse` เฉพาะคนที่กดเคลียร์ (§11.4-13)
- **เชื่อมกับเงินหลัก:** เคลียร์ยอดเป็น **single-party** — คนกด "เคลียร์แล้ว" เลือกกระเป๋าตัวเอง → ได้ **transaction จริง 1 แถว `is_debt_settlement=true`** (หมวด `debt_repayment_income`/`_expense` ตามทิศ) · `debts.settlement_transaction_id` ผูกกลับ · **อีกฝ่ายไม่ได้ transaction อัตโนมัติ** — มี nudge ให้เพิ่มเอง (ข้ามได้) · แถวนี้ "ล็อก" (§5) · นับใน headline ตัดจาก budget (§4)
- **สรุป (`debtsSummary.ts`):** `computeFriendLedger` แยก agreed/private/settled/pendingIn-Out/rejectedMine · `computeDebtsHeadline` อ่าน `friend_debts_summary.shared_net` ต่อคน (บวก=เขาค้างเรา / ลบ=เราค้างเขา)
- **หน้าจอ:** `/debts` (`DebtsPage` ภาพรวม) · `/debts/friend/:friendId` (`FriendHistoryPage` รายคน แยกบล็อก) · ชีต `AddFriendSheet`/`DebtFormSheet`/`ConfirmDebtSheet`/`SettleSheet`/`ProfileManager`
- **username (`0020`):** พิมพ์เล็ก `^[a-z0-9_]{3,20}$` (CHECK ใน DB + `USERNAME_RE` mirror · unique index) · **ตั้งครั้งเดียว** — trigger `profiles_username_setonce` บล็อกการแก้ค่าที่ไม่ null เมื่อ `auth.uid()` ไม่ null · **เจ้าของแก้ให้ได้ผ่าน SQL Editor** (ไม่มี JWT → `auth.uid()` null → ผ่าน guard · escape hatch ตั้งใจ) · `useSetUsername`/`useUpdateDisplayName` เขียน `profiles` ตรง

### 11.7 flow หลังปิดการขาย — ค่าส่งขาเข้า (PR-T4)
เหตุผล + resolve หมวด: §11.4-31 · `StockEditSheet.doSell` ปิดการขายสำเร็จ → ถ้า `hasShopIncomeCategory` แสดง `ConfirmDialog` "ลูกค้าจ่ายค่าส่งมาด้วยไหม?" (ไม่มีหมวดร้านฝั่งรายรับ → ปิด sheet ตามเดิม) · กด "บันทึกค่าส่ง" → `navigate('/add', { state: { prefill: {type:'income', categoryId?}, returnTo:'/stock' } })` · `AddPage` set categoryId ผ่าน effect ครั้งเดียวเฉพาะ id ที่ `isEntrySelectableCategory` · `returnTo` ใช้กับปุ่มย้อน + หลังบันทึก · เทสต์: `lib/shopCategory.test.ts` · `StockEditSheet.test.tsx` · `AddPage.render.test.tsx` + `AddPage.test.ts`

---

## 12. คำสั่งตรวจตัวเลขในไฟล์นี้ (ให้เจ้าของรันซ้ำได้)

ทุกตัวเลข/รายชื่อในเอกสารนี้มาจากคำสั่งเหล่านี้ รันบน main `5242f0a`:

| อ้างที่ | คำสั่ง | ผล |
|---|---|---|
| main sha (หัวไฟล์) | `git rev-parse --short HEAD` | `5242f0a` |
| migration ล่าสุด = 27 ใบ (§10) | `ls supabase/migrations/*.sql \| wc -l` | 27 (ถึง `0027_drop_target_price.sql`) |
| 14 ตาราง (§3) | นับ entry ใน block `public.Tables` ของ `database.types.ts` | 14 |
| 26 RPC (§6) | นับ entry ใน block `public.Functions` ของ `database.types.ts` | 26 |
| 8 enum | นับ block `public.Enums` | 8 (`category_kind`/`debt_status`/`debt_visibility`/`friend_status`/`item_condition`/`stock_status`/`transaction_type`/`wallet_type`) |
| 42 ไฟล์เทสต์ (§10) | `find src \( -name '*.test.ts' -o -name '*.test.tsx' \) \| wc -l` | 42 |
| visual guard = 5 (§10) | `find src -name '*.visual.test.*'` | 5 |
| 375 เคส (ผ่าน 370 · skip 5) (§10) | `npm test` | `Tests 370 passed \| 5 skipped (375)` · Test Files 42 passed |
| 13 หน้า / 14 route (§10) | `find src/pages -name '*Page.tsx' \| wc -l` · `router.tsx` | 13 หน้า + catch-all |
| offlineQueue dead (§10) | `grep -rn offlineQueue src \| grep -v lib/offlineQueue.ts` | ว่าง (ไม่มีใครเรียก) |
| คำ "หนี้" ใน src / migrations (§10) | `grep -rln 'หนี้' src` · `... supabase/migrations` | src ว่าง · migrations เจอใน `RAISE` ของ `0015`/`0018`/`0019` |
| build/test เขียว | `npm run build` · `npm test` | ต้องเขียวก่อน merge (CI = คำสั่งเดียวกัน) |

> **ยังไม่ได้ตรวจในรอบนี้ (บันทึกตรง ๆ):**
> - **schema จริงบน DB** — AI ต่อ DB ไม่ได้ · แหล่งความจริงที่ใช้คือ `database.types.ts` (generate จาก DB จริงผ่าน workflow) ไม่ใช่การ query สด
> - **`transactions_search` smoke test** ถูกรันจริงหรือยัง (มี 10 เคสในหัวไฟล์ `0022` · ยังไม่มีหลักฐาน)
> - **หน้าประวัติ/หน้างบต่อ UI ตัวกรองเดือนครบหรือยัง** — ยกจากฉบับเดิม ยังไม่ได้ verify ซ้ำรอบนี้
> - **production URL ที่แน่นอน** — ไม่ pin ในไฟล์ repo
> - เนื้อหาระดับ implementation ของทุก component ไม่ได้อ่านครบทุกบรรทัด (สำรวจแบบ file-grounded ผ่านการอ่าน router/หน้า/คอมโพเนนต์หลัก) — จุดที่คิดเงิน/ตัดสินใจอ่านตรงจากไฟล์แล้ว
