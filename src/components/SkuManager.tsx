import { useState } from 'react'
import { Overlay } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { translateError } from '@/lib/errors'
import { useSkuConfig, useUpdateSkuPrefix } from '@/hooks/useSkuConfig'
import { useSkuPreview } from '@/hooks/useSku'
import { isValidSkuPrefix, normalizeSkuPrefix, SKU_PREFIX_RULE_TEXT } from '@/lib/sku'

/**
 * รูปแบบ SKU — the prefix stamped on every new stock item ({PREFIX}-{SEQ}, e.g.
 * STZ-0007). Editable at any time (0025): changing it only affects items taken
 * in AFTER the change — already-labelled items keep their SKU, and the running
 * number is NOT reset (it carries on: STZ-0042 → ABC-0043). The full SKU string
 * is assembled in the DB (stock_sku_build) — the example shown here comes from
 * the stock_sku_preview RPC, never from string concatenation in the client.
 */
export function SkuManager({ onClose }: { onClose: () => void }) {
  const { data: config } = useSkuConfig()
  const previewQ = useSkuPreview()
  const update = useUpdateSkuPrefix()
  const toast = useToast()
  const [draft, setDraft] = useState<string | null>(null)

  // Fall back to the default 'STZ' when the row doesn't exist yet, so a fresh
  // user can still set + save (the mutation upserts). Never an empty screen.
  const current = config?.prefix ?? 'STZ'
  const value = draft ?? current
  const valid = isValidSkuPrefix(value)
  const dirty = value !== current
  const canSave = valid && dirty && !update.isPending

  async function save() {
    if (!canSave) return
    try {
      await update.mutateAsync(value)
      toast.success('บันทึกรูปแบบ SKU แล้ว')
      setDraft(null)
    } catch (e) {
      // 23514 (CHECK violation) → Thai message from errors.ts, caught by code.
      toast.error(translateError(e))
    }
  }

  return (
    <Overlay title="รูปแบบ SKU" onClose={onClose}>
      <p className="mb-1.5 text-[11px] uppercase tracking-[0.5px] text-faint">อักษรนำหน้า</p>
      <input
        value={value}
        onChange={(e) => setDraft(normalizeSkuPrefix(e.target.value))}
        placeholder="STZ"
        inputMode="text"
        autoCapitalize="characters"
        autoComplete="off"
        maxLength={3}
        aria-label="อักษรนำหน้า SKU"
        className="w-full rounded-input border-[0.5px] border-hairline bg-fill px-3 py-2.5 text-center font-mono text-[18px] font-medium tracking-[0.2em] outline-none focus:border-brand"
      />
      <p className="mt-1.5 text-[11px] text-faint">{SKU_PREFIX_RULE_TEXT}</p>

      <p className="mt-3 text-[12px] text-muted">
        ชิ้นถัดไปจะได้ประมาณ{' '}
        <span className="font-mono font-medium text-ink">{previewQ.data ?? '…'}</span>
      </p>

      <div className="mt-3 rounded-input bg-surface px-3 py-2.5 text-[11.5px] leading-relaxed text-muted">
        เปลี่ยนแล้ว<span className="font-medium">มีผลกับของที่รับเข้าใหม่เท่านั้น</span> —
        ของที่มีป้ายแล้วไม่เปลี่ยน · เลขรัน<span className="font-medium">ไม่เริ่มใหม่ นับต่อจากเดิม</span>
      </div>

      <button
        disabled={!canSave}
        onClick={save}
        className="mt-4 w-full rounded-btn bg-brand-deep py-2.5 text-[13px] font-medium text-white disabled:opacity-40"
      >
        {update.isPending ? 'กำลังบันทึก…' : 'บันทึกรูปแบบ SKU'}
      </button>
    </Overlay>
  )
}
