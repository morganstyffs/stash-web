import { supabase } from '@/lib/supabase'

const BUCKET = 'stock-photos'

/**
 * Uploads photos to the private stock-photos bucket under
 * `<userId>/<folder>/<uuid>.<ext>`. The first path segment MUST be the user's
 * id — that's what the storage RLS policy checks (see 0003_storage.sql). The
 * folder segment is a client-generated id for the in-progress item; it doesn't
 * have to equal the eventual stock_item id.
 *
 * Returns the stored object paths, to be saved on stock_items.photos.
 */
export async function uploadStockPhotos(
  userId: string,
  folder: string,
  files: File[],
): Promise<string[]> {
  const paths: string[] = []
  for (const file of files) {
    const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg'
    const path = `${userId}/${folder}/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      contentType: file.type || 'image/jpeg',
      upsert: false,
    })
    if (error) throw error
    paths.push(path)
  }
  return paths
}

/** Batch-signs object paths for display (private bucket → time-limited URLs). */
export async function signStockPhotos(
  paths: string[],
  expiresIn = 3600,
): Promise<Record<string, string>> {
  const map: Record<string, string> = {}
  if (paths.length === 0) return map
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, expiresIn)
  if (error) return map // fall back to icons on error
  for (const row of data ?? []) {
    if (row.signedUrl && row.path) map[row.path] = row.signedUrl
  }
  return map
}
