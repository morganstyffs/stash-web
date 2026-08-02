import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import resolveConfig from 'tailwindcss/resolveConfig'
import tailwindConfig from '../../tailwind.config'

/**
 * Static guard against the "opacity step that silently isn't there" trap.
 *
 * A bare colour-alpha modifier like `bg-ink/92` LOOKS fine but compiles to
 * nothing: this Tailwind build only emits the alpha steps in `theme.opacity`
 * (0,5,…,100 — multiples of 5). A `/92`, `/88`, `/91`, `/93` … matches no step,
 * so NO rule is emitted — no error, no warning — and the utility is silently
 * dropped. That is exactly what made the "บันทึกแล้ว" toast (`bg-ink/92`) render
 * as a blank transparent capsule. It's the same family as "grep sees it, but the
 * real thing isn't there" (the mint case: `src/` grep empty, value still live).
 *
 * The valid set is read from Tailwind's OWN resolved config (not hardcoded), so
 * this tracks the real rule even if the scale is extended later. An arbitrary
 * value — `bg-ink/[0.92]` — is always accepted (it emits a rule). Values that
 * live only inside comments are ignored: the codebase deliberately documents the
 * `bg-ink/92` bug in prose (Toast.tsx, index.css, the toast visual guard), and
 * describing the trap must not trip the guard.
 *
 * Pure Node — no browser. (The rendered-colour side is the *.visual.test guards.)
 */

// ── the authoritative valid set, straight from Tailwind ──────────────────────
const OPACITY_STEPS = new Set(
  Object.keys(resolveConfig(tailwindConfig).theme.opacity ?? {}),
)

// Colour utilities that take an `/<alpha>` modifier. Deliberately does NOT include
// size/position prefixes (w-, h-, inset-, top-, translate-, basis-, …) so genuine
// FRACTION utilities like `w-1/2` or `translate-x-1/3` are never mistaken for an
// opacity modifier. The colour segment must start with a letter (`ink`, `white`,
// `brand-deep`, `cat-1`, …) or be an arbitrary value (`[#fff]`), which also keeps
// numeric fractions out.
const COLOR_PREFIX =
  '(?:bg|text|decoration|border(?:-[trblxyse])?|divide(?:-[xy])?|ring(?:-offset)?|' +
  'outline|fill|stroke|from|via|to|placeholder|caret|accent|shadow)'
const OPACITY_RE = new RegExp(
  `\\b${COLOR_PREFIX}-(?:\\[[^\\]\\s]+\\]|[a-z][a-z0-9-]*)\\/(\\[[^\\]\\s]+\\]|\\d{1,3})`,
  'g',
)

/**
 * Blank out comments so a `/92` written in prose can't fail the guard, while
 * KEEPING string / template / backtick contents (that's where classNames live)
 * and preserving newlines (so reported line numbers stay accurate). A small
 * hand-rolled scanner that tracks string state, so a comment-open sequence that
 * appears inside a string literal (e.g. a recursive glob) is left untouched
 * instead of being mistaken for a real comment the way a naive regex strip would.
 */
function stripComments(src: string, isCss: boolean): string {
  type S = 'code' | 'line' | 'block' | 'sq' | 'dq' | 'tpl'
  let out = ''
  let state: S = 'code'
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    const c2 = src[i + 1]
    if (state === 'code') {
      if (!isCss && c === '/' && c2 === '/') { state = 'line'; i++; continue }
      if (c === '/' && c2 === '*') { state = 'block'; i++; continue }
      if (c === "'") state = 'sq'
      else if (c === '"') state = 'dq'
      else if (!isCss && c === '`') state = 'tpl'
      out += c
    } else if (state === 'line') {
      if (c === '\n') { state = 'code'; out += c }
    } else if (state === 'block') {
      if (c === '*' && c2 === '/') { state = 'code'; i++ } else if (c === '\n') out += c
    } else {
      // inside a string / template literal — keep contents verbatim
      if (c === '\\') { out += c + (c2 ?? ''); i++; continue }
      if ((state === 'sq' && c === "'") || (state === 'dq' && c === '"') || (state === 'tpl' && c === '`')) {
        state = 'code'
      }
      out += c
    }
  }
  return out
}

function sourceFiles(root: string): string[] {
  return readdirSync(root, { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.(tsx?|css)$/.test(f))
    .map((f) => join(root, f))
}

interface Violation {
  file: string
  line: number
  klass: string
  opacity: string
}

function scan(): Violation[] {
  const out: Violation[] = []
  for (const file of sourceFiles('src')) {
    const stripped = stripComments(readFileSync(file, 'utf8'), file.endsWith('.css'))
    stripped.split('\n').forEach((text, idx) => {
      for (const m of text.matchAll(OPACITY_RE)) {
        const opacity = m[1]
        if (opacity.startsWith('[')) continue // arbitrary value → always emits
        if (OPACITY_STEPS.has(opacity)) continue // a real scale step
        out.push({ file, line: idx + 1, klass: m[0], opacity })
      }
    })
  }
  return out
}

describe('Tailwind opacity modifiers all reference a real scale step', () => {
  it('the valid set derived from the config matches the confirmed rule (multiples of 5, 0–100)', () => {
    const steps = [...OPACITY_STEPS].map(Number).sort((a, b) => a - b)
    // Empirically confirmed against a real build: only these bare steps emit a rule.
    expect(steps).toEqual(Array.from({ length: 21 }, (_, i) => i * 5))
  })

  it('no colour utility in src/ uses a bare opacity outside the scale', () => {
    const violations = scan()
    const report = violations
      .map((v) => `  ${v.file}:${v.line}  ${v.klass}  (/${v.opacity} is not a real opacity step)`)
      .join('\n')
    expect(
      violations,
      violations.length
        ? `Bare opacity modifiers that compile to NOTHING (use a multiple of 5, ` +
            `or an arbitrary value like /[0.92]):\n${report}`
        : '',
    ).toEqual([])
  })
})
