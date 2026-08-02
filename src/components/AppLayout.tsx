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

// Mobile bottom nav: หน้าหลัก · ประวัติ · [ + ] · ยอดค้าง · สต็อก — 4 tabs around a
// centre FAB (5 slots, an odd count, so the FAB sits at the true horizontal
// centre; the old 6-slot bar put it 4-of-6 and it read off-centre). ตั้งค่า left
// the bar entirely — it's reached from the gear on the home screen instead.
// Each tab is a ≥44px touch target that spans ~1/5 of the width (flex-1), and the
// FAB centre is asserted against the bar centre by AppLayout.visual.test.tsx,
// which measures the real boxes at 390px rather than trusting the eye.
const LEFT: Tab[] = [
  { to: '/', label: 'หน้าหลัก', icon: IconHome },
  { to: '/history', label: 'ประวัติ', icon: IconList },
]
const RIGHT: Tab[] = [
  { to: DEBTS_TO, label: 'ยอดค้าง', icon: IconUsers },
  { to: '/stock', label: 'สต็อก', icon: IconBox },
]
// Desktop rail is unchanged: it has the vertical room to keep งบประมาณ AND ตั้งค่า
// inline, so this is purely a mobile change — the rail still reaches every screen.
const RAIL: Tab[] = [
  { to: '/', label: 'หน้าหลัก', icon: IconHome },
  { to: '/history', label: 'ประวัติ', icon: IconList },
  { to: DEBTS_TO, label: 'ยอดค้าง', icon: IconUsers },
  { to: '/budget', label: 'งบประมาณ', icon: IconReportMoney },
  { to: '/stock', label: 'สต็อก', icon: IconBox },
  { to: '/settings', label: 'ตั้งค่า', icon: IconSettings },
]

/** A rail nav destination as a 44px touch target, with the single-dot ยอดค้าง
 *  badge when there's something waiting (friend requests + debt confirmations).
 *  Icon-only — the rail has never shown labels; the mobile bar uses BottomTab. */
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

/** A mobile bottom-nav tab: icon + Thai label stacked, filling ~1/5 of the bar
 *  (flex-1) with a ≥44px touch target. The wider slot is what gives the label
 *  room to sit on one line — whitespace-nowrap keeps ยอดค้าง / ประวัติ from
 *  breaking. The ยอดค้าง badge rides the icon (not the wide cell) so it stays
 *  pinned to the glyph. */
function BottomTab({ tab, badge }: { tab: Tab; badge: boolean }) {
  const I = tab.icon
  return (
    <NavLink
      to={tab.to}
      end={tab.to === '/'}
      aria-label={tab.label}
      className="relative flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5"
    >
      {({ isActive }) => (
        <>
          <span className="relative">
            <I size={22} className={isActive ? 'text-brand-deep' : 'text-faint'} />
            {badge && (
              <span
                aria-hidden
                className="absolute -right-1.5 -top-1 h-2 w-2 rounded-full bg-expense ring-2 ring-white"
              />
            )}
          </span>
          <span
            className={`whitespace-nowrap text-[10px] leading-none ${
              isActive ? 'text-brand-deep' : 'text-faint'
            }`}
          >
            {tab.label}
          </span>
        </>
      )}
    </NavLink>
  )
}

/**
 * Mobile bottom nav (4 tabs + centre FAB = 5 slots). Presentational + Router-only
 * — the badge state comes in as a prop so AppLayout owns the single count query
 * and this stays measurable in a real browser without a data layer. The FAB lives
 * in its own flex-1 cell so the five cells are equal and the button lands on the
 * exact centre (verified by AppLayout.visual.test.tsx).
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

        <div
          data-testid="bottom-nav-bar"
          className="flex items-stretch border-t border-hairline bg-white px-2 pb-[max(13px,env(safe-area-inset-bottom))] pt-2"
        >
          {LEFT.map((t) => (
            <BottomTab key={t.to} tab={t} badge={t.to === DEBTS_TO && hasBadge} />
          ))}
          <div className="flex flex-1 items-center justify-center">
            <button
              aria-label="เพิ่มรายการ"
              onClick={() => navigate('/add')}
              className="-mt-1.5 flex h-11 w-11 items-center justify-center rounded-[15px] bg-brand-deep"
            >
              <IconPlus size={24} className="text-white" />
            </button>
          </div>
          {RIGHT.map((t) => (
            <BottomTab key={t.to} tab={t} badge={t.to === DEBTS_TO && hasBadge} />
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
