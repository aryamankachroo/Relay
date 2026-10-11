import { Check } from 'lucide-react'

export function StatusTimeline({
  steps,
  current,
  completeLabel,
}: {
  steps: readonly string[]
  current: string
  completeLabel?: string
}) {
  const currentIndex = steps.indexOf(current)
  const complete = currentIndex === steps.length - 1

  return (
    <ol className="status-timeline" aria-label="Progress">
      {steps.map((step, index) => {
        const done = index < currentIndex || (complete && index === currentIndex)
        const active = index === currentIndex && !complete
        return (
          <li
            key={step}
            className={
              done ? 'status-step status-step-done' : active ? 'status-step status-step-active' : 'status-step'
            }
          >
            <span className="status-step-dot" aria-hidden="true">
              {done ? <Check size={12} /> : index + 1}
            </span>
            <span className="status-step-label">
              {complete && index === currentIndex && completeLabel ? completeLabel : step}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

export function StatusBadge({
  status,
  tone,
}: {
  status: string
  tone: 'pending' | 'active' | 'done'
}) {
  return <span className={`status-badge status-badge-${tone}`}>{status}</span>
}
