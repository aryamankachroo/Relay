import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <section>
      <h1 className="text-2xl font-extrabold tracking-tight">Page not found</h1>
      <p className="mt-2 text-ink-soft">
        <Link to="/" className="link">
          Back to Chat
        </Link>
      </p>
    </section>
  )
}
