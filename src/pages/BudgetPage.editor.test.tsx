// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { BudgetEditor } from '@/pages/BudgetPage'

/**
 * Regression for "the งบต่อเดือน field drops after one keystroke, keyboard closes,
 * have to re-tap for every digit".
 *
 * Root cause was NOT the input — it was the shared useDialogA11y focus hook. The
 * budget amount lives in the *page's* state (lifted, unlike the other sheets which
 * keep form state local), so every keystroke re-renders the page and hands the
 * editor a brand-new inline `onClose`. The hook's mount/restore-focus effect used
 * to depend on `onClose`, so that fresh identity tore the effect down and re-ran
 * it on every keystroke — restoring focus to the trigger, then re-focusing the
 * panel's first element (the ✕ button), yanking the caret out of the input after
 * one character. The fix rides onClose on a ref so that effect fires only on real
 * open/close.
 *
 * This <Harness> reproduces the exact condition (value lifted into parent state +
 * inline onClose) and asserts, digit by digit, that the value accumulates AND the
 * caret stays in the field. A DOM test is legitimate here: we assert on real
 * focus + real input state, not a rendered colour.
 */
function Harness({ addable }: { addable: { id: string; name: string }[] }) {
  const [state, setState] = useState<{ categoryId: string; budgetId?: string; amount: string }>({
    categoryId: 'cat-1',
    budgetId: 'b-1',
    amount: '',
  })
  return (
    <BudgetEditor
      state={state}
      categoryName="อาหาร"
      addable={addable}
      isEdit
      saving={false}
      onChange={setState}
      onSave={() => {}}
      // inline on purpose: a fresh identity every render, exactly like BudgetPage.
      onClose={() => {}}
    />
  )
}

const amountField = () => screen.getByPlaceholderText('0') as HTMLInputElement

afterEach(cleanup)

describe('BudgetEditor — amount field keeps focus while typing', () => {
  it('accumulates several digits without the caret being stolen', () => {
    render(<Harness addable={[{ id: 'cat-1', name: 'อาหาร' }]} />)

    // The user taps into the field (the mount effect parks initial focus on ✕).
    const input = amountField()
    input.focus()
    expect(document.activeElement).toBe(input)

    // Each change re-renders the parent and mints a new inline onClose — the trigger
    // that used to re-run the focus effect and jump the caret to the ✕ button.
    for (const next of ['1', '12', '123', '1234']) {
      fireEvent.change(amountField(), { target: { value: next } })
      expect(amountField().value, `value after "${next}"`).toBe(next)
      expect(document.activeElement, `caret left the field after "${next}"`).toBe(amountField())
    }
  })

  it('a query refetch (new prop object refs) neither overwrites the amount nor steals focus', () => {
    const { rerender } = render(<Harness addable={[{ id: 'cat-1', name: 'อาหาร' }]} />)

    const input = amountField()
    input.focus()
    fireEvent.change(amountField(), { target: { value: '500' } })
    expect(amountField().value).toBe('500')

    // refetch-on-focus hands back brand-new objects with identical values.
    rerender(<Harness addable={[{ id: 'cat-1', name: 'อาหาร' }]} />)

    expect(amountField().value).toBe('500')
    expect(document.activeElement).toBe(amountField())
  })
})
