import type { HTMLAttributes } from 'react'

export type GlassTone = 'glass' | 'strong' | 'solid'

type GlassCardProps = HTMLAttributes<HTMLDivElement> & {
  tone?: GlassTone
}

export function GlassCard({
  tone = 'strong',
  className,
  children,
  ...props
}: GlassCardProps) {
  return (
    <div
      className={['glass-card', `glass-card-${tone}`, className].filter(Boolean).join(' ')}
      {...props}
    >
      {children}
    </div>
  )
}
