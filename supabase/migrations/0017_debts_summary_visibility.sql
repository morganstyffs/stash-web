-- ============================================================================
-- Stash — 0017_debts_summary_visibility
-- Opens the "ยอดค้าง" UI (PR-W) at the database. Two changes, no new tables:
--
--   1. friend_debts_summary — split every total by `visibility`.
--      A `private` note ("จดไว้เอง") is created as `status='confirmed'` on the
--      spot (0015 debt_create, line ~575) and is visible ONLY to its author.
--      The old function filtered on `status='confirmed'` alone, so a caller's
--      own private notes were folded into the same total as the SHARED debts
--      both parties agreed on. That headline is the number a user reads out to
--      a friend — mixing in rows the friend can't see makes it un-discussable,
--      and the user can't tell which is which without opening every line. The
--      split MUST live in the RPC: doing it client-side would re-implement the
--      money selection in a second place (convention 10 + "money in SQL").
--
--      Shape change: the old function took ONE friend id and returned a single
--      (they_owe_me, i_owe_them, net) row. The summary page needs every friend
--      at once, so this returns one row PER counterpart, no argument (scoped to
--      auth.uid() as before). Each row carries both directions ("เขาค้างเรา" /
--      "เราค้างเขา") AND a signed net, for the SHARED and PRIVATE groups
--      separately. The headline (sum across friends by net sign) is aggregated
--      in ONE client lib helper, same pattern as computeHomeSummary — nothing is
--      computed in JS and written back to the DB.
--
--      Changing the returns-table shape means the old definition must be DROPPED
--      with its real signature (public.friend_debts_summary(uuid)) — NOT
--      create-or-replace, which would leave a second overload behind (the exact
--      trap 0015 §9 records; the smoke test below counts definitions = 1). No
--      `if exists`: if that signature is wrong this must fail loudly. Still
--      SECURITY INVOKER + STABLE + search_path='' (reads through the debts
--      SELECT policy from 0015 §8, so another person's private note never leaks).
--
--   2. Two system categories renamed. 0015 seeded the Thai names
--      `จ่ายชำระหนี้` / `ได้รับชำระหนี้`, which users see in the ledger and the
--      category manager. The feature is now called "ยอดค้าง" (the word "หนี้"
--      is too heavy for "จ่ายค่าข้าวให้ก่อน"), so:
--        debt_repayment_expense → จ่ายคืนเพื่อน
--        debt_repayment_income  → ได้รับคืนจากเพื่อน
--      Existing rows are resolved by `system_key` ONLY (convention: never match
--      a system category by its Thai name — the user can rename it). The
--      internal DB names of the tables/RPCs stay `debt*`; renaming them would be
--      a large migration for nothing the user ever sees.
--
--   seed_defaults_internal is reproduced from its LATEST version — 0016 SECTION 7
--   (convention 3), which added `color_index` — with only the two names changed.
--   Its color_index 1–6 assignment and every other line are carried over verbatim.
--   Signature unchanged (uuid) → create-or-replace in place.
--
-- Run in Supabase SQL Editor as owner, wrapped in begin; … commit;. Snapshot
-- friend_debts_summary (0015 §13) and seed_defaults_internal (0016 §7) before the
-- drop/replace. Every statement is idempotent (the UPDATEs are re-runnable, the
-- function bodies are drop/replace), so the whole file is safe to re-run.
--
-- ── PRE-FLIGHT (run BEFORE the migration) ───────────────────────────────────
--   -- confirm the exact signature this file drops (expect one row: uuid):
--   select p.oid::regprocedure as sig
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'friend_debts_summary';
--   -- expect: public.friend_debts_summary(uuid)
--   -- anything else → fix the DROP in SECTION 3 to match, don't guess.
--
-- ── SMOKE TEST (run AFTER commit; must prove it WORKS, not just exists) ──────
--   -- 1. friend_debts_summary runs for a REAL user, returns all 7 columns, no
--   --    error. auth.uid() reads request.jwt.claims->>'sub'; the SQL editor runs
--   --    as owner with a null uid, so impersonate a real user for the call.
--   --    0 rows is fine if that user has no confirmed debts — pick one who does
--   --    (a party to a row in public.debts) to see real numbers.
--   begin;
--     select set_config(
--       'request.jwt.claims',
--       json_build_object('sub', (select p.user_id from public.profiles p limit 1))::text,
--       true
--     );
--     select * from public.friend_debts_summary();   -- expect 7 columns, no error
--   rollback;
--
--   -- 2. exactly one friend_debts_summary (the old (uuid) overload is gone):
--   select count(*) as fds_defs from pg_proc where proname = 'friend_debts_summary';  -- expect 1
--
--   -- 3. the two system categories were renamed, resolved by system_key:
--   select c.system_key,
--          count(*)                                                   as rows,
--          count(*) filter (where c.name = 'จ่ายคืนเพื่อน')            as expense_named,
--          count(*) filter (where c.name = 'ได้รับคืนจากเพื่อน')        as income_named
--   from public.categories c
--   where c.system_key in ('debt_repayment_expense','debt_repayment_income')
--   group by c.system_key;
--   -- expect: expense rows all counted in expense_named, income rows in income_named.
--
--   -- …and no row is left with either OLD name:
--   select count(*) as stale
--   from public.categories c
--   where c.name in ('จ่ายชำระหนี้','ได้รับชำระหนี้');   -- expect 0
--
--   -- 4. exactly one seed function:
--   select count(*) as seed_defs from pg_proc where proname = 'seed_defaults_internal';  -- expect 1
-- ============================================================================


-- ===========================================================================
-- SECTION 1 — rename the two system categories for EXISTING users. Resolved by
-- system_key only (never by the old Thai name — users can rename categories, so
-- a name match would be both fragile and wrong). Re-runnable.
-- ===========================================================================
update public.categories c
   set name = 'จ่ายคืนเพื่อน'
 where c.system_key = 'debt_repayment_expense';

update public.categories c
   set name = 'ได้รับคืนจากเพื่อน'
 where c.system_key = 'debt_repayment_income';


-- ===========================================================================
-- SECTION 2 — seed_defaults_internal: reproduced from 0016 SECTION 7 verbatim
-- (convention 3 — 0016 is the latest version, it added color_index), changing
-- ONLY the two debt-repayment category names. color_index 1–6 assignment and
-- everything else are carried over unchanged. Signature unchanged → create or
-- replace. New users get the corrected names from the start; this is why the
-- Settings profile page (default display_name = email local-part) also ships in
-- PR-W — a fresh account should never see the old copy anywhere.
-- ===========================================================================
create or replace function public.seed_defaults_internal(uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_name  text;
begin
  if exists (select 1 from public.categories where user_id = uid) then
    return;
  end if;

  insert into public.wallets (user_id, name, type) values
    (uid, 'เงินสด',   'cash'),
    (uid, 'ธนาคาร',    'bank'),
    (uid, 'พร้อมเพย์', 'promptpay');

  insert into public.categories
    (user_id, name, kind, is_stock_category, is_system, system_key, icon, color_index, sort_order) values
    (uid, 'อาหาร',         'expense', false, false, null,                     'coffee',        1, 10),
    (uid, 'เดินทาง',        'expense', false, false, null,                     'motorbike',     2, 20),
    (uid, 'ช้อปปิ้ง',       'expense', false, false, null,                     'shopping-bag',  3, 30),
    (uid, 'บิล/ค่าบ้าน',    'expense', false, false, null,                     'bolt',          4, 40),
    (uid, 'บันเทิง',        'expense', false, false, null,                     'device-tv',     5, 50),
    (uid, 'เสื้อเข้าร้าน',   'expense', true,  false, null,                     'shirt',         6, 60),
    (uid, 'รองเท้าเข้าร้าน', 'expense', true,  false, null,                     'shoe',          1, 70),
    (uid, 'ต้นทุนขายสต็อก',  'expense', false, true,  'stock_cogs',             'receipt-2',     2, 80),
    (uid, 'จ่ายคืนเพื่อน',   'expense', false, true,  'debt_repayment_expense', 'arrow-up-right',3, 90);

  insert into public.categories
    (user_id, name, kind, is_stock_category, is_system, system_key, icon, color_index, sort_order) values
    (uid, 'เงินเดือน',       'income', false, false, null,                     'cash',            4, 10),
    (uid, 'ฟรีแลนซ์',        'income', false, false, null,                     'briefcase',       5, 20),
    (uid, 'ขายสต็อก',        'income', false, true,  'stock_sale_income',      'box',             6, 30),
    (uid, 'ได้รับคืนจากเพื่อน', 'income', false, true,  'debt_repayment_income', 'arrow-down-left', 1, 40);

  insert into public.stock_sku_config (user_id) values (uid)
  on conflict (user_id) do nothing;

  select email into v_email from auth.users where id = uid;
  v_name := coalesce(nullif(split_part(coalesce(v_email, ''), '@', 1), ''), 'ผู้ใช้');
  insert into public.profiles (user_id, display_name, friend_code)
  values (uid, v_name, public.generate_friend_code())
  on conflict (user_id) do nothing;
end;
$$;


-- ===========================================================================
-- SECTION 3 — friend_debts_summary: net balance with EVERY friend at once,
-- split by visibility. Drop the old (uuid) overload first — the returns-table
-- shape changes, so create-or-replace is impossible and would leave a stale
-- overload (0015 §9). No `if exists`: fail loudly if the signature is wrong.
--
-- One row per counterpart the caller has a confirmed debt with. For SHARED and
-- PRIVATE separately: `*_they_owe_me` (caller is creditor), `*_i_owe_them`
-- (caller is debtor), `*_net` (they_owe_me − i_owe_them, signed). RETURNS TABLE
-- makes the output names variables in scope, so every table is aliased (d / fr)
-- and every column qualified; the lateral's counterpart column is named
-- `counterpart_id` to avoid colliding with the OUT `friend_id`.
--
-- SECURITY INVOKER + STABLE + search_path='': reads through the debts SELECT
-- policy (0015 §8), which already hides another person's private notes, so no
-- private row of the OTHER party can ever leak into these totals.
-- ===========================================================================
drop function public.friend_debts_summary(uuid);

create or replace function public.friend_debts_summary()
returns table (
  friend_id           uuid,
  shared_they_owe_me  numeric,
  shared_i_owe_them   numeric,
  shared_net          numeric,
  private_they_owe_me numeric,
  private_i_owe_them  numeric,
  private_net         numeric
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  return query
  select
    fr.counterpart_id,
    coalesce(sum(case when d.visibility = 'shared'  and d.creditor_id = auth.uid() then d.amount else 0 end), 0)::numeric,
    coalesce(sum(case when d.visibility = 'shared'  and d.debtor_id   = auth.uid() then d.amount else 0 end), 0)::numeric,
    coalesce(sum(case when d.visibility = 'shared'
                      then (case when d.creditor_id = auth.uid() then d.amount else -d.amount end)
                      else 0 end), 0)::numeric,
    coalesce(sum(case when d.visibility = 'private' and d.creditor_id = auth.uid() then d.amount else 0 end), 0)::numeric,
    coalesce(sum(case when d.visibility = 'private' and d.debtor_id   = auth.uid() then d.amount else 0 end), 0)::numeric,
    coalesce(sum(case when d.visibility = 'private'
                      then (case when d.creditor_id = auth.uid() then d.amount else -d.amount end)
                      else 0 end), 0)::numeric
  from public.debts d
  cross join lateral (
    select case when d.creditor_id = auth.uid() then d.debtor_id else d.creditor_id end as counterpart_id
  ) fr
  where d.status = 'confirmed'
    and (d.creditor_id = auth.uid() or d.debtor_id = auth.uid())
  group by fr.counterpart_id;
end;
$$;

grant execute on function public.friend_debts_summary() to authenticated;


-- ===========================================================================
-- Tail — self-record + reload PostgREST.
-- ===========================================================================
insert into public.schema_migrations (version) values ('0017') on conflict do nothing;

notify pgrst, 'reload schema';
