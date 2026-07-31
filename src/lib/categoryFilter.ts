/**
 * The category deep link between the home donut legend and the history page.
 *
 * A donut legend row carries an id that is either a real category uuid or one of
 * two non-uuid sentinels: the uncategorised bucket ('none', from useHome) and the
 * "อื่นๆ" roll-up ('__other__', many categories summed — no single id to send).
 * transactions_search (0024) validates p_category_id as a uuid and RAISES on a
 * malformed value, so both ends gate on isCategoryId: the legend only makes a row
 * tappable when it holds a real id, and the history page only treats ?cat= as a
 * filter once it validates — an allowlist on the client instead of letting the
 * RPC raise (convention 14).
 */

/**
 * A canonical uuid (8-4-4-4-12 hex). Mirrors the p_category_id regex inside
 * transactions_search (0024) so any value the client accepts here is one the RPC
 * will accept too — the client is the allowlist, not a second, looser copy.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** True when `value` is a well-formed category uuid (never the 'none' /
 *  '__other__' donut sentinels, never a stale/blank value). */
export function isCategoryId(value: string | null | undefined): value is string {
  return value != null && UUID_RE.test(value)
}

/**
 * The history deep link for one donut category: /history?m=<month>&cat=<id>,
 * carrying BOTH the viewed month and the category id so the destination list is
 * scoped to exactly what the ring showed — the month is the one the home screen
 * is on, not today. The category NAME is never put in the URL: the user can
 * rename a category, which would strand a stale label; the history page resolves
 * the name from the (cached) categories by id. Built with URLSearchParams so the
 * id and month are encoded.
 */
export function categoryHistoryPath(month: string, categoryId: string): string {
  const params = new URLSearchParams()
  // A blank month means "every month" — leave it out rather than emit ?m=; the
  // home screen always passes a real month, so in practice both are present.
  if (month) params.set('m', month)
  params.set('cat', categoryId)
  return `/history?${params.toString()}`
}
