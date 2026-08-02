import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  IconCategory,
  IconChevronRight,
  IconCurrencyBaht,
  IconInfoCircle,
  IconLogout,
  IconMoon,
  IconReportMoney,
  IconRepeat,
  IconSparkles,
  IconStar,
  IconTag,
  IconUserCircle,
  IconWallet,
  IconWand,
} from '@tabler/icons-react'
import { Toggle } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { formatBuildStamp } from '@/lib/format'
import { CategoriesManager } from '@/components/CategoriesManager'
import { WalletsManager } from '@/components/WalletsManager'
import { FavoritesManager } from '@/components/FavoritesManager'
import { RecurringManager } from '@/components/RecurringManager'
import { ProfileManager } from '@/components/ProfileManager'
import { SkuManager } from '@/components/SkuManager'
import { BrandMark } from '@/components/BrandMark'
import { useAuth } from '@/hooks/useAuth'
import { useCategories, useFavorites } from '@/hooks/useLookups'
import { useSkuConfig } from '@/hooks/useSkuConfig'
import { useRecurringCount, useWallets } from '@/hooks/useSettings'
import { useTheme } from '@/hooks/useTheme'
import { loadAiPrefs, saveAiPrefs, type AiPrefs } from '@/lib/prefs'

export function SettingsPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { user, signOut } = useAuth()
  const { data: categories } = useCategories()
  const { data: wallets } = useWallets()
  const { data: favorites } = useFavorites()
  const { data: recurringCount } = useRecurringCount()
  const { data: skuConfig } = useSkuConfig()
  const { mode, setMode } = useTheme()
  const location = useLocation()

  // Deep-link: navigating here with `state.openManager` (e.g. the "ตั้งชื่อผู้ใช้"
  // shortcut from ยอดค้าง) opens that manager straight away. Read once on mount.
  const [manager, setManager] = useState<
    'profile' | 'categories' | 'wallets' | 'favorites' | 'recurring' | 'sku' | null
  >(() => {
    const s = location.state as { openManager?: 'profile' } | null
    return s?.openManager ?? null
  })
  const [ai, setAi] = useState<AiPrefs>(() => loadAiPrefs())

  function setAiPref(patch: Partial<AiPrefs>) {
    const next = { ...ai, ...patch }
    setAi(next)
    saveAiPrefs(next)
  }

  // Version stamp — which commit/build production is running (see vite.config.ts
  // define). Tap to copy so it's easy to quote when comparing notes.
  const version = `${__COMMIT_SHA__} · ${formatBuildStamp(__BUILD_TIME__)}`
  async function copyVersion() {
    try {
      await navigator.clipboard.writeText(version)
      toast.success('คัดลอกเวอร์ชันแล้ว')
    } catch {
      // Clipboard blocked (insecure context / permission) — tell the user, don't
      // swallow it (convention 17).
      toast.error('คัดลอกไม่สำเร็จ')
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="px-[18px] pb-3.5 pt-[18px]">
        <p className="text-[17px] font-medium">ตั้งค่า</p>
      </div>

      <div className="mx-4 mb-3.5">
        <div
          className="woven relative overflow-hidden rounded-card bg-brand-fabric text-brand-thread shadow-card"
          style={{ height: 84 }}
        >
          <span aria-hidden className="selvedge absolute inset-x-0 top-0 h-[6px]" />
          <span aria-hidden className="selvedge absolute inset-x-0 bottom-0 h-[6px]" />
          <div className="relative flex h-full items-center justify-between px-[18px]">
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] opacity-80">
                STASH
              </p>
              <p className="mt-1 truncate text-[14px] font-medium">{user?.email ?? '—'}</p>
              <p className="mt-1 text-[11px] opacity-80">ลงชื่อเข้าใช้อยู่</p>
            </div>
            <IconUserCircle size={26} className="shrink-0 opacity-70" aria-hidden />
          </div>
        </div>
      </div>

      <Group title="ทั่วไป">
        <Row
          icon={IconUserCircle}
          label="โปรไฟล์"
          sub="ชื่อที่เพื่อนเห็น · ชื่อผู้ใช้"
          onClick={() => setManager('profile')}
        />
        <ToggleRow
          icon={IconMoon}
          label="โหมดมืด"
          on={mode === 'dark'}
          onChange={(v) => setMode(v ? 'dark' : 'light')}
        />
        <Row
          icon={IconCategory}
          label="หมวด"
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
        <Row icon={IconCurrencyBaht} label="สกุลเงิน" value="บาท (฿)" />
        {/* รูปแบบ SKU เคยอยู่กลุ่ม "สต็อก" คู่กับ "หมวดที่ลงสต็อกอัตโนมัติ" ซึ่งเป็น
            แค่ทางลัดซ้ำไปหน้าจัดการหมวดเดียวกัน — ตัดทางลัดนั้นออก เหลือแถวเดียว
            จึงยุบหัวข้อกลุ่มมารวมกับ "ทั่วไป" */}
        <Row
          icon={IconTag}
          label="รูปแบบ SKU"
          value={`${skuConfig?.prefix ?? 'STZ'}-`}
          mono
          last
          onClick={() => setManager('sku')}
        />
      </Group>

      <Group title="รายการประจำ · ผู้ช่วย AI">
        <Row
          icon={IconRepeat}
          label="รายการประจำ"
          value={`${recurringCount ?? 0} รายการ`}
          onClick={() => setManager('recurring')}
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

      {/* App-identity footer: the mark does the natural "this is Stash, this
          version" job next to the build stamp. Decorative (the version text
          carries the meaning); shell = text-mint (PR-A token), no hex. */}
      <div className="flex flex-col items-center gap-1.5 px-4 pb-8 pt-2">
        <BrandMark variant="compact" size={22} className="text-mint" />
        <button
          type="button"
          onClick={copyVersion}
          aria-label="คัดลอกเวอร์ชัน"
          className="text-[11px] text-faint"
        >
          เวอร์ชัน {version}
        </button>
      </div>

      {manager === 'profile' && <ProfileManager onClose={() => setManager(null)} />}
      {manager === 'categories' && <CategoriesManager onClose={() => setManager(null)} />}
      {manager === 'wallets' && <WalletsManager onClose={() => setManager(null)} />}
      {manager === 'favorites' && <FavoritesManager onClose={() => setManager(null)} />}
      {manager === 'recurring' && <RecurringManager onClose={() => setManager(null)} />}
      {manager === 'sku' && <SkuManager onClose={() => setManager(null)} />}
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
          iconTint ? 'bg-brand-tint' : 'bg-fill'
        }`}
      >
        <Icon size={16} className={iconTint ? 'text-brand-deep' : 'text-muted'} />
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
