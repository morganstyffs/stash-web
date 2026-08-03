import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  IconAlertCircle,
  IconArrowDownRight,
  IconArrowLeft,
  IconChevronDown,
  IconPlus,
} from '@tabler/icons-react'
import { useAuth } from '@/hooks/useAuth'
import { useCategories } from '@/hooks/useLookups'
import { useCreateStockIntake } from '@/hooks/useStockIntake'
import { useStockItems } from '@/hooks/useStock'
import { useSkuPreview } from '@/hooks/useSku'
import { StockEditSheet } from '@/components/StockEditSheet'
import { SkuTag } from '@/pages/StockPage'
import { useToast } from '@/components/Toast'
import { uploadStockPhotos } from '@/lib/storage'
import { formatBaht } from '@/lib/format'
import { translateError } from '@/lib/errors'
import {
  ConditionChips,
  Label,
  PhotoEditor,
  TextInput,
  computeNeedsDetails,
  type EditablePhoto,
} from '@/components/StockFields'
import type { ItemCondition } from '@/lib/db'

interface SessionItem {
  id: string // real stock_items.id (from the intake RPC's return, not a local UUID)
  sku: string // real committed SKU (same source), not the approximate preview
  name: string
  cost: number
  qty: number
  needsDetails: boolean
}

export function StockIntakePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const catsQ = useCategories()
  const intake = useCreateStockIntake()
  const toast = useToast()

  const stockCategories = useMemo(
    () => (catsQ.data ?? []).filter((c) => c.is_stock_category),
    [catsQ.data],
  )
  // F-16: intake needs at least one stock category. Without one the dropdown is
  // empty and saving is impossible with no explanation — show a way out instead.
  const noStockCategory = !catsQ.isLoading && stockCategories.length === 0

  // form
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [qty, setQty] = useState('1')
  const [cost, setCost] = useState('')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [type, setType] = useState('') // free-text ประเภท
  const [brand, setBrand] = useState('')
  const [size, setSize] = useState('')
  const [color, setColor] = useState('')
  const [condition, setCondition] = useState<ItemCondition | ''>('')
  const [photos, setPhotos] = useState<EditablePhoto[]>([])
  const [folder] = useState(() => crypto.randomUUID())
  const [uploading, setUploading] = useState(false)

  // session (โหมดรวบรวม)
  const [session, setSession] = useState<SessionItem[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const stockQ = useStockItems()
  const sessionCount = session.reduce((n, s) => n + s.qty, 0)
  const sessionCost = session.reduce((n, s) => n + s.cost * s.qty, 0)

  // Keep the session strip honest if an item gets deleted from the edit sheet —
  // prune anything that no longer exists once we have a fresh read, rather than
  // showing a tag for a row that's gone.
  useEffect(() => {
    if (!stockQ.data) return
    const liveIds = new Set(stockQ.data.items.map((i) => i.id))
    setSession((prev) => prev.filter((s) => liveIds.has(s.id)))
  }, [stockQ.data])

  const costNum = Number(cost || '0')
  const qtyNum = Math.max(1, Math.floor(Number(qty || '1')))

  // Live SKU preview from the DB (approximate — see useSkuPreview). The SKU no
  // longer encodes the brand (0025), so this doesn't depend on the brand field.
  const skuQ = useSkuPreview()

  const canSave = name.trim() !== '' && !!categoryId && costNum >= 0 && !intake.isPending

  async function onAddPhotos(files: File[]) {
    if (!user) return
    setUploading(true)
    try {
      const paths = await uploadStockPhotos(user.id, folder, files)
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

  function resetItem() {
    setName('')
    setQty('1')
    setCost('')
    setType('')
    setBrand('')
    setSize('')
    setColor('')
    setCondition('')
    setPhotos([])
    setDetailsOpen(false)
  }

  async function save(done: boolean) {
    if (!canSave) return
    const needsDetails = computeNeedsDetails({
      size,
      color,
      condition,
      photoCount: photos.length,
    })
    try {
      const result = await intake.mutateAsync({
        p_name: name.trim(),
        p_cost_per_unit: costNum,
        p_qty: qtyNum,
        p_category: type.trim() || undefined,
        p_category_id: categoryId,
        p_brand: brand.trim() || undefined,
        p_size: size.trim() || undefined,
        p_color: color.trim() || undefined,
        p_condition: condition || undefined,
        p_photos: photos.map((p) => p.path),
        p_needs_details: needsDetails,
      })
      setSession((prev) => [
        { id: result.stock_item_id, sku: result.sku, name: name.trim(), cost: costNum, qty: qtyNum, needsDetails },
        ...prev,
      ])
      resetItem()
      toast.success(done ? 'บันทึกเข้าสต็อกแล้ว' : 'บันทึกแล้ว — เพิ่มชิ้นต่อได้เลย')
      if (done) navigate('/stock')
    } catch (e) {
      toast.error(translateError(e))
    }
  }

  if (noStockCategory) {
    return (
      <div className="mx-auto flex min-h-full max-w-md flex-col bg-white">
        <div className="flex items-center justify-between px-[18px] pb-3 pt-4">
          <button aria-label="ย้อนกลับ" onClick={() => navigate('/stock')}>
            <IconArrowLeft size={20} className="text-muted" />
          </button>
          <p className="text-[16px] font-medium">รับเข้าสต็อก</p>
          <span className="w-5" />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center px-8 pb-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-tint">
            <IconAlertCircle size={26} className="text-brand-deep" />
          </div>
          <p className="text-[15px] font-medium">ยังไม่มีหมวดเติมสต็อก</p>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            ต้องมีอย่างน้อย 1 หมวดที่ตั้งบทบาทเป็น “เติมสต็อก” ก่อนถึงจะรับของเข้าคลังได้ — ไปที่หน้าตั้งค่า
            สร้างหมวดใหม่ แล้วเลือกบทบาท “เติมสต็อก”
          </p>
          <button
            onClick={() => navigate('/settings')}
            className="mt-5 rounded-btn bg-brand-deep px-6 py-3 text-[14px] font-medium text-white"
          >
            ไปสร้างหมวดเติมสต็อก
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col bg-white">
      {/* header */}
      <div className="flex items-center justify-between px-[18px] pb-3 pt-4">
        <button aria-label="ย้อนกลับ" onClick={() => navigate('/stock')}>
          <IconArrowLeft size={20} className="text-muted" />
        </button>
        <p className="text-[16px] font-medium">รับเข้าสต็อก</p>
        <span className="rounded-pill bg-brand-tint px-[11px] py-1 text-[12px] font-medium text-brand-ink">
          โหมดรวบรวม
        </span>
      </div>

      {/* session rail — same fabric as the STOCK label everywhere else, so this
          screen visually ties to the cabinet it's filling */}
      <div className="woven relative mx-4 mb-3.5 overflow-hidden rounded-[14px] bg-brand-fabric-stock text-brand-thread shadow-card">
        <span aria-hidden className="selvedge absolute inset-x-0 top-0 h-[6px]" />
        <span aria-hidden className="selvedge absolute inset-x-0 bottom-0 h-[6px]" />
        <div className="relative flex items-center justify-between px-[15px] py-3">
          <div>
            <p className="text-[11px] opacity-[.84]">รอบนี้เพิ่มแล้ว</p>
            <p className="mt-0.5 text-[21px] font-medium">{sessionCount} ชิ้น</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] opacity-[.84]">ต้นทุนรวม</p>
            <p className="mt-0.5 text-[21px] font-medium">{formatBaht(sessionCost)}</p>
          </div>
        </div>
      </div>

      {/* core form */}
      <div className="px-4">
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
          <TextInput value={name} onChange={setName} placeholder="เช่น เสื้อ Carhartt น้ำตาล" />
        </div>

        <div className="mb-3 flex items-center gap-2 rounded-[8px] border-[1.5px] border-dashed border-chevron bg-surface px-[10px] py-2">
          <span className="woven rounded-[4px] bg-brand-fabric-stock px-[7px] py-[3px] font-mono text-[9.5px] font-medium tracking-wide text-brand-thread">
            {skuQ.data ?? '…'}
          </span>
          <span className="text-[11px] text-faint">เลขที่จะได้ (โดยประมาณ) · เลขจริงออกตอนกดบันทึก</span>
        </div>

        <div className="mb-3 flex gap-[10px]">
          <div className="flex-[1.3]">
            <Label>หมวด</Label>
            <div className="relative">
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full appearance-none rounded-input border-[0.5px] border-hairline bg-fill px-[11px] py-[10px] text-[13px] outline-none focus:border-brand"
              >
                <option value="" disabled>
                  เลือกหมวด
                </option>
                {stockCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <IconChevronDown
                size={14}
                className="pointer-events-none absolute right-[11px] top-1/2 -translate-y-1/2 text-faint"
              />
            </div>
          </div>
          <div className="flex-1">
            <Label>จำนวน</Label>
            <input
              value={qty}
              onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, ''))}
              inputMode="numeric"
              className="w-full rounded-input border-[0.5px] border-hairline bg-fill px-[11px] py-[10px] text-[13px] outline-none focus:border-brand"
            />
          </div>
        </div>

        <div className="mb-3">
          <Label>ต้นทุน/ชิ้น</Label>
          <div className="flex items-center rounded-input border-[0.5px] border-hairline bg-fill px-[11px] py-[10px]">
            <span className="mr-1 text-[13px] text-faint">฿</span>
            <input
              value={cost}
              onChange={(e) => setCost(e.target.value.replace(/[^0-9.]/g, ''))}
              inputMode="decimal"
              placeholder="0"
              className="w-full bg-transparent text-[13px] outline-none placeholder:text-faint"
            />
            <span className="whitespace-nowrap text-[11px] text-faint">
              <IconArrowDownRight size={13} className="-mb-0.5 mr-0.5 inline text-expense" />
              ลงรายจ่ายอัตโนมัติ
            </span>
          </div>
        </div>

        {/* expandable details */}
        <button
          onClick={() => setDetailsOpen((v) => !v)}
          className="flex w-full items-center justify-between py-1 pb-3.5"
        >
          <span className="text-[12.5px] text-muted">
            <IconPlus size={14} className="-mb-0.5 mr-0.5 inline" />
            รายละเอียดเพิ่มเติม (ไซซ์ · สี · สภาพ)
          </span>
          <IconChevronDown
            size={16}
            className={`text-faint transition-transform ${detailsOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {detailsOpen && (
          <div className="pb-2">
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
          </div>
        )}
      </div>

      {intake.error && (
        <p className="px-4 pt-1 text-[12px] text-expense">{translateError(intake.error)}</p>
      )}

      {/* actions */}
      <div className="flex gap-[9px] px-4 pb-4 pt-2">
        <button
          onClick={() => save(false)}
          disabled={!canSave}
          className="flex flex-1 items-center justify-center gap-1 rounded-[13px] bg-brand-deep py-[13px] text-[14px] font-medium text-white disabled:opacity-40"
        >
          <IconPlus size={16} />
          {intake.isPending ? 'กำลังบันทึก…' : 'บันทึก + เพิ่มต่อ'}
        </button>
        <button
          onClick={() => save(true)}
          disabled={!canSave}
          className="shrink-0 rounded-[13px] border-[0.5px] border-chevron px-[18px] py-[13px] text-[14px] font-medium disabled:opacity-40"
        >
          เสร็จ
        </button>
      </div>

      {/* recent this session — a strand of woven SKU tags. Tap one to fix a typo
          without leaving the batch-intake flow (cost/qty stay read-only here, same
          as everywhere else StockEditSheet is used — this isn't a new limitation). */}
      {session.length > 0 && (
        <div className="border-t-[0.5px] border-hairline px-4 pb-6 pt-3">
          <p className="mb-2.5 text-[12px] text-muted">เพิ่มล่าสุดรอบนี้ · แตะเพื่อแก้ไข</p>
          <div className="relative pl-[7px]">
            <div
              aria-hidden
              className="absolute bottom-2 left-0 top-1 w-[2px]"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(180deg, rgb(var(--color-chevron)) 0 4px, transparent 4px 8px)',
              }}
            />
            {session.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setEditingId(s.id)}
                className="mb-2.5 flex w-full items-center gap-[10px] pl-[13px] text-left last:mb-0"
              >
                <span
                  aria-hidden
                  className={`absolute h-2 w-2 shrink-0 rounded-full ${s.needsDetails ? 'bg-warn' : 'bg-brand-deep'}`}
                  style={{ marginLeft: '-13px' }}
                />
                <span className="flex min-w-0 flex-1 items-center gap-2 rounded-[9px] bg-surface px-2.5 py-[7px]">
                  <SkuTag sku={s.sku} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px]">{s.name}</span>
                    {s.needsDetails ? (
                      <span className="mt-px block text-[10.5px] text-warn">
                        <IconAlertCircle size={11} className="-mb-0.5 mr-0.5 inline" />
                        รอเติมรูป/รายละเอียด
                      </span>
                    ) : (
                      <span className="mt-px block text-[10.5px] text-faint">
                        {formatBaht(s.cost)} · ลงสต็อก + รายจ่ายแล้ว
                      </span>
                    )}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {editingId &&
        (() => {
          const item = stockQ.data?.items.find((i) => i.id === editingId)
          if (!item) return null // rare race right after save, before the invalidated
          // query refetches — closes silently rather than crash
          return (
            <StockEditSheet
              item={item}
              hasSales={(stockQ.data?.salesCount?.[item.id] ?? 0) > 0}
              onClose={() => setEditingId(null)}
            />
          )
        })()}
    </div>
  )
}
