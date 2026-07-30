import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { monthBounds } from '@/lib/dates'

/**
 * A single upcoming charge, in a source-neutral shape so the "รอจ่าย" tab can
 * accept more than one origin. v1 fills it only from `recurring`; PR-Y will add
 * friend-debt payments as `source: 'debt'` without the tab needing to change.
 */
export interface PendingItem {
  /** stable per (rule, occurrence) — a rule can fire more than once in a month */
  key: string
  /** YYYY-MM-DD the charge will land on (Asia/Bangkok) */
  date: string
  label: string
  amount: number
  /** category icon name; unknown/blank falls back via categoryIcon() */
  icon: string
  /** category colour slot 1–6, or null → neutral swatch */
  colorIndex: number | null
  /** where the row came from — recurring today; PR-Y adds 'debt' */
  source: 'recurring'
}

export interface UpcomingBills {
  items: PendingItem[]
  /** sum of every upcoming bill this month — what the SAFE sub-line deducts */
  total: number
  /** user has ≥1 active expense rule → the "รอจ่าย" tab exists (even if empty) */
  hasRules: boolean
}

/**
 * Cap on occurrences enumerated per rule. The densest sane schedule is daily
 * (≤31 in a month); past this a rule isn't advancing as expected — or
 * recurring_run_due has fallen far behind — so we surface an error rather than
 * loop. Deliberately reaches the user (rule 6: never a silent swallow).
 */
export const MAX_OCCURRENCES_PER_RULE = 40

/**
 * A rule's occurrence dates that fall INSIDE this month, walking from `from`
 * (`next_run`) forward. `nextDate` is the DB's schedule arithmetic injected as an
 * async step — the client never parses a schedule string (rule 3; the duplicated
 * SKU calculator that nearly drifted is why). Pure aside from that one call, so
 * the month-window logic is unit-testable with a fake stepper.
 *
 * Three domain facts shape the window:
 *
 *  • Start from `next_run` INCLUSIVE. recurring_run_due (runs on every app load,
 *    see AppLayout) materializes every occurrence up to today and advances next_run
 *    to the first one NOT yet charged — so materialized rows are always < next_run,
 *    and starting here can't double-count. Include next_run even when it's today or
 *    earlier: run_due hasn't processed that round yet, so it's committed-but-unrecorded.
 *    (Do NOT begin at tomorrow — that drops a real pending bill.)
 *
 *  • Collect ONLY occurrences with `d >= bounds.start`. If run_due is lagging,
 *    next_run can still sit in a PRIOR month; we must step through those rounds to
 *    reach this month's, but must not count them — recurring_run_due dates each
 *    transaction with its own next_run, so a pre-month round lands in LAST month's
 *    `expense`. Deducting it from THIS month's safe-to-spend is the wrong month.
 *
 *  • `nextDate` returning null / a non-advancing date = a schedule the DB can't
 *    step (run_due deactivates these) → stop this rule. The per-rule cap bounds
 *    total steps (not just collected ones) so a lagging rule can't spin; hitting it
 *    is surfaced as an error, never a silent swallow (rule 6).
 */
export async function collectMonthOccurrences(
  from: string,
  bounds: { start: string; next: string },
  nextDate: (from: string) => Promise<string | null>,
  cap: number = MAX_OCCURRENCES_PER_RULE,
): Promise<string[]> {
  const dates: string[] = []
  let d = from
  let n = 0
  while (d < bounds.next) {
    if (n >= cap) {
      throw new Error(`คำนวณรายการรอจ่ายไม่สำเร็จ: วนเกิน ${cap} รอบ`)
    }
    if (d >= bounds.start) dates.push(d)
    n += 1
    const nd = await nextDate(d)
    if (!nd || nd <= d) break
    d = nd
  }
  return dates
}

/**
 * Recurring EXPENSE charges still to hit this month, for the SAFE sub-line and the
 * "รอจ่าย" tab. See collectMonthOccurrences for the window rules.
 */
export function useUpcomingBills() {
  const { user } = useAuth()
  const b = monthBounds()
  return useQuery({
    // keyed under 'recurring' so useRunRecurringOnLoad's invalidate refreshes this
    // once due occurrences are materialized and next_run is advanced.
    queryKey: ['recurring', 'upcoming', user?.id, b.key],
    enabled: !!user,
    queryFn: async (): Promise<UpcomingBills> => {
      const { data, error } = await supabase
        .from('recurring')
        .select('id, label, amount, schedule, next_run, category:categories(icon, color_index)')
        .eq('active', true)
        .eq('type', 'expense')
      if (error) throw error
      const rules = data ?? []

      const items: PendingItem[] = []
      for (const r of rules) {
        if (!r.next_run) continue
        const dates = await collectMonthOccurrences(r.next_run, b, async (from) => {
          const { data: nd, error: ndErr } = await supabase.rpc('recurring_next_date', {
            p_from: from,
            p_schedule: r.schedule,
          })
          if (ndErr) throw ndErr
          return nd
        })
        for (const d of dates) {
          items.push({
            key: `${r.id}:${d}`,
            date: d,
            label: r.label,
            amount: Number(r.amount) || 0,
            icon: r.category?.icon ?? 'tag',
            colorIndex: r.category?.color_index ?? null,
            source: 'recurring',
          })
        }
      }

      items.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0))
      const total = items.reduce((s, x) => s + x.amount, 0)
      return { items, total, hasRules: rules.length > 0 }
    },
  })
}
