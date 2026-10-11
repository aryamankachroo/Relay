import { useId, useMemo } from 'react'
import { Flower2 } from 'lucide-react'
import { GlassCard } from '../components/GlassCard.tsx'
import { GardenScene } from '../components/GardenScene.tsx'
import { isHandoffComplete } from '../data/exchanges.ts'
import { isLoanComplete } from '../data/lending.ts'
import {
  countCompletedReuse,
  gardenStageForCount,
  gardenStageLabel,
} from '../data/reuse.ts'
import { useHandoffs } from '../state/handoffStore.ts'
import { useLoanRequests } from '../state/loanStore.ts'

export function GardenPage() {
  const headingId = useId()
  const { requests: loans } = useLoanRequests()
  const { handoffs } = useHandoffs()

  const reuseCount = useMemo(
    () => countCompletedReuse(loans, handoffs),
    [loans, handoffs],
  )
  const stage = gardenStageForCount(reuseCount)
  const completedLoans = loans.filter((loan) => isLoanComplete(loan.status)).length
  const completedHandoffs = handoffs.filter((handoff) => isHandoffComplete(handoff.status)).length

  return (
    <section className="garden-page" aria-labelledby={headingId}>
      <GlassCard tone="strong" className="garden-hero">
        <div className="garden-hero-badge">
          <span className="icon-chip" style={{ backgroundColor: 'var(--relay-color-leaf-300)' }}>
            <Flower2 aria-hidden="true" size={22} />
          </span>
          <div className="grid gap-1">
            <p className="eyebrow">Shared beds</p>
            <h1 id={headingId} className="garden-title">
              Garden
            </h1>
          </div>
        </div>
        <p className="garden-lead">
          A playful bed that fills in as neighbors finish loans and handoffs. Decorative only — not a
          claim that trees were planted.
        </p>
      </GlassCard>

      <GlassCard tone="solid" className="garden-counter-card">
        <div className="garden-counter">
          <span className="garden-counter-value" aria-live="polite">
            {reuseCount}
          </span>
          <div className="garden-counter-copy">
            <p className="garden-counter-label">Completed reuse events</p>
            <p className="hint">
              {completedLoans} returned loan{completedLoans === 1 ? '' : 's'} · {completedHandoffs}{' '}
              received handoff{completedHandoffs === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        <p className="garden-stage-chip">{gardenStageLabel(stage)}</p>
      </GlassCard>

      <GlassCard tone="solid" className="garden-stage">
        <GardenScene stage={stage} />
        <p className="garden-caption hint">
          Beds grow through simple stages as the reuse count from Activity increases. No carbon or
          planting offsets are calculated here.
        </p>
      </GlassCard>
    </section>
  )
}
