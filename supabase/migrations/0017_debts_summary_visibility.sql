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
--      at once, so this returns one row PER accepted friend, no argument (scoped
--      to auth.uid() as before). The BASE is friend_connections (accepted),
--      LEFT JOINed to debts — so a friend who is all cleared still gets a row
--      (net 0 → "เคลียร์แล้ว", which is meaningful, not absent) and the page
--      never has to fetch the friend list from a second place and merge. The
--      friend's `display_name` rides along in the same row (profiles' SELECT
--      policy already allows reading an accepted friend's row — no new access),
--      so name and balance always arrive together. Each row carries both
--      directions ("เขาค้างเรา" / "เราค้างเขา") AND a signed net, for the
--      SHARED and PRIVATE groups separately. The headline (sum across friends by
--      net sign) is aggregated in ONE client lib helper, same pattern as
--      computeHomeSummary — nothing is computed in JS and written back to the DB.
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
--   -- 1. friend_debts_summary runs for a REAL user, returns all 8 columns, no
--   --    error. auth.uid() reads request.jwt.claims->>'sub'; the SQL editor runs
--   --    as owner with a null uid, so impersonate a real user for the call (a
--   --    plain owner call would return an empty set and "pass" without proving
--   --    anything — the exact trap this project hit twice). Pick a user who has
--   --    at least one accepted friend to see real rows.
--   begin;
--     select set_config(
--       'request.jwt.claims',
--       json_build_object('sub', (select p.user_id from public.profiles p limit 1))::text,
--       true
--     );
--     select * from public.friend_debts_summary();   -- expect 8 columns, no error
--   rollback;
--
--   -- 1b. row count = the caller's ACCEPTED-friend count (a cleared friend still
--   --     gets a row). Impersonate a user WITH accepted friends for this to bite:
--   begin;
--     select set_config(
--       'request.jwt.claims',
--       json_build_object('sub', (
--         select fc.requester_id from public.friend_connections fc
--          where fc.status = 'accepted' limit 1
--       ))::text,
--       true
--     );
--     select
--       (select count(*) from public.friend_debts_summary())                    as fn_rows,
--       (select count(*) from public.friend_connections fc
--         where fc.status = 'accepted'
--           and (fc.requester_id = auth.uid() or fc.addressee_id = auth.uid())) as accepted_friends;
--     -- expect: fn_rows = accepted_friends (skip if there are no accepted rows yet)
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
--
--   -- 5. FULL PATH with fabricated data — the one that actually proves the logic.
--   --    On a fresh DB friend_connections is empty, so tests 1/1b return 0 rows and
--   --    NEVER exercise the join or the shared/private split. This inserts a real
--   --    accepted friendship + one SHARED and one PRIVATE confirmed debt between
--   --    two real users (me as creditor on both, distinct amounts 500 / 300), calls
--   --    the function as me, and asserts the two groups land in separate columns
--   --    (a bug that merged them would show 800 in shared_they_owe_me). Everything
--   --    is ROLLED BACK — no row survives. Needs >= 2 users and assumes the two
--   --    picked users aren't already connected (true on a fresh DB).
--   begin;
--   do $$
--   declare
--     v_me     uuid;
--     v_friend uuid;
--     v_rows   int;
--     v_sto    numeric;   -- shared_they_owe_me
--     v_pto    numeric;   -- private_they_owe_me
--     v_sio    numeric;   -- shared_i_owe_them
--   begin
--     select p.user_id into v_me     from public.profiles p order by p.created_at, p.user_id limit 1;
--     select p.user_id into v_friend from public.profiles p
--       where p.user_id <> v_me order by p.created_at, p.user_id limit 1;
--     if v_friend is null then
--       raise notice 'skip test 5: need >= 2 users';
--       return;
--     end if;
--
--     perform set_config('request.jwt.claims', json_build_object('sub', v_me)::text, true);
--
--     insert into public.friend_connections (requester_id, addressee_id, status, responded_at)
--       values (v_me, v_friend, 'accepted', now());
--
--     insert into public.debts (creditor_id, debtor_id, amount, visibility, status, created_by, confirmed_at)
--       values (v_me, v_friend, 500, 'shared',  'confirmed', v_me, now()),
--              (v_me, v_friend, 300, 'private', 'confirmed', v_me, now());
--
--     select count(*) into v_rows from public.friend_debts_summary();
--     select s.shared_they_owe_me, s.private_they_owe_me, s.shared_i_owe_them
--       into v_sto, v_pto, v_sio
--       from public.friend_debts_summary() s;
--
--     assert v_rows = 1,   format('test 5: expected 1 row, got %s', v_rows);
--     assert v_sto  = 500, format('test 5: shared_they_owe_me expected 500, got %s (private leaked in?)', v_sto);
--     assert v_pto  = 300, format('test 5: private_they_owe_me expected 300, got %s', v_pto);
--     assert v_sio  = 0,   format('test 5: shared_i_owe_them expected 0, got %s', v_sio);
--     raise notice 'test 5 OK: 1 row, shared_they_owe_me=% private_they_owe_me=% (groups separate)', v_sto, v_pto;
--   end $$;
--   rollback;
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
-- SECTION 3 — friend_debts_summary: net balance with EVERY accepted friend at
-- once, split by visibility. Drop the old (uuid) overload first — the
-- returns-table shape changes, so create-or-replace is impossible and would
-- leave a stale overload (0015 §9). No `if exists`: fail loudly if the
-- signature is wrong.
--
-- BASE = friend_connections (accepted), LEFT JOINed to confirmed debts, so a
-- friend who is fully cleared STILL gets a row (all totals 0 → "เคลียร์แล้ว")
-- and the page never merges a separate friend list. `display_name` rides along
-- from profiles (its SELECT policy already allows an accepted friend's row).
-- Per row, for SHARED and PRIVATE separately: `*_they_owe_me` (caller is
-- creditor), `*_i_owe_them` (caller is debtor), `*_net` (they_owe_me −
-- i_owe_them, signed).
--
-- RETURNS TABLE makes the output names variables in scope, so every table is
-- aliased (fc / f / p / d) and every column qualified; the derived counterpart
-- is named `friend_uid` (not `friend_id`) so it can't collide with the OUT
-- column. SECURITY INVOKER + STABLE + search_path='': reads through the debts
-- and profiles SELECT policies (0015 §8 / §3), so another person's private note
-- — or a stranger's profile — can never leak into these rows.
-- ===========================================================================
drop function public.friend_debts_summary(uuid);

create or replace function public.friend_debts_summary()
returns table (
  friend_id           uuid,
  display_name        text,
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
    f.friend_uid,
    p.display_name,
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
  from (
    select case when fc.requester_id = auth.uid() then fc.addressee_id else fc.requester_id end as friend_uid
    from public.friend_connections fc
    where fc.status = 'accepted'
      and (fc.requester_id = auth.uid() or fc.addressee_id = auth.uid())
  ) f
  left join public.profiles p on p.user_id = f.friend_uid
  left join public.debts d
    on d.status = 'confirmed'
   and ((d.creditor_id = auth.uid() and d.debtor_id   = f.friend_uid)
     or (d.debtor_id   = auth.uid() and d.creditor_id = f.friend_uid))
  group by f.friend_uid, p.display_name;
end;
$$;

grant execute on function public.friend_debts_summary() to authenticated;


-- ===========================================================================
-- Tail — self-record + reload PostgREST.
-- ===========================================================================
insert into public.schema_migrations (version) values ('0017') on conflict do nothing;

notify pgrst, 'reload schema';
