import { useEffect, useId, useRef, useState } from 'react'
import type { GeoJSONSource, Map as MapboxMap, Marker } from 'mapbox-gl/esm'
import 'mapbox-gl/dist/mapbox-gl.css'
import {
  demoExploreBounds,
  demoMapBackdrop,
  demoResidentBounds,
  linksForResident,
  type SceneResident,
  type ShareLink,
} from '../data/neighborhood.ts'

const MAP_STYLE = 'mapbox://styles/mapbox/streets-v12'

type NeighborhoodMapProps = {
  residents: readonly SceneResident[]
  links: readonly ShareLink[]
  lendingIds: ReadonlySet<string>
  selectedId: string | null
  selectedLinkId: string | null
  onSelectResident: (id: string) => void
  onSelectLink: (id: string) => void
  emptyMessage: string | null
}

type MapboxModule = typeof import('mapbox-gl/esm')

export function NeighborhoodMap({
  residents,
  links,
  lendingIds,
  selectedId,
  selectedLinkId,
  onSelectResident,
  onSelectLink,
  emptyMessage,
}: NeighborhoodMapProps) {
  const token = mapboxToken()
  const statusId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapboxMap | null>(null)
  const markersRef = useRef<Marker[]>([])
  const handlersRef = useRef({ onSelectResident, onSelectLink })
  const linksRef = useRef(links)
  const residentsRef = useRef(residents)
  const selectedLinkRef = useRef(selectedLinkId)
  const selectedIdRef = useRef(selectedId)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    handlersRef.current = { onSelectResident, onSelectLink }
    linksRef.current = links
    residentsRef.current = residents
    selectedLinkRef.current = selectedLinkId
    selectedIdRef.current = selectedId
  }, [onSelectResident, onSelectLink, links, residents, selectedLinkId, selectedId])

  useEffect(() => {
    const container = containerRef.current
    if (!container || !token || failed) return

    let map: MapboxMap | null = null
    let cancelled = false
    let timer = 0

    void import('mapbox-gl/esm')
      .then((mapboxgl) => {
        if (cancelled || !containerRef.current) return
        if (!mapboxgl.supported()) {
          setFailed(true)
          return
        }

        timer = window.setTimeout(() => {
          if (!cancelled && !mapRef.current) setFailed(true)
        }, 15000)
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        const [[west, south], [east, north]] = demoResidentBounds()
        map = new mapboxgl.Map({
          accessToken: token,
          container,
          style: MAP_STYLE,
          center: [(west + east) / 2, (south + north) / 2],
          zoom: 15.4,
          minZoom: demoMapBackdrop.minZoom,
          maxZoom: demoMapBackdrop.maxZoom,
          maxBounds: demoExploreBounds(),
          minPitch: 0,
          maxPitch: 0,
          pitchWithRotate: false,
          dragRotate: false,
          touchPitch: false,
          cooperativeGestures: false,
          renderWorldCopies: false,
          fadeDuration: reduceMotion ? 0 : 280,
          attributionControl: true,
          logoPosition: 'bottom-left',
        })
        map.addControl(
          new mapboxgl.NavigationControl({ showCompass: false, visualizePitch: false }),
          'bottom-right',
        )
        map.touchZoomRotate.disableRotation()

        const bumpSize = () => {
          if (!map || cancelled) return
          map.resize()
        }

        map.on('load', () => {
          if (cancelled || !map) return
          window.clearTimeout(timer)
          bumpSize()
          map.fitBounds(demoResidentBounds(), {
            padding: viewPadding(),
            maxZoom: 16.5,
            duration: 0,
          })
          bumpSize()
          tintWater(map)
          ensureLinkLayers(map)
          const source = map.getSource('share-links')
          if (isGeoJsonSource(source)) {
            source.setData(linksGeoJson(residentsRef.current, linksRef.current, selectedLinkRef.current))
          }
          bindLinkClicks(map, handlersRef)
          mapRef.current = map
          setReady(true)
          requestAnimationFrame(bumpSize)
          map.once('idle', bumpSize)
        })

        map.on('error', (event) => {
          if (cancelled) return
          if (isAuthFailure(event.error) || isMapLoadFailure(event.error)) setFailed(true)
        })

        const shell = container.parentElement
        const observer = new ResizeObserver(bumpSize)
        observer.observe(shell ?? container)
        map.once('remove', () => observer.disconnect())
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      setReady(false)
      markersRef.current = []
      map?.remove()
      if (mapRef.current === map) mapRef.current = null
    }
  }, [token, failed])

  const markerSignature = [
    residents.map((resident) => resident.id).join(','),
    links.map((link) => `${link.id}:${link.active ? 1 : 0}`).join(','),
    [...lendingIds].sort().join(','),
  ].join('|')

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return

    let cancelled = false
    void import('mapbox-gl/esm').then((mapboxgl) => {
      if (cancelled || mapRef.current !== map) return
      for (const marker of markersRef.current) marker.remove()
      markersRef.current = residents.map((resident) =>
        createMarker(mapboxgl, map, resident, links, lendingIds.has(resident.id), handlersRef),
      )
      applySelection(markersRef.current, selectedIdRef.current)
    })

    return () => {
      cancelled = true
      for (const marker of markersRef.current) marker.remove()
      markersRef.current = []
    }
  }, [ready, markerSignature, residents, links, lendingIds])

  useEffect(() => {
    applySelection(markersRef.current, selectedId)
  }, [selectedId, markerSignature])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const source = map.getSource('share-links')
    if (!isGeoJsonSource(source)) return
    source.setData(linksGeoJson(residents, links, selectedLinkId))
  }, [ready, residents, links, selectedLinkId])

  function resetView() {
    const map = mapRef.current
    if (!map) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    map.fitBounds(demoResidentBounds(), {
      padding: viewPadding(),
      maxZoom: 16.5,
      pitch: 0,
      bearing: 0,
      duration: reduceMotion ? 0 : 650,
    })
  }

  if (!token || failed) {
    return (
      <MapFallback
        missingToken={!token}
        reason={
          token
            ? 'Mapbox rejected the token or the style did not load. Check VITE_MAPBOX_ACCESS_TOKEN, its URL restrictions, and your connection.'
            : 'Add VITE_MAPBOX_ACCESS_TOKEN to .env.local and restart Relay. Use a public Mapbox token, and keep it out of source control.'
        }
        residents={residents}
        links={links}
        lendingIds={lendingIds}
        selectedId={selectedId}
        onSelectResident={onSelectResident}
        onSelectLink={onSelectLink}
        emptyMessage={emptyMessage}
      />
    )
  }

  return (
    <div className="hood-map">
      <div
        ref={containerRef}
        className="hood-map-canvas"
        role="region"
        aria-label={`Map of ${demoMapBackdrop.name} with fictional demo residents`}
      />
      <div className="hood-map-toolbar">
        <button type="button" className="hood-reset" onClick={resetView} disabled={!ready}>
          Neighborhood view
        </button>
      </div>
      {emptyMessage ? <p className="hood-map-empty">{emptyMessage}</p> : null}
      {ready ? null : (
        <p className="hood-map-pending" id={statusId} role="status">
          Opening the neighborhood map
        </p>
      )}
    </div>
  )
}

function MapFallback({
  missingToken,
  reason,
  residents,
  links,
  lendingIds,
  selectedId,
  onSelectResident,
  onSelectLink,
  emptyMessage,
}: {
  missingToken: boolean
  reason: string
  residents: readonly SceneResident[]
  links: readonly ShareLink[]
  lendingIds: ReadonlySet<string>
  selectedId: string | null
  onSelectResident: (id: string) => void
  onSelectLink: (id: string) => void
  emptyMessage: string | null
}) {
  return (
    <div className="hood-fallback">
      <p className="hood-fallback-title" role="status">
        {missingToken ? 'The neighborhood map needs a Mapbox token' : 'The neighborhood map could not open'}
      </p>
      <p className="hood-fallback-copy">{reason}</p>
      {emptyMessage ? <p className="hood-map-empty hood-map-empty-static">{emptyMessage}</p> : null}
      {residents.length > 0 ? (
        <ul className="hood-roster">
          {residents.map((resident) => {
            const related = linksForResident(resident.id, links)
            const lending = lendingIds.has(resident.id)
            const active = related.some((link) => link.active)
            const pending = related.some((link) => !link.active)
            return (
              <li key={resident.id}>
                <div className={markerClassName({ lending, active, pending, selected: selectedId === resident.id })}>
                  <div className="hood-marker-pin">
                    <button
                      type="button"
                      className="hood-marker-btn"
                      aria-pressed={selectedId === resident.id}
                      aria-label={markerLabel(resident, lending, active, pending)}
                      onClick={() => onSelectResident(resident.id)}
                    >
                      <span className="hood-marker-face" aria-hidden="true">
                        {resident.initials}
                      </span>
                      <span className="hood-marker-name">{resident.isYou ? 'You' : firstName(resident.name)}</span>
                    </button>
                    {related.length > 0 ? (
                      <button
                        type="button"
                        className="hood-marker-loan"
                        aria-label={loanPipLabel(related)}
                        onClick={() => {
                          if (related.length === 1 && related[0]) onSelectLink(related[0].id)
                          else onSelectResident(resident.id)
                        }}
                      />
                    ) : null}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

function createMarker(
  mapboxgl: MapboxModule,
  map: MapboxMap,
  resident: SceneResident,
  links: readonly ShareLink[],
  lending: boolean,
  handlersRef: { current: { onSelectResident: (id: string) => void; onSelectLink: (id: string) => void } },
) {
  const related = linksForResident(resident.id, links)
  const active = related.some((link) => link.active)
  const pending = related.some((link) => !link.active)

  const root = document.createElement('div')
  root.className = markerClassName({ lending, active, pending, selected: false })
  root.dataset.residentId = resident.id

  const pin = document.createElement('div')
  pin.className = 'hood-marker-pin'

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'hood-marker-btn'
  button.setAttribute('aria-pressed', 'false')
  button.setAttribute('aria-label', markerLabel(resident, lending, active, pending))
  button.addEventListener('click', (event) => {
    event.stopPropagation()
    handlersRef.current.onSelectResident(resident.id)
  })

  const face = document.createElement('span')
  face.className = 'hood-marker-face'
  face.textContent = resident.initials
  face.setAttribute('aria-hidden', 'true')

  const name = document.createElement('span')
  name.className = 'hood-marker-name'
  name.textContent = resident.isYou ? 'You' : firstName(resident.name)

  button.append(face, name)
  pin.append(button)

  if (related.length > 0) {
    const pip = document.createElement('button')
    pip.type = 'button'
    pip.className = 'hood-marker-loan'
    pip.setAttribute('aria-label', loanPipLabel(related))
    pip.addEventListener('click', (event) => {
      event.stopPropagation()
      const only = related.length === 1 ? related[0] : null
      if (only) handlersRef.current.onSelectLink(only.id)
      else handlersRef.current.onSelectResident(resident.id)
    })
    pin.append(pip)
  }

  root.append(pin)
  return new mapboxgl.Marker({ element: root, anchor: 'center' })
    .setLngLat([resident.longitude, resident.latitude])
    .addTo(map)
}

function applySelection(markers: readonly Marker[], selectedId: string | null) {
  for (const marker of markers) {
    const root = marker.getElement()
    const selected = root.dataset.residentId === selectedId
    root.classList.toggle('hood-marker-selected', selected)
    root.style.zIndex = selected ? '3' : '1'
    root.querySelector('.hood-marker-btn')?.setAttribute('aria-pressed', selected ? 'true' : 'false')
  }
}

function markerClassName({
  lending,
  active,
  pending,
  selected,
}: {
  lending: boolean
  active: boolean
  pending: boolean
  selected: boolean
}) {
  return [
    'hood-marker',
    lending ? 'hood-marker-lending' : '',
    active ? 'hood-marker-active' : '',
    !active && pending ? 'hood-marker-pending' : '',
    selected ? 'hood-marker-selected' : '',
  ]
    .filter(Boolean)
    .join(' ')
}

function markerLabel(resident: SceneResident, lending: boolean, active: boolean, pending: boolean) {
  const who = resident.isYou ? `${resident.name}, you` : resident.name
  const lend = lending ? 'Has items to lend.' : 'Nothing listed to lend.'
  const loan = active ? ' In an active loan.' : pending ? ' Has a loan request.' : ''
  return `${who}. Fictional demo resident. ${lend}${loan}`
}

function loanPipLabel(links: readonly ShareLink[]) {
  if (links.length === 1 && links[0]) return `${links[0].itemName}, ${links[0].status}`
  const active = links.filter((link) => link.active).length
  return active > 0 ? `${active} active loans` : `${links.length} loan requests`
}

function firstName(name: string) {
  return name.split(' ')[0] ?? name
}

function viewPadding() {
  return { top: 72, right: 56, bottom: 78, left: 48 }
}

function mapboxToken() {
  const value = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN
  return typeof value === 'string' ? value.trim() : ''
}

function isAuthFailure(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const status = 'status' in error && typeof error.status === 'number' ? error.status : undefined
  const message = 'message' in error && typeof error.message === 'string' ? error.message : ''
  if (status === 401 || status === 403) return true
  return /unauthorized|forbidden|invalid token|access token/i.test(message)
}

function isMapLoadFailure(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const status = 'status' in error && typeof error.status === 'number' ? error.status : undefined
  const message = 'message' in error && typeof error.message === 'string' ? error.message : ''
  if (status === 404 || status === 422 || (typeof status === 'number' && status >= 500)) return true
  return /failed to fetch|failed to load|style|tile|network|abort/i.test(message)
}

function isGeoJsonSource(source: unknown): source is GeoJSONSource {
  return Boolean(source && typeof source === 'object' && 'setData' in source)
}

function tintWater(map: MapboxMap) {
  if (!map.getLayer('water')) return
  try {
    map.setPaintProperty('water', 'fill-color', '#c5eef6')
  } catch {
    // The streets style may rename this layer. Leave the default water color.
  }
}

function ensureLinkLayers(map: MapboxMap) {
  if (map.getSource('share-links')) return
  map.addSource('share-links', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })

  map.addLayer({
    id: 'share-links-casing',
    type: 'line',
    source: 'share-links',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#ffffff',
      'line-width': ['case', ['==', ['get', 'selected'], 1], 8, 6],
      'line-opacity': 0.92,
    },
  })
  map.addLayer({
    id: 'share-links-active',
    type: 'line',
    source: 'share-links',
    filter: ['==', ['get', 'active'], 1],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['case', ['==', ['get', 'selected'], 1], '#0c756e', '#14b8a6'],
      'line-width': ['case', ['==', ['get', 'selected'], 1], 4.5, 2.75],
    },
  })
  map.addLayer({
    id: 'share-links-pending',
    type: 'line',
    source: 'share-links',
    filter: ['==', ['get', 'active'], 0],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#0c749f',
      'line-width': ['case', ['==', ['get', 'selected'], 1], 4, 2.25],
      'line-dasharray': [1.4, 1.5],
      'line-opacity': 0.9,
    },
  })
  map.addLayer({
    id: 'share-links-hit',
    type: 'line',
    source: 'share-links',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#123044',
      'line-width': 16,
      'line-opacity': 0.01,
    },
  })
}

function bindLinkClicks(
  map: MapboxMap,
  handlersRef: { current: { onSelectLink: (id: string) => void } },
) {
  map.on('click', 'share-links-hit', (event) => {
    const feature = event.features?.[0] as { properties?: { id?: unknown } } | undefined
    const id = feature?.properties?.id
    if (typeof id === 'string' && id) handlersRef.current.onSelectLink(id)
  })
  map.on('mouseenter', 'share-links-hit', () => {
    map.getCanvas().style.cursor = 'pointer'
  })
  map.on('mouseleave', 'share-links-hit', () => {
    map.getCanvas().style.cursor = ''
  })
}

function linksGeoJson(
  residents: readonly SceneResident[],
  links: readonly ShareLink[],
  selectedLinkId: string | null,
) {
  const groups = new Map<string, ShareLink[]>()
  for (const link of links) {
    const key = [link.fromId, link.toId].sort().join('|')
    const group = groups.get(key)
    if (group) group.push(link)
    else groups.set(key, [link])
  }

  return {
    type: 'FeatureCollection' as const,
    features: links.flatMap((link) => {
      const from = residents.find((resident) => resident.id === link.fromId)
      const to = residents.find((resident) => resident.id === link.toId)
      if (!from || !to) return []
      const key = [link.fromId, link.toId].sort().join('|')
      const group = groups.get(key) ?? [link]
      const slot = Math.max(0, group.findIndex((item) => item.id === link.id))
      return [
        {
          type: 'Feature' as const,
          properties: {
            id: link.id,
            active: link.active ? 1 : 0,
            selected: link.id === selectedLinkId ? 1 : 0,
          },
          geometry: {
            type: 'LineString' as const,
            coordinates: lineCoordinates(from, to, slot, group.length),
          },
        },
      ]
    }),
  }
}

function lineCoordinates(from: SceneResident, to: SceneResident, slot: number, count: number) {
  const start: [number, number] = [from.longitude, from.latitude]
  const end: [number, number] = [to.longitude, to.latitude]
  if (count < 2) return [start, end]
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  const length = Math.hypot(dx, dy) || 1
  const shift = (slot - (count - 1) / 2) * 0.00018
  const mid: [number, number] = [
    (start[0] + end[0]) / 2 + (-dy / length) * shift,
    (start[1] + end[1]) / 2 + (dx / length) * shift,
  ]
  return [start, mid, end]
}
