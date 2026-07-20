-- ============================================================================
-- Stash — 0002_seed_defaults
-- Default categories + wallets for a user, matching the design mockups.
-- Includes an auth.users trigger so new signups are seeded automatically, and a
-- callable function so the existing user can seed themselves once.
--
-- additive-only. Safe to re-run (seeding is skipped if the user already has
-- categories). Run in Supabase SQL Editor as project owner.
-- ============================================================================

create or replace function public.seed_defaults(uid uuid)
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

-- Trigger: seed each new user on signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_defaults(new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Seed the CURRENT user right now (if you already signed up before adding the
-- trigger). Uncomment and run while logged in via the SQL editor's auth context,
-- or pass your user id explicitly:
--
--   select public.seed_defaults(auth.uid());
--   -- or
--   select public.seed_defaults('YOUR-USER-UUID');
-- ---------------------------------------------------------------------------
