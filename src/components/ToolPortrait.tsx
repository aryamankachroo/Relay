import { useId } from 'react'
import type { ToolPortraitId } from '../data/lending.ts'

export function ToolPortrait({
  portrait,
  fallbackLabel,
}: {
  portrait?: ToolPortraitId
  fallbackLabel?: string
}) {
  if (!portrait) {
    const letter = (fallbackLabel?.trim().charAt(0) || '?').toUpperCase()
    return (
      <div className="match-portrait match-portrait-fallback" aria-hidden="true">
        <span className="match-portrait-letter">{letter}</span>
      </div>
    )
  }

  return (
    <div className={`match-portrait match-portrait-${portrait}`}>
      {portrait === 'circular-saw' ? <CircularSaw /> : null}
      {portrait === 'hand-saw' ? <HandSaw /> : null}
      {portrait === 'orbital-sander' ? <OrbitalSander /> : null}
      {portrait === 'cordless-drill' ? <CordlessDrill /> : null}
    </div>
  )
}

function CircularSaw() {
  const id = useArtId()
  return (
    <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <ArtDefs id={id} />
      <ellipse className="tool-art-shadow" cx="58" cy="100" rx="36" ry="6" />
      <rect x="74" y="46" width="28" height="16" rx="8" fill={`url(#${id}-leaf-deep)`} />
      <rect x="44" y="34" width="46" height="34" rx="14" fill={`url(#${id}-leaf)`} />
      <circle cx="46" cy="64" r="26" fill={`url(#${id}-metal)`} />
      <circle
        cx="46"
        cy="64"
        r="29"
        fill="none"
        className="tool-art-edge"
        strokeWidth="3.5"
        strokeDasharray="2.4 5.4"
      />
      <circle cx="46" cy="64" r="7.5" className="tool-art-sky-deep" />
      <circle cx="46" cy="64" r="3" className="tool-art-foam" />
      <rect x="16" y="84" width="62" height="8" rx="3" className="tool-art-sky-deep" />
      <circle cx="78" cy="46" r="4" className="tool-art-foam" />
    </svg>
  )
}

function HandSaw() {
  const id = useArtId()
  return (
    <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <ArtDefs id={id} />
      <ellipse className="tool-art-shadow" cx="60" cy="100" rx="38" ry="6" />
      <path fill={`url(#${id}-metal)`} d="M10 60 76 48v18L10 74z" />
      <path
        d="M16 72l6 8 6-8 6 8 6-8 6 8 6-8 6 8 6-8 6 8"
        fill="none"
        className="tool-art-edge"
        strokeWidth="3"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <rect x="72" y="40" width="34" height="38" rx="12" fill={`url(#${id}-leaf)`} />
      <circle cx="90" cy="59" r="8" className="tool-art-foam" />
      <circle cx="90" cy="59" r="8" fill="none" className="tool-art-edge" strokeWidth="2.5" />
    </svg>
  )
}

function OrbitalSander() {
  const id = useArtId()
  return (
    <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <ArtDefs id={id} />
      <ellipse className="tool-art-shadow" cx="64" cy="100" rx="36" ry="6" />
      <path
        d="M34 52c-14 4-16 24-4 30"
        fill="none"
        className="tool-art-edge"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <rect x="38" y="32" width="54" height="44" rx="18" fill={`url(#${id}-leaf)`} />
      <ellipse cx="65" cy="42" rx="16" ry="5" fill="white" opacity="0.38" />
      <rect x="54" y="48" width="20" height="9" rx="4.5" className="tool-art-foam" />
      <rect x="28" y="74" width="74" height="16" rx="5" className="tool-art-sky-deep" />
      <rect x="34" y="79" width="62" height="6" rx="2" className="tool-art-mint" />
    </svg>
  )
}

function CordlessDrill() {
  const id = useArtId()
  return (
    <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <ArtDefs id={id} />
      <ellipse className="tool-art-shadow" cx="60" cy="100" rx="34" ry="6" />
      <rect x="18" y="50" width="42" height="22" rx="8" fill={`url(#${id}-metal)`} />
      <rect x="52" y="44" width="36" height="34" rx="12" fill={`url(#${id}-leaf)`} />
      <rect x="62" y="72" width="16" height="22" rx="6" fill={`url(#${id}-leaf-deep)`} />
      <rect x="8" y="56" width="16" height="10" rx="3" className="tool-art-sky-deep" />
      <circle cx="70" cy="56" r="5" className="tool-art-foam" />
      <ellipse cx="70" cy="48" rx="10" ry="4" fill="white" opacity="0.35" />
    </svg>
  )
}

function ArtDefs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#f4fcff" />
        <stop offset="55%" stopColor="#9adcfb" />
        <stop offset="100%" stopColor="#0c749f" />
      </linearGradient>
      <linearGradient id={`${id}-leaf`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#9ee58a" />
        <stop offset="100%" stopColor="#146b36" />
      </linearGradient>
      <linearGradient id={`${id}-leaf-deep`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#3cbf64" />
        <stop offset="100%" stopColor="#146b36" />
      </linearGradient>
    </defs>
  )
}

function useArtId() {
  return `tool-${useId().replace(/:/g, '')}`
}
