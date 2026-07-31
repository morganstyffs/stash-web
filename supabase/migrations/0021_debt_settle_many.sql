-- ============================================================================
-- Stash — 0021_debt_settle_many
-- Closes the ยอดค้าง loop (PR-Y): clear several agreed balances with one friend
-- in a single tap ("โอนคืนทีเดียวจบ"). Looping debt_settle from the CLIENT would
-- leave a half-settled mess if the 2nd call failed — some rows closed, some not,
-- with no way for the user to know. Money movement must be all-or-nothing, so the
-- loop lives in ONE server-side function = one transaction.
--
-- REUSE, don't re-derive: debt_settle_many calls the EXISTING debt_settle once
-- per id (read 0015 §12 — its per-id guards, category resolution, and money math
-- are exactly what's needed). debt_settle is unchanged. Because it all runs in the
-- one function invocation, an exception on ANY id aborts the whole call and rolls
-- back every earlier settle — proven by the smoke test below (a bad id mixed in
-- leaves the good rows untouched). One debt still gets its OWN transaction (kept
-- separate so each stays independently reversible via debt_settle_reverse).
--
-- OUT OF SCOPE (deliberately): sweeping the Thai "หนี้" wording in 0015's RPC
-- error strings — that needs reproducing nearly the whole set to change literals,
-- the exact change-shape this project has slipped on twice; keep it out of a PR
-- that touches money logic. Separate migration later.
--
-- SECURITY DEFINER + set search_path = '' + grant to authenticated, like every
-- debt RPC. debt_settle_reverse (0015 §12) is unchanged and reverses only the
-- side that settled (settled_by = auth.uid()).
--
-- Run in Supabase SQL Editor as owner, wrapped in begin; … commit;.
--
-- ── PRE-FLIGHT ──────────────────────────────────────────────────────────────
--   -- debt_settle_many must not exist yet:
--   select count(*) from pg_proc where proname = 'debt_settle_many';  -- expect 0
--
-- ── SMOKE TEST (run AFTER commit; must prove it WORKS) ───────────────────────
--   One begin;…rollback; — nothing survives. Picks 3 real users, builds its own
--   confirmed debts (empty DB would prove nothing), impersonates via
--   request.jwt.claims, and asserts an observable result — including ATOMICITY
--   (a bad id mixed in leaves the good rows unchanged).
--
--   begin;
--   do $$
--   declare
--     v_a uuid; v_b uuid; v_c uuid; v_wallet uuid;
--     v_a1 uuid; v_a2 uuid; v_a3 uuid;                 -- group A: settle all
--     v_b1 uuid; v_b2 uuid; v_b3 uuid; v_bad uuid;     -- group B + one un-settleable
--     v_other uuid;                                    -- a debt A isn't party to
--     v_cnt int; v_err boolean;
--   begin
--     select p.user_id into v_a from public.profiles p
--       where exists (select 1 from public.wallets w where w.user_id = p.user_id)
--       order by p.created_at, p.user_id limit 1;
--     select p.user_id into v_b from public.profiles p where p.user_id <> v_a
--       order by p.created_at, p.user_id limit 1;
--     select p.user_id into v_c from public.profiles p
--       where p.user_id <> v_a and p.user_id <> v_b order by p.created_at, p.user_id limit 1;
--     select w.id into v_wallet from public.wallets w where w.user_id = v_a limit 1;
--     if v_a is null or v_b is null or v_c is null then
--       raise notice 'skip: need 3 users (one with a wallet)'; return;
--     end if;
--
--     perform set_config('request.jwt.claims', json_build_object('sub', v_a)::text, true);
--
--     -- group A: 3 confirmed shared debts, A is creditor (income on settle)
--     insert into public.debts (creditor_id, debtor_id, amount, visibility, status, created_by, confirmed_at)
--       values (v_a, v_b, 100, 'shared', 'confirmed', v_a, now()) returning id into v_a1;
--     insert into public.debts (creditor_id, debtor_id, amount, visibility, status, created_by, confirmed_at)
--       values (v_a, v_b, 200, 'shared', 'confirmed', v_a, now()) returning id into v_a2;
--     insert into public.debts (creditor_id, debtor_id, amount, visibility, status, created_by, confirmed_at)
--       values (v_a, v_b, 300, 'shared', 'confirmed', v_a, now()) returning id into v_a3;
--
--     -- (1) settle all three at once
--     select count(*) into v_cnt from public.debt_settle_many(array[v_a1, v_a2, v_a3], v_wallet);
--     assert v_cnt = 3, format('1: returned %s rows (want 3)', v_cnt);
--     assert (select count(*) from public.debts d
--             where d.id in (v_a1, v_a2, v_a3) and d.status = 'settled'
--               and d.settlement_transaction_id is not null) = 3, '1: all three should be settled';
--     assert (select count(distinct d.settlement_transaction_id) from public.debts d
--             where d.id in (v_a1, v_a2, v_a3)) = 3, '1: each debt needs its OWN transaction';
--     assert (select count(*) from public.transactions t join public.debts d
--               on d.settlement_transaction_id = t.id
--             where d.id in (v_a1, v_a2, v_a3) and t.is_debt_settlement) = 3, '1: 3 settlement txns';
--
--     -- group B: 3 confirmed + 1 that can't settle (still pending)
--     insert into public.debts (creditor_id, debtor_id, amount, visibility, status, created_by, confirmed_at)
--       values (v_a, v_b, 111, 'shared', 'confirmed', v_a, now()) returning id into v_b1;
--     insert into public.debts (creditor_id, debtor_id, amount, visibility, status, created_by, confirmed_at)
--       values (v_a, v_b, 222, 'shared', 'confirmed', v_a, now()) returning id into v_b2;
--     insert into public.debts (creditor_id, debtor_id, amount, visibility, status, created_by, confirmed_at)
--       values (v_a, v_b, 333, 'shared', 'confirmed', v_a, now()) returning id into v_b3;
--     insert into public.debts (creditor_id, debtor_id, amount, visibility, status, created_by)
--       values (v_a, v_b, 444, 'shared', 'pending_confirmation', v_a) returning id into v_bad;
--
--     -- (2) ATOMIC: a bad id in the set → whole call errors, good rows UNTOUCHED
--     v_err := false;
--     begin
--       perform public.debt_settle_many(array[v_b1, v_b2, v_b3, v_bad], v_wallet);
--     exception when others then v_err := true; end;
--     assert v_err, '2: a set with an un-settleable id must error';
--     assert (select count(*) from public.debts d
--             where d.id in (v_b1, v_b2, v_b3)
--               and d.status = 'confirmed' and d.settlement_transaction_id is null) = 3,
--       '2: NOT atomic — good rows changed after a failed set';
--
--     -- (3) a non-party cannot settle (debt between B and C; A calls it)
--     insert into public.debts (creditor_id, debtor_id, amount, visibility, status, created_by, confirmed_at)
--       values (v_b, v_c, 555, 'shared', 'confirmed', v_b, now()) returning id into v_other;
--     v_err := false;
--     begin
--       perform public.debt_settle_many(array[v_other], v_wallet);
--     exception when others then v_err := true; end;
--     assert v_err, '3: settling a debt you are not party to must error';
--
--     -- (4) exactly one definition
--     assert (select count(*) from pg_proc where proname = 'debt_settle_many') = 1, '4: defs != 1';
--
--     raise notice 'SMOKE OK: 3 settled (own txns), atomic rollback on bad id, non-party rejected';
--   end $$;
--   rollback;
-- ============================================================================


-- ===========================================================================
-- SECTION 1 — debt_settle_many: settle every id in the array atomically, by
-- calling the existing debt_settle once each (one transaction). Same return
-- shape as debt_settle, one row per debt.
-- ===========================================================================
create or replace function public.debt_settle_many(p_debt_ids uuid[], p_wallet_id uuid)
returns table (debt public.debts, transaction_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_debt_ids is null or array_length(p_debt_ids, 1) is null then
    raise exception 'ไม่มีรายการให้เคลียร์';
  end if;

  -- Reuse debt_settle per id. All in one function call ⇒ one transaction: if any
  -- id fails its guards (not the caller's, not confirmed, gone) the exception
  -- propagates and the WHOLE set rolls back — all-or-nothing. Each debt keeps its
  -- own transaction so it can still be reversed individually.
  foreach v_id in array p_debt_ids loop
    return query
      select ds.debt, ds.transaction_id from public.debt_settle(v_id, p_wallet_id) ds;
  end loop;
end;
$$;

grant execute on function public.debt_settle_many(uuid[], uuid) to authenticated;


-- ===========================================================================
-- Tail — self-record + reload PostgREST.
-- ===========================================================================
insert into public.schema_migrations (version) values ('0021') on conflict do nothing;

notify pgrst, 'reload schema';
