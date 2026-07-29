-- ============================================================================
-- Stash — 0011_sku_config
-- Configurable, collision-safe SKU generation + supporting cleanups.
--
-- What this migration does (each in its own SECTION below):
--   0. schema_migrations ledger (F-15 prevention) — every migration self-records.
--   1. stock_sku_config — one row per user holding the SKU format + a forward-only
--      counter (next_seq). Changing the format never resets the counter.
--   2. seed_defaults_internal — reproduced from 0010/0008: seeds a stock_sku_config
--      row for new users AND drops `balance` from the wallets seed (see SECTION 3).
--   3. wallets.balance — dropped (audit F-05: dead column, never read or written).
--   4. stock_items — unique(user_id, sku) + sku set not null.
--   5. stock_sku_build — the single source of truth for assembling a SKU string.
--   6. stock_sku_preview — read-only next-SKU preview (does NOT consume the counter).
--   7. stock_intake_create — reproduced from 0010 (Asia/Bangkok date preserved),
--      now generating the SKU via the config + stock_sku_build with collision retry.
--
-- additive-only in spirit (create/alter), idempotent, hand-run in Supabase SQL
-- Editor as owner. NOTE the ordering dependency: SECTION 2 must stop referencing
-- wallets.balance BEFORE SECTION 3 drops it, or new signups would break.
--
-- Reproduce-safety: SECTION 7 reproduces stock_intake_create from the 0010
-- version (verified `Asia/Bangkok` present on main). The DROP uses the EXACT
-- signature read from the live DB (14 args, item_condition), not guessed from a
-- file — see SECTION 7. Verification below re-checks Asia/Bangkok survived.
--
-- Scope: DB + client previewSku replacement only. NOT in this migration: the SKU
-- settings screen, and NO backfill/rename of existing SKUs (there are none yet).
--
-- Temporary manual override (until the settings screen ships): e.g.
--   update public.stock_sku_config
--      set prefix='SHOP', brand_len=2, seq_digits=5, separator='_'
--    where user_id = auth.uid();
--
-- ── VERIFICATION (run AFTER applying) ──────────────────────────────────────
--   1) ledger backfilled 0001..0011:
--        select count(*) from public.schema_migrations where version <= '0011';  -- expect 11
--   1b) schema_migrations is locked down (RLS on, clients have no privileges):
--        select relrowsecurity from pg_class where oid = 'public.schema_migrations'::regclass;  -- true
--        select coalesce(bool_or(has_table_privilege(r, 'public.schema_migrations', p)), false)
--          from unnest(array['anon','authenticated']) r,
--               unnest(array['SELECT','INSERT','UPDATE','DELETE']) p;                            -- false
--   2) every user has exactly one config row:
--        select (select count(*) from auth.users)              as users,
--               (select count(*) from public.stock_sku_config) as configs;       -- equal
--   3) unique index present + sku NOT NULL:
--        select indexname from pg_indexes
--          where tablename='stock_items' and indexname='stock_items_user_sku_key';
--        select is_nullable from information_schema.columns
--          where table_name='stock_items' and column_name='sku';                 -- 'NO'
--   4) wallets.balance is gone:
--        select count(*) from information_schema.columns
--          where table_name='wallets' and column_name='balance';                 -- 0
--   5) stock_intake_create: exactly ONE def, keeps Asia/Bangkok, uses stock_sku_build:
--        select count(*) as defs,
--               bool_or(pg_get_functiondef(p.oid) ilike '%Asia/Bangkok%')  as has_bkk,
--               bool_or(pg_get_functiondef(p.oid) ilike '%stock_sku_build%') as uses_build
--          from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--         where n.nspname='public' and p.proname='stock_intake_create';          -- 1, true, true
--   6) EXECUTE granted to authenticated on all three functions:
--        select p.proname, has_function_privilege('authenticated', p.oid, 'EXECUTE') as can_exec
--          from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--         where n.nspname='public'
--           and p.proname in ('stock_intake_create','stock_sku_preview','stock_sku_build');
--   7) preview does NOT consume the counter:
--        select next_seq from public.stock_sku_config where user_id=auth.uid();   -- note it
--        select public.stock_sku_preview('Nike');                                 -- e.g. STZ-NIK-0001
--        select next_seq from public.stock_sku_config where user_id=auth.uid();   -- unchanged
-- ============================================================================


-- ===========================================================================
-- SECTION 0 — schema_migrations ledger  (audit F-15 prevention)
-- Every migration from 0011 on self-records at the end of its file, so the DB
-- can always answer "which file version am I at?". Backfill the ones already
-- applied (confirmed by the project owner). Locked down: owner-only, never
-- exposed to clients.
-- ===========================================================================
create table if not exists public.schema_migrations (
  version    text primary key,
  applied_at timestamptz not null default now()
);

insert into public.schema_migrations (version) values
  ('0001'),('0002'),('0003'),('0004'),('0005'),
  ('0006'),('0007'),('0008'),('0009'),('0010')
  on conflict (version) do nothing;

alter table public.schema_migrations enable row level security;   -- no policies => owner-only
revoke all on public.schema_migrations from anon, authenticated;


-- ===========================================================================
-- SECTION 1 — stock_sku_config  (one row per user)
-- The counter (next_seq) is semantically separate from the format columns:
-- changing prefix/brand_len/etc. must NOT reset the counter.
-- ===========================================================================
create table if not exists public.stock_sku_config (
  user_id        uuid        primary key default auth.uid()
                             references auth.users (id) on delete cascade,
  prefix         text        not null default 'STZ' check (prefix ~ '^[A-Z0-9]{0,6}$'),  -- empty allowed
  use_brand_code boolean     not null default true,
  brand_len      smallint    not null default 3     check (brand_len between 1 and 6),
  seq_digits     smallint    not null default 4     check (seq_digits between 2 and 8),
  separator      text        not null default '-'   check (separator in ('-', '_', '')),
  next_seq       bigint      not null default 1     check (next_seq >= 1),   -- forward-only
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- updated_at trigger (reuses the helper from 0001)
drop trigger if exists set_updated_at on public.stock_sku_config;
create trigger set_updated_at before update on public.stock_sku_config
  for each row execute function public.set_updated_at();

-- Row Level Security: owner-only, authenticated role (mirrors every other table).
alter table public.stock_sku_config enable row level security;

drop policy if exists stock_sku_config_select_own on public.stock_sku_config;
create policy stock_sku_config_select_own on public.stock_sku_config for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists stock_sku_config_insert_own on public.stock_sku_config;
create policy stock_sku_config_insert_own on public.stock_sku_config for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists stock_sku_config_update_own on public.stock_sku_config;
create policy stock_sku_config_update_own on public.stock_sku_config for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists stock_sku_config_delete_own on public.stock_sku_config;
create policy stock_sku_config_delete_own on public.stock_sku_config for delete to authenticated
  using (auth.uid() = user_id);

-- Backfill: one default row for every existing user (idempotent).
insert into public.stock_sku_config (user_id)
select id from auth.users
on conflict (user_id) do nothing;


-- ===========================================================================
-- SECTION 2 — seed_defaults_internal  (create or replace)
-- Reproduced verbatim from 0008 EXCEPT:
--   (a) the wallets insert no longer sets `balance` (dropped in SECTION 3), and
--   (b) a stock_sku_config row is seeded for the new user.
-- Category list is unchanged (10 categories incl. 2 stock categories).
-- SECURITY DEFINER + search_path='' preserved.
-- ===========================================================================
create or replace function public.seed_defaults_internal(uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only seed once: bail if this user already has categories.
  if exists (select 1 from public.categories where user_id = uid) then
    return;
  end if;

  -- Wallets (no `balance` column anymore)
  insert into public.wallets (user_id, name, type) values
    (uid, 'เงินสด',   'cash'),
    (uid, 'ธนาคาร',    'bank'),
    (uid, 'พร้อมเพย์', 'promptpay');

  -- Expense categories (icon = Tabler name; color = design token / hex)
  insert into public.categories (user_id, name, kind, is_stock_category, icon, color, sort_order) values
    (uid, 'อาหาร',       'expense', false, 'coffee',       '#FB7A57', 10),
    (uid, 'เดินทาง',      'expense', false, 'motorbike',    '#2CC0A0', 20),
    (uid, 'ช้อปปิ้ง',     'expense', false, 'shopping-bag', '#F5C64C', 30),
    (uid, 'บิล/ค่าบ้าน',  'expense', false, 'bolt',         '#171717', 40),
    (uid, 'บันเทิง',      'expense', false, 'device-tv',    '#34C471', 50),
    -- stock categories: saving here auto-opens the stock-item form
    (uid, 'เสื้อเข้าร้าน',   'expense', true,  'shirt', '#0E7D66', 60),
    (uid, 'รองเท้าเข้าร้าน', 'expense', true,  'shoe',  '#0E7D66', 70);

  -- Income categories
  insert into public.categories (user_id, name, kind, is_stock_category, icon, color, sort_order) values
    (uid, 'เงินเดือน',  'income', false, 'cash',      '#1D9E75', 10),
    (uid, 'ฟรีแลนซ์',   'income', false, 'briefcase', '#1D9E75', 20),
    (uid, 'ขายสต็อก',   'income', false, 'box',       '#0E7D66', 30);

  -- Default SKU config for the new user.
  insert into public.stock_sku_config (user_id) values (uid)
  on conflict (user_id) do nothing;
end;
$$;


-- ===========================================================================
-- SECTION 3 — drop wallets.balance  (audit F-05: dead column)
-- Never read or written by the app (verified: no read path, no write path sends
-- it; no view/trigger/generated column references it). MUST run AFTER SECTION 2
-- so the seeder no longer inserts into it.
-- ===========================================================================
alter table public.wallets drop column if exists balance;


-- ===========================================================================
-- SECTION 4 — stock_items: unique(user_id, sku) + sku NOT NULL
-- Safe: pre-check confirmed 0 rows and 0 duplicate SKUs, and the ONLY insert
-- path (stock_intake_create) always sets sku.
-- ===========================================================================
alter table public.stock_items alter column sku set not null;

do $$ begin
  alter table public.stock_items
    add constraint stock_items_user_sku_key unique (user_id, sku);
exception when duplicate_object then null; end $$;


-- ===========================================================================
-- SECTION 5 — stock_sku_build  (SINGLE source of truth for SKU assembly)
-- Pure/immutable. Called by BOTH stock_intake_create and stock_sku_preview so
-- the format lives in exactly one place. Encodes:
--   rule 3 — never truncate the sequence: pad to the greater of seq_digits and
--            the number's own length (plain lpad(x, n) TRUNCATES when x is
--            longer than n — that would mint duplicate codes).
--   rule 6 — join only non-empty parts, so an empty prefix never yields "-NIK-1".
--   rule 7 — brand code: prefer p_brand_code, else derive from p_brand; keep only
--            A-Z0-9 uppercased, take up to brand_len (no padding); empty => GEN.
-- ===========================================================================
create or replace function public.stock_sku_build(
  p_prefix    text,
  p_use_brand boolean,
  p_brand     text,
  p_brand_code text,
  p_brand_len int,
  p_seq       bigint,
  p_digits    int,
  p_sep       text
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_code   text;
  v_seqstr text;
begin
  if p_use_brand then                                                       -- rule 7
    v_code := upper(regexp_replace(coalesce(nullif(p_brand_code, ''), p_brand, ''),
                                   '[^a-zA-Z0-9]', '', 'g'));
    v_code := substring(v_code from 1 for greatest(p_brand_len, 0));        -- take up to brand_len, no pad
    if coalesce(v_code, '') = '' then
      v_code := 'GEN';
    end if;
  else
    v_code := '';
  end if;

  -- rule 3: pad but NEVER truncate.
  v_seqstr := lpad(p_seq::text, greatest(p_digits, length(p_seq::text)), '0');

  -- rule 6: assemble from non-empty parts only.
  return array_to_string(
    array_remove(array[nullif(p_prefix, ''), nullif(v_code, ''), v_seqstr], null),
    coalesce(p_sep, '')
  );
end;
$$;

grant execute on function public.stock_sku_build(text, boolean, text, text, int, bigint, int, text)
  to authenticated;


-- ===========================================================================
-- SECTION 6 — stock_sku_preview  (read-only; does NOT consume the counter)
-- Returns the SKU the NEXT intake would produce for a given brand. APPROXIMATE:
-- a concurrent intake may consume the sequence first, so the number can shift.
-- Falls back to hard-coded defaults when the caller has no config row (rule 5).
-- ===========================================================================
create or replace function public.stock_sku_preview(
  p_brand      text default null,
  p_brand_code text default null
)
returns text
language plpgsql
stable                       -- reads stock_sku_config (depends on auth.uid()); NOT immutable
security invoker
set search_path = ''
as $$
declare
  v_prefix text; v_use boolean; v_blen int; v_digits int; v_sep text; v_seq bigint;
begin
  select prefix, use_brand_code, brand_len, seq_digits, separator, next_seq
    into v_prefix, v_use, v_blen, v_digits, v_sep, v_seq
    from public.stock_sku_config
   where user_id = auth.uid();

  if not found then                                    -- rule 5: never fail
    v_prefix := 'STZ'; v_use := true; v_blen := 3; v_digits := 4; v_sep := '-'; v_seq := 1;
  end if;

  return public.stock_sku_build(v_prefix, v_use, p_brand, p_brand_code, v_blen, v_seq, v_digits, v_sep);
end;
$$;

grant execute on function public.stock_sku_preview(text, text) to authenticated;


-- ===========================================================================
-- SECTION 7 — stock_intake_create  (reproduced from 0010 + config-driven SKU)
-- The signature CHANGES (adds p_brand_code), so `create or replace` alone would
-- leave the old 14-arg version as a live overload. DROP the exact signature read
-- from the live DB (no `if exists` — a mismatch must fail loudly), then create
-- the 15-arg version and RE-GRANT (drop clears the grant).
--
-- Body is the 0010 version (Asia/Bangkok date preserved) with the count(*)-based
-- SKU block replaced by: atomic counter bump + stock_sku_build + collision retry
-- scoped to the SKU unique constraint only.
-- ===========================================================================
drop function public.stock_intake_create(
  text, numeric, integer, text, uuid, uuid, text, text, text,
  public.item_condition, numeric, text[], boolean, text);

create or replace function public.stock_intake_create(
  p_name          text,
  p_cost_per_unit numeric,
  p_qty           integer,
  p_category      text                  default null,
  p_category_id   uuid                  default null,
  p_wallet_id     uuid                  default null,
  p_brand         text                  default null,
  p_size          text                  default null,
  p_color         text                  default null,
  p_condition     public.item_condition default null,
  p_target_price  numeric               default null,
  p_photos        text[]                default '{}',
  p_needs_details boolean               default false,
  p_note          text                  default null,
  p_brand_code    text                  default null   -- NEW: optional manual brand code (client sends later)
)
returns table (transaction_id uuid, stock_item_id uuid, sku text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_today      date := (now() at time zone 'Asia/Bangkok')::date;   -- ★ preserved from 0010
  v_tx         uuid;
  v_item       uuid;
  v_sku        text;
  v_seq        bigint;
  v_prefix     text;
  v_use        boolean;
  v_blen       int;
  v_digits     int;
  v_sep        text;
  v_attempt    int := 0;
  v_constraint text;
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

  -- 1) the inventory-purchase expense (Bangkok wall-clock date, from 0010)
  insert into public.transactions
    (user_id, type, amount, category_id, wallet_id, note, is_stock_purchase, date)
  values
    (v_uid, 'expense', p_cost_per_unit * p_qty, p_category_id, p_wallet_id,
     coalesce(p_note, p_name), true, v_today)
  returning id into v_tx;

  -- ensure a config row exists (rule 5 self-heal — never fail on a missing row)
  insert into public.stock_sku_config (user_id) values (v_uid)
  on conflict (user_id) do nothing;

  -- 2) allocate a SKU + insert the item, retrying on SKU collision only.
  loop
    -- (rules 1,2) atomic, forward-only bump — the UPDATE row-locks the config
    -- row so concurrent intakes serialize instead of reusing a number.
    update public.stock_sku_config
       set next_seq = next_seq + 1
     where user_id = v_uid
    returning next_seq - 1, prefix, use_brand_code, brand_len, seq_digits, separator
      into v_seq, v_prefix, v_use, v_blen, v_digits, v_sep;

    v_sku := public.stock_sku_build(
      v_prefix, v_use, p_brand, p_brand_code, v_blen, v_seq, v_digits, v_sep);

    begin
      insert into public.stock_items
        (user_id, name, category, brand, size, color, condition,
         cost_per_unit, qty_total, qty_remaining, target_price, sku,
         status, needs_details, photos, source_transaction_id)
      values
        (v_uid, p_name, p_category, p_brand, p_size, p_color, p_condition,
         p_cost_per_unit, p_qty, p_qty, p_target_price, v_sku,
         'in_stock', coalesce(p_needs_details, false), coalesce(p_photos, '{}'), v_tx)
      returning id into v_item;
      exit;   -- success
    exception when unique_violation then
      -- Only our SKU constraint is retryable; any other unique violation is a
      -- real error and must surface immediately (not spin 10 empty rounds).
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint is distinct from 'stock_items_user_sku_key' then
        raise;
      end if;
      v_attempt := v_attempt + 1;
      if v_attempt >= 10 then
        raise exception 'could not allocate a unique SKU after % attempts', v_attempt;
      end if;
      -- else: loop — bump the counter again and retry (rule 4)
    end;
  end loop;

  -- 3) close the loop: point the transaction at the item it created
  update public.transactions set stock_item_id = v_item where id = v_tx;

  return query select v_tx, v_item, v_sku;
end;
$$;

-- re-grant (the DROP above cleared the old grant)
grant execute on function public.stock_intake_create(
  text, numeric, integer, text, uuid, uuid, text, text, text,
  public.item_condition, numeric, text[], boolean, text, text
) to authenticated;


-- ===========================================================================
-- Tail — self-record this migration, then tell PostgREST to reload its schema
-- cache (new RPCs stock_sku_build/preview + changed stock_intake_create + the
-- dropped wallets.balance column all need the cache refreshed, or the app hits
-- RPC 404s / 400s on stale column shapes).
-- ===========================================================================
insert into public.schema_migrations (version) values ('0011') on conflict do nothing;

notify pgrst, 'reload schema';
