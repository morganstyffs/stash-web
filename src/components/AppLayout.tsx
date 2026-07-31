import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  IconHome,
  IconList,
  IconPlus,
  IconBox,
  IconReportMoney,
  IconSettings,
  IconSparkles,
  IconUsers,
} from '@tabler/icons-react'
import type { Icon } from '@tabler/icons-react'
import { useRunRecurringOnLoad } from '@/hooks/useRecurring'
import { useDebtsBadgeCount } from '@/hooks/useFriends'
import { BrandMark } from '@/components/BrandMark'

interface Tab {
  to: string
  label: string
  icon: Icon
}

const DEBTS_TO = '/debts'

// Bottom nav: หน้าหลัก · ประวัติ · ยอดค้าง · [ + ] · สต็อก · ตั้งค่า (6 slots).
// Each item is a 44px touch target (h-11 w-11) — verified at 390px by
// AppLayout.visual.test.tsx, which fails if a slot drops below 44px rather than
// letting the icons silently shrink to fit.
const LEFT: Tab[] = [
  { to: '/', label: 'หน้าหลัก', icon: IconHome },
  { to: '/history', label: 'ประวัติ', icon: IconList },
  { to: DEBTS_TO, label: 'ยอดค้าง', icon: IconUsers },
]
const RIGHT: Tab[] = [
  { to: '/stock', label: 'สต็อก', icon: IconBox },
  { to: '/settings', label: 'ตั้งค่า', icon: IconSettings },
]
// Desktop rail keeps งบประมาณ inline (there's vertical room); the mobile bottom
// nav reaches budget via the home strip / settings instead.
const RAIL: Tab[] = [
  ...LEFT,
  { to: '/budget', label: 'งบประมาณ', icon: IconReportMoney },
  ...RIGHT,
]

/** A nav destination as a 44px touch target, with the single-dot ยอดค้าง badge
 *  when there's something waiting (friend requests + debt confirmations). */
function NavIconLink({ tab, badge }: { tab: Tab; badge: boolean }) {
  const I = tab.icon
  return (
    <NavLink
      to={tab.to}
      end={tab.to === '/'}
      aria-label={tab.to}
      className="relative flex h-11 w-11 items-center justify-center"
    >
      {({ isActive }) => (
        <>
          <I size={22} className={isActive ? 'text-brand-deep' : 'text-faint'} />
          {badge && (
            <span
              aria-hidden
              className="absolute right-2 top-2 h-2 w-2 rounded-full bg-expense ring-2 ring-white"
            />
          )}
        </>
      )}
    </NavLink>
  )
}

/**
 * Mobile bottom nav (6 slots). Presentational + Router-only — the badge state
 * comes in as a prop so AppLayout owns the single count query and this stays
 * measurable in a real browser without a data layer.
 */
export function BottomNav({ hasBadge }: { hasBadge: boolean }) {
  const navigate = useNavigate()
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 sm:hidden">
      <div className="relative mx-auto max-w-3xl">
        {/* ถาม AI floating pill — AI ยังไม่เปิดใช้ (ทำให้ดู disabled + บอก "เร็วๆ นี้") */}
        <button
          disabled
          aria-label="ถาม AI (เร็วๆ นี้)"
          title="เร็วๆ นี้"
          className="absolute -top-[52px] right-4 flex cursor-not-allowed items-center gap-1.5 rounded-pill bg-brand-deep/60 px-3.5 py-2 shadow-card"
        >
          <IconSparkles size={16} className="text-white" />
          <span className="text-xs font-medium text-white">ถาม AI</span>
          <span className="rounded-pill bg-white/25 px-1.5 py-px text-[9px] font-medium text-white">
            เร็วๆ นี้
          </span>
        </button>

        <div className="flex items-center justify-between border-t border-hairline bg-white px-4 pb-[max(13px,env(safe-area-inset-bottom))] pt-2.5">
          {LEFT.map((t) => (
            <NavIconLink key={t.to} tab={t} badge={t.to === DEBTS_TO && hasBadge} />
          ))}
          <button
            aria-label="เพิ่มรายการ"
            onClick={() => navigate('/add')}
            className="-mt-1.5 flex h-11 w-11 items-center justify-center rounded-[15px] bg-brand-deep"
          >
            <IconPlus size={24} className="text-white" />
          </button>
          {RIGHT.map((t) => (
            <NavIconLink key={t.to} tab={t} badge={false} />
          ))}
        </div>
      </div>
    </div>
  )
}

export function AppLayout() {
  const navigate = useNavigate()

  // Materialize any due recurring rules once per app load (backfills missed
  // periods server-side; no-op until the 0007 migration is applied).
  useRunRecurringOnLoad()

  // Single source for the ยอดค้าง badge count (convention 10).
  const hasBadge = (useDebtsBadgeCount().data ?? 0) > 0

  return (
    <div className="mx-auto flex min-h-full max-w-3xl bg-surface sm:my-4 sm:min-h-0 sm:rounded-[22px] sm:border-[0.5px] sm:border-hairline sm:shadow-card">
      {/* Nav rail — tablet/desktop only */}
      <nav className="hidden w-[66px] shrink-0 flex-col items-center border-r border-hairline py-4 sm:flex">
        <Link to="/" aria-label="Stash" className="mb-6">
          {/* หน้าปัดตู้เซฟ mark. Decorative — the Link already carries the "Stash"
              accessible name. full (with rays): 32px meets the ≥32px breakpoint.
              Shell = text-mint (PR-A token); dial/ink use the component defaults. */}
          <BrandMark variant="full" size={32} className="text-mint" />
        </Link>
        <div className="flex flex-1 flex-col items-center gap-4">
          {RAIL.map((t) => (
            <NavIconLink key={t.to} tab={t} badge={t.to === DEBTS_TO && hasBadge} />
          ))}
          <button
            aria-label="เพิ่มรายการ"
            onClick={() => navigate('/add')}
            className="flex h-10 w-10 items-center justify-center rounded-[13px] bg-brand-deep"
          >
            <IconPlus size={22} className="text-white" />
          </button>
        </div>
        <button
          disabled
          aria-label="ถาม AI (เร็วๆ นี้)"
          title="เร็วๆ นี้"
          className="flex h-10 w-10 cursor-not-allowed items-center justify-center rounded-[13px] bg-brand-tint opacity-50"
        >
          <IconSparkles size={20} className="text-brand-deep" />
        </button>
      </nav>

      {/* Screen content */}
      <div className="flex min-w-0 flex-1 flex-col pb-[76px] sm:pb-0">
        <Outlet />
      </div>

      {/* Bottom nav — mobile only */}
      <BottomNav hasBadge={hasBadge} />
    </div>
  )
}
