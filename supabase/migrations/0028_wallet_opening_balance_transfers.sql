-- ============================================================================
-- Stash — 0028_wallet_opening_balance_transfers
--
-- หลังบ้านของ "กระเป๋าเงิน": ยอดตั้งต้น (opening_balance) + คงเหลือต่อกระเป๋า
-- (wallet_balances) + การโอนระหว่างกระเป๋า (wallet_transfers + RPC สร้าง)
-- ใบนี้ไม่มี UI (UI อยู่ใบ 7/8) — smoke test ท้ายหัวไฟล์คือด่านเดียวที่พิสูจน์ว่า
-- มันทำงานจริง (เหมือน debt_create ที่บั๊ก enum รอดมาตั้งแต่ 0015 เพราะไม่มีตัวเรียก)
--
-- ── ทำไม opening_balance ไม่ใช่การเอา wallets.balance ที่ DROP ไปกลับมา ───────
-- wallets.balance เดิม (0001, DROP ใน 0011 §3) คือ "ยอดสะสม" ที่ต้องคอยอัปเดต
-- ทุกครั้งที่มีรายการ = แหล่งความจริงซ้ำกับ transactions (audit F-05 เรียกมันว่า
-- dead column แล้วตัดทิ้ง) · opening_balance ตรงกันข้าม: เป็น "ค่าที่ผู้ใช้กรอก
-- ครั้งเดียว" แล้วอยู่นิ่ง — คงเหลือยังคำนวณจากรายการเสมอ ไม่มีใครต้องเขียนกลับ
-- เข้าคอลัมน์นี้ตอนบันทึกรายการ · ถ้าไม่มีมัน ตัวเลขคงเหลือจะกลายเป็น "เงินที่
-- ขยับตั้งแต่เริ่มใช้แอป" ไม่ใช่ "เงินที่มีอยู่จริง" — เงินปลอมตระกูลเดียวกับ
-- target_price ที่เพิ่งตัดทิ้งใน 0027 · นี่ไม่ใช่การกลับคำจาก 0011
--
-- ── สูตรคงเหลือ (ต่างจากสูตรงบโดยสิ้นเชิง — อ่านก่อนแตะ wallet_balances) ──────
--   คงเหลือ = opening_balance
--           + Σ(transactions ของกระเป๋านี้ที่ type = 'income')
--           − Σ(transactions ของกระเป๋านี้ที่ type = 'expense')
--           + Σ(transfers เข้า) − Σ(transfers ออก)
--   ใช้ `type` ดิบเท่านั้น — ห้าม isSpendingRow / isBudgetSpendingRow เด็ดขาด:
--     • is_stock_purchase = เงินสดออกจากกระเป๋าจริง (แม้เชิงงบเป็น "ของ" ไม่ใช่
--       รายจ่าย) → type='expense' + มี wallet → หักเอง ถูกแล้ว
--     • is_stock_cogs      = wallet_id NULL อยู่แล้ว → ไม่เข้าสูตรเอง
--     • is_debt_settlement = มี wallet จริง → นับเอง ถูกแล้ว
--     • is_shop_operating  = type='expense' + มี wallet → นับเอง ถูกแล้ว
--   ถ้าใครเผลอเอา predicate ชุดงบมาใช้ ตัวเลขจะผิดเงียบ (ไม่ error) —
--   สูตรนี้จงใจ "โง่" (raw type) เพราะมันถามคนละคำถามกับงบ: "เงินในกระเป๋าขยับ
--   จริงไหม" ไม่ใช่ "รายการนี้นับเป็นรายจ่ายเชิงบัญชีไหม"
--
-- ── การโอน = ตารางแยก wallet_transfers ไม่ยัดลง transactions ─────────────────
-- การโอนไม่ใช่ทั้งรายรับและรายจ่าย · ถ้าสร้างสองแถวใน transactions พาดหัว
-- รับ/จ่ายจะพองทันที และต้อง thread flag ใหม่ผ่าน ledger.ts / useHome /
-- useBudgets / useTransactions / donut ทุกจุด — ลืมจุดเดียว = ผิดเงียบ
-- แลกกับ: **การโอนจะไม่โผล่ในหน้าประวัติ** — ยอมรับโดยตั้งใจ (ไปแสดงในหน้ากระเป๋า
-- ใบ 7 แทน) · โมเดลนี้ตั้งใจไม่แตะ ledger.ts / hooks ใด ๆ เลย
--
-- ── SECURITY: ทั้งสอง RPC เป็น INVOKER ───────────────────────────────────────
-- wallets / transactions / wallet_transfers ทุกตารางมี RLS `auth.uid() = user_id`
-- อยู่แล้ว = ขอบเขตที่ทั้งสองฟังก์ชันต้องการพอดี · DEFINER สงวนไว้ให้ cross-user/
-- seed เท่านั้น (แบบยอดค้าง §3 / seed_defaults_internal) — ที่นี่ไม่มี cross-user
-- wallet_transfers เป็น single-owner ล้วน จึงเป็น INVOKER ทั้งคู่
--
-- ── การลบการโอน: ใช้ policy delete บนแถวตัวเอง ไม่มี RPC ──────────────────────
-- ตารางนี้ single-owner และไม่ผูกกับ transactions (ต่างจากยอดค้างที่การลบต้อง
-- ประสานหลายฝ่าย) · การลบแถวโอนของตัวเองแค่ทำให้คงเหลือคำนวณใหม่โดยอัตโนมัติ —
-- ไม่มี snapshot/สถานะให้ดูแล · policy `for delete using (auth.uid()=user_id)`
-- พอครบ · สร้าง RPC เพิ่มจะเป็น RPC เกินจำเป็น (client `.delete().eq('id',…)` ได้เลย)
--
-- ── การแก้ยอดตั้งต้นทีหลัง: อนุญาต (ไม่ล็อกเหมือน cost_per_unit) ───────────────
-- opening_balance คือ "การแก้ค่าที่กรอกผิด" ไม่ใช่ข้อเท็จจริงในอดีตที่ต้อง snapshot
-- (คนละกรณีกับ cost_at_sale) · แก้แล้วคงเหลือขยับย้อนหลัง — ตั้งใจ · policy update
-- own-row มาตรฐานรองรับอยู่แล้ว (client แก้คอลัมน์นี้ได้ผ่าน RLS ปกติ)
--
-- ── กับดักที่ตั้งใจเลี่ยง ────────────────────────────────────────────────────
--   • qty_remaining trap: wallet_balances เป็น RETURNS TABLE → ชื่อ OUT ทุกตัว
--     เป็นตัวแปรใน scope · alias ทุกตาราง (w/tx/tf) และ qualify ทุกคอลัมน์
--   • enum cast (บั๊ก debt_create 0015): ที่นี่ไม่มี INSERT ค่าจาก CASE/VALUES
--     ลงคอลัมน์ enum เลย (amount/date/text ล้วน; `t.type='income'` เป็นการ
--     "เปรียบเทียบ" ไม่ใช่ INSERT → coerce ปกติ) — ไม่มีจุดที่ต้อง ::enum
--   • row cap (SHOP_ROW_CAP): wallet_balances aggregate ฝั่ง SQL คืน 1 แถว/กระเป๋า
--     (ผู้ใช้ทั่วไป 3 แถว) — ไม่มีการดึงแถวดิบมารวมที่ client จึงไม่ชน PostgREST cap
--   • date อนาคต: เทียบ `(now() at time zone 'Asia/Bangkok')::date` (0010)
--     ไม่ใช่ current_date (ซึ่งเป็น UTC บน Supabase → เพี้ยน 1 วันช่วง 00:00–07:00)
--
-- ── ข้อความ error เป็นภาษาไทยที่ผู้ใช้อ่านรู้เรื่อง ───────────────────────────
-- errors.ts (rule 1) ส่งข้อความที่มีอักษรไทยผ่านตรง ๆ ถึงผู้ใช้ · ห้ามใช้คำต้องห้าม
-- ขึ้นจอ (หนี้/เจ้าหนี้/ลูกหนี้/เรียกเก็บ/ทวง) — ที่นี่พูดเรื่อง "กระเป๋า/โอน/จำนวนเงิน"
-- ล้วน ไม่แตะคำเหล่านั้น
--
-- seed_defaults_internal ไม่ต้องแตะ: seed (ล่าสุด 0026) insert wallets ด้วย
-- (user_id, name, type) เท่านั้น · opening_balance มี default 0 → ผู้ใช้ใหม่ได้ 0
-- อัตโนมัติ · ใบนี้จึงไม่ reproduce seed
--
-- ไฟล์ใหม่ล้วน (ล่าสุดในดิสก์คือ 0027 → ใบนี้ 0028) ไม่แก้ไฟล์ที่ apply แล้ว
-- รันใน Supabase SQL Editor ในฐานะ owner · ทั้งไฟล์ครอบ begin; … commit;
--
-- ── PRE-FLIGHT (รันก่อน — ยืนยันสถานะจริง; query DB จาก agent ไม่ได้จึงฝากไว้) ─
--   -- 1) เลข migration ล่าสุดที่บันทึกไว้ (คาด 0027):
--   select max(version) from public.schema_migrations;
--   -- 2) คอลัมน์ wallets — 'balance' ต้องหายแล้ว, 'opening_balance' ยังไม่มี:
--   select column_name from information_schema.columns
--    where table_schema='public' and table_name='wallets' order by ordinal_position;
--   -- 3) CHECK เดิมบน wallets (information_schema มองไม่เห็น CHECK — ต้องดู
--   --    pg_constraint) · คาด: มีแค่ PK + FK(user_id) ไม่มี CHECK:
--   select conname, contype, pg_get_constraintdef(oid)
--     from pg_constraint where conrelid = 'public.wallets'::regclass order by contype;
--   -- 4) wallet_transfers ต้องยังไม่มี:
--   select to_regclass('public.wallet_transfers');   -- คาด: null
--
-- ── SMOKE TEST (รันหลัง commit — พิสูจน์ว่า "ทำงาน" ไม่ใช่แค่ "มีอยู่") ──────────
--   ก้อนเดียว begin;…rollback; — ไม่มีแถวใดรอด · impersonate ผ่าน request.jwt.claims
--   แล้ว assert ผลจริง · เลือกผู้ใช้จริง 2 คน (คนแรกต้องมี ≥2 กระเป๋า) — ดึง id
--   ทุกตัว "ก่อน" สลับ role เป็น authenticated (owner bypass RLS จึงเห็นกระเป๋า
--   คนอื่นได้ตอนนั้นตัวเดียว) · ถ้า assert ใดล้ม → หยุดรายงาน อย่า patch
--
--   begin;
--   do $$
--   declare
--     v_me   uuid; v_other uuid;
--     v_w1   uuid; v_w2 uuid; v_wo uuid; v_cat_e uuid;
--     v_b1 numeric; v_b2 numeric; v_sum_before numeric; v_sum_mid numeric;
--     v_row public.wallet_transfers; v_err boolean;
--   begin
--     -- คนแรก: ผู้ใช้ที่มี ≥ 2 กระเป๋า · คนที่สอง: ผู้ใช้อื่นที่มีอย่างน้อย 1 กระเป๋า
--     select w.user_id into v_me
--       from public.wallets w group by w.user_id having count(*) >= 2
--       order by w.user_id limit 1;
--     select w2.user_id into v_other
--       from public.wallets w2 where w2.user_id <> v_me
--       group by w2.user_id order by w2.user_id limit 1;
--     if v_me is null or v_other is null then
--       raise notice 'skip: ต้องมีผู้ใช้ ≥2 คน (คนแรกมี ≥2 กระเป๋า)'; return;
--     end if;
--
--     -- ดึง id ทั้งหมดตอนยังเป็น owner (เห็น v_wo ของคนอื่นได้เฉพาะตอนนี้)
--     select id into v_w1 from public.wallets where user_id = v_me order by created_at, id limit 1;
--     select id into v_w2 from public.wallets where user_id = v_me and id <> v_w1
--       order by created_at, id limit 1;
--     select id into v_wo from public.wallets where user_id = v_other order by created_at, id limit 1;
--     select id into v_cat_e from public.categories
--       where user_id = v_me and kind = 'expense' order by sort_order, id limit 1;
--
--     -- สลับเป็นผู้ใช้จริง (RLS มีผลตั้งแต่บรรทัดนี้ไป — wallet_balances เห็นเฉพาะ v_me)
--     perform set_config('request.jwt.claims', json_build_object('sub', v_me)::text, true);
--     perform set_config('role', 'authenticated', true);
--
--     -- baseline
--     select balance into v_b1 from public.wallet_balances() where wallet_id = v_w1;
--     select balance into v_b2 from public.wallet_balances() where wallet_id = v_w2;
--     select sum(balance) into v_sum_before from public.wallet_balances();
--
--     -- (A) is_stock_purchase ต้องถูก "หัก" จากคงเหลือ (เคสพลาดง่ายสุด)
--     insert into public.transactions
--       (user_id, type, amount, category_id, wallet_id, is_stock_purchase)
--       values (v_me, 'expense', 100, v_cat_e, v_w1, true);
--     assert (select balance from public.wallet_balances() where wallet_id = v_w1) = v_b1 - 100,
--       'A: is_stock_purchase ไม่ถูกหักจากคงเหลือ (เผลอใช้ predicate งบ?)';
--
--     -- (B) is_stock_cogs (wallet NULL) ต้องไม่กระทบกระเป๋าใด
--     select sum(balance) into v_sum_mid from public.wallet_balances();
--     insert into public.transactions
--       (user_id, type, amount, category_id, wallet_id, is_stock_cogs)
--       values (v_me, 'expense', 55, null, null, true);
--     assert (select sum(balance) from public.wallet_balances()) = v_sum_mid,
--       'B: is_stock_cogs (wallet NULL) ไปกระทบคงเหลือกระเป๋า';
--
--     -- (C) โอนถูกต้อง: สองกระเป๋าขยับถูกทิศ · ผลรวมไม่เปลี่ยน (net-zero)
--     select balance into v_b1 from public.wallet_balances() where wallet_id = v_w1;
--     select balance into v_b2 from public.wallet_balances() where wallet_id = v_w2;
--     select sum(balance) into v_sum_before from public.wallet_balances();
--     v_row := public.wallet_transfer_create(v_w1, v_w2, 30, null, 'ทดสอบโอน');
--     assert (select balance from public.wallet_balances() where wallet_id = v_w1) = v_b1 - 30,
--       'C: กระเป๋าต้นทางไม่ลดลงตามจำนวนที่โอน';
--     assert (select balance from public.wallet_balances() where wallet_id = v_w2) = v_b2 + 30,
--       'C: กระเป๋าปลายทางไม่เพิ่มขึ้นตามจำนวนที่โอน';
--     assert (select sum(balance) from public.wallet_balances()) = v_sum_before,
--       'C: ผลรวมคงเหลือเปลี่ยน (การโอนต้องเป็น net-zero)';
--
--     -- (D) from = to → ต้อง raise
--     v_err := false;
--     begin perform public.wallet_transfer_create(v_w1, v_w1, 10, null, null);
--     exception when others then v_err := true; end;
--     assert v_err, 'D: โอนเข้ากระเป๋าเดียวกันต้อง raise';
--
--     -- (E) amount <= 0 → ต้อง raise
--     v_err := false;
--     begin perform public.wallet_transfer_create(v_w1, v_w2, 0, null, null);
--     exception when others then v_err := true; end;
--     assert v_err, 'E: amount <= 0 ต้อง raise';
--
--     -- (F) โอนไปกระเป๋าของคนอื่น → ต้อง raise
--     v_err := false;
--     begin perform public.wallet_transfer_create(v_w1, v_wo, 10, null, null);
--     exception when others then v_err := true; end;
--     assert v_err, 'F: โอนไปกระเป๋าของผู้ใช้อื่นต้อง raise';
--
--     -- (G) วันที่อนาคต → ต้อง raise
--     v_err := false;
--     begin perform public.wallet_transfer_create(
--       v_w1, v_w2, 10, ((now() at time zone 'Asia/Bangkok')::date + 1), null);
--     exception when others then v_err := true; end;
--     assert v_err, 'G: วันที่โอนเป็นอนาคตต้อง raise';
--
--     raise notice 'SMOKE OK: หัก stock_purchase, ข้าม COGS, โอน net-zero, ด่านทั้งหมด raise';
--   end $$;
--   rollback;
-- ============================================================================

begin;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 1 · wallets.opening_balance
--   ค่าที่ผู้ใช้กรอกครั้งเดียว (ไม่ใช่ balance เดิมที่เป็นยอดสะสม — ดูหัวไฟล์)
--   จงใจไม่ใส่ CHECK >= 0: สเปกระบุ `numeric not null default 0` ตรง ๆ และค่านี้
--   แก้ทีหลังได้ (เป็นการแก้ค่าที่กรอกผิด) · การ validate ค่าติดลบเป็นเรื่องของ
--   UI ใบ 7 ไม่ใช่ constraint ระดับ DB · idempotent ด้วย if not exists
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.wallets
  add column if not exists opening_balance numeric not null default 0;


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 2 · wallet_transfers — ตารางการโอนระหว่างกระเป๋า (single-owner)
--   on delete restrict บน from/to: กระเป๋าที่ยังมีประวัติการโอนลบไม่ได้เงียบ ๆ
--   (ป้องกันคงเหลือคำนวณผิดหลังลบ — แนวเดียวกับ transactions.wallet_id 0001)
--   CHECK ที่ระดับตาราง = backstop ของ RPC (RPC raise ข้อความไทยก่อน)
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.wallet_transfers (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  from_wallet_id uuid not null references public.wallets (id) on delete restrict,
  to_wallet_id   uuid not null references public.wallets (id) on delete restrict,
  amount         numeric not null,
  transfer_date  date not null default (now() at time zone 'Asia/Bangkok')::date,
  note           text,
  created_at     timestamptz not null default now(),
  constraint wallet_transfers_amount_pos  check (amount > 0),
  constraint wallet_transfers_distinct     check (from_wallet_id <> to_wallet_id)
);

create index if not exists wallet_transfers_user_idx on public.wallet_transfers (user_id);
create index if not exists wallet_transfers_from_idx on public.wallet_transfers (from_wallet_id);
create index if not exists wallet_transfers_to_idx   on public.wallet_transfers (to_wallet_id);

-- RLS owner-only (CRUD ปกติได้ — ไม่ใช่ select-only แบบกลุ่มยอดค้าง)
alter table public.wallet_transfers enable row level security;

drop policy if exists wallet_transfers_select_own on public.wallet_transfers;
create policy wallet_transfers_select_own on public.wallet_transfers
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists wallet_transfers_insert_own on public.wallet_transfers;
create policy wallet_transfers_insert_own on public.wallet_transfers
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists wallet_transfers_update_own on public.wallet_transfers;
create policy wallet_transfers_update_own on public.wallet_transfers
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ลบการโอน = policy delete บนแถวตัวเอง (ไม่มี RPC — ดูหัวไฟล์)
drop policy if exists wallet_transfers_delete_own on public.wallet_transfers;
create policy wallet_transfers_delete_own on public.wallet_transfers
  for delete to authenticated using (auth.uid() = user_id);


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 3 · wallet_balances() — คงเหลือทุกกระเป๋าของผู้ใช้ในครั้งเดียว
--   aggregate ฝั่ง SQL (1 แถว/กระเป๋า) — ไม่ให้ client ดึงแถวดิบมารวม (row cap)
--   คืน "ส่วนประกอบ" ครบ ไม่ใช่แค่ยอดสุทธิ เพื่อให้ UI อธิบายที่มา + debug ได้
--   INVOKER + STABLE: พึ่ง RLS `auth.uid()=user_id` บนทั้งสามตาราง
--   qty_remaining trap: OUT ทุกตัวเป็นตัวแปรใน scope → alias ทุกตาราง (w/tx/tf)
--   qualify ทุกคอลัมน์ · subquery ใช้ชื่อภายในต่างหาก (inc/exp/t_in/t_out) กัน
--   ชนกับชื่อ OUT
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.wallet_balances()
returns table (
  wallet_id       uuid,
  opening_balance numeric,
  income_total    numeric,
  expense_total   numeric,
  transfer_in     numeric,
  transfer_out    numeric,
  balance         numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    w.id,
    w.opening_balance,
    coalesce(tx.inc,   0),
    coalesce(tx.exp,   0),
    coalesce(tf.t_in,  0),
    coalesce(tf.t_out, 0),
    w.opening_balance
      + coalesce(tx.inc,   0) - coalesce(tx.exp,   0)
      + coalesce(tf.t_in,  0) - coalesce(tf.t_out, 0)
  from public.wallets w
  left join (
    -- raw type เท่านั้น: stock_purchase หัก (มี wallet), COGS ข้ามเอง (wallet null)
    select
      t.wallet_id as wid,
      sum(t.amount) filter (where t.type = 'income')  as inc,
      sum(t.amount) filter (where t.type = 'expense') as exp
    from public.transactions t
    where t.wallet_id is not null
    group by t.wallet_id
  ) tx on tx.wid = w.id
  left join (
    select
      u.wid,
      sum(u.amt) filter (where u.dir = 'in')  as t_in,
      sum(u.amt) filter (where u.dir = 'out') as t_out
    from (
      select wt.to_wallet_id   as wid, wt.amount as amt, 'in'  as dir
        from public.wallet_transfers wt
      union all
      select wt.from_wallet_id as wid, wt.amount as amt, 'out' as dir
        from public.wallet_transfers wt
    ) u
    group by u.wid
  ) tf on tf.wid = w.id
  order by w.created_at, w.id;
$$;

revoke execute on function public.wallet_balances() from public;
revoke execute on function public.wallet_balances() from anon;
grant  execute on function public.wallet_balances() to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 4 · wallet_transfer_create(p_from, p_to, p_amount, p_date, p_note)
--   ตรวจครบตามสเปก · raise ข้อความไทยที่ผู้ใช้อ่านรู้เรื่อง (errors.ts ส่งผ่านตรง)
--   ไม่มีคำต้องห้ามขึ้นจอ (หนี้/เจ้าหนี้/ลูกหนี้/เรียกเก็บ/ทวง)
--   INVOKER: insert ผ่าน RLS insert policy (user_id = auth.uid()) · การตรวจ
--   "กระเป๋าเป็นของ auth.uid()" ทำในฟังก์ชัน เพราะ RLS insert เช็คแค่ user_id
--   ไม่ได้เช็คว่ากระเป๋าที่อ้างเป็นของใคร
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.wallet_transfer_create(
  p_from   uuid,
  p_to     uuid,
  p_amount numeric,
  p_date   date default null,
  p_note   text default null
)
returns public.wallet_transfers
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_date  date := coalesce(p_date, (now() at time zone 'Asia/Bangkok')::date);
  v_row   public.wallet_transfers;
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อนจึงจะโอนได้';
  end if;
  if p_from is null or p_to is null then
    raise exception 'ต้องเลือกกระเป๋าต้นทางและปลายทาง';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'จำนวนเงินที่โอนต้องมากกว่า 0';
  end if;
  if p_from = p_to then
    raise exception 'เลือกกระเป๋าปลายทางที่ต่างจากต้นทาง';
  end if;
  if not exists (
    select 1 from public.wallets w where w.id = p_from and w.user_id = v_uid
  ) then
    raise exception 'ไม่พบกระเป๋าต้นทาง';
  end if;
  if not exists (
    select 1 from public.wallets w where w.id = p_to and w.user_id = v_uid
  ) then
    raise exception 'ไม่พบกระเป๋าปลายทาง';
  end if;
  if v_date > v_today then
    raise exception 'วันที่โอนต้องไม่เป็นวันในอนาคต';
  end if;

  insert into public.wallet_transfers
    (user_id, from_wallet_id, to_wallet_id, amount, transfer_date, note)
  values
    (v_uid, p_from, p_to, p_amount, v_date, nullif(btrim(coalesce(p_note, '')), ''))
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.wallet_transfer_create(uuid, uuid, numeric, date, text) from public;
revoke execute on function public.wallet_transfer_create(uuid, uuid, numeric, date, text) from anon;
grant  execute on function public.wallet_transfer_create(uuid, uuid, numeric, date, text) to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 5 · bookkeeping  ← โครงเดียวกับท้ายไฟล์ 0027
-- ═══════════════════════════════════════════════════════════════════════════
insert into public.schema_migrations (version) values ('0028')
on conflict do nothing;

notify pgrst, 'reload schema';

commit;
