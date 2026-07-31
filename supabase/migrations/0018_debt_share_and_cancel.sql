-- ============================================================================
-- Stash — 0018_debt_share_and_cancel
-- PR-X makes the ยอดค้าง feature actually usable (create / confirm / reject).
-- 0015 shipped every RPC for that EXCEPT two the design needs — verified by
-- reading 0015, the full RPC set there is: debt_create, debt_confirm,
-- debt_reject, debt_cancel, debt_delete_private, debt_settle,
-- debt_settle_reverse. This migration adds the first and widens the second:
--
--   1. debt_share_private(p_debt_id) — turn a private "จดไว้เอง" note into a
--      shared debt awaiting the other party's confirmation, IN ONE TRANSACTION.
--      "Jot it down privately now, make it official later" is the whole point of
--      private mode; without an in-place convert the only client path is
--      debt_delete_private + debt_create, and if the second call fails the note
--      is gone for good with the user none the wiser. That data-loss window is
--      why this must be one server-side statement, not a client chain.
--        • caller must own the row (created_by = auth.uid())
--        • row must still be private AND confirmed (a private note is created
--          confirmed — 0015 debt_create) — nothing else is convertible
--        • flips visibility private→shared, status confirmed→pending_confirmation,
--          and clears confirmed_at (it is no longer a confirmed row); the
--          creditor/debtor/amount set at creation are kept, so the SAME other
--          party confirms it, exactly like a freshly-created shared debt.
--        • records a debt_events row like every other write. `action` is free
--          text in 0015 (no enum/check), so 'share' is a valid new verb.
--
--   2. debt_cancel(p_debt_id) — accept a REJECTED row, not only a pending one.
--      Today debt_cancel takes only 'pending_confirmation' and
--      debt_delete_private takes only private rows, so a shared debt the other
--      party REJECTED is stuck forever with no way to clear it. Reproduced from
--      0015 SECTION 11 verbatim (convention 3), changing ONLY the status guard
--      (and its message). Signature unchanged (uuid) → create-or-replace.
--
-- Both are SECURITY DEFINER + set search_path = '' + grant to authenticated,
-- matching every other debt RPC in 0015 (the tables are select-only under RLS;
-- writes go through definer RPCs that re-check auth.uid() by hand).
--
-- Run in Supabase SQL Editor as owner, wrapped in begin; … commit;. Snapshot
-- debt_cancel (0015 §11) before the replace. Every statement is a function
-- create-or-replace, so the whole file is safe to re-run.
--
-- ── PRE-FLIGHT (run BEFORE the migration) ───────────────────────────────────
--   -- confirm the two functions' current shape (debt_share_private should not
--   -- exist yet; debt_cancel should be (uuid)):
--   select p.oid::regprocedure as sig
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname in ('debt_share_private','debt_cancel');
--   -- expect: exactly one row, public.debt_cancel(uuid).
--
-- ── SMOKE TEST (run AFTER commit; must prove it WORKS, not just exists) ──────
--   -- friend_connections/debts may be empty, so a test that creates no data
--   -- would pass without exercising anything (the tsc-on-0-files trap). This
--   -- fabricates a friendship + a private note under a real user, converts it,
--   -- and asserts the transition + event + authorization, all rolled back.
--   -- Needs >= 2 users; assumes the two picked aren't already connected.
--   begin;
--   do $$
--   declare
--     v_me     uuid;
--     v_friend uuid;
--     v_priv   uuid;   -- a private note owned by v_me (converted in step 1)
--     v_priv2  uuid;   -- a second private note, still private (for step 2)
--     v_rej    uuid;   -- a shared, rejected debt owned by v_me
--     v_row    public.debts;
--     v_events int;
--     v_denied boolean := false;
--   begin
--     select p.user_id into v_me     from public.profiles p order by p.created_at, p.user_id limit 1;
--     select p.user_id into v_friend from public.profiles p
--       where p.user_id <> v_me order by p.created_at, p.user_id limit 1;
--     if v_friend is null then
--       raise notice 'skip: need >= 2 users';
--       return;
--     end if;
--
--     perform set_config('request.jwt.claims', json_build_object('sub', v_me)::text, true);
--
--     insert into public.friend_connections (requester_id, addressee_id, status, responded_at)
--       values (v_me, v_friend, 'accepted', now());
--
--     -- a private note (created confirmed, as 0015 debt_create does) …
--     insert into public.debts (creditor_id, debtor_id, amount, reason, visibility, status, created_by, confirmed_at)
--       values (v_me, v_friend, 500, 'ค่าข้าว', 'private', 'confirmed', v_me, now())
--       returning id into v_priv;
--
--     -- (1) convert it → shared + pending_confirmation, confirmed_at cleared, +1 event
--     select * into v_row from public.debt_share_private(v_priv);
--     assert v_row.visibility = 'shared',              format('share: visibility=%s', v_row.visibility);
--     assert v_row.status = 'pending_confirmation',    format('share: status=%s', v_row.status);
--     assert v_row.confirmed_at is null,               'share: confirmed_at should be cleared';
--     select count(*) into v_events from public.debt_events e
--       where e.debt_id = v_priv and e.action = 'share';
--     assert v_events = 1,                             format('share: expected 1 share event, got %s', v_events);
--
--     -- (2) a NON-owner cannot convert a note. Use a FRESH private note (v_priv
--     --     is already shared now) so the ownership guard is what fires, not the
--     --     visibility check.
--     insert into public.debts (creditor_id, debtor_id, amount, visibility, status, created_by, confirmed_at)
--       values (v_me, v_friend, 120, 'private', 'confirmed', v_me, now())
--       returning id into v_priv2;
--     perform set_config('request.jwt.claims', json_build_object('sub', v_friend)::text, true);
--     begin
--       perform public.debt_share_private(v_priv2);
--     exception when others then
--       v_denied := true;
--     end;
--     assert v_denied, 'share: a non-owner must be rejected';
--     perform set_config('request.jwt.claims', json_build_object('sub', v_me)::text, true);
--
--     -- (3) a REJECTED shared debt can now be cancelled
--     insert into public.debts (creditor_id, debtor_id, amount, visibility, status, created_by, rejected_at, rejected_reason)
--       values (v_me, v_friend, 300, 'shared', 'rejected', v_me, now(), 'จำไม่ได้')
--       returning id into v_rej;
--     select * into v_row from public.debt_cancel(v_rej);
--     assert v_row.status = 'cancelled',               format('cancel: status=%s', v_row.status);
--
--     raise notice 'smoke OK: private→shared+pending (event logged), non-owner denied, rejected→cancelled';
--   end $$;
--   rollback;
--
--   -- (4) exactly one definition of each function:
--   select proname, count(*) from pg_proc
--   where proname in ('debt_share_private','debt_cancel') group by proname;  -- expect 1 each
-- ============================================================================


-- ===========================================================================
-- SECTION 1 — debt_share_private: private note → shared, awaiting confirmation.
-- New function (no prior definition), so a plain create; still SECURITY DEFINER
-- + search_path='' + grant, like every debt RPC in 0015.
-- ===========================================================================
create or replace function public.debt_share_private(p_debt_id uuid)
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
  if not found then raise exception 'ไม่พบรายการนี้' using errcode = 'no_data_found'; end if;
  if v_row.created_by <> v_uid then
    raise exception 'ส่งให้ยืนยันได้เฉพาะรายการที่ตัวเองจดไว้';
  end if;
  if v_row.visibility <> 'private' or v_row.status <> 'confirmed' then
    raise exception 'ส่งให้ยืนยันได้เฉพาะรายการที่จดไว้เอง';
  end if;

  -- One statement: private→shared and confirmed→pending_confirmation. confirmed_at
  -- is cleared because the row is no longer confirmed — the other party (the
  -- creditor/debtor set at creation, unchanged here) must now confirm it, exactly
  -- like a shared debt made through debt_create.
  update public.debts
     set visibility = 'shared', status = 'pending_confirmation', confirmed_at = null
   where id = p_debt_id
   returning * into v_row;

  insert into public.debt_events (debt_id, actor_id, action) values (p_debt_id, v_uid, 'share');
  return v_row;
end;
$$;

grant execute on function public.debt_share_private(uuid) to authenticated;


-- ===========================================================================
-- SECTION 2 — debt_cancel: reproduced from 0015 SECTION 11 verbatim, widening
-- ONLY the status guard so a REJECTED row can also be cleared (was: pending
-- only, leaving rejected rows stuck forever). Signature unchanged → create or
-- replace.
-- ===========================================================================
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
  if v_row.status not in ('pending_confirmation', 'rejected') then
    raise exception 'ยกเลิกได้เฉพาะรายการที่ยังรอยืนยันหรือถูกปฏิเสธ';
  end if;

  update public.debts set status = 'cancelled', cancelled_at = now()
   where id = p_debt_id returning * into v_row;
  insert into public.debt_events (debt_id, actor_id, action) values (p_debt_id, v_uid, 'cancel');
  return v_row;
end;
$$;

grant execute on function public.debt_cancel(uuid) to authenticated;


-- ===========================================================================
-- Tail — self-record + reload PostgREST.
-- ===========================================================================
insert into public.schema_migrations (version) values ('0018') on conflict do nothing;

notify pgrst, 'reload schema';
