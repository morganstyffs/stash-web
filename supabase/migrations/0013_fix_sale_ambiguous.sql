-- ============================================================================
-- 0013_fix_sale_ambiguous.sql
--
-- FIX (production 400, SQLSTATE 42702): "column reference \"qty_remaining\" is
-- ambiguous — could refer to either a PL/pgSQL variable or a table column."
--
-- Cause: stock_sale_create / stock_sale_reverse declare `qty_remaining` as a
-- RETURNS TABLE output column, which makes it an in-scope PL/pgSQL variable.
-- Their `select ... qty_remaining ... from public.stock_items` reads the column
-- UNQUALIFIED, so at RUNTIME Postgres can't tell the variable from the column
-- and raises 42702. This never fails at CREATE time and passes any
-- "does the function exist / is it granted" check — only calling it breaks.
--
-- This migration reproduces BOTH functions verbatim from 0012 and changes ONLY
-- column qualification: every table gets an alias and every column is qualified
-- in every statement (not just the one line that happens to error today). No
-- logic, ordering, message, or value is changed. Signatures are unchanged, so
-- `create or replace` replaces in place — no drop, grants are preserved (re-
-- granted below anyway for explicitness).
--
-- What was audited across 0012 + 0011 (every RETURNS TABLE / OUT column name vs
-- real columns; ✅ = safe, 🔴 = fixed here):
--   🔴 stock_sale_create  — `qty_remaining` read unqualified from stock_items
--   🔴 stock_sale_reverse — `qty_remaining` read unqualified from stock_items
--   ✅ stock_sales_summary — already aliases `s` + qualifies every column
--   ✅ stock_intake_create — OUT names (transaction_id, stock_item_id, sku) only
--                            appear as INSERT/UPDATE *target* columns (always
--                            unambiguous), never as an unqualified read
--   ✅ stock_sku_build / stock_sku_preview — scalar `returns text`, no OUT-table
--                            variables, so this class can't occur
--   (checked names: status, profit, item_id, qty_sold, cost_at_sale, sold_on,
--    cogs_transaction_id, sale_id, revenue, cogs, sale_count, qty_remaining,
--    transaction_id, stock_item_id, sku)
--
-- ── SMOKE TESTS (prove it RUNS, not just that it exists). Run in SQL Editor. ──
--
-- (A) create — a bogus item id must reach the "not found" raise, i.e. get PAST
--     the previously-ambiguous SELECT INTO:
--       begin;
--         set local role authenticated;
--         set local request.jwt.claims =
--           '{"sub":"a8ab4d93-f220-4383-9097-2e7caa328aaf","role":"authenticated"}';
--         select * from public.stock_sale_create(
--           '00000000-0000-0000-0000-000000000000', 1, 100);
--         -- PASS: ERROR 'stock item not found'
--         -- FAIL: ERROR 'column reference "qty_remaining" is ambiguous'
--       rollback;
--
-- (B) reverse can't be exercised by a bogus id (it raises 'sale not found' at
--     the FIRST select, before the fixed line). This end-to-end block makes a
--     throwaway item, sells part of it, then reverses — hitting the fixed
--     SELECT INTO in BOTH functions on real rows. All inside a rollback:
--       begin;
--         set local role authenticated;
--         set local request.jwt.claims =
--           '{"sub":"a8ab4d93-f220-4383-9097-2e7caa328aaf","role":"authenticated"}';
--         do $smoke$
--         declare v_item uuid; v_sale uuid;
--         begin
--           select stock_item_id into v_item
--             from public.stock_intake_create('__smoke__', 100, 2);
--           select sale_id into v_sale
--             from public.stock_sale_create(v_item, 1, 150);
--           perform public.stock_sale_reverse(v_sale);
--           raise notice 'SMOKE OK: create+sell+reverse all ran (item=%, sale=%)',
--             v_item, v_sale;
--         end
--         $smoke$;
--         -- PASS: NOTICE 'SMOKE OK: ...'
--         -- FAIL: ERROR 'column reference "qty_remaining" is ambiguous'
--       rollback;
-- ============================================================================


-- ===========================================================================
-- stock_sale_create — reproduced from 0012 SECTION 9; ONLY qualification added.
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
  select si.cost_per_unit, si.qty_remaining, si.qty_total
    into v_cost, v_rem, v_total
    from public.stock_items si
   where si.id = p_item_id
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
    (select c.id from public.categories c where c.user_id = v_uid and c.system_key = 'stock_sale_income'));
  v_cogs_cat := coalesce(
    p_cogs_category_id,
    (select c.id from public.categories c where c.user_id = v_uid and c.system_key = 'stock_cogs'));
  if v_income_cat is null or v_cogs_cat is null then
    raise exception 'system category missing (stock_sale_income / stock_cogs)';
  end if;

  -- income = full sale price
  insert into public.transactions as t
    (user_id, type, amount, category_id, wallet_id, date, note, stock_item_id)
  values
    (v_uid, 'income', v_revenue, v_income_cat, p_wallet_id, v_date,
     coalesce(p_note, 'ขายสต็อก'), p_item_id)
  returning t.id into v_income_tx;

  -- COGS = cost snapshot; is_stock_cogs=true, wallet null (a recognition, not cash out)
  insert into public.transactions as t
    (user_id, type, amount, category_id, wallet_id, date, note, is_stock_cogs, stock_item_id)
  values
    (v_uid, 'expense', v_cogs, v_cogs_cat, null, v_date, 'ต้นทุนขาย', true, p_item_id)
  returning t.id into v_cogs_tx;

  -- deduct stock + recompute status (never trips SECTION 6: cost/qty_total unchanged)
  v_new_rem := v_rem - p_qty;
  v_status := case
                when v_new_rem = 0      then 'sold'
                when v_new_rem < v_total then 'partial'
                else 'in_stock'
              end;
  update public.stock_items si
     set qty_remaining = v_new_rem, status = v_status
   where si.id = p_item_id;

  -- the sale record, snapshotting cost + date
  insert into public.stock_sales as ss
    (user_id, stock_item_id, sale_transaction_id, cogs_transaction_id,
     qty_sold, sale_price, cost_at_sale, sold_on, profit)
  values
    (v_uid, p_item_id, v_income_tx, v_cogs_tx,
     p_qty, p_sale_price, v_cost, v_date, v_profit)
  returning ss.id into v_sale;

  return query select v_sale, v_income_tx, v_cogs_tx, v_new_rem, v_status, v_profit;
end;
$$;

grant execute on function public.stock_sale_create(uuid, integer, numeric, uuid, date, uuid, uuid, text)
  to authenticated;


-- ===========================================================================
-- stock_sale_reverse — reproduced from 0012 SECTION 10; ONLY qualification added.
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
  select ss.stock_item_id, ss.qty_sold, ss.sale_transaction_id, ss.cogs_transaction_id
    into v_item, v_qty, v_income_tx, v_cogs_tx
    from public.stock_sales ss
   where ss.id = p_sale_id
   for update;
  if not found then
    raise exception 'sale not found' using errcode = 'no_data_found';
  end if;

  -- Lock the item row too, then mutate.
  select si.qty_remaining, si.qty_total
    into v_rem, v_total
    from public.stock_items si
   where si.id = v_item
   for update;

  -- Order matters: remove the sale row before its ledger rows so the SECTION 8
  -- guard (which checks for a referencing stock_sales row) allows the deletes.
  delete from public.stock_sales ss where ss.id = p_sale_id;
  if v_income_tx is not null then
    delete from public.transactions t where t.id = v_income_tx;
  end if;
  if v_cogs_tx is not null then
    delete from public.transactions t where t.id = v_cogs_tx;
  end if;

  v_new_rem := v_rem + v_qty;
  -- v_new_rem is always >= 1 (qty_sold >= 1), so 'sold' is unreachable here.
  v_status := case
                when v_new_rem >= v_total then 'in_stock'
                else 'partial'
              end;
  update public.stock_items si
     set qty_remaining = v_new_rem, status = v_status
   where si.id = v_item;

  return query select v_item, v_new_rem, v_status;
end;
$$;

grant execute on function public.stock_sale_reverse(uuid) to authenticated;


-- ===========================================================================
-- Tail — self-record + reload PostgREST.
-- ===========================================================================
insert into public.schema_migrations (version) values ('0013') on conflict do nothing;
notify pgrst, 'reload schema';
