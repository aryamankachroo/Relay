import { useEffect, useId, useMemo, useState } from 'react'
import { Map as MapIcon, X } from 'lucide-react'
import { api } from '../api/client.ts'
import type { ApiInventoryItem, ApiResident } from '../api/types.ts'
import { GlassCard } from '../components/GlassCard.tsx'
import { NeighborhoodScene } from '../components/NeighborhoodScene.tsx'
import { shareLinksFromLoans, type SceneResident } from '../data/neighborhood.ts'
import { useCurrentResident } from '../state/currentResident.ts'
import { useInventory } from '../state/inventoryStore.ts'
import { useLoanRequests } from '../state/loanStore.ts'
import { useShelfResident } from '../state/shelfResident.tsx'

const houseSpots = [
  { x: 400, y: 300, roof: '#2ecfbf', wall: '#f4fcff' },
  { x: 150, y: 220, roof: '#3eb6ef', wall: '#e5f6ff' },
  { x: 250, y: 150, roof: '#7fd3a1', wall: '#f4fcff' },
  { x: 520, y: 150, roof: '#3cbf64', wall: '#f4fcff' },
  { x: 680, y: 210, roof: '#0c749f', wall: '#c9fff8' },
  { x: 120, y: 330, roof: '#f2b84b', wall: '#fff8ea' },
  { x: 610, y: 320, roof: '#e07a5f', wall: '#fff4ef' },
  { x: 300, y: 360, roof: '#5b8def', wall: '#eef4ff' },
] as const

export function NeighborhoodPage() {
  const headingId = useId()
  const panelId = useId()
  const { items } = useInventory()
  const { requests: loans } = useLoanRequests()
  const you = useCurrentResident()
  const shelfId = useShelfResident()
  const [people, setPeople] = useState<ApiResident[]>([])
  const [shared, setShared] = useState<ApiInventoryItem[]>([])
  const [note, setNote] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    if (!shelfId) return
    const viewerId = shelfId
    let cancel = false
    Promise.all([api.residents(), api.neighborhood(viewerId)])
      .then(([directory, block]) => {
        if (cancel) return
        setPeople(directory)
        if (block.snowflake !== 'ok') {
          setShared([])
          setNote(block.snowflake_message || 'Snowflake neighborhood is not available.')
          return
        }
        setShared(block.items)
        setNote('')
      })
      .catch((error: unknown) => {
        if (cancel) return
        setShared([])
        setNote(error instanceof Error ? error.message : 'Could not load the neighborhood.')
      })
    return () => {
      cancel = true
    }
  }, [shelfId])

  const residents = useMemo(
    () => snowflakeHomes(people, shared, { id: shelfId, name: you.name, initials: you.initials }),
    [people, shared, shelfId, you.name, you.initials],
  )
  const residentIds = useMemo(() => new Set(residents.map((resident) => resident.id)), [residents])
  const links = useMemo(() => shareLinksFromLoans(loans, residentIds), [loans, residentIds])
  const selected = selectedId ? residents.find((resident) => resident.id === selectedId) : null
  const selectedItems = useMemo(() => {
    if (!selectedId) return []
    if (selectedId === shelfId) {
      return items
        .filter((item) => item.availableToLend)
        .map((item) => ({ id: item.id, name: item.name, detail: item.notes || item.condition }))
    }
    return shared
      .filter((item) => item.resident_id === selectedId)
      .map((item) => ({
        id: item.inventory_id || `${item.resident_id}:${item.catalog_item}`,
        name: item.catalog_name || item.catalog_item,
        detail: item.condition_note || '',
      }))
  }, [selectedId, items, shared, shelfId])

  const activeLinks = links.filter((link) => link.active)
  const pendingLinks = links.filter((link) => !link.active)

  return (
    <section className="hood-page" aria-labelledby={headingId}>
      <GlassCard tone="strong" className="hood-hero">
        <div className="hood-hero-badge">
          <span className="icon-chip" style={{ backgroundColor: 'var(--relay-color-turquoise-300)' }}>
            <MapIcon aria-hidden="true" size={22} />
          </span>
          <div className="grid gap-1">
            <p className="eyebrow">Around the block</p>
            <h1 id={headingId} className="hood-title">
              Neighborhood
            </h1>
          </div>
        </div>
        <p className="hood-lead">
          Homes and items from the Snowflake neighborhood. Tap a home to see what neighbors can lend.
        </p>
        {note ? <p className="hood-demo-label">{note}</p> : null}
      </GlassCard>

      <GlassCard tone="solid" className="hood-stage">
        <NeighborhoodScene
          residents={residents}
          links={links}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />

        {selected ? (
          <aside className="hood-panel" id={panelId} aria-live="polite">
            <div className="hood-panel-head">
              <div className="hood-panel-who">
                <span className="hood-panel-avatar" aria-hidden="true">
                  {selected.initials}
                </span>
                <div className="grid gap-0.5">
                  <p className="hood-panel-name">
                    {selected.name}
                    {selected.isYou ? ' · you' : ''}
                  </p>
                  <p className="hint">{selected.street}</p>
                </div>
              </div>
              <button
                type="button"
                className="hood-panel-close"
                aria-label="Close resident panel"
                onClick={() => setSelectedId(null)}
              >
                <X aria-hidden="true" size={18} />
              </button>
            </div>
            <p className="hood-panel-kicker">Available to lend</p>
            {selectedItems.length > 0 ? (
              <ul className="hood-item-list">
                {selectedItems.map((item) => (
                  <li key={item.id} className="hood-item">
                    <span className="hood-item-name">{item.name}</span>
                    <span className="hood-item-detail">{item.detail}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hint">Nothing listed to lend right now.</p>
            )}
          </aside>
        ) : null}

        <div className="hood-legend" aria-label="Map legend">
          <span className="hood-legend-item">
            <span className="hood-legend-swatch hood-legend-link" aria-hidden="true" />
            Shared loan ({activeLinks.length})
          </span>
          <span className="hood-legend-item">
            <span className="hood-legend-swatch hood-legend-pending" aria-hidden="true" />
            Requested ({pendingLinks.length})
          </span>
          <span className="hood-legend-item">
            <span className="hood-legend-swatch hood-legend-home" aria-hidden="true" />
            Tap a home
          </span>
        </div>
      </GlassCard>

      {activeLinks.length > 0 ? (
        <GlassCard tone="glass" className="hood-share-note">
          <p className="hood-share-title">Live from Activity</p>
          <ul className="hood-share-list">
            {activeLinks.map((link) => {
              const lender = residents.find((resident) => resident.id === link.toId)
              return (
                <li key={link.id}>
                  <strong>{link.itemName}</strong> with {lender?.name.split(' ')[0] ?? 'a neighbor'} ·{' '}
                  {link.status}
                </li>
              )
            })}
          </ul>
        </GlassCard>
      ) : null}
    </section>
  )
}

function snowflakeHomes(
  people: readonly ApiResident[],
  shared: readonly ApiInventoryItem[],
  you: { id: string; name: string; initials: string },
): SceneResident[] {
  const byId = new Map(people.map((person) => [person.id, person]))
  const neighborIds = [...new Set(shared.map((item) => item.resident_id))].filter((id) => id !== you.id)
  const ordered = [you.id, ...neighborIds].slice(0, houseSpots.length)

  return ordered.map((id, index) => {
    const person = byId.get(id)
    const listed = shared.find((item) => item.resident_id === id)
    const yours = id === you.id
    const name = yours ? you.name : person?.name || listed?.resident_name || id
    const spot = houseSpots[index]
    return {
      id,
      name,
      initials: yours ? you.initials : person?.initials || name.slice(0, 2).toUpperCase(),
      street: person?.street || '',
      isYou: yours,
      x: spot.x,
      y: spot.y,
      roof: spot.roof,
      wall: spot.wall,
    }
  })
}
