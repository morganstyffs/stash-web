-- ============================================================================
-- Stash — 0005_budgets
-- Per-category monthly budgets. One row = one category's budget for one month.
--
-- Mirrors every other table's ownership + RLS pattern: user_id defaults to
-- auth.uid(), and four owner-only policies (select/insert/update/delete) scope
-- rows to auth.uid() = user_id for the `authenticated` role.
--
-- additive-only, idempotent. Run in Supabase SQL Editor as project owner.
-- ============================================================================

create table if not exists public.budgets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- deleting a category removes its budgets (config data, safe to cascade)
  category_id uuid not null references public.categories (id) on delete cascade,
  month       date not null,                                   -- first day of the month
  amount      numeric(14, 2) not null default 0 check (amount >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- one budget per category per month
  constraint budgets_user_category_month_key unique (user_id, category_id, month)
);

create index if not exists budgets_user_month_idx on public.budgets (user_id, month);

-- updated_at trigger (reuses the helper from 0001)
drop trigger if exists set_updated_at on public.budgets;
create trigger set_updated_at before update on public.budgets
  for each row execute function public.set_updated_at();

-- Row Level Security: owner-only, authenticated role.
alter table public.budgets enable row level security;

drop policy if exists budgets_select_own on public.budgets;
create policy budgets_select_own on public.budgets for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists budgets_insert_own on public.budgets;
create policy budgets_insert_own on public.budgets for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists budgets_update_own on public.budgets;
create policy budgets_update_own on public.budgets for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists budgets_delete_own on public.budgets;
create policy budgets_delete_own on public.budgets for delete to authenticated
  using (auth.uid() = user_id);
