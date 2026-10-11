import type { GardenStage } from '../data/reuse.ts'

type GardenSceneProps = {
  stage: GardenStage
}

export function GardenScene({ stage }: GardenSceneProps) {
  return (
    <svg
      className="garden-scene"
      viewBox="0 0 800 420"
      role="img"
      aria-label={`Shared garden illustration at growth stage ${stage}`}
      data-stage={stage}
    >
      <defs>
        <linearGradient id="garden-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--relay-color-sky-500)" />
          <stop offset="38%" stopColor="var(--relay-color-sky-300)" />
          <stop offset="100%" stopColor="var(--relay-color-mint-300)" />
        </linearGradient>
        <linearGradient id="garden-lawn" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--relay-color-leaf-300)" />
          <stop offset="55%" stopColor="var(--relay-color-leaf-500)" />
          <stop offset="100%" stopColor="var(--relay-color-leaf-700)" />
        </linearGradient>
        <linearGradient id="garden-pond" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--relay-color-aqua-300)" />
          <stop offset="50%" stopColor="var(--relay-color-turquoise-500)" />
          <stop offset="100%" stopColor="var(--relay-color-sky-700)" />
        </linearGradient>
        <radialGradient id="garden-gloss" cx="30%" cy="28%" r="70%">
          <stop offset="0%" stopColor="white" stopOpacity="0.95" />
          <stop offset="40%" stopColor="white" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--relay-color-aqua-500)" stopOpacity="0.2" />
        </radialGradient>
        <linearGradient id="garden-petal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff4f8" />
          <stop offset="100%" stopColor="#f4a8c4" />
        </linearGradient>
        <linearGradient id="garden-petal-b" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff9e8" />
          <stop offset="100%" stopColor="#f0c45a" />
        </linearGradient>
      </defs>

      <rect width="800" height="420" fill="url(#garden-sky)" />

      <g className="garden-clouds" aria-hidden="true">
        <ellipse cx="120" cy="56" rx="48" ry="20" fill="white" opacity="0.85" />
        <ellipse cx="150" cy="48" rx="28" ry="22" fill="white" opacity="0.9" />
        <ellipse cx="620" cy="64" rx="56" ry="22" fill="white" opacity="0.82" />
        <ellipse cx="655" cy="54" rx="30" ry="20" fill="white" opacity="0.9" />
      </g>

      <circle className="garden-sun" cx="700" cy="72" r="34" />
      <circle className="garden-sun-ring" cx="700" cy="72" r="48" />

      <path
        d="M0 210 C140 170 260 190 400 175 C540 160 660 190 800 170 L800 420 L0 420 Z"
        fill="url(#garden-lawn)"
      />
      <path
        d="M0 280 C180 250 320 300 480 270 C640 240 720 300 800 275 L800 420 L0 420 Z"
        fill="var(--relay-color-mint-700)"
        opacity="0.22"
      />

      <ellipse cx="210" cy="310" rx="92" ry="36" fill="url(#garden-pond)" />
      <ellipse cx="185" cy="298" rx="36" ry="10" fill="white" opacity="0.35" />
      <circle className="garden-bubble" cx="170" cy="278" r="9" fill="url(#garden-gloss)" />
      <circle className="garden-bubble garden-bubble-b" cx="230" cy="286" r="6" fill="url(#garden-gloss)" />
      <circle className="garden-bubble garden-bubble-c" cx="200" cy="268" r="4.5" fill="url(#garden-gloss)" />

      <Bed x={360} y={250} />
      <Bed x={500} y={268} />
      <Bed x={640} y={248} />

      {stage >= 1 ? (
        <g className="garden-growth garden-growth-1" aria-hidden="true">
          <Sprout x={390} y={248} />
          <Sprout x={430} y={252} />
          <Sprout x={530} y={266} />
        </g>
      ) : null}

      {stage >= 2 ? (
        <g className="garden-growth garden-growth-2" aria-hidden="true">
          <YoungPlant x={410} y={236} />
          <YoungPlant x={560} y={254} />
          <YoungPlant x={670} y={236} />
          <Sprout x={650} y={252} />
        </g>
      ) : null}

      {stage >= 3 ? (
        <g className="garden-growth garden-growth-3" aria-hidden="true">
          <Flower x={450} y={220} petal="url(#garden-petal)" />
          <Flower x={600} y={238} petal="url(#garden-petal-b)" />
          <Flower x={700} y={222} petal="url(#garden-petal)" />
          <Bush x={360} y={300} />
        </g>
      ) : null}

      {stage >= 4 ? (
        <g className="garden-growth garden-growth-4" aria-hidden="true">
          <Flower x={480} y={210} petal="url(#garden-petal-b)" />
          <Flower x={540} y={224} petal="url(#garden-petal)" />
          <Flower x={720} y={210} petal="url(#garden-petal-b)" />
          <Bush x={760} y={290} />
          <circle className="garden-bubble" cx="520" cy="180" r="8" fill="url(#garden-gloss)" />
          <circle className="garden-bubble garden-bubble-b" cx="610" cy="160" r="5" fill="url(#garden-gloss)" />
          <path
            className="garden-butterfly"
            d="M140 150 C150 130 170 130 175 150 C170 140 155 140 140 150 Z M175 150 C180 130 200 130 210 150 C200 140 185 140 175 150 Z"
            fill="var(--relay-color-turquoise-300)"
            opacity="0.9"
          />
        </g>
      ) : null}

      <g aria-hidden="true">
        <ellipse cx="90" cy="340" rx="18" ry="8" fill="var(--relay-color-leaf-700)" opacity="0.35" />
        <path d="M90 340 C70 300 55 290 48 270" stroke="var(--relay-color-leaf-700)" strokeWidth="4" fill="none" />
        <ellipse cx="48" cy="262" rx="16" ry="10" fill="var(--relay-color-mint-500)" transform="rotate(-20 48 262)" />
        <ellipse cx="62" cy="275" rx="14" ry="9" fill="var(--relay-color-leaf-300)" transform="rotate(18 62 275)" />
      </g>
    </svg>
  )
}

function Bed({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="40" cy="28" rx="58" ry="18" fill="#5a3a24" opacity="0.55" />
      <ellipse cx="40" cy="24" rx="52" ry="14" fill="#7a5130" />
      <ellipse cx="28" cy="20" rx="10" ry="4" fill="#4a2e1a" opacity="0.35" />
      <ellipse cx="52" cy="22" rx="8" ry="3" fill="#4a2e1a" opacity="0.28" />
    </g>
  )
}

function Sprout({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="garden-sprout">
        <path d="M0 20 C0 8 2 4 0 0" stroke="var(--relay-color-leaf-700)" strokeWidth="2.5" fill="none" />
        <ellipse cx="-6" cy="4" rx="7" ry="4" fill="var(--relay-color-mint-500)" transform="rotate(-35 -6 4)" />
        <ellipse cx="6" cy="6" rx="7" ry="4" fill="var(--relay-color-leaf-300)" transform="rotate(35 6 6)" />
      </g>
    </g>
  )
}

function YoungPlant({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="garden-plant">
        <path d="M0 36 C0 18 2 10 0 0" stroke="var(--relay-color-leaf-700)" strokeWidth="3" fill="none" />
        <ellipse cx="-12" cy="12" rx="12" ry="6" fill="var(--relay-color-leaf-500)" transform="rotate(-28 -12 12)" />
        <ellipse cx="12" cy="16" rx="12" ry="6" fill="var(--relay-color-mint-500)" transform="rotate(28 12 16)" />
        <ellipse cx="-4" cy="2" rx="9" ry="5" fill="var(--relay-color-leaf-300)" transform="rotate(-10 -4 2)" />
      </g>
    </g>
  )
}

function Flower({ x, y, petal }: { x: number; y: number; petal: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="garden-flower">
        <path d="M0 48 C0 28 1 16 0 4" stroke="var(--relay-color-leaf-700)" strokeWidth="3" fill="none" />
        <ellipse cx="-10" cy="28" rx="10" ry="5" fill="var(--relay-color-mint-500)" transform="rotate(-40 -10 28)" />
        <circle cx="0" cy="0" r="7" fill={petal} />
        <circle cx="-9" cy="-2" r="6" fill={petal} />
        <circle cx="9" cy="-2" r="6" fill={petal} />
        <circle cx="-5" cy="8" r="6" fill={petal} />
        <circle cx="5" cy="8" r="6" fill={petal} />
        <circle cx="0" cy="2" r="4" fill="#f0c45a" />
        <circle cx="-1" cy="0" r="1.4" fill="white" opacity="0.7" />
      </g>
    </g>
  )
}

function Bush({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="0" cy="0" rx="28" ry="16" fill="var(--relay-color-leaf-500)" />
      <ellipse cx="-16" cy="4" rx="16" ry="12" fill="var(--relay-color-mint-500)" />
      <ellipse cx="16" cy="4" rx="16" ry="12" fill="var(--relay-color-leaf-300)" />
      <ellipse cx="-8" cy="-6" rx="10" ry="7" fill="var(--relay-color-mint-300)" opacity="0.8" />
    </g>
  )
}
