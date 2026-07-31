import { describe, it, expect } from 'vitest'
import { isValidUsername, normalizeUsername } from '@/lib/username'

describe('normalizeUsername', () => {
  it('lowercases and strips whitespace to match the stored form', () => {
    expect(normalizeUsername('Alice_99')).toBe('alice_99')
    expect(normalizeUsername('  Bob 01 ')).toBe('bob01')
  })
})

describe('isValidUsername', () => {
  it('accepts a-z / 0-9 / _ of length 3-20', () => {
    expect(isValidUsername('somchai_99')).toBe(true)
    expect(isValidUsername('abc')).toBe(true)
    expect(isValidUsername('a2345678901234567890')).toBe(true) // 20
  })
  it('rejects too short, too long, uppercase, and illegal characters', () => {
    expect(isValidUsername('ab')).toBe(false) // 2
    expect(isValidUsername('a2345678901234567890x')).toBe(false) // 21
    expect(isValidUsername('Alice')).toBe(false) // uppercase
    expect(isValidUsername('bad.name')).toBe(false)
    expect(isValidUsername('bad name')).toBe(false)
    expect(isValidUsername('')).toBe(false)
  })
})
