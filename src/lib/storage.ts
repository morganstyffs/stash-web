import { supabase } from '@/lib/supabase'

const BUCKET = 'stock-photos'

/**
 * Client-side upload limits for stock photos. These are UX guardrails only — the
 * authoritative limit is enforced by the storage bucket itself (file_size_limit
 * + allowed_mime_types, see 0009_storage_hardening.sql), which a tampered client
 * cannot bypass. Keep the two in sync.
 */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024 // 10 MB
export const ALLOWED_PHOTO_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const

/**
 * Validates a single image file against the type/size limits. Returns a Thai
 * error string when it should be rejected, or null when it's acceptable.
 * (Empty MIME type is allowed through — some Android pickers report '' for
 * valid images; the bucket policy is the backstop in that case.)
 */
export function validateImageFile(file: File): string | null {
  if (file.type && !(ALLOWED_PHOTO_TYPES as readonly string[]).includes(file.type)) {
    return 'รองรับเฉพาะรูปภาพ (JPG, PNG, WEBP, HEIC)'
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return 'ไฟล์ใหญ่เกินไป (สูงสุด 10MB ต่อรูป)'
  }
  return null
}

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
    // Enforce the type/size guardrails before spending an upload round-trip.
    const invalid = validateImageFile(file)
    if (invalid) throw new Error(invalid)
    // Derive a safe extension: alphanumerics only, lowercased, capped. This
    // keeps a hostile filename from smuggling slashes/dots into the object key
    // (the path is otherwise fully app-generated).
    const rawExt = file.name.includes('.') ? file.name.split('.').pop() ?? '' : ''
    const ext = rawExt.replace(/[^a-zA-Z0-9]/g, '').slice(0, 5).toLowerCase() || 'jpg'
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
