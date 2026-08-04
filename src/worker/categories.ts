/**
 * Resolve a Thai category name the user typed → a concrete category id, done by
 * the WORKER (not the model) under the user's RLS (design §7.1).
 *
 * The rules exist because a numerically-correct answer to the WRONG category
 * ("อาหารสัตว์" when the user meant "ค่าอาหาร") is a wrong answer the user can't
 * catch — worse than saying "not sure". So: ambiguous → ask back, never guess.
 *
 *   1. match only the user's OWN spend categories (kind='expense', not system) —
 *      substring after normalising; "อาหาร" matches "ค่าอาหาร"
 *   2. exactly one → use it
 *   3. more than one → ambiguous, caller asks the user which
 *   4. none → caller tells the user it wasn't found (never silently picks one)
 *   5. names are read fresh every call (no stale cache)
 *   6. system categories (stock_cogs / stock_sale_income / debt_repayment_*) are
 *      NEVER matched by Thai name — their Thai label is a display layer the app
 *      has changed before (0017). Excluded via is_system / system_key.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../lib/database.types'

export type CategoryResolution =
  | { status: 'matched'; id: string; name: string }
  | { status: 'ambiguous'; names: string[] }
  | { status: 'none' }
  | { status: 'error' }

/** Strip whitespace + lowercase so "  ค่าอาหาร " and "ค่าอาหาร" compare equal.
 *  (Thai has no case, but Latin category names might, and users add spaces.) */
function normalize(s: string): string {
  return s.trim().replace(/\s+/g, '').toLowerCase()
}

export async function resolveCategory(
  supabase: SupabaseClient<Database>,
  raw: string,
): Promise<CategoryResolution> {
  const target = normalize(raw)
  if (!target) return { status: 'none' }

  // Read fresh under RLS (own rows only). kind='expense' = the categories a user
  // fills in spending against.
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, is_system, system_key')
    .eq('kind', 'expense')
  if (error) return { status: 'error' }

  // Rule 6: never match a system category by Thai name.
  const userCats = (data ?? []).filter((c) => !c.is_system && c.system_key === null)
  const matches = userCats.filter((c) => normalize(c.name).includes(target))

  if (matches.length === 0) return { status: 'none' }
  if (matches.length > 1) return { status: 'ambiguous', names: matches.map((c) => c.name) }
  return { status: 'matched', id: matches[0].id, name: matches[0].name }
}
