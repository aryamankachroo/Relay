import { Bell, Flower2, Map, MessageCircle, Package, type LucideIcon } from 'lucide-react'
import { Link, NavLink, Outlet } from 'react-router'
import { completedHandoffCount, demoResident } from '../data/index.ts'
import { Atmosphere } from './Atmosphere.tsx'
import { RelayMark } from './RelayMark.tsx'

const links: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/', label: 'Chat', icon: MessageCircle, end: true },
  { to: '/my-stuff', label: 'My Stuff', icon: Package },
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
          <Wordmark />
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

function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className={compact ? 'wordmark wordmark-compact' : 'wordmark'}>
      <span className="wordmark-badge">
        <RelayMark className="brand-mark" />
        <span className="wordmark-leaf" aria-hidden="true" />
      </span>
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
  return (
    <div className={compact ? 'reuse-counter reuse-counter-compact' : 'reuse-counter'}>
      <span className="reuse-count">{completedHandoffCount}</span>
      <span className="reuse-copy">completed handoffs</span>
    </div>
  )
}

function ResidentCard({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? 'resident resident-compact' : 'resident'}>
      <span className="resident-avatar" aria-hidden="true">
        {demoResident.initials}
      </span>
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
