-- ============================================================================
-- Verify a freshly-created account got the correct defaults
-- (public.seed_defaults_internal, reproduced in 0012_stock_sale.sql SECTION 3).
--
-- HOW TO RUN
--   1. Create the test account in Supabase Dashboard → Authentication → Users.
--   2. Sign in once from the app (or confirm the email) so the signup trigger
--      fires seed_defaults_internal for that user.
--   3. Paste this into Supabase SQL Editor, replacing the email below, and run.
--
-- EXPECTED (one row):
--   categories_total = 11 · system_categories = 2 · stock_categories = 2
--   wallets = 3 · sku_config_rows = 1 · system_keys = 2
-- and the second query: balance_columns = 0  (wallets.balance dropped in 0011).
-- ============================================================================

select
  (select count(*) from public.categories     where user_id = t.uid)                     as categories_total,   -- 11
  (select count(*) from public.categories     where user_id = t.uid and is_system)       as system_categories,  -- 2
  (select count(*) from public.categories     where user_id = t.uid
                                                and is_stock_category)                    as stock_categories,   -- 2
  (select count(*) from public.wallets        where user_id = t.uid)                      as wallets,            -- 3
  (select count(*) from public.stock_sku_config where user_id = t.uid)                    as sku_config_rows,    -- 1
  (select count(*) from public.categories     where user_id = t.uid
                                                and system_key in ('stock_sale_income',
                                                                   'stock_cogs'))          as system_keys         -- 2
from (
  select id as uid
    from auth.users
   where email = 'REPLACE_WITH_TEST_EMAIL@example.com'   -- ← set the test account's email
) t;

-- wallets.balance must NOT exist (dropped in 0011_sku_config.sql). Expect 0.
select count(*) as balance_columns
  from information_schema.columns
 where table_schema = 'public'
   and table_name   = 'wallets'
   and column_name  = 'balance';
