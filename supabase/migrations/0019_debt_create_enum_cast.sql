-- ============================================================================
-- Stash — 0019_debt_create_enum_cast
-- Fixes the bug that made the whole ยอดค้าง feature unusable: sending a shared
-- balance failed at PostgREST with
--   42804: column "visibility" is of type public.debt_visibility but expression
--          is of type text — You will need to rewrite or cast the expression.
--
-- Cause (debt_create, 0015 SECTION 11, lines ~574-575): a CASE forces its
-- branches to a COMMON type BEFORE the column context is known, and two string
-- literals unify to `text`. Postgres will implicitly coerce a *bare* unknown
-- literal to an enum in INSERT (that's why the plain `values (…, 'pending')` in
-- friend_connections and every `update … set status = '…'` are fine), but it will
-- NOT coerce a `text` expression to an enum. Both enum columns fed by a CASE are
-- affected — `visibility` blew up first, `status` would have next.
--
-- WHY THIS WAS NEVER CAUGHT: 0015's verification only proved the functions
-- EXISTED. debt_create had no caller until the PR-X UI, so it had never actually
-- run once — the exact "exists ≠ works" trap in STASH_CONTEXT §9. So this file
-- does two things: (1) the one-line-per-branch cast fix, and (2) a smoke test
-- that drives EVERY debt RPC end to end through the real functions, so the rest
-- of the set (which had also never run) is proven now, not on the next report.
--
-- TASK-1 SURVEY (every text→enum spot in the debt migrations): exactly the two
-- CASE branches below. Confirmed by reading 0015/0017/0018 — no other CASE (or
-- other text-typed expression) is inserted into a debt_visibility / debt_status /
-- friend_status column; all other enum writes are bare literals (INSERT) or
-- assignments/UPDATEs whose target type is already known.
--
-- reproduce: debt_create is untouched by 0016/0017/0018, so this is the 0015
-- version verbatim with ONLY the two casts added. Signature unchanged →
-- create-or-replace (grant persists, re-granted anyway for parity with 0015).
-- Run in Supabase SQL Editor as owner, wrapped in begin; … commit;.
--
-- ── SMOKE TEST (run AFTER commit; the point of this PR — proves it WORKS) ─────
--   Everything below is ONE begin;…rollback; — no row survives. It picks two real
--   users who are NOT already connected and have NO debts between them (a clean
--   pair, so nothing pre-existing skews the asserts; skips if none exists), then
--   drives the full lifecycle through the real RPCs, impersonating each side via
--   request.jwt.claims. Every step asserts an OBSERVABLE result, not just "no
--   error". If any assert fails it aborts loudly — STOP and report, don't patch.
--
--   begin;
--   do $$
--   declare
--     v_me      uuid;
--     v_friend  uuid;
--     v_code    text;
--     v_wallet  uuid;
--     v_conn    public.friend_connections;
--     v_row     public.debts;
--     v_d1 uuid; v_d2 uuid; v_d3 uuid; v_d4 uuid; v_d5 uuid; v_d6 uuid;
--     v_txn     uuid;
--     v_cnt     integer;
--     v_flag    boolean;
--     v_err     boolean;
--     v_snet    numeric; v_pnet numeric; v_sme numeric; v_pme numeric;
--   begin
--     -- a clean pair: no connection AND no debts between them, each with a wallet
--     select a.user_id, b.user_id into v_me, v_friend
--     from public.profiles a
--     join public.profiles b on b.user_id > a.user_id
--     where not exists (
--       select 1 from public.friend_connections fc
--       where (fc.requester_id = a.user_id and fc.addressee_id = b.user_id)
--          or (fc.requester_id = b.user_id and fc.addressee_id = a.user_id))
--       and not exists (
--       select 1 from public.debts d
--       where (d.creditor_id = a.user_id and d.debtor_id = b.user_id)
--          or (d.creditor_id = b.user_id and d.debtor_id = a.user_id))
--       and exists (select 1 from public.wallets w where w.user_id = a.user_id)
--     limit 1;
--     if v_friend is null then
--       raise notice 'skip: need 2 unconnected, debt-free users (each with a wallet)';
--       return;
--     end if;
--     select p.friend_code into v_code   from public.profiles p where p.user_id = v_friend;
--     select w.id          into v_wallet from public.wallets  w where w.user_id = v_me limit 1;
--
--     -- (1) friend request send (me) → respond accept (friend)
--     perform set_config('request.jwt.claims', json_build_object('sub', v_me)::text, true);
--     select * into v_conn from public.friend_request_send(v_code);
--     assert v_conn.status = 'pending', format('1: send status=%s', v_conn.status);
--     perform set_config('request.jwt.claims', json_build_object('sub', v_friend)::text, true);
--     select * into v_conn from public.friend_request_respond(v_conn.id, true);
--     assert v_conn.status = 'accepted', format('1: respond status=%s', v_conn.status);
--
--     perform set_config('request.jwt.claims', json_build_object('sub', v_me)::text, true);
--
--     -- (2) create shared → pending, not confirmed  (THE fix under test)
--     select * into v_row from public.debt_create(v_me, v_friend, 500, 'D1', null, false);
--     v_d1 := v_row.id;
--     assert v_row.visibility = 'shared',              format('2: visibility=%s', v_row.visibility);
--     assert v_row.status = 'pending_confirmation',    format('2: status=%s', v_row.status);
--     assert v_row.confirmed_at is null,               '2: confirmed_at should be null';
--
--     -- (3) create private → confirmed on the spot  (the other cast branch)
--     select * into v_row from public.debt_create(v_me, v_friend, 300, 'D2', null, true);
--     v_d2 := v_row.id;
--     assert v_row.visibility = 'private',             format('3: visibility=%s', v_row.visibility);
--     assert v_row.status = 'confirmed',               format('3: status=%s', v_row.status);
--     assert v_row.confirmed_at is not null,           '3: confirmed_at should be set';
--
--     -- a surviving private note (for the step-13 split) + a to-be-deleted one
--     select * into v_row from public.debt_create(v_me, v_friend, 200, 'D6 keep', null, true);
--     v_d6 := v_row.id;
--     select * into v_row from public.debt_create(v_me, v_friend, 120, 'D5 del', null, true);
--     v_d5 := v_row.id;
--
--     -- (4) confirm the shared one, by the OTHER party
--     perform set_config('request.jwt.claims', json_build_object('sub', v_friend)::text, true);
--     perform public.debt_confirm(v_d1);
--     select * into v_row from public.debts where id = v_d1;
--     assert v_row.status = 'confirmed',               format('4: status=%s', v_row.status);
--
--     -- (5) the CREATOR cannot confirm their own debt (guard)
--     perform set_config('request.jwt.claims', json_build_object('sub', v_me)::text, true);
--     select * into v_row from public.debt_create(v_me, v_friend, 150, 'D3', null, false);
--     v_d3 := v_row.id;
--     v_err := false;
--     begin perform public.debt_confirm(v_d3); exception when others then v_err := true; end;
--     assert v_err, '5: creator confirming own debt must error';
--
--     -- (6) create → reject with a reason (by the other party)
--     select * into v_row from public.debt_create(v_me, v_friend, 250, 'D4', null, false);
--     v_d4 := v_row.id;
--     perform set_config('request.jwt.claims', json_build_object('sub', v_friend)::text, true);
--     perform public.debt_reject(v_d4, 'จำนวนไม่ตรง');
--     select * into v_row from public.debts where id = v_d4;
--     assert v_row.status = 'rejected',                        format('6: status=%s', v_row.status);
--     assert v_row.rejected_reason = 'จำนวนไม่ตรง',            format('6: reason=%s', v_row.rejected_reason);
--
--     -- (7) cancel the rejected one (0018 widened debt_cancel), by its creator
--     perform set_config('request.jwt.claims', json_build_object('sub', v_me)::text, true);
--     perform public.debt_cancel(v_d4);
--     select * into v_row from public.debts where id = v_d4;
--     assert v_row.status = 'cancelled',               format('7: status=%s', v_row.status);
--
--     -- (8) share a private note → shared + awaiting confirmation
--     perform public.debt_share_private(v_d2);
--     select * into v_row from public.debts where id = v_d2;
--     assert v_row.visibility = 'shared',              format('8: visibility=%s', v_row.visibility);
--     assert v_row.status = 'pending_confirmation',    format('8: status=%s', v_row.status);
--
--     -- (9) settle the confirmed shared debt (me = creditor) with a real wallet
--     select ds.transaction_id into v_txn from public.debt_settle(v_d1, v_wallet) ds;
--     select * into v_row from public.debts where id = v_d1;
--     assert v_row.status = 'settled',                          format('9: status=%s', v_row.status);
--     assert v_row.settlement_transaction_id = v_txn,           '9: settlement_transaction_id mismatch';
--     select t.is_debt_settlement into v_flag from public.transactions t where t.id = v_txn;
--     assert v_flag is true,                                    '9: is_debt_settlement should be true';
--
--     -- (10) that settlement transaction is read-only (guard blocks direct edits)
--     v_err := false;
--     begin delete from public.transactions where id = v_txn; exception when others then v_err := true; end;
--     assert v_err, '10: deleting a settlement txn must be blocked';
--     v_err := false;
--     begin update public.transactions set amount = 99999 where id = v_txn; exception when others then v_err := true; end;
--     assert v_err, '10: editing a settlement txn amount must be blocked';
--
--     -- (11) reverse the settlement → transaction gone, debt back to confirmed
--     perform public.debt_settle_reverse(v_d1);
--     select count(*) into v_cnt from public.transactions t where t.id = v_txn;
--     assert v_cnt = 0,                                '11: settlement txn should be deleted';
--     select * into v_row from public.debts where id = v_d1;
--     assert v_row.status = 'confirmed',               format('11: status=%s', v_row.status);
--
--     -- (12) delete a private note
--     perform public.debt_delete_private(v_d5);
--     select count(*) into v_cnt from public.debts d where d.id = v_d5;
--     assert v_cnt = 0,                                '12: private note should be deleted';
--
--     -- (13) summary splits shared vs private correctly. Surviving: D1 confirmed
--     --      shared (+500), D6 private (+200); D2 is now shared+pending (uncounted).
--     select fs.shared_net, fs.private_net, fs.shared_they_owe_me, fs.private_they_owe_me
--       into v_snet, v_pnet, v_sme, v_pme
--     from public.friend_debts_summary() fs where fs.friend_id = v_friend;
--     assert v_snet = 500, format('13: shared_net=%s (want 500)', v_snet);
--     assert v_pnet = 200, format('13: private_net=%s (want 200)', v_pnet);
--     assert v_sme  = 500, format('13: shared_they_owe_me=%s', v_sme);
--     assert v_pme  = 200, format('13: private_they_owe_me=%s', v_pme);
--
--     raise notice 'SMOKE OK: full debt lifecycle proven across all RPCs';
--   end $$;
--   rollback;
-- ============================================================================


-- ===========================================================================
-- SECTION 1 — debt_create: 0015 SECTION 11 verbatim, with the two CASE results
-- cast to their enum column types. Nothing else changes.
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

  -- The CASE unifies its two string literals to `text`; a text expression is NOT
  -- implicitly coerced into an enum column on INSERT (a BARE literal would be),
  -- so each CASE result is cast to its column's enum type explicitly (0019 fix).
  insert into public.debts
    (creditor_id, debtor_id, amount, reason, due_date, visibility, status, created_by,
     confirmed_at)
  values
    (p_creditor_id, p_debtor_id, p_amount, p_reason, p_due_date,
     (case when p_private then 'private' else 'shared' end)::public.debt_visibility,
     (case when p_private then 'confirmed' else 'pending_confirmation' end)::public.debt_status,
     v_uid,
     case when p_private then now() else null end)
  returning * into v_row;

  insert into public.debt_events (debt_id, actor_id, action) values (v_row.id, v_uid, 'create');
  return v_row;
end;
$$;

grant execute on function public.debt_create(uuid, uuid, numeric, text, date, boolean) to authenticated;


-- ===========================================================================
-- Tail — self-record + reload PostgREST.
-- ===========================================================================
insert into public.schema_migrations (version) values ('0019') on conflict do nothing;

notify pgrst, 'reload schema';
