import { useEffect, useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  IconArrowLeft,
  IconChevronRight,
  IconClipboardList,
  IconPhoto,
  IconX,
} from '@tabler/icons-react'
import { useAuth } from '@/hooks/useAuth'
import { missingTags, useQueueItems, useUpdateStockItem } from '@/hooks/useQueue'
import { useToast } from '@/components/Toast'
import { signStockPhotos, uploadStockPhotos } from '@/lib/storage'
import { formatBaht } from '@/lib/format'
import { translateError } from '@/lib/errors'
import { useDialogA11y } from '@/lib/useDialogA11y'
import {
  ConditionChips,
  Label,
  PhotoEditor,
  TextInput,
  type EditablePhoto,
} from '@/components/StockFields'
import type { ItemCondition, StockItem } from '@/lib/db'
import { SkuTag } from '@/pages/StockPage'

export function StockQueuePage() {
  const navigate = useNavigate()
  const { data, isLoading } = useQueueItems()
  const [editing, setEditing] = useState<StockItem | null>(null)

  const items = data?.items ?? []
  const totalCost = items.reduce(
    (s, it) => s + Number(it.cost_per_unit) * (it.qty_total ?? 0),
    0,
  )

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col bg-white">
      <div className="flex items-center justify-between px-[18px] pb-3 pt-4">
        <button
          aria-label="ย้อนกลับ"
          onClick={() => navigate('/stock')}
          className="-m-2.5 flex h-11 w-11 items-center justify-center rounded-full"
        >
          <IconArrowLeft size={20} className="text-muted" />
        </button>
        <p className="text-[16px] font-medium">รอเติมรายละเอียด</p>
        <span className="w-5" />
      </div>

      <div className="mx-4 mb-3.5">
        <div
          className="woven relative overflow-hidden rounded-card bg-brand-fabric-stock text-brand-thread shadow-card"
          style={{ height: 100 }}
        >
          <span aria-hidden className="selvedge absolute inset-x-0 top-0 h-[6px]" />
          <span aria-hidden className="selvedge absolute inset-x-0 bottom-0 h-[6px]" />
          <div className="relative flex h-full items-center justify-between px-[18px]">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] opacity-80">
                รอเติมข้อมูล
              </p>
              <p className="mt-1 text-[28px] font-semibold leading-none tabular-nums">
                {items.length} ชิ้น
              </p>
              <p className="mt-1.5 text-[11px] opacity-80">
                ต้นทุนรวม {formatBaht(totalCost)} · เติมให้ครบเพื่อพร้อมขาย
              </p>
            </div>
            <IconClipboardList size={26} className="opacity-70" aria-hidden />
          </div>
        </div>
      </div>

      <div className="px-4 pb-6">
        {items.length > 0 ? (
          items.map((it) => (
            <QueueRow key={it.id} item={it} thumb={data?.thumbs[it.photos?.[0] ?? '']} onOpen={() => setEditing(it)} />
          ))
        ) : (
          <p className="py-10 text-center text-[13px] text-faint">
            {isLoading ? 'กำลังโหลด…' : 'ไม่มีสินค้ารอเติมรายละเอียด 🎉'}
          </p>
        )}
      </div>

      {editing && <QueueEditSheet item={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function QueueRow({
  item,
  thumb,
  onOpen,
}: {
  item: StockItem
  thumb?: string
  onOpen: () => void
}) {
  const tags = missingTags(item)
  const qtyLabel = item.size ? ` · ${item.size}` : ''
  return (
    <button
      onClick={onOpen}
      className="flex w-full items-start gap-3 border-b-[0.5px] border-hairline py-[13px] text-left last:border-b-0"
    >
      {thumb ? (
        <img src={thumb} alt="" className="h-[46px] w-[46px] shrink-0 rounded-[11px] object-cover" />
      ) : (
        <div className="flex h-[46px] w-[46px] shrink-0 flex-col items-center justify-center gap-px rounded-[11px] border-[1.5px] border-dashed border-chevron">
          <IconPhoto size={17} className="text-faint" />
          <span className="text-[8px] text-faint">ไม่มีรูป</span>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-medium">{item.name}</p>
        <p className="mb-[5px] mt-0.5 text-[11px] text-faint">
          ต้นทุน {formatBaht(item.cost_per_unit)}
          {qtyLabel}
        </p>
        <div className="flex flex-wrap items-center gap-[5px]">
          {item.sku && <SkuTag sku={item.sku} />}
          {tags.map((t) => (
            <span
              key={t}
              className="rounded-pill bg-expense-bg px-2 py-0.5 text-[10px] text-expense"
            >
              {t}
            </span>
          ))}
        </div>
      </div>
      <IconChevronRight size={17} className="mt-3.5 shrink-0 text-chevron" />
    </button>
  )
}

function QueueEditSheet({ item, onClose }: { item: StockItem; onClose: () => void }) {
  const { user } = useAuth()
  const update = useUpdateStockItem()
  const toast = useToast()

  const [name, setName] = useState(item.name)
  const [type, setType] = useState(item.category ?? '')
  const [brand, setBrand] = useState(item.brand ?? '')
  const [size, setSize] = useState(item.size ?? '')
  const [color, setColor] = useState(item.color ?? '')
  const [condition, setCondition] = useState<ItemCondition | ''>(item.condition ?? '')
  const [photos, setPhotos] = useState<EditablePhoto[]>([])
  const [uploading, setUploading] = useState(false)

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
    // ผูกกับ id ไม่ใช่ object: refetch-on-focus จะรัน effect ซ้ำแล้วทับรูปที่เพิ่งอัปโหลดแต่ยังไม่เซฟ
  }, [item.id])

  async function onAddPhotos(files: File[]) {
    if (!user) return
    setUploading(true)
    try {
      const paths = await uploadStockPhotos(user.id, item.id, files)
      setPhotos((prev) => [
        ...prev,
        ...paths.map((p, i) => ({ path: p, preview: URL.createObjectURL(files[i]) })),
      ])
    } catch (e) {
      toast.error(translateError(e))
    } finally {
      setUploading(false)
    }
  }

  async function save() {
    try {
      await update.mutateAsync({
        id: item.id,
        name: name.trim(),
        category: type.trim() || null,
        brand: brand.trim() || null,
        size: size.trim() || null,
        color: color.trim() || null,
        condition: (condition || null) as ItemCondition | null,
        photos: photos.map((p) => p.path),
      })
      toast.success('บันทึกรายละเอียดแล้ว')
      onClose()
    } catch (e) {
      toast.error(translateError(e))
    }
  }

  const panelRef = useDialogA11y(onClose)
  const titleId = useId()

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/45 sm:items-center"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[90vh] w-full max-w-md flex-col rounded-t-[22px] bg-white sm:rounded-[22px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-[18px] pb-3 pt-4">
          <p id={titleId} className="text-[16px] font-medium">เติมรายละเอียด</p>
          <button
            aria-label="ปิด"
            onClick={onClose}
            className="-m-2.5 flex h-11 w-11 items-center justify-center rounded-full"
          >
            <IconX size={20} className="text-muted" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-6">
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

          {update.error && (
            <p className="pb-2 text-[12px] text-expense">{translateError(update.error)}</p>
          )}
        </div>

        <div className="px-4 pb-[max(18px,env(safe-area-inset-bottom))] pt-1">
          <button
            onClick={save}
            disabled={!name.trim() || update.isPending}
            className="w-full rounded-btn bg-brand-deep py-3.5 text-[15px] font-medium text-white disabled:opacity-40"
          >
            {update.isPending ? 'กำลังบันทึก…' : 'บันทึกรายละเอียด'}
          </button>
        </div>
      </div>
    </div>
  )
}
