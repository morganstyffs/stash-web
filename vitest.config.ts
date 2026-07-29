import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// Dedicated Vitest config (kept separate from vite.config.ts so the PWA plugin
// and app manifest don't run during tests). Mirrors the app's `@` alias.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    // Pure-function tests — no DOM needed.
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Dummy Supabase env so importing modules that transitively load
    // lib/supabase.ts (which throws on missing env) doesn't blow up. No network
    // call is made — the client is constructed but never used in these tests.
    env: {
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
  },
})
