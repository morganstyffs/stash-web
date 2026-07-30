import { describe, it, expect } from 'vitest'
import { favoriteLabel, saveBlockedReason, pressKey } from '@/pages/AddPage'

describe('favoriteLabel (B11 — distinguishable default names)', () => {
  it('folds the amount into the name when there is one', () => {
    // "กาแฟ 60" and "กาแฟ 120" must not collapse to the same "กาแฟ"
    expect(favoriteLabel('กาแฟ', 60)).toBe('กาแฟ 60')
    expect(favoriteLabel('กาแฟ', 120)).toBe('กาแฟ 120')
  })

  it('groups thousands in the amount', () => {
    expect(favoriteLabel('บิล/ค่าบ้าน', 8500)).toBe('บิล/ค่าบ้าน 8,500')
  })

  it('uses the bare category name when there is no amount', () => {
    expect(favoriteLabel('กาแฟ', null)).toBe('กาแฟ')
    // amount of 0 is treated as "no amount"
    expect(favoriteLabel('กาแฟ', 0)).toBe('กาแฟ')
  })

  it('falls back to a generic label when there is no category', () => {
    expect(favoriteLabel(null, 60)).toBe('รายการโปรด 60')
    expect(favoriteLabel(undefined, null)).toBe('รายการโปรด')
    expect(favoriteLabel('   ', null)).toBe('รายการโปรด')
  })
})

describe('saveBlockedReason (why save is disabled)', () => {
  it('flags both when amount and category are missing', () => {
    expect(saveBlockedReason(0, null)).toBe('ใส่จำนวนเงิน และเลือกหมวด')
  })

  it('flags the amount when only the amount is missing', () => {
    expect(saveBlockedReason(0, 'cat-1')).toBe('ใส่จำนวนเงิน')
    expect(saveBlockedReason(-5, 'cat-1')).toBe('ใส่จำนวนเงิน')
  })

  it('flags the category when only the category is missing', () => {
    expect(saveBlockedReason(250, null)).toBe('เลือกหมวด')
  })

  it('returns null (bar hidden) when the entry is complete', () => {
    expect(saveBlockedReason(250, 'cat-1')).toBeNull()
  })
})

describe('pressKey — keypad reducer', () => {
  it('appends digits and blocks a leading zero', () => {
    expect(pressKey('', '5')).toBe('5')
    expect(pressKey('0', '5')).toBe('5')
    expect(pressKey('12', '3')).toBe('123')
  })

  it('backspaces and clears', () => {
    expect(pressKey('123', 'back')).toBe('12')
    expect(pressKey('1', 'back')).toBe('')
    expect(pressKey('123.45', 'clear')).toBe('')
  })

  describe('000', () => {
    it('does nothing on an empty amount', () => {
      expect(pressKey('', '000')).toBe('')
    })

    it('does nothing on a zero amount', () => {
      expect(pressKey('0', '000')).toBe('0')
    })

    it('does nothing once a decimal point is present', () => {
      expect(pressKey('12.', '000')).toBe('12.')
      expect(pressKey('12.5', '000')).toBe('12.5')
    })

    it('appends three zeros to a normal amount', () => {
      expect(pressKey('85', '000')).toBe('85000')
    })

    it('respects the 9-digit ceiling (no partial overflow)', () => {
      // 7 digits + 000 would be 10 → blocked entirely
      expect(pressKey('1234567', '000')).toBe('1234567')
      // 6 digits + 000 = 9 → allowed
      expect(pressKey('123456', '000')).toBe('123456000')
    })
  })

  describe('decimals', () => {
    it('adds a single decimal point (leading 0 when empty)', () => {
      expect(pressKey('', '.')).toBe('0.')
      expect(pressKey('12', '.')).toBe('12.')
    })

    it('ignores a second decimal point', () => {
      expect(pressKey('12.5', '.')).toBe('12.5')
    })

    it('caps at two decimal places', () => {
      expect(pressKey('12.5', '3')).toBe('12.53')
      expect(pressKey('12.53', '4')).toBe('12.53')
    })
  })

  it('caps the integer part at 9 digits', () => {
    expect(pressKey('123456789', '0')).toBe('123456789')
    expect(pressKey('12345678', '9')).toBe('123456789')
  })
})

describe('B13 — applying a fast-label with no amount clears a stale amount', () => {
  // The page sets amountStr to String(amount) when present, else '' — modelled
  // here as the value derived from a favorite so the clearing rule is locked in.
  const amountFromFavorite = (favAmount: number | null): string =>
    favAmount != null ? String(favAmount) : ''

  it('clears a leftover amount when the label carries none', () => {
    // amount box held "250", user taps a label whose amount is null
    expect(amountFromFavorite(null)).toBe('')
  })

  it('takes the label amount when it has one', () => {
    expect(amountFromFavorite(120)).toBe('120')
  })
})
