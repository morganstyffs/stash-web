# STASH — Project Context

> บริบทถาวรของโปรเจกต์ ใช้แทนการอ่าน `docs/PROJECT_AUDIT.md` ฉบับเต็มในงานประจำวัน
>
> **ประกอบใหม่ทั้งฉบับ ไม่ใช่แพตช์ทีละจุด** — การแพตช์ทีละบรรทัดคือกลไกที่ทำให้เอกสารคลาดจากของจริงมาทุกรอบ (เคยค้างที่ migration `0021` ทั้งที่ถึง `0024` แล้ว · เคยค้างที่ 254 เทสต์ ทั้งที่ 300+ · **รอบก่อนยังเขียนว่าฟีเจอร์ AI เป็น "โครงเปล่า `worker/ai.ts` stub" ทั้งที่ AI ใช้งานได้ครบวงจรแล้ว**) — ทุกประโยคในไฟล์นี้มาจากการอ่านไฟล์จริงในรอบนี้ ไม่ได้คัดลอกจากฉบับเดิม
> **กติกาการใช้:** ทุกข้อความควรชี้กลับไปที่ไฟล์จริงได้ จุดไหนยังไม่ได้ตรวจจะเขียนว่า "ยังไม่ได้ตรวจ" ตรง ๆ ไม่เดา · **ค่าสี hex · เลขเรขาคณิตของฮีโร่ · ค่าเพดานของ AI ไม่คัดลอกมาไว้ที่นี่** — อ่านจากไฟล์แหล่งความจริง (เอกสารชี้ไปที่แหล่งความจริง ไม่กลายเป็นแหล่งที่สอง)
> **ตัวเลขทุกตัวนับใหม่ในรอบนี้** จากคำสั่งที่รันจริง (ดู §12 ท้ายไฟล์)
> **ตรวจล่าสุดเทียบ repo จริง:** main `de0c6e4` — **รอบนี้เพิ่มฟีเจอร์ผู้ช่วย AI ครบวงจร (8 PR: PR-0 · PR-1a/1b · PR-2a/2b · PR-3 · PR-4 · PR-5)** + types-drift อีกใบ · migration ล่าสุด **`0030`**
> **ชั้น DB ขยับ 2 ก้าวรอบนี้:** `0029` (`ai_settings` — consent) + `0030` (`stock_intake_list` — RPC อ่านอย่างเดียวให้ AI) · ที่เหลือทั้งหมดเป็น **worker (`src/worker/`) + client** (§12)

---

## 1. โปรเจกต์นี้คืออะไร

PWA บันทึกรายรับ-รายจ่ายส่วนตัว ที่มี **กึ่งระบบสต็อกสินค้า** (เสื้อผ้า/ของมือสอง ขายต่อ) + ระบบ **ยอดค้างกับเพื่อน** + **กระเป๋าเงินหลายใบ** + **ผู้ช่วย AI ตอบคำถามการเงิน** รวมอยู่ในแอปเดียว (`package.json` description · `router.tsx`)

- **ผู้ใช้:** เจ้าของ + เพื่อนไม่กี่คน · **ต่างคนต่างขายของตัวเอง ไม่แชร์คลัง** · "ยอดค้าง" เป็นฟีเจอร์ cross-user ตัวเดียวในแอป
- **ภาษา:** ไทย (`index.html` `lang="th"`) · **สกุลเงิน:** THB (`lib/format.ts` `Intl.NumberFormat('th-TH')`) · **เขตเวลา:** Asia/Bangkok
- **เขตเวลาเป็นข้อจำกัดทั้งแอป:** ทั้ง client (`lib/dates.ts` `APP_TZ='Asia/Bangkok'`) และ DB (`0010`: `(now() at time zone 'Asia/Bangkok')::date`) เคาะ "วันนี้/เดือนนี้" เป็นเวลาไทยเสมอ ไม่ใช่ timezone ของเครื่อง — **RPC ใหม่ `stock_intake_list` (`0030`) ก็เทียบ `created_at at time zone 'Asia/Bangkok'` ก่อนกรองเดือน** ตามกฎเดียวกัน
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
- **`tsc -b` เขียว ≠ deploy ได้** — worker bundle ด้วย esbuild ของ wrangler (ไม่ใช่ Vite ไม่ใช่ tsc) → **พิสูจน์ worker ด้วย `wrangler deploy --dry-run`** (§9 · บทเรียนรอบนี้)
- **merged ≠ deployed ≠ สิ่งที่เบราว์เซอร์รันอยู่** — ก่อนไล่บั๊กหน้าจอทุกครั้ง อ่าน version stamp ท้ายหน้าตั้งค่าก่อน (§9 · §10)
- **`refetchOnWindowFocus: true`** (`src/App.tsx`) — PWA ที่ค้าง background กลับมาต้องเห็นตัวเลขสด · **ผลข้างเคียง:** effect ที่ seed ฟอร์มจากผลของ query **ต้องผูกกับ `id` ไม่ใช่ object** ไม่งั้น window blur→focus (native date/file picker) จะ refetch → object ใหม่ → effect ทับสิ่งที่ผู้ใช้พิมพ์ค้าง (§11.4-17)
- **ตัวแปร runtime ฝั่ง Cloudflare ที่ฟีเจอร์ AI ต้องใช้** (จาก `src/worker/index.ts` `Env` · ตั้งใน dashboard/`wrangler secret`, **ไม่อยู่ใน `wrangler.jsonc`, ห้ามขึ้นต้น `VITE_`**): `SUPABASE_URL` · `SUPABASE_ANON_KEY` (ใช้ verify JWT + query ใต้ RLS) · `ANTHROPIC_API_KEY` (server secret ล้วน) · KV binding `AI_RATE_LIMIT` (อยู่ใน `wrangler.jsonc`)

### 2.1 GitHub workflows (`.github/workflows/` — 2 ไฟล์)

| ไฟล์ | trigger | ทำอะไร | secret |
|---|---|---|---|
| `ci.yml` | push→`main` + ทุก PR | Node 22 · `npm ci` → `npm run build` → `npx playwright-core install --with-deps chromium` → `npm test` (`vitest run`) · **ไม่ deploy** · ขั้น chromium มีเพื่อให้ guard เบราว์เซอร์จริงรันได้จริงใน CI (ไม่ skip) | **ไม่ใช้ secret** — เทสต์ใช้ dummy Supabase env จาก `vitest.config.ts` |
| `types-drift.yml` | cron รายวัน + `workflow_dispatch` | `supabase gen types` เทียบกับ `database.types.ts` · ต่างเมื่อไร → เปิด/อัปเดต PR branch เดียว `automation/database-types-drift` (label `types-drift`) · เหมือน → เงียบ · **ไม่แตะ `main` ตรง ๆ** | `SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_ID` · optional `GH_PAT` |

> **ทำไมต้องมี `types-drift`:** เจ้าของไม่มีเครื่อง dev → regen จาก dashboard แล้ว paste มือทุกครั้ง · พลาดเมื่อไรฐานข้อมูลกับ repo แยกกันเงียบ ๆ (เกิดจริงกับ `0015`) · workflow นี้ปิดช่องนั้น (หัวไฟล์ `types-drift.yml`)
> **ลำดับที่ถูกเมื่อ migration เปลี่ยน signature ของ RPC ที่ client เรียก:** ห้าม merge PR `types-drift` เดี่ยว — types ใหม่ไม่ตรง call site → `tsc` ล้ม → main แดง · ดึงไฟล์เข้า branch ฟีเจอร์แล้ว merge ทีเดียวพร้อม call site (`0020` พลาดข้อนี้ · §9)
> **ข้อยกเว้น:** ถ้า migration ใหม่ **ยังไม่มี call site ฝั่ง client** types-drift merge เดี่ยวได้ปลอดภัย — แต่ถ้าการเพิ่มคอลัมน์ทำให้ **fixture/โค้ดเดิมพัง** ต้องดึง types เข้า branch แล้ว merge พร้อมการแก้ทีเดียว (types + fixture ต้องลง atomic)
> **หนี้ที่รู้ตัว (§10):** PR ของ `types-drift` เปิดด้วย `${{ secrets.GH_PAT || secrets.GITHUB_TOKEN }}` (`types-drift.yml` บรรทัด 114) · **ถ้า `GH_PAT` ไม่ได้ตั้ง จะ fallback เป็น `GITHUB_TOKEN` ซึ่ง trigger `ci.yml` ต่อไม่ได้** (หัวไฟล์เขียนเอง: "default GITHUB_TOKEN can't trigger ci.yml, so you'd re-run CI manually") — PR types-drift ล่าสุด (`d65bd5c` merge #145) เข้า main ได้ · **`GH_PAT` ยังไม่ตั้ง = ช่องนี้ยังเปิดอยู่** (บันทึกใน §10)

---

## 3. โครงสร้างชั้นข้อมูล

```
DB (tables + RPC + trigger)  →  lib/ (pure function)  →  hooks/ (TanStack Query)  →  UI (pages/ + components/)
                                    ↑
              worker/ (Cloudflare) เรียก RPC + import pure function ของ lib/ ตรง ๆ (ไม่ผ่าน hooks/React)
```

ตรรกะที่แตะเงินอยู่ใน **SQL** หรือใน **pure function ของ `lib/`** เท่านั้น **ห้าม inline ใน component** · `lib/` เดินทางเดียว **ห้าม import จาก `hooks/`/`pages/`** — รับ "รูปร่างขั้นต่ำ" structural แทน (มีคอมเมนต์กำกับที่หัวไฟล์ · convention 11/12)
> **รอบนี้ `lib/` มีผู้บริโภคใหม่ที่ไม่ใช่ React: `src/worker/`** — `homeSummary.ts` + `stockAge.ts` ถูก**ย้ายจาก `useHome` hook / `StockPage`** เข้ามาที่ `lib/` (PR-2a) เพื่อให้ worker import ได้ (คอมเมนต์หัวไฟล์เขียนเอง: "Lives in `lib/` … so a non-React caller — the AI worker — can import it too") · นี่คือเหตุผลตรง ๆ ว่าทำไมกฎ "lib/ เดินทางเดียว" ถึงสำคัญขึ้นอีก

**ไฟล์ `lib/` ที่ต้องรู้จัก (จากการอ่านจริงรอบนี้):**

| ไฟล์ | หน้าที่ |
|---|---|
| `src/lib/database.types.ts` | **generated — ห้ามแก้มือ** · แหล่งความจริงของ schema ที่ agent อ่านได้ |
| `src/lib/db.ts` | type alias ระดับแอป derive จาก generated · มี `WalletBalance` (จาก `wallet_balances` Returns) · `WalletTransfer` · **`AiSettings` = `Tables<'ai_settings'>` (ใหม่รอบนี้ · `0029`)** |
| `src/lib/ledger.ts` | predicate กลางจำแนกแถว: `isSpendingRow`/`isBudgetSpendingRow`/`isIncomeRow` (ตัด `is_stock_cogs`/`is_debt_settlement`/`is_shop_operating`) + `lockedRowInfo()` (§5) · **กระเป๋าเงิน (§4-14) ไม่ใช้ predicate พวกนี้ — ใช้ `type` ดิบ** |
| `src/lib/homeSummary.ts` | **ย้ายเข้า `lib/` รอบนี้ (PR-2a)** · `computeHomeSummary(rows, cats, month, now)` — aggregate หน้าแรกทั้งหมด (income/expense headline/budgetSpending/safeToSpend/daysLeft/dailyAllowance/donut) · **worker `home_summary` tool เรียกตัวนี้ตรง ๆ** · รับ `HomeSummaryRow` structural |
| `src/lib/stockAge.ts` | **ย้ายเข้า `lib/` รอบนี้ (PR-2a)** · `AGE_FRESH_MAX=30`/`AGE_OLD_MAX=60` (เกณฑ์อายุที่เดียว) · `inStock`/`isStale`/`computeSunkCost`/`daysSince` · **คอมเมนต์ยอมรับเองว่า `AGE_OLD_MAX` เป็นค่าเดา** ("educated guess for second-hand clothing, not measured") · **worker `stale_stock` tool เรียกตัวนี้** (ห้าม hardcode 60 ซ้ำ) |
| `src/lib/budgetable.ts` | `isBudgetableCategory()` — ตั้งงบได้เฉพาะ `kind==='expense' && !is_system && !is_shop_category && !is_stock_category` · ใช้ทั้งหน้างบและแถบ "งบที่ตั้งไว้" หน้าแรก (§11.4-35) · **คอมเมนต์ยังอ้างชื่อหมวด "จ่ายชำระหนี้" (ชื่อ seed ปัจจุบันคือ "จ่ายคืนเพื่อน" ตั้งแต่ `0017`) — คอมเมนต์ค้าง จดไว้ ไม่แก้ (§10)** |
| `src/lib/budgetNote.ts` | ถ้อยคำบรรทัดรองหน้างบที่เดียว · รับ `money` ฉีดเข้ามาเพื่อ mask ตาม `hideBalance` |
| `src/lib/shopAccount.ts` | `computeShopProfit()` — สูตร P&L ร้าน (ถังที่ 1 − ถังที่ 2) ที่เดียว (§4) |
| `src/lib/shopCategory.ts` | resolve หมวดร้านฝั่งรายรับด้วย `kind + is_shop_category` (ไม่มี `system_key`) |
| `src/lib/spendable.ts` | `computeSpendable(safe, bills, daysLeft)` — บรรทัดรอง SAFE · ไม่ clamp เงียบ |
| `src/lib/debtsSummary.ts` | `computeDebtsHeadline` (อ่าน `shared_net`) + `computeFriendLedger` (แยก agreed/private) (§11.6) |
| `src/lib/format.ts` | `formatBaht`/`formatBaht2`/`MASKED_BAHT`/`formatDueDate`/`sanitizeMoneyInput()` (กรองอินพุตเงินที่เดียว) |
| `src/lib/aiChat.ts` | **ใหม่รอบนี้ (PR-5)** · ฝั่ง client ของ `POST /api/ai` · `askAssistant(question, token)` คืน reply · โยน `AiHttpError{status, message}` → `translateError` map ตาม **status ไม่ใช่ substring** (§11.9) |
| `src/lib/prefs.ts` | localStorage ทั้งหมด (`stash.*` คีย์เดียว) · `hideBalance`/`stockView`/`homeMoments` · **`AiPrefs.assistant` = vestigial ไม่มีใครอ่าน** (consent ย้ายไปเซิร์ฟเวอร์แล้ว · คอมเมนต์เขียนเอง "nothing reads it today") · `AiPrefs.autoCategory` ยังอ่านอยู่ในหน้าตั้งค่า |
| `src/lib/sku.ts` | normalize/validate **prefix** เท่านั้น (`^[A-Z0-9]{3}$`) — สูตรอยู่ที่ RPC `stock_sku_build` |
| `src/lib/username.ts` | กติกา username (`^[a-z0-9_]{3,20}$`) mirror CHECK ใน DB (`0020`) |
| `src/lib/dates.ts` | helper วันที่/เดือนกลาง (Asia/Bangkok) · **"เดือน" = string `YYYY-MM`** · `monthKey`/`addMonthsToKey`/`monthBoundsFromKey`/`daysLeftInMonthKey`/`daysSince` — **worker `tools.ts` เรียกชุดนี้แปลง offset→เดือน** |
| `src/lib/catColor.ts` | `catColorVar(index)` — slot 1–6 → CSS var **ที่เดียวที่แปลง index→สี** (ไม่มี hex) |
| `src/lib/percent.ts` | `largestRemainderPercents()` — % รวม 100 พอดี (Hamilton) |
| `src/lib/errors.ts` | `translateError()` → ข้อความไทยที่เดียว · จับด้วย `code`/`status` ไม่จับ substring · **ข้อความที่มีอักษรไทยอยู่แล้วส่งผ่านตรง ๆ** — นี่คือเหตุผลที่ทั้ง RAISE ภาษาไทยใน RPC และข้อความไทยจาก worker AI ถึงผู้ใช้ตรง ๆ (§10 · §11.9) |
| `src/lib/txCache.ts` / `txRestore.ts` | เติมแถวที่เพิ่ง insert ลง cache / payload คืนแถวที่ลบ · pure · structural |
| `src/lib/offlineQueue.ts` | write-outbox บน IndexedDB — **ไม่มีไฟล์ไหน import (dead code)** ยืนยัน grep รอบนี้ (§10) |
| `src/lib/useDialogA11y.ts` | โฟกัส/คีย์บอร์ดชีตกลาง · `onClose` ขี่ ref ไม่เป็น dependency ของ effect (กันบั๊ก caret หลุด · §9) |
| `src/lib/visual-contrast.ts` | helper วัด contrast ที่ compute จริงในเบราว์เซอร์ (ใช้โดย visual guard) |

**`src/worker/` (Cloudflare Worker · typecheck ด้วย `tsconfig.worker.json` · bundle ด้วย esbuild ของ wrangler):** ดูรายละเอียดเต็มใน §11.9

| ไฟล์ | หน้าที่ |
|---|---|
| `index.ts` | fetch เดียว · `/api/ai` → `handleAi`, `/api/*` อื่น → 404 JSON, ที่เหลือ → `env.ASSETS` · หุ้มทุก response ด้วย `withSecurityHeaders` · ประกาศ `Env` (ASSETS/ANTHROPIC_API_KEY/SUPABASE_URL/SUPABASE_ANON_KEY/AI_RATE_LIMIT) |
| `ai.ts` | `handleAi` — ด่าน 4 ชั้นตามลำดับ **verify token → consent → rate limit → Anthropic** (ห้ามสลับ) · ตัวตนจาก token เท่านั้น · anon key + RLS · ไม่มี service_role |
| `anthropic.ts` | เรียก Anthropic Messages API + tool loop · **ที่เดียวที่ใช้ `ANTHROPIC_API_KEY`** · SYSTEM_PROMPT + **เพดานค่าใช้จ่าย 5 ตัว** (ค่าตัวเลขอยู่ในไฟล์นี้ ไม่คัดลอกมาที่นี่) |
| `tools.ts` | 6 tool อ่านอย่างเดียว (`AI_TOOLS`) + `runTool` เรียก RPC/lib ใต้ JWT ผู้ใช้ · โมเดลส่ง `offset` ไม่ใช่วันที่ |
| `categories.ts` | `resolveCategory` — แปลชื่อหมวดไทย→id ใต้ RLS · กำกวม→ถามกลับ ไม่เดา |
| `rateLimit.ts` | `checkRateLimit(kv, uid, now)` — KV counter 2 หน้าต่าง (นาที/วัน) ผูก uid ที่ verify แล้ว · **ไม่ atomic โดยยอมรับ** |
| `security.ts` | HTTP security headers (CSP `default-src 'self'` ฯลฯ) — **ไฟล์เดิม ไม่เปลี่ยนรอบนี้ (mtime เก่ากว่าไฟล์ AI)** |
| `json.ts` | helper `json(body, status)` — ไฟล์เดิม |

**16 ตาราง** (นับจาก block `public.Tables` ใน `database.types.ts` รอบนี้ = 16 · **+1 จากรอบก่อน: `ai_settings`**):
`ai_settings` `budgets` `categories` `debt_events` `debts` `favorites` `friend_connections` `profiles` `recurring` `schema_migrations` `stock_items` `stock_sales` `stock_sku_config` `transactions` `wallet_transfers` `wallets`

- ทุกตาราง RLS เปิด + policy owner-only บน `auth.uid() = user_id` (`0001`) — **ยกเว้น 2 กลุ่ม:**
  - `schema_migrations` (`0011`): RLS เปิด · **0 policy** · revoke สิทธิ์ anon/authenticated (ตั้งใจ)
  - **กลุ่มยอดค้าง** `debts`/`debt_events`/`friend_connections`/`profiles` (`0015`): RLS **select-only** (เห็นได้เมื่อเป็นคู่กรณี/เพื่อน) + **เขียนผ่าน SECURITY DEFINER RPC ที่ re-check `auth.uid()` เอง** (§6 · §11.6)
- **`ai_settings` (`0029`) เป็น single-owner ล้วน** — `user_id` PK `default auth.uid()` · RLS มี **select/insert/update owner-only** แต่ **ไม่มี delete policy โดยตั้งใจ** (§11.9) · ไม่แตะโมเดล DEFINER ของกลุ่มยอดค้าง (ไม่มี cross-user) · **จงใจไม่วางไว้บน `profiles`** เพราะ RLS ของ `profiles` เปิดให้เพื่อนที่ accepted เห็นแถวเรา → consent จะรั่ว (หัวไฟล์ `0029` §11.9)
- **`wallet_transfers` (`0028`) เป็น single-owner** — RLS owner-only **CRUD ครบ** · FK → `wallets` **`on delete restrict`**

---

## 4. กฎธุรกิจ — เงิน (สำคัญที่สุดในไฟล์)

ที่มา: `lib/ledger.ts` · `lib/homeSummary.ts` · `lib/shopAccount.ts` · `0012` (ขาย) · `0015` (ยอดค้าง) · `0026` (หมวดร้าน) · `0028` (กระเป๋าเงิน)
> **กฎในหมวดนี้ตอนนี้บังคับผ่าน 2 ทางเดิน ไม่ใช่แค่ UI:** (1) โค้ด client/SQL เหมือนเดิม · (2) **`SYSTEM_PROMPT` ของผู้ช่วย AI (`worker/anthropic.ts`) บอกโมเดลย้ำความหมายของตัวเลขพวกนี้** เพื่อไม่ให้ตอบปนกัน — ตัวอย่างสำคัญคือข้อ 3 ข้างล่าง

1. **ซื้อของเข้าสต็อกไม่ใช่รายจ่าย** — `is_stock_purchase=true` ตัดจาก "ยอดจ่าย" (`isSpendingRow` = `type==='expense' && !is_stock_purchase`)
2. **ขาย = สองแถวเสมอ (Model A, gross)** (`stock_sale_create` `0012`/`0013`): income = ราคาขาย×qty (หมวด `stock_sale_income`) · expense = ต้นทุน×qty (`is_stock_cogs=true` · หมวด `stock_cogs` · wallet null)
3. **`safeToSpend = income − spending` — "รับ−จ่ายของเดือนนี้" ไม่ใช่ "เงินในกระเป๋าทั้งหมด"** (`homeSummary.ts`: "safe-to-spend = income − expense") · **เป็นกฎที่ AI ต้องเคารพผ่าน system prompt ด้วย** — บรรทัดใน `SYSTEM_PROMPT` บอกตรง ๆ ว่า `safe_to_spend` ≠ "เงินคงเหลือในกระเป๋าทั้งหมด" (คนละอย่าง) · ยอดคงเหลือกระเป๋าดูจาก `wallet_balances` (§11.4-6 · §11.9)
4. **COGS นับใน headline เงินออก + donut แต่ตัดจาก budget** (`isBudgetSpendingRow` ตัด `is_stock_cogs`) — ไม่ต้องมี accumulator แยกสำหรับ COGS เพราะถูกหักกลบด้วย income การขายใน Model A
5. **เคลียร์ยอดค้าง (`is_debt_settlement=true`) กติกาเดียวกับ COGS:** นับใน headline ตัดจาก budget
6. **ค่าดำเนินร้าน (`is_shop_operating=true`) กติกาเดียวกับ COGS:** นับใน headline ตัดจาก budget (ถังที่ 2 · `0026`) · **`is_shop_operating` เป็น derived column เขียนโดย trigger `set_txn_shop_operating` (`0026` DEFINER) เท่านั้น — client ห้ามส่งค่า**
7. **บัญชีร้านมีสองถังแยกเด็ดขาด** (`computeShopProfit`): ถัง 1 = กำไรขั้นต้นจาก `stock_sales` · ถัง 2 = ค่าดำเนินร้าน (net) · **กำไรสุทธิ = ถัง 1 − ถัง 2** · **ห้ามเกลี่ยถัง 2 ลงรายชิ้น** — **AI `stock_sales` tool คืน `profit` จาก RPC ตรง ๆ ห้าม recompute** (§11.9)
8. **ขายขาดทุนได้** — สองแถว ledger ยังบวก มีแค่ `stock_sales.profit` ติดลบ · `computeShopProfit` ไม่ clamp
9. `cost_at_sale` snapshot ต้นทุน/ชิ้น ณ วันขาย (ต่างจาก `is_shop_operating` ที่ไล่รีไรต์แถวเก่า)
10. **วันที่ฝั่ง DB ใช้ `(now() at time zone 'Asia/Bangkok')::date` เสมอ** ห้าม `current_date` (`0010`) · `stock_intake_list` (`0030`) กรอง `created_at at time zone 'Asia/Bangkok'` ตามกฎนี้
11. **ตัดสินว่ารายการอยู่เดือนไหนอ่านจาก string `YYYY-MM-DD` ตรง ๆ** ห้ามแปลงเป็น Date
12. **บิลรอจ่ายหักออกจาก "ใช้ได้วันละ" — หักเฉพาะรายจ่าย ไม่บวกรายรับ** (`spendable.ts`) · ไม่สมมาตรโดยตั้งใจ
13. **ห้าม clamp ยอดเงินเป็น 0 เงียบ ๆ ทุกที่ที่แสดงเงิน** — ติดลบ/เกิน บอกตรง ๆ + ไอคอนเตือน · `computePace` คืน `remaining` (ติดลบได้) + `over` แยก · **กระเป๋าเงินก็ห้าม clamp** — คงเหลือติดลบได้จริง
14. **🔑 คงเหลือกระเป๋า = สูตรที่ใช้ `type` ดิบ ต่างจากสูตรงบโดยสิ้นเชิง** (`wallet_balances()` · `0028`):
    ```
    คงเหลือ = opening_balance
            + Σ(transactions ของกระเป๋านี้ type='income')
            − Σ(transactions ของกระเป๋านี้ type='expense')
            + Σ(transfers เข้า) − Σ(transfers ออก)
    ```
    - **ใช้ `type` ดิบ ห้าม `isSpendingRow`/`isBudgetSpendingRow` เด็ดขาด** — ถามคนละคำถามกับงบ: "เงินในกระเป๋าขยับจริงไหม" ไม่ใช่ "รายการนี้นับเป็นรายจ่ายเชิงบัญชีไหม"
    - **ซื้อเข้าสต็อก (`is_stock_purchase`) ไม่ใช่รายจ่ายเชิงงบ (ข้อ 1) แต่เป็นเงินสดที่ออกจากกระเป๋าจริง → ต้องหัก** · COGS (wallet null) → ไม่เข้าสูตรเอง · เคลียร์ยอดค้าง/ค่าดำเนินร้าน (มี wallet) → นับ
    - **AI `wallet_balances` tool คืน `balance` จาก RPC ตรง ๆ ห้าม recompute** (§11.9)
15. **ห้ามเติมค่าเงินให้ล่วงหน้าในจุดที่ผู้ใช้จะกดผ่าน** — ราคาขาย · ค่าส่ง · ยอดตั้งต้นกระเป๋า · ยอดโอน เปิดมาว่างเสมอ

---

## 5. กฎธุรกิจ — สต็อก + แถวที่ล็อก

ที่มา: `0001`/`0012`/`0025`/`0027`/`0030` · `pages/StockPage.tsx` · `lib/stockAge.ts` · `lib/ledger.ts`

- `qty_remaining`/`status` **คำนวณจากจำนวนเสมอ** (`sold` เหลือ 0 · `partial` < ทั้งหมด · `in_stock` = ทั้งหมด) · CHECK `qty_remaining <= qty_total` (`0001`)
- **`cost_per_unit` และ `qty_total` ล็อกเมื่อขายแล้ว** — trigger `stock_item_lock_after_sale` (`0012`)
- **SKU สร้างจาก DB** ตาม `stock_sku_config` (1 แถว/user) · รูปแบบ **`{PREFIX}-{SEQ}`** · prefix `^[A-Z0-9]{3}$` · seq 4 หลัก zero-pad ขยายไม่ตัด (`0025`) · **`stock_items.sku` NOT NULL ไม่มี default + unique(user_id, sku)** (`0001`/`0011`) — สำคัญกับ smoke test ที่ insert จริง (§9)
- **ตัวนับ `next_seq` ผูกกับ user ไม่ผูกกับ prefix** · สูตรประกอบที่ `stock_sku_build(prefix, seq)` ที่เดียว
- **prefix แก้เองได้ตลอด** — มีผลกับของรับเข้าใหม่เท่านั้น
- สินค้าที่มีประวัติขาย **ลบไม่ได้** (`stock_item_delete` raise · FK `on delete restrict`) ต้อง reverse ก่อน
- **ไม่มี `target_price` แล้ว** (`0027` DROP) — ราคาขายกรอกตอนขายเท่านั้น
- **ทุนจม (`computeSunkCost` ใน `lib/stockAge.ts`)** = Σ `cost_per_unit × qty_remaining` ของของที่ `isStale` (ในสต็อก **และ** ค้างเกิน `AGE_OLD_MAX` วัน) · เงินจริง → mask ตาม `hideBalance` · **AI `stale_stock` tool ก็เรียก `computeSunkCost`/`isStale` ตัวเดียวกันนี้** (ไม่ hardcode 60 ซ้ำ · §11.9)
- **เกณฑ์อายุที่เดียว** ใน `lib/stockAge.ts`: `AGE_FRESH_MAX=30` · `AGE_OLD_MAX=60` — **คอมเมนต์ยอมรับเองว่าเป็นค่าเดา** ควรทบทวนหลังใช้จริง (§10)
- **"รับเข้าสต็อกในเดือน" มีสองแหล่งข้อมูลที่ตอบคนละคำถาม:** `stock_items` (มีชื่อ/จำนวน/ต้นทุนครบ แต่ไม่มีตัวกรองเดือน) กับ `transactions_search filter='stock'` (ปนซื้อ/ขาย ไม่มีชื่อสินค้า) → **RPC ใหม่ `stock_intake_list` (`0030`) เติมช่องว่างนี้** โดยกรอง `stock_items` ตามเดือน (เวลาไทย) คืน name/qty_total/cost_per_unit (§6 · §11.9)

**แนวคิด "แถวที่ล็อก" — รวมที่ `ledger.ts` `lockedRowInfo(r)` ที่เดียว** ครอบ 3 ชนิด (`stock_purchase` แก้วันที่ได้ · `stock_sale`/`debt_settlement` ไม่ได้) · แต่ละชนิดมี trigger กันที่ DB (`stock_sale_txn_guard` `0012` · `debt_settlement_txn_guard` `0015`) · `lockedRowInfo` = client mirror · **การโอนกระเป๋าไม่ใช่แถวล็อกในตารางนี้ — มันไม่อยู่ใน `transactions` เลย** (§11.8)

---

## 6. RPC ทั้งหมด — 29 ตัว

นับจาก block `public.Functions` ใน `database.types.ts` รอบนี้ = **29** (**+1 จากรอบก่อน: `stock_intake_list`**) · definer/invoker อ่านจาก migration เวอร์ชันล่าสุดที่ (re)define **รอบนี้**

**สต็อก/ระบบ (12):** `stock_intake_create` (INVOKER โดย default ไม่มี security clause · `0027` · 13-arg) · `stock_item_delete` (INVOKER · `0006`) · `stock_sale_create` (INVOKER · `0013`) · `stock_sale_reverse` (INVOKER · `0013`) · `stock_sales_summary` (INVOKER · `0012`) · `stock_sku_build` (INVOKER · `0025` · 2-arg) · `stock_sku_preview` (INVOKER stable · `0025` · 0-arg) · `seed_defaults` (**DEFINER** · `0008` · guard `auth.uid()=uid`) · `seed_defaults_internal` (**DEFINER** · reproduce ล่าสุด `0026`) · `recurring_run_due` (INVOKER · `0008`) · `recurring_next_date` (`0008`) · `pick_category_color_index` (INVOKER volatile · `0016`)

**สต็อกสำหรับ AI (1 · ใหม่ `0030`):**
- **`stock_intake_list(p_from date, p_to date, p_limit integer)`** (**INVOKER** · plpgsql · **stable** · `set search_path=''`) — รายการรับเข้าสต็อกช่วง `[p_from, p_to)` (เวลาไทย) · คืน `name/qty_total/cost_per_unit/total_count` · **`total_count = count(*) over ()`** (จำนวนจริงก่อน LIMIT · แบบเดียวกับ `transactions_search`) · `p_limit` clamp `least(greatest(coalesce(p_limit,50),1),200)` · **ไม่มีพารามิเตอร์ระบุตัวตน → RLS ของ `stock_items` เป็นด่านจริง**

**ประวัติ/ค้นหา (1):** `transactions_search` (**INVOKER** · stable · `0024` · 6-arg = `p_filter, p_q, p_limit, p_offset, p_month, p_category_id`) — filter+ค้นหา + ยอดรวมทั้งชุด (`count(*) over ()`) query เดียว · **AI `month_spending` tool เรียกตัวนี้** (§11.9)

**กระเป๋าเงิน (2 · `0028`):**
- **`wallet_balances()`** (**INVOKER** · SQL · stable · 0-arg) — คงเหลือทุกกระเป๋าครั้งเดียว aggregate SQL คืน `wallet_id/opening_balance/income_total/expense_total/transfer_in/transfer_out/balance`
- **`wallet_transfer_create(p_from,p_to,p_amount,p_date?,p_note?)`** (**INVOKER** · plpgsql) — คืนแถว `wallet_transfers` · ตรวจ `amount>0`/`from<>to`/ทั้งสองกระเป๋าเป็นของ `auth.uid()`/วันที่ไม่อนาคต · raise ข้อความไทยผ่าน `errors.ts`
- **ลบการโอน = ไม่มี RPC** — DELETE policy บนแถวตัวเอง (`0028`)

**ยอดค้าง (13):** `debt_create` (**DEFINER** · reproduce ล่าสุด `0019` · แก้ enum cast) · `debt_confirm` (**DEFINER** · `0015`) · `debt_reject` (**DEFINER** · `0015`) · `debt_cancel` (**DEFINER** · `0015`) · `debt_settle` (**DEFINER** · `0015`) · `debt_settle_many` (**DEFINER** · `0021` — วนฝั่งเซิร์ฟเวอร์ ทรานแซกชันเดียว) · `debt_settle_reverse` (**DEFINER** · `0015`) · `debt_share_private` (**DEFINER** · `0018`) · `debt_delete_private` (**DEFINER** · `0015`) · `friend_request_send` (**DEFINER** · reproduce ล่าสุด `0020` = `p_username`) · `friend_request_respond` (**DEFINER** · `0015`) · `friend_debts_summary` (**INVOKER** · reproduce ล่าสุด `0017` · 0-arg) · `generate_friend_code` (**DEFINER** · `0015` · เลิกใช้ · §10)

**สรุป definer/invoker (นับรอบนี้: DEFINER 14 · INVOKER 15):** cross-user / seed / เขียนยอดค้าง = **DEFINER** (re-check `auth.uid()`) · single-owner read/write + สต็อก RPC + search + กระเป๋าเงิน + **`stock_intake_list`** = **INVOKER** (พึ่ง RLS ที่มีอยู่) · **ทุก RPC ที่ AI เรียกเป็น INVOKER ล้วน** (`wallet_balances`/`transactions_search`/`stock_sales_summary`/`stock_intake_list`) → ตัวตนมาจาก JWT ผู้ใช้เท่านั้น RLS เป็นด่านสุดท้าย (§11.9)

> **ไม่ใช่ RPC (trigger function — ไม่โผล่ใน types):** `set_updated_at` · `handle_new_user` · `stock_item_lock_after_sale` · `system_category_no_delete` · `stock_sale_txn_guard` · `debt_settlement_txn_guard` · `set_category_color_index` · `profiles_username_setonce` · `set_txn_shop_operating` (`0026`) · `sync_shop_operating_on_category` (`0026`) · **`ai_settings` reuse `set_updated_at` เดิม ไม่มี trigger function ใหม่**
> **ทุก RPC ที่แก้ข้อมูลต้องถูก "เรียกจริง" ถึงจะพิสูจน์** (`debt_create` มีบั๊ก cast enum ตั้งแต่ `0015` แต่ผ่าน verification ทุกครั้งเพราะไม่มี UI เรียก แก้ `0019`) → smoke test ต้องเรียกฟังก์ชันจริงและ assert · **`0029` + `0030` มี smoke test เต็มในหัวไฟล์ (result set + rollback)** ครอบ RLS ข้ามผู้ใช้ + ขอบเดือน + total_count จริงแม้ถูก cap (§9)

---

## 7. Seed ของ user ใหม่

`handle_new_user()` (trigger AFTER INSERT บน `auth.users` · DEFINER) → `seed_defaults_internal(uid)` (**DEFINER** · reproduce ล่าสุด `0026`)

- **3 wallets** (`เงินสด`/`ธนาคาร`/`พร้อมเพย์`) · seed insert แค่ `(user_id, name, type)` — **`wallets.opening_balance` (numeric not null default 0 · `0028`) ได้ 0 อัตโนมัติ ไม่ต้องแตะ seed** · **ไม่มีคอลัมน์ `balance`** (DROP `0011` · §11.8)
- **1 แถว `stock_sku_config`** (prefix `STZ`, `next_seq=0`) · **1 แถว `profiles`** (`display_name`=ชื่อก่อน `@` · `friend_code` สุ่มเติมคอลัมน์ NOT NULL · `username`=null)
- **`ai_settings` ไม่ถูก seed โดยตั้งใจ** (`0029`) — "ไม่มีแถว" = ยังไม่ยินยอม · **ผู้ใช้ใหม่เริ่มแบบ "ไม่มีแถว" เท่าผู้ใช้เดิม** จึง**ไม่ต้อง reproduce seed เลย** (หัวไฟล์ `0029` เขียนเอง: เป็นห่วงโซ่ที่เปราะที่สุดของโปรเจกต์ `0015→…→0026` เลี่ยงได้ = additive ล้วน · §11.9)

> **migration ตัวถัดไปที่แตะ seed ต้อง reproduce จาก `0026`** ตรวจเลข reproduce ล่าสุดจากไฟล์จริงก่อนเขียนทุกครั้ง · **`0028`/`0029`/`0030` ไม่แตะ seed**

**หมวดหมู่ที่ seed = 18 หมวด** (13 expense + 5 income · จาก `0026` SECTION 6 · ยังไม่ได้ตรวจซ้ำนับทีละแถวรอบนี้ — ไม่อยู่ในชุดไฟล์ที่เปลี่ยน) — โครง: 4 หมวด system (`stock_sale_income`/`stock_cogs`/`debt_repayment_income`/`debt_repayment_expense` · ซ่อน · ลบไม่ได้) + หมวดผู้ใช้ทั่วไป + หมวดสต็อก (`is_stock_category`) + หมวดร้าน (`is_shop_category`)
- **ชื่อหมวดยอดค้างเปลี่ยนใน `0017` ให้เลี่ยงคำว่า "หนี้"** — ตอนนี้ = "จ่ายคืนเพื่อน"/"ได้รับคืนจากเพื่อน"
- **`categories`:** `color_index smallint 1–6 NOT NULL` (trigger) · `categories.color` (hex) DROP แล้ว (`0016`) · `icon` ไม่มี CHECK · CHECK `categories_shop_flag_check` (`0026`)
- **resolve หมวด system ด้วย `system_key` เท่านั้น ห้าม match ชื่อไทย** — **`worker/categories.ts` (`resolveCategory`) บังคับกฎนี้ด้วย** (ตัด `is_system`/`system_key != null` ออกก่อน match ชื่อไทย · §11.9)

---

## 8. Convention — กฎที่ห้ามละเมิด

### Migration
1. **ห้ามแก้ไฟล์ migration ที่ apply แล้ว** — เขียนไฟล์ใหม่เสมอ
2. **reproduce ฟังก์ชัน/seed จากเวอร์ชันล่าสุดบน main** (seed = `0026`) · **ตรวจเลข migration/seed ล่าสุดจากไฟล์จริงก่อนเขียนสเปกทุกใบ ห้ามอ่านจากเอกสารนี้** (`0029`/`0030` หัวไฟล์เขียน pre-flight `select max(version) from schema_migrations` เพื่อยืนยันเลขก่อน)
3. เปลี่ยน signature → `drop function` ด้วย signature จริง (ไม่ใส่ `if exists`) แล้ว re-grant
4. ตารางใหม่ → enable RLS + policy (single-owner CRUD · cross-user = select-only + DEFINER RPC) · **`0029` ทำครบ: enable RLS + select/insert/update (ไม่มี delete โดยตั้งใจ)**
5. เจ้าของรันเอง ครอบ `begin; … commit;` + snapshot ฟังก์ชันเดิม · **หลังรัน ตรวจว่าไฟล์ `.sql` เข้า main จริงด้วย git** (กับดัก `0015`)
6. **อ่าน `pg_constraint` + NOT NULL ของทั้งตารางก่อนแก้/เขียน smoke test** ไม่ใช่แค่ `information_schema.columns` (มองไม่เห็น CHECK · §9) — smoke test ของ `0030` ยกเป็นบทเรียน (`stock_items.sku` NOT NULL ไม่มี default → seed ล้ม 23502 ก่อนถึง RPC)

### SQL
7. **`RETURNS TABLE`/OUT param กลายเป็นตัวแปรใน scope** → alias ทุกตาราง qualify ทุกคอลัมน์ (`stock_intake_list` `0030` qualify `si.` ทุกคอลัมน์ · §9)
8. **ค่าจาก CASE/`values` list ไม่ cast enum อัตโนมัติ** → cast `::public.enum_type` ตอน INSERT (บั๊ก `debt_create` · §9)
9. **Verification ต้องพิสูจน์ว่า "ทำงานได้" ไม่ใช่แค่ "มีอยู่"** — smoke test เรียกฟังก์ชันจริงใน `begin;…rollback;` แล้ว assert
10. เงินคำนวณใน numeric เท่านั้น

### Client + Worker
11. **ห้ามมีตรรกะซ้ำสองที่** — แยกเป็นฟังก์ชันกลางแล้ว import (สี=`catColor` · วันที่=`dates` · แถวล็อก=`ledger` · P&L=`shopAccount` · aggregate หน้าแรก=`homeSummary` · อายุสต็อก/ทุนจม=`stockAge` · ตั้งงบได้ไหม=`budgetable` · กรองอินพุตเงิน=`format`) · **worker ห้าม re-implement เงิน/วันเอง — เรียก RPC หรือ pure function ของ `lib/` แล้วส่งตัวเลขผ่าน** (คอมเมนต์หัว `tools.ts`)
12. **ห้าม `as unknown as` / `as any` / `@ts-ignore` / `@ts-expect-error`** — รับ "รูปร่างขั้นต่ำ" structural แทน (เช่น `RateLimitStore` เป็น slice ของ KVNamespace ให้เทสต์ stub ได้โดยไม่ cast)
13. `database.types.ts` generated ห้ามแก้มือ · alias อยู่ใน `db.ts`
14. **ห้ามใช้คำว่า "ผ่าน" ถ้ายังไม่ได้รัน `npm run build` + `npm test`** · **รายงาน skipped แยกจาก passed เสมอ**
15. **จับ error ด้วย code/status เท่านั้น ห้ามจับ substring** · **error ต้องถึงผู้ใช้** ห้าม catch ว่าง · **`aiChat.ts` + `ai.ts` map ตาม HTTP status ล้วน** (401/403/429/502/504/…) ไม่ parse ข้อความ (§11.9)
16. **ห้ามเผยว่าอีเมลมีบัญชีในระบบหรือไม่** · ค้นหาเพื่อนใช้ `username` ไม่ใช่อีเมล · **ด่าน 401 ของ AI ใช้ข้อความเดียวสำหรับ missing/expired/revoked** ไม่บอกว่าต่างกันตรงไหน (`ai.ts`)
17. **ห้าม `new Date('YYYY-MM-DD')` แล้วอ่านค่า** — helper กลางใน `dates.ts` · **worker แปลงเดือนด้วย `dates.ts` เท่านั้น** (โมเดลส่ง offset int)
18. **สีต้องมาจาก token** ห้าม hex ดิบใหม่ใน `src/` · **hex เป็นแหล่งความจริงที่ `tailwind.config.ts` + `src/styles/index.css` เท่านั้น ห้ามคัดลอกไปที่อื่น (รวมเอกสารนี้)**
19. **คำที่ห้ามบนหน้าจอ:** หนี้ · เจ้าหนี้ · ลูกหนี้ · เรียกเก็บ · ทวง — **ชื่อในฐานข้อมูล/โค้ดยังเป็น `debt*` ตั้งใจ** · *`src/` สะอาดจากคำเหล่านี้ในเชิงข้อความจอ · เหลือเฉพาะ (ก) คอมเมนต์/ชื่อเทสต์ใน `budgetable.ts` และ (ข) **`SYSTEM_PROMPT` ของ AI (`worker/anthropic.ts`) ที่ใช้คำเหล่านี้เพื่อ "สั่งห้าม" โมเดลพูด** — ตั้งใจ ไม่ใช่ข้อความที่แสดง* · แต่ยังค้างใน `RAISE EXCEPTION` ของ RPC ยอดค้าง (§10)
20. **`transactions.is_shop_operating` เป็น derived column เขียนโดย trigger เท่านั้น** — client ห้ามส่งค่า (§4-6)
21. **1 PR = 1 เรื่อง** แตกจาก main ล่าสุด ไม่ stack · PR ที่ merge แล้ว = เริ่ม branch ใหม่จาก main (ฟีเจอร์ AI รอบนี้แตกเป็น 8 PR: table → gate → tools → UI แยกกัน)
22. **กับดัก opacity:** ค่า opacity เปล่าใน Tailwind build นี้ **ต้องเป็นทวีคูณของ 5** หรือ arbitrary (`/[0.92]`) — `/92` **ไม่ถูก emit เลย ไม่ error ไม่ warning** · เทสต์สแกน `src/styles/opacity-scale.test.ts` (§9)
23. **คำบนจอต้องตรงกันทั้งแอป (glossary):** บทบาทหมวดที่ป้อนสต็อก = `เติมสต็อก` · การกระทำรับของเข้าคลัง = `รับเข้าสต็อก` · section/สถานะ = `สต็อก`/`ในสต็อก` · เทสต์ `StockIntakePage.wording.test.ts`

### Worker (ใหม่รอบนี้)
24. **worker import runtime code จาก `src/lib/` ต้องใช้ relative import ห้าม `@/`** — `tsconfig.worker.json` ไม่มี `paths`, และ esbuild ของ wrangler ก็ไม่อ่าน `tsconfig paths` → `@/` พังทั้งตอน typecheck และตอน bundle · **ยืนยันรอบนี้: `src/worker/` ไม่มี `@/` เลย ทุก import เป็น `../lib/…`** (`tools.ts` import `../lib/dates`/`../lib/homeSummary`/`../lib/stockAge`)
25. **smoke test ที่ insert ลงตารางจริง:** อ่าน NOT NULL ทั้งตารางก่อนเขียน · assert ค่าแน่นอนต้องเลือกช่วง/คีย์ที่การันตีว่าง (`0030` ใช้เดือน มิ.ย. 2020 + sku `ZZZ-90xx`) · คืนผลเป็น **result set ไม่ใช่ `RAISE NOTICE`** (SQL Editor ไม่แสดง notice) · FAIL ใช้ `RAISE EXCEPTION` · impersonate ด้วย `request.jwt.claims` + สลับ role `authenticated` (owner bypass RLS) · จบด้วย `rollback;` เท่านั้น
26. **`/api/ai` ห้ามใช้ `service_role` · ห้ามรับ `user_id` จาก body · ลำดับ verify→consent→limit→Anthropic ห้ามสลับ** (§11.9 · บังคับเชิงโครงสร้างใน `ai.ts`)

---

## 9. กับดักที่เคยเกิดจริง — อย่าให้ซ้ำ

| เหตุการณ์ | บทเรียน |
|---|---|
| **`tsc` เขียวแต่ Cloudflare deploy พัง** — `tsconfig.app.json` มี `paths` (`@/`) และ `exclude: ["src/worker"]` · worker typecheck ด้วย `tsconfig.worker.json` ที่**ไม่มี paths** · แต่ตัว build จริงของ worker คือ **esbuild ของ wrangler ที่ไม่อ่าน `tsconfig paths` เลย** → import แบบ `@/` ที่เครื่องมือหนึ่งยอมรับได้ จะพังตอน bundle → CI ของ Workers Build จับได้ | **เครื่องมือตรวจ ≠ เครื่องมือ build จริง** (ตระกูลเดียวกับ jsdom vs เบราว์เซอร์ · tsc --noEmit ตรวจ 0 ไฟล์) · worker ต้องพิสูจน์ด้วย **`wrangler deploy --dry-run`** (รอบนี้: dry-run ผ่าน · worker import relative ล้วน · §8-24) |
| **smoke test ล้มตั้งแต่ seed** — `stock_items.sku` NOT NULL ไม่มี default (23502) และ assert `count=3` บนเดือนปัจจุบันจะชนข้อมูลจริง → FAIL ทั้งที่ RPC ถูก | smoke test ที่ insert ลงตารางจริงต้อง**อ่าน NOT NULL ทั้งตารางก่อน** + เลือกช่วง/คีย์ที่ว่างแน่ (`0030`: มิ.ย. 2020 + `ZZZ-90xx`) · **เทสต์ที่ล้มก่อนเรียกฟังก์ชันไม่ได้พิสูจน์อะไรเลย** (§8-25) |
| **types-drift PR merge เข้า main ได้โดยไม่ผ่าน `ci.yml`** — เปิดด้วย `GITHUB_TOKEN` (fallback เมื่อ `GH_PAT` ไม่ตั้ง) ซึ่ง**trigger workflow ต่อไม่ได้** (`types-drift.yml` หัวไฟล์เขียนเอง) · รอดมาได้เพราะบังเอิญมี PR อื่นรัน CI ทับ | ยังเป็นช่องเปิดอยู่ — **`GH_PAT` ยังไม่ตั้ง** · บันทึกใน §10 เป็นหนี้ที่รู้ตัว |
| **เอกสารค้างหลังของจริงจนสเปกผิด** — เคยเชื่อ migration ล่าสุด `0021` ทั้งที่ถึง `0024` · **รอบนี้: เอกสารเดิมยังบอก AI เป็น stub ทั้งที่ครบวงจรแล้ว** | สเปก/เอกสารทุกใบยืนยันจากไฟล์จริงก่อนเขียน (§8-2) |
| **`information_schema.columns` ไม่แสดง CHECK constraint** | อ่าน `pg_constraint` ของทั้งตาราง (§8-6) |
| **ค่าจาก `values`/CASE ไม่ cast enum ให้** — ตระกูล `debt_create` | cast `::public.enum_type` (§8-8) |
| **Supabase คืนแถวได้จำกัด** — รวมยอด/ลิสต์ที่ชนเพดานให้ผลน้อยกว่าจริงเงียบ ๆ | **guard เสมอ** — `useShopOperating` `.limit(1000)` · `useWalletTransfers` `.limit(100)` · **worker tools: `RAW_ROW_MAX=2000` → เกิน = คืน `too_many_*` ไม่ under-report · list tool ใช้ `count(*) over ()`/`match_count` ให้ยอดรวมถูกแม้ list ถูก cap** (§11.9) |
| `qty_remaining` เป็นทั้ง OUT param และคอลัมน์ → การขายพัง ทั้งที่ verification ผ่าน | qualify ทุกคอลัมน์ · smoke test (`0013` alias · `0030` qualify `si.`) |
| **`0015` รันลง DB แล้วแต่ไฟล์ไม่เคยเข้า main** | `schema_migrations` กับ repo ต้องตรง · ตรวจหลัง migration ว่าไฟล์เข้า main จริง |
| **`tsc --noEmit` บน solution-style tsconfig → ตรวจ 0 ไฟล์ ผ่านเสมอ** | "ผ่าน" ต้องมาจากคำสั่งเดียวกับ CI (`tsc -b && vite build` + `vitest run`) |
| **ป้ายพับในฮีโร่เป็นแถบเปล่าบน production ทั้งที่โค้ดถูก เทสต์ jsdom เขียว** | เทสต์ jsdom "อยู่ใน DOM" ≠ ผู้ใช้เห็น · guard เบราว์เซอร์จริง `WovenHero.visual.test.ts` |
| **dark mode พื้นหลังทั้งหน้าขาว** ทั้งที่ทุกเทสต์เขียว | guard `AppLayout.theme.visual.test.tsx` วัดสีที่ compute จริง |
| **ไล่บั๊กที่แก้ไปแล้วหลายชั่วโมง** เพราะบันเดิลค้าง — SW precache | **merged ≠ deployed ≠ สิ่งที่เบราว์เซอร์รัน · อ่าน version stamp ก่อน** · guard `pwa-freshness.visual.test.ts` |
| `grep "mint-" src/` ว่าง แต่สีเก่าอยู่ใน DB | **grep พิสูจน์ได้แค่เรื่องในโค้ด · ค่าที่ seed ลง DB คืออีกแหล่ง** (แก้ `0016`) |
| **รายงานเทสต์ "ผ่าน N" โดยมี skipped ซุกอยู่ — visual guard ทั้งหมด** | guard `ctx.skip()` นอก CI (ใน CI throw) · อ่าน skipped ทุกครั้ง รายงานแยก (รอบนี้ 15 skip นอก CI · 0 skip เมื่อมี Chromium) |
| **`0020` เปลี่ยน signature RPC แล้ว merge PR `types-drift` เดี่ยว → main แดง** | migration ที่เปลี่ยน signature/ทำ fixture พัง ห้าม merge types-drift เดี่ยว (§2.1) |
| Supabase free tier pause เอง หน้า login ค้างไม่บอกอะไร | error ต้องถึงผู้ใช้ · `errors.ts` `isConnectFailure` |
| **กับดัก opacity — `bg-ink/92` ไม่ compile เลย** ไม่ error ไม่ warning | opacity เปล่าต้องเป็นทวีคูณ 5 · guard `Toast.contrast.visual.test.tsx` + `opacity-scale.test.ts` |
| **token `toast`/`scrim` จงใจไม่มี dark override** | คอมเมนต์ล็อก "do NOT add a dark variant; it is not forgotten" — ห้ามเข้าใจว่าลืม (§11.2) |
| **`bg-ink` พลิกเกือบขาวในโหมดมืด** (ใบ 9) | เพิ่ม token `scrim` (theme-independent) เฉพาะจุดเนื้อหาขาวบนพื้นเข้ม · guard `StockScrim.contrast.visual.test.tsx` |
| **`useDialogA11y` ทำ input หลุดโฟกัสทุกตัวอักษร** | `onClose` ขี่ ref · effect depend `[active]` เท่านั้น · ห้ามเติม `onClose` กลับ dependency |
| **`truncate` ตัดชื่อเงียบ** · jsdom ไม่ layout จับไม่ได้ | guard 360px วัด `scrollWidth − clientWidth` · หมวด/กระเป๋า/ประวัติโอน |
| **ช่องว่างขอบล่างระดับ shell** (ใบ 10) `#root{height:100%}` วัดเทียบ viewport ใหญ่บนมือถือ | `#root{height:100dvh}` · `max-w-3xl` เป็นข้อจำกัดแนวนอน ไม่ใช่สาเหตุ · guard `AppLayout.fill`/`AddPage.fill` |
| **สูตรคงเหลือกระเป๋าใช้ predicate งบผิด → ผิดเงียบ** | คงเหลือกระเป๋าใช้ `type` ดิบ ไม่ใช่ `isSpendingRow`/`isBudgetSpendingRow` (§4-14) · smoke test `0028` |

---

## 10. สถานะปัจจุบัน

**Migration:** `0001`–`0030` (`ls supabase/migrations/*.sql | wc -l` = **30** · ล่าสุด `0030_stock_intake_list.sql`) — **2 migration ใหม่รอบนี้: `0029` (`ai_settings` consent) + `0030` (`stock_intake_list`)** · ที่เหลือ worker + client

**หน้าจริงในแอป:** **14** ไฟล์ `*Page.tsx` (`find src/pages -name '*Page.tsx' | wc -l` = 14 · **+1: `AiPage.tsx`**) · `router.tsx` มี **15 route** (14 หน้า + catch-all `*` → `<Navigate to="/" replace />`) — eager import ทั้งหมด:
- ไม่ต้อง auth: `/login` · `/forgot-password` · `/reset-password`
- ใต้ `RequireAuth` + `AppLayout`: `/` Home · `/history` · `/debts` · `/debts/friend/:friendId` · `/stock` · `/budget` · `/settings`
- ใต้ `RequireAuth` **นอก** `AppLayout` (เต็มจอ ไม่มี bottom nav): `/add` · **`/ai` (ใหม่ · แชทผู้ช่วย AI)** · `/stock/intake` · `/stock/queue`
- *(คอมเมนต์หัว `router.tsx` ยังเขียน "Routes for the 10 screens" = คอมเมนต์ค้าง จดไว้ ไม่แก้ในใบนี้)*

**Bottom nav = 5 ช่อง:** มือถือ (`AppLayout.tsx` `sm:hidden`) = **4 แท็บ + FAB กลาง** — LEFT `หน้าหลัก`/`ประวัติ` · FAB `+`→`/add` · RIGHT `ยอดค้าง`/`สต็อก` · **`ตั้งค่า`/`งบประมาณ` ไม่อยู่ในแถบล่าง** · **rail เดสก์ท็อป (`sm:flex`) ยังครบ 6** (หน้าหลัก/ประวัติ/ยอดค้าง/งบประมาณ/สต็อก/ตั้งค่า) · guard `AppLayout.visual.test.tsx` (5 ช่อง · ≥44px · FAB กึ่งกลาง ≤1px)
> **ปุ่ม "ถาม AI" ไม่ใช่ช่องที่ 6** — เป็น pill absolute-positioned ลอยเหนือแถบล่าง (มือถือ) / ปุ่มท้าย rail (เดสก์ท็อป) · **แสดงเฉพาะเมื่อ consent = 'on'** (`useConsent().data === 'on'`) · never_chosen/off/กำลังโหลด → ซ่อน · คอมเมนต์ยืนยัน "NOT one of the five bar slots" ไม่ขยับ FAB centre (§11.9)

**เทสต์:** `npm test` (`vitest run`) รอบนี้ = **68 ไฟล์** (`find src \( -name '*.test.ts' -o -name '*.test.tsx' \) | wc -l` = 68 · **+6 จากรอบก่อน** · รวมเทสต์ worker `ai.test.ts`/`tools.test.ts` + `useAiSettings.test.tsx` + `AiPage.test.tsx` + `AppLayout.consent.test.tsx`)
- **มี Chromium (แบบ CI):** `Tests 565 passed (565)` · Test Files 68 passed
- **ไม่มี Chromium (เครื่องเปล่า):** `Tests 550 passed | 15 skipped (565)` — **15 ที่ skip = guard เบราว์เซอร์จริง** `ctx.skip()` นอก CI (ใน CI throw) → รันในเครื่องพิสูจน์ guard พวกนี้ไม่ได้ ต้องรอ CI

**Guard เบราว์เซอร์จริง = 13 ไฟล์** (`find src -name '*.visual.test.*'` · เท่ารอบก่อน · ทุกตัวใช้นโยบาย skip-นอก-CI / throw-ใน-CI ผ่าน `visual-harness.ts` เว้น `pwa-freshness` inline): `AppLayout.visual` · `AppLayout.theme.visual` · `AppLayout.fill.visual` · `WovenHero.visual` · `charts.visual` · `pwa-freshness.visual` · `CategoriesManager.visual` · `Toast.contrast.visual` · `StockScrim.contrast.visual` · `AddPage.keypad.visual` · `AddPage.fill.visual` · `WalletsManager.visual` · `WalletsManager.transfers.visual`
> **หมายเหตุ:** ไฟล์ visual guard เท่ารอบก่อน (13) แต่จำนวนเคสที่ skip นอก CI ขยับ 14→15 (มีเคส guard เพิ่มในไฟล์เดิม — ไม่ได้ไล่ว่าเคสไหน)

**Cloudflare Worker (`src/worker/`):** ดู §11.9 — **AI proxy ใช้งานได้ครบวงจรแล้ว ไม่ใช่ stub อีกต่อไป** (`ai.ts`/`anthropic.ts`/`tools.ts`/`categories.ts`/`rateLimit.ts` เป็นของจริง · `index.ts` route `/api/ai`) · `security.ts`/`json.ts` เดิม
> **`wrangler deploy --dry-run` รอบนี้ผ่าน** — bundle worker + อ่าน 19 ไฟล์จาก `dist` + เห็น binding `AI_RATE_LIMIT` (KV) + `ASSETS`

**Version stamp + PWA:** `vite.config.ts` `define` `__COMMIT_SHA__` + `__BUILD_TIME__` แสดงท้าย `SettingsPage` · PWA precache 22 entries (จาก build รอบนี้) · *(โครงไม่เปลี่ยน — ไม่ได้อ่าน vite.config ทุกบรรทัดรอบนี้)*

**ทำเสร็จแล้ว (มีในโค้ดจริง):** ระบบขายครบวงจร · บัญชีร้าน 2 ถัง · SKU prefix-only · ทุนจม/วันในคลัง · ยอดค้างครบวงจร · ค้นหาประวัติ + ตัวกรองเดือน · หน้างบ · dark mode + guard · shell เต็มจอมือถือ · glossary คำบนจอ · กระเป๋าเงินครบวงจร (§11.8) · **🆕 ผู้ช่วย AI ครบวงจร (8 PR):** consent เซิร์ฟเวอร์ (`ai_settings`) + สวิตช์ในตั้งค่า + ปุ่ม "ถาม AI" + หน้าแชท `/ai` (ephemeral) + `/api/ai` (verify→consent→limit→Anthropic) + 6 tool อ่านอย่างเดียว + resolveCategory + rate limit KV + เพดานค่าใช้จ่าย 5 ตัว (§11.9)

**ยังไม่ได้ทำ / หนี้ที่รู้ตัว (ตรวจรอบนี้ว่ายังจริง):**
- **`GH_PAT` ยังไม่ตั้ง** — PR types-drift fallback เป็น `GITHUB_TOKEN` ที่ trigger `ci.yml` ต่อไม่ได้ (§2.1 · §9) → ยังเป็นช่องเปิด · แก้ = ตั้ง secret (ใบแยก)
- **`AiPrefs.assistant` ไม่มีใครอ่าน** — consent ย้ายไปเซิร์ฟเวอร์ (`ai_settings`) แล้ว · field นี้เหลือเป็น vestigial UI mirror (`prefs.ts` คอมเมนต์เขียนเอง "nothing reads it today") · `AiPrefs.autoCategory` ยังอ่านอยู่ · ลบทิ้งเป็น cleanup ใบแยก
- **`friend_code` + `generate_friend_code()` เลิกใช้แต่ยังอยู่** — `profiles.friend_code` ยัง not null · ยัง seed เติม · **ไม่มี code path ใน `src/` อ่าน** (grep เจอแค่คอมเมนต์ `ProfileManager` "gone" + `database.types.ts`) → ยังจริง
- **คำที่ห้ามขึ้นจอยังค้างใน `RAISE EXCEPTION` ของ RPC ยอดค้าง** — `grep 'raise exception' + 'หนี้/เจ้าหนี้/ลูกหนี้'` = **16 จุด** (`0015`×12 · `0018`×1 · `0019`×3) → ผู้ใช้เห็นได้เพราะ `errors.ts` ส่งไทยผ่านตรง ๆ · แก้ต้อง migration reproduce หลายฟังก์ชัน = ใบแยก
- **`src/lib/offlineQueue.ts` ไม่มีใครเรียก (dead code)** — grep ว่าง · คอมเมนต์ workbox (`vite.config.ts`) + `README.md` ยังพูดถึง = เอกสารค้าง
- **ยังไม่มี ESLint** — `npm run lint` = `tsc -b`
- **`AGE_OLD_MAX=60` เป็นค่าเดา** — คอมเมนต์ `stockAge.ts` ยอมรับเอง ควรทบทวนหลังใช้จริง
- **`transactions_search` ยังไม่มีหลักฐานว่ารัน smoke test** — UI + AI `month_spending` เรียก production (smoke อยู่ในหัวไฟล์ `0022` · ยังไม่มีหลักฐานว่ารันแล้ว) · ต่างจาก `0028`/`0029`/`0030` ที่มี smoke test เต็มในหัวไฟล์
- **ค่าดำเนินร้านรวมยอดฝั่ง client ไม่ใช่ RPC** (`useShopOperating` + `SHOP_ROW_CAP=1000`) — ชนเพดานจริง → ย้ายเป็น RPC aggregate (ใบแยก)
- **PR-6 (ประวัติแชทถาวร) ตัดสินใจข้ามไปก่อน** — เจ้าของเคาะให้ข้าม · แชทตอนนี้ ephemeral (in-memory · `AiPage` useState · เคลียร์เมื่อ reload · ไม่เขียน localStorage/DB) · **ติดเรื่อง: ต้องเคาะ mask `hideBalance` ใหม่ก่อนทำ** — คำตัดสิน "แชทตอบเลขจริงแม้เปิด `hideBalance`" (เพราะเป็นการถามเจาะจง) **ยกไปใช้กับประวัติถาวรไม่ได้** เพราะประวัติถาวร = กวาดตา (§11.9)
- ถังขยะ/สำรองข้อมูล · offline-first เต็มรูปแบบ — ยังไม่ทำ

---

## 11. Redesign + ฟีเจอร์ — สถานะปัจจุบัน (ไม่ใช่แผน)

> **แหล่งความจริงของสี:** `tailwind.config.ts` + `src/styles/index.css` — **เอกสารนี้ไม่คัดลอกค่า hex** · **แหล่งความจริงของเพดาน AI:** `src/worker/anthropic.ts` — **เอกสารนี้ไม่คัดลอกค่าตัวเลข**
> **เอกสารดีไซน์:** `docs/design/…` · **เอกสารออกแบบ AI:** `docs/ai-assistant-design.md` (v1)

### 11.1 ฮีโร่ — ป้ายทอคอเสื้อ (`src/components/WovenHero.tsx`)
**หลักการ: กิมมิกต้องเผย ไม่ใช่ซ่อน** · ป้ายทอ 3 ใบ ลำดับ `SAFE TO SPEND` → `BUDGET` → `STOCK PROFIT` (ไม่มีใบยอดค้าง) · `flex flex-col` บนปุ่มป้ายเป็น load-bearing (บั๊กแถบเปล่า · §9) · ปุ่มลูกศร/ปุ่มตาเป็น sibling button ไม่ซ้อน `<button>` · **เรขาคณิต (`CONTAINER_H`/`LABEL_H`/`POSITIONS`) อ่านจากไฟล์ ไม่คัดลอกมาที่นี่** · guard `WovenHero.visual.test.ts`

### 11.2 สี — คราม + สีหมวดต่อ slot (`tailwind.config.ts` + `src/styles/index.css`)
- สีแบรนด์ = คราม · `cat.1–6`+`cat.other` เป็น CSS variable (light/dark override) · **สีหมวดมาจาก `color_index` ผ่าน `catColorVar()` ที่เดียว** · mint ถูกนำกลับมา (คอมเมนต์ "do NOT fix back out")
- **token theme-independent (พื้นเข้มเสมอทุกธีม ไม่มี dark override โดยตั้งใจ):** `toast` · `scrim` — ใช้แทน `bg-ink` เฉพาะจุดเนื้อหาขาวบนพื้นเข้ม เพราะ `ink` พลิกเกือบขาวในโหมดมืด · **`bg-ink` ที่เหลือ = จุด in-use 7px ใน `CategoriesManager`** (ยืนยัน grep รอบนี้: `bg-ink` เหลือที่นี่ที่เดียว)

### 11.3 โดนัท (`src/components/charts.tsx`)
ตัวเลขรวมบรรทัดเดียว · `donutCenterFontSize(charCount)` แหล่งเดียว · guard `charts.visual.test.ts` · `largestRemainderPercents()` legend รวม 100

### 11.4 การตัดสินใจสำคัญ — ทำไม (หัวใจของไฟล์)
โค้ดบอก "ทำอะไร" เอกสารบอก "ทำไม" · ข้อที่**กลับคำ**สำคัญที่สุด:

1. **สีแบรนด์ย้ายออกจากเขียว** เพราะเขียวถูกจองด้วย "เงินเข้า"
2. **สีหมวดปักหมุดต่อหมวด (`color_index`) ไม่เรียงตามยอด** — เรียงตามยอดจะสลับทุกเดือน
3. **DB เก็บความหมาย client เก็บหน้าตา** — เปลี่ยนพาเลตต์ไม่ต้องแตะ DB
4. **`icon` ไม่มี CHECK** — `lib/icons.tsx` fallback ชื่อผิดเสื่อมนุ่มนวล
5. **โดนัท: ขยายรู ไม่ย่อตัวเลข**
6. **หน้าแรกตอบ "เหลือเงินเท่าไหร่" งบเป็นป้ายใบสอง** — `safeToSpend` = "รับ−จ่ายเดือนนี้" ต่างจาก "เงินในกระเป๋าทั้งหมด" (§11.8) → ยอดรวมกระเป๋าเป็นบรรทัดเงียบในหน้าตั้งค่า ไม่ใช่พาดหัวคู่แข่ง · **กฎนี้ขยายไปถึงผู้ช่วย AI** — `SYSTEM_PROMPT` ย้ำว่า `safe_to_spend` ≠ ยอดคงเหลือกระเป๋า (§4-3 · §11.9)
7. **บิลรอจ่าย: หักเฉพาะรายจ่าย ไม่บวกรายรับ**
8. **ห้าม clamp เป็น 0 เงียบ ๆ** — เกิน/ติดลบ บอกตรง ๆ + ไอคอน
9. **texture + เงา = ข้อยกเว้นเฉพาะป้ายทอ** · motion เคารพ `motion-reduce`
10. **เส้นประถูกใช้กับโซนวางรูปแล้ว** — ห้ามให้ความหมายที่สอง
11. **`hideBalance` = "ซ่อนตอนกวาดตา เปิดตอนตัดสินใจ"** — **ชีตที่ขอให้ยอมรับข้อผูกพัน (`ConfirmDebtSheet`/`SettleSheet`/แผงขาย/`WalletTransferSheet`) ต้องแสดงเงินเสมอ ไม่รับ prop `hideBalance`** (กันเชิงโครงสร้าง prop ไม่มีอยู่จริง) · **`AiPage` ก็ไม่รับ prop ใด ๆ เลย** → `hideBalance` ส่งเข้าไม่ได้ (§11.9) · หน้างบ + ลิสต์กระเป๋า mask ตาม `hideBalance` (กวาดตา)
12. **private ไม่รวมในพาดหัว และไม่รวมกับ shared** — `computeFriendLedger` แยกถัง
13. **ย้อนการเคลียร์ได้เฉพาะคนที่กดเคลียร์เอง** (`settled_by = auth.uid()`)
14. **ชื่อฟีเจอร์ = "ยอดค้าง"** · คำห้ามบนจอ: หนี้/เจ้าหนี้/ลูกหนี้/เรียกเก็บ/ทวง · schema/โค้ดยังเป็น `debt*` ตั้งใจ → gap ระหว่าง "จ่ายคืนเพื่อน" บนจอ กับ `debt_repayment_expense` ใน DB (และคำ "หนี้" ที่ยังค้างใน RAISE · §10) · **ผู้ช่วย AI ตัดเรื่องยอดค้าง/เพื่อนออกทั้งหมด และ `SYSTEM_PROMPT` สั่งห้ามพูดคำเหล่านี้** (§11.9)

**— รอบฟีเจอร์หลัง redesign —** (15–22 · เท่ารอบก่อน · ยังไม่ได้ตรวจซ้ำทีละบรรทัดรอบนี้ ยกเว้นข้อที่ AI มาแตะ):
15. **หน้าประวัติใช้ RPC เดียว** (`transactions_search`) — window aggregate ทำให้หน้ากับยอดรวมมาจาก query เดียว · **AI `month_spending` reuse RPC เดียวกันนี้** (§11.9)
16. **"เติม cache" หลังบันทึก ไม่ใช่ optimistic update** (`txCache`) · `insertRecent` เรียงใหม่ ไม่ prepend
17. **effect ที่ seed ฟอร์มต้องผูกกับ `id` ไม่ใช่ object** — `refetchOnWindowFocus` + native picker → object ใหม่ → ทับที่พิมพ์ค้าง
18. **undo การลบคืนแถวด้วย `id`+`created_at` ชุดเดิม** (`txRestore`) · guard "ห้ามคืนแถวล็อก"
19. **"เดือน" คือ string `YYYY-MM` ไม่ใช่ Date** (`dates.ts`) · **worker แปลง offset→YYYY-MM ด้วย `addMonthsToKey`/`monthKey`** (§11.9)
20. **`computeHomeSummary` แยก `month` ออกจาก `now`** · `daysLeftInMonthKey(key)` คืน 0 เมื่อเดือนจบ · **worker `home_summary` tool เรียก `computeHomeSummary` ตรง ๆ** (§11.9)
21. **`useUpcomingBills` จงใจไม่รับเดือน** — ผูกกับ "ตอนนี้" · guard `MAX_OCCURRENCES_PER_RULE=40`
22. **`onTap` ป้ายด่วนอยู่บน `click` ไม่ใช่ `pointerUp`** · กันปัดเลื่อนกลายเป็นบันทึก

**— รอบ SKU / หมวดร้าน / กำไรร้าน / ทุนจม (`0025`–`0027`) —** (23–33 · เท่ารอบก่อน · ไม่ได้ตรวจซ้ำทีละบรรทัด): SKU ตัดท่อนแบรนด์ · ตัวนับผูก user · ป้ายอยู่ที่หมวดธงลงตัวรายการ · ค่าดำเนินร้านห้ามเกลี่ยลงรายชิ้น · หมวดร้านไม่มี `system_key` resolve ด้วย `kind+is_shop_category` · ตัดราคาขายเป้าหมาย+กำไรคาดการณ์ทิ้ง แทนด้วยทุนจม · ห้ามเติมราคาขายล่วงหน้า

**— รอบงบ (34–36 · client ล้วน · ไม่ได้ตรวจซ้ำทีละบรรทัด):** `computePace()` ตัดสินสถานะ ถ้อยคำอยู่ `paceNote()` · `isBudgetableCategory()` ใช้ทั้งชีตตั้งงบ+แถบหน้าแรก · ฐาน "นอกงบ" กันที่ระดับ flag ธุรกรรม

**— รอบ redesign แถบล่าง / /add / contrast / shell (37–43 · ไม่ได้ตรวจซ้ำทีละบรรทัด):** แถบล่าง 4 แท็บ+FAB · ทางเข้าตั้งค่า = เฟืองมุมขวาบนหน้าแรก · หน้า `/add` แป้นเลข dock · `bg-ink`→`scrim` · `#root{height:100dvh}`

### 11.5 บั๊กรอบก่อน — แก้แล้ว
B1–B14 (redesign) · ค้นหาแมตช์แค่ note · dark-mode พื้นขาว · ป้าย "บันทึกแล้ว" โกหก · toast มองไม่เห็น · caret หลุด · ชื่อหมวด truncate · `bg-ink` contrast · ช่องว่างขอบล่าง shell · คำ glossary — บันทึกที่ §9/§11.4 ตามชนิด

### 11.6 ยอดค้าง (friend outstanding balances) — ครบวงจร
**แนวคิด:** ติดตามยอดค้างระหว่างเพื่อน แยก **"ตกลงกันแล้ว" (shared)** กับ **"จดไว้เอง" (private)** ไม่รวมกัน (§11.4-12) · ฟีเจอร์ cross-user ตัวเดียว → security model ต่าง (§3) · **ผู้ช่วย AI v1 ตัดยอดค้าง/เพื่อนออกจากมือ AI ทั้งหมด** (§11.9)
- **ตาราง (`0015`):** `profiles` · `friend_connections` · `debts` · `debt_events` · RLS select-only + DEFINER RPC
- **Flow + RPC (`useFriends.ts`):** `friend_request_send(p_username)`/`respond` · `debt_create`/`debt_share_private`/`debt_delete_private`/`debt_cancel` · `debt_settle`/`debt_settle_many` · `debt_settle_reverse` (เฉพาะคนที่กดเคลียร์)
- **เชื่อมเงินหลัก:** เคลียร์ → transaction จริง 1 แถว `is_debt_settlement=true` · แถวล็อก (§5) นับ headline ตัดงบ
- **สรุป:** `computeFriendLedger` + `computeDebtsHeadline` (`friend_debts_summary.shared_net`)
- **หน้าจอ:** `/debts` · `/debts/friend/:friendId` · ชีตต่าง ๆ · username `^[a-z0-9_]{3,20}$` ตั้งครั้งเดียว (`0020`)

### 11.7 flow หลังปิดการขาย — ค่าส่งขาเข้า
`StockEditSheet.doSell` สำเร็จ → ถ้ามีหมวดรายรับร้าน แสดง `ConfirmDialog` → `navigate('/add', {state:{prefill, returnTo:'/stock'}})` · resolve หมวด: §11.4-31 · ไม่ prefill ยอด

### 11.8 กระเป๋าเงิน — คงเหลือ + ยอดตั้งต้น + โอน (`0028` · ครบวงจร)
**แนวคิด:** กระเป๋า 3 ใบ แต่เดิมไม่มีที่ไหนบอกว่าแต่ละใบเหลือเท่าไร · เพิ่มยอดตั้งต้น + คงเหลือคำนวณสด + การโอน · UI อยู่ใน `WalletsManager` (ชีตในหน้าตั้งค่า) + `WalletTransferSheet` — **ไม่มี route ใหม่**
- **`wallets.opening_balance` (numeric not null default 0 · `0028`) — ไม่ใช่การเอา `balance` ที่ DROP ไปกลับมา:** `balance` เดิม (`0001`, DROP `0011`) = ยอดสะสมที่ต้องคอยอัปเดต = แหล่งความจริงซ้ำ · `opening_balance` = ค่าที่ผู้ใช้กรอกครั้งเดียวแล้วคงที่ คงเหลือยังคำนวณจากรายการเสมอ · **ถ้าไม่มีมัน คงเหลือจะกลายเป็น "เงินที่ขยับตั้งแต่เริ่มใช้แอป" ไม่ใช่ "เงินที่มีอยู่จริง"** · แก้ยอดตั้งต้นทีหลัง → คงเหลือขยับย้อนหลัง (ตั้งใจ · คนละกรณีกับ `cost_at_sale`)
- **สูตรคงเหลือใช้ `type` ดิบ** (`wallet_balances()` · INVOKER · aggregate SQL) — ห้าม predicate งบ (§4-14 · กับดัก §9)
- **`wallet_transfers` เป็นตารางแยก ไม่ยัดลง `transactions`** — การโอนไม่ใช่ทั้งรายรับและรายจ่าย · **แลกกับ: การโอนจงใจไม่โผล่ในหน้าประวัติ** — ชดเชยด้วยลิสต์ "ประวัติการโอน" ในหน้ากระเป๋า (guard `WALLET_TRANSFER_CAP=100`)
- **ลบการโอน = DELETE policy บนแถวตัวเอง ไม่มี RPC** · `WalletTransferSheet` ไม่รับ `hideBalance` · await เซิร์ฟเวอร์ก่อนปิดชีต ไม่ optimistic · **create โอน invalidate เฉพาะ `['wallets']` ไม่แตะ `['transactions']`** (พิสูจน์ว่าการโอนไม่รั่วเข้า headline/งบ/donut/ประวัติ)

### 11.9 ผู้ช่วย AI — แชทตอบคำถามการเงินจากข้อมูลผู้ใช้ (8 PR · ครบวงจร)
**แนวคิด:** ผู้ใช้ถามเรื่องเงินของตัวเองเป็นภาษาไทย ผู้ช่วยตอบจากข้อมูลจริงในแอปผ่าน tool อ่านอย่างเดียว · **ข้อมูลการเงินไหลออกไปประมวลผลที่ Anthropic (ต่างประเทศ) จริงเมื่อผู้ใช้ยินยอม** — จึงมีด่านความปลอดภัยหลายชั้น · แหล่งความจริง: `docs/ai-assistant-design.md` · โค้ด: `src/worker/*` · `src/lib/aiChat.ts` · `src/hooks/useAiSettings.ts` · `src/pages/AiPage.tsx` · `0029`/`0030`

**ทำไมออกแบบแบบนี้ (เน้น "ทำไม" มากกว่า "ทำอะไร"):**

- **ตัวตนมาจาก token เท่านั้น ห้ามรับจาก body · ห้าม `service_role`** — `ai.ts` verify JWT ด้วย `supabase.auth.getUser(token)` แล้วผูก consent + rate limit + ทุก tool กับ uid ที่ verify แล้ว · client ที่ถือ anon key + JWT ผู้ใช้ → ทุก query วิ่งใต้ `auth.uid()` → **RLS เป็นด่านสุดท้ายที่ทำงานเสมอ** · `user_id` ไม่เคยอ่านจาก body (body มีแค่ `message`)
- **consent เก็บฝั่งเซิร์ฟเวอร์ (`ai_settings`) ไม่ใช่ localStorage** — flag ฝั่ง client เชื่อไม่ได้ (หลักเดียวกับไม่เชื่อ `user_id` จาก body) · worker เช็คเองก่อนเรียก Anthropic · **จงใจไม่วางบน `profiles`** เพราะ RLS ของ `profiles` เปิดให้เพื่อนที่ accepted เห็นแถวเรา → consent (แม้บูลีนเดียว) จะรั่วให้เพื่อน · `ai_settings` เป็น single-owner ปิดช่องนั้น
- **"ไม่มีแถว" = ไม่ยินยอม** (`.maybeSingle()` คืน null ไม่ใช่ error → 403) — ไม่ backfill ไม่แตะ seed · ให้ "ไม่มีแถว" มีความหมาย "ยังไม่เคยเลือก" ฟรี ทำให้ migration additive ล้วน + เลี่ยงห่วงโซ่ reproduce seed ที่เปราะที่สุด (`0015→…→0026`) · `useConsent` แยก 3 สถานะ `never_chosen`/`off`/`on` เพื่อให้ UI โชว์คำอธิบายครั้งแรกได้
- **ไม่มี DELETE policy บน `ai_settings` โดยตั้งใจ** — ลบแถว = ย้อนไปสถานะ "ยังไม่เคยเลือก" ซึ่งขัดเจตนา · เปลี่ยนใจใช้ `update consent=false` ไม่ใช่ลบแถว (คอมเมนต์ล็อก "นี่ตั้งใจ ไม่ใช่ลืม" แนวเดียวกับ token scrim)
- **tool อ่านอย่างเดียว · ไม่มีพารามิเตอร์ระบุตัวตน · โมเดลส่ง offset ไม่ใช่วันที่** — 6 tool (`wallet_balances`/`month_spending`/`home_summary`/`stock_sales`/`stock_intake`/`stale_stock`) ไม่มีตัวไหนเขียน/ลบ และไม่มีตัวไหนให้โมเดลระบุว่าอ่านข้อมูลของใคร (RPC เป็น 0-arg หรือ arg-ไม่มี-ตัวตน + INVOKER → RLS scope ให้ผู้เรียก) · โมเดลส่ง `offset` int (0=เดือนนี้ -1=เดือนที่แล้ว) worker แปลงเป็น `YYYY-MM` ด้วย `dates.ts` — "โมเดลเลือกเจตนา โค้ดคำนวณช่วง"
- **worker ไม่ re-implement เงิน/วันเอง** — เรียก RPC (`transactions_search`/`stock_sales_summary`/`stock_intake_list`/`wallet_balances`) หรือ pure function ของ `lib/` (`computeHomeSummary`/`computeSunkCost`/`isStale`) แล้วส่งตัวเลขผ่านตรง ๆ ห้าม recompute (กับดัก predicate งบ §4-14) · `resolveCategory` (`categories.ts`) แปลชื่อหมวดไทย→id ใต้ RLS · **กำกวม→ถามกลับ ไม่เดา** (คำตอบที่ถูกตัวเลขแต่ผิดหมวด = คำตอบผิดที่ผู้ใช้จับไม่ได้) · ตัดหมวด system ออกจากการ match ชื่อไทย (§7)
- **v1 ตัดยอดค้าง/เพื่อนออกจากมือ AI ทั้งหมด** — ไม่มี tool แตะ `debts`/`friend_connections`/`profiles` · `SYSTEM_PROMPT` สั่งห้ามพูดถึงยอดค้าง เพื่อน หรือคำ หนี้/เจ้าหนี้/ลูกหนี้/ทวง/เรียกเก็บ · หน้าแชท empty-state บอกผู้ใช้ตรง ๆ ว่า "ยังไม่ตอบเรื่องยอดค้าง" · **ทำไม:** ลด blast radius · ข้อมูล cross-user รั่วไม่ได้ · เลี่ยงคำต้องห้ามบนจอ · ปิดช่อง injection ข้ามคน
- **เพดานค่าใช้จ่าย 5 ตัว อยู่ที่เดียวใน `src/worker/anthropic.ts`** (model · max output tokens · loop cap ต่อ request · per-call timeout · deadline รวมทั้ง request) — **ค่าตัวเลขอยู่ในไฟล์นั้น เอกสารนี้ไม่คัดลอกมา** (หลักเดียวกับ hex สี — ชี้ไปที่แหล่งความจริง ไม่กลายเป็นแหล่งที่สอง) · ถ้าขาดตัวใดตัวหนึ่ง endpoint กลายเป็นบ่อเงินไม่มีเพดาน · เมื่อชน loop cap → **หยุด ไม่เรียกต่อ** คืน fallback · **model id ต้องให้เจ้าของยืนยันก่อนเปิด ไม่ใช่ค่า default เงียบ** (คอมเมนต์ล็อกในไฟล์)
- **rate limit ผูก uid ที่ verify แล้ว ไม่ใช่ IP** (`rateLimit.ts` · KV 2 หน้าต่าง นาที/วัน) · **KV ไม่ atomic (read-modify-write ไม่มี compare-and-set) → เพดานคลาดเกินได้ตามจำนวน request ที่วิ่งพร้อมกัน · ยอมรับโดยตั้งใจ** (ผู้ใช้ไม่กี่คน เป้าหมายคือกันเงินบานปลาย ไม่ใช่มิเตอร์เป๊ะ) · คอมเมนต์เขียนเอง "Do NOT describe these caps as precise anywhere" · นับ**ก่อน**เรียก Anthropic (upstream ล้มก็กินโควตา = อนุรักษ์นิยมเพื่อ budget เจ้าของ) · KV binding ขาด → 503 (fail closed ไม่ปล่อยทะลุ)
- **แชทตอบเลขจริงแม้เปิด `hideBalance`** — เพราะเป็นการถามเจาะจง (ตัดสินใจ) ไม่ใช่กวาดตา (§11.4-11) · `AiPage` ไม่รับ prop ใด ๆ เลย → `hideBalance` ส่งเข้าไม่ได้เชิงโครงสร้าง · **คำตัดสินนี้ยกไปใช้กับ PR-6 (ประวัติถาวร) ไม่ได้** — ประวัติถาวร = กวาดตา ต้องเคาะ mask ใหม่ก่อนทำ (§10)
- **ประวัติแชท ephemeral (in-memory)** — `AiPage` เก็บใน `useState` เคลียร์เมื่อ reload · ไม่เขียน localStorage/DB · token อ่านสดจาก session ทุกครั้งที่ส่ง ไม่ cache · กันกดซ้ำระหว่าง request วิ่ง (ปุ่ม disabled + guard `pending`) · error ถึงผู้ใช้ผ่าน `translateError` (map ตาม HTTP status ไม่ parse ข้อความ) — คำถามคาไว้ใน transcript ให้เห็นว่าอะไรล้ม
- **ทางเข้า:** สวิตช์ "ใช้ผู้ช่วย AI" ในหน้าตั้งค่า (`SettingsPage` · `ConsentExplainer` แสดงคำอธิบายเต็มก่อนกดครั้งแรก · toggle await write+refetch ไม่ optimistic เพราะคุมว่าข้อมูลไหลออกไหม) · ปุ่ม "ถาม AI" ใน `AppLayout` (แสดงเฉพาะ consent='on') → `/ai` · `AiPage` redirect ผู้ที่ consent ไม่ใช่ 'on' กลับ `/settings` (fail closed ไม่โชว์แชทที่จะ 403)

**ความเสี่ยงที่เหลือ — เขียนตรง ๆ (ไม่ทำให้ดูปลอดภัยเกินจริง):**
- **ข้อมูลเงินไหลออกไป Anthropic จริงเมื่อผู้ใช้ยินยอม** — คำถาม + ตัวเลขที่เกี่ยวข้อง (ยอดรวม/รายการ) ถูกส่งไปประมวลผลต่างประเทศ
- **ส่งไปแล้วเรียกคืนไม่ได้** — `ConsentExplainer` บอกข้อนี้ตรง ๆ ("สิ่งที่ส่งออกไปแล้วก่อนหน้านี้ เรียกคืนไม่ได้") ห้ามตัดออกเพราะดูน่ากลัว
- **โมเดลยังตอบผิดได้** — system prompt สั่งพูดเฉพาะตัวเลขจาก tool + บอกที่มา แต่ไม่การันตี
- **token ขยะยังกิน quota Supabase Auth ได้** — request ที่ token เพี้ยนยังเรียก `auth.getUser` (นับก่อนถึง rate limit ของเรา)

---

## 12. คำสั่งตรวจตัวเลขในไฟล์นี้ (ให้เจ้าของรันซ้ำได้)

ทุกตัวเลข/รายชื่อในเอกสารนี้มาจากคำสั่งเหล่านี้ รันบน main `de0c6e4` รอบนี้:

| อ้างที่ | คำสั่ง | ผล (รอบนี้) | ฉบับก่อนบอก |
|---|---|---|---|
| main sha (หัวไฟล์) | `git rev-parse --short HEAD` | `de0c6e4` | `bc993f9` |
| migration ล่าสุด (§10) | `ls supabase/migrations/*.sql \| wc -l` | **30** (`0030_stock_intake_list.sql`) | 28 |
| 16 ตาราง (§3) | นับ block `public.Tables` ใน `database.types.ts` | **16** (+`ai_settings`) | 15 |
| 29 RPC (§6) | นับ key ใน block `public.Functions` | **29** (+`stock_intake_list`) | 28 |
| 8 enum | นับ block `public.Enums` | **8** (`category_kind`/`debt_status`/`debt_visibility`/`friend_status`/`item_condition`/`stock_status`/`transaction_type`/`wallet_type` — **ไม่มี enum ใหม่ของ AI**) | 8 |
| ไฟล์เทสต์ (§10) | `find src \( -name '*.test.ts' -o -name '*.test.tsx' \) \| wc -l` | **68** | 62 |
| visual guard (§10) | `find src -name '*.visual.test.*' \| wc -l` | **13 ไฟล์** | 13 |
| เคสเทสต์ (มี Chromium) | `CHROMIUM_EXECUTABLE=… npm test` | **`Tests 565 passed (565)`** · 68 files | 495/0/495 |
| เคสเทสต์ (เครื่องเปล่า) | `npm test` | **`Tests 550 passed \| 15 skipped (565)`** (15 skip = visual guard) | 481/14/495 |
| 14 หน้า / 15 route (§10) | `find src/pages -name '*Page.tsx' \| wc -l` · อ่าน `router.tsx` | **14 หน้า + catch-all = 15 route** (+`AiPage`/`/ai`) | 13 / 14 |
| bottom nav slots (§10) | อ่าน `AppLayout.tsx` (LEFT+RIGHT+FAB) | **5 ช่อง** (ปุ่ม "ถาม AI" เป็น pill ลอย ไม่ใช่ช่อง) | 5 |
| offlineQueue dead (§10) | `grep -rn offlineQueue src \| grep -v lib/offlineQueue.ts` | ว่าง | ว่าง |
| หนี้ ใน src (§8-19) | `grep -rln 'หนี้' src` | `worker/anthropic.ts` (SYSTEM_PROMPT สั่งห้าม) + `lib/budgetable.ts` (+`.test`) | budgetable.ts + test |
| หนี้ ใน migrations RAISE (§10) | `grep -rn 'raise exception' migrations \| grep 'หนี้\|เจ้าหนี้\|ลูกหนี้' \| wc -l` | **16 จุด** (`0015`×12 · `0018`×1 · `0019`×3) | 16 |
| friend_code อ่านใน src? (§10) | `grep -rn friend_code src` | คอมเมนต์ `ProfileManager` ("gone") + `database.types.ts` เท่านั้น | เท่าเดิม |
| worker ใช้ `@/` ไหม (§8-24) | `grep -rn '@/' src/worker` | ว่าง — ทุก import เป็น `../lib/…` | (รอบก่อนไม่ได้ตรวจ) |
| worker deploy bundle ได้ (§9) | `npx wrangler deploy --dry-run` | **ผ่าน** — bundle worker + 19 asset + binding `AI_RATE_LIMIT`/`ASSETS` | (รอบก่อนไม่ได้ตรวจ) |
| build/test เขียว | `npm run build` · `npm test` | เขียวทั้งคู่ (build ✓ PWA precache 22 · 565/0 มี Chromium) | — |

> **ยังไม่ได้ตรวจในรอบนี้ (บันทึกตรง ๆ):**
> - **schema จริงบน DB** — AI ต่อ DB ไม่ได้ · แหล่งความจริงคือ `database.types.ts` ไม่ใช่ query สด · **smoke test ของ `0029`/`0030` (ในหัวไฟล์) ต้องเจ้าของรันเองใน SQL Editor — ยังไม่มีหลักฐานว่ารันแล้ว** (เช่นเดียวกับ `transactions_search`/`0022`)
> - **production URL ที่แน่นอน** — ไม่ pin ในไฟล์ repo
> - **`vite.config.ts`, `src/worker/security.ts`, `json.ts`** — ไม่ได้อ่านทุกบรรทัดรอบนี้ (`security.ts`/`json.ts` mtime เก่ากว่าไฟล์ AI = ไม่เปลี่ยนรอบนี้)
> - **การเชื่อมต่อ Anthropic จริง + KV จริง** — พิสูจน์ได้แค่ผ่านเทสต์ (`ai.test.ts`/`tools.test.ts` ใช้ stub) ไม่ได้ยิงของจริงรอบนี้
> - **§7 นับหมวด seed 18 · §11.4 ข้อ 15–43 · §11.6 · §11.8** — ยืนยันโครง/ชื่อไฟล์จากการอ่านรอบนี้ แต่ไม่ได้อ่านทุกบรรทัดของทุก component (ไฟล์เหล่านี้ไม่อยู่ในชุดที่เปลี่ยนรอบ AI); จุดที่ AI มาแตะ (RPC/lib ที่ tool เรียก) ตรวจจากไฟล์จริงแล้ว
> - **คอมเมนต์/เอกสารค้างที่พบ (จดไว้ ไม่แก้ — นอกขอบเขตใบนี้):** หัว `router.tsx` เขียน "10 screens" (จริง 14 หน้า) · `README.md` ยังบอก AI/`worker/ai.ts` เป็น stub · migration 28 · 13 หน้า · และพูดถึง `offlineQueue` ราวกับใช้อยู่ · คอมเมนต์ workbox ใน `vite.config.ts` เรื่อง offline queue · คอมเมนต์ `lib/budgetable.ts` อ้างชื่อหมวด "จ่ายชำระหนี้" (ปัจจุบัน "จ่ายคืนเพื่อน" ตั้งแต่ `0017`)
