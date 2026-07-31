-- ============================================================================
-- Stash — 0023_transactions_search_month
-- เพิ่มตัวกรองเดือนให้ `transactions_search` — หน้าประวัติจะได้กรองเดือนได้
-- เหมือนที่หน้าแรกเลื่อนดูเดือนย้อนหลังได้ตั้งแต่ PR-27b
--
-- WHY THIS NEEDS SQL AT ALL:
-- The page is paginated INSIDE the function (p_limit / p_offset) and the totals
-- are window aggregates over the un-LIMITed match set. Filtering the month on
-- the client — after 50 rows have already been picked — would leave a page with
-- 3 rows, a next page with 0, and a "N รายการ" count that counts the wrong set.
-- The month has to be part of the same WHERE clause as everything else.
--
-- WHY ONE `p_month text` INSTEAD OF `p_from date` / `p_to date`:
-- `supabase gen types` emits function arguments as non-nullable, so a nullable
-- date pair could not express "no month filter" from the client without a cast,
-- and casts are banned (convention 11). PR-22 already hit this with `p_q` and
-- solved it the same way: the empty string means "no filter", nullif'd inside.
-- One parameter, one proven pattern, no nullability friction. The client already
-- speaks 'YYYY-MM' everywhere since PR-27a (`monthKey`).
--
-- WHAT IS REPRODUCED VERBATIM FROM 0022 (convention 3 — reproduce from the
-- latest version on main, never from an older file):
--   • the four filter predicates, byte-for-byte — this migration must not be
--     able to change WHICH rows the list contains, only allow narrowing by month
--   • the LIKE escaping and the exact-amount match
--   • the window aggregates and the reason they must run before LIMIT
--   • order by date desc, created_at desc, id desc (the id tiebreaker keeps
--     paging deterministic)
--   • security invoker + stable + set search_path = '' + revoke/grant
--
-- SIGNATURE CHANGE → the old function is dropped by its real signature with NO
-- `if exists` (convention 4), then recreated and re-granted. PostgREST calls by
-- argument name, so inserting p_month in the middle breaks no caller.
--
-- ⚠️ MERGE ORDER (§2.1 — the 0020 trap): this changes the signature of an RPC the
-- client calls. Do NOT merge the `types-drift` PR on its own. Pull
-- src/lib/database.types.ts into the feature branch and merge it together with
-- the call sites, in one PR.
--
-- Run in Supabase SQL Editor as owner, wrapped in begin; … commit;.
--
-- ── PRE-FLIGHT (expect the shown values) ────────────────────────────────────
--   -- exactly one definition today, with the 4-arg signature:
--   select count(*) from pg_proc where proname = 'transactions_search';   -- 1
--   select pg_get_function_identity_arguments(oid) from pg_proc
--    where proname = 'transactions_search';
--   -- expect: p_filter text, p_q text, p_limit integer, p_offset integer
--   -- ถ้าไม่ตรงนี้ หยุด — แปลว่า DB ไม่ตรงกับ 0022 บน main
--
-- ── SMOKE TEST ──────────────────────────────────────────────────────────────
--   อยู่ในไฟล์ `verify_0023_smoke.sql` (begin;…rollback;) — 14 assert
--   ครอบทั้งพฤติกรรมเดิมของ 0022 (ซึ่งไม่เคยถูกทดสอบมาก่อน) และตัวกรองเดือนใหม่
--   **ต้องรันและได้ SMOKE OK ก่อน merge PR ฝั่ง client**
-- ============================================================================


-- ===========================================================================
-- SECTION 1 — drop the 4-arg version by its real signature (no `if exists`).
-- ===========================================================================
drop function public.transactions_search(text, text, integer, integer);


-- ===========================================================================
-- SECTION 2 — transactions_search, reproduced from 0022 + p_month.
--
-- p_filter  'all' | 'income' | 'expense' | 'stock'  (allowlist; anything else raises)
-- p_q       free text; ว่าง = ไม่ค้น. Matched against note, category name, and —
--           when it parses as a plain number — the amount exactly. LIKE
--           metacharacters are escaped so a typed '%' is a literal percent sign.
-- p_month   'YYYY-MM' = เฉพาะเดือนนั้น · ว่าง/ช่องว่าง = ทุกเดือน.
--           รูปแบบผิด → raise (allowlist ไม่ใช่ denylist — convention 14).
--           ขอบเขต: วันแรกของเดือน (รวม) ถึงวันแรกของเดือนถัดไป (ไม่รวม) —
--           ตรงกับ MonthBounds.start / .next ฝั่ง client
-- p_limit   page size, clamped to 1..200 (a page size, not money)
-- p_offset  rows to skip
--
-- AMBIGUITY (convention 7 / §9 — the qty_remaining trap): every OUT column below
-- is also a variable in scope, so EVERY column reference in the query body is
-- table-qualified (t.* / c.*). Do not "tidy" a qualifier away.
-- ===========================================================================
create or replace function public.transactions_search(
  p_filter text,
  p_q      text,
  p_month  text,
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
  v_month  text    := nullif(btrim(coalesce(p_month, '')), '');
  v_pat    text;
  v_num    numeric;
  v_from   date;
  v_to     date;
  v_limit  integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if p_filter is null or p_filter not in ('all', 'income', 'expense', 'stock') then
    raise exception 'unknown filter: %', p_filter;
  end if;

  -- Blank means "every month". A malformed month is a caller bug, not a request
  -- for everything — raise instead of silently widening the result set.
  if v_month is not null then
    if v_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
      raise exception 'bad month: %', p_month;
    end if;
    v_from := to_date(v_month || '-01', 'YYYY-MM-DD');
    v_to   := (v_from + interval '1 month')::date;
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
    -- month window: start inclusive, next-month start exclusive — the totals are
    -- window aggregates over this same filtered set, so they narrow with it
    and (v_from is null or t.date >= v_from)
    and (v_to   is null or t.date <  v_to)
    and (
             v_q is null
          or t.note ilike v_pat
          or c.name ilike v_pat
          or (v_num is not null and t.amount = v_num)
        )
  -- t.id last so paging is deterministic when date + created_at tie
  order by t.date desc, t.created_at desc, t.id desc
  limit v_limit offset v_offset;
end;
$$;

revoke execute on function public.transactions_search(text, text, text, integer, integer) from public;
revoke execute on function public.transactions_search(text, text, text, integer, integer) from anon;
grant  execute on function public.transactions_search(text, text, text, integer, integer) to authenticated;


-- ===========================================================================
-- Tail — self-record + reload PostgREST.
-- ===========================================================================
insert into public.schema_migrations (version) values ('0023') on conflict do nothing;

notify pgrst, 'reload schema';
