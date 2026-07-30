-- ============================================================================
-- Stash — 0014_favorites_wallet_note
-- Let a one-tap favorite carry its own wallet and note, so tapping it on the
-- Add page applies the right wallet/note instead of silently falling back to
-- the first wallet in the list (bug B12).
--
-- additive-only, idempotent. Run in Supabase SQL Editor as project owner.
--
-- Both columns are nullable with no default: existing favorites keep working
-- unchanged (wallet_id/note stay NULL → the app falls back to the current
-- default-wallet behaviour, exactly as before). No backfill.
--
-- wallet_id mirrors recurring.wallet_id from 0001 exactly — same FK, same
-- `on delete set null` (deleting a wallet blanks the reference rather than
-- blocking the delete or cascading away the favorite).
-- ============================================================================

-- ---- new columns ----------------------------------------------------------
alter table public.favorites
  add column if not exists wallet_id uuid references public.wallets (id) on delete set null;

alter table public.favorites
  add column if not exists note text;

-- No new RLS policy needed: favorites already has row-level security from 0001
-- scoping every row to auth.uid(); the added columns are covered by it.

-- ---- verification ---------------------------------------------------------
-- Both should return one row each after this migration applies.
--
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'favorites'
--     and column_name in ('wallet_id', 'note')
--   order by column_name;
--
--   select constraint_name
--   from information_schema.table_constraints
--   where table_schema = 'public' and table_name = 'favorites'
--     and constraint_name = 'favorites_wallet_id_fkey';
