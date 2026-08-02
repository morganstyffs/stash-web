import type { Config } from 'tailwindcss'

/**
 * Design tokens straight from the Stash design spec (docs/design).
 * Brand = คราม (indigo). Style = flat, hairline borders, generous spacing, Prompt font.
 */

// Motion — single source for the woven-label flip timing and the home "moment"
// flourishes (new month / first sale). Components reference these as
// `duration-label` / `ease-label` / `animate-weave-in` / `animate-moment-pop`;
// never hard-code the values in a component (design-spec §2 "การเคลื่อนไหว").
// These are the WovenHero flip's original figures — reused, not re-invented.
const LABEL_DURATION = '420ms'
const LABEL_EASING = 'cubic-bezier(.22,1,.36,1)'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // brand — คราม (indigo). fabric*/thread drive WovenHero: do NOT change
        // their values (the woven labels render against them).
        brand: {
          DEFAULT: '#4A57B5', // accent, graph lines, first category — locked, shared identity with cat.1
          deep: 'rgb(var(--color-brand-deep) / <alpha-value>)', // primary buttons, dark surfaces, active nav
          tint: 'rgb(var(--color-brand-tint) / <alpha-value>)', // selected chip / soft highlight bg
          ink: 'rgb(var(--color-brand-ink) / <alpha-value>)', // text on tint
          fabric: '#1E2547', // safe label fabric — locked
          'fabric-budget': '#4A3A14', // budget label fabric — locked
          'fabric-stock': '#2B2E34', // stock label fabric — locked (expense fast-labels)
          'fabric-income': '#1E3A2C', // income fast-label fabric — tells รับ apart from จ่าย
          thread: '#F3ECDB', // woven thread = text on every label — locked
        },
        // mint — logo shell (เปลือกตู้: ring + rays + safe-door) of the หน้าปัดตู้เซฟ
        // brand mark (BrandMark.tsx, used via `text-mint`). INTENTIONAL REVERSAL of
        // PR-C, which dropped mint in favour of indigo: logo v2 puts a mint shell
        // around the indigo dial, so the token is deliberately back (mint-soft
        // #5CBFA3). Do NOT "fix" this back out — see design-spec §11.4-1.
        // Re-added 2026-07-31. Value mirrors --color-mint in src/styles/index.css.
        mint: 'rgb(var(--color-mint) / <alpha-value>)',
        // dial — indigo face of the brand mark (BrandMark faceClassName default).
        // #4A57B5 on light (same as brand.DEFAULT), lifted on dark so the face
        // clears 3:1 — mirrors cat.1. Value in src/styles/index.css.
        dial: 'rgb(var(--color-dial) / <alpha-value>)',
        // semantic (each with a light surface; -soft pairs read on dark bg)
        income: 'rgb(var(--color-income) / <alpha-value>)',
        'income-bg': 'rgb(var(--color-income-bg) / <alpha-value>)',
        'income-soft': '#8FD3B4', // locked — only ever used on the locked fabric-* hero backgrounds
        expense: 'rgb(var(--color-expense) / <alpha-value>)',
        'expense-bg': 'rgb(var(--color-expense-bg) / <alpha-value>)',
        'expense-soft': '#EDA095', // locked, same reasoning
        warn: 'rgb(var(--color-warn) / <alpha-value>)',
        'warn-bg': 'rgb(var(--color-warn-bg) / <alpha-value>)',
        'warn-ink': 'rgb(var(--color-warn-ink) / <alpha-value>)',
        // neutrals
        ink: 'rgb(var(--color-ink) / <alpha-value>)', // primary text
        muted: 'rgb(var(--color-muted) / <alpha-value>)', // secondary text
        faint: 'rgb(var(--color-faint) / <alpha-value>)', // tertiary / placeholder
        hairline: 'rgb(var(--color-hairline) / <alpha-value>)', // 0.5px separators + borders
        surface: 'rgb(var(--color-surface) / <alpha-value>)', // app background
        fill: 'rgb(var(--color-fill) / <alpha-value>)', // inset field / neutral chip bg
        chevron: 'rgb(var(--color-chevron) / <alpha-value>)',
        // toast — always-dark snackbar/pill surface (white text + locked soft icons
        // read on it in BOTH modes). Theme-independent by design; see --color-toast.
        toast: 'rgb(var(--color-toast) / <alpha-value>)',
        // scrim — always-dark ground for chrome laid over imagery (sold band on a
        // product photo, photo-remove ✕ badge). White text/icons read on it in BOTH
        // modes. Theme-independent by design; see --color-scrim. Replaces `bg-ink`
        // on those spots, which flipped near-white in dark mode.
        scrim: 'rgb(var(--color-scrim) / <alpha-value>)',
        // category palette — colorblind-checked. Now CSS variables (light + dark) so the DB stays
        // free of hex; values + the color_index→slot mapping live in index.css
        // and lib/catColor.ts. Do NOT reorder or add a 7th (see color_index 1–6).
        cat: {
          1: 'rgb(var(--color-cat-1) / <alpha-value>)',
          2: 'rgb(var(--color-cat-2) / <alpha-value>)',
          3: 'rgb(var(--color-cat-3) / <alpha-value>)',
          4: 'rgb(var(--color-cat-4) / <alpha-value>)',
          5: 'rgb(var(--color-cat-5) / <alpha-value>)',
          6: 'rgb(var(--color-cat-6) / <alpha-value>)',
          other: 'rgb(var(--color-cat-other) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Prompt', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      fontWeight: {
        normal: '400',
        medium: '500',
      },
      borderRadius: {
        pocket: '18px',
        card: '16px',
        btn: '14px',
        input: '10px',
        pill: '20px',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
      },
      transitionDuration: {
        label: LABEL_DURATION,
      },
      transitionTimingFunction: {
        label: LABEL_EASING,
      },
      keyframes: {
        // new-month rollover: the fresh label "weaves in"
        'weave-in': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        // first sale of the month: a single recognition beat on STOCK PROFIT
        'moment-pop': {
          '0%, 100%': { transform: 'scale(1)' },
          '38%': { transform: 'scale(1.05)' },
        },
      },
      animation: {
        'weave-in': `weave-in ${LABEL_DURATION} ${LABEL_EASING}`,
        'moment-pop': `moment-pop ${LABEL_DURATION} ${LABEL_EASING}`,
      },
    },
  },
  plugins: [],
} satisfies Config
