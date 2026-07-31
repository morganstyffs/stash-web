import { describe, it, expect } from 'vitest'
import { isCategoryId, categoryHistoryPath } from '@/lib/categoryFilter'

/**
 * The pure seam behind the donut → history deep link. isCategoryId is the shared
 * gate on both ends (legend clickability + ?cat= validation); categoryHistoryPath
 * builds the URL the legend navigates to. Both are pure, so they're pinned here
 * without a browser or router.
 */

describe('isCategoryId', () => {
  it('accepts a canonical lowercase uuid', () => {
    expect(isCategoryId('3f2504e0-4f89-41d3-9a0c-0305e82c3301')).toBe(true)
  })

  it('accepts an uppercase uuid (mirrors the RPC regex, case-insensitive)', () => {
    expect(isCategoryId('3F2504E0-4F89-41D3-9A0C-0305E82C3301')).toBe(true)
  })

  it('rejects the donut sentinels the roll-up / uncategorised rows carry', () => {
    // '__other__' has no single id; 'none' is the uncategorised bucket — neither
    // is a uuid, so neither is tappable and neither would survive to the RPC.
    expect(isCategoryId('__other__')).toBe(false)
    expect(isCategoryId('none')).toBe(false)
  })

  it('rejects blank / missing / malformed values', () => {
    expect(isCategoryId('')).toBe(false)
    expect(isCategoryId(null)).toBe(false)
    expect(isCategoryId(undefined)).toBe(false)
    expect(isCategoryId('not-a-uuid')).toBe(false)
    // right shape, wrong length (11 hex in the last group)
    expect(isCategoryId('3f2504e0-4f89-41d3-9a0c-0305e82c330')).toBe(false)
    // a non-hex character
    expect(isCategoryId('3f2504e0-4f89-41d3-9a0c-0305e82c330g')).toBe(false)
    // no surrounding whitespace tolerated (anchored ^…$)
    expect(isCategoryId(' 3f2504e0-4f89-41d3-9a0c-0305e82c3301 ')).toBe(false)
  })
})

describe('categoryHistoryPath', () => {
  const CAT = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'

  it('carries BOTH the month and the category id', () => {
    const path = categoryHistoryPath('2026-06', CAT)
    const params = new URLSearchParams(path.slice(path.indexOf('?')))
    expect(path.startsWith('/history?')).toBe(true)
    expect(params.get('m')).toBe('2026-06')
    expect(params.get('cat')).toBe(CAT)
  })

  it('uses the passed month, not the current one', () => {
    // deep-linking June from the home screen must land on June, not today.
    expect(categoryHistoryPath('2026-06', CAT)).toContain('m=2026-06')
    expect(categoryHistoryPath('2026-01', CAT)).toContain('m=2026-01')
  })

  it('omits m for a blank month (every month) but always keeps cat', () => {
    const path = categoryHistoryPath('', CAT)
    const params = new URLSearchParams(path.slice(path.indexOf('?')))
    expect(params.has('m')).toBe(false)
    expect(params.get('cat')).toBe(CAT)
  })
})
