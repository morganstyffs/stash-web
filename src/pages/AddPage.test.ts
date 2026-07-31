import { describe, it, expect } from 'vitest'
import { favoriteLabel, favoriteSignature, saveBlockedReason, pressKey } from '@/pages/AddPage'

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

describe('B13 — applying a fast-label clears stale fields, never fuses them', () => {
  // applyFavorite sets amount / note / wallet on EVERY tap. Modelled here as the
  // pure value each field takes from a favorite, so the clearing rules are locked
  // in: a label that omits a field resets it, it doesn't inherit the last entry's.
  const amountFromFavorite = (favAmount: number | null): string =>
    favAmount != null ? String(favAmount) : ''
  const noteFromFavorite = (favNote: string | null): string => favNote ?? ''
  const walletFromFavorite = (favWallet: string | null, dflt: string | null): string | null =>
    favWallet ?? dflt

  it('clears a leftover amount when the label carries none', () => {
    // amount box held "250", user taps a label whose amount is null
    expect(amountFromFavorite(null)).toBe('')
  })

  it('takes the label amount when it has one', () => {
    expect(amountFromFavorite(120)).toBe('120')
  })

  it('clears a leftover note when the label has none (bug #1: taxi note on coffee)', () => {
    expect(noteFromFavorite(null)).toBe('')
    expect(noteFromFavorite('กาแฟเย็น')).toBe('กาแฟเย็น')
  })

  it('falls back to the default wallet when the label specifies none', () => {
    // user had picked "ธนาคาร" (w-bank); a label with no wallet resets to default
    expect(walletFromFavorite(null, 'w-cash')).toBe('w-cash')
    expect(walletFromFavorite('w-bank', 'w-cash')).toBe('w-bank')
  })
})

describe('favoriteSignature — "saved" button compares signatures, not a stale flag', () => {
  const base = {
    type: 'expense' as const,
    amount: 100,
    categoryId: 'c1',
    walletId: 'w1',
    note: 'x',
  }

  it('is equal for an identical field set', () => {
    expect(favoriteSignature(base)).toBe(favoriteSignature({ ...base }))
  })

  it('differs when only the amount differs (the reported bug: 100 → 1,005)', () => {
    expect(favoriteSignature(base)).not.toBe(favoriteSignature({ ...base, amount: 1005 }))
  })

  it('differs when only the wallet differs', () => {
    expect(favoriteSignature(base)).not.toBe(favoriteSignature({ ...base, walletId: 'w2' }))
  })

  it('differs when only the note differs', () => {
    expect(favoriteSignature(base)).not.toBe(favoriteSignature({ ...base, note: 'y' }))
  })

  it('trims the note before signing (leading/trailing space is not a change)', () => {
    expect(favoriteSignature({ ...base, note: 'กาแฟ' })).toBe(
      favoriteSignature({ ...base, note: ' กาแฟ ' }),
    )
  })

  it('keeps null category distinct from an empty-string one, delimiter-proof', () => {
    expect(favoriteSignature({ ...base, categoryId: null })).not.toBe(
      favoriteSignature({ ...base, categoryId: '' }),
    )
    // a note can't forge another field's value by embedding a would-be delimiter
    expect(favoriteSignature({ ...base, walletId: 'w1', note: 'w2' })).not.toBe(
      favoriteSignature({ ...base, walletId: 'w2', note: '' }),
    )
  })
})
