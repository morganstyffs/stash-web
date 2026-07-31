import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'
import path from 'node:path'

// App surface colour, light scheme — mirrors --color-surface (246 243 236) in
// src/styles/index.css. Used for the installed-PWA manifest theme_color, which
// (unlike index.html's <meta name="theme-color">) can't switch per scheme, so
// it takes the light value. This is the app background, NOT the accent — a fixed
// accent would look wrong in one of the two modes. (Was the old mint #14B8A6.)
const APP_SURFACE_LIGHT = '#F6F3EC'

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
      // 'prompt' (not 'autoUpdate') only so vite-plugin-pwa never injects an
      // automatic page reload — that could wipe a half-typed entry. Freshness does
      // NOT depend on a prompt anymore (the old "โหลดใหม่" toast never fired for the
      // owner across 4 merges): the workbox config below self-activates each new SW
      // and serves the app shell network-first, so the new version arrives on the
      // next app open with no tap and no mid-session reload. PwaUpdater now only
      // registers the SW and surfaces registration errors.
      registerType: 'prompt',
      // Emit as /site.webmanifest and inject its <link> automatically (a single
      // source of truth — no separate static manifest to drift out of sync).
      manifestFilename: 'site.webmanifest',
      includeAssets: [
        'favicon.ico',
        'favicon.svg',
        'favicon-16.png',
        'favicon-32.png',
        'favicon-48.png',
        'apple-touch-icon.png',
        // stash-mark/stash-logo are the OLD mark, still rendered by live screens
        // (HomePage, AppLayout, Login/Reset/Forgot) — kept until those screens move
        // to the new BrandMark in a later PR. The -white variants were unreferenced
        // and were removed with the logo v2 install.
        'stash-mark.svg',
        'stash-logo.svg',
      ],
      manifest: {
        name: 'Stash',
        short_name: 'Stash',
        description: 'บันทึกรายรับ-รายจ่ายส่วนตัว + กึ่งระบบสต็อกสินค้า (ขายต่อ)',
        lang: 'th',
        theme_color: APP_SURFACE_LIGHT,
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
        // ── Root fix for the frozen-version bug ──────────────────────────────
        // index.html is the ONE file that says which JS bundle to load. Two things
        // pinned it: it was PRECACHED (so precacheAndRoute served it cache-first for
        // "/"), and navigateFallback bound navigations to that precache handler. So
        // once a service worker installed, the whole app was frozen to that build no
        // matter how fresh the server was — production sat on #66 for 4 merges.
        //   • Drop html from globPatterns → index.html is no longer precached, so
        //     precacheAndRoute stops intercepting navigations. (JS/CSS keep their
        //     content hashes and stay precached — immutable, safe to cache forever.)
        //   • navigateFallback: undefined → removes the cache-first navigation route.
        // Navigations then fall through to the NetworkFirst rule below.
        globPatterns: ['**/*.{js,css,svg,png,woff2}'],
        navigateFallback: undefined,
        // Serve the navigation (index.html) NETWORK-FIRST: a returning online client
        // always gets the newest shell → newest bundle. NetworkFirst falls back to
        // this cache when the network fails, so the app still opens offline once it
        // has been loaded online at least once; networkTimeoutSeconds bounds the
        // wait on a flaky connection. (API/data calls aren't navigations, so this
        // rule never touches them — they go straight to the network as before.)
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'app-shell',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 1 },
            },
          },
        ],
        // Take a new SW live immediately and let it control already-open pages,
        // instead of parking it in "waiting" behind a prompt the owner never saw.
        // This does NOT reload the page — combined with network-first above, the
        // fresh shell lands on the next app open, never over a half-typed entry.
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
})
