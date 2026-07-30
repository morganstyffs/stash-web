-- ============================================================================
-- Stash — 0016_category_color_index
-- Closes PR-C at the database. PR-C swapped the client palette to คราม, but the
-- categories' colours live in the DB (seed_defaults_internal wrote fixed hex),
-- and every row got a value — so useHome's null-only FALLBACK_SLICE_COLORS never
-- fired and the NEW 6-colour palette never reached the screen. The donut has
-- been showing the OLD mint palette all along.
--
-- Fix: the DB stores MEANING (a colour slot 1–6), the client stores LOOKS (the
-- hex/token for each slot). Same principle as computePace() returning a `status`
-- not a colour. Changing the palette next time needs zero DB work.
--   • categories.color_index smallint 1–6  (new; backfilled)
--   • categories.color (hex)               (dropped — one source of truth)
--   • categories.icon                      (default + NOT NULL; unknown names
--                                            already degrade to a tag glyph in
--                                            lib/icons.tsx, so NO name whitelist)
--   • new categories get an unused colour first (random), then any of 1–6 once
--     all six are taken — computed in ONE SQL place (pick_category_color_index),
--     applied by a BEFORE INSERT trigger. The client never computes a colour.
--
-- seed_defaults_internal was last rewritten in 0015 → reproduced from THAT
-- version (convention 3), signature unchanged (uuid) → create-or-replace.
--
-- Run in Supabase SQL Editor as owner, wrapped in begin; … commit;. Snapshot
-- seed_defaults_internal first (0015 SECTION 5) before the replace. Every
-- statement is idempotent (if-[not-]exists / null-guarded), so the whole file is
-- safe to re-run after a partial failure.
--
-- ── SMOKE TEST (run AFTER commit; must prove it WORKS, not just exists) ──────
--   -- 1. every row has a colour slot 1–6, none null:
--   select count(*)                                            as rows,
--          count(*) filter (where color_index between 1 and 6) as in_range,
--          count(*) filter (where color_index is null)         as null_ci
--   from public.categories;                       -- expect rows = in_range, null_ci = 0
--
--   -- 2. every row has an icon:
--   select count(*) filter (where icon is null) as null_icon from public.categories;  -- expect 0
--
--   -- 3. the old hex column is gone:
--   select count(*) as color_col
--   from information_schema.columns
--   where table_schema='public' and table_name='categories' and column_name='color';  -- expect 0
--
--   -- 4. exactly one seed function:
--   select count(*) as seed_defs from pg_proc where proname='seed_defaults_internal';  -- expect 1
--
--   -- 5. the picker returns a valid slot for a real user, WITHOUT writing anything:
--   begin;
--     select public.pick_category_color_index(
--              (select user_id from public.categories limit 1)
--            ) between 1 and 6 as picker_ok;      -- expect true
--   rollback;
-- ============================================================================


-- ===========================================================================
-- SECTION 1 — categories.color_index (nullable first, so we can backfill).
-- ===========================================================================
alter table public.categories add column if not exists color_index smallint;


-- ===========================================================================
-- SECTION 2 — backfill color_index. Cycle 1→6 by sort_order WITHIN each user,
-- so neighbouring categories never share a slot. sort_order is not unique per
-- user (income/expense reuse 10/20/30…), so row_number tie-breaks on created_at
-- to stay deterministic. Only fills rows still null → idempotent on re-run.
-- ===========================================================================
with ranked as (
  select
    id,
    (((row_number() over (partition by user_id order by sort_order, created_at)) - 1) % 6 + 1)::smallint
      as ci
  from public.categories
)
update public.categories c
set color_index = r.ci
from ranked r
where r.id = c.id
  and c.color_index is null;

alter table public.categories alter column color_index set not null;

-- Sentinel default 0 means "DB, pick a colour for me": the BEFORE INSERT trigger
-- in SECTION 6 always replaces 0 / null / out-of-range with a real 1–6, so no
-- STORED row is ever 0 and the CHECK below always holds. A plain default (say 1)
-- couldn't be told apart from a user who deliberately picked slot 1, and no
-- default at all would force every client insert to send color_index.
alter table public.categories alter column color_index set default 0;

alter table public.categories drop constraint if exists categories_color_index_range;
alter table public.categories
  add constraint categories_color_index_range check (color_index between 1 and 6);


-- ===========================================================================
-- SECTION 3 — categories.icon: default + NOT NULL. 'tag' matches the fallback
-- glyph in lib/icons.tsx (categoryIcon() returns IconTag for unknown/blank), so
-- an unknown name degrades softly and no CHECK whitelist is needed — the UI
-- limits the choices instead. (Survey: 0 null icons, so the update is a no-op,
-- but keep it for safety + future inserts.)
-- ===========================================================================
alter table public.categories alter column icon set default 'tag';
update public.categories set icon = 'tag' where icon is null;
alter table public.categories alter column icon set not null;


-- ===========================================================================
-- SECTION 4 — drop the old hex column. Colours now live in the client, keyed by
-- color_index; keeping both would be the two-sources-of-truth bug we're fixing.
-- ===========================================================================
alter table public.categories drop column if exists color;


-- ===========================================================================
-- SECTION 5 — pick_category_color_index(user): the ONE place that chooses a
-- colour for a new category. Prefers a slot the user hasn't used yet (random
-- among the free ones); once all six are taken, any of 1–6. SECURITY INVOKER —
-- it only reads the caller's own categories (RLS: auth.uid() = user_id), which
-- is all a trigger firing on the caller's insert needs.
-- ===========================================================================
create or replace function public.pick_category_color_index(p_user_id uuid)
returns smallint
language sql
volatile
security invoker
set search_path = ''
as $$
  with used as (
    select distinct color_index from public.categories where user_id = p_user_id
  ),
  free as (
    select g::smallint as idx
    from generate_series(1, 6) as g
    where not exists (select 1 from used u where u.color_index = g)
  )
  select coalesce(
    (select idx from free order by random() limit 1),
    (1 + floor(random() * 6))::smallint
  );
$$;

grant execute on function public.pick_category_color_index(uuid) to authenticated;


-- ===========================================================================
-- SECTION 6 — assign the colour in the DB, never the client. On INSERT, if
-- color_index is the sentinel 0 / null / out-of-range, fill it from the picker;
-- an explicit 1–6 (the user chose a colour in the form) is kept.
-- ===========================================================================
create or replace function public.set_category_color_index()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.color_index is null or new.color_index < 1 or new.color_index > 6 then
    new.color_index := public.pick_category_color_index(new.user_id);
  end if;
  return new;
end;
$$;

drop trigger if exists set_category_color_index on public.categories;
create trigger set_category_color_index
  before insert on public.categories
  for each row execute function public.set_category_color_index();


-- ===========================================================================
-- SECTION 7 — seed_defaults_internal: reproduced from 0015 SECTION 5 verbatim,
-- with `color` (hex) swapped for `color_index`. Signature unchanged → create or
-- replace. The 13 defaults cycle 1→6 in insert order so adjacent categories get
-- different colours. These explicit values satisfy the trigger (non-null 1–6),
-- so the picker isn't invoked during seeding.
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
    (uid, 'จ่ายชำระหนี้',    'expense', false, true,  'debt_repayment_expense', 'arrow-up-right',3, 90);

  insert into public.categories
    (user_id, name, kind, is_stock_category, is_system, system_key, icon, color_index, sort_order) values
    (uid, 'เงินเดือน',    'income', false, false, null,                     'cash',            4, 10),
    (uid, 'ฟรีแลนซ์',     'income', false, false, null,                     'briefcase',       5, 20),
    (uid, 'ขายสต็อก',     'income', false, true,  'stock_sale_income',      'box',             6, 30),
    (uid, 'ได้รับชำระหนี้', 'income', false, true,  'debt_repayment_income', 'arrow-down-left', 1, 40);

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
-- Tail — self-record + reload PostgREST.
-- ===========================================================================
insert into public.schema_migrations (version) values ('0016') on conflict do nothing;

notify pgrst, 'reload schema';
