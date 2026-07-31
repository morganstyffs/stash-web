// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

// SkuManager is a thin editor over three hooks: read the config row, read the
// live preview (from the RPC), and upsert the prefix. Mock all three so the test
// asserts the FORM behaviour (disable rules + the mandatory warning), not the
// network.
let config: { prefix: string } | null = { prefix: 'STZ' }
const mutateAsync = vi.fn().mockResolvedValue(undefined)

vi.mock('@/hooks/useSkuConfig', () => ({
  useSkuConfig: () => ({ data: config }),
  useUpdateSkuPrefix: () => ({ mutateAsync, isPending: false }),
}))
vi.mock('@/hooks/useSku', () => ({ useSkuPreview: () => ({ data: 'STZ-0007' }) }))
vi.mock('@/components/Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}))

import { SkuManager } from '@/components/SkuManager'

const saveBtn = () =>
  screen.getByRole('button', { name: /บันทึกรูปแบบ SKU/ }) as HTMLButtonElement
const input = () => screen.getByLabelText('อักษรนำหน้า SKU') as HTMLInputElement

afterEach(() => {
  cleanup()
  config = { prefix: 'STZ' }
})

describe('SkuManager — prefix editor', () => {
  it('shows the mandatory "affects new intake only / counter not reset" warning', () => {
    render(<SkuManager onClose={() => {}} />)
    expect(screen.getByText('มีผลกับของที่รับเข้าใหม่เท่านั้น')).toBeTruthy()
    expect(screen.getByText('ไม่เริ่มใหม่ นับต่อจากเดิม')).toBeTruthy()
  })

  it('disables save while the value is unchanged from the saved prefix', () => {
    render(<SkuManager onClose={() => {}} />)
    expect(saveBtn().disabled).toBe(true)
  })

  it('keeps save disabled when the prefix is fewer than 3 characters', () => {
    render(<SkuManager onClose={() => {}} />)
    fireEvent.change(input(), { target: { value: 'AB' } })
    expect(input().value).toBe('AB')
    expect(saveBtn().disabled).toBe(true)
  })

  it('enables save once the prefix is 3 valid chars and changed', () => {
    render(<SkuManager onClose={() => {}} />)
    fireEvent.change(input(), { target: { value: 'ABC' } })
    expect(input().value).toBe('ABC')
    expect(saveBtn().disabled).toBe(false)
  })

  it('normalises lowercase to uppercase as the user types', () => {
    render(<SkuManager onClose={() => {}} />)
    fireEvent.change(input(), { target: { value: 'abc' } })
    expect(input().value).toBe('ABC')
    expect(saveBtn().disabled).toBe(false)
  })

  it('with no config row yet, defaults to STZ and can still save a new prefix', () => {
    config = null
    render(<SkuManager onClose={() => {}} />)
    expect(input().value).toBe('STZ') // default, not blank
    expect(saveBtn().disabled).toBe(true) // unchanged from default
    fireEvent.change(input(), { target: { value: 'XYZ' } })
    expect(saveBtn().disabled).toBe(false)
  })
})
