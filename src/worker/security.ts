/**
 * Central HTTP security headers, applied to EVERY response the Worker returns
 * (static assets and /api/* alike). Kept in one place so the policy is a single
 * source of truth and can't drift between routes.
 *
 * ── Content-Security-Policy ────────────────────────────────────────────────
 * The allowlist is derived from what the app actually loads:
 *   - scripts/styles/manifest/worker: bundled by Vite, same-origin ('self').
 *     The built index.html has NO inline <script>, so script-src stays 'self'.
 *   - Google Fonts: stylesheet from fonts.googleapis.com, font files from
 *     fonts.gstatic.com (see index.html).
 *   - Supabase: REST/Auth/Storage over https and Realtime over wss. The project
 *     ref isn't known to the Worker at runtime (it's a Vite build var), so we
 *     allow the *.supabase.co apex. Tighten to the exact `<ref>.supabase.co`
 *     host if you prefer — see SUPABASE_ORIGINS below.
 *   - images: 'self' (app icons), data: (inline svg/icons) and blob: (photo
 *     previews via URL.createObjectURL), plus Supabase signed-URL photos.
 *   - style-src keeps 'unsafe-inline' because Google Fonts injects an inline
 *     <style> and React sets inline style attributes. There is no equivalent
 *     inline-script allowance — script-src stays locked to 'self'.
 *
 * frame-ancestors 'none' duplicates X-Frame-Options: DENY for modern browsers.
 *
 * If the app ever fails to load a resource in the browser console with a CSP
 * violation, add the specific origin here rather than loosening a directive to
 * a wildcard.
 */

// Supabase hosts. Replace the wildcards with your exact project host, e.g.
// 'https://abcdxyz.supabase.co' and 'wss://abcdxyz.supabase.co', to tighten.
const SUPABASE_HTTP = 'https://*.supabase.co'
const SUPABASE_WS = 'wss://*.supabase.co'

const CSP = [
  `default-src 'self'`,
  `base-uri 'self'`,
  `object-src 'none'`,
  `frame-ancestors 'none'`,
  `form-action 'self'`,
  `script-src 'self'`,
  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
  `font-src 'self' https://fonts.gstatic.com`,
  `img-src 'self' data: blob: ${SUPABASE_HTTP}`,
  `connect-src 'self' ${SUPABASE_HTTP} ${SUPABASE_WS}`,
  `worker-src 'self'`,
  `manifest-src 'self'`,
  `frame-src 'none'`,
  `upgrade-insecure-requests`,
].join('; ')

/**
 * When true the CSP is sent enforcing (blocks violations). When false it is
 * sent as Content-Security-Policy-Report-Only (logs violations in the browser
 * console but blocks nothing) — useful for a first rollout to confirm the
 * allowlist is complete before enforcing. Every other header is always sent.
 */
const CSP_ENFORCE = true

const STATIC_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // Disable powerful features the app never uses.
  'Permissions-Policy':
    'accelerometer=(), autoplay=(), camera=(), display-capture=(), encrypted-media=(), fullscreen=(self), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), usb=()',
  // 180 days. No `preload` on purpose — preload is hard to undo; opt in later
  // via the HSTS preload list only when you're sure HTTPS is permanent.
  'Strict-Transport-Security': 'max-age=15552000; includeSubDomains',
}

/**
 * Returns a new Response with the security headers merged onto the original.
 * The body/status of `res` are preserved; only headers are added. Existing
 * `content-type` and other route headers are kept.
 */
export function withSecurityHeaders(res: Response): Response {
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(STATIC_HEADERS)) headers.set(k, v)
  headers.set(
    CSP_ENFORCE ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only',
    CSP,
  )
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  })
}
