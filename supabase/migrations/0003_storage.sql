-- ============================================================================
-- Stash — 0003_storage
-- Private Storage bucket for stock-item photos, with owner-only RLS.
-- Files are laid out as: stock-photos/<user_id>/<item_id>/<filename>
-- so the first path segment is the owner's uid, which the policies enforce.
--
-- additive-only. Run in Supabase SQL Editor as project owner.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('stock-photos', 'stock-photos', false)
on conflict (id) do nothing;

-- storage.objects already has RLS enabled by Supabase; add owner-scoped policies.
drop policy if exists "stock_photos_select_own" on storage.objects;
create policy "stock_photos_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'stock-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "stock_photos_insert_own" on storage.objects;
create policy "stock_photos_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'stock-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "stock_photos_update_own" on storage.objects;
create policy "stock_photos_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'stock-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'stock-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "stock_photos_delete_own" on storage.objects;
create policy "stock_photos_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'stock-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
