# Stash — Project Audit

> เอกสาร context ถาวรของโปรเจกต์ (read-only audit) — อ่านจากโค้ดจริง ณ branch `claude/expense-stock-audit-yz38u8`, commit `8816c07`
> ผู้ใช้: คนเดียว · Timezone: Asia/Bangkok · สกุลเงิน: THB
> ขอบเขต: อ่านทั้ง `src/`, `supabase/migrations/`, config ทั้งหมด — **ไม่ได้รัน** แอป/DB/tests

---

## 1. Executive Summary

- **สถาปัตยกรรมสะอาดและแยก layer ดี** สำหรับแอปขนาดนี้: DB (RLS + RPC) → `lib/` (helpers) → `hooks/` (data/TanStack Query) → `pages/components` (UI) ชั้นแทบไม่ปนกัน business logic การเงินสรุปเป็น pure function ที่แยกออกจาก component (`computeHomeSummary`, `computeStockHero`, `computePace`)
- **โมเดลบัญชีถูกต้องและ consistent**: การซื้อเข้าสต็อกลงเป็น "รายจ่าย = สินทรัพย์" (`is_stock_purchase=true`) และถูก **กรองออกจากทุกตัวเลขสรุป/งบ** อย่างครบถ้วน (`useHome`, `useBudgets`) เงินเก็บเป็น `numeric(14,2)` ไม่ใช่ float — ถูกต้อง
- **การเขียนที่กระทบสองระบบทำเป็น atomic RPC**: intake (สร้าง expense + stock item) และ delete (ลบ item + expense ต้นทาง) อยู่ใน transaction เดียว ผ่าน `security invoker` (RLS ยังบังคับ) — ดีมาก
- **Security แน่นเกินคาดสำหรับ personal app**: RLS `auth.uid() = user_id` ทุกตาราง, storage แยกตาม uid, RPC มี auth guard, security headers/CSP ครบใน Worker, constraint กันค่าลบใน DB (0009)
- **✅ "การขายสินค้า" ทำแล้วใน 0012 (Model A)** — เดิมไม่มีเลย ตอนนี้มี `stock_sale_create`/`stock_sale_reverse`/`stock_sales_summary` (atomic RPC): ขายลง income เต็มราคา + COGS แยก, ตัด `qty_remaining`, เปลี่ยน `status` → partial/sold, snapshot ต้นทุน, ย้อนการขายได้ + trigger กันแก้/ลบรายการขายตรง (ปิด F-01)
- **✅ SKU race/ซ้ำ แก้แล้วใน 0011 (F-02)** — เพิ่ม `unique(user_id, sku)` + counter `stock_sku_config.next_seq` (ไม่พึ่ง `count`) + retry ตอนชน; รูปแบบ SKU ตั้งค่าได้ต่อ user
- **✅ Timezone แก้แล้วใน 0010 (F-03)** — RPC + `transactions.date` default ใช้ `(now() at time zone 'Asia/Bangkok')::date` ตรงกับ client แล้ว
- **PWA/offline ยังเป็นแค่โครง**: โมดูล `offlineQueue.ts` เขียนไว้ครบแต่ **ไม่ถูก import ที่ไหนเลย** — คำโฆษณา "offline-first write-queue" ยังไม่จริง (F-06)
- **🟢 CI + unit test แล้ว (ESLint ยังไม่มี)**: GitHub Action รัน `npm run build` + `npm test` ทุก PR/push — Vitest 35 เคสคลุมสูตรเงินทั้งหมด (`lib/ledger`, `computeHomeSummary`, `computeStockHero`, `computePace`, `computeNeedsDetails`, `lib/dates` boundary) พิสูจน์ fail ได้จริง + รันเขียวทุก timezone (PR B, F-07) ⚠️ ยังไม่มี ESLint จริง (F-24) · `npm run typecheck`/`lint` = `tsc -b` แล้ว (F-19 แก้แล้ว)
- **ลบเป็น hard delete ทั้งหมด ไม่มี soft delete / audit trail** — การลบรายการหรือสินค้าย้อนกลับไม่ได้และกระทบรายงานย้อนหลังทันที (F-08)

### 3 เรื่องที่ควรแก้ก่อนพัฒนาต่อ
1. ~~**ทำ "flow การขาย" เป็น atomic RPC**~~ — ✅ **เสร็จใน 0012** (`stock_sale_create`/`reverse`/`summary`, Model A gross, ตัด `qty_remaining` + `status` + snapshot ต้นทุน + guard triggers)
2. ~~**เพิ่ม `unique(user_id, sku)` + เปลี่ยนวิธี gen SKU**~~ — ✅ **เสร็จใน 0011** (unique + `stock_sku_config.next_seq` counter + retry)
3. ~~**รวม timezone ให้เป็นระบบเดียว**~~ — ✅ **เสร็จใน 0010** (Asia/Bangkok ทั้ง RPC + column default)

---

## 2. Tech Stack & Dependencies

เวอร์ชันจาก `package.json` (lockfile `package-lock.json` มีอยู่, ระบุ `^` ranges — เวอร์ชัน exact ต้องดู lockfile ราย package; ด้านล่างคือ range ที่ประกาศ)

| ชั้น | เทคโนโลยี | เวอร์ชัน |
|---|---|---|
| Build/bundler | Vite | `^6.0.7` |
| UI | React / React DOM | `^18.3.1` |
| ภาษา | TypeScript | `^5.7.2` (strict, `noUnusedLocals/Parameters`) |
| Routing | react-router-dom | `^6.28.1` |
| Data/cache | @tanstack/react-query | `^5.62.11` |
| Backend SDK | @supabase/supabase-js | `^2.47.10` |
| Icons | @tabler/icons-react | `^3.28.1` |
| Offline store | idb (IndexedDB) | `^8.0.0` (ยังไม่ถูกใช้ — ดู F-06) |
| PWA | vite-plugin-pwa | `^0.21.1` |
| CSS | tailwindcss | `^3.4.17` + postcss/autoprefixer |
| Deploy/runtime | wrangler (Cloudflare Workers) | `^4.112.0` |

- **Backend จริง**: Supabase (Postgres + Auth email/password + Storage) — ไม่มี Prisma, migration เป็น raw SQL รันมือใน SQL Editor
- **ไม่มี**: test framework, ESLint, prettier, form/validation lib (zod ฯลฯ), state manager อื่นนอกจาก React Query + React context
- **จุดสังเกต**: มี comment `eslint-disable` ในโค้ด (`useAuth.tsx:63`) แต่ไม่มี ESLint ติดตั้งจริง

---

## 3. โครงสร้างโปรเจกต์

```
stash-web/
├─ index.html                 SPA entry (Google Fonts, ไม่มี inline script → CSP script-src 'self')
├─ vite.config.ts             Vite + PWA manifest (th, theme mint) + workbox precache (ไม่ cache Supabase)
├─ wrangler.jsonc             Cloudflare Worker: assets=./dist, run_worker_first=true (ให้ security header ครอบทุก response)
├─ tsconfig.*.json            app / node / worker แยกกัน (worker exclude จาก tsconfig.app)
├─ .env.example               VITE_SUPABASE_URL / _ANON_KEY (build var), ANTHROPIC_API_KEY (runtime secret)
│
├─ src/
│  ├─ main.tsx / App.tsx      bootstrap: QueryClient → AuthProvider → ToastProvider → RouterProvider
│  ├─ router.tsx              10 จอ; tabbed อยู่ใต้ <AppLayout>, full-screen flows (add/intake/queue) แยก
│  │
│  ├─ lib/                    ชั้น utility ไร้ side-effect ทาง UI
│  │  ├─ supabase.ts          singleton client (อ่าน env, throw ถ้าไม่ครบ)
│  │  ├─ database.types.ts    ⚠️ GENERATED (supabase gen types) — ห้ามแก้มือ (Convention 20)
│  │  ├─ db.ts                app aliases/RPC arg-result derive จาก generated (ที่เขียนเองอยู่ที่นี่)
│  │  ├─ dates.ts             todayISO()/monthBounds()/dayOfMonthISO() — Asia/Bangkok เสมอ (F-26)
│  │  ├─ format.ts            เงินบาท (th-TH), เดือน พ.ศ.
│  │  ├─ ledger.ts            predicate กลางจัดประเภท transaction (0012) — แหล่งเดียว
│  │  ├─ storage.ts           อัปโหลด/sign รูปสต็อก (validate type/size ฝั่ง client)
│  │  ├─ errors.ts            แปลง error → ข้อความไทย (map ตาม SQLSTATE)
│  │  ├─ offlineQueue.ts      IndexedDB outbox — ⚠️ dead code, ไม่ถูก import (F-06)
│  │  ├─ prefs.ts             AI prefs ใน localStorage (ยังไม่ wire)
│  │  └─ icons.tsx            (sku.ts ถูกลบใน 0011 → preview ใช้ RPC stock_sku_preview)
│  │
│  ├─ hooks/                  ทุกการอ่าน/เขียน DB ผ่าน TanStack Query อยู่ที่นี่
│  │  ├─ useAuth.tsx          Auth context (session, signIn/signUp/signOut)
│  │  ├─ useHome.ts           useMonthTransactions + computeHomeSummary (pure)
│  │  ├─ useHistory.ts        useInfiniteQuery (paged 50), groupByDay
│  │  ├─ useAddTransaction / useTransactions   insert/update/delete รายการ
│  │  ├─ useStock / useStockIntake / useQueue  อ่าน/สร้าง/แก้/ลบ stock item
│  │  ├─ useStockSale / useStockSales / useSku  ขาย/ย้อน/สรุปยอด + SKU preview (0011/0012)
│  │  └─ useBudgets / useRecurring / useLookups / useSettings
│  │
│  ├─ components/             UI ล้วน (bottom sheet, hero, managers, charts, toast)
│  ├─ pages/                  10 จอ
│  └─ worker/
│     ├─ index.ts             fetch handler: /api/* → route, อื่น → ASSETS; ครอบ security headers
│     ├─ security.ts          CSP + HSTS + X-Frame-Options ฯลฯ (single source)
│     ├─ ai.ts                /api/ai — stub, คืน 501/503 (ยังไม่ทำ)
│     └─ json.ts
│
└─ supabase/migrations/       0001 schema+RLS · 0002 seed · 0003 storage · 0004 intake RPC ·
                              0005 budgets · 0006 stock delete RPC · 0007 recurring RPC ·
                              0008 security hardening · 0009 value constraints ·
                              0010 timezone fix · 0011 sku config · 0012 stock sale  (additive-only)
```

**Data flow (อ่าน)**: Component → hook (`useQuery`) → `supabase.from(...).select()` (RLS กรองตาม uid) → pure compute (`computeHomeSummary`) → render
**Data flow (เขียน)**: Component → hook (`useMutation`) → `supabase.insert/update/rpc` → `onSuccess: invalidateQueries(['transactions'|'stock_items'|...])` → refetch อัตโนมัติ

**การแยก layer**: ดี — ไม่พบ business logic การเงินฝังใน component (ยกเว้นการจัดรูปแบบเล็กน้อย) การ aggregate ทั้งหมดเป็น pure function ที่ test ได้ **จุดที่ logic กระจาย**: กติกา "needs_details" อยู่สองที่ (`computeNeedsDetails` ใน `StockFields.tsx:120` ใช้ตอน intake, แต่ `useQueue.missingTags` + logic ใน `useUpdateStockItem` คำนวณซ้ำอีกชุด) — ควรรวมเป็นแหล่งเดียว

---

## 4. Data Model

ทุกตารางมี `id uuid pk`, `user_id` (default `auth.uid()`, FK → `auth.users` ON DELETE CASCADE), `created_at/updated_at` (trigger `set_updated_at`), และ RLS 4 policy (select/insert/update/delete) แบบ `auth.uid() = user_id` ให้ `authenticated` เท่านั้น

```mermaid
erDiagram
    auth_users ||--o{ wallets : owns
    auth_users ||--o{ categories : owns
    auth_users ||--o{ transactions : owns
    auth_users ||--o{ stock_items : owns
    auth_users ||--o{ stock_sales : owns
    auth_users ||--o{ budgets : owns
    auth_users ||--o{ favorites : owns
    auth_users ||--o{ recurring : owns

    categories ||--o{ transactions : "category_id (RESTRICT)"
    wallets    ||--o{ transactions : "wallet_id (RESTRICT)"
    categories ||--o{ budgets : "category_id (CASCADE)"
    categories ||--o{ favorites : "category_id (SET NULL)"
    categories ||--o{ recurring : "category_id (SET NULL)"
    wallets    ||--o{ recurring : "wallet_id (SET NULL)"

    transactions ||--o| stock_items : "stock_item_id (SET NULL)"
    stock_items  ||--o| transactions : "source_transaction_id (SET NULL)"
    stock_items  ||--o{ stock_sales : "stock_item_id (RESTRICT)"
    transactions ||--o| stock_sales : "sale_transaction_id (SET NULL)"

    transactions {
        uuid id PK
        enum type "income|expense"
        numeric amount "(14,2) >= 0"
        uuid category_id FK "RESTRICT"
        uuid wallet_id FK "RESTRICT"
        date date "default current_date"
        bool is_stock_purchase "true=สินทรัพย์ ตัดออกจากยอดจ่าย"
        uuid stock_item_id FK "SET NULL"
    }
    stock_items {
        uuid id PK
        text name
        numeric cost_per_unit "(14,2) >= 0"
        int qty_total ">= 0"
        int qty_remaining ">= 0, <= qty_total"
        numeric target_price "nullable >= 0"
        text sku "⚠️ ไม่ unique"
        enum status "in_stock|partial|sold"
        bool needs_details
        text_arr photos
        uuid source_transaction_id FK "SET NULL"
    }
    stock_sales {
        uuid id PK
        uuid stock_item_id FK "RESTRICT"
        uuid sale_transaction_id FK "SET NULL"
        int qty_sold "> 0"
        numeric sale_price "(14,2) per unit >= 0"
        numeric profit "(14,2) app-computed"
    }
    wallets {
        uuid id PK
        text name
        enum type "cash|bank|promptpay"
        numeric balance "(14,2) — ลบใน 0011 (F-05)"
    }
    budgets {
        uuid id PK
        uuid category_id FK "CASCADE"
        date month "วันที่ 1 ของเดือน"
        numeric amount ">= 0"
        unique user_category_month
    }
    recurring {
        uuid id PK
        text schedule "daily|weekly:dow|monthly:day"
        date next_run
        bool active
    }
```

**Index ที่มี**: `transactions(user_id, date desc)`, `transactions(category_id)`, `transactions(stock_item_id)`, `stock_items(user_id, status)`, partial index `stock_items(user_id) where needs_details`, `stock_sales(stock_item_id)`, `stock_sales(user_id)`, `budgets(user_id, month)`, + `*_user_idx` ทุกตาราง

**ประเด็น data model**
- **`stock_items.sku`**: มี `unique(user_id, sku)` + `not null` แล้ว (0011, ปิด F-02)
- **`wallets.balance numeric(14,2)`** เป็น dead field — **ไม่มีโค้ดใดอ่านหรือเขียน** (ยืนยันทั้ง read + write path); รายการผูก `wallet_id` เป็นแค่ป้ายกำกับ → **ลบทิ้งใน 0011 (F-05, PR #30)**
- **ไม่มี index บน `transactions(wallet_id)`** ทั้งที่ FK เป็น RESTRICT (ตอนลบ wallet ต้อง scan) — โหลดน้อยสำหรับ user เดียวจึงไม่วิกฤต
- **`stock_sales`** ถูกเขียนโดย `stock_sale_create` (0012) แล้ว — มี `cost_at_sale`/`cogs_transaction_id`/`sold_on` เพิ่ม; ทุกแถวผูก income + COGS transaction
- FK policy ออกแบบมาดี: ledger (category/wallet) เป็น RESTRICT กันข้อมูลสรุปพัง, การผูก stock↔transaction เป็น SET NULL กันเงินหาย, budget เป็น CASCADE (config)

---

## 5. Domain Rules ที่โค้ดใช้อยู่จริง *(ส่วนสำคัญที่สุดสำหรับ context ต่อ)*

### กฎการเงิน
1. **เงินเป็น `numeric(14,2)` ใน DB** (สตางค์ผ่าน 2 ตำแหน่งทศนิยม) — ไม่ใช่ float ฝั่ง DB; แต่ฝั่ง JS อ่านเป็น `number` (float) แล้วคำนวณ/แสดงผล (`useStock.ts:90-92`) การคูณ/ลบเพื่อโชว์กำไรทำใน JS
2. **keypad จำกัดทศนิยม 2 ตำแหน่ง และตัวเลขรวม ≤ 9 หลัก** (`AddPage.tsx` `press()`), ไม่มี leading zero
3. **การซื้อเข้าสต็อก = รายจ่ายประเภทสินทรัพย์**: `is_stock_purchase=true`, `amount = cost_per_unit * qty` (คำนวณเป็น numeric ใน RPC `0004:54`)
4. **ทุกยอดสรุป/งบ ตัด `is_stock_purchase=true` ออก**: `computeHomeSummary` (safe-to-spend, donut, trend), `useMonthSpending`, `useBudgets`, history filter `expense` — **consistent ทุกที่** กำไรรับรู้ทีหลังตอนขาย (แต่ยังไม่มี flow ขาย)
5. **safe-to-spend = income − expense (เดือนนั้น)** ไม่ใช่ยอดกระเป๋าจริง (`useHome.ts` `computeHomeSummary`) — "balance" บน WalletHero คือค่านี้
6. **deltaPct เทียบเดือนก่อน** คืน `null` เมื่อ `prevSafe <= 0` (เดือนก่อนไม่มีข้อมูลหรือติดลบ)
7. **budget pace**: `over` เมื่อ used > budget; `fast` เมื่อ ratio > (สัดส่วนวันที่ผ่านไป × 1.1); ที่เหลือ `on_track` (`computePace`)
8. **ไม่มี VAT / ภาษี / ส่วนลด / ค่าธรรมเนียม** ในระบบเลย — เป็น personal tracker ตรงๆ
9. **ไม่มีการรักษายอดคงเหลือต่อกระเป๋า** (ดูข้อ data model)
10. **backdate ได้ถึงวันนี้** (`max={today}`) แต่ห้ามอนาคต

### กฎสต็อก
11. **intake เป็น atomic**: 1 ครั้งสร้าง (a) expense `is_stock_purchase=true` (b) stock_item `qty_total=qty_remaining=qty, status='in_stock'` (c) ผูก 2 ทาง ผ่าน RPC `stock_intake_create` (`security invoker`, RLS บังคับ)
12. **SKU (0011)**: default `STZ-<BRAND3>-<seq4>` แต่**ตั้งค่าได้ต่อ user** ผ่าน `stock_sku_config` (prefix/ความยาวแบรนด์/จำนวนหลัก/ตัวคั่น); seq = `next_seq` counter (forward-only, ไม่พึ่ง count), unique + retry ตอนชน; ประกอบด้วยฟังก์ชันกลาง `stock_sku_build` (เรียกจากทั้ง intake + preview)
13. **needs_details = true** เมื่อขาด อย่างใดอย่างหนึ่งใน {รูป, ไซซ์, สี, สภาพ, ราคาขาย} (`computeNeedsDetails`) — item เข้า "คิวรอเติมรายละเอียด" (`/stock/queue`); เติมครบแล้ว flag เป็น false อัตโนมัติตอน update (`useQueue.useUpdateStockItem`)
14. **ลบ stock item เป็น atomic**: RPC `stock_item_delete` ลบ item + expense ต้นทาง (`is_stock_purchase=true`) ในคำสั่งเดียว **แต่บล็อกถ้ามี `stock_sales`** (กันประวัติกำไรหาย) — ทั้ง guard ในฟังก์ชันและ FK RESTRICT (defence in depth)
15. **hero สต็อก**: `costValue = Σ cost_per_unit × qty_remaining` (เฉพาะ status ≠ sold); `pendingProfit = Σ (target_price − cost_per_unit) × qty_remaining` (`computeStockHero`)
16. **ขายเป็น atomic (Model A gross, `stock_sale_create` 0012)**: 1 การขาย = (a) income = `sale_price×qty` หมวด `system_key='stock_sale_income'` (b) expense COGS = `cost_per_unit×qty` หมวด `system_key='stock_cogs'`, `is_stock_cogs=true`, wallet null (c) ตัด `qty_remaining`, set `status` (0=sold, <total=partial) (d) เขียน `stock_sales` พร้อม snapshot `cost_at_sale`+`sold_on`+`profit=(price−cost)×qty`. คำนวณเงินใน SQL ทั้งหมด, lock item ด้วย `for update`, วันที่ Asia/Bangkok (ห้ามอนาคต)
17. **โมเดลบัญชี Model A**: `safe-to-spend = income − expense` **คงสูตรเดิม** — COGS (is_stock_purchase=false) นับใน expense/donut/เงินออก ตามปกติ, netไปกับ income ขายเหลือ = กำไรพอดี; **ตัด COGS ออกจาก budget เท่านั้น** (`isBudgetSpendingRow`). ขายขาดทุนได้ (ledger บวกทั้งคู่, `stock_sales.profit` ติดลบ)
18. **ย้อนการขาย (`stock_sale_reverse`)**: ลบ `stock_sales` **ก่อน** แล้วลบ income+COGS txn (ผ่าน guard SECTION 8 เพราะ reference หายก่อน), คืน `qty_remaining` + status; lock sale row ด้วย `for update` กันคืนซ้ำ
19. **snapshot ต้นทุน**: หลังมีการขาย trigger กัน `cost_per_unit`/`qty_total` เปลี่ยน (SECTION 6); การตีมูลค่าการขายเดิมใช้ `cost_at_sale` ไม่กระทบจากการแก้ทีหลัง
20. **หมวด system**: `ขายสต็อก`(income) + `ต้นทุนขายสต็อก`(expense) เป็น `is_system=true` (ลบไม่ได้ — trigger SECTION 7), resolve ด้วย `system_key` ตอน runtime (ห้าม match ชื่อไทย); ซ่อนจาก AddPage เฉพาะ `stock_cogs` (ขายสต็อกยังบันทึกมือได้)

### กฎ recurring
21. **schedule เข้ารหัสเป็น string**: `daily` / `weekly:<dow>` (advance +7 วันเสมอ, dow เป็นแค่ label) / `monthly:<day>` (clamp วันตามความยาวเดือน, เก็บวันเดิมไว้เพื่อคืนค่า เช่น 31 ม.ค.→28 ก.พ.→31 มี.ค.)
22. **materialize ตอนโหลดแอป**: `recurring_run_due()` ถูกเรียกครั้งเดียวต่อ load (`useRunRecurringOnLoad`), backfill ทุก occurrence ที่ค้าง (cap 500/call), advance `next_run`, ใช้ `for update skip locked` กันยิงซ้ำจากหลาย tab; schedule ที่ parse ไม่ได้ → set `active=false`
23. **error จาก `recurring_run_due` ถูกกลืนเงียบ** (เผื่อยังไม่รัน migration 0007) — `useRecurring.ts:104`

### กฎ auth/ownership
24. **RLS ทุกตาราง**: `auth.uid() = user_id` — anon เข้าไม่ถึง; anon key ปลอดภัยฝั่ง client เพราะ RLS
25. **seed อัตโนมัติตอน signup** ผ่าน trigger `on_auth_user_created` → `seed_defaults_internal` (locked down, เรียกตรงไม่ได้); แจก **3 wallets + 12 categories** = expense 8 (รวม stock 2 + `ต้นทุนขายสต็อก` system) + income 3 (รวม `ขายสต็อก` system) + seed `stock_sku_config` (0011/0012) — user ใหม่ขาย/รับเข้าคลังได้ทันที
26. **storage แยกตาม uid**: path `<user_id>/<...>`, RLS ตรวจ segment แรก = `auth.uid()`, bucket private, จำกัด image type + 10MB (0009)

---

## 6. Feature Inventory

| ฟีเจอร์ | สถานะ | ไฟล์หลัก |
|---|---|---|
| Auth (email/password sign-in) | ✅ เสร็จ | `useAuth.tsx`, `LoginPage.tsx`, `RequireAuth.tsx` |
| Sign-up UI | ⚠️ ไม่มี UI (มี `signUpWithPassword` แต่ไม่ถูกเรียก — single user) | `useAuth.tsx:48` |
| หน้าหลัก (สรุปเดือน + trend + donut) | ✅ เสร็จ | `HomePage.tsx`, `useHome.ts`, `WalletHero.tsx`, `charts.tsx` |
| เพิ่มรายการ (keypad + หมวด + กระเป๋า + favorite) | ✅ เสร็จ | `AddPage.tsx`, `useAddTransaction.ts` |
| ประวัติ (paged + filter + ค้นหา + group รายวัน) | ✅ เสร็จ (ค้นหาเฉพาะ note) | `HistoryPage.tsx`, `useHistory.ts` |
| แก้ไข/ลบรายการ | ✅ เสร็จ (stock row = read-only บางฟิลด์) | `TransactionEditSheet.tsx`, `useTransactions.ts` |
| รับเข้าสต็อก (intake + โหมดรวบรวม + รูป + SKU preview) | ✅ เสร็จ | `StockIntakePage.tsx`, `useStockIntake.ts`, `0004` |
| คลังสินค้า (list + filter + ค้นหา + hero) | ✅ เสร็จ | `StockPage.tsx`, `useStock.ts` |
| แก้ไข/ลบสินค้า | ✅ เสร็จ | `StockEditSheet.tsx`, `0006` |
| คิวเติมรายละเอียด | ✅ เสร็จ | `StockQueuePage.tsx`, `useQueue.ts` |
| **ขายสินค้า / ตัดสต็อก / รับรู้กำไร** | ✅ เสร็จ (0012, Model A) | `stock_sale_create` `0012`, `useStockSale.ts`, `StockEditSheet.tsx` |
| ย้อนการขาย (reverse) | ✅ เสร็จ (0012) | `stock_sale_reverse`, `useStockSale.ts`, `StockEditSheet.tsx` |
| stat ยอดขาย/กำไรเดือนนี้ | ✅ เสร็จ (0012) | `stock_sales_summary`, `useStockSales.ts`, `StockPage.tsx` |
| แท็บ "ขายแล้ว" | ✅ ทำงาน (status → partial/sold ตอนขาย) | `StockPage.tsx`, `stock_sale_create` |
| งบประมาณต่อหมวด/เดือน | ✅ เสร็จ | `BudgetPage.tsx`, `useBudgets.ts`, `0005` |
| รายการโปรด (favorites) | ✅ เสร็จ | `FavoritesManager.tsx`, `useLookups.ts` |
| รายการประจำ (recurring) | ✅ เสร็จ | `RecurringManager.tsx`, `useRecurring.ts`, `0007` |
| ตั้งค่า (หมวด/กระเป๋า) | ✅ เสร็จ | `SettingsPage.tsx`, `useSettings.ts` |
| ยอดคงเหลือต่อกระเป๋า | 🔴 ไม่มี (field `balance` ลบทิ้งแล้วใน 0011) | `wallets` |
| PWA (installable, precache app shell) | ✅ เสร็จ | `vite.config.ts` |
| Offline write-queue (sync เมื่อกลับ online) | 🔴 dead code (ไม่ถูก import) | `offlineQueue.ts` |
| AI (พิมพ์/พูด, สแกน, auto-category) | 🔴 stub (UI disabled, `/api/ai` คืน 501) | `worker/ai.ts`, `prefs.ts`, `AddPage.tsx` |
| Security headers / CSP | ✅ เสร็จ | `worker/security.ts` |

---

## 7. Findings

| ID | Severity | หมวด | ปัญหา | ไฟล์:บรรทัด | ผลกระทบ | แนวทางแก้ |
|---|---|---|---|---|---|---|
| F-01 | ✅ Resolved | D/E ฟีเจอร์ | **ไม่มี flow การขาย/ตัดสต็อกเลย** (เดิม) | `stock_sale_*` `0012`, `useStockSale.ts`, `StockEditSheet.tsx` | — | **แก้แล้วใน 0012 (PR)** — `stock_sale_create`/`reverse`/`summary` atomic (Model A): income+COGS, ตัด qty + status, snapshot ต้นทุน, ย้อนได้ + trigger กันแก้/ลบรายการขายตรง |
| F-02 | ✅ Resolved | B/D | **SKU ไม่ unique + race + ซ้ำหลังลบ** (เดิม) | `0011_sku_config.sql` | — | **แก้ใน 0011**: `unique(user_id, sku)` + `stock_sku_config.next_seq` counter (ไม่พึ่ง count) + retry ตอนชน + `sku not null` |
| F-03 | ✅ Resolved | C | **Timezone client/server ไม่ตรง** (เดิม) | `0010_timezone_fix.sql` | — | **แก้ใน 0010**: `stock_intake_create`/`recurring_run_due` + `transactions.date` default ใช้ `(now() at time zone 'Asia/Bangkok')::date` |
| F-04 | ✅ Resolved | G | **Photo upload / บันทึกล้มเหลวเงียบใน edit sheet** (เดิม) | `StockEditSheet.tsx`, `errors.ts` | — | **แก้ใน PR A:** `onAddPhotos` toast อยู่แล้ว; เพิ่ม try/catch + `toast.error(translateError)` ที่ `save()`/`remove()` (เดิม `save` ไม่มี catch → unhandled rejection; `remove` เป็น `catch {}`); ลบการ render `(update.error as Error).message` ดิบทิ้ง (แปล + กันหลุด message ต้นทาง) |
| F-05 | ✅ Resolved | B/D | **`wallets.balance` เป็น dead field** — ไม่เคยอ่าน/เขียน (ยืนยัน read+write path แล้ว) | `database.types.ts`, `0001` wallets | — | **แก้แล้วใน 0011 (PR #30):** `drop column wallets.balance` + เอาออกจาก `seed_defaults_internal` + `database.types.ts` (ตัดสินใจข้อ (ก) ลบทิ้ง) — รอ apply |
| F-06 | 🟠 Medium | A/I | **Offline queue เป็น dead code** — `offlineQueue.ts` (enqueue/pending/…) ไม่ถูก import ที่ใด แต่ README/vite comment โฆษณา "offline-first write-queue" | `offlineQueue.ts` ทั้งไฟล์, `useQueue.ts` (คนละเรื่อง) | เขียน offline ไม่ถูก queue จริง — mutation ตอนไม่มีเน็ตจะ fail; ความคาดหวังไม่ตรงกับความจริง | wire เข้ากับ mutation hooks (part 5 ที่ยังไม่ทำ) หรือปรับ README ให้ตรงสถานะ |
| F-07 | 🟢 Low (เกือบครบ) | J | **ไม่มี test / ESLint / CI** (เดิม) | `.github/workflows/ci.yml`, `vitest.config.ts`, `*.test.ts` | — | **CI (#32)**: `npm run build` ทุก PR/push · **Test แก้ใน PR B:** Vitest 26 เคส คลุม `lib/ledger` ทุก predicate, `computeHomeSummary` (ซื้อเข้าสต็อกไม่นับจ่าย / COGS นับจ่าย / ขายกำไร-ขาดทุน safeToSpend ขยับเท่ากำไรสุทธิ), `computeStockHero` (qty_remaining/sold), `computePace` (over/fast/on_track + COGS ไม่เข้างบ), `computeNeedsDetails`; ต่อ CI (`npm test`); พิสูจน์ fail ได้จริง (แก้ `isSpendingRow` ให้ผิด → แดง 5 เคส แล้ว revert) · **ยังเหลือ**: ESLint จริง (F-24) |
| F-08 | 🟡 Low | E | **Hard delete ทั้งหมด ไม่มี soft delete/audit** — ลบรายการ/สินค้าหายถาวร, ไม่มี log | `useTransactions.ts` delete, `0006` | ลบผิดกู้ไม่ได้; ไม่มีร่องรอยตรวจสอบย้อนหลัง | พิจารณา `deleted_at` + กรองทุก query, หรือ export/backup ก่อนลบ (single-user จึงไม่วิกฤต) |
| F-09 | 🟡 Low | F | **การกันแก้/ลบ stock-purchase เป็น UI-only** — server (RLS) ยอมให้เจ้าของลบ expense ต้นทางตรงๆ ได้ ทำให้ stock item กำพร้า (`source_transaction_id` → null) | `useTransactions.ts:useDeleteTransaction`, guard อยู่แค่ `TransactionEditSheet.tsx` | เรียก API ตรง/ผ่าน client ที่ถูกแก้ ลบ expense ได้ → เงินหาย stock ค้าง (single-user เสี่ยงต่ำ) | ย้าย guard ลง DB: trigger บล็อกลบ transaction ที่ `is_stock_purchase=true` หรือให้ผ่าน RPC เท่านั้น |
| F-10 | 🟡 Low | C/I | **คำนวณเงินฝั่ง client เป็น JS float** (`Number(...)` แล้วคูณลบ) | `useStock.ts:90-92`, `StockIntakePage.tsx` profit | อาจมี floating error เล็กน้อยตอนแสดงผล (0.1+0.2); ยังไม่กระทบข้อมูลที่บันทึก (DB numeric) | คำนวณยอดที่บันทึกจริงใน SQL/numeric เสมอ (intake ทำถูกแล้ว); ระวังตอนทำ flow ขาย |
| F-11 | 🟡 Low | H/UX | **ค้นหาประวัติจับเฉพาะ `note`** (`ilike '%q%'`) ไม่รวมชื่อหมวด/จำนวน | `useHistory.ts` | ค้นหาไม่เจอตามที่ผู้ใช้คาด | ขยาย search ให้รวม category name (ผ่าน join filter) ถ้าจำเป็น |
| F-12 | ✅ Resolved | I | **`database.types.ts` เขียนมือ + `Relationships: []` ทุกตาราง** (เดิม) | `database.types.ts` (generated), `db.ts` (ใหม่) | — | **แก้ใน PR C:** แทนที่ด้วย `supabase gen types typescript` ทั้งก้อน (Relationships ครบ → embed resolve typed) · app aliases/RPC arg-result ย้ายไป `src/lib/db.ts` (derive จาก generated ผ่าน `Tables`/`Enums`) → regenerate ทับไม่โดนของเขียนเอง · `Insert` เป็น required field จริง (เดิม `Partial<T>`) — build ผ่าน = ทุก insert ครบ field |
| F-13 | 🟡 Low | F | **CSP ใช้ wildcard `*.supabase.co`** + `style-src 'unsafe-inline'` | `worker/security.ts` | หลวมกว่าที่ควร (ยอมรับได้/มี comment เตือนแล้ว) | pin เป็น `<ref>.supabase.co` ตอน deploy จริง |
| F-14 | ✅ Resolved | G | **`recurring_run_due` error กลืนเงียบถาวร** (เดิม) | `useRecurring.ts` | — | **แก้ใน PR A:** ตัดเงื่อนไข silent ทิ้งทั้งหมด (0007/0008 apply แล้ว ฟังก์ชันมีจริง เงื่อนไขตายแล้ว) → error ทุกชนิด → `toast.error('รายการประจำไม่ทำงาน: …')` ผ่าน `translateError`; ไม่จับด้วย substring อีก (Convention 18) |
| F-15 | 🟠 Medium | J | **Migration hand-run ไม่มี ledger + ไฟล์ที่ apply แล้วเคยถูกแก้ + ฟังก์ชันถูก redefine ข้ามไฟล์** — 0002 ถูกแก้หลัง commit แรก (search_path), seeder ถูก `create or replace` ซ้ำใน 0008, รันมือใน SQL Editor ไม่มีบันทึกว่า apply ไฟล์ไหน/เมื่อไหร่ | `0002`/`0008` seed, git log | พิสูจน์ไม่ได้ว่า DB ตรงกับไฟล์เวอร์ชันใด → กระทบทุกครั้งที่ reproduce function จากไฟล์ (เช่น 0011) | **เริ่มแก้ใน 0011 (PR #30):** ตาราง `schema_migrations` self-record ทุก migration; + ห้ามแก้ไฟล์ที่ apply แล้ว (เขียนใหม่แทน); พิจารณา Supabase CLI migrations |
| F-16 | ✅ Resolved | G | **หน้า intake ไม่มี empty-state เมื่อ user ลบหมวด stock หมด** (เดิม) | `StockIntakePage.tsx` | — | **แก้ใน PR D:** `noStockCategory = !catsQ.isLoading && stockCategories.length===0` → early-return empty-state (อธิบาย + ปุ่ม "ไปสร้างหมวดสต็อก" → `/settings`) แทน dropdown ว่าง |
| F-19 | 🟠 Medium | J | **`npm run typecheck`/`lint` เป็น no-op** — `tsc --noEmit` รันบน `tsconfig.json` แบบ solution-style (`files:[]` + references) → **ตรวจ 0 ไฟล์ ผ่านเสมอ**; ตัวจริงคือ `tsc -b` (ใน `npm run build`) | `tsconfig.json`, `package.json:scripts` | เชื่อ typecheck ที่ไร้ความหมาย → type error หลุดถึง production (เกิดจริง PR #31) | **แก้ใน PR นี้**: `typecheck`/`lint` → `tsc -b`; CI (#32) รัน `npm run build` แล้ว; Convention: ห้ามพูด "ผ่าน" ถ้าไม่รันคำสั่งเดียวกับ CI |
| F-20 | ✅ Resolved | H/I | **embed `as unknown as` กลบ type ในไฟล์คำนวณเงิน** (เดิม) | `useHome.ts`, `useBudgets.ts`, `useHistory.ts` | — | **แก้ใน PR C:** ลบ `as unknown as` ทั้ง 3 จุด (recent tx, budgets, history) + `as MonthRow[]`/`as StockItem[]` ที่ redundant → embed `category:categories(...)` resolve typed ตรงกับ `RecentRow`/`BudgetRow`/`HistoryRow` (build ผ่าน = query ถูก ไม่ใช่แค่ cast บัง); grep ยืนยันไม่เหลือ `as unknown as`/`as any` ในไฟล์คำนวณเงิน · **ผลข้างเคียง: query ทั้งหมด "ถูกต้องมาตลอด"** — cast บังความถูก ไม่ใช่บั๊ก (ดู F-28/F-29 ที่โผล่จริง) |
| F-21 | 🟡 Low | H | **`useStockItems` ดึง `stock_sales` ทุกแถวมานับใน JS** — 2-query (items + sale ids) นับ per-item ฝั่ง client; ตอนนี้โอเค (ข้อมูลน้อย) แต่พอ sales โตจะกินแบนด์วิดท์ทุกครั้งที่เปิดหน้าคลัง | `useStock.ts:useStockItems` | โหลด stock list ช้าลง/เปลืองเมื่อมีการขายสะสมมาก | เปลี่ยนเป็น RPC aggregate (`count group by stock_item_id`) หรือ view เมื่อข้อมูลโต |
| F-22 | ✅ Resolved | G/F | **Login ไม่แยกสาเหตุ + Supabase paused = เงียบ** (เจอตอน project ถูก pause แล้วหน้า login ไม่บอกอะไร): (ก) `useAuth` แบน error เป็น `error.message` string ทิ้ง `code`/`status`/`name` → แยก network/paused/รหัสไม่ได้; (ข) `getSession()` ไม่มี `.catch` → paused/offline ทำให้ค้างหน้า splash ถาวร | `useAuth.tsx`, `LoginPage.tsx`, `errors.ts` | ผู้ใช้ (และเพื่อนที่จะเข้ามาใช้) ไล่สาเหตุเองไม่ได้ | **แก้ใน PR A:** คืน `AuthError` เต็มก้อน; `translateError` แยกกรณีผ่าน `code`/`status`/`name` (รหัสผิด**หรือ**อีเมลไม่มี = ข้อความเดียว "อีเมลหรือรหัสผ่านไม่ถูกต้อง" กัน enumeration ดู Convention 17 · ยังไม่ยืนยันอีเมล · ต่อไม่ได้-paused · อื่น ๆ + code); `getSession().catch()` → signed-out + `loading=false` เพื่อให้หน้า login ขึ้น |
| F-23 | ✅ Resolved | G | **`translateError` ทิ้งรหัสจริงในกรณี fallback** — error ที่ map ไม่ได้แสดง "เกิดข้อผิดพลาด" ล้วน debug ไม่ได้ | `errors.ts` | เพื่อนแจ้งได้แค่ "แอปพัง" ไม่มีรหัสให้ตาม | **แก้ใน PR A:** fallback แนบ `(รหัส …)` แบบ sanitise (เฉพาะ SQLSTATE/auth slug/HTTP status ที่ match `[A-Za-z0-9_.-]`) — ไม่หลุด message/URL/token ต้นทาง |
| F-24 | 🟡 Low | J | **ยังไม่มี ESLint จริง** — มี `eslint-disable` comment ในโค้ด (`useAuth.tsx`) แต่ไม่มี ESLint ติดตั้ง/รันใน CI (แยกจาก F-07 ส่วน test ที่ปิดใน PR B) | `package.json`, `.github/workflows/ci.yml` | จับ dead code / unused / bad pattern ไม่ได้อัตโนมัติ (tsc จับได้แค่ type) | เพิ่ม `eslint` + `typescript-eslint` + `eslint-plugin-react-hooks` แล้วต่อ CI (งานแยก) |
| F-25 | ✅ Resolved (Low) | C/H | **Trend line จัดวันผิด timezone** — `computeHomeSummary` ใช้ `new Date(r.date).getDate()` หา day-of-month; date-only string parse เป็น UTC midnight แล้ว `.getDate()` เลื่อนใน tz ติดลบ → วันที่ 1/วันสุดท้ายของเดือนตกคนละ bucket (ตระกูลเดียวกับ 0010) ปลอดภัยบน Bangkok/UTC แต่ผิดใน tz ติดลบ | `useHome.ts` | **ไม่กระทบผู้ใช้จริง** (ทุกคนอยู่ Asia/Bangkok, แค่กราฟ) → severity **Low**; เก็บ fix ไว้เพราะถูกและถูกกว่าปล่อยไว้ | **แก้ใน PR B (มี behavior fix ปนใน PR test):** อ่านวันจาก string ตรง ๆ (ตอนนี้ผ่าน `dayOfMonthISO` กลาง — F-26); เพิ่มเทสขอบเดือน ICT เขียวทุก TZ (พิสูจน์ด้วย TZ=Pacific/Honolulu → `getDate()` เดิมแดง) |
| F-26 | ✅ Resolved (Medium, ยังไม่กระทบผู้ใช้ปัจจุบัน) | C/H | **"วันนี้/เดือนนี้" คิดจาก timezone ของเครื่อง ไม่ใช่ Asia/Bangkok** — `monthBounds()`/`toISODate(new Date())` seed จาก device-local: (ก) หน้าต่างเดือนใน `useHome`/`useBudgets`/**`useStockSalesSummary`** (`p_from`/`p_to` เทียบ `sold_on` วันไทย) คลาด 1 วันตรงขอบเดือนถ้าเครื่องไม่ได้อยู่ ICT → **กระทบยอดเงิน ไม่ใช่แค่กราฟ** (การเทียบ membership เป็น string ถูก แต่ **ขอบหน้าต่างมาจาก device-local**); (ข) วันที่ default ของ transaction/sale = วันเครื่อง → ขาย 00:30 ICT จากเครื่อง UTC ได้วันที่เมื่อวาน | `dates.ts`, `useHome`/`useBudgets`/`useStockSales`/`useHistory`, `AddPage`/`StockEditSheet`/`TransactionEditSheet`/`RecurringManager`/`BudgetPage`/`HomePage`/`useAddTransaction` | ผู้ใช้ปัจจุบันทุกคนอยู่ ICT จึงยังไม่เพี้ยน แต่เป็น money-path + จะกระทบเพื่อนที่เข้ามาใช้/เดินทาง/ตั้งเครื่องผิดโซน | **แก้ใน PR B:** รวมศูนย์ที่ `dates.ts` — `todayISO`/`monthBounds`/`dayOfMonthISO`/`currentMonthAnchor` คิดเป็น Asia/Bangkok เสมอ (`Intl` `timeZone`); ทุก callsite เรียก helper เดียว ไม่มี `new Date()` หา today/month กระจายอีก; `useStockSalesSummary` ตรงกับ `sold_on` แล้ว; เพิ่ม `dates.test.ts` พิสูจน์ boundary เขียวทุก TZ (UTC+14…−10) + พิสูจน์ fail ได้จริง (device-local seed → July แดงใต้ UTC) |
| F-27 | ✅ Resolved (Low) | F/G | **`translateError` debug hint หลุด enumeration slug** — เจอตอนเขียนเทส `errors.test.ts` (PR B): fallback แนบ `(รหัส <code>)` ทุก code ที่ match slug pattern รวมถึง `email_exists`/`user_already_exists`/`user_not_found` ซึ่ง**ตัว slug เองบอกว่าอีเมลมี/ไม่มีบัญชี** (ขัด Convention 17) — จริง ๆ มาจาก signUp เท่านั้น (ยังไม่มี UI) แต่ยังเป็น branch ที่เผยได้ | `errors.ts` `debugHint` | เผย account existence ผ่านรหัส debug (ความเสี่ยงต่ำ เพราะยังไม่มีหน้า signup) | **แก้ใน PR B:** `ENUMERATION_CODES` denylist — code กลุ่มนี้ไม่ถูกแนบเป็น hint (fallback ไป status แทน); ล็อกด้วยเทส `errors.test.ts` |
| F-28 | ✅ Resolved (Low) | I | **ส่ง `null` ให้ optional RPC arg** — เจอตอน regenerate types (PR C): call `stock_intake_create`/`stock_sale_create`/`stock_sku_preview` ส่ง `p_category`/`p_brand`/`p_wallet_id`/`p_target_price`/`p_brand` = `null` แต่ DB ประกาศ `default null` → generated types เป็น `?: T` (omit ไม่ใช่ null) ของเดิม hand-written `Args` ยอม `\| null` เลยบัง | `StockIntakePage.tsx`, `StockEditSheet.tsx`, `useSku.ts` | **ไม่มีบั๊ก runtime** (default = null อยู่แล้ว) แค่ type ไม่ตรง signature จริง | **แก้ใน PR C:** เปลี่ยน `\|\| null` → `\|\| undefined` / `?? undefined` (omit → SQL default) ทุกจุด |
| F-29 | ✅ Resolved (Low) | I | **`StockItem.sku` เคยพิมพ์ `string \| null` ทั้งที่ DB `not null`** — hand-written type ผิด (0011 บังคับ `sku not null` + unique) generated แก้เป็น `string` | `db.ts` (`StockItem`), callsite `?? '—'` | fallback `item.sku ?? '—'`/`?? ''` กลายเป็น dead branch (ไม่พังแค่ซ้ำซ้อน) | **แก้ใน PR C:** type ถูกต้องแล้วจาก generated; คง fallback ไว้ (defensive, ไม่ churn) — ถ้าจะเก็บกวาดค่อยทำแยก |
| F-30 | ✅ Resolved | G/F | **ไม่มีหน้ากู้รหัสผ่าน** — ลืมรหัสทีต้อง reset ให้ใน dashboard เอง (บล็อกการเปิดให้เพื่อนใช้) | `ForgotPasswordPage.tsx`, `ResetPasswordPage.tsx`, `useAuth.tsx`, `auth.ts`, `router.tsx`, `LoginPage.tsx` | — | **แก้ใน PR D:** Supabase reset flow — `/forgot-password` (ส่งอีเมล) + `/reset-password` (รับ recovery session ผ่าน detectSessionInUrl → `updateUser({password})`) · **enumeration-safe** (Convention 17): ข้อความหลังส่ง = neutral "ถ้าอีเมลนี้มีบัญชี…" เสมอ ล็อกด้วย `auth.test.ts` · ต้องตั้งค่า dashboard (redirect URL allowlist) — ดู checklist ใน PR |

---

## 8. Convention & Glossary

### Naming pattern
- **Hooks**: `useXxx` (query) / `useCreateXxx`/`useUpdateXxx`/`useDeleteXxx`/`useUpsertXxx` (mutation)
- **Pure compute**: `computeXxx` (ไม่มี side-effect, รับ data → คืนสรุป) แยกจาก hook เพื่อ test ได้
- **RPC**: snake_case กริยา-นาม `stock_intake_create`, `stock_item_delete`, `recurring_run_due` — พารามิเตอร์ prefix `p_`, ตัวแปรใน function prefix `v_`
- **Query keys**: array ลำดับชั้น `['transactions','summary',userId,monthKey]` — ใช้ partial-match invalidation (`invalidateQueries({queryKey:['transactions']})` เคลียร์ทั้ง subtree)
- **Migration**: `NNNN_snake_name.sql` เลข 4 หลัก, **additive-only** (create/alter เท่านั้น ไม่ drop), idempotent (`if not exists` / `create or replace`), รันมือใน Supabase SQL Editor
- **ตาราง**: มาตรฐานคือ `id uuid pk default gen_random_uuid()` + `user_id` แยก **ยกเว้น** ตาราง config แบบ 1 แถว/user (เช่น `stock_sku_config`, 0011) ที่ตั้งใจใช้ **`user_id` เป็น PK** เพื่อบังคับ singleton ต่อ user — เบี่ยงจาก pattern โดยตั้งใจ ไม่ใช่เขียนผิด
- **เงิน**: `numeric(14,2)` ใน DB; แสดงผลผ่าน `formatBaht` (ไม่มีทศนิยม) / `formatBaht2` (2 ตำแหน่ง); เดือนใช้ พ.ศ. (`formatMonthLong`)
- **UI ภาษาไทยล้วน**, error แปลผ่าน `translateError` (map ตาม SQLSTATE ก่อน แล้วค่อย fragment); Tailwind ใช้ design token (`mint-deep`, `hairline`, `fill`, `expense`, `income`)

### Glossary โดเมน
| คำ | ความหมายในโค้ด |
|---|---|
| `is_stock_purchase` | รายจ่ายที่เป็นการซื้อสินค้าเข้าสต็อก = สินทรัพย์ → **ตัดออกจากยอดจ่าย/งบ** |
| safe-to-spend (คงเหลือ) | `income − expense` ของเดือน (ไม่ใช่ยอดกระเป๋า) |
| stock category | หมวดที่ `is_stock_category=true` → กดบันทึกแล้วเปิดฟอร์มสต็อกอัตโนมัติ |
| needs_details / คิว | สินค้าที่ยังขาดรูป/ไซซ์/สี/สภาพ/ราคาขาย → รอเติมที่ `/stock/queue` |
| intake / รับเข้าสต็อก | ซื้อเข้า 1 ครั้ง = expense + stock_item (atomic RPC) |
| pending profit / กำไรที่รอขาย | `(target_price − cost) × qty_remaining` (ประมาณการ, ยังไม่รับรู้) |
| SKU | `STZ-<BRAND3>-<seq4>` |
| favorite / รายการโปรด | preset กดเพิ่มรายการเร็ว (label + amount + category) |
| recurring | รายการประจำ materialize เป็น transaction ตอนโหลดแอป |

### Pattern ที่ควรทำตามเมื่อเขียนโค้ดใหม่
1. **การเขียนที่กระทบหลายตาราง → ทำเป็น RPC atomic** (`security invoker`, set `search_path=''`, ตรวจ `auth.uid()`) อย่าเขียนหลาย statement ต่อกันฝั่ง client
2. **ทุก mutation → `invalidateQueries` key ที่เกี่ยวข้องใน `onSuccess`**
3. **business logic การเงิน/สต็อก → แยกเป็น pure `computeXxx`** อย่าฝังใน JSX
4. **ยอดที่ **บันทึกจริง** ต้องคำนวณใน SQL/numeric** (ฝั่ง client คำนวณเพื่อแสดงผลได้ แต่ห้ามเป็นแหล่งความจริง)
5. **ตัด `is_stock_purchase=true` ออกจากทุกตัวเลขค่าใช้จ่าย/งบเสมอ** (ทำผิดจุดเดียว = ตัวเลขเพี้ยน)
6. **error → `translateError` + toast**; อย่าใช้ `catch {}` ว่าง (ดู F-04)
7. **migration ใหม่ = ไฟล์ใหม่ additive-only** อย่าแก้ไฟล์ที่ apply แล้วเด็ดขาด (F-15)
8. **RLS: user_id default `auth.uid()` + policy 4 ตัว** ทุกตารางใหม่
9. **ทุก migration ตั้งแต่ 0011 ต้อง self-record** ท้ายไฟล์ด้วย `insert into public.schema_migrations(version) values ('NNNN') on conflict do nothing;` (ledger บอกได้ว่า DB อยู่ที่ไฟล์ไหน — F-15)
10. **เปลี่ยน signature ของ function = `drop function <sig เต็ม>` ก่อน `create`** (ไม่ใช่ `create or replace` เฉย ๆ ไม่งั้นได้ overload ซ้อนเงียบ) แล้ว **re-grant** เพราะ drop ล้าง grant
11. **migration ที่เพิ่ม/ลบ RPC หรือคอลัมน์ → ปิดไฟล์ด้วย `notify pgrst, 'reload schema';`** (กัน PostgREST cache ค้าง → RPC 404 / payload 400)
12. **transaction ที่ผูกกับ `stock_sales` (income หรือ COGS ของการขาย) ห้ามแก้/ลบตรง** — ต้องผ่าน `stock_sale_reverse` เท่านั้น (บังคับด้วย trigger DB SECTION 8 ของ 0012 ไม่ใช่แค่ซ่อนปุ่ม); UI ล็อก amount/หมวด/วันที่ของแถวเหล่านี้ (ดู `isSaleLinkedRow`)
13. **การจัดประเภท transaction ใช้ `lib/ledger.ts` เป็นแหล่งเดียว** (`isIncomeRow`/`isSpendingRow`/`isBudgetSpendingRow`/`isSaleLinkedRow`/`isStockLinkedRow`) — ห้าม inline เงื่อนไข flag ซ้ำใน hook/component
14. **หมวด system** (`is_system`+`system_key`): resolve ด้วย `system_key` ตอน runtime เท่านั้น (ห้ามใช้ชื่อไทยที่ user แก้ได้), ลบไม่ได้ (trigger), backfill ครั้งเดียวใน migration ใช้ชื่อได้
15. **ตรวจ build ด้วย `npm run build` (= `tsc -b && vite build`) เท่านั้น ห้ามพูดว่า "ผ่าน" ถ้าไม่ได้รันคำสั่งเดียวกับ CI** — `npm run typecheck`/`lint` (`tsc --noEmit` บน `tsconfig.json` ที่ `files:[]`+references) **ตรวจ 0 ไฟล์** เชื่อไม่ได้ (F-19); CI (`.github/workflows/ci.yml`) รัน `npm run build` ทุก PR/push
16. **ห้าม `as unknown as` กลบ type ของ query** — ถ้า embed resolve ไม่ได้เพราะ hand-written types ให้ regenerate ด้วย `supabase gen types` หรือแยก query (F-12/F-20) อย่ากลบเพราะจะทำให้ query นั้นไม่ถูก typecheck
17. **กัน user enumeration** — login/กู้รหัสผ่าน ต้องตอบ**เหมือนกันเสมอ**ไม่ว่าอีเมลจะมีบัญชีจริงหรือไม่ Supabase คืน `invalid_credentials` ทั้งกรณีรหัสผิดและอีเมลไม่มีในระบบโดยตั้งใจ → แสดงข้อความเดียว "อีเมลหรือรหัสผ่านไม่ถูกต้อง"; หน้ากู้รหัส (reset) ต้องขึ้น "ถ้าอีเมลมีบัญชี จะส่งลิงก์ให้" เสมอ **`translateError` ห้ามมี case ที่บอกว่าอีเมลมี/ไม่มีบัญชี** (ตัด `email_exists`/`user_already_exists`/"already registered" ออกแล้ว)
18. **จับ error ด้วย `code`/`status` ไม่ใช่ substring ของ message** — ข้อความ upstream เปลี่ยนถ้อยคำเมื่อไหร่ก็พังเงียบ (บั๊กเดิม F-14) โดยเฉพาะเงื่อนไขที่ตัดสิน**พฤติกรรม** (เช่นเลือกกลืน/ไม่กลืน error) ห้ามพึ่ง substring เด็ดขาด — ข้อยกเว้นเดียวคือ connect-failure fallback (raw fetch `TypeError` ไม่มี code/status เลย) ซึ่งเป็น display-only ไม่กลืน error
19. **วันที่/เดือนทั้งแอปคิดเป็น Asia/Bangkok เสมอผ่าน `lib/dates.ts`** — ใช้ `todayISO()` (วันนี้), `monthBounds()` (หน้าต่างเดือน), `dayOfMonthISO(str)` (วันจาก string), `currentMonthAnchor()` (ป้ายชื่อเดือน) ห้ามใช้ `new Date()` หา "วันนี้/เดือนนี้" ตรง ๆ (= timezone เครื่อง) และห้ามเอา `'YYYY-MM-DD'` ไปผ่าน `new Date(...).getDate()/getMonth()` (parse เป็น UTC midnight → เลื่อนใน tz ติดลบ) ต้องตรงกับ DB ที่ใช้ Asia/Bangkok (0010) — F-25/F-26 *(display ที่รับ `new Date(str+'T00:00:00')` = local-midnight ปลอดภัยอยู่แล้ว)*
20. **`src/lib/database.types.ts` = ไฟล์ generated ห้ามแก้มือแม้บรรทัดเดียว** — สร้างจาก `supabase gen types typescript` (regenerate ทับทั้งไฟล์เมื่อ schema เปลี่ยน) type/alias/helper ที่เราเขียนเองทั้งหมด (row/enum alias, RPC arg-result เช่น `StockIntakeArgs`/`StockSaleArgs`) อยู่ที่ **`src/lib/db.ts`** derive จาก generated ผ่าน `Tables<'x'>`/`Enums<'x'>`/`Database['public']['Functions'][...]` เท่านั้น — regen จะไม่ทับของเขียนเอง และ schema drift จะเป็น compile error ทันที · **ห้าม `as unknown as`/`as any` กลบผล query** ให้ปล่อย type inference จาก typed client (F-12/F-20); optional RPC arg ที่ DB มี default → omit หรือ `undefined` **ห้ามส่ง `null`** (F-28)

---

## 9. ข้อจำกัดของ audit นี้

- **ไม่ได้รันจริง**: ไม่ได้ execute แอป, ไม่ได้ต่อ Supabase/ดู schema จริงใน DB, ไม่ได้ดู lockfile ราย package เพื่อยืนยันเวอร์ชัน exact — อ่านจาก source + migration files เท่านั้น สถานะจริงของ DB อาจต่างจาก migration ถ้ามีการแก้มือใน dashboard
- **timezone (F-03)**: แก้แล้วใน 0010 — RPC + column default บังคับ `(now() at time zone 'Asia/Bangkok')::date` จึงไม่พึ่ง `timezone` ของ DB session อีกต่อไป (ปิดประเด็นเดิม)
- **ไฟล์ที่อ่านผ่านๆ ไม่ละเอียดทุกบรรทัด**: `components/charts.tsx`, `WalletHero.tsx` (อ่านเฉพาะ props/logic ไม่ครบทุก animation), `AppLayout.tsx` (ครึ่งไฟล์), `CategoriesManager/WalletsManager/FavoritesManager/RecurringManager.tsx`, `ui.tsx`, `Toast.tsx`, `ConfirmDialog.tsx`, `icons.tsx`, `StockQueuePage.tsx`, `SettingsPage.tsx`, `BudgetPage.tsx`, `HistoryPage.tsx` (อ่าน hook แต่ไม่ทุกบรรทัด JSX) — อาจมี finding เล็กๆ ที่ตกหล่น
- **ไม่ได้ตรวจ**: accessibility (a11y) เชิงลึก, bundle size จริง (ไม่ได้ build), performance ภายใต้ข้อมูลจริงปริมาณมาก, พฤติกรรม PWA/service-worker ตอน update, การ handle session expiry/refresh token edge cases
- **ไม่ได้ประเมิน**: `index.html` (Google Fonts/meta) แบบละเอียด, `tailwind.config.ts` token ทั้งหมด, `public/` assets
- **บริบทผู้ใช้จาก prompt ไม่ครบ** (ช่อง "[เติมเอง]") — สรุป stack จากไฟล์จริงแทน; หากตั้งใจให้เป็น multi-user (ร้าน 2-3 คน) ต้องประเมิน authorization/ownership ใหม่ทั้งหมด เพราะปัจจุบันออกแบบเป็น single-user (แต่ละ user เห็นเฉพาะข้อมูลตัวเอง ไม่มีการ share)
