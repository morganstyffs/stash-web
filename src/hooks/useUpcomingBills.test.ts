import { describe, expect, it } from 'vitest'
import { collectMonthOccurrences } from '@/lib/upcomingBills'

// August 2026 window: [start, next).
const AUG = { start: '2026-08-01', next: '2026-09-01' }

/** A stepper backed by a fixed schedule: the next date strictly after `from`, or
 *  null when the schedule is exhausted. Stands in for the recurring_next_date RPC
 *  so the month-window logic is tested without a DB. */
const scheduleStep = (dates: string[]) => (from: string) =>
  Promise.resolve(dates.find((d) => d > from) ?? null)

describe('collectMonthOccurrences — only THIS month, walking from next_run', () => {
  const monthly = ['2026-06-15', '2026-07-15', '2026-08-15', '2026-09-15']

  it('collects the current-month occurrence when next_run is already this month', async () => {
    expect(await collectMonthOccurrences('2026-08-15', AUG, scheduleStep(monthly))).toEqual([
      '2026-08-15',
    ])
  })

  it('skips prior-month rounds when next_run is stuck in a past month (run_due lagging)', async () => {
    // next_run left back in June: those rounds land in earlier months' expense
    // totals, so they must NOT be deducted from THIS month — walked past, not kept.
    expect(await collectMonthOccurrences('2026-06-15', AUG, scheduleStep(monthly))).toEqual([
      '2026-08-15',
    ])
  })

  it('keeps every occurrence that falls inside the month', async () => {
    const weekly = ['2026-08-05', '2026-08-12', '2026-08-19', '2026-08-26', '2026-09-02']
    expect(await collectMonthOccurrences('2026-08-05', AUG, scheduleStep(weekly))).toEqual([
      '2026-08-05',
      '2026-08-12',
      '2026-08-19',
      '2026-08-26',
    ])
  })

  it('collects nothing when next_run is already in a future month', async () => {
    expect(await collectMonthOccurrences('2026-09-15', AUG, scheduleStep(monthly))).toEqual([])
  })

  it('stops on a non-advancing / unknown schedule (null next date)', async () => {
    // e.g. a schedule the DB can't step: collect the current round, then stop.
    expect(await collectMonthOccurrences('2026-08-15', AUG, () => Promise.resolve(null))).toEqual([
      '2026-08-15',
    ])
  })

  it('caps total steps and surfaces an error (never spins on a lagging daily rule)', async () => {
    // a daily schedule whose next_run is far behind would step many times before
    // reaching the month — the cap bounds total steps and throws rather than loop.
    const daily: string[] = []
    const base = new Date(2026, 5, 20) // Jun 20, 2026 (local numeric — not a date-string parse)
    for (let i = 0; i < 80; i++) {
      const dt = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i)
      daily.push(
        `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(
          dt.getDate(),
        ).padStart(2, '0')}`,
      )
    }
    await expect(
      collectMonthOccurrences('2026-06-20', AUG, scheduleStep(daily), 5),
    ).rejects.toThrow(/วนเกิน 5/)
  })
})
