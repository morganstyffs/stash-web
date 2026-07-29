-- ============================================================================
-- Stash — 0012_stock_sale
-- The sell flow (Model A — gross): selling stock records BOTH a full-price
-- income transaction AND a matching cost-of-goods-sold (COGS) expense, deducts
-- qty_remaining, advances status, and writes a stock_sales row (with a cost
-- snapshot). A reverse RPC undoes a sale atomically.
--
-- Accounting (Model A): sale of qty q at price p on an item costed c/unit →
--   income  = p*q   (category system_key='stock_sale_income')
--   expense = c*q   (is_stock_cogs=true, category system_key='stock_cogs')
--   net effect on safe-to-spend (income − expense) = (p−c)*q = profit.
-- COGS counts as a normal expense (headline + donut) but is EXCLUDED from budgets
-- (see lib/ledger.ts isBudgetSpendingRow). A loss (p<c) is representable: both
-- ledger rows stay non-negative, only stock_sales.profit goes negative.
--
-- SECTION order (each explained inline). The order is load-bearing:
--   1 categories columns + unique index   — before anything references system_key
--   2 backfill system categories          — needs the columns/index
--   3 seed_defaults_internal (reproduce)   — needs the columns; new users
--   4 transactions.is_stock_cogs           — before stock_sale_create inserts it
--   5 stock_sales columns + indexes        — before the sale RPCs reference them
--   6 trigger: lock cost/qty after a sale
--   7 trigger: block delete of system categories
--   8 trigger: guard sale-linked transactions (delete/update)  ← integrity core
--   9 stock_sale_create
--  10 stock_sale_reverse
--  11 stock_sales_summary
--
-- No function changes signature here (stock_intake_create is NOT touched), so no
-- drop-by-signature is needed. seed_defaults_internal keeps its (uuid) signature,
-- so create-or-replace replaces it in place (no overload).
--
-- Run in Supabase SQL Editor as owner. Safe to wrap the whole file in a single
-- transaction:  begin;  <paste>  commit;  (all statements here are transactional;
-- notify fires on commit). Idempotent where practical.
--
-- ── VERIFICATION (run AFTER applying) ──────────────────────────────────────
--   A) seed_defaults_internal did NOT regress 0011 and gained the system cats:
--        select
--          pg_get_functiondef(p.oid) ilike '%stock_sku_config%'      as has_sku_seed,   -- true
--          pg_get_functiondef(p.oid) not ilike '%balance%'           as no_balance,     -- true
--          pg_get_functiondef(p.oid) ilike '%stock_sale_income%'     as has_sale_cat,   -- true
--          pg_get_functiondef(p.oid) ilike '%stock_cogs%'            as has_cogs_cat    -- true
--        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--        where n.nspname='public' and p.proname='seed_defaults_internal';
--   B) every user has BOTH system categories, exactly once (no dup):
--        select
--          (select count(*) from auth.users)                                          as users,
--          (select count(*) from public.categories where system_key='stock_sale_income') as sale_cats,
--          (select count(*) from public.categories where system_key='stock_cogs')        as cogs_cats;
--        -- expect users = sale_cats = cogs_cats
--   C) unique index on (user_id, system_key) exists:
--        select indexname from pg_indexes
--         where tablename='categories' and indexname='categories_user_system_key_uidx';
--   D) new columns + constraints:
--        select column_name, is_nullable from information_schema.columns
--         where table_name='stock_sales' and column_name in ('cost_at_sale','sold_on','cogs_transaction_id');
--        -- cost_at_sale/sold_on => NO ; cogs_transaction_id => YES
--        select 1 from information_schema.columns
--         where table_name='transactions' and column_name='is_stock_cogs';               -- 1 row
--   E) triggers present:
--        select tgname from pg_trigger
--         where tgrelid in ('public.transactions'::regclass,'public.stock_items'::regclass,'public.categories'::regclass)
--           and not tgisinternal order by tgname;
--        -- expect: stock_item_lock_after_sale, stock_sale_txn_guard, system_category_no_delete
--   F) RPCs exist, granted, correct volatility (v=volatile, s=stable):
--        select p.proname, p.provolatile, has_function_privilege('authenticated', p.oid, 'EXECUTE') as can_exec
--          from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--         where n.nspname='public'
--           and p.proname in ('stock_sale_create','stock_sale_reverse','stock_sales_summary');
--        -- create/reverse => 'v', summary => 's', all can_exec true
--   G) stock_intake_create did NOT regress (still one def, Bangkok date, uses build):
--        select count(*) as defs,
--               bool_or(pg_get_functiondef(p.oid) ilike '%Asia/Bangkok%')  as has_bkk,
--               bool_or(pg_get_functiondef(p.oid) ilike '%stock_sku_build%') as uses_build
--          from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--         where n.nspname='public' and p.proname='stock_intake_create';           -- 1, true, true
--   H) ledger '0012' recorded:
--        select 1 from public.schema_migrations where version='0012';            -- 1 row
--   I) GUARD 1.5 actually blocks (run AFTER making one test sale from the app):
--        begin;
--          delete from public.transactions where id in
--            (select sale_transaction_id from public.stock_sales where sale_transaction_id is not null limit 1);
--          -- EXPECT: ERROR 'transaction เป็นส่วนหนึ่งของการขาย ...'
--        rollback;
--        -- then call public.stock_sale_reverse(<sale_id>) → succeeds (deletes the row set cleanly)
-- ============================================================================


-- ===========================================================================
-- SECTION 1 — categories: is_system (protected) + system_key (stable resolve key)
-- is_system  = row is app-managed → cannot be deleted (SECTION 7 trigger).
-- system_key = stable identifier the RPCs resolve by (NEVER by Thai name at
--              runtime — names are user-editable). One key per user (unique idx).
-- ===========================================================================
alter table public.categories add column if not exists is_system  boolean not null default false;
alter table public.categories add column if not exists system_key text;

create unique index if not exists categories_user_system_key_uidx
  on public.categories (user_id, system_key)
  where system_key is not null;


-- ===========================================================================
-- SECTION 2 — backfill the two system categories for EXISTING users.
--
-- NOTE ON THE "no Thai-name match" RULE: that rule governs RUNTIME resolution
-- inside the RPCs (a name a user renamed must not break a sale). A ONE-TIME
-- migration backfill matching by name is fine and intentional — it is how we
-- adopt a user's existing 'ขายสต็อก' income category instead of creating a
-- confusing duplicate. After this runs, resolution is by system_key only.
--
-- 'ขายสต็อก' (income): tag the existing one if present (exactly one per user,
-- oldest, guarded by the unique index), else create it.
-- 'ต้นทุนขายสต็อก' (expense, COGS): never existed before → create if missing.
-- ===========================================================================
update public.categories c
   set is_system = true, system_key = 'stock_sale_income'
 where c.id in (
   select distinct on (user_id) id            -- exactly one per user → no unique-index clash
     from public.categories
    where kind = 'income' and name = 'ขายสต็อก' and system_key is null
    order by user_id, created_at, id
 )
 and not exists (
   select 1 from public.categories x
    where x.user_id = c.user_id and x.system_key = 'stock_sale_income'
 );

insert into public.categories
  (user_id, name, kind, is_stock_category, is_system, system_key, icon, color, sort_order)
select u.id, 'ขายสต็อก', 'income', false, true, 'stock_sale_income', 'box', '#0E7D66', 30
  from auth.users u
 where not exists (
   select 1 from public.categories c
    where c.user_id = u.id and c.system_key = 'stock_sale_income'
 );

insert into public.categories
  (user_id, name, kind, is_stock_category, is_system, system_key, icon, color, sort_order)
select u.id, 'ต้นทุนขายสต็อก', 'expense', false, true, 'stock_cogs', 'receipt-2', '#B0693B', 80
  from auth.users u
 where not exists (
   select 1 from public.categories c
    where c.user_id = u.id and c.system_key = 'stock_cogs'
 );


-- ===========================================================================
-- SECTION 3 — seed_defaults_internal: reproduced from the 0011 version
-- (keeps the wallets-without-balance seed AND the stock_sku_config seed), plus:
--   • the 'ขายสต็อก' income row is now is_system + system_key='stock_sale_income'
--   • a new 'ต้นทุนขายสต็อก' expense row, is_system + system_key='stock_cogs'
-- SECURITY DEFINER + search_path='' preserved. Signature unchanged (uuid) so
-- create-or-replace replaces in place — no overload.
-- ===========================================================================
create or replace function public.seed_defaults_internal(uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.categories where user_id = uid) then
    return;
  end if;

  insert into public.wallets (user_id, name, type) values
    (uid, 'เงินสด',   'cash'),
    (uid, 'ธนาคาร',    'bank'),
    (uid, 'พร้อมเพย์', 'promptpay');

  -- Expense categories (last one is the system COGS category, hidden from entry).
  insert into public.categories
    (user_id, name, kind, is_stock_category, is_system, system_key, icon, color, sort_order) values
    (uid, 'อาหาร',       'expense', false, false, null,          'coffee',       '#FB7A57', 10),
    (uid, 'เดินทาง',      'expense', false, false, null,          'motorbike',    '#2CC0A0', 20),
    (uid, 'ช้อปปิ้ง',     'expense', false, false, null,          'shopping-bag', '#F5C64C', 30),
    (uid, 'บิล/ค่าบ้าน',  'expense', false, false, null,          'bolt',         '#171717', 40),
    (uid, 'บันเทิง',      'expense', false, false, null,          'device-tv',    '#34C471', 50),
    (uid, 'เสื้อเข้าร้าน',   'expense', true,  false, null,          'shirt',        '#0E7D66', 60),
    (uid, 'รองเท้าเข้าร้าน', 'expense', true,  false, null,          'shoe',         '#0E7D66', 70),
    (uid, 'ต้นทุนขายสต็อก', 'expense', false, true,  'stock_cogs',   'receipt-2',    '#B0693B', 80);

  -- Income categories (ขายสต็อก is system: protected from deletion, but stays
  -- visible in manual entry so income for off-book resales can still be logged).
  insert into public.categories
    (user_id, name, kind, is_stock_category, is_system, system_key, icon, color, sort_order) values
    (uid, 'เงินเดือน',  'income', false, false, null,               'cash',      '#1D9E75', 10),
    (uid, 'ฟรีแลนซ์',   'income', false, false, null,               'briefcase', '#1D9E75', 20),
    (uid, 'ขายสต็อก',   'income', false, true,  'stock_sale_income', 'box',       '#0E7D66', 30);

  insert into public.stock_sku_config (user_id) values (uid)
  on conflict (user_id) do nothing;
end;
$$;


-- ===========================================================================
-- SECTION 4 — transactions.is_stock_cogs
-- Marks the COGS expense created at sale time. UNLIKE is_stock_purchase (an
-- asset, excluded from spending), a COGS row IS a recognised expense — it is
-- only excluded from BUDGETS (client-side, lib/ledger.ts).
-- ===========================================================================
alter table public.transactions add column if not exists is_stock_cogs boolean not null default false;


-- ===========================================================================
-- SECTION 5 — stock_sales: cost snapshot + COGS link + sale date.
-- NOT NULL and NO default (every insert must supply them — the RPC does). Safe:
-- stock_sales is empty. cost_at_sale is the per-unit cost snapshot at sale time,
-- so later edits to stock_items.cost_per_unit never rewrite realised economics.
-- ===========================================================================
alter table public.stock_sales
  add column if not exists cost_at_sale numeric(14, 2) not null check (cost_at_sale >= 0);
alter table public.stock_sales
  add column if not exists cogs_transaction_id uuid references public.transactions (id) on delete set null;
alter table public.stock_sales
  add column if not exists sold_on date not null;

create index if not exists stock_sales_sale_txn_idx on public.stock_sales (sale_transaction_id);
create index if not exists stock_sales_cogs_txn_idx on public.stock_sales (cogs_transaction_id);
create index if not exists stock_sales_sold_on_idx  on public.stock_sales (user_id, sold_on);


-- ===========================================================================
-- SECTION 6 — trigger: freeze cost_per_unit / qty_total once an item has sales.
-- Those two feed realised COGS + valuation; changing them after a sale would
-- silently corrupt profit history. qty_remaining / status still change freely
-- (that is how a sale/reverse works), so the sale RPCs are unaffected.
-- ===========================================================================
create or replace function public.stock_item_lock_after_sale()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.cost_per_unit is distinct from old.cost_per_unit
      or new.qty_total is distinct from old.qty_total)
     and exists (select 1 from public.stock_sales where stock_item_id = old.id) then
    raise exception 'แก้ต้นทุน/จำนวนรวมของสินค้าที่ขายไปแล้วไม่ได้ (ย้อนการขายก่อน)'
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists stock_item_lock_after_sale on public.stock_items;
create trigger stock_item_lock_after_sale
  before update on public.stock_items
  for each row execute function public.stock_item_lock_after_sale();


-- ===========================================================================
-- SECTION 7 — trigger: system categories cannot be deleted (D11).
-- They anchor the sale RPCs (resolved by system_key), so losing one would break
-- sales. Deletion is blocked in the client too, but the DB is the real guard.
-- ===========================================================================
create or replace function public.system_category_no_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.is_system then
    raise exception 'หมวดระบบลบไม่ได้' using errcode = 'restrict_violation';
  end if;
  return old;
end;
$$;

drop trigger if exists system_category_no_delete on public.categories;
create trigger system_category_no_delete
  before delete on public.categories
  for each row execute function public.system_category_no_delete();


-- ===========================================================================
-- SECTION 8 — trigger: sale-linked transactions are read-only (integrity core).
-- A transaction referenced by a stock_sales row (as income or COGS) must not be
-- deleted or have its money-shaping fields changed directly — that would desync
-- the ledger (home) from stock_sales (stock reports) with no error. Editing note
-- or wallet stays allowed.
--
-- stock_sale_reverse passes this guard WITHOUT any flag or bypass: it deletes
-- the stock_sales row FIRST, so by the time it deletes the two transactions the
-- EXISTS() below is already false. The guard stays a pure function of table
-- state; nothing the client sends can spoof it.
-- ===========================================================================
create or replace function public.stock_sale_txn_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if exists (
      select 1 from public.stock_sales
       where sale_transaction_id = old.id or cogs_transaction_id = old.id
    ) then
      raise exception 'transaction เป็นส่วนหนึ่งของการขาย — ใช้ปุ่มย้อนการขายแทน'
        using errcode = 'restrict_violation';
    end if;
    return old;
  else  -- UPDATE
    if exists (
      select 1 from public.stock_sales
       where sale_transaction_id = old.id or cogs_transaction_id = old.id
    ) and (
         new.amount        is distinct from old.amount
      or new.type          is distinct from old.type
      or new.date          is distinct from old.date
      or new.stock_item_id is distinct from old.stock_item_id
      or new.is_stock_cogs is distinct from old.is_stock_cogs
    ) then
      raise exception 'แก้ยอด/ประเภท/วันที่/ลิงก์ ของรายการขายไม่ได้ — ใช้ปุ่มย้อนการขายแทน'
        using errcode = 'restrict_violation';
    end if;
    return new;  -- note / wallet_id edits pass
  end if;
end;
$$;

drop trigger if exists stock_sale_txn_guard on public.transactions;
create trigger stock_sale_txn_guard
  before update or delete on public.transactions
  for each row execute function public.stock_sale_txn_guard();


-- ===========================================================================
-- SECTION 9 — stock_sale_create (atomic; Model A). All money computed in SQL.
-- ===========================================================================
create or replace function public.stock_sale_create(
  p_item_id            uuid,
  p_qty                integer,
  p_sale_price         numeric,
  p_wallet_id          uuid default null,   -- attached to the income row; COGS wallet is null
  p_sale_date          date default null,   -- null => Asia/Bangkok today; must not be future
  p_income_category_id uuid default null,   -- null => resolve system_key='stock_sale_income'
  p_cogs_category_id   uuid default null,   -- null => resolve system_key='stock_cogs'
  p_note               text default null
)
returns table (
  sale_id               uuid,
  income_transaction_id uuid,
  cogs_transaction_id   uuid,
  qty_remaining         integer,
  status                public.stock_status,
  profit                numeric
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_today      date := (now() at time zone 'Asia/Bangkok')::date;
  v_date       date;
  v_cost       numeric;
  v_rem        integer;
  v_total      integer;
  v_revenue    numeric;
  v_cogs       numeric;
  v_profit     numeric;
  v_income_cat uuid;
  v_cogs_cat   uuid;
  v_income_tx  uuid;
  v_cogs_tx    uuid;
  v_new_rem    integer;
  v_status     public.stock_status;
  v_sale       uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  -- Lock the item row: serializes concurrent sells, prevents overselling.
  select cost_per_unit, qty_remaining, qty_total
    into v_cost, v_rem, v_total
    from public.stock_items
   where id = p_item_id
   for update;
  if not found then
    raise exception 'stock item not found' using errcode = 'no_data_found';
  end if;

  if coalesce(p_qty, 0) < 1 then
    raise exception 'qty must be >= 1';
  end if;
  if p_qty > v_rem then
    raise exception 'qty exceeds remaining (% > %)', p_qty, v_rem using errcode = 'check_violation';
  end if;
  if coalesce(p_sale_price, -1) < 0 then
    raise exception 'sale_price must be >= 0';
  end if;

  v_date := coalesce(p_sale_date, v_today);
  if v_date > v_today then
    raise exception 'sale_date must not be in the future';
  end if;

  v_revenue := p_sale_price * p_qty;   -- all-numeric, never computed client-side
  v_cogs    := v_cost * p_qty;
  v_profit  := v_revenue - v_cogs;     -- may be negative (a loss)

  -- Resolve system categories by system_key ONLY (never by Thai name at runtime).
  v_income_cat := coalesce(
    p_income_category_id,
    (select id from public.categories where user_id = v_uid and system_key = 'stock_sale_income'));
  v_cogs_cat := coalesce(
    p_cogs_category_id,
    (select id from public.categories where user_id = v_uid and system_key = 'stock_cogs'));
  if v_income_cat is null or v_cogs_cat is null then
    raise exception 'system category missing (stock_sale_income / stock_cogs)';
  end if;

  -- income = full sale price
  insert into public.transactions
    (user_id, type, amount, category_id, wallet_id, date, note, stock_item_id)
  values
    (v_uid, 'income', v_revenue, v_income_cat, p_wallet_id, v_date,
     coalesce(p_note, 'ขายสต็อก'), p_item_id)
  returning id into v_income_tx;

  -- COGS = cost snapshot; is_stock_cogs=true, wallet null (a recognition, not cash out)
  insert into public.transactions
    (user_id, type, amount, category_id, wallet_id, date, note, is_stock_cogs, stock_item_id)
  values
    (v_uid, 'expense', v_cogs, v_cogs_cat, null, v_date, 'ต้นทุนขาย', true, p_item_id)
  returning id into v_cogs_tx;

  -- deduct stock + recompute status (never trips SECTION 6: cost/qty_total unchanged)
  v_new_rem := v_rem - p_qty;
  v_status := case
                when v_new_rem = 0      then 'sold'
                when v_new_rem < v_total then 'partial'
                else 'in_stock'
              end;
  update public.stock_items
     set qty_remaining = v_new_rem, status = v_status
   where id = p_item_id;

  -- the sale record, snapshotting cost + date
  insert into public.stock_sales
    (user_id, stock_item_id, sale_transaction_id, cogs_transaction_id,
     qty_sold, sale_price, cost_at_sale, sold_on, profit)
  values
    (v_uid, p_item_id, v_income_tx, v_cogs_tx,
     p_qty, p_sale_price, v_cost, v_date, v_profit)
  returning id into v_sale;

  return query select v_sale, v_income_tx, v_cogs_tx, v_new_rem, v_status, v_profit;
end;
$$;

grant execute on function public.stock_sale_create(uuid, integer, numeric, uuid, date, uuid, uuid, text)
  to authenticated;


-- ===========================================================================
-- SECTION 10 — stock_sale_reverse (atomic undo). Deletes the stock_sales row
-- FIRST, then its two transactions (so SECTION 8's guard sees no reference and
-- allows the deletes), then restores qty_remaining + status.
-- ===========================================================================
create or replace function public.stock_sale_reverse(p_sale_id uuid)
returns table (
  item_id       uuid,
  qty_remaining integer,
  status        public.stock_status
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_item      uuid;
  v_qty       integer;
  v_income_tx uuid;
  v_cogs_tx   uuid;
  v_rem       integer;
  v_total     integer;
  v_new_rem   integer;
  v_status    public.stock_status;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  -- Lock the sale row FIRST: two concurrent reverses can't both restore stock.
  select stock_item_id, qty_sold, sale_transaction_id, cogs_transaction_id
    into v_item, v_qty, v_income_tx, v_cogs_tx
    from public.stock_sales
   where id = p_sale_id
   for update;
  if not found then
    raise exception 'sale not found' using errcode = 'no_data_found';
  end if;

  -- Lock the item row too, then mutate.
  select qty_remaining, qty_total
    into v_rem, v_total
    from public.stock_items
   where id = v_item
   for update;

  -- Order matters: remove the sale row before its ledger rows so the SECTION 8
  -- guard (which checks for a referencing stock_sales row) allows the deletes.
  delete from public.stock_sales where id = p_sale_id;
  if v_income_tx is not null then
    delete from public.transactions where id = v_income_tx;
  end if;
  if v_cogs_tx is not null then
    delete from public.transactions where id = v_cogs_tx;
  end if;

  v_new_rem := v_rem + v_qty;
  -- v_new_rem is always >= 1 (qty_sold >= 1), so 'sold' is unreachable here.
  v_status := case
                when v_new_rem >= v_total then 'in_stock'
                else 'partial'
              end;
  update public.stock_items
     set qty_remaining = v_new_rem, status = v_status
   where id = v_item;

  return query select v_item, v_new_rem, v_status;
end;
$$;

grant execute on function public.stock_sale_reverse(uuid) to authenticated;


-- ===========================================================================
-- SECTION 11 — stock_sales_summary: month (or any range) realised totals.
-- A proper RPC (PostgREST blocks aggregates + can't multiply columns in select).
-- Range is [p_from, p_to) on sold_on. STABLE (reads, no writes).
-- ===========================================================================
create or replace function public.stock_sales_summary(p_from date, p_to date)
returns table (
  revenue    numeric,
  cogs       numeric,
  profit     numeric,
  sale_count integer,
  qty_sold   integer
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  return query
    select
      coalesce(sum(s.sale_price   * s.qty_sold), 0)::numeric,
      coalesce(sum(s.cost_at_sale * s.qty_sold), 0)::numeric,
      coalesce(sum(s.profit), 0)::numeric,
      count(*)::integer,
      coalesce(sum(s.qty_sold), 0)::integer
    from public.stock_sales s
   where s.user_id = auth.uid()
     and s.sold_on >= p_from
     and s.sold_on <  p_to;
end;
$$;

grant execute on function public.stock_sales_summary(date, date) to authenticated;


-- ===========================================================================
-- Tail — self-record + reload PostgREST (new RPCs + new columns).
-- ===========================================================================
insert into public.schema_migrations (version) values ('0012') on conflict do nothing;

notify pgrst, 'reload schema';
