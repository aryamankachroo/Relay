import type { SceneResident, ShareLink } from '../data/neighborhood.ts'

type NeighborhoodSceneProps = {
  residents: readonly SceneResident[]
  links: readonly ShareLink[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export function NeighborhoodScene({
  residents,
  links,
  selectedId,
  onSelect,
}: NeighborhoodSceneProps) {
  return (
    <svg
      className="hood-scene"
      viewBox="0 0 800 480"
      role="img"
      aria-label="Stylized map of the Willow Court demo community with four homes"
    >
      <defs>
        <linearGradient id="hood-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--relay-color-sky-500)" />
          <stop offset="42%" stopColor="var(--relay-color-sky-300)" />
          <stop offset="100%" stopColor="var(--relay-color-mint-300)" />
        </linearGradient>
        <linearGradient id="hood-hill-a" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--relay-color-leaf-300)" />
          <stop offset="100%" stopColor="var(--relay-color-leaf-500)" />
        </linearGradient>
        <linearGradient id="hood-hill-b" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--relay-color-mint-500)" />
          <stop offset="100%" stopColor="var(--relay-color-leaf-700)" />
        </linearGradient>
        <linearGradient id="hood-water" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--relay-color-aqua-300)" />
          <stop offset="55%" stopColor="var(--relay-color-sky-500)" />
          <stop offset="100%" stopColor="var(--relay-color-turquoise-500)" />
        </linearGradient>
        <radialGradient id="hood-bubble" cx="32%" cy="30%" r="70%">
          <stop offset="0%" stopColor="white" stopOpacity="0.95" />
          <stop offset="45%" stopColor="white" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--relay-color-aqua-500)" stopOpacity="0.22" />
        </radialGradient>
        <filter id="hood-soft" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#0c749f" floodOpacity="0.18" />
        </filter>
      </defs>

      <rect width="800" height="480" fill="url(#hood-sky)" />

      <g className="hood-clouds" aria-hidden="true">
        <Cloud x={90} y={58} scale={1.1} />
        <Cloud x={310} y={42} scale={0.85} />
        <Cloud x={560} y={70} scale={1.25} />
        <Cloud x={700} y={48} scale={0.7} />
      </g>

      <ellipse className="hood-sun" cx="720" cy="78" rx="36" ry="36" />
      <ellipse className="hood-sun-glow" cx="720" cy="78" rx="52" ry="52" />

      <path
        d="M-20 310 C120 250 220 270 340 300 C460 330 560 250 820 290 L820 480 L-20 480 Z"
        fill="url(#hood-hill-a)"
      />
      <path
        d="M-20 360 C160 320 280 380 420 350 C560 320 660 390 820 360 L820 480 L-20 480 Z"
        fill="url(#hood-hill-b)"
        opacity="0.88"
      />

      <ellipse cx="430" cy="410" rx="118" ry="34" fill="url(#hood-water)" opacity="0.92" />
      <ellipse cx="400" cy="398" rx="42" ry="10" fill="white" opacity="0.35" />
      <ellipse cx="470" cy="416" rx="28" ry="7" fill="white" opacity="0.22" />

      <g aria-hidden="true">
        <circle className="hood-bubble" cx="390" cy="360" r="10" fill="url(#hood-bubble)" />
        <circle className="hood-bubble hood-bubble-b" cx="455" cy="372" r="7" fill="url(#hood-bubble)" />
        <circle className="hood-bubble hood-bubble-c" cx="420" cy="348" r="5" fill="url(#hood-bubble)" />
      </g>

      <g className="hood-links" aria-hidden="true">
        {links.map((link) => {
          const from = residents.find((resident) => resident.id === link.fromId)
          const to = residents.find((resident) => resident.id === link.toId)
          if (!from || !to) return null
          const midX = (from.x + to.x) / 2
          const midY = Math.min(from.y, to.y) - 48
          return (
            <g key={link.id} className={link.active ? 'hood-link hood-link-active' : 'hood-link'}>
              <path
                d={`M ${from.x} ${from.y - 18} Q ${midX} ${midY} ${to.x} ${to.y - 18}`}
                fill="none"
                strokeWidth={link.active ? 3.5 : 2}
                strokeDasharray={link.active ? undefined : '6 7'}
              />
              {link.active ? (
                <circle className="hood-link-dot" cx={midX} cy={midY + 8} r="4.5" />
              ) : null}
            </g>
          )
        })}
      </g>

      {residents.map((resident) => (
        <HouseButton
          key={resident.id}
          resident={resident}
          selected={selectedId === resident.id}
          onSelect={onSelect}
        />
      ))}
    </svg>
  )
}

function Cloud({ x, y, scale }: { x: number; y: number; scale: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <g className="hood-cloud">
        <ellipse cx="0" cy="10" rx="34" ry="16" fill="white" opacity="0.88" />
        <ellipse cx="22" cy="4" rx="22" ry="18" fill="white" opacity="0.92" />
        <ellipse cx="-20" cy="6" rx="18" ry="14" fill="white" opacity="0.9" />
        <ellipse cx="8" cy="-2" rx="16" ry="12" fill="white" opacity="0.95" />
      </g>
    </g>
  )
}

function HouseButton({
  resident,
  selected,
  onSelect,
}: {
  resident: SceneResident
  selected: boolean
  onSelect: (id: string) => void
}) {
  const label = `${resident.name}${resident.isYou ? ' (you)' : ''}, ${resident.street}`

  return (
    <g
      className={['hood-house', selected ? 'hood-house-selected' : ''].filter(Boolean).join(' ')}
      transform={`translate(${resident.x} ${resident.y})`}
      filter="url(#hood-soft)"
    >
      <title>{label}</title>
      <circle className="hood-house-halo" cx="0" cy="-6" r="46" />
      <ellipse cx="0" cy="28" rx="34" ry="8" fill="#146b36" opacity="0.28" />
      <rect x="-28" y="-8" width="56" height="36" rx="4" fill={resident.wall} />
      <path d="M-36 -8 L0 -40 L36 -8 Z" fill={resident.roof} />
      <rect x="-4" y="-34" width="10" height="12" rx="2" fill="#2f4d60" opacity="0.55" />
      <rect x="-8" y="4" width="16" height="24" rx="2" fill="#0c749f" opacity="0.75" />
      <rect x="-22" y="2" width="12" height="12" rx="2" fill="#9adcfb" opacity="0.9" />
      <rect x="10" y="2" width="12" height="12" rx="2" fill="#9adcfb" opacity="0.9" />
      <circle cx="-18" cy="-2" r="2.2" fill="white" opacity="0.75" />
      <circle cx="0" cy="-22" r="16" className="hood-avatar" />
      <text className="hood-avatar-text" x="0" y="-18" textAnchor="middle">
        {resident.initials}
      </text>
      <text className="hood-name" x="0" y="48" textAnchor="middle">
        {resident.isYou ? 'You' : resident.name.split(' ')[0]}
      </text>
      <rect
        className="hood-house-hit"
        x="-40"
        y="-52"
        width="80"
        height="108"
        rx="16"
        role="button"
        tabIndex={0}
        aria-label={label}
        aria-pressed={selected}
        onClick={() => onSelect(resident.id)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onSelect(resident.id)
          }
        }}
      />
    </g>
  )
}
