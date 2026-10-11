import type { LucideIcon } from 'lucide-react'
import { GlassCard } from './GlassCard.tsx'

export function PlaceholderPage({
  kicker,
  title,
  description,
  note,
  icon: Icon,
  accent,
}: {
  kicker: string
  title: string
  description: string
  note: string
  icon: LucideIcon
  accent: string
}) {
  return (
    <section className="grid max-w-2xl">
      <GlassCard tone="strong" className="grid gap-4">
        <div className="flex items-center gap-4">
          <div className="icon-chip shrink-0" style={{ backgroundColor: accent }}>
            <Icon aria-hidden="true" size={22} />
          </div>
          <div className="grid gap-1">
            <p className="eyebrow">{kicker}</p>
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
          </div>
        </div>
        <p className="max-w-xl text-lg leading-relaxed text-ink-soft">{description}</p>
        <p className="hint">{note}</p>
      </GlassCard>
    </section>
  )
}
