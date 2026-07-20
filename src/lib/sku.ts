/**
 * Client-side SKU preview, mirroring the authoritative generation in
 * 0004_stock_intake_rpc.sql (STZ-<BRAND3>-<seq4>). The RPC is the source of
 * truth; this only shows the user what to expect before saving.
 */
export function previewSku(brand: string | null | undefined, seq: number): string {
  let b3 = (brand ?? '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 3).toUpperCase()
  if (!b3) b3 = 'GEN'
  return `STZ-${b3}-${String(seq).padStart(4, '0')}`
}
