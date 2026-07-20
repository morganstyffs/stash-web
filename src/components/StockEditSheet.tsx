import { useEffect, useState } from 'react'
import { IconTrash, IconX } from '@tabler/icons-react'
import { useAuth } from '@/hooks/useAuth'
import { useUpdateStockItem } from '@/hooks/useQueue'
import { useDeleteStockItem } from '@/hooks/useStock'
import { signStockPhotos, uploadStockPhotos } from '@/lib/storage'
import { formatBaht } from '@/lib/format'
import {
  ConditionChips,
  Label,
  PhotoEditor,
  TextInput,
  type EditablePhoto,
} from '@/components/StockFields'
import type { ItemCondition, StockItem } from '@/lib/database.types'

/**
 * Edit or delete a single stock item from the stock list. Deletion goes through
 * the stock_item_delete RPC, which also removes the paired purchase expense and
 * blocks items that already have sales history (see 0006). Bottom-sheet form —
 * the shared modal pattern for the app.
 */
export function StockEditSheet({ item, onClose }: { item: StockItem; onClose: () => void }) {
  const { user } = useAuth()
  const update = useUpdateStockItem()
  const del = useDeleteStockItem()

  const [name, setName] = useState(item.name)
  const [type, setType] = useState(item.category ?? '')
  const [brand, setBrand] = useState(item.brand ?? '')
  const [size, setSize] = useState(item.size ?? '')
  const [color, setColor] = useState(item.color ?? '')
  const [condition, setCondition] = useState<ItemCondition | ''>(item.condition ?? '')
  const [target, setTarget] = useState(item.target_price != null ? String(item.target_price) : '')
  const [photos, setPhotos] = useState<EditablePhoto[]>([])
  const [uploading, setUploading] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // sign existing photos for preview
  useEffect(() => {
    let alive = true
    if (!item.photos?.length) return
    signStockPhotos(item.photos).then((map) => {
      if (!alive) return
      setPhotos(item.photos.map((p) => ({ path: p, preview: map[p] ?? '' })))
    })
    return () => {
      alive = false
    }
  }, [item])

  async function onAddPhotos(files: File[]) {
    if (!user) return
    setUploading(true)
    try {
      const paths = await uploadStockPhotos(user.id, item.id, files)
      setPhotos((prev) => [
        ...prev,
        ...paths.map((p, i) => ({ path: p, preview: URL.createObjectURL(files[i]) })),
      ])
    } catch {
      /* surfaced below */
    } finally {
      setUploading(false)
    }
  }

  async function save() {
    await update.mutateAsync({
      id: item.id,
      name: name.trim(),
      category: type.trim() || null,
      brand: brand.trim() || null,
      size: size.trim() || null,
      color: color.trim() || null,
      condition: (condition || null) as ItemCondition | null,
      target_price: target ? Number(target) : null,
      photos: photos.map((p) => p.path),
    })
    onClose()
  }

  async function remove() {
    try {
      await del.mutateAsync(item.id)
      onClose()
    } catch {
      /* del.error rendered below; keep the sheet open */
    }
  }

  const busy = update.isPending || del.isPending

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/30 sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-md flex-col rounded-t-[22px] bg-white sm:rounded-[22px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-[18px] pb-3 pt-4">
          <p className="text-[16px] font-medium">แก้ไขสินค้า</p>
          <button aria-label="ปิด" onClick={onClose}>
            <IconX size={20} className="text-muted" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <p className="mb-3 text-[11px] text-faint">
            ต้นทุน {formatBaht(item.cost_per_unit)} · จำนวน {item.qty_total} · SKU{' '}
            <span className="font-mono">{item.sku ?? '—'}</span>
          </p>

          <div className="mb-3">
            <Label>รูปสินค้า</Label>
            <PhotoEditor
              photos={photos}
              onAdd={onAddPhotos}
              onRemove={(path) => setPhotos((prev) => prev.filter((x) => x.path !== path))}
              uploading={uploading}
            />
          </div>
          <div className="mb-3">
            <Label>ชื่อสินค้า</Label>
            <TextInput value={name} onChange={setName} />
          </div>
          <div className="mb-3 flex gap-[10px]">
            <div className="flex-1">
              <Label>ประเภท</Label>
              <TextInput value={type} onChange={setType} placeholder="เช่น เสื้อยืด" />
            </div>
            <div className="flex-1">
              <Label>แบรนด์</Label>
              <TextInput value={brand} onChange={setBrand} placeholder="Nike" />
            </div>
          </div>
          <div className="mb-3 flex gap-[10px]">
            <div className="flex-1">
              <Label>ไซซ์</Label>
              <TextInput value={size} onChange={setSize} placeholder="L" />
            </div>
            <div className="flex-1">
              <Label>สี</Label>
              <TextInput value={color} onChange={setColor} placeholder="เขียว" />
            </div>
          </div>
          <div className="mb-3">
            <Label>สภาพ</Label>
            <ConditionChips value={condition} onChange={setCondition} />
          </div>
          <div className="mb-3">
            <Label>ราคาตั้งขาย/ชิ้น</Label>
            <div className="flex items-center rounded-input border-[0.5px] border-hairline bg-fill px-[11px] py-[10px]">
              <span className="mr-1 text-[13px] text-faint">฿</span>
              <input
                value={target}
                onChange={(e) => setTarget(e.target.value.replace(/[^0-9.]/g, ''))}
                inputMode="decimal"
                placeholder="0"
                className="w-full bg-transparent text-[13px] outline-none placeholder:text-faint"
              />
            </div>
          </div>

          {update.error && (
            <p className="pb-2 text-[12px] text-expense">
              บันทึกไม่สำเร็จ: {(update.error as Error).message}
            </p>
          )}
          {del.error && (
            <p className="pb-2 text-[12px] text-expense">{(del.error as Error).message}</p>
          )}

          {/* delete — two-step inline confirm (no accidental taps) */}
          {confirmingDelete ? (
            <div className="mt-1 rounded-card border-[0.5px] border-hairline bg-fill p-3">
              <p className="mb-2.5 text-[12.5px]">
                ลบ “{item.name}” ? รายจ่ายต้นทางจะถูกลบไปด้วย ย้อนกลับไม่ได้
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmingDelete(false)}
                  disabled={del.isPending}
                  className="flex-1 rounded-btn border-[0.5px] border-hairline py-2.5 text-[13px] font-medium disabled:opacity-40"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={remove}
                  disabled={del.isPending}
                  className="flex-1 rounded-btn bg-expense py-2.5 text-[13px] font-medium text-white disabled:opacity-40"
                >
                  {del.isPending ? 'กำลังลบ…' : 'ลบสินค้า'}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingDelete(true)}
              className="mt-1 flex items-center gap-1.5 text-[13px] font-medium text-expense"
            >
              <IconTrash size={15} />
              ลบสินค้านี้
            </button>
          )}
        </div>

        <div className="border-t-[0.5px] border-hairline px-4 pb-[max(18px,env(safe-area-inset-bottom))] pt-3">
          <button
            onClick={save}
            disabled={!name.trim() || busy}
            className="w-full rounded-btn bg-mint-deep py-3.5 text-[15px] font-medium text-white disabled:opacity-40"
          >
            {update.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
  )
}
