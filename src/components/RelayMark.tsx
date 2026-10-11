import { useId } from 'react'

export function RelayMark({ className }: { className?: string }) {
  const gradientId = `relay-${useId().replace(/:/g, '')}`

  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <radialGradient id={gradientId} cx="32%" cy="28%" r="78%">
          <stop offset="0%" stopColor="#e7ffd4" />
          <stop offset="48%" stopColor="#5ed67c" />
          <stop offset="100%" stopColor="#146b36" />
        </radialGradient>
      </defs>
      <path fill={`url(#${gradientId})`} d="M24 5.2a18.8 18.8 0 1 0 .01 0z" />
      <ellipse
        cx="16.2"
        cy="14.8"
        rx="5.2"
        ry="2.5"
        fill="white"
        opacity="0.55"
        transform="rotate(-32 16.2 14.8)"
      />
    </svg>
  )
}
