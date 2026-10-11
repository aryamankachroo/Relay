import { useId } from 'react'
import { itemKey } from '../data/exchanges.ts'

export function ItemPortrait({ item }: { item: string }) {
  const key = itemKey(item)
  const portrait =
    key === 'notebook' ? 'notebook' : key === 'ladder' ? 'ladder' : key === 'cooler' ? 'cooler' : 'parcel'

  return (
    <div className={`match-portrait match-portrait-${portrait}`}>
      {portrait === 'notebook' ? <NotebookArt /> : null}
      {portrait === 'ladder' ? <LadderArt /> : null}
      {portrait === 'cooler' ? <CoolerArt /> : null}
      {portrait === 'parcel' ? <ParcelArt /> : null}
    </div>
  )
}

function NotebookArt() {
  const id = useArtId()
  return (
    <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <ArtDefs id={id} />
      <ellipse className="tool-art-shadow" cx="60" cy="100" rx="34" ry="6" />
      <rect x="28" y="24" width="64" height="72" rx="10" fill={`url(#${id}-leaf)`} />
      <rect x="36" y="30" width="48" height="60" rx="6" className="tool-art-foam" />
      <path
        d="M44 42h32M44 54h32M44 66h24"
        fill="none"
        className="tool-art-edge"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <rect x="28" y="24" width="10" height="72" rx="4" fill={`url(#${id}-leaf-deep)`} />
    </svg>
  )
}

function LadderArt() {
  const id = useArtId()
  return (
    <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <ArtDefs id={id} />
      <ellipse className="tool-art-shadow" cx="60" cy="100" rx="36" ry="6" />
      <rect x="34" y="22" width="10" height="70" rx="5" fill={`url(#${id}-metal)`} />
      <rect x="76" y="22" width="10" height="70" rx="5" fill={`url(#${id}-metal)`} />
      <rect x="34" y="36" width="52" height="8" rx="4" fill={`url(#${id}-leaf)`} />
      <rect x="34" y="54" width="52" height="8" rx="4" fill={`url(#${id}-leaf)`} />
      <rect x="34" y="72" width="52" height="8" rx="4" fill={`url(#${id}-leaf)`} />
    </svg>
  )
}

function CoolerArt() {
  const id = useArtId()
  return (
    <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <ArtDefs id={id} />
      <ellipse className="tool-art-shadow" cx="60" cy="100" rx="34" ry="6" />
      <rect x="26" y="38" width="68" height="48" rx="14" fill={`url(#${id}-leaf)`} />
      <rect x="32" y="28" width="56" height="18" rx="8" fill={`url(#${id}-metal)`} />
      <rect x="48" y="52" width="24" height="10" rx="5" className="tool-art-foam" />
      <circle cx="40" cy="62" r="4" className="tool-art-sky-deep" />
    </svg>
  )
}

function ParcelArt() {
  const id = useArtId()
  return (
    <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <ArtDefs id={id} />
      <ellipse className="tool-art-shadow" cx="60" cy="100" rx="34" ry="6" />
      <rect x="30" y="34" width="60" height="50" rx="12" fill={`url(#${id}-leaf)`} />
      <path d="M30 52h60" stroke={`url(#${id}-metal)`} strokeWidth="6" />
      <path d="M60 34v50" stroke={`url(#${id}-metal)`} strokeWidth="6" />
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
  return `item-${useId().replace(/:/g, '')}`
}
