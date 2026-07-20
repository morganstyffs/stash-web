import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  IconHome,
  IconList,
  IconPlus,
  IconBox,
  IconReportMoney,
  IconSettings,
  IconSparkles,
} from '@tabler/icons-react'
import type { Icon } from '@tabler/icons-react'
import { useRunRecurringOnLoad } from '@/hooks/useRecurring'

interface Tab {
  to: string
  label: string
  icon: Icon
}

// Bottom nav: หน้าหลัก · ประวัติ · [ + ] · สต็อก · ตั้งค่า (design spec §4)
const LEFT: Tab[] = [
  { to: '/', label: 'หน้าหลัก', icon: IconHome },
  { to: '/history', label: 'ประวัติ', icon: IconList },
]
const RIGHT: Tab[] = [
  { to: '/stock', label: 'สต็อก', icon: IconBox },
  { to: '/settings', label: 'ตั้งค่า', icon: IconSettings },
]
// Desktop rail has room for งบประมาณ; the mobile bottom nav stays at 5 slots
// (design spec §4), so budget is reached there via the home strip / settings.
const RAIL: Tab[] = [
  ...LEFT,
  { to: '/budget', label: 'งบประมาณ', icon: IconReportMoney },
  ...RIGHT,
]

export function AppLayout() {
  const navigate = useNavigate()

  // Materialize any due recurring rules once per app load (backfills missed
  // periods server-side; no-op until the 0007 migration is applied).
  useRunRecurringOnLoad()

  return (
    <div className="mx-auto flex min-h-full max-w-3xl bg-white sm:my-4 sm:min-h-0 sm:rounded-[22px] sm:border-[0.5px] sm:border-hairline sm:shadow-card">
      {/* Nav rail — tablet/desktop only */}
      <nav className="hidden w-[66px] shrink-0 flex-col items-center border-r border-hairline py-4 sm:flex">
        <Link to="/" aria-label="Stash" className="mb-6">
          <img src="/stash-mark.svg" alt="Stash" className="h-8 w-8" />
        </Link>
        <div className="flex flex-1 flex-col items-center gap-6">
          {RAIL.map(({ to, icon: I }) => (
            <NavLink key={to} to={to} end={to === '/'} aria-label={to}>
              {({ isActive }) => (
                <I size={22} className={isActive ? 'text-mint-deep' : 'text-faint'} />
              )}
            </NavLink>
          ))}
          <button
            aria-label="เพิ่มรายการ"
            onClick={() => navigate('/add')}
            className="flex h-10 w-10 items-center justify-center rounded-[13px] bg-mint-deep"
          >
            <IconPlus size={22} className="text-white" />
          </button>
        </div>
        <button
          disabled
          aria-label="ถาม AI (เร็วๆ นี้)"
          title="เร็วๆ นี้"
          className="flex h-10 w-10 cursor-not-allowed items-center justify-center rounded-[13px] bg-mint-tint opacity-50"
        >
          <IconSparkles size={20} className="text-mint-deep" />
        </button>
      </nav>

      {/* Screen content */}
      <div className="flex min-w-0 flex-1 flex-col pb-[76px] sm:pb-0">
        <Outlet />
      </div>

      {/* Bottom nav — mobile only */}
      <div className="fixed inset-x-0 bottom-0 z-20 sm:hidden">
        <div className="relative mx-auto max-w-3xl">
          {/* ถาม AI floating pill — AI ยังไม่เปิดใช้ (ทำให้ดู disabled + บอก "เร็วๆ นี้") */}
          <button
            disabled
            aria-label="ถาม AI (เร็วๆ นี้)"
            title="เร็วๆ นี้"
            className="absolute -top-[52px] right-4 flex cursor-not-allowed items-center gap-1.5 rounded-pill bg-mint-deep/60 px-3.5 py-2 shadow-card"
          >
            <IconSparkles size={16} className="text-white" />
            <span className="text-xs font-medium text-white">ถาม AI</span>
            <span className="rounded-pill bg-white/25 px-1.5 py-px text-[9px] font-medium text-white">
              เร็วๆ นี้
            </span>
          </button>

          <div className="flex items-center justify-between border-t border-hairline bg-white px-6 pb-[max(13px,env(safe-area-inset-bottom))] pt-2.5">
            {LEFT.map(({ to, icon: I }) => (
              <NavLink key={to} to={to} end={to === '/'} aria-label={to}>
                {({ isActive }) => (
                  <I size={22} className={isActive ? 'text-mint-deep' : 'text-faint'} />
                )}
              </NavLink>
            ))}
            <button
              aria-label="เพิ่มรายการ"
              onClick={() => navigate('/add')}
              className="-mt-1.5 flex h-11 w-11 items-center justify-center rounded-[15px] bg-mint-deep"
            >
              <IconPlus size={24} className="text-white" />
            </button>
            {RIGHT.map(({ to, icon: I }) => (
              <NavLink key={to} to={to} end={to === '/'} aria-label={to}>
                {({ isActive }) => (
                  <I size={22} className={isActive ? 'text-mint-deep' : 'text-faint'} />
                )}
              </NavLink>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
