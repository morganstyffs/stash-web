import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'
import path from 'node:path'

// Brand indigo (คราม). Must stay in step with tailwind.config.ts → brand.DEFAULT
// (#4A57B5) — this is the PWA/browser-chrome colour, NOT a free-standing value.
// The old palette's mint (#14B8A6) leaked into two theme-colour slots; both now
// point here so the app chrome matches the brand.
const BRAND_THEME_COLOR = '#4A57B5'

/**
 * Short commit SHA for the version stamp shown in Settings. Cloudflare Workers
 * Builds (this project's deploy path) exposes WORKERS_CI_COMMIT_SHA; we fall
 * through a few other CI providers, then a local `git` read, and finally 'dev'
 * so a build with neither CI env nor a .git checkout still succeeds — this must
 * never throw or `npm run build` breaks in CI (convention 13).
 */
function resolveCommitSha(): string {
  const fromEnv =
    process.env.WORKERS_CI_COMMIT_SHA || // Cloudflare Workers Builds
    process.env.CF_PAGES_COMMIT_SHA || // Cloudflare Pages (if ever used)
    process.env.GITHUB_SHA || // GitHub Actions (CI build)
    process.env.VITE_COMMIT_SHA // manual override / escape hatch
  if (fromEnv) return fromEnv.slice(0, 7)
  try {
    return (
      execSync('git rev-parse --short=7 HEAD', {
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .toString()
        .trim() || 'dev'
    )
  } catch {
    return 'dev'
  }
}

const COMMIT_SHA = resolveCommitSha()
const BUILD_TIME = new Date().toISOString()

// https://vite.dev/config/
export default defineConfig({
  // Compile-time constants for the Settings version stamp. Declared for
  // TypeScript in src/vite-env.d.ts (no `as any` — convention 11).
  define: {
    __COMMIT_SHA__: JSON.stringify(COMMIT_SHA),
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [
    react(),
    VitePWA({
      // 'prompt' (not 'autoUpdate'): autoUpdate silently reloads the page the
      // moment a new SW activates, which can wipe a half-typed entry. Instead
      // src/components/PwaUpdater.tsx listens via virtual:pwa-register/react and
      // shows a Toast with a "โหลดใหม่" button so the owner reloads when ready.
      registerType: 'prompt',
      // Emit as /site.webmanifest and inject its <link> automatically (a single
      // source of truth — no separate static manifest to drift out of sync).
      manifestFilename: 'site.webmanifest',
      includeAssets: [
        'favicon.ico',
        'favicon-16.png',
        'favicon-32.png',
        'favicon-48.png',
        'apple-touch-icon.png',
        'stash-mark.svg',
        'stash-mark-white.svg',
        'stash-logo.svg',
        'stash-logo-white.svg',
      ],
      manifest: {
        name: 'Stash',
        short_name: 'Stash',
        description: 'บันทึกรายรับ-รายจ่ายส่วนตัว + กึ่งระบบสต็อกสินค้า (ขายต่อ)',
        lang: 'th',
        theme_color: BRAND_THEME_COLOR,
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell precache. Supabase data is handled by the app-level offline
        // queue (IndexedDB) rather than blanket runtime caching, so writes stay
        // correct offline and sync on reconnect.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallbackDenylist: [/^\/api\//],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
})
