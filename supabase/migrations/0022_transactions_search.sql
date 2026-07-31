-- ============================================================================
-- Stash — 0022_transactions_search
-- One RPC behind the ประวัติ screen: the filtered/searched page of rows AND the
-- totals for that same match set, from a single query.
--
-- WHAT WAS WRONG (both confirmed by reading src/hooks/useHistory.ts):
--   1. Search only ever matched `note` (`.ilike('note', …)`). Notes are optional
--      on AddPage, so most rows have none — typing "อาหาร" returned nothing even
--      with a hundred อาหาร rows on screen. To the user the box looks broken.
--   2. useHistoryTotals() ran a SECOND query with NO range: it pulled every
--      matching row to the browser just to sum two numbers, and it re-implemented
--      the filter predicate by copy-paste. Its own comment admits it ("if you
--      change one, change the other, or the summary card and the filtered list
--      below it will silently disagree") — that is convention 10 violated in
--      writing, waiting to become a bug.
--
-- WHY ONE FUNCTION, NOT TWO: splitting into transactions_search +
-- transactions_search_summary would just move the duplicated predicate from TS
-- into SQL. Window aggregates over the un-LIMITed match set (count(*) over ())
-- put the page and its totals in ONE query, so they cannot disagree —
-- structurally, not by discipline. Same reasoning as ConfirmDebtSheet refusing
-- to accept a hideBalance prop (STASH_CONTEXT §11.4-11). The three totals repeat
-- on every row; at 50 rows/page that is noise on the wire and worth it.
--
-- Window functions are evaluated AFTER where/join but BEFORE order by/limit, so
-- match_count is the size of the whole match set, not of the page. That is the
-- single most important property here and the smoke test asserts it directly
-- (case 6: limit 1 must still report match_count = 2).
--
-- WHAT THIS DELIBERATELY DOES NOT CHANGE (separate concern, separate PR):
--   • the meaning of each filter. 'expense' still means type=expense AND NOT
--     is_stock_purchase — so it still includes COGS and debt settlements. 'stock'
--     still means is_stock_purchase OR stock_item_id is not null. Byte-for-byte
--     the same predicates as the TS they replace, so this PR can only change how
--     SEARCH behaves, never what the list contains.
--   • match_expense = every non-income row in the set, which on filter='all'
--     includes stock PURCHASES (an asset conversion, not spending — money rule
--     1). That is the existing behaviour of useHistoryTotals; preserved on
--     purpose so this migration is not two changes wearing one hat.
--
-- SECURITY INVOKER (not definer): transactions/categories both carry
-- `auth.uid() = user_id` RLS, which is exactly the scoping this function needs —
-- the definer treatment is only for the cross-user ยอดค้าง tables (§3). STABLE,
-- set search_path = '', execute revoked from public/anon and granted to
-- authenticated, per house style.
--
-- Run in Supabase SQL Editor as owner, wrapped in begin; … commit;.
--
-- ── PRE-FLIGHT (expect the shown values) ────────────────────────────────────
--   -- new function, must not exist yet:
--   select count(*) from pg_proc where proname = 'transactions_search';  -- 0
--   -- the index this replaces/extends:
--   select indexname from pg_indexes
--    where tablename = 'transactions';        -- transactions_user_date_idx, …
--
-- ── SMOKE TEST (run AFTER commit — must prove it WORKS, not that it exists) ──
--   One begin;…rollback;, nothing survives. Builds its own rows (an empty or
--   unknown DB would prove nothing), asserts observable results, and ends with
--   the RLS check under the real `authenticated` role — the assert that matters
--   for a search function. If any assert fails: STOP and report, do not patch.
--
--   begin;
--   do $$
--   declare
--     v_user uuid; v_other uuid; v_cat uuid; v_cat2 uuid; v_inccat uuid;
--     v_cnt bigint; v_rows int; v_inc numeric; v_exp numeric; v_err boolean;
--   begin
--     select p.user_id into v_user from public.profiles p
--       where exists (select 1 from public.categories c
--                      where c.user_id = p.user_id and c.kind = 'income')
--       order by p.created_at, p.user_id limit 1;
--     select p.user_id into v_other from public.profiles p
--       where p.user_id <> v_user order by p.created_at, p.user_id limit 1;
--     if v_user is null or v_other is null then
--       raise notice 'skip: need 2 users (one with an income category)'; return;
--     end if;
--
--     -- own fixtures: two distinctly-named categories + one existing income cat
--     insert into public.categories (user_id, name, kind, icon, sort_order)
--       values (v_user, 'ZZTESTหมวด', 'expense', 'tag', 900) returning id into v_cat;
--     insert into public.categories (user_id, name, kind, icon, sort_order)
--       values (v_user, 'QQOTHER',    'expense', 'tag', 901) returning id into v_cat2;
--     select c.id into v_inccat from public.categories c
--       where c.user_id = v_user and c.kind = 'income' order by c.sort_order, c.id limit 1;
--
--     -- t1 matches by NOTE only, t2 matches by CATEGORY NAME and by AMOUNT only,
--     -- t3 is income and must never show up under an expense filter.
--     insert into public.transactions (user_id, type, amount, category_id, date, note)
--       values (v_user, 'expense', 123.45, v_cat2,   current_date, 'ZZTESTโน้ต');
--     insert into public.transactions (user_id, type, amount, category_id, date, note)
--       values (v_user, 'expense', 777,    v_cat,    current_date, null);
--     insert into public.transactions (user_id, type, amount, category_id, date, note)
--       values (v_user, 'income',  999,    v_inccat, current_date, null);
--
--     -- (1) note match
--     select count(*) into v_rows from public.transactions_search('all','ZZTESTโน้ต',50,0);
--     assert v_rows = 1, format('1: note search returned %s rows (want 1)', v_rows);
--
--     -- (2) category-name match — the whole point of this PR (row has NO note)
--     select count(*) into v_rows from public.transactions_search('all','ZZTESTหมวด',50,0);
--     assert v_rows = 1, format('2: category-name search returned %s (want 1)', v_rows);
--
--     -- (3) amount match
--     select count(*) into v_rows from public.transactions_search('all','777',50,0);
--     assert v_rows = 1, format('3: amount search returned %s (want 1)', v_rows);
--
--     -- (4) totals ride with the page and cover BOTH match paths
--     select r.match_count, r.match_income, r.match_expense
--       into v_cnt, v_inc, v_exp
--       from public.transactions_search('all','ZZTEST',50,0) r limit 1;
--     assert v_cnt = 2,          format('4: match_count %s (want 2)', v_cnt);
--     assert v_inc = 0,          format('4: match_income %s (want 0)', v_inc);
--     assert v_exp = 900.45,     format('4: match_expense %s (want 900.45)', v_exp);
--
--     -- (5) filter still means what it meant: income filter excludes both expenses
--     select count(*) into v_rows
--       from public.transactions_search('income','ZZTEST',50,0);
--     assert v_rows = 0, format('5: income filter leaked %s expense rows', v_rows);
--
--     -- (6) THE structural property: a 1-row page still reports the FULL count
--     select count(*) into v_rows from public.transactions_search('all','ZZTEST',1,0);
--     assert v_rows = 1, format('6: limit 1 returned %s rows', v_rows);
--     select r.match_count into v_cnt
--       from public.transactions_search('all','ZZTEST',1,0) r limit 1;
--     assert v_cnt = 2, format('6: paged match_count %s — window ran AFTER limit', v_cnt);
--
--     -- (7) LIKE metacharacters are escaped, not honoured as wildcards
--     select count(*) into v_rows from public.transactions_search('all','ZZ%TEST',50,0);
--     assert v_rows = 0, format('7: %% behaved as a wildcard (%s rows)', v_rows);
--
--     -- (8) unknown filter raises instead of silently returning everything
--     v_err := false;
--     begin
--       perform public.transactions_search('nope', null, 50, 0);
--     exception when others then v_err := true; end;
--     assert v_err, '8: an unknown filter must raise';
--
--     -- (9) exactly one definition
--     assert (select count(*) from pg_proc where proname = 'transactions_search') = 1,
--       '9: defs != 1';
--
--     -- (10) RLS: another signed-in user sees none of it. Runs as the real
--     --      `authenticated` role (owner bypasses RLS, so role-switching is the
--     --      only way this assert means anything). Last on purpose — no reset.
--     perform set_config('request.jwt.claims', json_build_object('sub', v_other)::text, true);
--     perform set_config('role', 'authenticated', true);
--     select count(*) into v_rows from public.transactions_search('all','ZZTEST',50,0);
--     assert v_rows = 0, format('10: RLS LEAK — other user saw %s rows', v_rows);
--
--     raise notice 'SMOKE OK: note/category/amount match, totals cover the whole set, escaping, RLS';
--   end $$;
--   rollback;
-- ============================================================================


-- ===========================================================================
-- SECTION 1 — paging index.
-- The function orders by (date desc, created_at desc, id desc); the existing
-- transactions_user_date_idx (0001) only covers (user_id, date desc), so the
-- tiebreakers were being sorted in memory on every page. Additive: the old
-- index is left in place (it still serves the month-range scans in useHome /
-- useBudgets, which never touch created_at).
-- ===========================================================================
create index if not exists transactions_user_page_idx
  on public.transactions (user_id, date desc, created_at desc, id desc);


-- ===========================================================================
-- SECTION 2 — transactions_search.
--
-- p_filter  'all' | 'income' | 'expense' | 'stock'  (allowlist; anything else
--           raises — convention 14 says allowlist, never denylist)
-- p_q       free text; null/blank means "no search". Matched against the note,
--           the category name, and — when it parses as a plain number — the
--           amount exactly. LIKE metacharacters in p_q are escaped so a typed
--           '%' is a literal percent sign, not "match everything".
-- p_limit   page size, clamped to 1..200 (a page size, not money — the no-silent-
--           clamp rule is about displayed amounts, §11.4-8)
-- p_offset  rows to skip
--
-- AMBIGUITY (convention 7 / §9 — the qty_remaining trap): every OUT column below
-- is also a variable in scope, so EVERY column reference in the query body is
-- table-qualified (t.* / c.*). Do not "tidy" a qualifier away.
-- ===========================================================================
create or replace function public.transactions_search(
  p_filter text,
  p_q      text,
  p_limit  integer,
  p_offset integer
)
returns table (
  id                   uuid,
  "type"               public.transaction_type,
  amount               numeric,
  "date"               date,
  note                 text,
  created_at           timestamptz,
  is_stock_purchase    boolean,
  is_stock_cogs        boolean,
  is_debt_settlement   boolean,
  stock_item_id        uuid,
  category_name        text,
  category_icon        text,
  category_color_index smallint,
  match_count          bigint,
  match_income         numeric,
  match_expense        numeric
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_q      text    := nullif(btrim(coalesce(p_q, '')), '');
  v_pat    text;
  v_num    numeric;
  v_limit  integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if p_filter is null or p_filter not in ('all', 'income', 'expense', 'stock') then
    raise exception 'unknown filter: %', p_filter;
  end if;

  if v_q is not null then
    -- escape \, % and _ so user text is matched literally (default LIKE escape
    -- character is the backslash)
    v_pat := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    -- a plain number also matches the amount EXACTLY — "500" means 500, not
    -- "anything containing 500"; substring-matching money reads as noise
    if v_q ~ '^[0-9]+(\.[0-9]+)?$' then
      v_num := v_q::numeric;
    end if;
  end if;

  return query
  select
    t.id,
    t.type,
    t.amount,
    t.date,
    t.note,
    t.created_at,
    t.is_stock_purchase,
    t.is_stock_cogs,
    t.is_debt_settlement,
    t.stock_item_id,
    c.name,
    c.icon,
    c.color_index,
    -- over () = the whole match set, evaluated before order by / limit
    count(*) over ()                                                  as match_count,
    sum(case when t.type = 'income' then t.amount else 0 end) over () as match_income,
    sum(case when t.type = 'income' then 0 else t.amount end) over () as match_expense
  from public.transactions t
  left join public.categories c on c.id = t.category_id
  where (
             p_filter = 'all'
          or (p_filter = 'income'  and t.type = 'income')
          or (p_filter = 'expense' and t.type = 'expense' and t.is_stock_purchase = false)
          or (p_filter = 'stock'   and (t.is_stock_purchase or t.stock_item_id is not null))
        )
    and (
             v_q is null
          or t.note ilike v_pat
          or c.name ilike v_pat
          or (v_num is not null and t.amount = v_num)
        )
  -- t.id last so paging is deterministic when date + created_at tie (previously
  -- two rows sharing both could swap across the 50-row page boundary and be
  -- duplicated or skipped on "โหลดเพิ่ม")
  order by t.date desc, t.created_at desc, t.id desc
  limit v_limit offset v_offset;
end;
$$;

revoke execute on function public.transactions_search(text, text, integer, integer) from public;
revoke execute on function public.transactions_search(text, text, integer, integer) from anon;
grant  execute on function public.transactions_search(text, text, integer, integer) to authenticated;


-- ===========================================================================
-- Tail — self-record + reload PostgREST.
-- ===========================================================================
insert into public.schema_migrations (version) values ('0022') on conflict do nothing;

notify pgrst, 'reload schema';
