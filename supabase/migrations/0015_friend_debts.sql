-- ============================================================================
-- Stash — 0015_friend_debts
-- "หนี้เพื่อน" — the first CROSS-USER feature in this app. Every table before
-- this migration is owned by exactly one user (RLS: auth.uid() = user_id).
-- friend_connections and debts are shared between two users, so they use a
-- DIFFERENT security model:
--
--   • profiles          — RLS SELECT (own row + accepted friends' rows), no
--                          direct INSERT/UPDATE/DELETE policy. Written only by
--                          the SECURITY DEFINER seed path (handle_new_user →
--                          seed_defaults_internal), same as every other seeded
--                          table in this app.
--   • friend_connections — RLS SELECT only (both parties). NO insert/update
--                          policy at all — every write goes through a
--                          SECURITY DEFINER RPC below.
--   • debts / debt_events — RLS SELECT only (visibility rules below). Same:
--                          zero direct writes, RPC-only.
--
-- WHY SECURITY DEFINER instead of the invoker pattern used by stock_sale_*:
-- stock_sale_create only ever writes rows the CALLER already owns, so the
-- existing "auth.uid() = user_id" insert/update policies cover it — invoker is
-- enough. Here there is no single owner column, so there is no owner-based
-- policy to lean on. Every definer RPC below re-implements that safety check by
-- hand (`auth.uid() must be one of the two parties`) instead of relying on RLS
-- for writes — read the guard at the top of each function before trusting it.
--
-- Friend discovery: NOT by email. Rule 16 ("ห้ามเผยว่าอีเมลมีบัญชีในระบบหรือไม่")
-- would be violated by an email-lookup add-friend box that answers found/not
-- found. Instead every profile gets a random, unguessable `friend_code`
-- (8 chars, 32-symbol alphabet ≈ 1.1e12 combinations, excludes 0/O/1/I) that the
-- owner shares out-of-band (LINE, in person, …) — same shape as a PromptPay ID.
-- A "code not found" error here is NOT an enumeration leak (a friend_code is a
-- shared invite string, not an email tied to account existence).
--
-- Debt/money interaction (decided 2026-07-30, see claude/DEBT_TRACKING_CONCEPT.md):
--   • A private "จดไว้เฉยๆ" note (visibility='private') needs no confirmation
--     and is visible ONLY to its creator — the other party never sees it.
--   • An official "สร้างยอดเรียกเก็บ" (visibility='shared') needs the OTHER
--     party to confirm/reject before it counts for either side.
--   • Settling is single-party: whoever clicks "เคลียร์แล้ว" picks THEIR OWN
--     wallet and gets a real transaction immediately (is_debt_settlement=true,
--     via two new system categories). The OTHER side is deliberately NOT given
--     a silent auto-transaction — this app never creates a money row without
--     the owning user choosing the wallet (see claude/DEBT_TRACKING_CONCEPT.md
--     §4). The client prompts them to log their own matching entry later.
--   • debt_repayment_income / debt_repayment_expense count in the home
--     headline + donut normally (real cash moved) but are EXCLUDED from
--     budgets — same treatment as stock_cogs (§4 rule 4 of STASH_CONTEXT.md):
--     paying back an old debt is not new discretionary spending this month.
--
-- SECTION order (load-bearing — friend_connections MUST exist before profiles'
-- RLS policy references it; this is a fix over the first draft of this file,
-- which had profiles before friend_connections and failed with
-- `42P01: relation "public.friend_connections" does not exist`):
--   1  enums
--   2  friend_connections table + RLS (select-only; RPCs added in SECTION 7)
--   3  profiles table + RLS (references friend_connections from SECTION 2)
--   4  generate_friend_code() (internal helper, no grant)
--   5  seed_defaults_internal — reproduced from 0012, + profile row
--   6  backfill: 2 new system categories + a profile row for existing users
--   7  friend_request_send / friend_request_respond
--   8  debts + debt_events tables + RLS (select-only)
--   9  transactions.is_debt_settlement
--  10  trigger: debt-settlement transactions are read-only (mirrors 0012 §8)
--  11  debt_create / debt_confirm / debt_reject / debt_cancel / debt_delete_private
--  12  debt_settle / debt_settle_reverse
--  13  friend_debts_summary
--
-- Run in Supabase SQL Editor as owner, wrapped in begin; … commit;
-- Every CREATE TABLE / TRIGGER / POLICY statement here is idempotent
-- (if-not-exists / drop-if-exists-then-create), so it is SAFE to simply re-run
-- this whole file even after a partial failure from the earlier ordering bug.
-- ============================================================================


-- ===========================================================================
-- SECTION 1 — enums
-- ===========================================================================
do $$ begin
  create type public.friend_status as enum ('pending', 'accepted');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.debt_visibility as enum ('private', 'shared');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.debt_status as enum
    ('pending_confirmation', 'confirmed', 'rejected', 'cancelled', 'settled');
exception when duplicate_object then null; end $$;


-- ===========================================================================
-- SECTION 2 — friend_connections. Created BEFORE profiles (SECTION 3) because
-- profiles' SELECT policy queries this table. SELECT-only RLS; every write is
-- RPC-gated (SECTION 7). requester <> addressee, one row per unordered pair.
-- ===========================================================================
create table if not exists public.friend_connections (
  id            uuid primary key default gen_random_uuid(),
  requester_id  uuid not null references auth.users (id) on delete cascade,
  addressee_id  uuid not null references auth.users (id) on delete cascade,
  status        public.friend_status not null default 'pending',
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  constraint friend_connections_no_self check (requester_id <> addressee_id)
);

create unique index if not exists friend_connections_pair_uidx
  on public.friend_connections (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

create index if not exists friend_connections_addressee_idx on public.friend_connections (addressee_id, status);
create index if not exists friend_connections_requester_idx on public.friend_connections (requester_id, status);

alter table public.friend_connections enable row level security;

drop policy if exists friend_connections_select on public.friend_connections;
create policy friend_connections_select on public.friend_connections
  for select to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- Deliberately NO insert / update / delete policy — see SECTION 7.


-- ===========================================================================
-- SECTION 3 — profiles
-- One row per auth user. display_name defaults from the email's local part at
-- seed time (there is no signup form to ask for a name — STASH_CONTEXT §1);
-- the owner renames it in Settings. friend_code is globally unique.
-- ===========================================================================
create table if not exists public.profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  friend_code  text not null unique,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists set_updated_at on public.profiles;
create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

-- Visible: your own row, or a row belonging to someone you're accepted-friends
-- with. NOT everyone — a stranger's friend_code alone must not expose their name.
drop policy if exists profiles_select_own_or_friend on public.profiles;
create policy profiles_select_own_or_friend on public.profiles
  for select to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.friend_connections fc
       where fc.status = 'accepted'
         and ((fc.requester_id = auth.uid() and fc.addressee_id = profiles.user_id)
           or (fc.addressee_id = auth.uid() and fc.requester_id = profiles.user_id))
    )
  );

-- Only your own display_name is editable; friend_code is immutable (no policy
-- path changes it, and there is no UPDATE grant for that column client-side —
-- enforced here by simply never exposing a way to set it from RPC/UI).
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Deliberately NO insert / delete policy: rows are created only by the
-- SECURITY DEFINER seed path and removed only via the auth.users cascade.


-- ===========================================================================
-- SECTION 4 — generate_friend_code(): internal only, no grant to any role.
-- Only ever called from inside another SECURITY DEFINER function (the seed
-- path), so it must itself see every existing code (not just friends' codes)
-- to guarantee global uniqueness — hence SECURITY DEFINER here too.
-- ===========================================================================
create or replace function public.generate_friend_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- 32-symbol alphabet, excludes 0/O and 1/I (visually ambiguous when shared
  -- out loud or handwritten). 32^8 ≈ 1.1e12 combinations.
  alphabet text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_code   text;
  v_tries  integer := 0;
begin
  loop
    v_code := '';
    for i in 1..8 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where friend_code = v_code);
    v_tries := v_tries + 1;
    if v_tries > 20 then
      raise exception 'สร้างรหัสเพื่อนไม่สำเร็จ ลองใหม่อีกครั้ง';
    end if;
  end loop;
  return v_code;
end;
$$;

revoke execute on function public.generate_friend_code() from public, anon, authenticated;


-- ===========================================================================
-- SECTION 5 — seed_defaults_internal: reproduced from 0012 verbatim, plus a
-- profiles row. Signature unchanged (uuid) → create-or-replace in place.
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
    (user_id, name, kind, is_stock_category, is_system, system_key, icon, color, sort_order) values
    (uid, 'อาหาร',         'expense', false, false, null,                    'coffee',       '#FB7A57', 10),
    (uid, 'เดินทาง',        'expense', false, false, null,                    'motorbike',    '#2CC0A0', 20),
    (uid, 'ช้อปปิ้ง',       'expense', false, false, null,                    'shopping-bag', '#F5C64C', 30),
    (uid, 'บิล/ค่าบ้าน',    'expense', false, false, null,                    'bolt',         '#171717', 40),
    (uid, 'บันเทิง',        'expense', false, false, null,                    'device-tv',    '#34C471', 50),
    (uid, 'เสื้อเข้าร้าน',   'expense', true,  false, null,                    'shirt',        '#0E7D66', 60),
    (uid, 'รองเท้าเข้าร้าน', 'expense', true,  false, null,                    'shoe',         '#0E7D66', 70),
    (uid, 'ต้นทุนขายสต็อก',  'expense', false, true,  'stock_cogs',            'receipt-2',    '#B0693B', 80),
    (uid, 'จ่ายชำระหนี้',    'expense', false, true,  'debt_repayment_expense','arrow-up-right','#8A5A3B', 90);

  insert into public.categories
    (user_id, name, kind, is_stock_category, is_system, system_key, icon, color, sort_order) values
    (uid, 'เงินเดือน',    'income', false, false, null,                    'cash',           '#1D9E75', 10),
    (uid, 'ฟรีแลนซ์',     'income', false, false, null,                    'briefcase',      '#1D9E75', 20),
    (uid, 'ขายสต็อก',     'income', false, true,  'stock_sale_income',     'box',            '#0E7D66', 30),
    (uid, 'ได้รับชำระหนี้', 'income', false, true,  'debt_repayment_income','arrow-down-left','#1D7A5E', 40);

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
-- SECTION 6 — backfill: the 2 new system categories + a profile row for every
-- EXISTING user (mirrors 0012 SECTION 2's backfill-by-existence pattern).
-- ===========================================================================
insert into public.categories
  (user_id, name, kind, is_stock_category, is_system, system_key, icon, color, sort_order)
select u.id, 'จ่ายชำระหนี้', 'expense', false, true, 'debt_repayment_expense', 'arrow-up-right', '#8A5A3B', 90
  from auth.users u
 where not exists (
   select 1 from public.categories c where c.user_id = u.id and c.system_key = 'debt_repayment_expense'
 );

insert into public.categories
  (user_id, name, kind, is_stock_category, is_system, system_key, icon, color, sort_order)
select u.id, 'ได้รับชำระหนี้', 'income', false, true, 'debt_repayment_income', 'arrow-down-left', '#1D7A5E', 40
  from auth.users u
 where not exists (
   select 1 from public.categories c where c.user_id = u.id and c.system_key = 'debt_repayment_income'
 );

insert into public.profiles (user_id, display_name, friend_code)
select u.id,
       coalesce(nullif(split_part(coalesce(u.email, ''), '@', 1), ''), 'ผู้ใช้'),
       public.generate_friend_code()
  from auth.users u
 where not exists (select 1 from public.profiles p where p.user_id = u.id);


-- ===========================================================================
-- SECTION 7 — friend_request_send / friend_request_respond.
-- Both SECURITY DEFINER: friend_connections has no write policy for
-- `authenticated`, and friend_request_send must look up a profile by code that
-- the caller isn't yet allowed to SELECT (they aren't friends yet).
-- ===========================================================================
create or replace function public.friend_request_send(p_code text)
returns public.friend_connections
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_target uuid;
  v_code   text := upper(trim(coalesce(p_code, '')));
  v_row    public.friend_connections;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if v_code = '' then
    raise exception 'กรอกรหัสเพื่อนก่อน';
  end if;

  select user_id into v_target from public.profiles where friend_code = v_code;
  if v_target is null then
    raise exception 'ไม่พบรหัสเพื่อนนี้';
  end if;
  if v_target = v_uid then
    raise exception 'เพิ่มตัวเองเป็นเพื่อนไม่ได้';
  end if;

  select * into v_row from public.friend_connections
   where (requester_id = v_uid and addressee_id = v_target)
      or (requester_id = v_target and addressee_id = v_uid)
   for update;

  if found then
    if v_row.status = 'accepted' then
      raise exception 'เป็นเพื่อนกันอยู่แล้ว';
    end if;
    -- v_row.status = 'pending' below:
    if v_row.requester_id = v_uid then
      raise exception 'ส่งคำขอไปแล้ว รอเพื่อนตอบรับ';
    end if;
    -- The target already sent US a pending request — accept it instead of
    -- creating a conflicting second row (both people hit "add" at once).
    update public.friend_connections
       set status = 'accepted', responded_at = now()
     where id = v_row.id
     returning * into v_row;
    return v_row;
  end if;

  insert into public.friend_connections (requester_id, addressee_id, status)
  values (v_uid, v_target, 'pending')
  returning * into v_row;
  return v_row;
end;
$$;

grant execute on function public.friend_request_send(text) to authenticated;


create or replace function public.friend_request_respond(p_connection_id uuid, p_accept boolean)
returns public.friend_connections
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.friend_connections;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into v_row from public.friend_connections where id = p_connection_id for update;
  if not found then
    raise exception 'ไม่พบคำขอนี้' using errcode = 'no_data_found';
  end if;
  if v_row.addressee_id <> v_uid then
    raise exception 'ไม่มีสิทธิ์ตอบรับคำขอนี้';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'คำขอนี้ตอบไปแล้ว';
  end if;

  if p_accept then
    update public.friend_connections
       set status = 'accepted', responded_at = now()
     where id = p_connection_id
     returning * into v_row;
    return v_row;
  else
    -- Declined requests are deleted, not kept as a terminal state — same
    -- mental model as most friend-request UIs, and lets either side re-request
    -- later without a stale row blocking the unique pair index.
    delete from public.friend_connections where id = p_connection_id;
    v_row.status := 'rejected'; -- returned for the client toast only, not persisted
    return v_row;
  end if;
end;
$$;

grant execute on function public.friend_request_respond(uuid, boolean) to authenticated;


-- ===========================================================================
-- SECTION 8 — debts + debt_events. SELECT-only RLS; every write is RPC-gated
-- (SECTIONS 11–12). Visibility rule: a 'private' row is visible only to its
-- creator; a 'shared' row is visible to both named parties.
-- ===========================================================================
create table if not exists public.debts (
  id                       uuid primary key default gen_random_uuid(),
  creditor_id              uuid not null references auth.users (id) on delete cascade,
  debtor_id                uuid not null references auth.users (id) on delete cascade,
  amount                   numeric(12, 2) not null check (amount > 0),
  reason                   text,
  due_date                 date,
  visibility               public.debt_visibility not null default 'shared',
  status                   public.debt_status not null default 'pending_confirmation',
  created_by               uuid not null references auth.users (id),
  rejected_reason          text,
  -- SET NULL: if the settlement transaction is later removed some other way,
  -- the debt record itself must survive (mirrors stock_sales' FK choices).
  settlement_transaction_id uuid references public.transactions (id) on delete set null,
  settled_by               uuid references auth.users (id),
  created_at               timestamptz not null default now(),
  confirmed_at             timestamptz,
  rejected_at              timestamptz,
  cancelled_at              timestamptz,
  settled_at               timestamptz,
  updated_at               timestamptz not null default now(),
  constraint debts_no_self_debt check (creditor_id <> debtor_id),
  constraint debts_created_by_is_party check (created_by = creditor_id or created_by = debtor_id)
);

drop trigger if exists set_updated_at on public.debts;
create trigger set_updated_at before update on public.debts
  for each row execute function public.set_updated_at();

create index if not exists debts_creditor_idx on public.debts (creditor_id, status);
create index if not exists debts_debtor_idx   on public.debts (debtor_id, status);

alter table public.debts enable row level security;

drop policy if exists debts_select on public.debts;
create policy debts_select on public.debts
  for select to authenticated
  using (
    (visibility = 'private' and created_by = auth.uid())
    or (visibility = 'shared' and (auth.uid() = creditor_id or auth.uid() = debtor_id))
  );

-- Deliberately NO insert / update / delete policy — see SECTIONS 11–12.


create table if not exists public.debt_events (
  id       uuid primary key default gen_random_uuid(),
  debt_id  uuid not null references public.debts (id) on delete cascade,
  actor_id uuid not null references auth.users (id),
  action   text not null,   -- 'create' | 'confirm' | 'reject' | 'cancel' | 'settle' | 'settle_reverse'
  at       timestamptz not null default now()
);

create index if not exists debt_events_debt_idx on public.debt_events (debt_id, at);

alter table public.debt_events enable row level security;

drop policy if exists debt_events_select on public.debt_events;
create policy debt_events_select on public.debt_events
  for select to authenticated
  using (exists (
    select 1 from public.debts d
     where d.id = debt_events.debt_id
       and ((d.visibility = 'private' and d.created_by = auth.uid())
         or (d.visibility = 'shared' and (auth.uid() = d.creditor_id or auth.uid() = d.debtor_id)))
  ));

-- Deliberately NO insert policy — only the definer RPCs below write events.


-- ===========================================================================
-- SECTION 9 — transactions.is_debt_settlement (system categories were added in
-- SECTIONS 5–6 above, before this point, so the RPCs in SECTION 12 can resolve
-- them). Same treatment as is_stock_cogs: counts as a real expense/income
-- (headline + donut) but EXCLUDED from budgets — see lib/ledger.ts.
-- ===========================================================================
alter table public.transactions add column if not exists is_debt_settlement boolean not null default false;


-- ===========================================================================
-- SECTION 10 — trigger: a debt-settlement transaction is read-only, mirroring
-- 0012 SECTION 8's stock_sale_txn_guard. debt_settle_reverse (SECTION 12)
-- passes this guard the same way stock_sale_reverse does: it clears
-- debts.settlement_transaction_id FIRST, so by the time it deletes the
-- transaction the EXISTS() below is already false.
-- ===========================================================================
create or replace function public.debt_settlement_txn_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.debts where settlement_transaction_id = old.id) then
      raise exception 'transaction เป็นส่วนหนึ่งของการเคลียร์หนี้ — ใช้ปุ่มย้อนการเคลียร์แทน'
        using errcode = 'restrict_violation';
    end if;
    return old;
  else  -- UPDATE
    if exists (select 1 from public.debts where settlement_transaction_id = old.id) and (
         new.amount             is distinct from old.amount
      or new.type               is distinct from old.type
      or new.date               is distinct from old.date
      or new.is_debt_settlement is distinct from old.is_debt_settlement
    ) then
      raise exception 'แก้ยอด/ประเภท/วันที่ ของรายการเคลียร์หนี้ไม่ได้ — ใช้ปุ่มย้อนการเคลียร์แทน'
        using errcode = 'restrict_violation';
    end if;
    return new;  -- note / wallet_id edits pass
  end if;
end;
$$;

drop trigger if exists debt_settlement_txn_guard on public.transactions;
create trigger debt_settlement_txn_guard
  before update or delete on public.transactions
  for each row execute function public.debt_settlement_txn_guard();


-- ===========================================================================
-- SECTION 11 — debt state-machine RPCs (everything except settle). All
-- SECURITY DEFINER (see header). Each starts by re-verifying auth.uid() is a
-- legitimate party — that check is the ONLY thing standing in for RLS here.
-- ===========================================================================
create or replace function public.debt_create(
  p_creditor_id uuid,
  p_debtor_id   uuid,
  p_amount      numeric,
  p_reason      text default null,
  p_due_date    date default null,
  p_private     boolean default false
)
returns public.debts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.debts;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if v_uid <> p_creditor_id and v_uid <> p_debtor_id then
    raise exception 'บันทึกหนี้ได้เฉพาะรายการที่ตัวเองเกี่ยวข้อง';
  end if;
  if p_creditor_id = p_debtor_id then
    raise exception 'เจ้าหนี้และลูกหนี้ต้องเป็นคนละคน';
  end if;
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'จำนวนเงินต้องมากกว่า 0';
  end if;

  -- Same rule for private and shared: only between accepted friends.
  if not exists (
    select 1 from public.friend_connections fc
     where fc.status = 'accepted'
       and ((fc.requester_id = p_creditor_id and fc.addressee_id = p_debtor_id)
         or (fc.requester_id = p_debtor_id and fc.addressee_id = p_creditor_id))
  ) then
    raise exception 'บันทึกหนี้ได้เฉพาะกับเพื่อนที่ตอบรับแล้ว';
  end if;

  insert into public.debts
    (creditor_id, debtor_id, amount, reason, due_date, visibility, status, created_by,
     confirmed_at)
  values
    (p_creditor_id, p_debtor_id, p_amount, p_reason, p_due_date,
     case when p_private then 'private' else 'shared' end,
     case when p_private then 'confirmed' else 'pending_confirmation' end,
     v_uid,
     case when p_private then now() else null end)
  returning * into v_row;

  insert into public.debt_events (debt_id, actor_id, action) values (v_row.id, v_uid, 'create');
  return v_row;
end;
$$;

grant execute on function public.debt_create(uuid, uuid, numeric, text, date, boolean) to authenticated;


create or replace function public.debt_confirm(p_debt_id uuid)
returns public.debts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.debts;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_row from public.debts where id = p_debt_id for update;
  if not found then raise exception 'ไม่พบรายการหนี้นี้' using errcode = 'no_data_found'; end if;
  if v_row.visibility <> 'shared' or (v_uid <> v_row.creditor_id and v_uid <> v_row.debtor_id) then
    raise exception 'ไม่มีสิทธิ์ยืนยันรายการนี้';
  end if;
  if v_uid = v_row.created_by then
    raise exception 'ต้องให้อีกฝ่ายเป็นคนยืนยัน';
  end if;
  if v_row.status <> 'pending_confirmation' then
    raise exception 'รายการนี้ไม่ได้อยู่ในสถานะรอยืนยัน';
  end if;

  update public.debts set status = 'confirmed', confirmed_at = now()
   where id = p_debt_id returning * into v_row;
  insert into public.debt_events (debt_id, actor_id, action) values (p_debt_id, v_uid, 'confirm');
  return v_row;
end;
$$;

grant execute on function public.debt_confirm(uuid) to authenticated;


create or replace function public.debt_reject(p_debt_id uuid, p_reason text default null)
returns public.debts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.debts;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_row from public.debts where id = p_debt_id for update;
  if not found then raise exception 'ไม่พบรายการหนี้นี้' using errcode = 'no_data_found'; end if;
  if v_row.visibility <> 'shared' or (v_uid <> v_row.creditor_id and v_uid <> v_row.debtor_id) then
    raise exception 'ไม่มีสิทธิ์ปฏิเสธรายการนี้';
  end if;
  if v_uid = v_row.created_by then
    raise exception 'ต้องให้อีกฝ่ายเป็นคนปฏิเสธ';
  end if;
  if v_row.status <> 'pending_confirmation' then
    raise exception 'รายการนี้ไม่ได้อยู่ในสถานะรอยืนยัน';
  end if;

  update public.debts set status = 'rejected', rejected_at = now(), rejected_reason = p_reason
   where id = p_debt_id returning * into v_row;
  insert into public.debt_events (debt_id, actor_id, action) values (p_debt_id, v_uid, 'reject');
  return v_row;
end;
$$;

grant execute on function public.debt_reject(uuid, text) to authenticated;


create or replace function public.debt_cancel(p_debt_id uuid)
returns public.debts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.debts;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_row from public.debts where id = p_debt_id for update;
  if not found then raise exception 'ไม่พบรายการหนี้นี้' using errcode = 'no_data_found'; end if;
  if v_row.created_by <> v_uid then
    raise exception 'ยกเลิกได้เฉพาะรายการที่ตัวเองสร้าง';
  end if;
  if v_row.status <> 'pending_confirmation' then
    raise exception 'ยกเลิกได้เฉพาะรายการที่ยังรอยืนยันอยู่';
  end if;

  update public.debts set status = 'cancelled', cancelled_at = now()
   where id = p_debt_id returning * into v_row;
  insert into public.debt_events (debt_id, actor_id, action) values (p_debt_id, v_uid, 'cancel');
  return v_row;
end;
$$;

grant execute on function public.debt_cancel(uuid) to authenticated;


create or replace function public.debt_delete_private(p_debt_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.debts;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_row from public.debts where id = p_debt_id for update;
  if not found then raise exception 'ไม่พบรายการหนี้นี้' using errcode = 'no_data_found'; end if;
  if v_row.visibility <> 'private' or v_row.created_by <> v_uid then
    raise exception 'ลบได้เฉพาะโน้ตส่วนตัวของตัวเอง';
  end if;

  delete from public.debts where id = p_debt_id;
end;
$$;

grant execute on function public.debt_delete_private(uuid) to authenticated;


-- ===========================================================================
-- SECTION 12 — debt_settle / debt_settle_reverse. All money computed in SQL.
-- Resolves the ACTOR's own system category (never by Thai name at runtime —
-- STASH_CONTEXT §7) and inserts into the ACTOR's own transactions/wallet only.
-- ===========================================================================
create or replace function public.debt_settle(p_debt_id uuid, p_wallet_id uuid)
returns table (debt public.debts, transaction_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_row       public.debts;
  v_today     date := (now() at time zone 'Asia/Bangkok')::date;
  v_type      public.transaction_type;
  v_sys_key   text;
  v_cat       uuid;
  v_txn       uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_row from public.debts where id = p_debt_id for update;
  if not found then raise exception 'ไม่พบรายการหนี้นี้' using errcode = 'no_data_found'; end if;
  if v_uid <> v_row.creditor_id and v_uid <> v_row.debtor_id then
    raise exception 'ไม่มีสิทธิ์เคลียร์รายการนี้';
  end if;
  if v_row.status <> 'confirmed' then
    raise exception 'เคลียร์ได้เฉพาะรายการที่ยืนยันแล้ว';
  end if;

  if v_uid = v_row.debtor_id then
    v_type := 'expense'; v_sys_key := 'debt_repayment_expense';
  else
    v_type := 'income'; v_sys_key := 'debt_repayment_income';
  end if;

  select id into v_cat from public.categories where user_id = v_uid and system_key = v_sys_key;
  if v_cat is null then
    raise exception 'ไม่พบหมวดระบบสำหรับชำระหนี้ — ลองรีเฟรชแอปแล้วทำอีกครั้ง';
  end if;

  insert into public.transactions
    (user_id, type, amount, category_id, wallet_id, date, note, is_debt_settlement)
  values
    (v_uid, v_type, v_row.amount, v_cat, p_wallet_id, v_today,
     coalesce(v_row.reason, 'ชำระหนี้เพื่อน'), true)
  returning id into v_txn;

  update public.debts
     set status = 'settled', settled_at = now(), settled_by = v_uid,
         settlement_transaction_id = v_txn
   where id = p_debt_id
   returning * into v_row;

  insert into public.debt_events (debt_id, actor_id, action) values (p_debt_id, v_uid, 'settle');
  return query select v_row, v_txn;
end;
$$;

grant execute on function public.debt_settle(uuid, uuid) to authenticated;


create or replace function public.debt_settle_reverse(p_debt_id uuid)
returns public.debts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.debts;
  v_txn uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_row from public.debts where id = p_debt_id for update;
  if not found then raise exception 'ไม่พบรายการหนี้นี้' using errcode = 'no_data_found'; end if;
  if v_row.status <> 'settled' then
    raise exception 'ย้อนได้เฉพาะรายการที่เคลียร์แล้ว';
  end if;
  if v_row.settled_by <> v_uid then
    raise exception 'ย้อนได้เฉพาะฝั่งที่กดเคลียร์เอง';
  end if;

  v_txn := v_row.settlement_transaction_id;

  -- Clear the debt's link FIRST so SECTION 10's guard sees no reference and
  -- allows the delete (same ordering trick as stock_sale_reverse, 0012 §10).
  update public.debts
     set status = 'confirmed', settled_at = null, settled_by = null, settlement_transaction_id = null
   where id = p_debt_id
   returning * into v_row;

  if v_txn is not null then
    delete from public.transactions where id = v_txn;
  end if;

  insert into public.debt_events (debt_id, actor_id, action) values (p_debt_id, v_uid, 'settle_reverse');
  return v_row;
end;
$$;

grant execute on function public.debt_settle_reverse(uuid) to authenticated;


-- ===========================================================================
-- SECTION 13 — friend_debts_summary: net balance with one friend. STABLE,
-- SECURITY INVOKER is enough — it only reads through the SELECT policy already
-- granted in SECTION 8 (own private rows + shared rows the caller is party
-- to), so a private note the OTHER person wrote about you never leaks in.
-- ===========================================================================
create or replace function public.friend_debts_summary(p_friend_id uuid)
returns table (they_owe_me numeric, i_owe_them numeric, net numeric)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  return query
    select
      coalesce(sum(case when d.creditor_id = auth.uid() then d.amount else 0 end), 0)::numeric,
      coalesce(sum(case when d.debtor_id   = auth.uid() then d.amount else 0 end), 0)::numeric,
      coalesce(sum(case when d.creditor_id = auth.uid() then d.amount else -d.amount end), 0)::numeric
    from public.debts d
   where d.status = 'confirmed'
     and ((d.creditor_id = auth.uid() and d.debtor_id = p_friend_id)
       or (d.creditor_id = p_friend_id and d.debtor_id = auth.uid()));
end;
$$;

grant execute on function public.friend_debts_summary(uuid) to authenticated;


-- ===========================================================================
-- Tail — self-record + reload PostgREST.
-- ===========================================================================
insert into public.schema_migrations (version) values ('0015') on conflict do nothing;

notify pgrst, 'reload schema';
