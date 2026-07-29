import { useState } from 'react'
import { IconPencil, IconPlus, IconTrash, IconWallet } from '@tabler/icons-react'
import { Overlay } from '@/components/ui'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useToast } from '@/components/Toast'
import { useDeleteWallet, useUpsertWallet, useWallets } from '@/hooks/useSettings'
import { translateError } from '@/lib/errors'
import type { Wallet, WalletType } from '@/lib/db'

const TYPES: { key: WalletType; label: string }[] = [
  { key: 'cash', label: 'เงินสด' },
  { key: 'bank', label: 'ธนาคาร' },
  { key: 'promptpay', label: 'พร้อมเพย์' },
]

interface FormState {
  id?: string
  name: string
  type: WalletType
}

export function WalletsManager({ onClose }: { onClose: () => void }) {
  const { data: wallets } = useWallets()
  const upsert = useUpsertWallet()
  const del = useDeleteWallet()
  const toast = useToast()
  const [form, setForm] = useState<FormState | null>(null)
  const [confirming, setConfirming] = useState<Wallet | null>(null)

  async function confirmRemove() {
    if (!confirming) return
    try {
      await del.mutateAsync(confirming.id)
      toast.success('ลบกระเป๋าแล้ว')
      setConfirming(null)
    } catch (e) {
      toast.error(translateError(e))
      setConfirming(null)
    }
  }

  return (
    <Overlay
      title="กระเป๋าเงิน"
      onClose={onClose}
      action={
        <button aria-label="เพิ่มกระเป๋า" onClick={() => setForm({ name: '', type: 'cash' })}>
          <IconPlus size={20} className="text-mint-deep" />
        </button>
      }
    >
      {form && (
        <div className="mb-4 rounded-card border-[0.5px] border-hairline p-3.5">
          <input
            autoFocus
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="ชื่อกระเป๋า"
            className="mb-2.5 w-full rounded-input border-[0.5px] border-hairline bg-fill px-3 py-2.5 text-[13px] outline-none focus:border-mint"
          />
          <div className="mb-3 flex flex-wrap gap-1.5">
            {TYPES.map((t) => (
              <button
                key={t.key}
                onClick={() => setForm({ ...form, type: t.key })}
                className={`rounded-pill px-4 py-[5px] text-[12px] ${
                  form.type === t.key
                    ? 'bg-mint-tint font-medium text-mint-text'
                    : 'border-[0.5px] border-hairline text-muted'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setForm(null)}
              className="rounded-btn border-[0.5px] border-hairline px-4 py-2.5 text-[13px] font-medium"
            >
              ยกเลิก
            </button>
            <button
              disabled={!form.name.trim() || upsert.isPending}
              onClick={async () => {
                try {
                  await upsert.mutateAsync({
                    id: form.id,
                    name: form.name.trim(),
                    type: form.type,
                  })
                  toast.success(form.id ? 'บันทึกกระเป๋าแล้ว' : 'เพิ่มกระเป๋าแล้ว')
                  setForm(null)
                } catch (e) {
                  toast.error(translateError(e))
                }
              }}
              className="flex-1 rounded-btn bg-mint-deep py-2.5 text-[13px] font-medium text-white disabled:opacity-40"
            >
              บันทึก
            </button>
          </div>
        </div>
      )}

      {(wallets ?? []).map((w) => (
        <div
          key={w.id}
          className="flex items-center gap-3 border-b-[0.5px] border-hairline py-2.5 last:border-b-0"
        >
          <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-fill">
            <IconWallet size={16} className="text-muted" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px]">{w.name}</p>
            <p className="text-[11px] text-faint">
              {TYPES.find((t) => t.key === w.type)?.label ?? w.type}
            </p>
          </div>
          <button
            aria-label="แก้ไข"
            onClick={() => setForm({ id: w.id, name: w.name, type: w.type })}
          >
            <IconPencil size={16} className="text-faint" />
          </button>
          <button aria-label="ลบ" disabled={del.isPending} onClick={() => setConfirming(w)}>
            <IconTrash size={16} className="text-faint" />
          </button>
        </div>
      ))}

      {confirming && (
        <ConfirmDialog
          title={`ลบกระเป๋า “${confirming.name}” ?`}
          message="ถ้ากระเป๋านี้ยังมีรายการอยู่จะลบไม่ได้"
          busy={del.isPending}
          onCancel={() => setConfirming(null)}
          onConfirm={confirmRemove}
        />
      )}
    </Overlay>
  )
}
