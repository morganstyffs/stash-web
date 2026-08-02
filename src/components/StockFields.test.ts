import { describe, it, expect } from 'vitest'
import { computeNeedsDetails } from '@/components/StockFields'

type Fields = Parameters<typeof computeNeedsDetails>[0]

/** A fully-specified item — nothing missing → does NOT need details.
 *  ราคาขายไม่อยู่ในนิยาม "ข้อมูลครบ" อีกต่อไป (0027) — กรอกตอนขายเท่านั้น. */
const complete: Fields = {
  size: 'L',
  color: 'เขียว',
  condition: 'used_good',
  photoCount: 1,
}

describe('computeNeedsDetails', () => {
  it('is false when every required field is present', () => {
    expect(computeNeedsDetails(complete)).toBe(false)
  })

  it('is true when any single required field is missing', () => {
    expect(computeNeedsDetails({ ...complete, size: '' })).toBe(true)
    expect(computeNeedsDetails({ ...complete, color: '' })).toBe(true)
    expect(computeNeedsDetails({ ...complete, condition: '' })).toBe(true)
    expect(computeNeedsDetails({ ...complete, photoCount: 0 })).toBe(true)
  })

  it('treats whitespace-only text as missing', () => {
    expect(computeNeedsDetails({ ...complete, size: '   ' })).toBe(true)
    expect(computeNeedsDetails({ ...complete, color: '  ' })).toBe(true)
  })
})
