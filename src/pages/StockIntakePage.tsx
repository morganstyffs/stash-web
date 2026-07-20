import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  IconAlertCircle,
  IconArrowDownRight,
  IconArrowLeft,
  IconCameraPlus,
  IconCheck,
  IconChevronDown,
  IconPlus,
  IconX,
} from '@tabler/icons-react'
import { useAuth } from '@/hooks/useAuth'
import { useCategories } from '@/hooks/useLookups'
import { useStockCount } from '@/hooks/useStock'
import { useCreateStockIntake } from '@/hooks/useStockIntake'
import { uploadStockPhotos } from '@/lib/storage'
import { previewSku } from '@/lib/sku'
import { formatBaht } from '@/lib/format'
import type { ItemCondition } from '@/lib/database.types'

interface Photo {
  path: string
  preview: string
}
interface SessionItem {
  id: string
  name: string
  cost: number
  qty: number
  needsDetails: boolean
}

const CONDITIONS: { key: ItemCondition; label: string }[] = [
  { key: 'new', label: 'ของใหม่' },
  { key: 'used_good', label: 'มือสอง · ดี' },
  { key: 'flawed', label: 'มีตำหนิ' },
]

export function StockIntakePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const catsQ = useCategories()
  const stockCountQ = useStockCount()
  const intake = useCreateStockIntake()
  const fileRef = useRef<HTMLInputElement>(null)

  const stockCategories = useMemo(
    () => (catsQ.data ?? []).filter((c) => c.is_stock_category),
    [catsQ.data],
  )

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
  const [target, setTarget] = useState('')
  const [photos, setPhotos] = useState<Photo[]>([])
  const [folder] = useState(() => crypto.randomUUID())
  const [uploading, setUploading] = useState(false)

  // session (โหมดรวบรวม)
  const [session, setSession] = useState<SessionItem[]>([])
  const sessionCount = session.reduce((n, s) => n + s.qty, 0)
  const sessionCost = session.reduce((n, s) => n + s.cost * s.qty, 0)

  const costNum = Number(cost || '0')
  const qtyNum = Math.max(1, Math.floor(Number(qty || '1')))
  const targetNum = target ? Number(target) : null
  const profit = targetNum != null && costNum > 0 ? targetNum - costNum : null
  const profitPct = profit != null && costNum > 0 ? Math.round((profit / costNum) * 100) : null

  const seq = (stockCountQ.data ?? 0) + session.length + 1
  const sku = previewSku(brand, seq)

  const canSave = name.trim() !== '' && !!categoryId && costNum >= 0 && !intake.isPending

  async function onPickPhotos(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!files.length || !user) return
    setUploading(true)
    try {
      const paths = await uploadStockPhotos(user.id, folder, files)
      setPhotos((prev) => [
        ...prev,
        ...paths.map((p, i) => ({ path: p, preview: URL.createObjectURL(files[i]) })),
      ])
    } catch {
      /* surfaced via generic error text below */
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
    setTarget('')
    setPhotos([])
    setDetailsOpen(false)
  }

  async function save(done: boolean) {
    if (!canSave) return
    const needsDetails =
      !size.trim() || !color.trim() || !condition || targetNum == null || photos.length === 0
    try {
      await intake.mutateAsync({
        p_name: name.trim(),
        p_cost_per_unit: costNum,
        p_qty: qtyNum,
        p_category: type.trim() || null,
        p_category_id: categoryId,
        p_brand: brand.trim() || null,
        p_size: size.trim() || null,
        p_color: color.trim() || null,
        p_condition: (condition || null) as ItemCondition | null,
        p_target_price: targetNum,
        p_photos: photos.map((p) => p.path),
        p_needs_details: needsDetails,
      })
      setSession((prev) => [
        { id: crypto.randomUUID(), name: name.trim(), cost: costNum, qty: qtyNum, needsDetails },
        ...prev,
      ])
      resetItem()
      if (done) navigate('/stock')
    } catch {
      /* intake.error rendered below */
    }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col bg-white">
      {/* header */}
      <div className="flex items-center justify-between px-[18px] pb-3 pt-4">
        <button aria-label="ย้อนกลับ" onClick={() => navigate('/stock')}>
          <IconArrowLeft size={20} className="text-muted" />
        </button>
        <p className="text-[16px] font-medium">รับเข้าสต็อก</p>
        <span className="rounded-pill bg-mint-tint px-[11px] py-1 text-[12px] font-medium text-mint-text">
          โหมดรวบรวม
        </span>
      </div>

      {/* session counter */}
      <div className="relative mx-4 mb-3.5 flex items-center justify-between rounded-[14px] bg-mint-deep px-[15px] py-3">
        <div className="pointer-events-none absolute inset-[5px] rounded-[10px] border-[1.5px] border-dashed border-white/20" />
        <div className="relative">
          <p className="text-[11px] text-white/70">รอบนี้เพิ่มแล้ว</p>
          <p className="mt-0.5 text-[21px] font-medium text-white">{sessionCount} ชิ้น</p>
        </div>
        <div className="relative text-right">
          <p className="text-[11px] text-white/70">ต้นทุนรวม</p>
          <p className="mt-0.5 text-[21px] font-medium text-white">{formatBaht(sessionCost)}</p>
        </div>
      </div>

      {/* core form */}
      <div className="px-4">
        <div className="mb-3 flex gap-[10px]">
          <button
            onClick={() => fileRef.current?.click()}
            className="flex h-[58px] w-[58px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-[11px] border-[1.5px] border-dashed border-chevron"
          >
            <IconCameraPlus size={19} className="text-faint" />
            <span className="text-[9px] text-faint">{uploading ? '…' : 'รูป'}</span>
          </button>
          {photos.map((p) => (
            <div key={p.path} className="relative h-[58px] w-[58px] shrink-0">
              <img
                src={p.preview}
                alt=""
                className="h-full w-full rounded-[11px] object-cover"
              />
              <button
                aria-label="ลบรูป"
                onClick={() => setPhotos((prev) => prev.filter((x) => x.path !== p.path))}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink text-white"
              >
                <IconX size={12} />
              </button>
            </div>
          ))}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={onPickPhotos}
          />
          <div className="flex-1">
            <Label>ชื่อสินค้า</Label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="เช่น เสื้อ Carhartt น้ำตาล"
              className="h-[58px] w-full rounded-input border-[0.5px] border-hairline bg-fill px-[11px] text-[13px] outline-none placeholder:text-faint focus:border-mint"
            />
          </div>
        </div>

        <div className="mb-3 flex gap-[10px]">
          <div className="flex-[1.3]">
            <Label>หมวด</Label>
            <div className="relative">
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full appearance-none rounded-input border-[0.5px] border-hairline bg-fill px-[11px] py-[10px] text-[13px] outline-none focus:border-mint"
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
              className="w-full rounded-input border-[0.5px] border-hairline bg-fill px-[11px] py-[10px] text-[13px] outline-none focus:border-mint"
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
            รายละเอียดเพิ่มเติม (ไซซ์ · สี · สภาพ · ราคาขาย)
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
                <Field value={type} onChange={setType} placeholder="เช่น เสื้อยืด" />
              </div>
              <div className="flex-1">
                <Label>แบรนด์</Label>
                <Field value={brand} onChange={setBrand} placeholder="Nike" />
              </div>
            </div>
            <div className="mb-3 flex gap-[10px]">
              <div className="flex-1">
                <Label>ไซซ์</Label>
                <Field value={size} onChange={setSize} placeholder="L" />
              </div>
              <div className="flex-1">
                <Label>สี</Label>
                <Field value={color} onChange={setColor} placeholder="เขียว" />
              </div>
            </div>
            <div className="mb-3">
              <Label>สภาพ</Label>
              <div className="flex gap-[7px]">
                {CONDITIONS.map((c) => {
                  const active = condition === c.key
                  return (
                    <button
                      key={c.key}
                      onClick={() => setCondition(active ? '' : c.key)}
                      className={`rounded-pill px-[14px] py-1.5 text-[12px] ${
                        active
                          ? 'bg-mint-tint font-medium text-mint-text'
                          : 'border-[0.5px] border-hairline text-muted'
                      }`}
                    >
                      {c.label}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="mb-3">
              <Label>ราคาตั้งขาย/ชิ้น</Label>
              <div className="flex items-center justify-between rounded-input border-[0.5px] border-hairline bg-fill px-[11px] py-[10px]">
                <div className="flex items-center">
                  <span className="mr-1 text-[13px] text-faint">฿</span>
                  <input
                    value={target}
                    onChange={(e) => setTarget(e.target.value.replace(/[^0-9.]/g, ''))}
                    inputMode="decimal"
                    placeholder="0"
                    className="w-24 bg-transparent text-[13px] outline-none placeholder:text-faint"
                  />
                </div>
                {profit != null && profit >= 0 && (
                  <span className="rounded-pill bg-mint-tint px-[10px] py-[3px] text-[11px] font-medium text-mint-text">
                    กำไร {formatBaht(profit)} · {profitPct}%
                  </span>
                )}
              </div>
            </div>
            <div className="mb-1">
              <Label>
                SKU <span className="text-mint-deep">(สร้างอัตโนมัติ)</span>
              </Label>
              <div className="rounded-input border-[0.5px] border-hairline bg-fill px-[11px] py-[10px] font-mono text-[13px] text-muted">
                {sku}
              </div>
            </div>
          </div>
        )}
      </div>

      {intake.error && (
        <p className="px-4 pt-1 text-[12px] text-expense">
          บันทึกไม่สำเร็จ: {(intake.error as Error).message}
        </p>
      )}

      {/* actions */}
      <div className="flex gap-[9px] px-4 pb-4 pt-2">
        <button
          onClick={() => save(false)}
          disabled={!canSave}
          className="flex flex-1 items-center justify-center gap-1 rounded-[13px] bg-mint-deep py-[13px] text-[14px] font-medium text-white disabled:opacity-40"
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

      {/* recent this session */}
      {session.length > 0 && (
        <div className="border-t-[0.5px] border-hairline px-4 pb-6 pt-3">
          <p className="mb-2.5 text-[12px] text-muted">เพิ่มล่าสุดรอบนี้</p>
          {session.map((s) => (
            <div key={s.id} className="mb-2.5 flex items-center gap-[10px] last:mb-0">
              <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] bg-mint-tint">
                <IconCheck size={17} className="text-mint-deep" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px]">{s.name}</p>
                <p className="mt-px text-[10.5px]">
                  {s.needsDetails ? (
                    <span className="text-warn">
                      <IconAlertCircle size={12} className="-mb-0.5 mr-0.5 inline" />
                      รอเติมรูป/รายละเอียด
                    </span>
                  ) : (
                    <span className="text-faint">
                      {formatBaht(s.cost)} · ลงสต็อก + รายจ่ายแล้ว
                    </span>
                  )}
                </p>
              </div>
              <IconCheck size={16} className="shrink-0 text-mint-deep" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="mb-1 ml-0.5 text-[11px] text-faint">{children}</p>
}

function Field({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-input border-[0.5px] border-hairline bg-fill px-[11px] py-[10px] text-[13px] outline-none placeholder:text-faint focus:border-mint"
    />
  )
}
