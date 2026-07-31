/**
 * SKU prefix rules — ONE place (convention 10) so the input field, the
 * client-side validity check, the shown rule, and the DB CHECK in migration 0025
 * (`stock_sku_config_prefix_check`) can never drift apart. Stored uppercase;
 * A–Z / 0–9; exactly 3 characters.
 *
 * NB: there is DELIBERATELY no SKU-assembly logic here. The full SKU string
 * ({PREFIX}-{SEQ}) is built by `stock_sku_build` in the DB — the single source
 * of truth (§8/§10). The on-screen example must come from the stock_sku_preview
 * RPC, never from string concatenation in the client.
 */
const SKU_PREFIX_RE = /^[A-Z0-9]{3}$/

/** Human-readable rule, shown as a hint BEFORE saving (never only after a failed
 *  save). Mirrors SKU_PREFIX_RE. */
export const SKU_PREFIX_RULE_TEXT = 'ใช้ A–Z และ 0–9 · ยาว 3 ตัวพอดี'

/**
 * Force the shape the DB stores: uppercase, only A–Z / 0–9, at most 3 chars.
 * Applied on every keystroke so the field is always in canonical form (a user
 * typing lowercase sees it turn uppercase immediately, and Thai / symbols are
 * dropped rather than rejected). Mirrors the DB CHECK — see SKU_PREFIX_RE.
 */
export function normalizeSkuPrefix(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 3)
}

export function isValidSkuPrefix(input: string): boolean {
  return SKU_PREFIX_RE.test(input)
}
