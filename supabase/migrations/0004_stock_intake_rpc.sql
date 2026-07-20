-- ============================================================================
-- Stash — 0004_stock_intake_rpc
-- Atomic "buy into stock" write: one call creates BOTH the expense transaction
-- (type='expense', is_stock_purchase=true) and the stock_item, links them via
-- source_transaction_id / stock_item_id, and returns the generated SKU.
--
-- security = INVOKER: the function runs with the caller's rights, so every
-- table RLS policy (auth.uid() = user_id) still applies. user_id is set to
-- auth.uid() explicitly, so a caller cannot write rows for anyone else.
--
-- additive-only, idempotent (create or replace). Run in Supabase SQL Editor.
-- ============================================================================

create or replace function public.stock_intake_create(
  p_name          text,
  p_cost_per_unit numeric,
  p_qty           integer,
  p_category      text                  default null,  -- free-text type (เสื้อยืด/…)
  p_category_id   uuid                  default null,  -- expense category (stock category)
  p_wallet_id     uuid                  default null,
  p_brand         text                  default null,
  p_size          text                  default null,
  p_color         text                  default null,
  p_condition     public.item_condition default null,
  p_target_price  numeric               default null,
  p_photos        text[]                default '{}',
  p_needs_details boolean               default false,
  p_note          text                  default null
)
returns table (transaction_id uuid, stock_item_id uuid, sku text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_tx     uuid;
  v_item   uuid;
  v_sku    text;
  v_seq    integer;
  v_brand3 text;
  v_total  numeric;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if coalesce(p_qty, 0) < 1 then
    raise exception 'qty must be >= 1';
  end if;
  if coalesce(p_cost_per_unit, -1) < 0 then
    raise exception 'cost_per_unit must be >= 0';
  end if;

  v_total := p_cost_per_unit * p_qty;

  -- SKU: STZ-<BRAND3>-<seq4>. BRAND3 = first 3 alphanumerics of the brand
  -- (uppercased), or GEN when there's no usable brand. seq is per-user.
  v_brand3 := upper(substring(regexp_replace(coalesce(p_brand, ''), '[^a-zA-Z0-9]', '', 'g') from 1 for 3));
  if v_brand3 is null or length(v_brand3) = 0 then
    v_brand3 := 'GEN';
  end if;
  select count(*) + 1 into v_seq from public.stock_items where user_id = v_uid;
  v_sku := 'STZ-' || v_brand3 || '-' || lpad(v_seq::text, 4, '0');

  -- 1) the inventory-purchase expense
  insert into public.transactions
    (user_id, type, amount, category_id, wallet_id, note, is_stock_purchase, date)
  values
    (v_uid, 'expense', v_total, p_category_id, p_wallet_id, coalesce(p_note, p_name), true, current_date)
  returning id into v_tx;

  -- 2) the stock item, linked back to its source purchase
  insert into public.stock_items
    (user_id, name, category, brand, size, color, condition,
     cost_per_unit, qty_total, qty_remaining, target_price, sku,
     status, needs_details, photos, source_transaction_id)
  values
    (v_uid, p_name, p_category, p_brand, p_size, p_color, p_condition,
     p_cost_per_unit, p_qty, p_qty, p_target_price, v_sku,
     'in_stock', coalesce(p_needs_details, false), coalesce(p_photos, '{}'), v_tx)
  returning id into v_item;

  -- 3) close the loop: point the transaction at the item it created
  update public.transactions set stock_item_id = v_item where id = v_tx;

  return query select v_tx, v_item, v_sku;
end;
$$;

grant execute on function public.stock_intake_create(
  text, numeric, integer, text, uuid, uuid, text, text, text,
  public.item_condition, numeric, text[], boolean, text
) to authenticated;
