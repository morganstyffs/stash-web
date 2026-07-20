-- ===========================================================================
-- 0007_recurring_run.sql — materialize due recurring rules into transactions
-- ===========================================================================
-- Additive-only. No table changes — public.recurring already exists (0001).
--
-- The client calls recurring_run_due() on app load (see useRunRecurringOnLoad).
-- It creates a real transaction for every occurrence that is due (backfilling
-- missed periods with their correct dates) and advances next_run. The function
-- is SECURITY INVOKER, so RLS scopes every row read and every insert to
-- auth.uid() — no service-role key is involved. The same RPC can later be
-- driven by a Cloudflare Worker cron without any change here.
--
-- schedule encoding (app-defined — mirrors src/components/RecurringManager.tsx):
--   'daily'          → every day
--   'weekly:<dow>'   → every 7 days     (dow is display-only: sun|mon|…|sat)
--   'monthly:<day>'  → every month on <day> (1-31, clamped to the month length)
-- ===========================================================================

-- Next occurrence after p_from for a schedule, or null if it can't advance.
create or replace function public.recurring_next_date(p_from date, p_schedule text)
returns date
language plpgsql
immutable
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

-- Create a transaction for every due occurrence of the current user's active
-- rules, advancing next_run past current_date in the same transaction. Returns
-- the number of transactions created.
--
-- `for update skip locked` makes concurrent calls (e.g. two open tabs) safe: a
-- rule already locked by one call is skipped by the other instead of firing
-- twice. A per-rule guard caps the backfill at 500 inserts per call (a rule
-- untouched for years finishes catching up on later loads).
create or replace function public.recurring_run_due()
returns integer
language plpgsql
security invoker
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
