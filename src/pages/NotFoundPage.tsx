import { Link } from 'react-router'
import { GlassCard } from '../components/GlassCard.tsx'

export function NotFoundPage() {
  return (
    <section className="not-found-page" aria-labelledby="not-found-title">
      <GlassCard tone="strong" className="not-found-card">
        <p className="eyebrow">Off the path</p>
        <h1 id="not-found-title" className="not-found-title">
          Page not found
        </h1>
        <p className="hint">That route is not part of the Relay demo.</p>
        <Link to="/" className="tool-primary not-found-link">
          Back to Chat
        </Link>
      </GlassCard>
    </section>
  )
}
