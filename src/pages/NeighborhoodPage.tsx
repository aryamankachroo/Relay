import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Map, X } from 'lucide-react'
import { GlassCard } from '../components/GlassCard.tsx'
import { NeighborhoodMap } from '../components/NeighborhoodMap.tsx'
import { demoCommunityLabel, demoResident } from '../data/index.ts'
import {
  itemsForResident,
  linksForResident,
  sceneResidentById,
  sceneResidents,
  shareLinksFromLoans,
  type SceneResident,
  type SceneResidentId,
} from '../data/neighborhood.ts'
import { givenName, loanStatusCopy, type LoanRequest } from '../data/lending.ts'
import { useInventory } from '../state/inventoryStore.ts'
import { useLoanRequests } from '../state/loanStore.ts'

type MapFilter = 'all' | 'lending' | 'loans'

export function NeighborhoodPage() {
  const headingId = useId()
  const panelRef = useRef<HTMLElement>(null)
  const { items } = useInventory()
  const { requests: loans } = useLoanRequests()
  const [selectedId, setSelectedId] = useState<SceneResidentId | null>(null)
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null)
  const [filter, setFilter] = useState<MapFilter>('all')
  const [query, setQuery] = useState('')

  const links = useMemo(() => shareLinksFromLoans(loans), [loans])
  const lendingIds = useMemo(() => {
    const ids = new Set<string>()
    for (const resident of sceneResidents) {
      if (itemsForResident(resident.id, items, loans).length > 0 || (resident.offers?.length ?? 0) > 0) {
        ids.add(resident.id)
      }
    }
    return ids
  }, [items, loans])

  const visibleResidents = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return sceneResidents.filter((resident) => {
      if (filter === 'lending' && !lendingIds.has(resident.id)) return false
      if (filter === 'loans') {
        const onLoan = links.some(
          (link) => link.active && (link.fromId === resident.id || link.toId === resident.id),
        )
        if (!onLoan) return false
      }
      if (!needle) return true
      const offered = itemsForResident(resident.id, items, loans).map((item) => item.name)
      const haystack = [resident.name, resident.street, ...(resident.offers ?? []), ...offered]
        .join(' ')
        .toLowerCase()
      return haystack.includes(needle)
    })
  }, [filter, items, lendingIds, links, loans, query])

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

  const selected = activeResidentId ? sceneResidentById(activeResidentId) : null
  const selectedItems = useMemo(() => {
    if (!activeResidentId) return []
    const listed = itemsForResident(activeResidentId, items, loans)
    const extras = (sceneResidentById(activeResidentId)?.offers ?? [])
      .filter((name) => !listed.some((item) => item.name === name))
      .map((name) => ({ id: name, name, detail: 'Ready to lend' }))
    return [...listed, ...extras]
  }, [activeResidentId, items, loans])
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
    if (!sceneResidentById(id)) return
    setSelectedLinkId(null)
    setSelectedId(id as SceneResidentId)
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

  const lendingCount = sceneResidents.filter((resident) => lendingIds.has(resident.id)).length

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
            placeholder="Search people, products, inventory"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="hood-filters" role="group" aria-label="Show residents">
          <FilterButton
            pressed={filter === 'all'}
            count={sceneResidents.length}
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
  onClose,
  onSelectResident,
}: {
  loan: LoanRequest
  onClose: () => void
  onSelectResident: (id: string) => void
}) {
  const lender = sceneResidentById(loan.lenderId)
  const borrowerId = loan.borrowerId ?? (loan.lenderId === 'resident-avery' ? null : 'resident-avery')
  const borrower = borrowerId ? sceneResidentById(borrowerId) : null
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
