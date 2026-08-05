# Stash

PWA บันทึกรายรับ-รายจ่ายส่วนตัว + **กึ่งระบบสต็อกสินค้า** (เสื้อผ้า/ของมือสอง ขายต่อ) + **ระบบยอดค้างกับเพื่อน** + **กระเป๋าเงินหลายใบ** (ยอดตั้งต้น/คงเหลือ/โอน) — mobile/tablet-first, UI ภาษาไทย, สกุลเงิน THB, เขตเวลา Asia/Bangkok

- **ผู้ใช้:** เจ้าของ + เพื่อนไม่กี่คน · **ต่างคนต่างขายของตัวเอง ไม่แชร์คลัง** · "ยอดค้าง" เป็นฟีเจอร์ cross-user ตัวเดียวในแอป (ไม่ใช่แอปผู้ใช้คนเดียว)
- ซื้อของเข้าสต็อกหนึ่งครั้ง = บันทึกเป็นการแปลงสินทรัพย์ (ไม่ใช่รายจ่าย) **และ** สร้างสินค้าในสต็อกพร้อมกัน · ขายออก = ตัดสต็อก + คำนวณกำไรอัตโนมัติ (บันทึกสองแถว income/COGS)
- **ไม่มีหน้าสมัครสมาชิก** — บัญชีสร้างใน Supabase dashboard · มีเฉพาะเข้าสู่ระบบ + กู้รหัสผ่าน

> **จะแก้โค้ด? อ่าน [`docs/STASH_CONTEXT.md`](docs/STASH_CONTEXT.md) ก่อนเสมอ** — เป็นบริบทถาวรของโปรเจกต์: กฎธุรกิจเรื่องเงิน, การตัดสินใจที่ "กลับคำ", และ **กับดักที่เคยเกิดจริง** (README บอกแค่ "นี่คืออะไร/เริ่มยังไง"; `STASH_CONTEXT.md` บอก "ทำไมถึงเป็นแบบนี้ และกับดักอยู่ตรงไหน")

## สแตก

จาก `package.json`:

- **Frontend:** Vite 6 · React 18 · TypeScript · Tailwind CSS 3
- **Data:** Supabase (Postgres + Auth อีเมล/รหัสผ่าน + Storage) ผ่าน TanStack Query 5 · routing ด้วย react-router-dom 6
- **PWA:** `vite-plugin-pwa` (app-shell แบบ NetworkFirst)
- **Deploy:** Cloudflare Workers (static assets) — Worker เดียว (`stash-web`) เสิร์ฟทั้ง SPA และ route `/api/*` (proxy Anthropic API ฝั่ง server สำหรับผู้ช่วย AI — **ใช้งานได้ครบวงจรแล้ว**)
- **Test:** Vitest 2 · รวม guard เบราว์เซอร์จริงด้วย `playwright-core` + Chromium

> **หมายเหตุ offline:** **ยังไม่ได้ต่อ offline-first เต็มรูปแบบ** — ไม่มี write-outbox/queue สำหรับ mutation ตอนออฟไลน์ · service worker แคชเฉพาะ app shell (ดู workbox ใน `vite.config.ts`)

## ข้อจำกัดสภาพแวดล้อม (กำหนดวิธีทำงานทั้งหมด — อ่านก่อนลงมือ)

- **เจ้าของทำงานออนไลน์ล้วน ไม่มีเครื่อง dev** — รันคำสั่ง local เองไม่ได้ (ให้ agent รันให้)
- **Migration เป็น raw SQL รันมือใน Supabase SQL Editor** — ไม่มี Supabase CLI / migration runner (ดู [`supabase/README.md`](supabase/README.md))
- **AI agent ต่อ DB ไม่ได้** → **แหล่งความจริงของ schema ที่อ่านได้คือ `src/lib/database.types.ts`** (generate จาก DB จริงผ่าน workflow `types-drift` — ไม่ paste มือ) ไม่ใช่การ query สด
- **ห้ามเพิ่ม deploy workflow ใน GitHub Actions** — deploy ผ่าน **Cloudflare Workers Git integration** อยู่แล้ว (build จาก git ตรง) จะกลายเป็นสองทางเดินชนกัน · GitHub Actions มีไว้ **ตรวจ (build + test) ไม่ deploy**
- **merged ≠ deployed ≠ สิ่งที่เบราว์เซอร์รันอยู่** — SW precache ทำให้บันเดิลค้างได้ · ก่อนไล่บั๊กหน้าจอ อ่าน version stamp ท้ายหน้าตั้งค่าก่อน

## เริ่มใช้งาน (dev)

```bash
npm install
cp .env.example .env      # เติมค่าจริงจาก Supabase Dashboard → Project Settings → API
npm run dev
```

ตัวแปรที่ client อ่าน (ดู `.env.example`) — เป็น **build variable** (Vite bundle ตอน build):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` — anon key ปลอดภัยฝั่ง client เพราะทุกตารางบังคับ RLS (`auth.uid() = user_id`)

`ANTHROPIC_API_KEY` (เผื่อ AI proxy) เป็น **runtime secret ฝั่ง server เท่านั้น** — ห้ามขึ้นต้นด้วย `VITE_` (จะถูก bundle ไป client) · ตั้งใน Cloudflare หรือ `npx wrangler secret put ANTHROPIC_API_KEY`

รัน migration ก่อนใช้งานจริง — ดู [`supabase/README.md`](supabase/README.md)

## สคริปต์ (`package.json`)

| คำสั่ง | ทำอะไร |
|---|---|
| `npm run dev` | dev server (Vite) |
| `npm run build` | `tsc -b && vite build` (typecheck ทั้ง project แล้ว build production) |
| `npm run preview` | เปิด build ที่ compile แล้ว (`vite preview`) |
| `npm test` | รันเทสต์ทั้งชุด (`vitest run`) |
| `npm run test:watch` | เทสต์แบบ watch (`vitest`) |
| `npm run lint` | `tsc -b` — **ยังไม่มี ESLint** (lint = typecheck เท่านั้น) |
| `npm run typecheck` | `tsc -b` (build ทั้ง project) |
| `npm run cf:dev` | รัน Worker local (`wrangler dev`) — เสิร์ฟทั้ง static + `/api` |
| `npm run cf:typegen` | generate types ของ Worker (`wrangler types`) |
| `npm run deploy` | `npm run build && wrangler deploy` ขึ้น Cloudflare Workers |

> **บทเรียน:** `lint`/`typecheck` จงใจเป็น **`tsc -b`** (build ทั้ง solution) ไม่ใช่ `tsc --noEmit` — เพราะ `tsc --noEmit` บน tsconfig แบบ solution-style (ไฟล์นี้) จะตรวจ **0 ไฟล์แล้วผ่านเสมอ** · คำว่า "ผ่าน" ต้องมาจากคำสั่งเดียวกับ CI: `tsc -b && vite build` + `vitest run`

## โครงสร้าง (นับจริงจาก repo)

```
src/
  lib/         supabase client, type alias, pure function ที่คิดเงิน/วันที่/สี (ledger, shopAccount,
               budgetable, budgetNote, dates, catColor, …) — "ตรรกะที่แตะเงินอยู่ที่นี่ ห้าม inline ใน component"
  hooks/       TanStack Query hooks (useBudgets, useHome, useHistory, useShopOperating, …)
  components/  AppLayout (bottom nav / nav rail), WovenHero, ShopProfitCard, Toast, ชีตต่าง ๆ
  pages/       14 หน้า (*Page.tsx) — login/recovery + tabbed + full-screen flows
  worker/      Cloudflare Worker: index.ts (fetch + ASSETS + security headers) · ai.ts/anthropic.ts/tools.ts/
               categories.ts/rateLimit.ts/history.ts (ผู้ช่วย AI — /api/ai ครบวงจร ไม่ใช่ stub)
  styles/      index.css — แหล่งความจริงของ CSS variable (สี light/dark)
supabase/
  migrations/  0001–0030 (raw SQL, additive-only, รันมือใน SQL Editor)
docs/
  STASH_CONTEXT.md   บริบทถาวร — อ่านก่อนแก้โค้ด
  design/            handoff bundle จาก Claude Design
tailwind.config.ts + src/styles/index.css   แหล่งความจริงของสี (hex/geometry อยู่ที่นี่ที่เดียว)
```

ตัวเลขที่นับจริงในรอบนี้ (`ls supabase/migrations/*.sql | wc -l` ฯลฯ): **migration 30 ใบ** (ล่าสุด `0030` RPC รับเข้าสต็อกให้ AI) · **14 หน้า** (`*Page.tsx` · รวมหน้าแชท `/ai`) · **15 route** ใน `router.tsx` (14 หน้า + catch-all) · **bottom nav มือถือ = 4 แท็บ + FAB กลาง (5 ช่อง)** — ตั้งค่าเข้าจากไอคอนเฟืองมุมขวาบนหน้าแรก ไม่อยู่ในแถบล่าง (nav rail เดสก์ท็อปยังครบทุกหน้า) · กระเป๋าเงินเป็นชีตในหน้าตั้งค่า ไม่ใช่หน้าใหม่ · ปุ่ม "ถาม AI" เป็น pill ลอย (แสดงเมื่อเปิดใช้ผู้ช่วย) ไม่ใช่ช่องที่ 6

> `src/worker/` build โดย wrangler (ผ่าน `main` ใน `wrangler.jsonc`) ไม่ใช่ Vite → ถูก exclude จาก `tsconfig.app.json` และตรวจชนิดด้วย `tsconfig.worker.json`
> **ค่าสี hex และเลขเรขาคณิตของฮีโร่ไม่ได้เขียนไว้ในเอกสารนี้** — แหล่งความจริงคือ `tailwind.config.ts` + `src/styles/index.css` (มีคอมเมนต์กำกับ locked/role)

## CI / Deploy

**GitHub Actions — 2 workflow (`.github/workflows/`):**

| ไฟล์ | ทำอะไร |
|---|---|
| `ci.yml` | ทุก push→`main` + ทุก PR: `npm ci` → `npm run build` → ติดตั้ง Chromium → `npm test` · **ไม่ deploy** · ขั้น Chromium มีเพื่อให้ guard เบราว์เซอร์จริงรันได้ใน CI |
| `types-drift.yml` | cron รายวัน: generate types จาก DB จริงเทียบกับ `src/lib/database.types.ts` · ต่างเมื่อไรเปิด PR อัตโนมัติ (branch `automation/database-types-drift`) · ไม่แตะ `main` ตรง ๆ |

- **เทสต์:** `npm test` รันทั้งชุดด้วย Vitest · **72 ไฟล์เทสต์ · 13 เป็น visual guard เบราว์เซอร์จริง** (Playwright + Chromium) ที่ **`ctx.skip()` นอก CI** (Chromium ไม่พร้อมในเครื่อง) แต่ **`throw` เมื่อ `process.env.CI` ถูกตั้ง** → รันในเครื่องจะเห็น skipped ส่วนนี้ พิสูจน์ได้จริงเฉพาะใน CI · ผลรอบล่าสุด (เครื่องเปล่า ไม่มี Chromium): **`638 passed | 15 skipped (653)`** (15 skipped = visual guard ทั้งหมด) · ใน CI (มี Chromium) คาดว่า skipped กลายเป็น passed ทั้งหมด
- **Deploy:** อัตโนมัติผ่าน **Cloudflare Workers Git integration** — Build command `npm run build` · Deploy `npx wrangler deploy` (build สร้าง `./dist` ที่ wrangler อัปโหลดเป็น assets) · Build variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` · Runtime secret: `ANTHROPIC_API_KEY`

## สถานะ

**ทำแล้ว (ยืนยันได้จากโค้ด):** บันทึกรายรับ-รายจ่าย · **กระเป๋าเงินหลายใบครบวงจร** (ยอดตั้งต้น + คงเหลือคำนวณสด + โอนระหว่างกระเป๋า + ประวัติการโอน) · ระบบสต็อก/ขายครบวงจร + SKU (prefix แก้ได้) · บัญชีร้านสองถัง + การ์ดกำไร (`ShopProfitCard`) + ป๊อปอัพค่าส่งขาเข้า · ทุนจม/วันในคลัง · **ระบบยอดค้างกับเพื่อน** cross-user ครบวงจร (เพิ่มเพื่อน/บันทึก/ยืนยัน/เคลียร์/ย้อน) · ค้นหาประวัติ + ตัวกรองเดือน · หน้างบ (เลื่อนดูเดือน, ตัวเลขแทนคำตัดสิน, กันตั้งงบหมวดที่ไม่นับในงบ) · dark mode + guard เบราว์เซอร์จริง · schema types generate จาก DB จริง (workflow) · **ผู้ช่วย AI ตอบคำถามการเงินครบวงจร** (consent ฝั่งเซิร์ฟเวอร์ + หน้าแชท `/ai` + `/api/ai` verify→consent→limit→Anthropic + tool อ่านอย่างเดียว + multi-turn + ปุ่มลัดในคำตอบ — รายละเอียดใน [`docs/STASH_CONTEXT.md`](docs/STASH_CONTEXT.md) §11.9)

**ยังไม่ได้ทำ:** offline-first เต็มรูปแบบ · ถังขยะ/สำรองข้อมูล · ยังไม่มี ESLint · **หนี้เทคนิคที่รู้ตัวอื่น ๆ อยู่ใน [`docs/STASH_CONTEXT.md`](docs/STASH_CONTEXT.md) §10**

> Environment/secrets: client อ่านเฉพาะ `VITE_SUPABASE_*` (anon key ปลอดภัยเพราะ RLS ทุกตาราง) · **ห้ามใส่ secret ในโค้ด client** · AI key เก็บฝั่ง server (Cloudflare) เท่านั้น
