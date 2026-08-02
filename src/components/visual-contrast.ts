/**
 * WCAG 2.x colour math shared by the real-browser `*.visual.test.*` guards
 * (AppLayout.theme, Toast.contrast, …). One source so the readability maths
 * can't drift between guards.
 */

export type Rgb = [number, number, number]

/** Relative luminance (WCAG 2.x) of an sRGB colour given as 0–255 channels. */
export function luminance(r: number, g: number, b: number): number {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** WCAG contrast ratio between two sRGB colours. */
export function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(...a)
  const lb = luminance(...b)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** Parse a computed `rgb(r, g, b)` / `rgba(r, g, b, a)` string into channels. */
export function parseRgb(s: string): Rgb {
  const m = s.match(/rgba?\(\s*([0-9.]+)[,\s]+([0-9.]+)[,\s]+([0-9.]+)/i)
  if (!m) throw new Error(`unparseable colour: ${s}`)
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

/** Alpha channel of a computed colour string (`rgba(...)` → a; `rgb(...)` → 1). */
export function alphaOf(s: string): number {
  const m = s.match(/rgba?\([^)]*?,\s*([0-9.]+)\s*\)/i)
  return m ? Number(m[1]) : 1
}

/** Composite a translucent sRGB colour (`alpha` 0–1) over an opaque backdrop. */
export function composite(fg: Rgb, alpha: number, bg: Rgb): Rgb {
  return [
    fg[0] * alpha + bg[0] * (1 - alpha),
    fg[1] * alpha + bg[1] * (1 - alpha),
    fg[2] * alpha + bg[2] * (1 - alpha),
  ]
}
