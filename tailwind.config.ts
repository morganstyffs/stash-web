import type { Config } from 'tailwindcss'

/**
 * Design tokens straight from the Stash design spec (docs/design).
 * Brand = mint. Style = flat, hairline borders, generous spacing, Prompt font.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // brand mint
        mint: {
          DEFAULT: '#2CC0A0', // bright — graph lines, accents, dark text on tint
          deep: '#0E7D66', // primary buttons, hero pocket, active nav
          tint: '#E1F6F0', // selected chip / soft highlight bg
          text: '#0C5646', // text on tint / light bg
          hero: '#C9F2E7', // plus badge on dark hero
        },
        // semantic
        income: '#1D9E75',
        expense: '#E24B4A',
        warn: '#BA7517',
        // category palette (bg + text pairs)
        cat: {
          yellow: '#F5C64C',
          'yellow-ink': '#4A3A08',
          coral: '#FB7A57',
          'coral-ink': '#7A2F17',
          green: '#34C471',
          'green-ink': '#0B3D22',
          black: '#171717',
          'black-ink': '#E8E8E8',
        },
        // neutrals (from the mockups)
        ink: '#1A1D1C', // primary text
        muted: '#5F6360', // secondary text
        faint: '#9AA09C', // tertiary / placeholder
        hairline: '#E6E8E7', // 0.5px separators + borders
        surface: '#F4F5F5', // app background
        fill: '#F1F2F3', // inset field / neutral chip bg
        chevron: '#D2D5D4',
        // warn soft surfaces
        'warn-bg': '#FBF3E4',
        'warn-border': '#E7D3A6',
        'warn-ink': '#7A5B12',
        // missing-tag surfaces (coral tint)
        'miss-bg': '#FDE7DF',
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
