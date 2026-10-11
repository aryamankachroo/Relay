import { useId, useMemo, useState } from 'react'
import { Map, X } from 'lucide-react'
import { GlassCard } from '../components/GlassCard.tsx'
import { NeighborhoodScene } from '../components/NeighborhoodScene.tsx'
import { demoCommunityLabel } from '../data/index.ts'
import {
  itemsForResident,
  sceneResidentById,
  sceneResidents,
  shareLinksFromLoans,
  type SceneResidentId,
} from '../data/neighborhood.ts'
import { useInventory } from '../state/inventoryStore.ts'
import { useLoanRequests } from '../state/loanStore.ts'

export function NeighborhoodPage() {
  const headingId = useId()
  const panelId = useId()
  const { items } = useInventory()
  const { requests: loans } = useLoanRequests()
  const [selectedId, setSelectedId] = useState<SceneResidentId | null>(null)

  const links = useMemo(() => shareLinksFromLoans(loans), [loans])
  const selected = selectedId ? sceneResidentById(selectedId) : null
  const selectedItems = useMemo(
    () => (selectedId ? itemsForResident(selectedId, items) : []),
    [selectedId, items],
  )

  const activeLinks = links.filter((link) => link.active)
  const pendingLinks = links.filter((link) => !link.active)

  return (
    <section className="hood-page" aria-labelledby={headingId}>
      <GlassCard tone="strong" className="hood-hero">
        <div className="hood-hero-badge">
          <span className="icon-chip" style={{ backgroundColor: 'var(--relay-color-turquoise-300)' }}>
            <Map aria-hidden="true" size={22} />
          </span>
          <div className="grid gap-1">
            <p className="eyebrow">Around the block</p>
            <h1 id={headingId} className="hood-title">
              Neighborhood
            </h1>
          </div>
        </div>
        <p className="hood-lead">
          A stylized look at Willow Court. Tap a home to see what neighbors can lend.
        </p>
        <p className="hood-demo-label">{demoCommunityLabel}</p>
      </GlassCard>

      <GlassCard tone="solid" className="hood-stage">
        <NeighborhoodScene
          residents={sceneResidents}
          links={links}
          selectedId={selectedId}
          onSelect={(id) => setSelectedId(id as SceneResidentId)}
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
              const lender = sceneResidentById(link.toId)
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
