import { useEffect, useRef } from 'react'
import { Bell, Flower2, Map, MessageCircle, Package, type LucideIcon } from 'lucide-react'
import { Link, NavLink, Outlet } from 'react-router'
import { UserButton } from '@clerk/react-router'
import { api } from '../api/client.ts'
import { demoCommunityLabel } from '../data/index.ts'
import { useActivityFeed } from '../state/activityFeedStore.ts'
import { useCurrentResident } from '../state/currentResident.ts'
import { Atmosphere } from './Atmosphere.tsx'
import { RelayMark } from './RelayMark.tsx'

const links: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/', label: 'Chat', icon: MessageCircle, end: true },
  { to: '/my-stuff', label: 'My Inventory', icon: Package },
  { to: '/neighborhood', label: 'Neighborhood', icon: Map },
  { to: '/activity', label: 'Activity', icon: Bell },
  { to: '/garden', label: 'Garden', icon: Flower2 },
]

export function AppLayout() {
  useProfileSync()
  return (
    <div className="app-shell">
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <Atmosphere />
      <div className="app-frame">
        <aside className="sidebar shell-panel">
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

function useProfileSync() {
  const resident = useCurrentResident()
  const saved = useRef('')

  useEffect(() => {
    if (!resident.id) return
    const key = `${resident.id}:${resident.name}:${resident.email}`
    if (saved.current === key) return
    saved.current = key
    void api.saveProfile({
      clerk_user_id: resident.id,
      name: resident.name,
      email: resident.email,
      initials: resident.initials,
      street: resident.street,
    })
  }, [resident.id, resident.name, resident.email, resident.initials, resident.street])
}

function ResidentCard({ compact = false }: { compact?: boolean }) {
  const resident = useCurrentResident()

  return (
    <div className={compact ? 'resident resident-compact' : 'resident'}>
      <UserButton />
      <span className="resident-copy">
        <span className="resident-name" aria-hidden={compact ? true : undefined}>
          {compact ? resident.shortName : resident.name}
        </span>
        {compact ? (
          <span className="sr-only">
            {resident.name}, {resident.street}
          </span>
        ) : (
          <span className="resident-place">{resident.street}</span>
        )}
      </span>
    </div>
  )
}
