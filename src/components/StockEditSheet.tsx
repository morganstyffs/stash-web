import { useEffect, useState } from 'react'
import { IconArrowBackUp, IconTag, IconTrash, IconX } from '@tabler/icons-react'
import { useAuth } from '@/hooks/useAuth'
import { useUpdateStockItem } from '@/hooks/useQueue'
import { useDeleteStockItem } from '@/hooks/useStock'
import { useWallets } from '@/hooks/useSettings'
import { useCreateStockSale, useReverseStockSale } from '@/hooks/useStockSale'
import { useItemSales } from '@/hooks/useStockSales'
import { useToast } from '@/components/Toast'
import { signStockPhotos, uploadStockPhotos } from '@/lib/storage'
import { toISODate } from '@/lib/dates'
import { formatBaht, formatDayShort } from '@/lib/format'
import { translateError } from '@/lib/errors'
import {
  ConditionChips,
  Label,
  PhotoEditor,
  TextInput,
  type EditablePhoto,
} from '@/components/StockFields'
import type { ItemCondition, StockItem } from '@/lib/database.types'

/**
 * Edit / sell / delete a single stock item. Selling and reversing go through the
 * atomic stock_sale_create / stock_sale_reverse RPCs (0012). Deletion goes
 * through stock_item_delete and is blocked once the item has sales history —
 * reverse the sales first. cost_per_unit / qty_total are frozen after a sale (DB
 * trigger), so they are shown read-only here once `hasSales`.
 */
export function StockEditSheet({
  item,
  hasSales,
  onClose,
}: {
  item: StockItem
  hasSales: boolean
  onClose: () => void
}) {
  const { user } = useAuth()
  const update = useUpdateStockItem()
  const del = useDeleteStockItem()
  const walletsQ = useWallets()
  const sell = useCreateStockSale()
  const reverse = useReverseStockSale()
  const salesQ = useItemSales(item.id)
  const toast = useToast()

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

  // sell panel
  const today = toISODate(new Date())
  const [sellOpen, setSellOpen] = useState(false)
  const [sellQty, setSellQty] = useState('1')
  const [sellPrice, setSellPrice] = useState(item.target_price != null ? String(item.target_price) : '')
  const [sellDate, setSellDate] = useState(today)
  const [sellWallet, setSellWallet] = useState<string | null>(null)
  const [confirmingZero, setConfirmingZero] = useState(false)
  const [reversingId, setReversingId] = useState<string | null>(null)

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
        target_price: target ? Number(target) : null,
        photos: photos.map((p) => p.path),
      })
      toast.success('บันทึกรายละเอียดแล้ว')
      onClose()
    } catch (e) {
      // Keep the sheet open so the user can retry without re-typing.
      toast.error(translateError(e))
    }
  }

  async function remove() {
    try {
      await del.mutateAsync(item.id)
      onClose()
    } catch (e) {
      // Keep the sheet open on failure so nothing looks half-deleted.
      toast.error(translateError(e))
    }
  }

  const remaining = item.qty_remaining
  const cost = Number(item.cost_per_unit) || 0
  const sellQtyNum = Math.max(0, Math.floor(Number(sellQty || '0')))
  const sellPriceNum = sellPrice === '' ? null : Number(sellPrice)
  const sellProfit =
    sellPriceNum != null ? (sellPriceNum - cost) * (sellQtyNum || 0) : null
  const canSell =
    sellQtyNum >= 1 &&
    sellQtyNum <= remaining &&
    sellPriceNum != null &&
    sellPriceNum >= 0 &&
    !sell.isPending

  async function doSell() {
    if (!canSell || sellPriceNum == null) return
    // zero price needs an explicit confirm (giveaway / freebie).
    if (sellPriceNum === 0 && !confirmingZero) {
      setConfirmingZero(true)
      return
    }
    try {
      await sell.mutateAsync({
        p_item_id: item.id,
        p_qty: sellQtyNum,
        p_sale_price: sellPriceNum,
        p_wallet_id: sellWallet,
        p_sale_date: sellDate || today,
      })
      toast.success('บันทึกการขายแล้ว')
      onClose()
    } catch (e) {
      toast.error(translateError(e))
    }
  }

  async function doReverse(saleId: string) {
    try {
      await reverse.mutateAsync(saleId)
      toast.success('ย้อนการขายแล้ว')
      onClose()
    } catch (e) {
      toast.error(translateError(e))
    }
  }

  const busy = update.isPending || del.isPending
  const sales = salesQ.data ?? []

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
            ต้นทุน {formatBaht(item.cost_per_unit)} · คงเหลือ {remaining}/{item.qty_total} · SKU{' '}
            <span className="font-mono">{item.sku ?? '—'}</span>
            {hasSales && <span className="ml-1 text-warn">· ขายแล้ว (ต้นทุน/จำนวนล็อก)</span>}
          </p>

          {/* ── sell ─────────────────────────────────────────────── */}
          {remaining > 0 && (
            <div className="mb-3">
              {!sellOpen ? (
                <button
                  onClick={() => setSellOpen(true)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-btn bg-mint-deep py-3 text-[14px] font-medium text-white"
                >
                  <IconTag size={16} />
                  ขายสินค้า (เหลือ {remaining})
                </button>
              ) : (
                <div className="rounded-card border-[0.5px] border-hairline bg-fill p-3">
                  <div className="mb-2.5 flex gap-[10px]">
                    <div className="flex-1">
                      <Label>จำนวนที่ขาย</Label>
                      <input
                        value={sellQty}
                        onChange={(e) => {
                          setSellQty(e.target.value.replace(/[^0-9]/g, ''))
                          setConfirmingZero(false)
                        }}
                        inputMode="numeric"
                        className="w-full rounded-input border-[0.5px] border-hairline bg-white px-[11px] py-[9px] text-[13px] outline-none focus:border-mint"
                      />
                    </div>
                    <div className="flex-1">
                      <Label>ราคาขาย/ชิ้น</Label>
                      <div className="flex items-center rounded-input border-[0.5px] border-hairline bg-white px-[11px] py-[9px]">
                        <span className="mr-1 text-[13px] text-faint">฿</span>
                        <input
                          value={sellPrice}
                          onChange={(e) => {
                            setSellPrice(e.target.value.replace(/[^0-9.]/g, ''))
                            setConfirmingZero(false)
                          }}
                          inputMode="decimal"
                          placeholder="0"
                          className="w-full bg-transparent text-[13px] outline-none placeholder:text-faint"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mb-2.5 flex gap-[10px]">
                    <div className="flex-1">
                      <Label>วันที่ขาย</Label>
                      <input
                        type="date"
                        value={sellDate}
                        max={today}
                        onChange={(e) => setSellDate(e.target.value || today)}
                        className="w-full rounded-input border-[0.5px] border-hairline bg-white px-[11px] py-[8px] text-[13px] outline-none focus:border-mint"
                      />
                    </div>
                    {walletsQ.data && walletsQ.data.length > 0 && (
                      <div className="flex-1">
                        <Label>กระเป๋า</Label>
                        <select
                          value={sellWallet ?? ''}
                          onChange={(e) => setSellWallet(e.target.value || null)}
                          className="w-full rounded-input border-[0.5px] border-hairline bg-white px-[11px] py-[9px] text-[13px] outline-none focus:border-mint"
                        >
                          <option value="">— ไม่ระบุ —</option>
                          {walletsQ.data.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {sellProfit != null && sellQtyNum >= 1 && (
                    <p className="mb-2 text-[12px] text-muted">
                      กำไร{' '}
                      <span className={sellProfit >= 0 ? 'text-mint-deep' : 'text-expense'}>
                        {sellProfit >= 0 ? '+' : '-'}
                        {formatBaht(Math.abs(sellProfit))}
                      </span>{' '}
                      ({formatBaht(cost)} → {formatBaht(sellPriceNum ?? 0)}/ชิ้น)
                    </p>
                  )}
                  {sellQtyNum > remaining && (
                    <p className="mb-2 text-[12px] text-expense">ขายเกินจำนวนคงเหลือ ({remaining})</p>
                  )}
                  {confirmingZero && (
                    <p className="mb-2 text-[12px] text-warn">ราคา 0 บาท — ยืนยันแจกฟรี? กด “ขาย” อีกครั้ง</p>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setSellOpen(false)
                        setConfirmingZero(false)
                      }}
                      disabled={sell.isPending}
                      className="flex-1 rounded-btn border-[0.5px] border-hairline py-2.5 text-[13px] font-medium disabled:opacity-40"
                    >
                      ยกเลิก
                    </button>
                    <button
                      onClick={doSell}
                      disabled={!canSell}
                      className="flex-1 rounded-btn bg-mint-deep py-2.5 text-[13px] font-medium text-white disabled:opacity-40"
                    >
                      {sell.isPending ? 'กำลังบันทึก…' : confirmingZero ? 'ยืนยันขาย ฿0' : 'ขาย'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── sales history ────────────────────────────────────── */}
          {sales.length > 0 && (
            <div className="mb-3 rounded-card border-[0.5px] border-hairline p-3">
              <p className="mb-2 text-[11px] font-medium text-muted">ประวัติการขาย</p>
              {sales.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-2 border-b-[0.5px] border-hairline py-2 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px]">
                      {s.qty_sold} ชิ้น × {formatBaht(s.sale_price)}
                    </p>
                    <p className="mt-px text-[10.5px] text-faint">
                      {formatDayShort(new Date(s.sold_on + 'T00:00:00'))} · กำไร{' '}
                      <span className={s.profit >= 0 ? 'text-mint-deep' : 'text-expense'}>
                        {s.profit >= 0 ? '+' : '-'}
                        {formatBaht(Math.abs(s.profit))}
                      </span>
                    </p>
                  </div>
                  {reversingId === s.id ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => doReverse(s.id)}
                        disabled={reverse.isPending}
                        className="rounded-btn bg-expense px-2.5 py-1.5 text-[11px] font-medium text-white disabled:opacity-40"
                      >
                        {reverse.isPending ? '…' : 'ยืนยันย้อน'}
                      </button>
                      <button
                        onClick={() => setReversingId(null)}
                        disabled={reverse.isPending}
                        className="rounded-btn border-[0.5px] border-hairline px-2 py-1.5 text-[11px] disabled:opacity-40"
                      >
                        ยกเลิก
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setReversingId(s.id)}
                      className="flex shrink-0 items-center gap-1 text-[11.5px] font-medium text-expense"
                    >
                      <IconArrowBackUp size={14} />
                      ย้อน
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── edit fields ──────────────────────────────────────── */}
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

          {/* save/delete failures now surface via toast (translateError) — see
              save()/remove(); no raw upstream message is rendered here. */}

          {/* delete — blocked once the item has sales (reverse first) */}
          {hasSales ? (
            <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-faint">
              <IconTrash size={15} />
              มีประวัติการขาย — ย้อนการขายทั้งหมดก่อนจึงจะลบได้
            </p>
          ) : confirmingDelete ? (
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
