-- ============================================================================
-- Stash — 0008_security_hardening
-- Security hardening of existing SECURITY DEFINER / RPC functions.
--
-- additive-only, idempotent (create or replace + explicit revoke/grant). No
-- table changes. Run in Supabase SQL Editor as project owner.
--
-- What this migration does:
--   1. Splits seed_defaults(uid) into a locked-down internal seeder (called by
--      the signup trigger only) and a public RPC that verifies the caller owns
--      the uid before seeding. Adds explicit revoke/grant so anon can never call
--      it.
--   2. Pins search_path = '' on recurring_next_date / recurring_run_due to match
--      every other function in the schema (prevents search_path hijacking).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1a. Internal seeder — the ONLY place the default-data inserts live.
--     SECURITY DEFINER (runs as owner) and NOT auth-checked, because its sole
--     legitimate caller is the on_auth_user_created trigger, which fires with
--     auth.uid() = NULL (there is no request JWT during the signup insert).
--     Execute is revoked from every client role so it can never be reached
--     directly over PostgREST — only the trigger (owner context) and the
--     public wrapper below (SECURITY DEFINER, owner context) can call it.
-- ---------------------------------------------------------------------------
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

  -- Wallets
  insert into public.wallets (user_id, name, type, balance) values
    (uid, 'เงินสด',   'cash',      0),
    (uid, 'ธนาคาร',    'bank',      0),
    (uid, 'พร้อมเพย์', 'promptpay', 0);

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
end;
$$;

-- Lock the internal seeder down: no client role may call it.
revoke execute on function public.seed_defaults_internal(uuid) from public;
revoke execute on function public.seed_defaults_internal(uuid) from anon;
revoke execute on function public.seed_defaults_internal(uuid) from authenticated;

-- ---------------------------------------------------------------------------
-- 1b. Public RPC — a logged-in user seeding themselves once. SECURITY DEFINER
--     so it can reach the internal seeder, but it first proves the caller is
--     authenticated AND is the same user as `uid`, so it cannot be used to
--     seed (or probe) another account, and cannot be called anonymously.
--
--     auth.uid() reads the request JWT claim and is unaffected by SECURITY
--     DEFINER, so the check is meaningful here.
-- ---------------------------------------------------------------------------
create or replace function public.seed_defaults(uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or auth.uid() <> uid then
    raise exception 'not authorized' using errcode = 'insufficient_privilege';
  end if;
  perform public.seed_defaults_internal(uid);
end;
$$;

-- Only authenticated users may call the public wrapper; anon/public cannot.
revoke execute on function public.seed_defaults(uuid) from public;
revoke execute on function public.seed_defaults(uuid) from anon;
grant  execute on function public.seed_defaults(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 1c. Re-point the signup trigger at the internal seeder. handle_new_user runs
--     as owner (SECURITY DEFINER) so it retains execute on the locked-down
--     internal function, while the now-guarded public seed_defaults would
--     reject it (auth.uid() is NULL during the auth.users insert).
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_defaults_internal(new.id);
  return new;
end;
$$;

-- Trigger definition is unchanged; recreate defensively so this migration is
-- self-contained and safe to run on a fresh restore.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 2. Pin search_path = '' on the recurring helpers (convention: every function
--    in this schema resolves objects with an empty search_path so a caller
--    cannot shadow `public`/`pg_temp` objects). Bodies are unchanged and
--    already fully schema-qualify every reference, so this is a no-op at
--    runtime beyond closing the search_path hole.
-- ---------------------------------------------------------------------------
create or replace function public.recurring_next_date(p_from date, p_schedule text)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  kind      text := split_part(p_schedule, ':', 1);
  arg       text := split_part(p_schedule, ':', 2);
  sched_day int;
  next_mon  date;
  dim       int;   -- days in the target month
begin
  if kind = 'daily' then
    return p_from + 1;
  elsif kind = 'weekly' then
    return p_from + 7;
  elsif kind = 'monthly' then
    -- Use the day stored in the schedule (not p_from's day, which may have been
    -- clamped by a short month) so e.g. Jan 31 → Feb 28 → Mar 31 is restored.
    sched_day := coalesce(nullif(arg, '')::int, extract(day from p_from)::int);
    next_mon  := (date_trunc('month', p_from::timestamp) + interval '1 month')::date;
    dim       := extract(
      day from (date_trunc('month', next_mon::timestamp) + interval '1 month - 1 day')
    )::int;
    return next_mon + (least(sched_day, dim) - 1);
  end if;
  return null;  -- unknown schedule
end;
$$;

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
begin
  for r in
    select *
    from public.recurring
    where active = true
      and next_run is not null
      and next_run <= current_date
      and user_id = auth.uid()
    for update skip locked
  loop
    guard := 0;
    while r.active
      and r.next_run is not null
      and r.next_run <= current_date
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

grant execute on function public.recurring_next_date(date, text) to authenticated;
grant execute on function public.recurring_run_due() to authenticated;
