import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  IconBox,
  IconCategory,
  IconChevronRight,
  IconCurrencyBaht,
  IconInfoCircle,
  IconLogout,
  IconReportMoney,
  IconRepeat,
  IconSparkles,
  IconStar,
  IconTag,
  IconWallet,
  IconWand,
} from '@tabler/icons-react'
import { Toggle } from '@/components/ui'
import { CategoriesManager } from '@/components/CategoriesManager'
import { WalletsManager } from '@/components/WalletsManager'
import { FavoritesManager } from '@/components/FavoritesManager'
import { useAuth } from '@/hooks/useAuth'
import { useCategories, useFavorites } from '@/hooks/useLookups'
import { useRecurringCount, useWallets } from '@/hooks/useSettings'
import { loadAiPrefs, saveAiPrefs, type AiPrefs } from '@/lib/prefs'

export function SettingsPage() {
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const { data: categories } = useCategories()
  const { data: wallets } = useWallets()
  const { data: favorites } = useFavorites()
  const { data: recurringCount } = useRecurringCount()

  const [manager, setManager] = useState<'categories' | 'wallets' | 'favorites' | null>(null)
  const [ai, setAi] = useState<AiPrefs>(() => loadAiPrefs())

  function setAiPref(patch: Partial<AiPrefs>) {
    const next = { ...ai, ...patch }
    setAi(next)
    saveAiPrefs(next)
  }

  const stockCatNames = useMemo(
    () =>
      (categories ?? [])
        .filter((c) => c.is_stock_category)
        .map((c) => c.name)
        .join(', '),
    [categories],
  )

  return (
    <div className="flex min-h-full flex-col">
      <div className="px-[18px] pb-3.5 pt-[18px]">
        <p className="text-[17px] font-medium">ตั้งค่า</p>
      </div>

      <Group title="ทั่วไป">
        <Row
          icon={IconCategory}
          label="หมวดหมู่"
          value={`${categories?.length ?? 0} หมวด`}
          onClick={() => setManager('categories')}
        />
        <Row
          icon={IconWallet}
          label="กระเป๋าเงิน"
          value={`${wallets?.length ?? 0} บัญชี`}
          onClick={() => setManager('wallets')}
        />
        <Row
          icon={IconStar}
          label="รายการโปรด"
          value={`${favorites?.length ?? 0} รายการ`}
          onClick={() => setManager('favorites')}
        />
        <Row
          icon={IconReportMoney}
          label="งบประมาณ"
          onClick={() => navigate('/budget')}
        />
        <Row icon={IconCurrencyBaht} label="สกุลเงิน" value="บาท (฿)" last />
      </Group>

      <Group title="สต็อก">
        <Row
          icon={IconBox}
          iconTint
          label="หมวดที่ลงสต็อกอัตโนมัติ"
          sub={stockCatNames || 'ยังไม่ได้ตั้ง'}
          onClick={() => setManager('categories')}
        />
        <Row icon={IconTag} label="รูปแบบ SKU" value="STZ-" mono last />
      </Group>

      <Group title="รายการประจำ · ผู้ช่วย AI">
        <Row
          icon={IconRepeat}
          label="รายการประจำ"
          value={`${recurringCount ?? 0} รายการ`}
        />
        <ToggleRow
          icon={IconSparkles}
          iconTint
          label="ใช้ผู้ช่วย AI"
          on={ai.assistant}
          onChange={(v) => setAiPref({ assistant: v })}
        />
        <ToggleRow
          icon={IconWand}
          label="จัดหมวดอัตโนมัติ"
          on={ai.autoCategory}
          onChange={(v) => setAiPref({ autoCategory: v })}
          last
        />
        <div className="flex items-start gap-2 pb-3.5 pt-1">
          <IconInfoCircle size={15} className="mt-px shrink-0 text-faint" />
          <p className="text-[11px] leading-relaxed text-faint">
            เมื่อเปิด AI ข้อความธุรกรรมจะถูกส่งผ่านโมเดลตอนแชท ปิดได้ทุกเมื่อ (ยังไม่เปิดใช้จริงในเวอร์ชันนี้)
          </p>
        </div>
      </Group>

      <div className="px-4 pb-6 pt-2">
        <button
          onClick={() => signOut()}
          className="flex w-full items-center justify-center gap-2 rounded-btn border-[0.5px] border-hairline py-3 text-[14px] font-medium text-expense"
        >
          <IconLogout size={17} />
          ออกจากระบบ
        </button>
      </div>

      {manager === 'categories' && <CategoriesManager onClose={() => setManager(null)} />}
      {manager === 'wallets' && <WalletsManager onClose={() => setManager(null)} />}
      {manager === 'favorites' && <FavoritesManager onClose={() => setManager(null)} />}
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <p className="mb-1 mt-2 px-[18px] text-[11px] uppercase tracking-[0.5px] text-faint">
        {title}
      </p>
      <div className="px-4">{children}</div>
    </>
  )
}

type IconType = typeof IconWallet

function RowShell({
  icon: Icon,
  iconTint,
  last,
  children,
  onClick,
}: {
  icon: IconType
  iconTint?: boolean
  last?: boolean
  children: React.ReactNode
  onClick?: () => void
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      className={`flex w-full items-center gap-3 py-3 text-left ${
        last ? '' : 'border-b-[0.5px] border-hairline'
      }`}
    >
      <div
        className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] ${
          iconTint ? 'bg-mint-tint' : 'bg-fill'
        }`}
      >
        <Icon size={16} className={iconTint ? 'text-mint-deep' : 'text-muted'} />
      </div>
      {children}
    </Tag>
  )
}

function Row({
  icon,
  iconTint,
  label,
  value,
  sub,
  mono,
  last,
  onClick,
}: {
  icon: IconType
  iconTint?: boolean
  label: string
  value?: string
  sub?: string
  mono?: boolean
  last?: boolean
  onClick?: () => void
}) {
  return (
    <RowShell icon={icon} iconTint={iconTint} last={last} onClick={onClick}>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px]">{label}</p>
        {sub && <p className="mt-px truncate text-[11px] text-faint">{sub}</p>}
      </div>
      {value && (
        <span className={`text-[12px] text-faint ${mono ? 'font-mono' : ''}`}>{value}</span>
      )}
      {onClick && <IconChevronRight size={16} className="text-chevron" />}
    </RowShell>
  )
}

function ToggleRow({
  icon,
  iconTint,
  label,
  on,
  onChange,
  last,
}: {
  icon: IconType
  iconTint?: boolean
  label: string
  on: boolean
  onChange: (v: boolean) => void
  last?: boolean
}) {
  return (
    <RowShell icon={icon} iconTint={iconTint} last={last}>
      <span className="flex-1 text-[13.5px]">{label}</span>
      <Toggle on={on} onChange={onChange} label={label} />
    </RowShell>
  )
}
