import { describe, it, expect } from 'vitest'
import { isValidSkuPrefix, normalizeSkuPrefix } from '@/lib/sku'

describe('normalizeSkuPrefix — force the DB shape on every keystroke', () => {
  it('uppercases lowercase input', () => {
    expect(normalizeSkuPrefix('stz')).toBe('STZ')
    expect(normalizeSkuPrefix('abc')).toBe('ABC')
  })

  it('drops Thai and special characters rather than rejecting', () => {
    expect(normalizeSkuPrefix('กขค')).toBe('') // Thai — nothing survives
    expect(normalizeSkuPrefix('a-b-c')).toBe('ABC') // separators stripped
    expect(normalizeSkuPrefix('st z')).toBe('STZ') // space stripped, then uppercased
    expect(normalizeSkuPrefix('S@T#Z')).toBe('STZ')
  })

  it('truncates to 3 characters (never longer)', () => {
    expect(normalizeSkuPrefix('STZZ')).toBe('STZ')
    expect(normalizeSkuPrefix('ABCDEF')).toBe('ABC')
  })

  it('keeps digits (A–Z and 0–9 both allowed)', () => {
    expect(normalizeSkuPrefix('m2k')).toBe('M2K')
    expect(normalizeSkuPrefix('0a9')).toBe('0A9')
  })

  it('returns empty string for empty / all-invalid input', () => {
    expect(normalizeSkuPrefix('')).toBe('')
    expect(normalizeSkuPrefix('   ')).toBe('')
    expect(normalizeSkuPrefix('!!!')).toBe('')
  })
})

describe('isValidSkuPrefix — mirrors the DB CHECK ^[A-Z0-9]{3}$', () => {
  it('accepts exactly 3 uppercase alphanumerics', () => {
    expect(isValidSkuPrefix('STZ')).toBe(true)
    expect(isValidSkuPrefix('M2K')).toBe(true)
    expect(isValidSkuPrefix('000')).toBe(true)
  })

  it('rejects wrong length', () => {
    expect(isValidSkuPrefix('ST')).toBe(false) // too short
    expect(isValidSkuPrefix('STZZ')).toBe(false) // too long
    expect(isValidSkuPrefix('')).toBe(false)
  })

  it('rejects lowercase, spaces, and non-Latin', () => {
    expect(isValidSkuPrefix('st z')).toBe(false)
    expect(isValidSkuPrefix('stz')).toBe(false)
    expect(isValidSkuPrefix('กข ค')).toBe(false)
  })
})
