import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  IconBackspace,
  IconCalendar,
  IconCheck,
  IconPlus,
  IconStar,
  IconWallet,
  IconX,
} from '@tabler/icons-react'
import { useCategories, useFavorites, useUpsertFavorite } from '@/hooks/useLookups'
import { useAddTransaction } from '@/hooks/useAddTransaction'
import { useWallets } from '@/hooks/useSettings'
import { categoryIcon } from '@/lib/icons'
import { formatBaht } from '@/lib/format'
import type { TransactionType } from '@/lib/database.types'

const intFmt = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 })

export function AddPage() {
  const navigate = useNavigate()
  const catsQ = useCategories()
  const favQ = useFavorites()
  const walletsQ = useWallets()
  const add = useAddTransaction()
  const saveFav = useUpsertFavorite()

  const [type, setType] = useState<TransactionType>('expense')
  const [amountStr, setAmountStr] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [walletId, setWalletId] = useState<string | null>(null)
  const [favSaved, setFavSaved] = useState(false)

  // Default the wallet to the first one once wallets load (wallet_id is optional
  // in the schema, so if the user has none we simply save without a wallet).
  useEffect(() => {
    if (walletId == null && walletsQ.data && walletsQ.data.length > 0) {
      setWalletId(walletsQ.data[0].id)
    }
  }, [walletsQ.data, walletId])

  // Quick-add chips: categories of the chosen kind, excluding stock categories
  // (those have their own intake flow).
  const categories = useMemo(
    () =>
      (catsQ.data ?? []).filter((c) => c.kind === type && !c.is_stock_category),
    [catsQ.data, type],
  )

  const amount = Number(amountStr || '0')
  const canSave = amount > 0 && !!categoryId && !add.isPending

  function press(key: string) {
    setAmountStr((prev) => {
      if (key === 'back') return prev.slice(0, -1)
      if (key === '.') {
        if (prev.includes('.')) return prev
        return (prev === '' ? '0' : prev) + '.'
      }
      // digit
      if (prev.includes('.')) {
        const [, dec = ''] = prev.split('.')
        if (dec.length >= 2) return prev // max 2 decimals
      }
      if (prev === '0') return key // no leading zero
      if (prev.replace('.', '').length >= 9) return prev // sane cap
      return prev + key
    })
  }

  function switchType(next: TransactionType) {
    setType(next)
    setCategoryId(null)
    setFavSaved(false)
  }

  function pickCategory(id: string) {
    setCategoryId(id)
    setFavSaved(false)
  }

  async function save() {
    if (!canSave) return
    try {
      await add.mutateAsync({ type, amount, categoryId, walletId })
      navigate('/')
    } catch {
      /* error surfaced below via add.error */
    }
  }

  // Save the current entry as a one-tap preset. Label defaults to the category
  // name; the amount is captured only when one has been entered.
  async function saveFavorite() {
    if (!categoryId) return
    const cat = categories.find((c) => c.id === categoryId)
    try {
      await saveFav.mutateAsync({
        label: cat?.name ?? 'รายการโปรด',
        type,
        amount: amount > 0 ? amount : null,
        category_id: categoryId,
      })
      setFavSaved(true)
    } catch {
      /* non-blocking; favorites are optional */
    }
  }

  // amount display split
  const [intRaw, decRaw] = amountStr.split('.')
  const intDisplay = intFmt.format(Number(intRaw || '0'))
  const decSuffix = amountStr.includes('.') ? `.${decRaw ?? ''}` : '.00'

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col bg-white">
      {/* header */}
      <div className="flex items-center justify-between px-[18px] pb-3 pt-4">
        <button aria-label="ปิด" onClick={() => navigate('/')}>
          <IconX size={20} className="text-muted" />
        </button>
        <p className="text-[16px] font-medium">เพิ่มรายการ</p>
        <span className="flex items-center gap-1 rounded-pill bg-mint-tint px-[11px] py-1 text-[12px] text-mint-text">
          <IconCalendar size={13} />
          วันนี้
        </span>
      </div>

      {/* input mode tabs — only "กดเร็ว" is wired for this slice */}
      <div className="mx-4 mb-3.5 flex rounded-[11px] bg-fill p-[3px]">
        <div className="flex-1 rounded-lg bg-mint-tint py-[7px] text-center text-[12px] font-medium text-mint-text">
          กดเร็ว
        </div>
        <button
          disabled
          className="flex-1 py-[7px] text-center text-[12px] text-faint disabled:opacity-100"
        >
          พิมพ์/พูด
        </button>
        <button
          disabled
          className="flex-1 py-[7px] text-center text-[12px] text-faint disabled:opacity-100"
        >
          สแกน
        </button>
      </div>

      {/* จ่าย / รับ */}
      <div className="mb-2 flex justify-center gap-1.5">
        {(['expense', 'income'] as const).map((t) => (
          <button
            key={t}
            onClick={() => switchType(t)}
            className={`rounded-pill px-4 py-[5px] text-[12px] ${
              type === t
                ? 'bg-mint-tint font-medium text-mint-text'
                : 'border-[0.5px] border-hairline text-muted'
            }`}
          >
            {t === 'expense' ? 'จ่าย' : 'รับ'}
          </button>
        ))}
      </div>

      {/* amount */}
      <div className="py-0.5 pb-3.5 text-center">
        <p className="text-[40px] font-medium tracking-[-1px]">
          <span className="text-[26px] text-muted">฿</span>
          {intDisplay}
          <span className="text-muted">{decSuffix}</span>
        </p>
      </div>

      {/* category chips */}
      <div className="no-scrollbar flex gap-[7px] overflow-x-auto px-4 pb-3">
        {categories.map((c) => {
          const Icon = categoryIcon(c.icon)
          const active = c.id === categoryId
          return (
            <button
              key={c.id}
              onClick={() => pickCategory(c.id)}
              className={`flex shrink-0 items-center gap-1 rounded-pill px-[13px] py-[7px] text-[12px] ${
                active
                  ? 'bg-mint-tint font-medium text-mint-text'
                  : 'bg-fill text-muted'
              }`}
            >
              <Icon size={14} />
              {c.name}
            </button>
          )
        })}
        <span className="flex shrink-0 items-center gap-1 rounded-pill bg-fill px-[13px] py-[7px] text-[12px] text-faint">
          <IconPlus size={14} />
          เพิ่ม
        </span>
      </div>

      {/* wallet selector (only when the user has wallets) */}
      {walletsQ.data && walletsQ.data.length > 0 && (
        <div className="no-scrollbar flex items-center gap-[7px] overflow-x-auto px-4 pb-3">
          <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted">
            <IconWallet size={13} />
            กระเป๋า
          </span>
          {walletsQ.data.map((w) => {
            const active = w.id === walletId
            return (
              <button
                key={w.id}
                onClick={() => setWalletId(w.id)}
                className={`shrink-0 rounded-pill px-[13px] py-[6px] text-[12px] ${
                  active
                    ? 'bg-mint-tint font-medium text-mint-text'
                    : 'bg-fill text-muted'
                }`}
              >
                {w.name}
              </button>
            )
          })}
        </div>
      )}

      {/* save current entry as a favorite */}
      {categoryId && (
        <div className="px-4 pb-3">
          <button
            onClick={saveFavorite}
            disabled={saveFav.isPending || favSaved}
            className="flex items-center gap-1 text-[12px] font-medium text-mint-deep disabled:text-faint"
          >
            <IconStar size={13} />
            {favSaved ? 'บันทึกเป็นรายการโปรดแล้ว' : 'บันทึกเป็นรายการโปรด'}
          </button>
        </div>
      )}

      {/* favorites (only when the user has some) */}
      {favQ.data && favQ.data.length > 0 && (
        <div className="px-4 pb-3">
          <p className="mb-[7px] text-[11px] text-muted">
            <IconStar size={12} className="-mb-px mr-1 inline" />
            รายการโปรด
          </p>
          <div className="flex flex-wrap gap-[7px]">
            {favQ.data.map((f) => (
              <button
                key={f.id}
                onClick={() => {
                  setType(f.type)
                  if (f.amount != null) setAmountStr(String(f.amount))
                  setCategoryId(f.category_id)
                }}
                className="rounded-[9px] border-[0.5px] border-hairline bg-fill px-[11px] py-1.5 text-[12px]"
              >
                {f.label}
                {f.amount != null ? ` ${formatBaht(f.amount)}` : ''}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* keypad */}
      <div className="mt-auto">
        <div className="grid grid-cols-3 px-3 pb-2 text-center">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => (
            <KeypadKey key={k} onClick={() => press(k)}>
              {k}
            </KeypadKey>
          ))}
          <KeypadKey onClick={() => press('.')} muted>
            .
          </KeypadKey>
          <KeypadKey onClick={() => press('0')}>0</KeypadKey>
          <KeypadKey onClick={() => press('back')} aria-label="ลบ">
            <IconBackspace size={21} className="mx-auto text-muted" />
          </KeypadKey>
        </div>

        {add.error && (
          <p className="px-4 pb-2 text-center text-[12px] text-expense">
            บันทึกไม่สำเร็จ: {(add.error as Error).message}
          </p>
        )}

        <div className="px-4 pb-[max(18px,env(safe-area-inset-bottom))] pt-1">
          <button
            onClick={save}
            disabled={!canSave}
            className="flex w-full items-center justify-center gap-1 rounded-btn bg-mint-deep py-3.5 text-[15px] font-medium text-white disabled:opacity-40"
          >
            <IconCheck size={17} />
            {add.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
  )
}

function KeypadKey({
  children,
  onClick,
  muted,
  ...rest
}: {
  children: React.ReactNode
  onClick: () => void
  muted?: boolean
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      onClick={onClick}
      className={`rounded-[12px] py-[13px] text-[23px] font-medium active:bg-fill ${
        muted ? 'text-muted' : ''
      }`}
      {...rest}
    >
      {children}
    </button>
  )
}
