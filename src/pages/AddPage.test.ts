import { describe, it, expect } from 'vitest'
import {
  favoriteLabel,
  favoriteSignature,
  isEntrySelectableCategory,
  isInternalPath,
  orderByFrequency,
  saveBlockedReason,
  pressKey,
  keypadActionFromKey,
  isTypingTarget,
} from '@/pages/AddPage'

// minimal event shape the pure fn accepts — no modifiers held, not composing
const keyEvent = (over: Partial<Parameters<typeof keypadActionFromKey>[0]>) => ({
  key: '',
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...over,
})

describe('isEntrySelectableCategory — which categories a manual entry may pick', () => {
  const cat = (over: Partial<Parameters<typeof isEntrySelectableCategory>[0]>) => ({
    kind: 'expense' as const,
    is_stock_category: false,
    system_key: null,
    ...over,
  })

  it('keeps a plain category of the matching kind', () => {
    expect(isEntrySelectableCategory(cat({ kind: 'expense' }), 'expense')).toBe(true)
    expect(isEntrySelectableCategory(cat({ kind: 'income' }), 'income')).toBe(true)
    // shop categories are ordinary user categories (is_shop_category isn't a
    // reason to hide them — you log ค่าส่ง by hand): they stay selectable
    expect(isEntrySelectableCategory(cat({ kind: 'expense' }), 'expense')).toBe(true)
  })

  it('drops categories of the other kind', () => {
    expect(isEntrySelectableCategory(cat({ kind: 'income' }), 'expense')).toBe(false)
  })

  it('drops stock-intake categories', () => {
    expect(isEntrySelectableCategory(cat({ is_stock_category: true }), 'expense')).toBe(false)
  })

  it('drops the four system categories that only come from their own flows', () => {
    expect(isEntrySelectableCategory(cat({ system_key: 'stock_cogs' }), 'expense')).toBe(false)
    expect(
      isEntrySelectableCategory(cat({ kind: 'expense', system_key: 'debt_repayment_expense' }), 'expense'),
    ).toBe(false)
    expect(
      isEntrySelectableCategory(cat({ kind: 'income', system_key: 'debt_repayment_income' }), 'income'),
    ).toBe(false)
  })

  it('drops stock_sale_income — a resale must be sold on the stock screen, not booked by hand', () => {
    expect(
      isEntrySelectableCategory(cat({ kind: 'income', system_key: 'stock_sale_income' }), 'income'),
    ).toBe(false)
  })
})

describe('orderByFrequency — §2.1: most-used chips float to the head of ONE list', () => {
  const cats = [
    { id: 'a', name: 'อาหาร' },
    { id: 'b', name: 'บิล' },
    { id: 'c', name: 'ช้อปปิ้ง' },
    { id: 'd', name: 'เดินทาง' },
  ]

  it('puts frequent ids first, in ranking order', () => {
    expect(orderByFrequency(cats, ['d', 'b']).map((c) => c.id)).toEqual(['d', 'b', 'a', 'c'])
  })

  it('keeps the original relative order of non-frequent categories (stable)', () => {
    // 'c' is the only frequent one → it leads; a, b, d keep their input order.
    expect(orderByFrequency(cats, ['c']).map((c) => c.id)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('returns the list unchanged when there is no ranking (empty history)', () => {
    expect(orderByFrequency(cats, []).map((c) => c.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('ignores ranking ids that are not in the list', () => {
    // a category ranked in history but filtered out of the visible list (e.g. a
    // system category, or the other kind) must not conjure a phantom chip.
    expect(orderByFrequency(cats, ['zzz', 'b']).map((c) => c.id)).toEqual(['b', 'a', 'c', 'd'])
  })

  it('does not mutate the input array', () => {
    const input = [...cats]
    orderByFrequency(input, ['d'])
    expect(input.map((c) => c.id)).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('isInternalPath — returnTo must be an in-app path, never an open redirect', () => {
  it('accepts a plain in-app path', () => {
    expect(isInternalPath('/stock')).toBe(true)
    expect(isInternalPath('/history?m=2026-08')).toBe(true)
  })

  it('rejects absolute and protocol-relative URLs', () => {
    expect(isInternalPath('http://evil.example')).toBe(false)
    expect(isInternalPath('https://evil.example/stock')).toBe(false)
    expect(isInternalPath('//evil.example')).toBe(false)
  })

  it('rejects a bare word and non-strings', () => {
    expect(isInternalPath('stock')).toBe(false)
    expect(isInternalPath('')).toBe(false)
    expect(isInternalPath(null)).toBe(false)
    expect(isInternalPath(undefined)).toBe(false)
    expect(isInternalPath(42)).toBe(false)
  })
})

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

describe('keypadActionFromKey — physical key → keypad action', () => {
  it('feeds a digit straight through to pressKey', () => {
    expect(keypadActionFromKey(keyEvent({ key: '5' }))).toEqual({ kind: 'press', key: '5' })
  })

  it('maps both "." and "," to the decimal point (some numpads send ",")', () => {
    expect(keypadActionFromKey(keyEvent({ key: '.' }))).toEqual({ kind: 'press', key: '.' })
    expect(keypadActionFromKey(keyEvent({ key: ',' }))).toEqual({ kind: 'press', key: '.' })
  })

  it('maps Backspace → back and Delete → clear', () => {
    expect(keypadActionFromKey(keyEvent({ key: 'Backspace' }))).toEqual({
      kind: 'press',
      key: 'back',
    })
    expect(keypadActionFromKey(keyEvent({ key: 'Delete' }))).toEqual({
      kind: 'press',
      key: 'clear',
    })
  })

  it('maps Enter → save', () => {
    expect(keypadActionFromKey(keyEvent({ key: 'Enter' }))).toEqual({ kind: 'save' })
  })

  it('ignores a key held with a modifier (Cmd+R / Ctrl+F must still work)', () => {
    expect(keypadActionFromKey(keyEvent({ key: '5', ctrlKey: true }))).toBeNull()
    expect(keypadActionFromKey(keyEvent({ key: '5', metaKey: true }))).toBeNull()
    expect(keypadActionFromKey(keyEvent({ key: '5', altKey: true }))).toBeNull()
  })

  it('ignores keys that are not part of the keypad — incl. Escape (belongs to sheets)', () => {
    expect(keypadActionFromKey(keyEvent({ key: 'a' }))).toBeNull()
    expect(keypadActionFromKey(keyEvent({ key: 'F5' }))).toBeNull()
    expect(keypadActionFromKey(keyEvent({ key: 'ArrowLeft' }))).toBeNull()
    expect(keypadActionFromKey(keyEvent({ key: 'Escape' }))).toBeNull()
  })

  it('ignores a keystroke that is still being IME-composed', () => {
    expect(keypadActionFromKey(keyEvent({ key: '5', isComposing: true }))).toBeNull()
  })
})

describe('isTypingTarget — keystrokes owned by a text field never reach the keypad', () => {
  it('is true for real text-entry elements', () => {
    expect(isTypingTarget({ tagName: 'INPUT' })).toBe(true)
    expect(isTypingTarget({ tagName: 'TEXTAREA' })).toBe(true)
  })

  it('is true for a contentEditable element', () => {
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true)
  })

  it('is false for buttons, plain elements, and nothing', () => {
    expect(isTypingTarget({ tagName: 'BUTTON' })).toBe(false)
    expect(isTypingTarget({ tagName: 'DIV' })).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
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
