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
        // category palette — colorblind-checked. Do NOT change values, reorder,
        // or add a 7th. Categories past 6 collapse to cat.other.
        // FALLBACK_SLICE_COLORS in useHome.ts must mirror cat.1–6 in this order.
        cat: {
          1: '#4A57B5',
          2: '#CE6A22',
          3: '#0D8F6A',
          4: '#9B4BB0',
          5: '#7D7708',
          6: '#BC2F60',
          other: '#A9A498',
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
