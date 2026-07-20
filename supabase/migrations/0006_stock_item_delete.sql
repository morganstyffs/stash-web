-- ============================================================================
-- Stash — 0006_stock_item_delete
-- Atomic "remove from stock" that keeps the ledger consistent.
--
-- Deleting a stock item created by the intake flow must also remove the paired
-- stock-purchase expense (source_transaction_id) — otherwise the money would
-- stay recorded as spent with no inventory behind it. Both deletes happen in
-- one function call, so they succeed or fail together.
--
-- Guard: an item that already has realised sales (public.stock_sales rows) is
-- BLOCKED from deletion — erasing it would wipe recorded profit history. The
-- caller is expected to reverse the sale first. (stock_sales.stock_item_id is
-- also ON DELETE RESTRICT at the FK level, so this is defence in depth.)
--
-- security = INVOKER: runs with the caller's rights, so RLS (auth.uid() =
-- user_id) still scopes every row touched — a caller cannot delete anyone
-- else's item or transaction.
--
-- additive-only, idempotent (create or replace). Run in Supabase SQL Editor.
-- ============================================================================

create or replace function public.stock_item_delete(p_item_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_source uuid;
  v_sales  integer;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  -- Load the item. RLS makes only our own rows visible, so a hit here already
  -- means the caller owns it. A miss = nothing to delete (or not ours). Use the
  -- FOUND flag, not the INTO target: a no-row SELECT leaves v_source NULL, which
  -- is indistinguishable from an item that simply has no source transaction.
  select source_transaction_id
    into v_source
    from public.stock_items
   where id = p_item_id;

  if not found then
    raise exception 'stock item not found' using errcode = 'no_data_found';
  end if;

  -- Block deletion when the item has sales history.
  select count(*) into v_sales
    from public.stock_sales
   where stock_item_id = p_item_id;

  if v_sales > 0 then
    raise exception 'stock item has sales history and cannot be deleted'
      using errcode = 'restrict_violation';
  end if;

  -- Delete the item first. transactions.stock_item_id is ON DELETE SET NULL,
  -- so the source transaction survives this step with a nulled link; we remove
  -- it explicitly next.
  delete from public.stock_items where id = p_item_id;

  -- Remove the paired stock-purchase expense, if this item came from intake.
  if v_source is not null then
    delete from public.transactions
     where id = v_source and is_stock_purchase = true;
  end if;
end;
$$;

grant execute on function public.stock_item_delete(uuid) to authenticated;
