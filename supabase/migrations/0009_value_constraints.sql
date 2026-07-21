-- ============================================================================
-- Stash — 0009_value_constraints
-- Defence-in-depth data constraints: non-negative money columns + a storage
-- bucket locked to image types and a size cap. These back up the client-side
-- input validation so a tampered/offline client (or a direct PostgREST call
-- with the anon key) still cannot write nonsense into your own rows.
--
-- additive-only, idempotent. Run in Supabase SQL Editor as project owner.
--
-- ⚠️  If any EXISTING row already violates one of these checks the ALTER will
--     fail with a clear message — inspect and fix that row, then re-run. Given
--     the app only ever writes non-negative values this should not happen.
--
-- Deliberately NOT constrained:
--   • stock_sales.profit  — a resale at a loss is legitimately negative.
--   • wallets.balance     — an overdrawn/adjustment balance may be negative.
--   • *.amount on transactions/budgets — already `check (amount >= 0)` in 0001/0005.
-- No upper cap is added: numeric(14,2) already bounds values, and the keypad
-- UI caps entry length, so a hard business cap would only risk rejecting a
-- legitimately large entry. Add one here later if you decide you want it.
-- ============================================================================

-- ---- non-negative money columns -------------------------------------------
alter table public.stock_items drop constraint if exists stock_items_cost_nonneg;
alter table public.stock_items
  add constraint stock_items_cost_nonneg check (cost_per_unit >= 0);

alter table public.stock_items drop constraint if exists stock_items_target_nonneg;
alter table public.stock_items
  add constraint stock_items_target_nonneg check (target_price is null or target_price >= 0);

alter table public.stock_sales drop constraint if exists stock_sales_price_nonneg;
alter table public.stock_sales
  add constraint stock_sales_price_nonneg check (sale_price >= 0);

alter table public.recurring drop constraint if exists recurring_amount_nonneg;
alter table public.recurring
  add constraint recurring_amount_nonneg check (amount >= 0);

alter table public.favorites drop constraint if exists favorites_amount_nonneg;
alter table public.favorites
  add constraint favorites_amount_nonneg check (amount is null or amount >= 0);

-- ---- storage bucket: image types only, 10 MB cap -------------------------
-- Enforced by Storage on every upload regardless of client. Mirrors the
-- client-side guardrails in src/lib/storage.ts (keep the two in sync). Existing
-- objects are unaffected; this only governs new uploads.
update storage.buckets
set
  file_size_limit = 10485760,  -- 10 MB
  allowed_mime_types = array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'
  ]
where id = 'stock-photos';
