// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { BrandLockup } from '@/components/BrandLockup'

afterEach(cleanup)

describe('BrandLockup', () => {
  it('renders the mark plus the live "Stash" wordmark', () => {
    const { container } = render(<BrandLockup />)
    expect(container.querySelector('svg')).toBeTruthy() // the BrandMark
    expect(screen.getByText('Stash')).toBeTruthy() // live Prompt text, not an <img>
    expect(container.querySelector('img')).toBeNull() // no raster lockup anymore
  })

  it('colours the wordmark with a theme-constant token (visible on the always-white auth card)', () => {
    // The auth card is bg-white in both themes, so the wordmark must NOT use the
    // theme-flipping text-ink (which would go light — invisible — in dark mode).
    const cls = render(<BrandLockup />).getByText('Stash').className
    expect(cls).toContain('text-brand')
    expect(cls).not.toContain('text-ink')
  })
})
