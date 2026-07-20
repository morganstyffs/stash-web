# Stash

เว็บแอปบันทึกรายรับ-รายจ่ายส่วนตัว + กึ่งระบบสต็อกสินค้า (ขายต่อ) — ผู้ใช้คนเดียว, mobile/tablet-first, UI ภาษาไทย

การซื้อสินค้าเข้าหนึ่งครั้งจะบันทึกเป็น "รายจ่าย (สินทรัพย์)" **และ** สร้างสินค้าในสต็อกพร้อมกัน และเมื่อขายออกจะตัดสต็อก + คำนวณกำไรให้อัตโนมัติ

## สแตก
- **Frontend:** Vite + React 18 + TypeScript + Tailwind CSS
- **Data:** Supabase (Postgres + Auth อีเมล/รหัสผ่าน + Storage) ผ่าน TanStack Query
- **PWA:** `vite-plugin-pwa` + offline write-queue (IndexedDB)
- **Deploy:** Cloudflare Workers (static assets) — Worker เดียวเสิร์ฟทั้ง SPA และ route `/api/*` (เผื่อ proxy Anthropic API แบบ server-side)

## เริ่มใช้งาน (dev)

```bash
npm install
cp .env.example .env      # เติมค่า VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm run dev
```

รัน migration ก่อนใช้งานจริง — ดู [`supabase/README.md`](supabase/README.md)

### สคริปต์
| คำสั่ง | ทำอะไร |
|---|---|
| `npm run dev` | dev server (Vite) |
| `npm run build` | typecheck + build production |
| `npm run preview` | เปิด build ที่ compile แล้ว |
| `npm run typecheck` | ตรวจชนิด (tsc --noEmit) |
| `npm run cf:dev` | รัน Worker local (`wrangler dev`) — เสิร์ฟทั้ง static + `/api` |
| `npm run deploy` | build + `wrangler deploy` ขึ้น Cloudflare Workers |

## โครงสร้าง

```
src/
  lib/         supabase client (singleton), design types, format helpers, offline queue
  hooks/       useAuth (context)
  components/  AppLayout (bottom nav / nav rail), RequireAuth, placeholders
  pages/       10 จอ (login + tabbed + full-screen flows)
  worker/      Cloudflare Worker: index.ts (fetch handler + ASSETS) · ai.ts (AI proxy stub)
supabase/
  migrations/  0001 schema+RLS · 0002 seed · 0003 storage  (additive-only)
docs/design/   handoff bundle จาก Claude Design (ต้นฉบับ 10 จอ)
```

> หมายเหตุ: `src/worker/` ถูก build โดย wrangler (ผ่าน `main` ใน `wrangler.jsonc`)
> ไม่ใช่ Vite — จึงถูก exclude ออกจาก `tsconfig.app.json` และตรวจชนิดด้วย
> `tsconfig.worker.json` แทน

## Deploy (Cloudflare Workers)

1. เชื่อม repo กับ Cloudflare (Workers & Pages → Create → Workers → Connect to Git)
   หรือ deploy ตรงด้วย `npm run deploy`
2. **Build command:** `npm run build` — **Deploy command:** `npx wrangler deploy`
   (build ต้องรันก่อนเสมอเพื่อสร้าง `./dist` ที่ wrangler อัปโหลดเป็น assets)
3. **Build variables** (ตอน build): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
4. **Runtime secret** (ตอน run, เผื่อ AI): `ANTHROPIC_API_KEY`
   → `npx wrangler secret put ANTHROPIC_API_KEY` หรือตั้งในหน้า dashboard

## Environment / secrets
- Client อ่านเฉพาะ `VITE_SUPABASE_URL` และ `VITE_SUPABASE_ANON_KEY` (anon key ปลอดภัยเพราะมี RLS ทุกตาราง)
- **ห้ามใส่ secret ในโค้ด client** — AI key (`ANTHROPIC_API_KEY`) เก็บเป็น env ฝั่ง server (Cloudflare) เท่านั้น

## สถานะการพัฒนา
- [x] ส่วนที่ 1 — scaffold (routing 10 จอ, bottom nav 5 แท็บ, Supabase client, design tokens, PWA/AI stub)
- [x] ส่วนที่ 2 — schema + RLS (ไฟล์ SQL รอ review/รันเอง)
- [ ] ส่วนที่ 3 — build 10 จอ pixel-perfect + wire Supabase
- [ ] ส่วนที่ 4 — logic ซิงก์ รายจ่าย ↔ สต็อก (RPC)
- [ ] ส่วนที่ 5 — PWA/offline-first เต็มรูปแบบ
- [ ] ส่วนที่ 6 — implement AI proxy (Cloudflare Worker route `/api/ai`)
