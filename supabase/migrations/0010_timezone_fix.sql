-- ============================================================================
-- Stash — 0010_timezone_fix
-- Make server-side date stamping match the user's wall clock (Asia/Bangkok).
--
-- Problem (audit F-03): the DB session timezone on Supabase is UTC, so
-- `current_date` inside a function is the UTC date. Rows entered by the client
-- carry the LOCAL (Bangkok) date via toISODate(new Date()), but rows created by
-- server RPCs used `current_date` (UTC). Between 00:00–07:00 Bangkok time the
-- two disagree by one day, so a stock intake or a due recurring rule could land
-- on the previous day and skew the daily/monthly rollups.
--
-- Fix: replace `current_date` with `(now() at time zone 'Asia/Bangkok')::date`
-- in the two functions that stamp "today", AND in the one column default that
-- also used current_date:
--   • stock_intake_create   (0004) — the purchase expense's `date`
--   • recurring_run_due      (0008) — the "is this occurrence due?" comparison
--   • transactions.date      (0001) — the column DEFAULT for omitted dates
--
-- Schema scan for other offenders (only transactions.date turned up; this is
-- the exhaustive list, so no other default is changed here):
--   select table_name, column_name, column_default
--     from information_schema.columns
--    where table_schema='public' and column_default ilike '%current_date%';
--
-- `recurring_next_date` is pure date arithmetic on values passed in and is NOT
-- affected by the DB timezone, so it is left unchanged.
--
-- additive-only: `create or replace` of existing functions + one `alter column
-- ... set default` (no table rewrite, no row is touched). Idempotent, safe to
-- re-run. Run in Supabase SQL Editor as owner. Function bodies are otherwise
-- byte-for-byte the current definitions (0004 / 0008) and signatures are
-- unchanged, so no client change is required.
--
-- NO BACKFILL: rows already written with the wrong (UTC) date are left as-is
-- (accepted — a backfill can't reliably tell which past rows were entered in
-- the 00:00–07:00 window). This migration only fixes dates written from now on.
--
-- ── VERIFICATION (run AFTER applying — proves the change, not just the TZ) ──
--   1) both functions exist exactly once and now reference Asia/Bangkok:
--        select p.proname, count(*) as defs,
--               bool_or(pg_get_functiondef(p.oid) ilike '%Asia/Bangkok%') as has_bkk
--          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--         where n.nspname='public'
--           and p.proname in ('stock_intake_create','recurring_run_due')
--         group by p.proname;
--        -- expect: 2 rows, each defs = 1 and has_bkk = true
--
--   2) EXECUTE still granted to `authenticated` (RPC reachable over PostgREST):
--        select p.proname,
--               has_function_privilege('authenticated', p.oid, 'EXECUTE') as can_exec
--          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--         where n.nspname='public'
--           and p.proname in ('stock_intake_create','recurring_run_due');
--        -- expect: can_exec = true for each
--
--   3) transactions.date default now uses the Bangkok expression:
--        select column_default
--          from information_schema.columns
--         where table_schema='public' and table_name='transactions'
--           and column_name='date';
--        -- expect: contains "Asia/Bangkok" (no longer "CURRENT_DATE")
-- ============================================================================

-- ---------------------------------------------------------------------------
-- stock_intake_create — stamp the purchase expense with the Bangkok date.
-- (Identical to 0004 except `v_today` replaces `current_date`.)
-- ---------------------------------------------------------------------------
create or replace function public.stock_intake_create(
  p_name          text,
  p_cost_per_unit numeric,
  p_qty           integer,
  p_category      text                  default null,  -- free-text type (เสื้อยืด/…)
  p_category_id   uuid                  default null,  -- expense category (stock category)
  p_wallet_id     uuid                  default null,
  p_brand         text                  default null,
  p_size          text                  default null,
  p_color         text                  default null,
  p_condition     public.item_condition default null,
  p_target_price  numeric               default null,
  p_photos        text[]                default '{}',
  p_needs_details boolean               default false,
  p_note          text                  default null
)
returns table (transaction_id uuid, stock_item_id uuid, sku text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_today  date := (now() at time zone 'Asia/Bangkok')::date;   -- local wall-clock date
  v_tx     uuid;
  v_item   uuid;
  v_sku    text;
  v_seq    integer;
  v_brand3 text;
  v_total  numeric;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if coalesce(p_qty, 0) < 1 then
    raise exception 'qty must be >= 1';
  end if;
  if coalesce(p_cost_per_unit, -1) < 0 then
    raise exception 'cost_per_unit must be >= 0';
  end if;

  v_total := p_cost_per_unit * p_qty;

  -- SKU: STZ-<BRAND3>-<seq4>. BRAND3 = first 3 alphanumerics of the brand
  -- (uppercased), or GEN when there's no usable brand. seq is per-user.
  v_brand3 := upper(substring(regexp_replace(coalesce(p_brand, ''), '[^a-zA-Z0-9]', '', 'g') from 1 for 3));
  if v_brand3 is null or length(v_brand3) = 0 then
    v_brand3 := 'GEN';
  end if;
  select count(*) + 1 into v_seq from public.stock_items where user_id = v_uid;
  v_sku := 'STZ-' || v_brand3 || '-' || lpad(v_seq::text, 4, '0');

  -- 1) the inventory-purchase expense (dated to the Bangkok wall-clock day)
  insert into public.transactions
    (user_id, type, amount, category_id, wallet_id, note, is_stock_purchase, date)
  values
    (v_uid, 'expense', v_total, p_category_id, p_wallet_id, coalesce(p_note, p_name), true, v_today)
  returning id into v_tx;

  -- 2) the stock item, linked back to its source purchase
  insert into public.stock_items
    (user_id, name, category, brand, size, color, condition,
     cost_per_unit, qty_total, qty_remaining, target_price, sku,
     status, needs_details, photos, source_transaction_id)
  values
    (v_uid, p_name, p_category, p_brand, p_size, p_color, p_condition,
     p_cost_per_unit, p_qty, p_qty, p_target_price, v_sku,
     'in_stock', coalesce(p_needs_details, false), coalesce(p_photos, '{}'), v_tx)
  returning id into v_item;

  -- 3) close the loop: point the transaction at the item it created
  update public.transactions set stock_item_id = v_item where id = v_tx;

  return query select v_tx, v_item, v_sku;
end;
$$;

grant execute on function public.stock_intake_create(
  text, numeric, integer, text, uuid, uuid, text, text, text,
  public.item_condition, numeric, text[], boolean, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- recurring_run_due — compare "due" against the Bangkok date, not UTC.
-- (Identical to 0008 except `v_today` replaces every `current_date`.)
-- ---------------------------------------------------------------------------
create or replace function public.recurring_run_due()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r       public.recurring;
  created int := 0;
  guard   int;
  nd      date;
  v_today date := (now() at time zone 'Asia/Bangkok')::date;   -- local wall-clock date
begin
  for r in
    select *
    from public.recurring
    where active = true
      and next_run is not null
      and next_run <= v_today
      and user_id = auth.uid()
    for update skip locked
  loop
    guard := 0;
    while r.active
      and r.next_run is not null
      and r.next_run <= v_today
      and guard < 500
    loop
      nd := public.recurring_next_date(r.next_run, r.schedule);
      -- Can't advance (unknown schedule): deactivate so it never loops or
      -- re-fires the same date on every load, and stop without inserting.
      if nd is null or nd <= r.next_run then
        r.active := false;
        exit;
      end if;

      insert into public.transactions
        (user_id, type, amount, category_id, wallet_id, date, note)
      values
        (r.user_id, r.type, r.amount, r.category_id, r.wallet_id, r.next_run, r.label);

      created    := created + 1;
      r.next_run := nd;
      guard      := guard + 1;
    end loop;

    update public.recurring
    set next_run   = r.next_run,
        active     = r.active,
        updated_at = now()
    where id = r.id;
  end loop;

  return created;
end;
$$;

grant execute on function public.recurring_run_due() to authenticated;

-- ---------------------------------------------------------------------------
-- transactions.date column default — the ONLY column default in the schema
-- that referenced current_date (verified by the information_schema scan in the
-- header; no other column turned up). Inserts that omit `date` now default to
-- the Bangkok wall-clock day too, matching the functions above. This is a
-- catalog-only change to the column's default expression — existing rows are
-- NOT re-evaluated or rewritten.
-- ---------------------------------------------------------------------------
alter table public.transactions
  alter column date set default (now() at time zone 'Asia/Bangkok')::date;
