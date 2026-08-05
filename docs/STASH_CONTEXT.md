# STASH — Project Context

> บริบทถาวรของโปรเจกต์ ใช้แทนการอ่าน `docs/PROJECT_AUDIT.md` ฉบับเต็มในงานประจำวัน
>
> **ประกอบใหม่ทั้งฉบับ ไม่ใช่แพตช์ทีละจุด** — การแพตช์ทีละบรรทัดคือกลไกที่ทำให้เอกสารคลาดจากของจริงมาทุกรอบ (เคยค้างที่ migration `0021` ทั้งที่ถึง `0024` แล้ว · เคยค้างที่ 254 เทสต์ ทั้งที่ 300+ · เคยเขียนว่าฟีเจอร์ AI เป็น "โครงเปล่า `worker/ai.ts` stub" ทั้งที่ AI ใช้งานได้ครบวงจรแล้ว · **รอบล่าสุด: เอกสารค้างที่ "ลิสต์ tool ไม่ครบ (นับ 6 ทั้งที่มี 9) / แชท single-turn / v1 ตัดยอดค้างออกจากมือ AI" ทั้งที่ของจริงคือ 9 เครื่องมือ + multi-turn + มีเครื่องมือยอดค้างแล้ว**) — ทุกประโยคในไฟล์นี้มาจากการอ่านไฟล์จริงในรอบนี้ ไม่ได้คัดลอกจากฉบับเดิม
> **กติกาการใช้:** ทุกข้อความควรชี้กลับไปที่ไฟล์จริงได้ จุดไหนยังไม่ได้ตรวจจะเขียนว่า "ยังไม่ได้ตรวจ" ตรง ๆ ไม่เดา · **ค่าสี hex · เลขเรขาคณิตของฮีโร่ · ชื่อรุ่นโมเดล + ค่าเพดานของ AI ไม่คัดลอกมาไว้ที่นี่** — อ่านจากไฟล์แหล่งความจริง (เอกสารชี้ไปที่แหล่งความจริง ไม่กลายเป็นแหล่งที่สอง)
> **ตัวเลขทุกตัวนับใหม่ในรอบนี้** จากคำสั่งที่รันจริง (ดู §12 ท้ายไฟล์)
> **ตรวจล่าสุดเทียบ repo จริง:** main `9e96817` — **ฟีเจอร์ผู้ช่วย AI เดินหน้าต่ออีกหลายใบหลังรอบก่อน** (multi-turn `AI-A` · ยกโมเดลเป็น sonnet `AI-C` · การนำเสนอคำตอบ `AI-B` · tool ใหม่ `budget_status`/`upcoming_bills`/`debts_summary` · `period='all'` · ทางเข้า `/ai?q=` + ปุ่มถามในหน้างบ/สต็อก · ปุ่มลัดในคำตอบไปหน้าประวัติ) · migration ล่าสุด **`0030`** (ไม่ขยับรอบนี้ — ใบนี้ไม่มี migration)
> **ชั้น DB นิ่งรอบนี้:** ล่าสุดยังเป็น `0029` (`ai_settings` — consent) + `0030` (`stock_intake_list` — RPC อ่านอย่างเดียวให้ AI) · ที่ขยับหลังจากนั้นทั้งหมดเป็น **worker (`src/worker/`) + lib/ + client** (§12)

---

## 1. โปรเจกต์นี้คืออะไร

PWA บันทึกรายรับ-รายจ่ายส่วนตัว ที่มี **กึ่งระบบสต็อกสินค้า** (เสื้อผ้า/ของมือสอง ขายต่อ) + ระบบ **ยอดค้างกับเพื่อน** + **กระเป๋าเงินหลายใบ** + **ผู้ช่วย AI ตอบคำถามการเงิน** รวมอยู่ในแอปเดียว (`package.json` description · `router.tsx`)

- **ผู้ใช้:** เจ้าของ + เพื่อนไม่กี่คน · **ต่างคนต่างขายของตัวเอง ไม่แชร์คลัง** · "ยอดค้าง" เป็นฟีเจอร์ cross-user ตัวเดียวในแอป
- **ภาษา:** ไทย (`index.html` `lang="th"`) · **สกุลเงิน:** THB (`lib/format.ts` `Intl.NumberFormat('th-TH')`) · **เขตเวลา:** Asia/Bangkok
- **เขตเวลาเป็นข้อจำกัดทั้งแอป:** ทั้ง client (`lib/dates.ts` `APP_TZ='Asia/Bangkok'`) และ DB (`0010`: `(now() at time zone 'Asia/Bangkok')::date`) เคาะ "วันนี้/เดือนนี้" เป็นเวลาไทยเสมอ ไม่ใช่ timezone ของเครื่อง — **RPC `stock_intake_list` (`0030`) ก็เทียบ `created_at at time zone 'Asia/Bangkok'` ก่อนกรองเดือน** ตามกฎเดียวกัน (ชุดข้อมูลทดสอบมีเคส "ของรับเข้า 00:30 เวลาไทย ต้องนับเป็นเดือนนี้" ตรวจกฎนี้ · §11.10)
- **ไม่มีหน้าสมัครสมาชิก** — เจ้าของสร้างบัญชีให้ใน Supabase dashboard · มีเฉพาะเข้าสู่ระบบ + กู้รหัสผ่าน (`/login`, `/forgot-password`, `/reset-password`)
- **Deploy:** Cloudflare Workers (static assets + `/api/*` dynamic) — worker ชื่อ `stash-web` (`wrangler.jsonc`) · **production URL ที่แน่นอนไม่ได้ pin ในไฟล์ repo** → ยังไม่ได้ตรวจ

---

## 2. Stack + ข้อจำกัดสภาพแวดล้อม

Vite 6 · React 18 · TypeScript · Tailwind 3 · Supabase (Postgres + Auth อีเมล/รหัส + Storage) · TanStack Query 5 · react-router-dom 6 · `vite-plugin-pwa` · Cloudflare Workers · Vitest 2 (รวม guard เบราว์เซอร์จริงด้วย `playwright-core` + Chromium) (จาก `package.json`)

**สคริปต์จริง (`package.json`):** `dev` · `build`=`tsc -b && vite build` · `preview` · `test`=`vitest run` · `test:watch` · **`lint`=`tsc -b`** · `typecheck`=`tsc -b` · `cf:dev`=`wrangler dev` · `cf:typegen`=`wrangler types` · `deploy`=`npm run build && wrangler deploy`
> **ยังไม่มี ESLint** — `npm run lint` เป็นแค่ `tsc -b` (ตรวจ `package.json` รอบนี้ · ไม่มี dependency/สคริปต์ eslint · ยังจริง)

**tsconfig เป็น solution-style 3 project (`tsconfig.json` references):**
- `tsconfig.app.json` — client (`src/` ทั้งหมด) · มี `baseUrl:'.'` + `paths` (`@/…`) · **`exclude: ["src/worker"]`**
- `tsconfig.worker.json` — `include: ["src/worker"]` · `types: ["@cloudflare/workers-types"]` · **ไม่มี `paths`/`baseUrl`** → worker ต้อง import แบบ relative เท่านั้น (§8 · §9)
- `tsconfig.node.json` — config เครื่องมือ (vite/vitest)
- `tsc -b` build ทั้ง 3 → นี่คือคำสั่งเดียวกับที่ CI + Cloudflare รัน

**ข้อจำกัดที่กำหนดวิธีทำงานทั้งหมด:**

- เจ้าของทำงาน**ออนไลน์ล้วน ไม่มีเครื่อง dev** — รันคำสั่ง local เองไม่ได้ (AI agent รันให้)
- **Migration เป็น raw SQL รันมือใน Supabase SQL Editor** — ไม่มี Supabase CLI/migration runner (`schema_migrations` เป็นตารางที่ migration แต่ละไฟล์ insert เอง · `0029`/`0030` insert version `'0029'`/`'0030'`)
- **AI agent ต่อ DB ไม่ได้** — ส่ง SQL ให้เจ้าของรันแล้วรายงานกลับ · **แหล่งความจริงของ schema ที่ agent อ่านได้คือ `src/lib/database.types.ts`** (generate จาก DB จริง) ไม่ใช่การ query
- **`database.types.ts` regenerate ผ่าน workflow `types-drift`** (ดู §2.1) — ไม่ paste มือ
- **Deploy อัตโนมัติผ่าน Cloudflare Workers Git integration** — **ห้ามเพิ่ม deploy workflow ใน GitHub Actions** จะกลายเป็นสองทางเดินชนกัน (`vite.config.ts` อ่าน `WORKERS_CI_COMMIT_SHA`) · **`build` job ของ `ci.yml` คือด่านที่ต้องเขียวก่อน merge · Cloudflare Workers Builds เป็นคนละทางเดิน ไม่นับ**
- **`tsc -b` เขียว ≠ deploy ได้** — worker bundle ด้วย esbuild ของ wrangler (ไม่ใช่ Vite ไม่ใช่ tsc) → **พิสูจน์ worker ด้วย `wrangler deploy --dry-run`** (§9 · บทเรียนรอบก่อน)
- **merged ≠ deployed ≠ สิ่งที่เบราว์เซอร์รันอยู่** — ก่อนไล่บั๊กหน้าจอทุกครั้ง อ่าน version stamp ท้ายหน้าตั้งค่าก่อน (§9 · §10)
- **`refetchOnWindowFocus: true`** (`src/App.tsx`) — PWA ที่ค้าง background กลับมาต้องเห็นตัวเลขสด · **ผลข้างเคียง:** effect ที่ seed ฟอร์มจากผลของ query **ต้องผูกกับ `id` ไม่ใช่ object** ไม่งั้น window blur→focus (native date/file picker) จะ refetch → object ใหม่ → effect ทับสิ่งที่ผู้ใช้พิมพ์ค้าง (§11.4-17)
- **ตัวแปร runtime ฝั่ง Cloudflare ที่ฟีเจอร์ AI ต้องใช้** (จาก `src/worker/index.ts` `Env` · ตั้งใน dashboard/`wrangler secret`, **ไม่อยู่ใน `wrangler.jsonc`, ห้ามขึ้นต้น `VITE_`**): `SUPABASE_URL` · `SUPABASE_ANON_KEY` (ใช้ verify JWT + query ใต้ RLS) · `ANTHROPIC_API_KEY` (server secret ล้วน) · KV binding `AI_RATE_LIMIT` (อยู่ใน `wrangler.jsonc`) · **model id + ค่าเพดานฝั่ง AI ตั้งใน dashboard เช่นกัน (`ANTHROPIC_MODEL`/`AI_*`) — อ่านชื่อ/ค่าจริงจาก `src/worker/anthropic.ts`**

### 2.1 GitHub workflows (`.github/workflows/` — 2 ไฟล์)

| ไฟล์ | trigger | ทำอะไร | secret |
|---|---|---|---|
| `ci.yml` | push→`main` + ทุก PR | Node 22 · `npm ci` → `npm run build` → `npx playwright-core install --with-deps chromium` → `npm test` (`vitest run`) · **ไม่ deploy** · ขั้น chromium มีเพื่อให้ guard เบราว์เซอร์จริงรันได้จริงใน CI (ไม่ skip) | **ไม่ใช้ secret** — เทสต์ใช้ dummy Supabase env จาก `vitest.config.ts` |
| `types-drift.yml` | cron รายวัน + `workflow_dispatch` | `supabase gen types` เทียบกับ `database.types.ts` · ต่างเมื่อไร → เปิด/อัปเดต PR branch เดียว `automation/database-types-drift` (label `types-drift`) · เหมือน → เงียบ · **ไม่แตะ `main` ตรง ๆ** | `SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_ID` · optional `GH_PAT` |

> **ทำไมต้องมี `types-drift`:** เจ้าของไม่มีเครื่อง dev → regen จาก dashboard แล้ว paste มือทุกครั้ง · พลาดเมื่อไรฐานข้อมูลกับ repo แยกกันเงียบ ๆ (เกิดจริงกับ `0015`) · workflow นี้ปิดช่องนั้น (หัวไฟล์ `types-drift.yml`)
> **ลำดับที่ถูกเมื่อ migration เปลี่ยน signature ของ RPC ที่ client เรียก:** ห้าม merge PR `types-drift` เดี่ยว — types ใหม่ไม่ตรง call site → `tsc` ล้ม → main แดง · ดึงไฟล์เข้า branch ฟีเจอร์แล้ว merge ทีเดียวพร้อม call site (`0020` พลาดข้อนี้ · §9)
> **ข้อยกเว้น:** ถ้า migration ใหม่ **ยังไม่มี call site ฝั่ง client** types-drift merge เดี่ยวได้ปลอดภัย — แต่ถ้าการเพิ่มคอลัมน์ทำให้ **fixture/โค้ดเดิมพัง** ต้องดึง types เข้า branch แล้ว merge พร้อมการแก้ทีเดียว (types + fixture ต้องลง atomic)
> **หนี้ที่รู้ตัว (§10):** PR ของ `types-drift` เปิดด้วย `${{ secrets.GH_PAT || secrets.GITHUB_TOKEN }}` (`types-drift.yml` บรรทัด 114 · ตรวจซ้ำรอบนี้ยังอยู่) · **ถ้า `GH_PAT` ไม่ได้ตั้ง จะ fallback เป็น `GITHUB_TOKEN` ซึ่ง trigger `ci.yml` ต่อไม่ได้** (หัวไฟล์เขียนเอง: "default GITHUB_TOKEN can't trigger ci.yml") — **`GH_PAT` ยังไม่ตั้ง = ช่องนี้ยังเปิดอยู่** (บันทึกใน §10)

---

## 3. โครงสร้างชั้นข้อมูล

```
DB (tables + RPC + trigger)  →  lib/ (pure function)  →  hooks/ (TanStack Query)  →  UI (pages/ + components/)
                                    ↑
              worker/ (Cloudflare) เรียก RPC + import pure function ของ lib/ ตรง ๆ (ไม่ผ่าน hooks/React)
```

ตรรกะที่แตะเงินอยู่ใน **SQL** หรือใน **pure function ของ `lib/`** เท่านั้น **ห้าม inline ใน component** · `lib/` เดินทางเดียว **ห้าม import จาก `hooks/`/`pages/`** — รับ "รูปร่างขั้นต่ำ" structural แทน (มีคอมเมนต์กำกับที่หัวไฟล์ · convention 11/12)
> **`lib/` มีผู้บริโภคที่ไม่ใช่ React: `src/worker/`** — ฟังก์ชันคิดเงิน/วัน/สถานะถูกย้ายเข้ามาที่ `lib/` เพื่อให้ worker import ได้ (คอมเมนต์หัวไฟล์เขียนเอง: "Lives in `lib/` … so a non-React caller — the AI worker — can import it too") · **ไฟล์ที่ worker import จริงรอบนี้ (ยืนยันด้วย grep `../lib/` ใน `src/worker` · §12):** `dates` · `format` · `ledger` · `homeSummary` · `stockAge` · `debtsSummary` · **`budgetPace`** · **`upcomingBills`** · **`aiLimits`** · `aiChat` (type-only `ChatTurn`) + `database.types` (type-only) — **ทุกตัว import แบบ relative (`../lib/…`) เท่านั้น ห้าม `@/`** (§8-24 · §9)

**ไฟล์ `lib/` ที่ต้องรู้จัก (จากการอ่านจริงรอบนี้):**

| ไฟล์ | หน้าที่ |
|---|---|
| `src/lib/database.types.ts` | **generated — ห้ามแก้มือ** · แหล่งความจริงของ schema ที่ agent อ่านได้ |
| `src/lib/db.ts` | type alias ระดับแอป derive จาก generated · มี `WalletBalance` · `WalletTransfer` · `AiSettings` = `Tables<'ai_settings'>` (`0029`) |
| `src/lib/ledger.ts` | predicate กลางจำแนกแถว: `isSpendingRow`/`isBudgetSpendingRow`/`isIncomeRow` (ตัด `is_stock_cogs`/`is_debt_settlement`/`is_shop_operating`) + `lockedRowInfo()` (§5) · **worker `month_spending`/`budget_status`/`home_summary` tool พึ่ง predicate พวกนี้ผ่าน RPC/`computeHomeSummary`/`isBudgetSpendingRow` ตรง ๆ** · กระเป๋าเงิน (§4-14) ไม่ใช้ predicate พวกนี้ — ใช้ `type` ดิบ |
| `src/lib/homeSummary.ts` | `computeHomeSummary(rows, cats, month, now)` — aggregate หน้าแรกทั้งหมด (income/expense headline/budgetSpending/safeToSpend/daysLeft/dailyAllowance/donut) · **worker `home_summary` tool เรียกตัวนี้ตรง ๆ** · รับ `HomeSummaryRow` structural |
| `src/lib/stockAge.ts` | `AGE_FRESH_MAX=30`/`AGE_OLD_MAX=60` (เกณฑ์อายุที่เดียว) · `inStock`/`isStale`/`computeSunkCost`/`daysSince` · **คอมเมนต์ยอมรับเองว่า `AGE_OLD_MAX` เป็นค่าเดา** · **worker `stale_stock` tool เรียกตัวนี้** (ห้าม hardcode 60 ซ้ำ) |
| `src/lib/budgetPace.ts` | **worker import ได้ (relative)** · `computePace(used, budget, now)` + **`computePaceStatic(used, budget)`** — ตัดสินสถานะงบต่อหมวด (`over`/`fast`/`unused`/`on_track`) ที่เดียว (ถ้อยคำอยู่ `budgetNote.paceNote` แยกกัน) · **`fast` ต้องใช้วันที่ → เดือนที่ปิดแล้วต้องใช้ `computePaceStatic` (ไม่มี `fast`)** ไม่งั้นเดือนเก่าโดนตัดสินเทียบเดือนปัจจุบัน = ป้ายผิด (§9) · **worker `budget_status` + `BudgetPage.tsx` แยก current↔closed แบบเดียวกัน** |
| `src/lib/upcomingBills.ts` | **worker import ได้ (relative)** · `collectMonthOccurrences(from, bounds, nextDate, cap)` + `MAX_OCCURRENCES_PER_RULE=40` — ไล่รอบบิล recurring ที่ตกในเดือนนี้ · **`nextDate` เป็น callback (เลขวันเป็นของ DB `recurring_next_date`) → ย้ายเข้า lib/ ได้โดยไม่ลาก supabase client** · **worker `upcoming_bills` tool + `useUpcomingBills` hook เรียกตัวเดียวกัน** |
| `src/lib/aiLimits.ts` | **worker import ได้ (relative) · import อะไรไม่ได้เลย (ต้อง dependency-free)** · `AI_MAX_QUESTION_CHARS` — เพดานความยาวคำถามที่เดียว · **worker (`ai.ts`) เป็นด่านบังคับ (400 เมื่อยาวเกิน) · client (`AiPage`) ตัด `/ai?q=` ให้พอดีก่อนส่ง** — ค่าเดียวสองฝั่งไม่คลาด (§11.9) |
| `src/lib/budgetable.ts` | `isBudgetableCategory()` — ตั้งงบได้เฉพาะ `kind==='expense' && !is_system && !is_shop_category && !is_stock_category` · **คอมเมนต์ยังอ้างชื่อหมวด "จ่ายชำระหนี้" (ชื่อ seed ปัจจุบัน "จ่ายคืนเพื่อน" ตั้งแต่ `0017`) — คอมเมนต์ค้าง จดไว้ ไม่แก้ (§10)** |
| `src/lib/budgetNote.ts` | ถ้อยคำบรรทัดรองหน้างบที่เดียว · รับ `money` ฉีดเข้ามาเพื่อ mask ตาม `hideBalance` |
| `src/lib/shopAccount.ts` | `computeShopProfit()` — สูตร P&L ร้าน (ถังที่ 1 − ถังที่ 2) ที่เดียว (§4) |
| `src/lib/shopCategory.ts` | resolve หมวดร้านฝั่งรายรับด้วย `kind + is_shop_category` (ไม่มี `system_key`) |
| `src/lib/spendable.ts` | `computeSpendable(safe, bills, daysLeft)` — บรรทัดรอง SAFE · ไม่ clamp เงียบ |
| `src/lib/debtsSummary.ts` | `computeDebtsHeadline` (อ่าน `shared_net`) + `computeFriendLedger` (แยก agreed/private) (§11.6) · **worker `debts_summary` tool เรียก `computeDebtsHeadline` ตัวเดียวกัน** (§11.9) |
| `src/lib/format.ts` | `formatBaht`/`formatBaht2`/`MASKED_BAHT`/`formatDueDate`/`formatMonthLong`/`sanitizeMoneyInput()` · **worker เรียก `formatMonthLong` ทำป้ายเดือนพุทธศักราชให้โมเดล** (ไม่ประกอบชื่อเดือนเอง) |
| `src/lib/aiChat.ts` | ฝั่ง client ของ `POST /api/ai` · `askAssistant(question, token, history)` คืน reply · **ประกาศ type `ChatTurn` ที่นี่ (client tsconfig) แล้ว worker import type-only ผ่าน relative** (`worker/history.ts` → `../lib/aiChat`) เพื่อไม่ลากโค้ด client เข้า bundle · โยน `AiHttpError{status, message}` → map ตาม **HTTP status ไม่ใช่ substring** (§11.9) |
| `src/lib/prefs.ts` | localStorage ทั้งหมด (`stash.*`) · `hideBalance`/`stockView`/`homeMoments` · **ประวัติแชท `stash.ai.chat` (เพดาน `CHAT_HISTORY_MAX` · ทนข้อมูลเสีย)** · **`AiPrefs.autoCategory`** ยังอ่านอยู่ (consent ย้ายไปเซิร์ฟเวอร์แล้ว — ไม่เก็บฝั่ง client) |
| `src/lib/sku.ts` | normalize/validate **prefix** เท่านั้น (`^[A-Z0-9]{3}$`) — สูตรอยู่ที่ RPC `stock_sku_build` |
| `src/lib/username.ts` | กติกา username (`^[a-z0-9_]{3,20}$`) mirror CHECK ใน DB (`0020`) |
| `src/lib/dates.ts` | helper วันที่/เดือนกลาง (Asia/Bangkok) · **"เดือน" = string `YYYY-MM`** · `monthKey`/`addMonthsToKey`/`monthBoundsFromKey`/`monthBounds`/`monthAnchorFromKey`/`allTimeBounds`/`daysSince` — **worker `tools.ts` เรียกชุดนี้แปลง offset→เดือน และหาช่วง `period='all'`** |
| `src/lib/catColor.ts` | `catColorVar(index)` — slot 1–6 → CSS var **ที่เดียวที่แปลง index→สี** (ไม่มี hex) |
| `src/lib/percent.ts` | `largestRemainderPercents()` — % รวม 100 พอดี (Hamilton) |
| `src/lib/errors.ts` | `translateError()` → ข้อความไทยที่เดียว · จับด้วย `code`/`status` ไม่จับ substring · **ข้อความที่มีอักษรไทยอยู่แล้วส่งผ่านตรง ๆ** — นี่คือเหตุผลที่ทั้ง RAISE ภาษาไทยใน RPC และข้อความไทยจาก worker AI ถึงผู้ใช้ตรง ๆ (§10 · §11.9) |
| `src/lib/txCache.ts` / `txRestore.ts` | เติมแถวที่เพิ่ง insert ลง cache / payload คืนแถวที่ลบ · pure · structural |
| `src/lib/useDialogA11y.ts` | โฟกัส/คีย์บอร์ดชีตกลาง · `onClose` ขี่ ref ไม่เป็น dependency ของ effect (กันบั๊ก caret หลุด · §9) |
| `src/lib/visual-contrast.ts` | helper วัด contrast ที่ compute จริงในเบราว์เซอร์ (ใช้โดย visual guard) |

> **หมายเหตุ:** `find src/lib -type f` รอบนี้ = 52 ไฟล์ (รวม `*.test.*`) · ตารางบนลิสต์เฉพาะไฟล์ที่ "ต้องรู้จัก" ไม่ครบทุกไฟล์ (เช่น `auth`/`storage`/`supabase`/`theme`/`icons`/`categoryFilter`/`entryHints` ไม่ได้ลิสต์ — ไม่อยู่ในเส้นทางที่ AI แตะ)

**`src/worker/` (Cloudflare Worker · typecheck ด้วย `tsconfig.worker.json` · bundle ด้วย esbuild ของ wrangler):** ดูรายละเอียดเต็มใน §11.9 · **9 ไฟล์รันไทม์ + 4 ไฟล์เทสต์** (`ai.test.ts`/`tools.test.ts`/`categories.test.ts`/`history.test.ts`)

| ไฟล์ | หน้าที่ |
|---|---|
| `index.ts` | fetch เดียว · `/api/ai` → `handleAi`, `/api/*` อื่น → 404 JSON, ที่เหลือ → `env.ASSETS` · หุ้มทุก response ด้วย `withSecurityHeaders` · ประกาศ `Env` (ASSETS/ANTHROPIC_API_KEY/SUPABASE_URL/SUPABASE_ANON_KEY/AI_RATE_LIMIT) |
| `ai.ts` | `handleAi` — ด่าน 4 ชั้นตามลำดับ **verify token → consent → rate limit → Anthropic** (ห้ามสลับ) · อ่าน body `{message, history}` (parse+sanitize ก่อนถึง rate limit) · เพดานความยาวคำถามใช้ `AI_MAX_QUESTION_CHARS` จาก `../lib/aiLimits` · ตัวตนจาก token เท่านั้น · anon key + RLS · ไม่มี service_role |
| `anthropic.ts` | เรียก Anthropic Messages API + tool loop · **ที่เดียวที่ใช้ `ANTHROPIC_API_KEY`** · SYSTEM_PROMPT + **model id (ย้ายเป็น sonnet) + เพดานค่าใช้จ่าย (ต่อ call/ต่อ request/ประวัติ) — ค่าตัวเลข+ชื่อรุ่นอยู่ในไฟล์นี้ ไม่คัดลอกมาที่นี่** (§11.9) |
| `tools.ts` | **9 tool อ่านอย่างเดียว (`AI_TOOLS`)** + `runTool` เรียก RPC/lib ใต้ JWT ผู้ใช้ · โมเดลส่ง `offset` (ไม่ใช่วันที่) + `period` (`month`/`all`) · deep link (`link` → `/history…`) เฉพาะ `month_spending` (§11.9) |
| `history.ts` | **ใหม่ (multi-turn `AI-A`)** · `parseHistory` (ALLOWLIST เฉพาะ `{role,text}` · ปฏิเสธ `tool_use`/`tool_result` ที่ client ปลอมได้) + `sanitizeHistory` (บังคับสลับ role/ตัดหัวเก่า/บังคับเพดาน turns+chars) · pure ล้วน ไม่มี I/O · `HistoryTurn = ChatTurn` (จาก `../lib/aiChat`) |
| `categories.ts` | `resolveCategory` — แปลชื่อหมวดไทย→id ใต้ RLS · **สองชั้น (exact แล้วค่อย fuzzy) เพื่อให้ "ค่าอาหาร" เจอ "อาหาร" ที่ seed** · กำกวม→ถามกลับ ไม่เดา · ตัด system ออกก่อน match |
| `rateLimit.ts` | `checkRateLimit(kv, uid, now)` — KV counter 2 หน้าต่าง (นาที/วัน) ผูก uid ที่ verify แล้ว · **ไม่ atomic โดยยอมรับ** |
| `security.ts` | HTTP security headers (CSP `default-src 'self'` ฯลฯ) — **ไฟล์เดิม (ไม่อยู่ในชุดที่เปลี่ยนรอบ AI ล่าสุด)** |
| `json.ts` | helper `json(body, status)` — ไฟล์เดิม |

**16 ตาราง** (นับจาก block `public.Tables` ใน `database.types.ts` รอบนี้ = 16):
`ai_settings` `budgets` `categories` `debt_events` `debts` `favorites` `friend_connections` `profiles` `recurring` `schema_migrations` `stock_items` `stock_sales` `stock_sku_config` `transactions` `wallet_transfers` `wallets`

- ทุกตาราง RLS เปิด + policy owner-only บน `auth.uid() = user_id` (`0001`) — **ยกเว้น 2 กลุ่ม:**
  - `schema_migrations` (`0011`): RLS เปิด · **0 policy** · revoke สิทธิ์ anon/authenticated (ตั้งใจ)
  - **กลุ่มยอดค้าง** `debts`/`debt_events`/`friend_connections`/`profiles` (`0015`): RLS **select-only** (เห็นได้เมื่อเป็นคู่กรณี/เพื่อน) + **เขียนผ่าน SECURITY DEFINER RPC ที่ re-check `auth.uid()` เอง** (§6 · §11.6)
- **`ai_settings` (`0029`) เป็น single-owner ล้วน** — `user_id` PK `default auth.uid()` · RLS มี **select/insert/update owner-only** แต่ **ไม่มี delete policy โดยตั้งใจ** (§11.9) · **จงใจไม่วางไว้บน `profiles`** เพราะ RLS ของ `profiles` เปิดให้เพื่อนที่ accepted เห็นแถวเรา → consent จะรั่ว (หัวไฟล์ `0029` §11.9)
- **`wallet_transfers` (`0028`) เป็น single-owner** — RLS owner-only **CRUD ครบ** · FK → `wallets` **`on delete restrict`**

---

## 4. กฎธุรกิจ — เงิน (สำคัญที่สุดในไฟล์)

ที่มา: `lib/ledger.ts` · `lib/homeSummary.ts` · `lib/shopAccount.ts` · `0012` (ขาย) · `0015` (ยอดค้าง) · `0026` (หมวดร้าน) · `0028` (กระเป๋าเงิน)
> **กฎในหมวดนี้บังคับผ่าน 2 ทางเดิน ไม่ใช่แค่ UI:** (1) โค้ด client/SQL · (2) **`SYSTEM_PROMPT` ของผู้ช่วย AI (`worker/anthropic.ts`) บอกโมเดลย้ำความหมายของตัวเลขพวกนี้** เพื่อไม่ให้ตอบปนกัน — และ **ชุดข้อมูลทดสอบที่รู้คำตอบล่วงหน้า (§11.10) มีเคสจงใจแยก "จ่าย headline" กับ "ยอดในงบ" ให้ต่างกัน** เพื่อจับโมเดลที่ตอบปน

1. **ซื้อของเข้าสต็อกไม่ใช่รายจ่าย** — `is_stock_purchase=true` ตัดจาก "ยอดจ่าย" (`isSpendingRow` = `type==='expense' && !is_stock_purchase`)
2. **ขาย = สองแถวเสมอ (Model A, gross)** (`stock_sale_create` `0012`/`0013`): income = ราคาขาย×qty (หมวด `stock_sale_income`) · expense = ต้นทุน×qty (`is_stock_cogs=true` · หมวด `stock_cogs` · wallet null)
3. **`safeToSpend = income − spending` — "รับ−จ่ายของเดือนนี้" ไม่ใช่ "เงินในกระเป๋าทั้งหมด"** (`homeSummary.ts`) · **AI ต้องเคารพผ่าน system prompt** — บรรทัดใน `SYSTEM_PROMPT` บอกตรง ๆ ว่า `safe_to_spend` ≠ "เงินคงเหลือในกระเป๋าทั้งหมด" · ยอดคงเหลือกระเป๋าดูจาก `wallet_balances` (§11.4-6 · §11.9)
4. **COGS นับใน headline เงินออก + donut แต่ตัดจาก budget** (`isBudgetSpendingRow` ตัด `is_stock_cogs`) — ไม่ต้องมี accumulator แยก เพราะถูกหักกลบด้วย income การขายใน Model A
5. **เคลียร์ยอดค้าง (`is_debt_settlement=true`) กติกาเดียวกับ COGS:** นับใน headline ตัดจาก budget
6. **ค่าดำเนินร้าน (`is_shop_operating=true`) กติกาเดียวกับ COGS:** นับใน headline ตัดจาก budget (ถังที่ 2 · `0026`) · **`is_shop_operating` เป็น derived column เขียนโดย trigger `set_txn_shop_operating` (`0026` DEFINER) เท่านั้น — client ห้ามส่งค่า**
7. **บัญชีร้านมีสองถังแยกเด็ดขาด** (`computeShopProfit`): ถัง 1 = กำไรขั้นต้นจาก `stock_sales` · ถัง 2 = ค่าดำเนินร้าน (net) · **กำไรสุทธิ = ถัง 1 − ถัง 2** · **ห้ามเกลี่ยถัง 2 ลงรายชิ้น** — **AI `stock_sales` tool คืน `profit` จาก RPC ตรง ๆ ห้าม recompute** (§11.9)
8. **ขายขาดทุนได้** — สองแถว ledger ยังบวก มีแค่ `stock_sales.profit` ติดลบ · `computeShopProfit` ไม่ clamp · **ชุดข้อมูลทดสอบมีเดือนที่ขายขาดทุน 1 รายการรวมกับขายกำไร → กำไรสุทธิ 950 (ไม่ใช่ผลรวมมั่ว)** (§11.10)
9. `cost_at_sale` snapshot ต้นทุน/ชิ้น ณ วันขาย
10. **วันที่ฝั่ง DB ใช้ `(now() at time zone 'Asia/Bangkok')::date` เสมอ** ห้าม `current_date` (`0010`) · `stock_intake_list` (`0030`) ตามกฎนี้
11. **ตัดสินว่ารายการอยู่เดือนไหนอ่านจาก string `YYYY-MM-DD` ตรง ๆ** ห้ามแปลงเป็น Date
12. **บิลรอจ่ายหักออกจาก "ใช้ได้วันละ" — หักเฉพาะรายจ่าย ไม่บวกรายรับ** (`spendable.ts`) · ไม่สมมาตรโดยตั้งใจ
13. **ห้าม clamp ยอดเงินเป็น 0 เงียบ ๆ ทุกที่ที่แสดงเงิน** — ติดลบ/เกิน บอกตรง ๆ + ไอคอนเตือน · `computePace` คืน `remaining` (ติดลบได้) + `over` แยก · **`budget_status` tool ก็ไม่ clamp — หมวดที่เกินงบคืน `remaining` ติดลบ** · กระเป๋าเงินก็ห้าม clamp (ชุดทดสอบมีเคสพร้อมเพย์คงเหลือ −3000)
14. **🔑 คงเหลือกระเป๋า = สูตรที่ใช้ `type` ดิบ ต่างจากสูตรงบโดยสิ้นเชิง** (`wallet_balances()` · `0028`):
    ```
    คงเหลือ = opening_balance
            + Σ(transactions ของกระเป๋านี้ type='income')
            − Σ(transactions ของกระเป๋านี้ type='expense')
            + Σ(transfers เข้า) − Σ(transfers ออก)
    ```
    - **ใช้ `type` ดิบ ห้าม `isSpendingRow`/`isBudgetSpendingRow` เด็ดขาด**
    - **ซื้อเข้าสต็อก (`is_stock_purchase`) ไม่ใช่รายจ่ายเชิงงบ (ข้อ 1) แต่เป็นเงินสดออกจริง → ต้องหัก** · COGS (wallet null) → ไม่เข้าสูตรเอง · เคลียร์ยอดค้าง/ค่าดำเนินร้าน (มี wallet) → นับ
    - **AI `wallet_balances` tool คืน `balance` จาก RPC ตรง ๆ ห้าม recompute** (§11.9)
15. **ห้ามเติมค่าเงินให้ล่วงหน้าในจุดที่ผู้ใช้จะกดผ่าน** — ราคาขาย · ค่าส่ง · ยอดตั้งต้นกระเป๋า · ยอดโอน เปิดมาว่างเสมอ

---

## 5. กฎธุรกิจ — สต็อก + แถวที่ล็อก

ที่มา: `0001`/`0012`/`0025`/`0027`/`0030` · `pages/StockPage.tsx` · `lib/stockAge.ts` · `lib/ledger.ts`

- `qty_remaining`/`status` **คำนวณจากจำนวนเสมอ** (`sold` เหลือ 0 · `partial` < ทั้งหมด · `in_stock` = ทั้งหมด) · CHECK `qty_remaining <= qty_total` (`0001`)
- **`cost_per_unit` และ `qty_total` ล็อกเมื่อขายแล้ว** — trigger `stock_item_lock_after_sale` (`0012`)
- **SKU สร้างจาก DB** ตาม `stock_sku_config` (1 แถว/user) · รูปแบบ **`{PREFIX}-{SEQ}`** · prefix `^[A-Z0-9]{3}$` · seq 4 หลัก zero-pad ขยายไม่ตัด (`0025`) · **`stock_items.sku` NOT NULL ไม่มี default + unique(user_id, sku)** (`0001`/`0011`) — สำคัญกับ smoke test/seed ที่ insert จริง (§9 · §11.10)
- **ตัวนับ `next_seq` ผูกกับ user ไม่ผูกกับ prefix** · สูตรประกอบที่ `stock_sku_build(prefix, seq)` ที่เดียว
- **prefix แก้เองได้ตลอด** — มีผลกับของรับเข้าใหม่เท่านั้น
- สินค้าที่มีประวัติขาย **ลบไม่ได้** (`stock_item_delete` raise · FK `on delete restrict`) ต้อง reverse ก่อน
- **ไม่มี `target_price` แล้ว** (`0027` DROP) — ราคาขายกรอกตอนขายเท่านั้น
- **ทุนจม (`computeSunkCost` ใน `lib/stockAge.ts`)** = Σ `cost_per_unit × qty_remaining` ของของที่ `isStale` · เงินจริง → mask ตาม `hideBalance` · **AI `stale_stock` tool ก็เรียก `computeSunkCost`/`isStale` ตัวเดียวกันนี้** (ไม่ hardcode 60 ซ้ำ · §11.9)
- **เกณฑ์อายุที่เดียว** ใน `lib/stockAge.ts`: `AGE_FRESH_MAX=30` · `AGE_OLD_MAX=60` — **คอมเมนต์ยอมรับเองว่าเป็นค่าเดา** (§10)
- **"รับเข้าสต็อกในเดือน" มีสองแหล่งข้อมูลที่ตอบคนละคำถาม:** `stock_items` (มีชื่อ/จำนวน/ต้นทุนครบ แต่ไม่มีตัวกรองเดือน) กับ `transactions_search filter='stock'` (ปนซื้อ/ขาย ไม่มีชื่อสินค้า) → **RPC `stock_intake_list` (`0030`) เติมช่องว่างนี้** โดยกรอง `stock_items` ตามเดือน (เวลาไทย) คืน name/qty_total/cost_per_unit · **AI `stock_intake` tool เรียกตัวนี้** (§6 · §11.9)

**แนวคิด "แถวที่ล็อก" — รวมที่ `ledger.ts` `lockedRowInfo(r)` ที่เดียว** ครอบ 3 ชนิด (`stock_purchase` แก้วันที่ได้ · `stock_sale`/`debt_settlement` ไม่ได้) · แต่ละชนิดมี trigger กันที่ DB (`stock_sale_txn_guard` `0012` · `debt_settlement_txn_guard` `0015`) · `lockedRowInfo` = client mirror · **การโอนกระเป๋าไม่ใช่แถวล็อกในตารางนี้ — มันไม่อยู่ใน `transactions` เลย** (§11.8)

---

## 6. RPC ทั้งหมด — 29 ตัว

นับจาก block `public.Functions` ใน `database.types.ts` รอบนี้ = **29** · definer/invoker อ่านจาก migration เวอร์ชันล่าสุดที่ (re)define

**สต็อก/ระบบ (12):** `stock_intake_create` (INVOKER · `0027` · 13-arg) · `stock_item_delete` (INVOKER · `0006`) · `stock_sale_create` (INVOKER · `0013`) · `stock_sale_reverse` (INVOKER · `0013`) · `stock_sales_summary` (INVOKER · `0012`) · `stock_sku_build` (INVOKER · `0025` · 2-arg) · `stock_sku_preview` (INVOKER stable · `0025` · 0-arg) · `seed_defaults` (**DEFINER** · `0008` · guard `auth.uid()=uid`) · `seed_defaults_internal` (**DEFINER** · reproduce ล่าสุด `0026`) · `recurring_run_due` (INVOKER · `0008`) · `recurring_next_date` (INVOKER · `0008` · **AI `upcoming_bills` tool เรียกตัวนี้ก้าวเดินตารางบิล**) · `pick_category_color_index` (INVOKER volatile · `0016`)

**สต็อกสำหรับ AI (1 · `0030`):**
- **`stock_intake_list(p_from date, p_to date, p_limit integer)`** (**INVOKER** · plpgsql · **stable** · `set search_path=''`) — รายการรับเข้าสต็อกช่วง `[p_from, p_to)` (เวลาไทย) · คืน `name/qty_total/cost_per_unit/total_count` · **`total_count = count(*) over ()`** (จำนวนจริงก่อน LIMIT) · `p_limit` clamp `least(greatest(coalesce(p_limit,50),1),200)` · **ไม่มีพารามิเตอร์ระบุตัวตน → RLS ของ `stock_items` เป็นด่านจริง**

**ประวัติ/ค้นหา (1):** `transactions_search` (**INVOKER** · stable · `0024` · 6-arg = `p_filter, p_q, p_limit, p_offset, p_month, p_category_id`) — filter+ค้นหา + ยอดรวมทั้งชุด (`count(*) over ()`) query เดียว · **AI `month_spending` tool เรียกตัวนี้** (`p_month=''` = ทุกเดือนสำหรับ `period='all'`) (§11.9)

**กระเป๋าเงิน (2 · `0028`):**
- **`wallet_balances()`** (**INVOKER** · SQL · stable · 0-arg) — คงเหลือทุกกระเป๋าครั้งเดียว aggregate SQL · **AI `wallet_balances` tool เรียกตัวนี้** (join ชื่อจาก `wallets`)
- **`wallet_transfer_create(...)`** (**INVOKER** · plpgsql) · ตรวจ `amount>0`/`from<>to`/เจ้าของ/วันไม่อนาคต · raise ไทยผ่าน `errors.ts`
- **ลบการโอน = ไม่มี RPC** — DELETE policy บนแถวตัวเอง (`0028`)

**ยอดค้าง (13):** `debt_create` (**DEFINER** · reproduce ล่าสุด `0019`) · `debt_confirm` · `debt_reject` · `debt_cancel` · `debt_settle` · `debt_settle_many` (`0021`) · `debt_settle_reverse` (ทั้งหมด **DEFINER** · `0015`) · `debt_share_private` (**DEFINER** · `0018`) · `debt_delete_private` (**DEFINER** · `0015`) · `friend_request_send` (**DEFINER** · reproduce ล่าสุด `0020`) · `friend_request_respond` (**DEFINER** · `0015`) · `friend_debts_summary` (**INVOKER** · reproduce ล่าสุด `0017` · 0-arg · **AI `debts_summary` tool เรียกตัวนี้ · ระดับพาดหัวเท่านั้น** §11.6/§11.9) · `generate_friend_code` (**DEFINER** · `0015` · เลิกใช้ · §10)

**สรุป definer/invoker (นับรอบนี้: DEFINER 14 · INVOKER 15):** cross-user / seed / เขียนยอดค้าง = **DEFINER** (re-check `auth.uid()`) · single-owner + สต็อก + search + กระเป๋าเงิน + `stock_intake_list` + `friend_debts_summary` + `recurring_next_date` = **INVOKER** (พึ่ง RLS)
> **RPC/ตารางที่ AI เรียกจริง (ทุกตัว INVOKER หรืออ่านตรงใต้ RLS · ตัวตนมาจาก JWT เท่านั้น):** RPC = `wallet_balances` · `transactions_search` · `stock_sales_summary` · `stock_intake_list` · `friend_debts_summary` · `recurring_next_date` · อ่านตารางตรง (ใต้ RLS) = `wallets` · `categories` · `transactions` · `budgets` · `recurring` · `stock_items` — **ไม่มีตัวไหนรับพารามิเตอร์ระบุว่าอ่านของใคร** (§11.9)

> **ไม่ใช่ RPC (trigger function — ไม่โผล่ใน types):** `set_updated_at` · `handle_new_user` · `stock_item_lock_after_sale` · `system_category_no_delete` · `stock_sale_txn_guard` · `debt_settlement_txn_guard` · `set_category_color_index` · `profiles_username_setonce` · `set_txn_shop_operating` (`0026`) · `sync_shop_operating_on_category` (`0026`) · **`ai_settings` reuse `set_updated_at` เดิม ไม่มี trigger function ใหม่**
> **ทุก RPC ที่แก้ข้อมูลต้องถูก "เรียกจริง" ถึงจะพิสูจน์** (`debt_create` มีบั๊ก cast enum ตั้งแต่ `0015` แต่ผ่าน verification ทุกครั้งเพราะไม่มี UI เรียก แก้ `0019`) → smoke test ต้องเรียกฟังก์ชันจริงและ assert · **`0029` + `0030` มี smoke test เต็มในหัวไฟล์ (result set + rollback)** · **ชุดข้อมูลทดสอบ (§11.10) เรียก RPC ที่ AI ใช้จริงแล้ว assert ค่า → จับ "โมเดลแต่งเลข" ได้** (§9)

---

## 7. Seed ของ user ใหม่

`handle_new_user()` (trigger AFTER INSERT บน `auth.users` · DEFINER) → `seed_defaults_internal(uid)` (**DEFINER** · reproduce ล่าสุด `0026`)

- **3 wallets** (`เงินสด`/`ธนาคาร`/`พร้อมเพย์`) · seed insert แค่ `(user_id, name, type)` — **`wallets.opening_balance` (numeric not null default 0 · `0028`) ได้ 0 อัตโนมัติ** · **ไม่มีคอลัมน์ `balance`** (DROP `0011` · §11.8)
- **1 แถว `stock_sku_config`** (prefix `STZ`, `next_seq=0`) · **1 แถว `profiles`** (`display_name`=ชื่อก่อน `@` · `friend_code` สุ่มเติมคอลัมน์ NOT NULL · `username`=null)
- **`ai_settings` ไม่ถูก seed โดยตั้งใจ** (`0029`) — "ไม่มีแถว" = ยังไม่ยินยอม · **ผู้ใช้ใหม่เริ่มแบบ "ไม่มีแถว" เท่าผู้ใช้เดิม** จึง**ไม่ต้อง reproduce seed เลย** (หัวไฟล์ `0029`: additive ล้วน · §11.9)

> **migration ตัวถัดไปที่แตะ seed ต้อง reproduce จาก `0026`** ตรวจเลข reproduce ล่าสุดจากไฟล์จริงก่อนเขียนทุกครั้ง (ยืนยันรอบนี้ด้วย grep: `create or replace function public.seed_defaults_internal` ครั้งสุดท้ายอยู่ `0026`) · **`0028`/`0029`/`0030` ไม่แตะ seed**

**หมวดหมู่ที่ seed = 18 หมวด** (13 expense + 5 income · จาก `0026` SECTION 6 · ยังไม่ได้ตรวจซ้ำนับทีละแถวรอบนี้ — ไม่อยู่ในชุดไฟล์ที่เปลี่ยน) — โครง: 4 หมวด system (`stock_sale_income`/`stock_cogs`/`debt_repayment_income`/`debt_repayment_expense` · ซ่อน · ลบไม่ได้) + หมวดผู้ใช้ทั่วไป + หมวดสต็อก (`is_stock_category`) + หมวดร้าน (`is_shop_category`)
- **ชื่อหมวดยอดค้างเปลี่ยนใน `0017` ให้เลี่ยงคำว่า "หนี้"** — ตอนนี้ = "จ่ายคืนเพื่อน"/"ได้รับคืนจากเพื่อน"
- **`categories`:** `color_index smallint 1–6 NOT NULL` (trigger) · `categories.color` (hex) DROP แล้ว (`0016`) · `icon` ไม่มี CHECK · CHECK `categories_shop_flag_check` (`0026`)
- **resolve หมวด system ด้วย `system_key` เท่านั้น ห้าม match ชื่อไทย** — **`worker/categories.ts` (`resolveCategory`) บังคับกฎนี้ด้วย** (ตัด `is_system`/`system_key != null` ออกก่อน match ชื่อไทย · §11.9)

---

## 8. Convention — กฎที่ห้ามละเมิด

### Migration
1. **ห้ามแก้ไฟล์ migration ที่ apply แล้ว** — เขียนไฟล์ใหม่เสมอ
2. **reproduce ฟังก์ชัน/seed จากเวอร์ชันล่าสุดบน main** (seed = `0026`) · **ตรวจเลข migration/seed ล่าสุดจากไฟล์จริงก่อนเขียนสเปกทุกใบ ห้ามอ่านจากเอกสารนี้**
3. เปลี่ยน signature → `drop function` ด้วย signature จริง (ไม่ใส่ `if exists`) แล้ว re-grant
4. ตารางใหม่ → enable RLS + policy (single-owner CRUD · cross-user = select-only + DEFINER RPC) · **`0029` ทำครบ: enable RLS + select/insert/update (ไม่มี delete โดยตั้งใจ)**
5. เจ้าของรันเอง ครอบ `begin; … commit;` + snapshot ฟังก์ชันเดิม · **หลังรัน ตรวจว่าไฟล์ `.sql` เข้า main จริงด้วย git** (กับดัก `0015`)
6. **อ่าน `pg_constraint` + NOT NULL ของทั้งตารางก่อนแก้/เขียน smoke test** ไม่ใช่แค่ `information_schema.columns` (มองไม่เห็น CHECK · §9)

### SQL
7. **`RETURNS TABLE`/OUT param กลายเป็นตัวแปรใน scope** → alias ทุกตาราง qualify ทุกคอลัมน์ (`stock_intake_list` `0030` qualify `si.` · §9)
8. **ค่าจาก CASE/`values` list ไม่ cast enum อัตโนมัติ** → cast `::public.enum_type` ตอน INSERT (บั๊ก `debt_create` · §9)
9. **Verification ต้องพิสูจน์ว่า "ทำงานได้" ไม่ใช่แค่ "มีอยู่"** — smoke test เรียกฟังก์ชันจริงใน `begin;…rollback;` แล้ว assert · **assert ต้องลึกพอจะจับบั๊ก: 19/19 เคยผ่านทั้งที่มีรายการไร้หมวดค้าง เพราะไม่มี assert ระดับหมวด** (§9 · §11.10)
10. เงินคำนวณใน numeric เท่านั้น

### Client + Worker
11. **ห้ามมีตรรกะซ้ำสองที่** — แยกเป็นฟังก์ชันกลางแล้ว import (สี=`catColor` · วันที่=`dates` · แถวล็อก=`ledger` · P&L=`shopAccount` · aggregate หน้าแรก=`homeSummary` · อายุ/ทุนจม=`stockAge` · **สถานะงบ=`budgetPace`** · **บิลรอจ่าย=`upcomingBills`** · ตั้งงบได้ไหม=`budgetable` · กรองอินพุตเงิน=`format` · **เพดานคำถาม AI=`aiLimits`**) · **worker ห้าม re-implement เงิน/วันเอง — เรียก RPC หรือ pure function ของ `lib/` แล้วส่งตัวเลขผ่าน** (คอมเมนต์หัว `tools.ts`)
12. **ห้าม `as unknown as` / `as any` / `@ts-ignore` / `@ts-expect-error`** — รับ "รูปร่างขั้นต่ำ" structural แทน · **client map ประวัติแชทเป็น `ChatTurn[]` ทีละ field (annotation `: ChatTurn[]` = excess-property check กัน field แปลกหลุดขึ้น wire)** (§11.9)
13. `database.types.ts` generated ห้ามแก้มือ · alias อยู่ใน `db.ts`
14. **ห้ามใช้คำว่า "ผ่าน" ถ้ายังไม่ได้รัน `npm run build` + `npm test`** · **รายงาน skipped แยกจาก passed เสมอ** · **และ "PROVEN" ของ verify seed ต้องรันจริงก่อน ไม่ใช่ "ไฟล์เขียนเสร็จ"** (§11.10)
15. **จับ error ด้วย code/status เท่านั้น ห้ามจับ substring** · **error ต้องถึงผู้ใช้** ห้าม catch ว่าง · **`aiChat.ts` + `ai.ts` map ตาม HTTP status ล้วน** (400/401/403/429/502/504/503) ไม่ parse ข้อความ (§11.9)
16. **ห้ามเผยว่าอีเมลมีบัญชีในระบบหรือไม่** · ค้นหาเพื่อนใช้ `username` ไม่ใช่อีเมล · **ด่าน 401 ของ AI ใช้ข้อความเดียวสำหรับ missing/expired/revoked** (`ai.ts`)
17. **ห้าม `new Date('YYYY-MM-DD')` แล้วอ่านค่า** — helper กลางใน `dates.ts` · **worker แปลงเดือนด้วย `dates.ts` เท่านั้น** (โมเดลส่ง offset int · `monthAnchorFromKey` ไม่ใช่ `new Date('YYYY-MM-01')`)
18. **สีต้องมาจาก token** ห้าม hex ดิบใหม่ใน `src/` · **hex เป็นแหล่งความจริงที่ `tailwind.config.ts` + `src/styles/index.css` เท่านั้น ห้ามคัดลอกไปที่อื่น (รวมเอกสารนี้)**
19. **คำที่ห้ามบนหน้าจอ:** หนี้ · เจ้าหนี้ · ลูกหนี้ · เรียกเก็บ · ทวง — **ชื่อในฐานข้อมูล/โค้ดยังเป็น `debt*` ตั้งใจ** · *`src/` สะอาดจากคำเหล่านี้เชิงข้อความจอ · เหลือเฉพาะ (ก) คอมเมนต์/ชื่อเทสต์ใน `budgetable.ts` และ (ข) **`SYSTEM_PROMPT` ของ AI (`worker/anthropic.ts`) ที่ใช้คำเหล่านี้เพื่อ "สั่งห้าม" โมเดลพูด*** · แต่ยังค้างใน `RAISE EXCEPTION` ของ RPC ยอดค้าง (§10)
20. **`transactions.is_shop_operating` เป็น derived column เขียนโดย trigger เท่านั้น** — client ห้ามส่งค่า (§4-6)
21. **1 PR = 1 เรื่อง** แตกจาก main ล่าสุด ไม่ stack · PR ที่ merge แล้ว = เริ่ม branch ใหม่จาก main (ฟีเจอร์ AI แตกเป็นหลายใบเรียงลำดับ: table → gate → tools → UI → multi-turn → tool เพิ่ม → deep link แยกกัน)
22. **กับดัก opacity:** ค่า opacity เปล่าใน Tailwind build นี้ **ต้องเป็นทวีคูณของ 5** หรือ arbitrary (`/[0.92]`) — `/92` **ไม่ถูก emit เลย ไม่ error ไม่ warning** · เทสต์สแกน `src/styles/opacity-scale.test.ts` (§9)
23. **คำบนจอต้องตรงกันทั้งแอป (glossary):** บทบาทหมวดที่ป้อนสต็อก = `เติมสต็อก` · การกระทำรับของเข้าคลัง = `รับเข้าสต็อก` · section/สถานะ = `สต็อก`/`ในสต็อก` · เทสต์ `StockIntakePage.wording.test.ts`

### Worker
24. **worker import runtime code จาก `src/lib/` ต้องใช้ relative import ห้าม `@/`** — `tsconfig.worker.json` ไม่มี `paths`, esbuild ของ wrangler ก็ไม่อ่าน `tsconfig paths` → `@/` พังทั้ง typecheck และ bundle · **ยืนยันรอบนี้: `grep -rn '@/' src/worker` = ว่าง ทุก import เป็น `../lib/…`**
25. **smoke test / seed ที่ insert ลงตารางจริง:** อ่าน NOT NULL ทั้งตารางก่อน · เลือกช่วง/คีย์ที่ว่างแน่ (`0030` มิ.ย. 2020 + sku `ZZZ-90xx`) · คืนผลเป็น **result set** (SQL Editor ไม่แสดง notice) · FAIL ใช้ `RAISE EXCEPTION` · impersonate ด้วย `request.jwt.claims` + สลับ role `authenticated` · จบด้วย `rollback;` · **uid ต้องอ่านจากตัวแปรหัวไฟล์ (`v_me`/`v_friend`) ที่เจ้าของกรอกเอง ห้ามเทียบกับค่าตัวอย่างในไฟล์** (§9 · §11.10)
26. **`/api/ai` ห้ามใช้ `service_role` · ห้ามรับ `user_id` จาก body · ลำดับ verify→consent→limit→Anthropic ห้ามสลับ** · **body อ่านได้แค่ `message` + `history` — `history` ต้องผ่าน `parseHistory` allowlist (ปฏิเสธ `tool_use`/`tool_result` ปลอม)** (§11.9)

---

## 9. กับดักที่เคยเกิดจริง — อย่าให้ซ้ำ

| เหตุการณ์ | บทเรียน |
|---|---|
| **`tsc` เขียวแต่ Cloudflare deploy พัง** — import `@/` ที่ tsc worker/esbuild ไม่รู้จัก | **เครื่องมือตรวจ ≠ เครื่องมือ build จริง** · worker ต้องพิสูจน์ด้วย **`wrangler deploy --dry-run`** · import relative ล้วน (§8-24) |
| **ชุดข้อมูลทดสอบที่รู้คำตอบล่วงหน้าจับ "โมเดลแต่งตัวเลข" ได้ตั้งแต่ใช้ครั้งแรก** — โมเดลตอบ **กำไรรวม 8,000** ทั้งที่คำตอบจริงคือ **950** · เลข 8,000 นั้น **ไม่ได้มาจาก tool ใดเลย** (โมเดลบวก/แต่งเอง) | ข้อมูลที่ทุกค่า deterministic + ตาราง "ถามข้อนี้ต้องได้เลขนี้" (`docs/testing/expected-answers.md`) ทำให้จับผิดได้ด้วยตาทันที · เป็นเหตุผลตรง ๆ ที่ยกโมเดลเป็น sonnet (§11.9) — haiku ทำ error แบบนี้ซ้ำ (§11.10) |
| **verify ผ่านหมดทั้งที่มีบั๊ก** — 19/19 PROVEN ทั้งที่มีรายการ **ไร้หมวด (`category_id` null)** ค้างอยู่ เพราะ assert เดิมเช็คแค่ยอดรวม ไม่มี assert ระดับหมวด (ยอดรวมยังถูก บั๊กจึงมองไม่เห็น) | เพิ่ม assert รายหมวด (จ่ายแยกหมวดผ่าน `p_category_id` จริง) + null-check → **ตอนนี้ 28 assert** · assert ต้องลึกพอจะจับบั๊ก ไม่ใช่แค่ผลรวมถูก (§8-9 · §11.10) |
| **`recurring_run_due` ทำให้ตัวเลข "เดือนปัจจุบัน" ขยับเอง** — รันทุกครั้งที่โหลดแอป (materialize บิลถึงวันนี้) → ยอดจ่าย/ยอดในงบของ offset 0 เปลี่ยนระหว่างเดือน | ค่าคาดหวังของ **เดือนปัจจุบันต้องเขียนเป็นสูตร ไม่ใช่ตัวเลขตายตัว** · ชุดทดสอบย้ายจ่าย/ยอดในงบของ offset 0 ไป "กลุ่ม ข" (ค่าขึ้นกับวันรัน) · verify ต้องรัน **ในเดือนเดียวกับที่ seed** (§11.10) |
| **`computePace` กับเดือนที่ปิดแล้วให้ผลไร้ความหมาย** — เดือนเก่าถูกตัดสิน `fast` เทียบสัดส่วนวันที่ผ่านของ **เดือนปัจจุบัน** → เกือบทุกหมวดเก่ากลายเป็น `fast` · **ตัวเลข (used/remaining/over) ถูกหมด ผิดแค่ป้ายสถานะ → จับด้วยตาเปล่าไม่ได้** | เดือนที่ไม่ใช่ปัจจุบันต้องใช้ **`computePaceStatic` (ไม่มี `fast`)** · `budget_status` tool + `BudgetPage.tsx` แยก current↔closed ตรงกัน (`month === monthKey(now) ? computePace : computePaceStatic`) — ห้าม "simplify" กลับเป็น call เดียว (§3 `budgetPace.ts`) |
| **guard uid ที่เทียบกับค่าตัวอย่างพังเมื่อ find-replace ทั้งไฟล์** — assert ที่ hardcode uid ตัวอย่างจะ "ผ่าน" ทันทีเมื่อเจ้าของ find-replace uid ทั้งไฟล์ (เทียบกับตัวเอง) | uid ต้องอยู่ในตัวแปรหัวไฟล์ (`v_me`/`v_friend`) ที่เจ้าของกรอกจาก `select id from auth.users` · **คอมเมนต์ในไฟล์ verify สั่งห้ามเทียบกับค่าตัวอย่าง** (§8-25 · §11.10) |
| **smoke test/seed ล้มตั้งแต่ seed** — `stock_items.sku` NOT NULL ไม่มี default (23502) · assert `count` บนเดือนปัจจุบันชนข้อมูลจริง | อ่าน NOT NULL ทั้งตารางก่อน + เลือกช่วง/คีย์ที่ว่างแน่ · เทสต์ที่ล้มก่อนเรียกฟังก์ชันไม่พิสูจน์อะไร (§8-25) |
| **types-drift PR merge เข้า main ได้โดยไม่ผ่าน `ci.yml`** — เปิดด้วย `GITHUB_TOKEN` fallback ที่ trigger workflow ต่อไม่ได้ | **`GH_PAT` ยังไม่ตั้ง** · บันทึกใน §10 เป็นหนี้ที่รู้ตัว |
| **เอกสารค้างหลังของจริงจนสเปกผิด** — เคยเชื่อ migration `0021` ทั้งที่ `0024` · เคยบอก AI เป็น stub · **รอบล่าสุด: ยัง "ลิสต์เครื่องมือไม่ครบ (6 ทั้งที่ 9) / single-turn / v1 ไม่มีเครื่องมือยอดค้าง"** | สเปก/เอกสารทุกใบยืนยันจากไฟล์จริงก่อนเขียน (§8-2) · ประกอบใหม่ทั้งฉบับ ไม่แพตช์จุด |
| **`information_schema.columns` ไม่แสดง CHECK** | อ่าน `pg_constraint` ทั้งตาราง (§8-6) |
| **ค่าจาก `values`/CASE ไม่ cast enum** — `debt_create` | cast `::public.enum_type` (§8-8) |
| **Supabase คืนแถวได้จำกัด** — รวมยอด/ลิสต์ที่ชนเพดานให้ผลน้อยกว่าจริงเงียบ ๆ | **guard เสมอ** — worker tools: `RAW_ROW_MAX=2000` → เกิน = คืน `too_many_*` ไม่ under-report · list tool ใช้ `count(*) over ()`/`match_count` ให้ยอดรวมถูกแม้ list ถูก cap (§11.9) |
| `qty_remaining` เป็นทั้ง OUT param และคอลัมน์ → การขายพัง ทั้งที่ verification ผ่าน | qualify ทุกคอลัมน์ · smoke test (`0013` alias · `0030` qualify `si.`) |
| **`0015` รันลง DB แล้วแต่ไฟล์ไม่เคยเข้า main** | `schema_migrations` กับ repo ต้องตรง · ตรวจหลัง migration ว่าไฟล์เข้า main |
| **`tsc --noEmit` บน solution-style → ตรวจ 0 ไฟล์ ผ่านเสมอ** | "ผ่าน" ต้องมาจากคำสั่งเดียวกับ CI (`tsc -b && vite build` + `vitest run`) |
| **ป้ายพับในฮีโร่เป็นแถบเปล่าบน production ทั้งที่โค้ดถูก เทสต์ jsdom เขียว** | jsdom "อยู่ใน DOM" ≠ ผู้ใช้เห็น · guard เบราว์เซอร์จริง `WovenHero.visual.test.ts` |
| **dark mode พื้นหลังทั้งหน้าขาว** ทั้งที่ทุกเทสต์เขียว | guard `AppLayout.theme.visual.test.tsx` วัดสี compute จริง |
| **ไล่บั๊กที่แก้ไปแล้วหลายชั่วโมง** เพราะบันเดิลค้าง — SW precache | **merged ≠ deployed ≠ สิ่งที่เบราว์เซอร์รัน · อ่าน version stamp ก่อน** · guard `pwa-freshness.visual.test.ts` |
| `grep "mint-" src/` ว่าง แต่สีเก่าอยู่ใน DB | grep พิสูจน์ได้แค่เรื่องในโค้ด · ค่าที่ seed ลง DB คืออีกแหล่ง (แก้ `0016`) |
| **รายงานเทสต์ "ผ่าน N" โดยมี skipped ซุกอยู่** | guard `ctx.skip()` นอก CI (ใน CI throw) · อ่าน skipped ทุกครั้ง รายงานแยก (รอบนี้ 15 skip นอก CI) |
| **`0020` เปลี่ยน signature RPC แล้ว merge PR `types-drift` เดี่ยว → main แดง** | migration ที่เปลี่ยน signature/ทำ fixture พัง ห้าม merge types-drift เดี่ยว (§2.1) |
| Supabase free tier pause เอง หน้า login ค้าง | error ต้องถึงผู้ใช้ · `errors.ts` `isConnectFailure` |
| **`bg-ink/92` ไม่ compile เลย** ไม่ error ไม่ warning | opacity เปล่าต้องเป็นทวีคูณ 5 · guard `Toast.contrast.visual.test.tsx` + `opacity-scale.test.ts` |
| **token `toast`/`scrim` จงใจไม่มี dark override** | คอมเมนต์ล็อก "do NOT add a dark variant; it is not forgotten" (§11.2) |
| **`useDialogA11y` ทำ input หลุดโฟกัสทุกตัวอักษร** | `onClose` ขี่ ref · effect depend `[active]` เท่านั้น |
| **`truncate` ตัดชื่อเงียบ** · jsdom ไม่ layout จับไม่ได้ | guard 360px วัด `scrollWidth − clientWidth` |
| **ช่องว่างขอบล่างระดับ shell** `#root{height:100%}` บนมือถือ | `#root{height:100dvh}` · guard `AppLayout.fill`/`AddPage.fill` |
| **สูตรคงเหลือกระเป๋าใช้ predicate งบผิด → ผิดเงียบ** | คงเหลือกระเป๋าใช้ `type` ดิบ (§4-14) · smoke test `0028` |

---

## 10. สถานะปัจจุบัน

**Migration:** `0001`–`0030` (`ls supabase/migrations/*.sql | wc -l` = **30** · ล่าสุด `0030_stock_intake_list.sql`) — **ใบนี้ + หลายใบ AI ล่าสุดไม่มี migration** · ชั้น DB ล่าสุดคือ `0029` (`ai_settings`) + `0030` (`stock_intake_list`)

**หน้าจริงในแอป:** **14** ไฟล์ `*Page.tsx` (`find src/pages -name '*Page.tsx' | wc -l` = 14) · `router.tsx` มี **15 route** (14 หน้า + catch-all `*` → `<Navigate to="/" replace />`) — eager import ทั้งหมด:
- ไม่ต้อง auth: `/login` · `/forgot-password` · `/reset-password`
- ใต้ `RequireAuth` + `AppLayout`: `/` Home · `/history` · `/debts` · `/debts/friend/:friendId` · `/stock` · `/budget` · `/settings`
- ใต้ `RequireAuth` **นอก** `AppLayout` (เต็มจอ ไม่มี bottom nav): `/add` · **`/ai` (แชทผู้ช่วย AI)** · `/stock/intake` · `/stock/queue`
- *(คอมเมนต์หัว `router.tsx` ยังเขียน "Routes for the 10 screens" = คอมเมนต์ค้าง จดไว้ ไม่แก้ในใบนี้)*

**Bottom nav = 5 ช่อง:** มือถือ (`AppLayout.tsx` `sm:hidden`) = **4 แท็บ + FAB กลาง** — LEFT `หน้าหลัก`/`ประวัติ` · FAB `+`→`/add` · RIGHT `ยอดค้าง`/`สต็อก` · **`ตั้งค่า`/`งบประมาณ` ไม่อยู่ในแถบล่าง** · **rail เดสก์ท็อป (`sm:flex`) ยังครบ 6** · guard `AppLayout.visual.test.tsx`
> **ปุ่ม "ถาม AI" ไม่ใช่ช่องที่ 6** — เป็น pill absolute-positioned ลอยเหนือแถบล่าง (มือถือ) / ปุ่มท้าย rail (เดสก์ท็อป) · **แสดงเฉพาะเมื่อ consent = 'on'** · never_chosen/off/กำลังโหลด → ซ่อน · **นอกจากนี้ยังมีปุ่ม `AskAiButton` ในหน้างบ/สต็อก ที่ลิงก์ `/ai?q=…` (คนละตัว)** (§11.9)

**เทสต์:** `npm test` (`vitest run`) รอบนี้ = **72 ไฟล์** (`find src \( -name '*.test.ts' -o -name '*.test.tsx' \) | wc -l` = 72 · รวมเทสต์ worker `ai.test.ts`/`tools.test.ts`/`categories.test.ts`/**`history.test.ts`** + เทสต์หน้า AI/consent/query-param + `AskAiButton.test.tsx`)
- **เครื่องเปล่า (ไม่มี Chromium · รันจริงรอบนี้):** **`Tests 638 passed | 15 skipped (653)`** · **Test Files 72 passed (72)** — **15 ที่ skip = guard เบราว์เซอร์จริง** `ctx.skip()` นอก CI (ใน CI throw)
- **มี Chromium (แบบ CI):** คาดว่า `653 passed | 0 skipped` · **ยังไม่ได้ตรวจรอบนี้** (ไม่มี Chromium ในเครื่อง — พิสูจน์ได้เฉพาะใน CI)

**Guard เบราว์เซอร์จริง = 13 ไฟล์** (`find src -name '*.visual.test.*'` = 13 · ทุกตัวใช้ skip-นอก-CI / throw-ใน-CI ผ่าน `visual-harness.ts` เว้น `pwa-freshness` inline): `AppLayout.visual` · `AppLayout.theme.visual` · `AppLayout.fill.visual` · `WovenHero.visual` · `charts.visual` · `pwa-freshness.visual` · `CategoriesManager.visual` · `Toast.contrast.visual` · `StockScrim.contrast.visual` · `AddPage.keypad.visual` · `AddPage.fill.visual` · `WalletsManager.visual` · `WalletsManager.transfers.visual`

**Cloudflare Worker (`src/worker/`):** ดู §11.9 — **AI proxy ใช้งานได้ครบวงจร ไม่ใช่ stub** (`ai.ts`/`anthropic.ts`/`tools.ts`/`categories.ts`/`rateLimit.ts`/**`history.ts`** เป็นของจริง · `index.ts` route `/api/ai`) · `security.ts`/`json.ts` เดิม
> **`wrangler deploy --dry-run`** — พิสูจน์ worker bundle · **ยังไม่ได้รันรอบนี้** (ใบนี้ไม่แตะ worker) · รอบที่แตะ worker ครั้งก่อนผ่าน (bundle + อ่าน asset จาก dist + binding `AI_RATE_LIMIT`/`ASSETS`)

**Version stamp + PWA:** `vite.config.ts` `define` `__COMMIT_SHA__` + `__BUILD_TIME__` แสดงท้าย `SettingsPage` · PWA precache **22 entries** (จาก `npm run build` รอบนี้) · *(ไม่ได้อ่าน vite.config ทุกบรรทัดรอบนี้)*

**ทำเสร็จแล้ว (มีในโค้ดจริง):** ระบบขายครบวงจร · บัญชีร้าน 2 ถัง · SKU prefix-only · ทุนจม/วันในคลัง · ยอดค้างครบวงจร · ค้นหาประวัติ + ตัวกรองเดือน · หน้างบ · dark mode + guard · shell เต็มจอมือถือ · glossary คำบนจอ · กระเป๋าเงินครบวงจร (§11.8) · **🆕 ผู้ช่วย AI ครบวงจร:** consent เซิร์ฟเวอร์ (`ai_settings`) + สวิตช์ในตั้งค่า + ปุ่ม "ถาม AI" + หน้าแชท `/ai` + `/api/ai` (verify→consent→limit→Anthropic) + **9 tool อ่านอย่างเดียว** + resolveCategory (สองชั้น) + rate limit KV + **multi-turn history** + **`period='all'`** + **deep link ในคำตอบ → หน้าประวัติ** + **ทางเข้า `/ai?q=` + ปุ่มถามในหน้างบ/สต็อก** + **ยกโมเดลเป็น sonnet** + ชุดข้อมูลทดสอบที่รู้คำตอบล่วงหน้า (§11.9 · §11.10)

**ยังไม่ได้ทำ / หนี้ที่รู้ตัว (grep/อ่านใหม่รอบนี้ว่ายังจริง):**
- **`GH_PAT` ยังไม่ตั้ง** — PR types-drift fallback เป็น `GITHUB_TOKEN` ที่ trigger `ci.yml` ต่อไม่ได้ (§2.1 · §9) → ยังเปิด · แก้ = ตั้ง secret (ใบแยก)
- **`friend_code` + `generate_friend_code()` เลิกใช้แต่ยังอยู่** — grep `friend_code src` = **เจอแค่คอมเมนต์ `ProfileManager` ("gone") + `database.types.ts`** → ยังจริง
- **คำที่ห้ามขึ้นจอยังค้างใน `RAISE EXCEPTION` ของ RPC ยอดค้าง** — grep same-line `raise exception` + `หนี้|เจ้าหนี้|ลูกหนี้` = **16 จุด** (`0015`×12 · `0018`×1 · `0019`×3 · ตรวจรอบนี้ตรงเป๊ะ) → ผู้ใช้เห็นได้เพราะ `errors.ts` ส่งไทยผ่านตรง · แก้ต้อง migration reproduce = ใบแยก
- **ยังไม่มี ESLint** — `npm run lint` = `tsc -b`
- **`AGE_OLD_MAX=60` เป็นค่าเดา** — คอมเมนต์ `stockAge.ts` ยอมรับเอง
- **`transactions_search` ยังไม่มีหลักฐานว่ารัน smoke test** — UI + AI `month_spending` เรียก production (smoke อยู่ในหัวไฟล์ `0022`)
- **ค่าดำเนินร้านรวมยอดฝั่ง client ไม่ใช่ RPC** (`useShopOperating` + cap) — ชนเพดานจริง → ย้ายเป็น RPC aggregate (ใบแยก)
- ถังขยะ/สำรองข้อมูล · offline-first เต็มรูปแบบ — ยังไม่ทำ

---

## 11. Redesign + ฟีเจอร์ — สถานะปัจจุบัน (ไม่ใช่แผน)

> **แหล่งความจริงของสี:** `tailwind.config.ts` + `src/styles/index.css` — **ไม่คัดลอกค่า hex** · **แหล่งความจริงของ model id + เพดาน AI:** `src/worker/anthropic.ts` (+ `src/lib/aiLimits.ts`) — **ไม่คัดลอกชื่อรุ่น/ค่าตัวเลข**
> **เอกสารดีไซน์:** `docs/design/…` · **เอกสารออกแบบ AI:** `docs/ai-assistant-design.md` · **ชุดข้อมูลทดสอบ:** `supabase/seeds/` + `docs/testing/` (§11.10)

### 11.1 ฮีโร่ — ป้ายทอคอเสื้อ (`src/components/WovenHero.tsx`)
**หลักการ: กิมมิกต้องเผย ไม่ใช่ซ่อน** · ป้ายทอ 3 ใบ ลำดับ `SAFE TO SPEND` → `BUDGET` → `STOCK PROFIT` (ไม่มีใบยอดค้าง) · `flex flex-col` บนปุ่มป้ายเป็น load-bearing (บั๊กแถบเปล่า · §9) · **เรขาคณิต (`CONTAINER_H`/`LABEL_H`/`POSITIONS`) อ่านจากไฟล์ ไม่คัดลอกมาที่นี่** · guard `WovenHero.visual.test.ts`

### 11.2 สี — คราม + สีหมวดต่อ slot (`tailwind.config.ts` + `src/styles/index.css`)
- สีแบรนด์ = คราม · `cat.1–6`+`cat.other` เป็น CSS variable (light/dark override) · **สีหมวดมาจาก `color_index` ผ่าน `catColorVar()` ที่เดียว** · mint ถูกนำกลับมา
- **token theme-independent (ไม่มี dark override โดยตั้งใจ):** `toast` · `scrim` — ใช้แทน `bg-ink` เฉพาะจุดเนื้อหาขาวบนพื้นเข้ม · **`bg-ink` ที่เหลือ = จุด in-use ใน `CategoriesManager`**

### 11.3 โดนัท (`src/components/charts.tsx`)
ตัวเลขรวมบรรทัดเดียว · `donutCenterFontSize(charCount)` แหล่งเดียว · guard `charts.visual.test.ts` · `largestRemainderPercents()` legend รวม 100

### 11.4 การตัดสินใจสำคัญ — ทำไม (หัวใจของไฟล์)
โค้ดบอก "ทำอะไร" เอกสารบอก "ทำไม" · ข้อที่**กลับคำ**สำคัญที่สุด:

1. **สีแบรนด์ย้ายออกจากเขียว** เพราะเขียวถูกจองด้วย "เงินเข้า"
2. **สีหมวดปักหมุดต่อหมวด (`color_index`) ไม่เรียงตามยอด** — เรียงตามยอดจะสลับทุกเดือน
3. **DB เก็บความหมาย client เก็บหน้าตา**
4. **`icon` ไม่มี CHECK** — `lib/icons.tsx` fallback ชื่อผิดเสื่อมนุ่มนวล
5. **โดนัท: ขยายรู ไม่ย่อตัวเลข**
6. **หน้าแรกตอบ "เหลือเงินเท่าไหร่" งบเป็นป้ายใบสอง** — `safeToSpend` = "รับ−จ่ายเดือนนี้" ต่างจาก "เงินในกระเป๋าทั้งหมด" (§11.8) · **กฎนี้ขยายไปถึงผู้ช่วย AI** — `SYSTEM_PROMPT` ย้ำว่า `safe_to_spend` ≠ ยอดคงเหลือกระเป๋า (§4-3 · §11.9)
7. **บิลรอจ่าย: หักเฉพาะรายจ่าย ไม่บวกรายรับ**
8. **ห้าม clamp เป็น 0 เงียบ ๆ** — เกิน/ติดลบ บอกตรง ๆ + ไอคอน
9. **texture + เงา = ข้อยกเว้นเฉพาะป้ายทอ** · motion เคารพ `motion-reduce`
10. **เส้นประถูกใช้กับโซนวางรูปแล้ว** — ห้ามให้ความหมายที่สอง
11. **`hideBalance` = "ซ่อนตอนกวาดตา เปิดตอนตัดสินใจ"** — **ชีตที่ขอให้ยอมรับข้อผูกพัน (`ConfirmDebtSheet`/`SettleSheet`/แผงขาย/`WalletTransferSheet`) ต้องแสดงเงินเสมอ ไม่รับ prop `hideBalance`** · **`AiPage` ก็ไม่รับ prop ใด ๆ เลย** → `hideBalance` ส่งเข้าไม่ได้เชิงโครงสร้าง (ยืนยันรอบนี้: component ไม่มี props · §11.9) · หน้างบ + ลิสต์กระเป๋า mask ตาม `hideBalance`
12. **private ไม่รวมในพาดหัว และไม่รวมกับ shared** — `computeFriendLedger` แยกถัง
13. **ย้อนการเคลียร์ได้เฉพาะคนที่กดเคลียร์เอง** (`settled_by = auth.uid()`)
14. **ชื่อฟีเจอร์ = "ยอดค้าง"** · คำห้ามบนจอ: หนี้/เจ้าหนี้/ลูกหนี้/เรียกเก็บ/ทวง · schema/โค้ดยังเป็น `debt*` ตั้งใจ · **ผู้ช่วย AI พูดยอดค้างได้เฉพาะระดับพาดหัว และ `SYSTEM_PROMPT` สั่งห้ามพูดคำเหล่านี้ + ห้ามเอ่ยชื่อเพื่อน** (§11.6 · §11.9)

**— รอบฟีเจอร์หลัง redesign (15–22 · ยังไม่ได้ตรวจซ้ำทีละบรรทัดรอบนี้ ยกเว้นข้อที่ AI มาแตะ):**
15. **หน้าประวัติใช้ RPC เดียว** (`transactions_search`) · **AI `month_spending` reuse RPC เดียวกันนี้** (§11.9)
16. **"เติม cache" หลังบันทึก ไม่ใช่ optimistic** (`txCache`)
17. **effect ที่ seed ฟอร์มต้องผูกกับ `id` ไม่ใช่ object**
18. **undo การลบคืนแถวด้วย `id`+`created_at` ชุดเดิม** (`txRestore`)
19. **"เดือน" คือ string `YYYY-MM` ไม่ใช่ Date** (`dates.ts`) · **worker แปลง offset→YYYY-MM ด้วย `addMonthsToKey`/`monthKey`** (§11.9)
20. **`computeHomeSummary` แยก `month` ออกจาก `now`** · **worker `home_summary` tool เรียกตรง ๆ** (§11.9)
21. **`useUpcomingBills` จงใจไม่รับเดือน** — ผูกกับ "ตอนนี้" · guard `MAX_OCCURRENCES_PER_RULE=40` · **worker `upcoming_bills` tool ก็ไม่มี offset/period ด้วยเหตุผลเดียวกัน** (§11.9)
22. **`onTap` ป้ายด่วนอยู่บน `click` ไม่ใช่ `pointerUp`**

**— รอบ SKU / หมวดร้าน / กำไรร้าน / ทุนจม (23–33) · รอบงบ (34–36) · รอบ redesign แถบล่าง/add/contrast/shell (37–43):** เท่ารอบก่อน · ไม่ได้ตรวจซ้ำทีละบรรทัด · จุดที่ AI แตะ (`budgetPace`/`upcomingBills`/RPC) ตรวจจากไฟล์จริงแล้ว

### 11.5 บั๊กรอบก่อน — แก้แล้ว
B1–B14 (redesign) · ค้นหาแมตช์แค่ note · dark-mode พื้นขาว · ป้าย "บันทึกแล้ว" โกหก · toast มองไม่เห็น · caret หลุด · ชื่อหมวด truncate · `bg-ink` contrast · ช่องว่างขอบล่าง shell · คำ glossary — บันทึกที่ §9/§11.4 ตามชนิด

### 11.6 ยอดค้าง (friend outstanding balances) — ครบวงจร
**แนวคิด:** ติดตามยอดค้างระหว่างเพื่อน แยก **"ตกลงกันแล้ว" (shared)** กับ **"จดไว้เอง" (private)** ไม่รวมกัน (§11.4-12) · ฟีเจอร์ cross-user ตัวเดียว → security model ต่าง (§3)
- **ตาราง (`0015`):** `profiles` · `friend_connections` · `debts` · `debt_events` · RLS select-only + DEFINER RPC
- **Flow + RPC (`useFriends.ts`):** `friend_request_send`/`respond` · `debt_create`/`debt_share_private`/`debt_delete_private`/`debt_cancel` · `debt_settle`/`debt_settle_many`/`debt_settle_reverse`
- **เชื่อมเงินหลัก:** เคลียร์ → transaction จริง 1 แถว `is_debt_settlement=true` · แถวล็อก (§5) นับ headline ตัดงบ
- **สรุป:** `computeFriendLedger` + `computeDebtsHeadline` (`friend_debts_summary.shared_net`)
- **หน้าจอ:** `/debts` · `/debts/friend/:friendId` · username `^[a-z0-9_]{3,20}$` ตั้งครั้งเดียว (`0020`)

> **🔁 กลับคำเรื่องขอบเขต AI (สำคัญ):** เดิมเอกสารเขียนว่า **"ผู้ช่วย AI v1 ตัดยอดค้าง/เพื่อนออกจากมือ AI ทั้งหมด"** — **กลับคำแล้ว** · ตอนนี้มี tool **`debts_summary`** ที่แตะกลุ่มยอดค้าง **แต่ที่ระดับพาดหัวเท่านั้น** (คอมเมนต์หัว `tools.ts` เขียนเอง): คืนแค่ **3 ยอดรวม** — เพื่อนค้างเรารวม (`they_owe_me`) · เราค้างเพื่อนรวม (`i_owe_them`) · จำนวนเพื่อน (`friend_count`) + flag `has_friends` · **ไม่ส่งชื่อเพื่อน (`display_name`) · ไม่ส่ง `friend_id` · ไม่ส่ง `reason`/เรื่องที่ค้าง · ไม่ส่ง private ใด ๆ** (`computeDebtsHeadline` อ่านแค่ `shared_net` → private ตัดออกโดยโครงสร้าง) · แยกสองยอดเสมอ ไม่ยุบเป็นยอดเดียว (ข้ามเพื่อนหลายคนยอดไม่หักกลบ)
> **ทำไมกลับคำ:** รูปแบบ tool อ่านอย่างเดียว (INVOKER · ไม่มีพารามิเตอร์ระบุตัวตน · RLS เป็นด่าน) **พิสูจน์ตัวเองแล้ว** จึงเปิดกลุ่มยอดค้างที่ **สไลซ์แคบที่สุด** ได้ — `friend_debts_summary()` เป็น 0-arg + INVOKER (RLS scope ให้ผู้เรียก) · `display_name` เป็นข้อความที่ "อีกฝ่าย" ตั้ง = surface ของ prompt-injection ข้ามคน จึงห้ามให้ถึงโมเดล (§11.9)

### 11.7 flow หลังปิดการขาย — ค่าส่งขาเข้า
`StockEditSheet.doSell` สำเร็จ → ถ้ามีหมวดรายรับร้าน แสดง `ConfirmDialog` → `navigate('/add', {state:{prefill, returnTo:'/stock'}})` · ไม่ prefill ยอด

### 11.8 กระเป๋าเงิน — คงเหลือ + ยอดตั้งต้น + โอน (`0028` · ครบวงจร)
**แนวคิด:** กระเป๋า 3 ใบ + ยอดตั้งต้น + คงเหลือคำนวณสด + การโอน · UI อยู่ใน `WalletsManager` + `WalletTransferSheet` — **ไม่มี route ใหม่**
- **`wallets.opening_balance` (numeric not null default 0 · `0028`) — ไม่ใช่การเอา `balance` ที่ DROP กลับมา:** `balance` เดิม = ยอดสะสมที่ต้องคอยอัปเดต = แหล่งความจริงซ้ำ · `opening_balance` = ค่าที่กรอกครั้งเดียว คงเหลือยังคำนวณจากรายการเสมอ · แก้ยอดตั้งต้นทีหลัง → คงเหลือขยับย้อนหลัง (ตั้งใจ)
- **สูตรคงเหลือใช้ `type` ดิบ** (`wallet_balances()` · INVOKER) — ห้าม predicate งบ (§4-14)
- **`wallet_transfers` เป็นตารางแยก ไม่ยัดลง `transactions`** — **แลกกับ: การโอนจงใจไม่โผล่ในหน้าประวัติ** — ชดเชยด้วยลิสต์ "ประวัติการโอน" (guard cap)
- **create โอน invalidate เฉพาะ `['wallets']` ไม่แตะ `['transactions']`**

### 11.9 ผู้ช่วย AI — แชทตอบคำถามการเงินจากข้อมูลผู้ใช้ (ครบวงจร · หลายใบต่อเนื่อง)
**แนวคิด:** ผู้ใช้ถามเรื่องเงินของตัวเองเป็นภาษาไทย ผู้ช่วยตอบจากข้อมูลจริงในแอปผ่าน tool อ่านอย่างเดียว · **ข้อมูลการเงินไหลออกไปประมวลผลที่ Anthropic (ต่างประเทศ) จริงเมื่อผู้ใช้ยินยอม** — จึงมีด่านความปลอดภัยหลายชั้น · แหล่งความจริง: `docs/ai-assistant-design.md` · โค้ด: `src/worker/*` (`ai.ts`/`anthropic.ts`/`tools.ts`/`categories.ts`/`rateLimit.ts`/`history.ts`) · `src/lib/aiChat.ts` · `src/lib/aiLimits.ts` · `src/hooks/useAiSettings.ts` · `src/pages/AiPage.tsx` · `src/components/AskAiButton.tsx` · `0029`/`0030`

**9 tool อ่านอย่างเดียว (`AI_TOOLS` ใน `tools.ts`):**
1. `wallet_balances` — คงเหลือแต่ละกระเป๋า (ไม่รับพารามิเตอร์)
2. `month_spending` — รับ/จ่ายรวม + รายการของเดือน (กรองหมวดได้ · รับ `period`/`offset`/`category`/`filter`) · **คืน `link` deep-link ไปหน้าประวัติ**
3. `home_summary` — สรุปเดือน (รับ `offset` เท่านั้น · ไม่มี `period`)
4. `stock_sales` — ยอดขายสต็อกของช่วง (`period`/`offset`)
5. `stock_intake` — รายการรับเข้าสต็อกของช่วง (`period`/`offset`)
6. `stale_stock` — ของค้าง/ทุนจม (ไม่รับพารามิเตอร์)
7. **`budget_status`** — งบต่อหมวดของเดือน (เพดานที่ผู้ใช้ตั้ง · รับ `offset`) · **คนละอย่างกับ `budget_spending`/`safe_to_spend`** — นี่คือ `budgets` table จริง
8. **`upcoming_bills`** — บิล recurring ที่ยังรอจ่ายในเดือนนี้ (ไม่รับพารามิเตอร์ · "ตอนนี้" เท่านั้น)
9. **`debts_summary`** — ยอดค้างเพื่อนระดับพาดหัว (ไม่รับพารามิเตอร์ · §11.6)

**ทำไมออกแบบแบบนี้ (เน้น "ทำไม"):**

- **ตัวตนมาจาก token เท่านั้น ห้ามรับจาก body · ห้าม `service_role`** — `ai.ts` verify JWT ด้วย `supabase.auth.getUser(token)` แล้วผูก consent + rate limit + ทุก tool กับ uid ที่ verify · client ถือ anon key + JWT → ทุก query ใต้ `auth.uid()` → **RLS เป็นด่านสุดท้าย** · **body อ่านได้แค่ `message` + `history`** (ไม่มีอะไรระบุตัวตน)
- **consent เก็บฝั่งเซิร์ฟเวอร์ (`ai_settings`) ไม่ใช่ localStorage · "ไม่มีแถว" = ไม่ยินยอม (403)** — flag client เชื่อไม่ได้ · จงใจไม่วางบน `profiles` (RLS เปิดให้เพื่อนเห็น → consent รั่ว) · **ไม่มี DELETE policy โดยตั้งใจ** (ลบ = ย้อนสถานะ "ยังไม่เคยเลือก" ซึ่งขัดเจตนา · เปลี่ยนใจใช้ `update consent=false`)
- **tool อ่านอย่างเดียว · ไม่มีพารามิเตอร์ระบุตัวตน · โมเดลส่ง offset ไม่ใช่วันที่** — ไม่มี tool ไหนเขียน/ลบ และไม่มีตัวไหนให้โมเดลระบุว่าอ่านข้อมูลของใคร · โมเดลส่ง `offset` int (0=เดือนนี้ -1=เดือนก่อน) worker แปลงเป็น `YYYY-MM` ด้วย `dates.ts` — "โมเดลเลือกเจตนา โค้ดคำนวณช่วง"
- **`period='all'` (ช่วงตั้งแต่เริ่มใช้)** — `month_spending`/`stock_sales`/`stock_intake` รับ `period` (`'month'`|`'all'`) เป็น **allowlist** (มีแค่ `'all'` เท่านั้นที่ opt-in · ค่าอื่น/หาย = `'month'`) · `'all'` → `month`/`month_label` = **null** (ห้ามปล่อยเป็นเดือนปัจจุบัน ไม่งั้นรายงานช่วงผิดทั้งที่ตัวเลขถูก จับไม่ได้) · `range_label = "ทั้งหมดตั้งแต่เริ่มใช้"` ให้โมเดลพูดช่วงถูก · ช่วงมาจาก `allTimeBounds`/`monthBoundsFromKey` (worker ไม่นับวันเอง) · **`home_summary` ไม่มี `period`** (เป็นภาพรวมรายเดือนล้วน)
- **worker ไม่ re-implement เงิน/วันเอง** — เรียก RPC (`transactions_search`/`stock_sales_summary`/`stock_intake_list`/`wallet_balances`/`friend_debts_summary`/`recurring_next_date`) หรือ pure function ของ `lib/` (`computeHomeSummary`/`computeSunkCost`/`isStale`/**`computePace`/`computePaceStatic`**/**`collectMonthOccurrences`**/`computeDebtsHeadline`) แล้วส่งตัวเลขผ่านตรง ๆ · `budget_status` ใช้ `isBudgetSpendingRow` (predicate เดียวกับหน้าแรก) หา spend ต่อหมวด **ห้าม re-mirror `.eq()` chain** · `resolveCategory` (สองชั้น: exact→fuzzy) แปลชื่อหมวดไทย→id ใต้ RLS · **กำกวม→ถามกลับ ไม่เดา** (คำตอบถูกตัวเลขแต่ผิดหมวด = ผิดที่ผู้ใช้จับไม่ได้)
- **multi-turn history (`AI-A`)** — body ส่ง `{message, history?}` · **Messages API เป็น stateless → ส่งประวัติทั้งชุดกลับทุก turn → cost โตตามความยาว** จึงมี **เพดานประวัติ (turns + chars) ใน `anthropic.ts`** (ค่าตัวเลขในไฟล์ ไม่คัดลอกมา) บังคับโดย `sanitizeHistory` (ตัดเก่าสุดก่อน) · **`history.ts` `parseHistory` เป็น ALLOWLIST เชิงโครงสร้าง** รับเฉพาะ `{role,text}` (string) · **ปฏิเสธ `tool_use`/`tool_result` ที่ client ปลอมได้** — ไม่งั้นผู้ใช้ยัด `tool_result` ปลอมพร้อมเลขแต่ง แล้วโมเดลนำเสนอราวกับมาจาก tool จริง (ทำลายกฎเดียวที่ทั้งฟีเจอร์ยืนอยู่) · malformed history = **400 ทั้งชุด** (client เราเองผิด ต้องเด้ง ไม่กลืน) · `ChatTurn` ประกาศที่ `lib/aiChat.ts` worker import type-only
- **model ยกเป็น sonnet (`AI-C`)** — ย้ายจากรุ่นถูกสุด (haiku tier) ไปรุ่นแม่นกว่า (sonnet tier) เพราะ **ทดสอบกับชุดข้อมูลที่รู้คำตอบล่วงหน้า (§11.10) แล้ว haiku พังกฎข้อ 1 ของ SYSTEM_PROMPT ซ้ำ ๆ**: แต่งเลขกำไรทั้งชีวิตที่ไม่มี tool ไหนคืน · อธิบาย "งบ ≠ headline" ผิด · ตอบคำถามรายหมวดด้วยการบวกทั้งเดือนเองแทนใช้ตัวกรองหมวด (อันตราย: under-report เงียบเมื่อเดือนเกิน row cap) — เป็น "ทำตามคำสั่งไม่ได้" ไม่ใช่ "ไม่ได้สั่ง" จึงแก้ด้วยโมเดลแม่นกว่า ไม่ใช่ prompt ยาวขึ้น · เปลี่ยนตัวแปรเดียว (แค่ model id) · **ชื่อรุ่นจริง + ราคาต่อ token อยู่ใน `anthropic.ts` ไม่คัดลอกมา** · การขึ้น sonnet + re-send history ทุก turn = cost โตสองแกน ยอมรับเพื่อคำตอบถูก "ถ้าคุณภาพนิ่งค่อยลดลง เป็นการตัดสินใจของเจ้าของ ไม่ใช่ default เงียบ"
- **เพดานค่าใช้จ่าย — อยู่ที่เดียวใน `anthropic.ts` (+ `aiLimits.ts`)** ครอบ: model id · max output tokens ต่อ call · loop cap ต่อ request (ยกขึ้นรอบก่อนเพราะ tool ชุดใหม่ทำคำถามผสมต้องวนหลายรอบ · ชนแล้ว **หยุด ไม่เรียกต่อ** คืน fallback) · per-call timeout · deadline รวมทั้ง request · เพดานประวัติ (turns/chars) · **`AI_MAX_QUESTION_CHARS` ใน `aiLimits.ts`** (ฝั่ง worker บังคับ 400 · ฝั่ง client ตัด `/ai?q=` ให้พอดี) · row cap ของ list tool · **ค่าตัวเลขทั้งหมดอยู่ในไฟล์ ไม่คัดลอกมาที่นี่** (หลักเดียวกับ hex) · ถ้าขาดตัวใดตัวหนึ่ง endpoint กลายเป็นบ่อเงินไม่มีเพดาน
- **rate limit ผูก uid ที่ verify แล้ว ไม่ใช่ IP** (`rateLimit.ts` · KV 2 หน้าต่าง นาที/วัน) · **KV ไม่ atomic → เพดานคลาดเกินได้ตามจำนวน request พร้อมกัน · ยอมรับโดยตั้งใจ** (คอมเมนต์ "Do NOT describe these caps as precise anywhere") · นับ**ก่อน**เรียก Anthropic · KV binding ขาด → 503 (fail closed)
- **deep link จากคำตอบ → หน้าประวัติ (`AI-5a`)** — `month_spending` คืน `link` เป็น path **root-relative** (`/history?m&cat&filter` · สร้างด้วย `URLSearchParams` · `period='all'` → `link=null` เพราะไม่มีเดือนเดียว) · `SYSTEM_PROMPT` สั่งโมเดลคัดลอกค่าจาก `link` มาปิดท้ายด้วยบรรทัดตายตัว `{{link:…}}` เป๊ะ ๆ ห้ามแต่ง URL เอง · `AiPage` `parseAssistantMessage` + `validateLinkPath` เป็น **ALLOWLIST** (`LINK_ROUTES`): ต้องขึ้นต้น `/` เดี่ยว (ไม่ใช่ `//host`) และ pathname ตรงคีย์ที่รู้จัก → เรนเดอร์เป็นปุ่ม react-router (ไม่ใช่ `<a href>`) · label อ่านจาก allowlist ไม่ใช่จากโมเดล (กัน reflect ข้อความผู้ใช้) · marker ที่เพี้ยน/นอก allowlist = ปล่อยเป็นข้อความดิบ ไม่กลายเป็นปุ่ม (raw syntax = สัญญาณว่าโดนฝ่าฝืน)
- **ทางเข้า `/ai?q=` + ปุ่มถามในหน้างบ/สต็อก (`AI-5b`)** — `AskAiButton` (ใน `BudgetPage`/`StockPage`) ลิงก์ `/ai?q=<คำถาม>` · `AiPage` seed ช่องพิมพ์จาก `?q` **ครั้งเดียวตอน mount แล้วหยุด — ไม่ยิงส่งเอง** (ทุก request คือเงินจริง + โควตา · ผู้ใช้ต้องกดส่งเอง) · `q` เป็น input ที่เชื่อไม่ได้ → ตัดด้วย `AI_MAX_QUESTION_CHARS`
- **`hideBalance` กับแชท — เคาะแล้ว 2 ระดับ (ใบ 7 · §11.4-11 "ซ่อนตอนกวาดตา เปิดตอนตัดสินใจ"):** (1) **รอบปัจจุบัน (เพิ่งถาม-ตอบ) ตอบเลขจริง ไม่ปิด** — การถามคือการตัดสินใจ · (2) **ข้อความที่โหลดกลับจากที่เก็บ → ปิดทั้งฟอง แตะเผยทีละฟอง** — เปิดแอปมาเจอแชทเก่าเต็มไปด้วยเลขคือกวาดตาที่ผู้ใช้ไม่ได้ตั้งใจ · **ห้าม mask เลขทีละตัวในข้อความ ต้องปิดทั้งฟอง** — การหาว่าส่วนไหนของข้อความเป็นตัวเลขเงินคือการเดา เดาพลาดครั้งเดียวก็รั่ว · `AiPage` ยังไม่รับ prop ใด ๆ → อ่าน `hideBalance` จาก `prefs.ts` เอง (ส่ง prop เข้าไม่ได้เชิงโครงสร้าง)
- **ประวัติแชท persist ข้ามรีโหลด (ใบ 7) — เก็บ `localStorage` ไม่ใช่ DB (คำตัดสิน):** ประวัติแชทเป็น**ความสะดวก ไม่ใช่กลไกความปลอดภัย** จึงต่างจาก `ai_settings` (consent) ที่ต้องอยู่เซิร์ฟเวอร์เพราะ flag ฝั่ง client เชื่อไม่ได้ · เก็บลง DB = ตารางใหม่ + RLS + ข้อมูลการเงินพักถาวรบนเซิร์ฟเวอร์ แลก "อ่านข้ามเครื่อง" ที่ผู้ใช้กลุ่มนี้แทบไม่ต้องการ — ไม่คุ้ม **ไม่มี migration ในใบนี้** · `AiPage` โหลดตอน mount / เขียนกลับเมื่อเปลี่ยน ผ่าน `prefs.ts` (คีย์ `stash.ai.chat` · เพดาน `CHAT_HISTORY_MAX` เกิน→ทิ้งเก่าก่อน · JSON พัง/รูปร่างผิด→คืนว่างไม่ throw · เก็บเฉพาะ `{role,text}`) · **เขียนเฉพาะเมื่อ consent='on'** · **ล้างเมื่อ sign-out (`useAuth`) และปิด consent (`SettingsPage`)** — บัญชีเจ้าของสร้างเอง ใช้เครื่องเดียวกันได้ ไม่ล้าง = คนถัดไปเห็นแชทการเงินคนก่อน · มีปุ่มล้างประวัติในหัวข้อ · **ตอนส่งยังแนบ transcript ก่อนหน้า (multi-turn) map ทีละ field เป็น `ChatTurn[]`** (flag `persisted` เป็น render-hint ในหน่วยความจำล้วน ไม่ขึ้น wire/ดิสก์) · token อ่านสดจาก session ไม่ cache · กันกดซ้ำ (disabled + guard `pending`) · error ถึงผู้ใช้ผ่าน `translateError` — คำถามคาไว้ใน transcript ให้เห็นว่าอะไรล้ม
- **ทางเข้า consent:** สวิตช์ "ใช้ผู้ช่วย AI" ในตั้งค่า (`ConsentExplainer` อธิบายเต็มก่อนกดครั้งแรก · toggle await write+refetch ไม่ optimistic) · `AiPage` redirect ผู้ที่ consent ≠ 'on' กลับ `/settings` (fail closed)

**ความเสี่ยงที่เหลือ — เขียนตรง ๆ:**
- **ข้อมูลเงินไหลออกไป Anthropic จริงเมื่อยินยอม** — คำถาม + ตัวเลขที่เกี่ยวข้อง + **ประวัติสนทนา** ถูกส่งไปประมวลผลต่างประเทศ
- **ส่งไปแล้วเรียกคืนไม่ได้** — `ConsentExplainer` บอกข้อนี้ตรง ๆ ห้ามตัดออกเพราะดูน่ากลัว
- **โมเดลยังตอบผิดได้** — system prompt สั่งพูดเฉพาะตัวเลขจาก tool แต่ไม่การันตี (นี่คือเหตุผลของชุดข้อมูลทดสอบ §11.10)
- **token ขยะยังกิน quota Supabase Auth ได้** — request ที่ token เพี้ยนยังเรียก `auth.getUser` (นับก่อนถึง rate limit ของเรา)

### 11.10 ชุดข้อมูลทดสอบที่รู้คำตอบล่วงหน้า (known-answer test data)
**แนวคิด:** สร้างข้อมูลการเงิน **4 เดือน ที่ทุกค่าเขียนตายตัว (ไม่สุ่ม)** ให้ทุกใบปรับแต่ง AI มีฐานเทียบเดียวกัน — AI ตอบเลขมาปุ๊บรู้ทันทีถูก/ผิด (แหล่งที่จับ "โมเดลแต่งเลข" ได้ตั้งแต่ครั้งแรก · §9) · **ไม่ใช่ migration — ห้ามย้ายไป `supabase/migrations/` ห้าม insert `schema_migrations`** · เจ้าของรันมือใน SQL Editor

**ไฟล์ (`supabase/seeds/` 3 + `docs/testing/` 2):**
| ไฟล์ | ทำอะไร | รันในฐานะ |
|---|---|---|
| `supabase/seeds/reset_test_data.sql` | ล้างข้อมูลที่ user สร้างของ 2 บัญชี (ไม่แตะโครงบัญชี) | **owner** (bypass RLS เพื่อลบ debts/stock_sales ที่ไม่มี delete policy) |
| `supabase/seeds/seed_test_data.sql` | เติมข้อมูล 4 เดือน ครอบ 12 เคส | **impersonate** (RPC INVOKER ต้องมี `auth.uid()`) |
| `supabase/seeds/verify_test_data.sql` | query ค่าจริงผ่าน RPC เทียบค่าคาดหวัง → เก็บทุก assert ลง temp table แล้ว SELECT → **`PROVEN 28/28`** | **impersonate** |
| `docs/testing/expected-answers.md` | ตาราง "ถามข้อนี้ → ต้องได้เลขนี้" สำหรับทดสอบ AI ด้วยมือ (แยก กลุ่ม ก คงที่ / กลุ่ม ข ขึ้นกับวันรัน) | — |
| `docs/testing/ai-test-battery.md` | ชุดคำถามทดสอบผู้ช่วย AI | — |

- **28 assert** = 19 (ยอดรวม/คงเหลือ/ยอดค้าง) + 8 (จ่ายแยกหมวด เดือน −1/−2 ผ่าน `p_category_id` จริง) + 1 (null-check "ไม่มี `category_id` null") · assert รายหมวด + null-check เพิ่มเพื่อจับ seed ที่ lookup หมวดไม่เจอแล้ว insert หมวดว่างเงียบ ๆ (บั๊กที่ผลรวมยังถูกจึงมองไม่เห็น · §9)
- **เคสตัวอย่างที่จับบั๊กได้:** กำไรสุทธิเดือน −2 = **950** (รายได้ 3,950 − COGS 3,000 · มีขายขาดทุน 1 รายการรวมอยู่) — AI เคยตอบ **8,000** ที่ไม่มา่จาก tool ใด · เดือน −2 จ่าย headline **9,000** แต่ยอดในงบ **6,000** (COGS 3,000 นับ headline ไม่นับงบ) — ถ้า AI ตอบเท่ากัน = บั๊ก

**ข้อจำกัด (เขียนไว้ตรง ๆ ในหัวไฟล์ · อย่าลืม):**
- **ต้อง `seed` แล้ว `verify` ในเดือนเดียวกัน** — ยอดที่แบ่งตามเดือน −1/−2/−3 จะเลื่อนถ้าข้ามเดือน (คงเหลือกระเป๋าไม่สนใจเดือน)
- **`seed` ต้องรันในวันที่ ≥ 5 ของเดือน** (สคริปต์ raise ถ้าไม่ใช่ — วางรายการวันที่ 1–4 ได้โดยไม่มีรายการวันอนาคต)
- **เดือนปัจจุบันขยับเอง** เพราะ `recurring_run_due` (จ่าย/ยอดในงบของ offset 0 จึงไป "กลุ่ม ข" เขียนเป็นสูตร ไม่ hardcode · §9) · ค่ากลุ่ม ข อื่น (`days_left`/`daily_allowance`/`oldest_in_stock_days`) ก็ขึ้นกับวันรัน
- **uid ต้องเจ้าของกรอกเองบนหัวไฟล์** (`v_me`/`v_friend` จาก `select id from auth.users`) — **ห้ามเทียบกับค่าตัวอย่าง** (พังเมื่อ find-replace ทั้งไฟล์ · §9) · DB มีหลายบัญชี ห้ามให้สคริปต์เดา (`limit 1`)
- **verify ไม่พิสูจน์ได้ทุกอย่าง:** "คำตอบเป็นบทสนทนา/ถูกบริบทไหม" (output โมเดลไม่ deterministic) ต้องเจ้าของลองเอง · "PROVEN" = ข้อมูลถูก ไม่ใช่ "AI ตอบถูก"

---

## 12. คำสั่งตรวจตัวเลขในไฟล์นี้ (ให้เจ้าของรันซ้ำได้)

ทุกตัวเลข/รายชื่อในเอกสารนี้มาจากคำสั่งเหล่านี้ รันบน main `9e96817` รอบนี้ (เก็บแต่ค่าปัจจุบัน — ไม่เก็บคอลัมน์ "ฉบับก่อนบอก" อีกต่อไป เพราะคอลัมน์นั้นคือพิพิธภัณฑ์เลขเก่าที่ทำให้เอกสารคลาด):

| อ้างที่ | คำสั่ง | ผล (รอบนี้) |
|---|---|---|
| main sha (หัวไฟล์) | `git rev-parse --short HEAD` | `9e96817` |
| migration ล่าสุด (§10) | `ls supabase/migrations/*.sql \| wc -l` | **30** (`0030_stock_intake_list.sql`) |
| 16 ตาราง (§3) | นับ block `public.Tables` ใน `database.types.ts` | **16** |
| 29 RPC (§6) | นับ key ใน block `public.Functions` | **29** |
| 8 enum | นับ block `public.Enums` | **8** (`category_kind`/`debt_status`/`debt_visibility`/`friend_status`/`item_condition`/`stock_status`/`transaction_type`/`wallet_type` — ไม่มี enum ใหม่ของ AI) |
| ไฟล์เทสต์ (§10) | `find src \( -name '*.test.ts' -o -name '*.test.tsx' \) \| wc -l` | **72 ไฟล์** |
| visual guard (§10) | `find src -name '*.visual.test.*' \| wc -l` | **13 ไฟล์** |
| เคสเทสต์ (เครื่องเปล่า · รันจริง) | `npm test` | **`Tests 638 passed \| 15 skipped (653)`** · **Test Files 72 passed (72)** (15 skip = visual guard นอก CI) |
| เคสเทสต์ (มี Chromium) | `CHROMIUM_EXECUTABLE=… npm test` | **ยังไม่ได้ตรวจรอบนี้** (ไม่มี Chromium ในเครื่อง · คาด `653 passed \| 0`) |
| build เขียว | `npm run build` | **ผ่าน** (`tsc -b && vite build` · PWA precache **22 entries**) |
| 14 หน้า / 15 route (§10) | `find src/pages -name '*Page.tsx' \| wc -l` · อ่าน `router.tsx` | **14 หน้า + catch-all = 15 route** |
| bottom nav slots (§10) | อ่าน `AppLayout.tsx` | **5 ช่อง** (ปุ่ม "ถาม AI" เป็น pill ลอย ไม่ใช่ช่อง) |
| จำนวน tool AI (§11.9) | นับ `AI_TOOLS` ใน `worker/tools.ts` | **9 tool** (เพิ่ม `budget_status`/`upcoming_bills`/`debts_summary`) |
| worker import lib อะไร (§3) | `grep -rhoE "from '\.\./lib/[a-z]+'" src/worker` | `dates`/`format`/`ledger`/`homeSummary`/`stockAge`/`debtsSummary`/`budgetPace`/`upcomingBills`/`aiLimits`/`aiChat` |
| worker ใช้ `@/` ไหม (§8-24) | `grep -rn '@/' src/worker` | ว่าง — ทุก import เป็น `../lib/…` |
| seed reproduce ล่าสุด (§7) | `grep -rl 'create or replace function public.seed_defaults_internal' supabase/migrations \| sort \| tail -1` | `0026_shop_categories.sql` |
| หนี้ ใน src (§8-19) | `grep -rln 'หนี้' src` | `worker/anthropic.ts` (SYSTEM_PROMPT สั่งห้าม) + `lib/budgetable.ts` (+`.test`) |
| คำต้องห้าม ใน migrations RAISE (§10) | `grep -rniE 'raise exception' supabase/migrations \| grep -E 'หนี้\|เจ้าหนี้\|ลูกหนี้' \| wc -l` | **16 จุด** (`0015`×12 · `0018`×1 · `0019`×3) |
| friend_code อ่านใน src? (§10) | `grep -rn friend_code src` | คอมเมนต์ `ProfileManager` ("gone") + `database.types.ts` เท่านั้น |
| ชุดข้อมูลทดสอบ (§11.10) | `ls supabase/seeds docs/testing` | seeds: reset/seed/verify + README · testing: `expected-answers.md` + `ai-test-battery.md` · verify → **PROVEN 28/28** |

> **ยังไม่ได้ตรวจในรอบนี้ (บันทึกตรง ๆ):**
> - **schema จริงบน DB** — AI ต่อ DB ไม่ได้ · แหล่งความจริงคือ `database.types.ts` · **smoke test `0029`/`0030` + verify ของชุดข้อมูลทดสอบ ต้องเจ้าของรันเองใน SQL Editor** (เช่นเดียวกับ `transactions_search`/`0022`)
> - **การเชื่อมต่อ Anthropic จริง + KV จริง** — พิสูจน์ได้แค่ผ่านเทสต์ (`ai.test.ts`/`tools.test.ts`/`history.test.ts` ใช้ stub) ไม่ได้ยิงของจริง · **`wrangler deploy --dry-run` ไม่ได้รันรอบนี้** (ใบนี้ไม่แตะ worker)
> - **production URL ที่แน่นอน** — ไม่ pin ในไฟล์ repo
> - **`vite.config.ts`, `src/worker/security.ts`, `json.ts`** — ไม่ได้อ่านทุกบรรทัดรอบนี้ (ไม่อยู่ในชุดที่เปลี่ยน)
> - **§7 นับหมวด seed 18 · §11.1–11.8 · §11.4 ข้อ 15–43** — ยืนยันโครง/ชื่อไฟล์จากการอ่านรอบนี้ แต่ไม่ได้อ่านทุกบรรทัดของทุก component; จุดที่ AI มาแตะ (RPC/lib ที่ tool เรียก) ตรวจจากไฟล์จริงแล้ว
> - **คอมเมนต์ค้างที่พบ (จดไว้ ไม่แก้ — นอกขอบเขตใบนี้):** หัว `router.tsx` "10 screens" (จริง 14 หน้า) · คอมเมนต์ workbox ใน `vite.config.ts` เรื่อง offline queue · คอมเมนต์ `lib/budgetable.ts` อ้าง "จ่ายชำระหนี้" (ปัจจุบัน "จ่ายคืนเพื่อน") · comment/EXAMPLES ใน `AiPage` ยังอ้าง "tools ใน PR-2b (5 ตัว)" ทั้งที่มี 9 tool
