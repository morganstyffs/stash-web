import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  IconAdjustmentsHorizontal,
  IconChevronRight,
  IconClipboardList,
  IconHanger,
  IconPackageImport,
  IconSearch,
  IconShirt,
  IconShoe,
} from '@tabler/icons-react'
import { computeStockHero, useStockItems } from '@/hooks/useStock'
import { formatBaht } from '@/lib/format'
import type { StockItem } from '@/lib/database.types'

type StockFilter = 'all' | 'in_stock' | 'sold'
const FILTERS: { key: StockFilter; label: string }[] = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'in_stock', label: 'ในสต็อก' },
  { key: 'sold', label: 'ขายแล้ว' },
]

function thumbIcon(it: StockItem) {
  const hay = `${it.category ?? ''} ${it.name}`
  if (/รองเท้า|shoe|sneaker/i.test(hay)) return IconShoe
  if (/ฮู้ด|hood|กางเกง|pant|jacket|เสื้อคลุม/i.test(hay)) return IconHanger
  return IconShirt
}

export function StockPage() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<StockFilter>('all')
  const { data, isLoading } = useStockItems()

  const items = data?.items ?? []
  const hero = useMemo(() => computeStockHero(items), [items])
  const queueCount = items.filter((it) => it.needs_details).length

  const visible = items.filter((it) => {
    if (filter === 'in_stock') return it.status !== 'sold'
    if (filter === 'sold') return it.status === 'sold'
    return true
  })

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex items-center justify-between px-[18px] pb-3.5 pt-[18px]">
        <p className="text-[17px] font-medium">คลังสินค้า</p>
        <div className="flex items-center gap-3.5">
          <IconSearch size={19} className="text-muted" />
          <IconAdjustmentsHorizontal size={19} className="text-muted" />
          <button aria-label="รับเข้าสต็อก" onClick={() => navigate('/stock/intake')}>
            <IconPackageImport size={20} className="text-mint-deep" />
          </button>
        </div>
      </div>

      {/* value hero */}
      <div className="relative mx-4 mb-3.5 rounded-card bg-mint-deep px-4 py-[15px]">
        <div className="pointer-events-none absolute inset-[5px] rounded-[11px] border-[1.5px] border-dashed border-white/20" />
        <div className="relative flex items-end justify-between">
          <div>
            <p className="text-[11px] text-white/70">มูลค่าสต็อก (ต้นทุน)</p>
            <p className="mt-[3px] text-[26px] font-medium tracking-[-0.5px] text-white">
              {formatBaht(hero.costValue)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-white/70">กำไรที่รอขาย</p>
            <p className="mt-[3px] text-[17px] font-medium text-mint-hero">
              +{formatBaht(hero.pendingProfit)}
            </p>
          </div>
        </div>
      </div>

      {/* queue banner */}
      {queueCount > 0 && (
        <button
          onClick={() => navigate('/stock/queue')}
          className="mx-4 mb-3 flex items-center gap-2.5 rounded-[12px] bg-warn-bg px-3.5 py-2.5 text-left"
        >
          <IconClipboardList size={18} className="shrink-0 text-warn-ink" />
          <span className="flex-1 text-[12px] font-medium text-warn-ink">
            {queueCount} ชิ้นรอเติมรายละเอียด
          </span>
          <IconChevronRight size={16} className="shrink-0 text-warn-ink" />
        </button>
      )}

      {/* filter chips */}
      <div className="no-scrollbar flex gap-[7px] overflow-x-auto px-4 pb-1.5">
        {FILTERS.map((f) => {
          const active = f.key === filter
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`shrink-0 rounded-pill px-[14px] py-1.5 text-[12px] ${
                active
                  ? 'bg-mint-tint font-medium text-mint-text'
                  : 'border-[0.5px] border-hairline text-muted'
              }`}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      {/* list */}
      <div className="px-4 pb-4">
        {visible.length > 0 ? (
          visible.map((it) => (
            <StockRow key={it.id} item={it} thumb={data?.thumbs[it.photos?.[0] ?? '']} />
          ))
        ) : (
          <p className="py-10 text-center text-[13px] text-faint">
            {isLoading ? 'กำลังโหลด…' : 'ยังไม่มีสินค้าในคลัง — แตะไอคอนรับเข้าสต็อกด้านบน'}
          </p>
        )}
      </div>
    </div>
  )
}

function StockRow({ item, thumb }: { item: StockItem; thumb?: string }) {
  const sold = item.status === 'sold'
  const Icon = thumbIcon(item)
  const meta = [item.brand, item.size, item.color].filter(Boolean).join(' · ')
  const profitPer =
    item.target_price != null ? Number(item.target_price) - Number(item.cost_per_unit) : null

  return (
    <div className="flex items-center gap-3 border-b-[0.5px] border-hairline py-[13px] last:border-b-0">
      <div
        className={`flex h-[46px] w-[46px] shrink-0 items-center justify-center overflow-hidden rounded-[11px] ${
          sold ? 'bg-fill opacity-70' : thumb ? 'bg-fill' : 'bg-mint-tint'
        }`}
      >
        {thumb ? (
          <img src={thumb} alt="" className="h-full w-full object-cover" />
        ) : (
          <Icon size={22} className={sold ? 'text-faint' : 'text-mint-deep'} />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className={`truncate text-[13.5px] font-medium ${sold ? 'text-muted' : ''}`}>
          {item.name}
        </p>
        {meta && <p className="mt-0.5 text-[11px] text-faint">{meta}</p>}
        <p className="mt-[3px] text-[11px] text-muted">
          {formatBaht(item.cost_per_unit)}
          {item.target_price != null ? (
            <>
              {' '}
              → <span className="text-ink">{formatBaht(item.target_price)}</span>
            </>
          ) : (
            ' → ตั้งราคาขาย'
          )}
        </p>
      </div>

      <div className="shrink-0 text-right">
        {sold ? (
          <span className="rounded-pill bg-fill px-[9px] py-[3px] text-[11px] font-medium text-muted">
            ขายแล้ว
          </span>
        ) : (
          <span className="rounded-pill bg-mint-tint px-[9px] py-[3px] text-[11px] font-medium text-mint-text">
            ในสต็อก {item.qty_remaining}
          </span>
        )}
        {profitPer != null && !sold && (
          <p className="mt-1.5 text-[12px] text-mint-deep">+{formatBaht(profitPer)}/ชิ้น</p>
        )}
      </div>
    </div>
  )
}
