import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Map, X } from 'lucide-react'
import { GlassCard } from '../components/GlassCard.tsx'
import { NeighborhoodMap } from '../components/NeighborhoodMap.tsx'
import { demoCommunityLabel, demoResident } from '../data/index.ts'
import { useCurrentResident } from '../state/currentResident.ts'
import {
  linksForResident,
  residentsFromListings,
  shareLinksBetween,
  type SceneResident,
} from '../data/neighborhood.ts'
import { givenName, loanStatusCopy, type LoanRequest } from '../data/lending.ts'
import { useLoanRequests } from '../state/loanStore.ts'
import { useShelfResident } from '../state/shelfResidentStore.ts'
import { api } from '../api/client.ts'
import type { ApiInventoryItem } from '../api/types.ts'

type MapFilter = 'all' | 'lending' | 'loans'

export function NeighborhoodPage() {
  const headingId = useId()
  const panelRef = useRef<HTMLElement>(null)
  const { requests: loans } = useLoanRequests()
  const shelfId = useShelfResident()
  const you = useCurrentResident()
  const [liveItems, setLiveItems] = useState<ApiInventoryItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null)
  const [filter, setFilter] = useState<MapFilter>('all')
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancel = false
    api
      .neighborhood(shelfId)
      .then((body) => {
        if (!cancel) setLiveItems(body.items)
      })
      .catch(() => {
        if (!cancel) setLiveItems([])
      })
    return () => {
      cancel = true
    }
  }, [shelfId])

  const cityMatches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return liveItems.filter((item) => {
      if (!needle) return true
      return [item.resident_name, item.catalog_name, item.catalog_item, item.city]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle)
    })
  }, [liveItems, query])

  const people = useMemo(
    () =>
      residentsFromListings(
        {
          id: shelfId,
          name: you.name || 'You',
          initials: you.initials || 'YO',
          street: you.street,
        },
        liveItems,
      ),
    [liveItems, shelfId, you.initials, you.name, you.street],
  )
  const links = useMemo(() => shareLinksBetween(loans, shelfId), [loans, shelfId])
  const lendingIds = useMemo(() => {
    const ids = new Set<string>()
    for (const resident of people) {
      if ((resident.offers?.length ?? 0) > 0) ids.add(resident.id)
    }
    return ids
  }, [people])

  const visibleResidents = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return people.filter((resident) => {
      if (filter === 'lending' && !lendingIds.has(resident.id)) return false
      if (filter === 'loans') {
        const onLoan = links.some(
          (link) => link.active && (link.fromId === resident.id || link.toId === resident.id),
        )
        if (!onLoan) return false
      }
      if (!needle) return true
      const haystack = [resident.name, resident.street, ...(resident.offers ?? [])].join(' ').toLowerCase()
      return haystack.includes(needle)
    })
  }, [filter, lendingIds, links, people, query])

  const visibleIds = useMemo(
    () => new Set(visibleResidents.map((resident) => resident.id)),
    [visibleResidents],
  )
  const visibleLinks = useMemo(
    () => links.filter((link) => visibleIds.has(link.fromId) && visibleIds.has(link.toId)),
    [links, visibleIds],
  )
  const activeResidentId =
    selectedId && visibleIds.has(selectedId) ? selectedId : null
  const activeLinkId =
    selectedLinkId && visibleLinks.some((link) => link.id === selectedLinkId) ? selectedLinkId : null

  const selected = activeResidentId ? people.find((resident) => resident.id === activeResidentId) ?? null : null
  const selectedItems = useMemo(() => {
    if (!selected) return []
    return (selected.offers ?? []).map((name) => ({ id: name, name, detail: 'Ready to lend' }))
  }, [selected])
  const selectedLoan = activeLinkId ? (loans.find((loan) => loan.id === activeLinkId) ?? null) : null
  const activeLinks = links.filter((link) => link.active)
  const pendingLinks = links.filter((link) => !link.active)

  useEffect(() => {
    if (!activeResidentId && !activeLinkId) return
    if (window.matchMedia('(min-width: 52rem)').matches) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    panelRef.current?.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' })
  }, [activeResidentId, activeLinkId])

  function selectResident(id: string) {
    if (!people.some((resident) => resident.id === id)) return
    setSelectedLinkId(null)
    setSelectedId(id)
  }

  function selectLink(id: string) {
    setSelectedId(null)
    setSelectedLinkId(id)
  }

  const emptyMessage =
    query.trim() && visibleResidents.length === 0
      ? `No people, products, or inventory match “${query.trim()}”.`
      : filter === 'loans' && visibleResidents.length === 0
      ? 'No active loans right now.'
      : filter === 'lending' && visibleResidents.length === 0
        ? 'Nobody has something listed to lend.'
        : null

  const lendingCount = people.filter((resident) => lendingIds.has(resident.id)).length

  return (
    <section className="hood-page" aria-labelledby={headingId}>
      <GlassCard tone="strong" className="hood-hero">
        <div className="hood-hero-badge">
          <span className="icon-chip sphere-turquoise">
            <Map aria-hidden="true" size={22} />
          </span>
          <div className="grid gap-1">
            <p className="eyebrow">Around the block</p>
            <h1 id={headingId} className="hood-title">
              Neighborhood
            </h1>
          </div>
        </div>
        <p className="hood-demo-label">{demoCommunityLabel}</p>
      </GlassCard>

      <GlassCard tone="solid" className="hood-stage">
        <div className="hood-search">
          <input
            type="search"
            value={query}
            aria-label="Search people, products, and inventory"
            placeholder="Search your city"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <p className="hood-demo-label">{cityMatches.length} listings from people in your city</p>
        <div className="hood-filters" role="group" aria-label="Show residents">
          <FilterButton
            pressed={filter === 'all'}
            count={people.length}
            onClick={() => setFilter('all')}
          >
            All
          </FilterButton>
          <FilterButton
            pressed={filter === 'lending'}
            count={lendingCount}
            onClick={() => setFilter('lending')}
          >
            Lending
          </FilterButton>
          <FilterButton
            pressed={filter === 'loans'}
            count={activeLinks.length}
            onClick={() => setFilter('loans')}
          >
            Active loans
          </FilterButton>
        </div>

        <div className="hood-layout">
          <div className="hood-map-column">
            <NeighborhoodMap
              residents={visibleResidents}
              links={visibleLinks}
              lendingIds={lendingIds}
              selectedId={activeResidentId}
              selectedLinkId={activeLinkId}
              onSelectResident={selectResident}
              onSelectLink={selectLink}
              emptyMessage={emptyMessage}
            />
            <div className="hood-legend" aria-label="Map legend">
              <span className="hood-legend-item">
                <span className="hood-legend-swatch hood-legend-lending" aria-hidden="true" />
                Has something to lend
              </span>
              <span className="hood-legend-item">
                <span className="hood-legend-swatch hood-legend-link" aria-hidden="true" />
                Active loan ({activeLinks.length})
              </span>
              <span className="hood-legend-item">
                <span className="hood-legend-swatch hood-legend-pending" aria-hidden="true" />
                Requested ({pendingLinks.length})
              </span>
            </div>
          </div>

          <aside className="hood-panel" ref={panelRef} aria-live="polite">
            {selectedLoan ? (
              <LoanCard
                loan={selectedLoan}
                people={people}
                youId={shelfId}
                onClose={() => setSelectedLinkId(null)}
                onSelectResident={selectResident}
              />
            ) : selected ? (
              <ResidentCard
                resident={selected}
                items={selectedItems}
                loans={loans}
                links={linksForResident(selected.id, links)}
                onClose={() => setSelectedId(null)}
                onSelectLink={selectLink}
              />
            ) : (
              <div className="hood-panel-idle">
                <p className="hood-panel-kicker">On this map</p>
                <p className="hood-idle-copy">
                  Tap a resident to see what they can lend. Tap a loan line, or the mark on a
                  portrait, to see the item and status.
                </p>
              </div>
            )}
          </aside>
        </div>
      </GlassCard>

      {links.length > 0 ? (
        <GlassCard tone="glass" className="hood-share-note">
          <p className="hood-share-title">Loans</p>
          <p className="hint">The same loans Activity is showing.</p>
          <ul className="hood-share-list">
            {links.map((link) => {
              const loan = loans.find((item) => item.id === link.id)
              if (!loan) return null
              const lender = givenName(loan.lenderName)
              const borrower = givenName(loan.borrowerName ?? demoResident.name)
              return (
                <li key={link.id}>
                  <button
                    type="button"
                    className={[
                      'hood-share-button',
                      activeLinkId === link.id ? 'hood-share-button-selected' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => selectLink(link.id)}
                  >
                    <span className="hood-item-name">{link.itemName}</span>
                    <span className="hood-item-detail">
                      {lender} to {borrower} · {link.status}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </GlassCard>
      ) : null}
    </section>
  )
}

function FilterButton({
  pressed,
  count,
  onClick,
  children,
}: {
  pressed: boolean
  count: number
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      className={['hood-filter', pressed ? 'hood-filter-active' : ''].filter(Boolean).join(' ')}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {children}
      <span className="hood-filter-count">{count}</span>
    </button>
  )
}

function ResidentCard({
  resident,
  items,
  loans,
  links,
  onClose,
  onSelectLink,
}: {
  resident: SceneResident
  items: readonly { id: string; name: string; detail: string }[]
  loans: readonly LoanRequest[]
  links: readonly { id: string; itemName: string; status: string }[]
  onClose: () => void
  onSelectLink: (id: string) => void
}) {
  return (
    <>
      <div className="hood-panel-head">
        <div className="hood-panel-who">
          <span className="hood-panel-avatar" aria-hidden="true">
            {resident.initials}
          </span>
          <div className="grid gap-0.5">
            <p className="hood-panel-name">
              {resident.name}
              {resident.isYou ? ' · you' : ''}
            </p>
            <p className="hint">Fictional demo resident</p>
          </div>
        </div>
        <button type="button" className="hood-panel-close" aria-label="Close resident panel" onClick={onClose}>
          <X aria-hidden="true" size={18} />
        </button>
      </div>
      <p className="hood-panel-kicker">Available to lend</p>
      {items.length > 0 ? (
        <ul className="hood-item-list">
          {items.map((item) => (
            <li key={item.id} className="hood-item">
              <span className="hood-item-name">{item.name}</span>
              <span className="hood-item-detail">{item.detail}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">Nothing listed to lend right now.</p>
      )}
      {links.length > 0 ? (
        <>
          <p className="hood-panel-kicker">Loans</p>
          <ul className="hood-item-list">
            {links.map((link) => {
              const loan = loans.find((item) => item.id === link.id)
              return (
                <li key={link.id}>
                  <button type="button" className="hood-loan" onClick={() => onSelectLink(link.id)}>
                    <span className="hood-item-name">{link.itemName}</span>
                    <span className="hood-item-detail">{loan?.status ?? link.status}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      ) : null}
    </>
  )
}

function LoanCard({
  loan,
  people,
  youId,
  onClose,
  onSelectResident,
}: {
  loan: LoanRequest
  people: readonly SceneResident[]
  youId: string
  onClose: () => void
  onSelectResident: (id: string) => void
}) {
  const party = (id: string | undefined) => {
    if (!id) return null
    const resolved = id === 'resident-avery' ? youId : id
    return people.find((resident) => resident.id === resolved) ?? null
  }
  const lender = party(loan.lenderId)
  const borrower = party(loan.borrowerId)
  const active = loan.status !== 'Requested' && loan.status !== 'Returned'

  return (
    <>
      <div className="hood-panel-head">
        <div className="grid gap-0.5">
          <p className={active ? 'hood-panel-kicker hood-kicker-active' : 'hood-panel-kicker'}>{loan.status}</p>
          <p className="hood-panel-name">{loan.itemName}</p>
        </div>
        <button type="button" className="hood-panel-close" aria-label="Close loan panel" onClick={onClose}>
          <X aria-hidden="true" size={18} />
        </button>
      </div>
      <p className="hood-loan-parties">
        {givenName(loan.lenderName)} lending to {givenName(loan.borrowerName ?? demoResident.name)}
      </p>
      <p className="hood-loan-copy">{loanStatusCopy(loan)}</p>
      <div className="hood-party-row">
        {lender ? (
          <button type="button" className="hood-party" onClick={() => onSelectResident(lender.id)}>
            {lender.isYou ? 'You' : givenName(lender.name)}
            <span>Lender</span>
          </button>
        ) : null}
        {borrower ? (
          <button type="button" className="hood-party" onClick={() => onSelectResident(borrower.id)}>
            {borrower.isYou ? 'You' : givenName(borrower.name)}
            <span>Borrower</span>
          </button>
        ) : null}
      </div>
    </>
  )
}
