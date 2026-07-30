/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
// ^ vite-plugin-pwa/client declares the `virtual:pwa-register` and
//   `virtual:pwa-register/react` modules used by src/components/PwaUpdater.tsx,
//   so no hand-written module declaration (or `as any`) is needed for them.

// Compile-time constants injected by `define` in vite.config.ts (version stamp).
declare const __COMMIT_SHA__: string
declare const __BUILD_TIME__: string

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
