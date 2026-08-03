import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Wording guard (ใบ 11): the category role that feeds stock is called “เติมสต็อก”
 * everywhere the USER sees it. ใบ 4 named the role-picker chip “เติมสต็อก”, but the
 * /stock/intake empty-state still called the same thing “หมวดสต็อก”, so a user
 * couldn't be sure the two screens meant one thing. The owner picked “เติมสต็อก”
 * as the single word, so this guard keeps the deprecated on-screen phrase
 * “หมวดสต็อก” from creeping back into any shipped surface.
 *
 * Scans APP source only (excludes *.test.* — a test file legitimately contains
 * the deprecated string as its own search target, and tests aren't shipped) and
 * blanks out comments first (a comment documenting the rename must not trip the
 * guard — the caveat the opacity-scale guard also honours). Pure Node, no browser.
 *
 * NOTE this bans only the compound “หมวดสต็อก”. The bare section word “สต็อก”
 * (nav tab, filters, “รับเข้าสต็อก” the intake ACTION, “ในสต็อก” the status) is a
 * different meaning and stays — see the ใบ 11 glossary.
 */

const DEPRECATED = 'หมวดสต็อก'
const ROLE_WORD = 'เติมสต็อก'

/** Blank out // line and /* *\/ block comments while KEEPING string/template/JSX
 *  text (where UI copy lives) and preserving newlines for accurate line numbers.
 *  A small state machine, so a `//` inside a string can't be mistaken for a
 *  comment (same reasoning as the opacity-scale guard). */
function stripComments(src: string): string {
  type S = 'code' | 'line' | 'block' | 'sq' | 'dq' | 'tpl'
  let out = ''
  let state: S = 'code'
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    const c2 = src[i + 1]
    if (state === 'code') {
      if (c === '/' && c2 === '/') { state = 'line'; i++; continue }
      if (c === '/' && c2 === '*') { state = 'block'; i++; continue }
      if (c === "'") state = 'sq'
      else if (c === '"') state = 'dq'
      else if (c === '`') state = 'tpl'
      out += c
    } else if (state === 'line') {
      if (c === '\n') { state = 'code'; out += c }
    } else if (state === 'block') {
      if (c === '*' && c2 === '/') { state = 'code'; i++ } else if (c === '\n') out += c
    } else {
      if (c === '\\') { out += c + (c2 ?? ''); i++; continue }
      if ((state === 'sq' && c === "'") || (state === 'dq' && c === '"') || (state === 'tpl' && c === '`')) {
        state = 'code'
      }
      out += c
    }
  }
  return out
}

/** App source files: .ts/.tsx under src/, excluding any *.test.* (test files are
 *  not shipped and may reference the deprecated word on purpose). */
function appSourceFiles(root: string): string[] {
  return readdirSync(root, { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f))
    .map((f) => join(root, f))
}

describe('ใบ 11 — the stock role is “เติมสต็อก” everywhere on screen', () => {
  it(`no shipped surface uses the deprecated “${DEPRECATED}”`, () => {
    const hits: string[] = []
    for (const file of appSourceFiles('src')) {
      stripComments(readFileSync(file, 'utf8'))
        .split('\n')
        .forEach((line, idx) => {
          if (line.includes(DEPRECATED)) hits.push(`  ${file}:${idx + 1}  ${line.trim()}`)
        })
    }
    expect(
      hits,
      hits.length ? `“${DEPRECATED}” is deprecated — use “${ROLE_WORD}”:\n${hits.join('\n')}` : '',
    ).toEqual([])
  })

  it('the intake empty-state now points at the “เติมสต็อก” role', () => {
    const src = readFileSync('src/pages/StockIntakePage.tsx', 'utf8')
    expect(src.includes(ROLE_WORD), 'StockIntakePage should reference the เติมสต็อก role').toBe(true)
    expect(src.includes(DEPRECATED)).toBe(false)
  })
})
