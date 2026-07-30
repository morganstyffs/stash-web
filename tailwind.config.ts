import type { Config } from 'tailwindcss'

/**
 * Design tokens straight from the Stash design spec (docs/design).
 * Brand = คราม (indigo). Style = flat, hairline borders, generous spacing, Prompt font.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // brand — คราม (indigo). fabric*/thread drive WovenHero: do NOT change
        // their values (the woven labels render against them).
        brand: {
          DEFAULT: '#4A57B5', // accent, graph lines, first category
          deep: '#2E3C6B', // primary buttons, dark surfaces, active nav (white on this = 10.63:1)
          tint: '#E7E9F4', // selected chip / soft highlight bg
          ink: '#2A3260', // text on tint (10.07:1)
          fabric: '#1E2547', // safe label fabric — locked
          'fabric-budget': '#4A3A14', // budget label fabric — locked
          'fabric-stock': '#2B2E34', // stock label fabric — locked (expense fast-labels)
          'fabric-income': '#1E3A2C', // income fast-label fabric — tells รับ apart from จ่าย
          thread: '#F3ECDB', // woven thread = text on every label — locked
        },
        // semantic (each with a light surface; -soft pairs read on dark bg)
        income: '#1A7A57',
        'income-bg': '#E4F0EA',
        'income-soft': '#8FD3B4',
        expense: '#B23A2C',
        'expense-bg': '#F8E7E4',
        'expense-soft': '#EDA095',
        warn: '#8F6410',
        'warn-bg': '#F7EEDC',
        'warn-ink': '#6E4C0C',
        // neutrals
        ink: '#1B1A17', // primary text
        muted: '#5B5850', // secondary text
        faint: '#696558', // tertiary / placeholder (4.5:1 on fill, surface, white)
        hairline: '#E2DED3', // 0.5px separators + borders
        surface: '#F6F3EC', // app background
        fill: '#EDE9DE', // inset field / neutral chip bg
        chevron: '#C8C2B4',
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
        card: '0 3px 14px rgba(20,30,28,0.07)',
      },
    },
  },
  plugins: [],
} satisfies Config
