-- ============================================================================
-- Stash — 0020_username
-- Two fixes to make friend discovery actually work:
--   1. A friend request showed NO identity until accepted — backwards, since you
--      accept BECAUSE you know who it is. The profiles SELECT policy is widened so
--      a counterpart on ANY friend_connections row (not just accepted) is visible.
--   2. The random 8-char friend_code is unusable in practice (must be copied, not
--      memorised or spoken). Replaced as the lookup key by a user-chosen username.
--
--   profiles.username: text, nullable (existing users set it later), stored
--   lowercase only, unique, format a-z/0-9/_ length 3-20. Lowercase is ENFORCED by
--   the CHECK (not a case-insensitive index): one stored form → a plain UNIQUE is
--   enough, no functional index, and two rows can never differ only by case.
--
--   Set-once: enforced in the DB, not just the UI — RLS lets a user UPDATE their
--   own profile row, so a UI-only guard is bypassable via the API. A trigger
--   blocks any authenticated UPDATE that changes a non-null username (including
--   back to null). The OWNER (SQL Editor, no JWT ⇒ auth.uid() null) is exempt, so
--   a typo can still be fixed by hand — see the trigger comment.
--
--   friend_code (0015): NOT dropped (a destructive change for no gain) but
--   RETIRED as a lookup key — no code path reads it after this. Acknowledged debt:
--   the column and generate_friend_code() live on unused; a later PR may drop them
--   once we're sure nothing external depends on them (noted in STASH_CONTEXT).
--
-- Run in Supabase SQL Editor as owner, wrapped in begin; … commit;. Snapshot the
-- profiles_select_own_or_friend policy (0015 §3) and friend_request_send (0015 §7)
-- before replacing. Every statement is idempotent (drop-if-exists / if-not-exists
-- / create-or-replace), safe to re-run.
--
-- ── PRE-FLIGHT (run BEFORE) ─────────────────────────────────────────────────
--   -- confirm the signature this file drops (expect one row: text):
--   select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--   where n.nspname='public' and p.proname='friend_request_send';
--   -- expect: public.friend_request_send(text)
--
-- ── SMOKE TEST (run AFTER commit; must prove it WORKS) ───────────────────────
--   Picks 3 real users, runs AS THE authenticated ROLE (so RLS + the set-once
--   trigger apply exactly as in production; the table owner would bypass both),
--   impersonating each via request.jwt.claims. All in one begin;…rollback;.
--
--   begin;
--   do $$
--   declare
--     v_a uuid; v_b uuid; v_c uuid;      -- A sets a name & sends; B receives; C unrelated
--     v_conn public.friend_connections;
--     v_cnt integer; v_err boolean;
--   begin
--     -- pick AS OWNER (before switching role): a pair with no connection, + a
--     -- third user unrelated to B.
--     select x.user_id, y.user_id into v_a, v_b
--     from public.profiles x join public.profiles y on y.user_id > x.user_id
--     where not exists (select 1 from public.friend_connections fc
--       where (fc.requester_id=x.user_id and fc.addressee_id=y.user_id)
--          or (fc.requester_id=y.user_id and fc.addressee_id=x.user_id))
--     limit 1;
--     select z.user_id into v_c from public.profiles z
--     where z.user_id <> v_a and z.user_id <> v_b
--       and not exists (select 1 from public.friend_connections fc
--         where (fc.requester_id=v_b and fc.addressee_id=z.user_id)
--            or (fc.requester_id=z.user_id and fc.addressee_id=v_b))
--     limit 1;
--     if v_a is null or v_b is null or v_c is null then
--       raise notice 'skip: need 3 suitable users'; return;
--     end if;
--
--     -- from here, behave like a real client
--     perform set_config('role', 'authenticated', true);
--     perform set_config('request.jwt.claims', json_build_object('sub', v_a)::text, true);
--
--     -- (1) first-time set succeeds
--     update public.profiles set username = 'alice_test' where user_id = v_a;
--     assert (select p.username from public.profiles p where p.user_id = v_a) = 'alice_test', '1: first set failed';
--
--     -- (2) changing it again is blocked (set-once trigger; auth.uid() not null)
--     v_err := false;
--     begin update public.profiles set username = 'alice_two' where user_id = v_a; exception when others then v_err := true; end;
--     assert v_err, '2: changing an existing username must error';
--
--     -- (3) another user taking the same name → unique violation (23505). Act as B.
--     perform set_config('request.jwt.claims', json_build_object('sub', v_b)::text, true);
--     v_err := false;
--     begin update public.profiles set username = 'alice_test' where user_id = v_b; exception when others then v_err := true; end;
--     assert v_err, '3: duplicate username must error';
--     -- (3b) a case-variant can't even be stored (CHECK forbids uppercase)
--     v_err := false;
--     begin update public.profiles set username = 'ALICE_TEST' where user_id = v_b; exception when others then v_err := true; end;
--     assert v_err, '3b: uppercase must error';
--
--     -- (4) format: too short / too long / illegal char
--     v_err := false; begin update public.profiles set username='ab' where user_id=v_b; exception when others then v_err:=true; end;
--     assert v_err, '4: too short';
--     v_err := false; begin update public.profiles set username='a2345678901234567890x' where user_id=v_b; exception when others then v_err:=true; end;  -- 21 chars
--     assert v_err, '4: too long';
--     v_err := false; begin update public.profiles set username='bad.name' where user_id=v_b; exception when others then v_err:=true; end;
--     assert v_err, '4: illegal char';
--
--     -- B takes a valid name (still null after the failed tries → first-time set ok)
--     update public.profiles set username = 'bob_test' where user_id = v_b;
--
--     -- (5) friend_request_send by USERNAME → a pending request appears. Act as A.
--     perform set_config('request.jwt.claims', json_build_object('sub', v_a)::text, true);
--     select * into v_conn from public.friend_request_send('bob_test');
--     assert v_conn.status = 'pending', format('5: status=%s', v_conn.status);
--     assert v_conn.requester_id = v_a and v_conn.addressee_id = v_b, '5: wrong parties';
--
--     -- (6) receiver B can SEE sender A's profile while still PENDING (new policy)
--     perform set_config('request.jwt.claims', json_build_object('sub', v_b)::text, true);
--     select count(*) into v_cnt from public.profiles p where p.user_id = v_a;
--     assert v_cnt = 1, '6: a pending counterpart profile must be visible';
--
--     -- (7) B still cannot see an unrelated user C
--     select count(*) into v_cnt from public.profiles p where p.user_id = v_c;
--     assert v_cnt = 0, '7: an unrelated profile must NOT be visible';
--
--     -- (8) exactly one friend_request_send (old (text)/by-code overload gone)
--     select count(*) into v_cnt from pg_proc where proname = 'friend_request_send';
--     assert v_cnt = 1, format('8: friend_request_send defs=%s', v_cnt);
--
--     raise notice 'SMOKE OK: set-once + unique + format + username lookup + pending-visibility';
--   end $$;
--   rollback;
-- ============================================================================


-- ===========================================================================
-- SECTION 1 — profiles.username: nullable, lowercase-only (CHECK), unique.
-- ===========================================================================
alter table public.profiles add column if not exists username text;

alter table public.profiles drop constraint if exists profiles_username_format;
alter table public.profiles add constraint profiles_username_format
  check (username is null or username ~ '^[a-z0-9_]{3,20}$');

-- UNIQUE over a nullable column: many NULLs stay allowed (distinct), non-null
-- unique. An index (not a table constraint) so it's if-not-exists idempotent.
create unique index if not exists profiles_username_uidx on public.profiles (username);


-- ===========================================================================
-- SECTION 2 — set-once trigger. Blocks an authenticated caller from changing a
-- username that is already set (including clearing it back to null). The owner
-- has no JWT, so auth.uid() is null and this passes — that is the intended
-- escape hatch for fixing a typo by hand in the SQL Editor.
-- ===========================================================================
create or replace function public.profiles_username_setonce()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null
     and old.username is not null
     and new.username is distinct from old.username then
    raise exception 'เปลี่ยนชื่อผู้ใช้เองไม่ได้ — ติดต่อผู้ดูแลถ้าตั้งผิด'
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_username_setonce on public.profiles;
create trigger profiles_username_setonce
  before update on public.profiles
  for each row execute function public.profiles_username_setonce();


-- ===========================================================================
-- SECTION 3 — widen the profiles SELECT policy: a counterpart on ANY
-- friend_connections row involving auth.uid() is visible (was: 'accepted' only),
-- so an incoming request can show who sent it. Reproduced from 0015 §3 with only
-- the `fc.status = 'accepted'` filter removed. Still scoped tight — there must be
-- a relationship row that names auth.uid(); a stranger's profile stays hidden.
-- ===========================================================================
drop policy if exists profiles_select_own_or_friend on public.profiles;
create policy profiles_select_own_or_friend on public.profiles
  for select to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.friend_connections fc
       where (fc.requester_id = auth.uid() and fc.addressee_id = profiles.user_id)
          or (fc.addressee_id = auth.uid() and fc.requester_id = profiles.user_id)
    )
  );


-- ===========================================================================
-- SECTION 4 — friend_request_send now looks up by username. Signature keeps the
-- (text) type but the PARAMETER is renamed (p_code → p_username), which
-- create-or-replace refuses ("cannot change name of input parameter"), so DROP
-- the real signature first (no `if exists` — fail loudly if it's wrong), then
-- recreate + re-grant. Reproduced from 0015 §7 verbatim; ONLY the lookup
-- (friend_code → username), input normalisation (upper → lower), and two user
-- messages change. Every guard is kept.
-- ===========================================================================
drop function public.friend_request_send(text);

create or replace function public.friend_request_send(p_username text)
returns public.friend_connections
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_target uuid;
  v_name   text := lower(trim(coalesce(p_username, '')));
  v_row    public.friend_connections;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if v_name = '' then
    raise exception 'กรอกชื่อผู้ใช้ก่อน';
  end if;

  -- A username is meant to be shared, and a match only lets the caller SEND a
  -- request the target must still accept — so "ไม่พบผู้ใช้นี้" is fine (unlike
  -- an email, which rule 16 protects because people hold it without opting in).
  select user_id into v_target from public.profiles where username = v_name;
  if v_target is null then
    raise exception 'ไม่พบผู้ใช้นี้';
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


-- ===========================================================================
-- Tail — self-record + reload PostgREST.
-- ===========================================================================
insert into public.schema_migrations (version) values ('0020') on conflict do nothing;

notify pgrst, 'reload schema';
