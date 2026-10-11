import { Bell, Flower2, Map, MessageCircle, Package, type LucideIcon } from 'lucide-react'
import { Link, NavLink, Outlet } from 'react-router'
import { UserButton } from '@clerk/react-router'
import { demoCommunityLabel, demoResident } from '../data/index.ts'
import { useActivityFeed } from '../state/activityFeedStore.ts'
import { Atmosphere } from './Atmosphere.tsx'

const links: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/', label: 'Chat', icon: MessageCircle, end: true },
  { to: '/my-stuff', label: 'My Inventory', icon: Package },
  { to: '/neighborhood', label: 'Neighborhood', icon: Map },
  { to: '/activity', label: 'Activity', icon: Bell },
  { to: '/garden', label: 'Garden', icon: Flower2 },
]

export function AppLayout() {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <Atmosphere />
      <div className="app-frame">
        <aside className="sidebar shell-panel">
          <SidebarAero />
          <Wordmark />
          <p className="sidebar-demo-label">{demoCommunityLabel}</p>
          <PrimaryNav layout="side" />
          <div className="sidebar-foot">
            <ReuseCounter />
            <ResidentCard />
          </div>
        </aside>
        <div className="app-main">
          <header className="mobile-chrome shell-panel">
            <div className="mobile-bar">
              <Wordmark compact />
              <ReuseCounter compact />
              <ResidentCard compact />
            </div>
            <p className="mobile-demo-label">{demoCommunityLabel}</p>
          </header>
          <PrimaryNav layout="dock" />
          <main id="content" className="page-canvas">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}

function SidebarAero() {
  return (
    <div className="sidebar-aero" aria-hidden="true">
      <div className="sidebar-aero-sun" />
      <div className="sidebar-aero-beam sidebar-aero-beam-a" />
      <div className="sidebar-aero-beam sidebar-aero-beam-b" />
      <div className="sidebar-aero-beam sidebar-aero-beam-c" />
      <svg
        className="sidebar-aero-waves"
        viewBox="0 0 240 720"
        preserveAspectRatio="none"
        focusable="false"
      >
        <defs>
          <linearGradient id="sidebar-aero-beam" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity="0.62" />
            <stop offset="42%" stopColor="#c4f8dc" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#9ee58a" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="sidebar-aero-beam-soft" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity="0.42" />
            <stop offset="50%" stopColor="#c9fff8" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#63e7a6" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          className="sidebar-aero-ribbon sidebar-aero-ribbon-a"
          d="M48 -30 C 92 70, 18 150, 78 255 S 22 410, 96 515 S 34 640, 86 760 L 128 760 C 72 640, 150 515, 82 410 S 136 255, 58 150 S 118 70, 78 -30 Z"
          fill="url(#sidebar-aero-beam)"
        />
        <path
          className="sidebar-aero-ribbon sidebar-aero-ribbon-b"
          d="M132 -40 C 176 55, 108 145, 168 250 S 112 405, 186 510 S 124 635, 176 760 L 214 760 C 158 635, 236 510, 168 405 S 222 250, 148 145 S 202 55, 162 -40 Z"
          fill="url(#sidebar-aero-beam-soft)"
        />
        <path
          className="sidebar-aero-ribbon sidebar-aero-ribbon-c"
          d="M-8 -20 C 36 90, -28 175, 32 280 S -24 430, 48 540 S -12 655, 40 760 L 74 760 C 22 655, 96 540, 28 430 S 82 280, 8 175 S 62 90, 22 -20 Z"
          fill="url(#sidebar-aero-beam-soft)"
        />
      </svg>
    </div>
  )
}

function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className={compact ? 'wordmark wordmark-compact' : 'wordmark'}>
      <span className="wordmark-copy">
        <span className="wordmark-name">Relay</span>
        {compact ? null : <span className="wordmark-tag">share nearby</span>}
      </span>
    </Link>
  )
}

function PrimaryNav({ layout }: { layout: 'side' | 'dock' }) {
  return (
    <nav aria-label="Primary" className={layout === 'side' ? 'side-nav' : 'mobile-dock shell-panel'}>
      {links.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            [
              'nav-pill',
              layout === 'side' ? 'nav-pill-side' : '',
              isActive ? 'nav-pill-active' : '',
            ]
              .filter(Boolean)
              .join(' ')
          }
        >
          {layout === 'side' ? (
            <span className="nav-pill-icon">
              <Icon aria-hidden="true" size={18} />
            </span>
          ) : (
            <Icon aria-hidden="true" size={16} />
          )}
          {label}
        </NavLink>
      ))}
    </nav>
  )
}

function ReuseCounter({ compact = false }: { compact?: boolean }) {
  const { gardenCount } = useActivityFeed()
  const count = gardenCount ?? 0

  return (
    <div
      className={compact ? 'reuse-counter reuse-counter-compact' : 'reuse-counter'}
      aria-live="polite"
    >
      <span className="reuse-count">{count}</span>
      <span className="reuse-copy">reuse events</span>
    </div>
  )
}

function ResidentCard({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? 'resident resident-compact' : 'resident'}>
      <UserButton />
      <span className="resident-copy">
        <span className="resident-name" aria-hidden={compact ? true : undefined}>
          {compact ? demoResident.shortName : demoResident.name}
        </span>
        {compact ? (
          <span className="sr-only">
            {demoResident.name}, {demoResident.street}
          </span>
        ) : (
          <span className="resident-place">{demoResident.street}</span>
        )}
      </span>
    </div>
  )
}
