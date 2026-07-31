// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'

import { BrandMark } from '@/components/BrandMark'

// The หน้าปัดตู้เซฟ mark is pure geometry, no raster: shell (ring + rays + safe
// door), an indigo dial, and white ink (two eyes + a mouth). These tests pin the
// anatomy — so a refactor can't silently drop the rays or an eye — and the
// accessibility contract (decorative by default, labelled only when `title` is
// given). All colours come from className/currentColor, never a hex literal.

afterEach(cleanup)

function getSvg(container: HTMLElement): SVGSVGElement {
  const svg = container.querySelector('svg')
  if (!svg) throw new Error('BrandMark rendered no <svg>')
  return svg
}

// Rays are the only diagonal strokes (x1 !== x2). Eyes and the safe-door line are
// vertical (x1 === x2); the door sits at x=59.1, the eyes do not.
function anatomy(svg: SVGSVGElement) {
  const lines = Array.from(svg.querySelectorAll('line'))
  const verticals = lines.filter((l) => l.getAttribute('x1') === l.getAttribute('x2'))
  const circles = Array.from(svg.querySelectorAll('circle'))
  return {
    rays: lines.filter((l) => l.getAttribute('x1') !== l.getAttribute('x2')),
    door: verticals.filter((l) => l.getAttribute('x1') === '59.1'),
    eyes: verticals.filter((l) => l.getAttribute('x1') !== '59.1'),
    ring: circles.filter((c) => c.getAttribute('fill') === 'none'),
    dial: circles.filter((c) => c.getAttribute('fill') === 'currentColor'),
    mouth: Array.from(svg.querySelectorAll('path')),
  }
}

describe('BrandMark — anatomy', () => {
  it('variant="full" renders the four winding-handle rays', () => {
    const svg = getSvg(render(<BrandMark variant="full" />).container)
    expect(anatomy(svg).rays).toHaveLength(4)
  })

  it('variant="compact" renders no rays', () => {
    const svg = getSvg(render(<BrandMark variant="compact" />).container)
    expect(anatomy(svg).rays).toHaveLength(0)
  })

  it.each(['full', 'compact'] as const)(
    'variant="%s" has the ring, dial, safe door, two eyes and a mouth',
    (variant) => {
      const svg = getSvg(render(<BrandMark variant={variant} />).container)
      const a = anatomy(svg)
      expect(a.ring).toHaveLength(1)
      expect(a.dial).toHaveLength(1)
      expect(a.door).toHaveLength(1)
      expect(a.eyes).toHaveLength(2)
      expect(a.mouth).toHaveLength(1)
    },
  )
})

describe('BrandMark — accessibility', () => {
  it('is decorative when no title is passed (aria-hidden, no role/title)', () => {
    const svg = getSvg(render(<BrandMark />).container)
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('role')).toBeNull()
    expect(svg.getAttribute('aria-labelledby')).toBeNull()
    expect(svg.querySelector('title')).toBeNull()
  })

  it('is a labelled image when a title is passed (role=img, labelledby → real <title>)', () => {
    const svg = getSvg(render(<BrandMark title="Stash" />).container)
    expect(svg.getAttribute('role')).toBe('img')
    expect(svg.getAttribute('aria-hidden')).toBeNull()

    const title = svg.querySelector('title')
    if (!title) throw new Error('titled BrandMark rendered no <title>')
    expect(title.textContent).toBe('Stash')
    // aria-labelledby must point at the actual <title> id, not a guessed value
    expect(title.id).not.toBe('')
    expect(svg.getAttribute('aria-labelledby')).toBe(title.id)
  })
})

describe('BrandMark — no hardcoded colour', () => {
  // Guard against a future edit slipping a hex literal onto any attribute — the
  // three layers must stay driven by className/currentColor (design rule §8-19).
  it.each(['full', 'compact'] as const)('no attribute value starts with "#" (variant="%s")', (variant) => {
    const svg = getSvg(render(<BrandMark variant={variant} title="Stash" className="text-mint" />).container)
    const nodes = [svg, ...Array.from(svg.querySelectorAll('*'))]
    for (const el of nodes) {
      for (const attr of Array.from(el.attributes)) {
        expect(attr.value.startsWith('#'), `${el.tagName}[${attr.name}]="${attr.value}"`).toBe(false)
      }
    }
  })
})
