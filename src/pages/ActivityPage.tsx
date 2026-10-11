import { useId, useMemo, useState } from 'react'
import { Bell, Check, Clock, MapPin } from 'lucide-react'
import { GlassCard } from '../components/GlassCard.tsx'
import { ItemPortrait } from '../components/ItemPortrait.tsx'
import { StatusBadge, StatusTimeline } from '../components/StatusTimeline.tsx'
import { statusTone } from '../data/status.ts'
import { ToolPortrait } from '../components/ToolPortrait.tsx'
import {
  formatItemQuantity,
  handoffActionLabel,
  handoffStatusCopy,
  handoffStatusSteps,
  isHandoffComplete,
  type HandoffRecord,
} from '../data/exchanges.ts'
import {
  isLoanComplete,
  isResidentLending,
  loanActionLabel,
  loanStatusCopy,
  loanStatusSteps,
  type LoanRequest,
} from '../data/lending.ts'
import { useHandoffs } from '../state/handoffStore.ts'
import { useLoanRequests } from '../state/loanStore.ts'

type ActivityFilter = 'active' | 'completed'

type ActivityItem =
  | { kind: 'loan'; record: LoanRequest; sortKey: string }
  | { kind: 'handoff'; record: HandoffRecord; sortKey: string }

export function ActivityPage() {
  const headingId = useId()
  const { requests: loans, advanceLoan } = useLoanRequests()
  const { requests: exchanges, handoffs, advanceHandoff } = useHandoffs()
  const [filter, setFilter] = useState<ActivityFilter>('active')

  const items = useMemo(() => {
    const rows: ActivityItem[] = [
      ...loans.map((record) => ({
        kind: 'loan' as const,
        record,
        sortKey: record.id,
      })),
      ...handoffs.map((record) => ({
        kind: 'handoff' as const,
        record,
        sortKey: record.id,
      })),
    ]

    return rows.filter((item) => {
      const complete =
        item.kind === 'loan' ? isLoanComplete(item.record.status) : isHandoffComplete(item.record.status)
      return filter === 'completed' ? complete : !complete
    })
  }, [loans, handoffs, filter])

  const activeCount =
    loans.filter((loan) => !isLoanComplete(loan.status)).length +
    handoffs.filter((handoff) => !isHandoffComplete(handoff.status)).length
  const completedCount =
    loans.filter((loan) => isLoanComplete(loan.status)).length +
    handoffs.filter((handoff) => isHandoffComplete(handoff.status)).length

  return (
    <section className="activity-page" aria-labelledby={headingId}>
      <GlassCard tone="strong" className="activity-hero">
        <div className="activity-hero-badge">
          <span className="icon-chip" style={{ '--chip': 'var(--relay-color-aqua-300)' }}>
            <Bell aria-hidden="true" size={22} />
          </span>
          <div className="grid gap-1">
            <p className="eyebrow">Recent</p>
            <h1 id={headingId} className="activity-title">
              Activity
            </h1>
          </div>
        </div>
        <p className="activity-lead">
          Borrow Tomorrow loans and Hand Off exchanges in one place. Advance each step here or in
          Chat — returning a loan or marking a handoff received also grows the Garden counter.
        </p>
        <p className="hint">
          {activeCount} active · {completedCount} completed
        </p>
        <div className="activity-filters" role="group" aria-label="Filter activities">
          <FilterButton
            active={filter === 'active'}
            label="Active"
            count={activeCount}
            onClick={() => setFilter('active')}
          />
          <FilterButton
            active={filter === 'completed'}
            label="Completed"
            count={completedCount}
            onClick={() => setFilter('completed')}
          />
        </div>
      </GlassCard>

      {items.length === 0 ? (
        <GlassCard tone="glass" className="activity-empty">
          <p className="activity-empty-title">
            {filter === 'active' ? 'Nothing active right now' : 'No completed activity yet'}
          </p>
          <p className="hint">
            {filter === 'active'
              ? 'Request a loan or arrange a handoff in Chat, then come back here.'
              : 'Finished loans and handoffs will land in this list.'}
          </p>
        </GlassCard>
      ) : (
        <ul className="activity-list">
          {items.map((item) => (
            <li key={`${item.kind}-${item.record.id}`}>
              {item.kind === 'loan' ? (
                <LoanActivityCard loan={item.record} onAdvance={() => advanceLoan(item.record.id)} />
              ) : (
                <HandoffActivityCard
                  handoff={item.record}
                  requestQuantity={
                    exchanges.find((exchange) => exchange.id === item.record.requestId)?.quantity ??
                    item.record.quantity
                  }
                  onAdvance={() => advanceHandoff(item.record.id)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function FilterButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean
  label: string
  count: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={active ? 'activity-filter activity-filter-active' : 'activity-filter'}
      aria-pressed={active}
      onClick={onClick}
    >
      <span>{label}</span>
      <span className="activity-filter-count">{count}</span>
    </button>
  )
}

function LoanActivityCard({ loan, onAdvance }: { loan: LoanRequest; onAdvance: () => void }) {
  const titleId = useId()
  const complete = isLoanComplete(loan.status)
  const lending = isResidentLending(loan)
  const action = loanActionLabel(loan)
  const Icon = complete || loan.status === 'Confirmed' || loan.status === 'Picked up' ? Check : Clock
  const counterpartName = lending ? (loan.borrowerName ?? 'Neighbor') : loan.lenderName
  const counterpartInitials = lending
    ? (loan.borrowerInitials ?? counterpartName.slice(0, 2).toUpperCase())
    : loan.lenderInitials
  const counterpartRole = lending ? 'Borrower' : 'Lender'

  return (
    <article
      className={`match-card activity-card${complete ? ' activity-card-complete' : ''}`}
      aria-labelledby={titleId}
    >
      <div className="match-top">
        <ToolPortrait portrait={loan.portrait} fallbackLabel={loan.itemName} />
        <div className="match-copy">
          <p className="eyebrow">{lending ? 'Lending out' : 'Borrow Tomorrow'}</p>
          <div className="match-title-row">
            <h2 id={titleId} className="match-title">
              {loan.itemName}
            </h2>
            <StatusBadge status={loan.status} tone={statusTone('loan', loan.status)} />
          </div>
          <div className="match-person">
            <span className="match-avatar" aria-hidden="true">
              {counterpartInitials}
            </span>
            <span className="match-person-copy">
              <span className="match-person-name">{counterpartName}</span>
              <span className="match-place">
                <MapPin aria-hidden="true" size={14} />
                <span>{counterpartRole}</span>
              </span>
            </span>
          </div>
          <dl className="loan-summary-times exchange-facts">
            <div>
              <dt>Pickup</dt>
              <dd>{loan.pickupLabel}</dd>
            </div>
            <div>
              <dt>Back by</dt>
              <dd>{loan.returnLabel}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div
        className={`loan-state loan-state-${complete ? 'complete' : loan.status === 'Requested' ? 'requested' : 'confirmed'}${
          complete ? ' loan-state-celebrate' : ''
        }`}
        aria-live="polite"
      >
        <div className="loan-state-heading">
          <p className="loan-state-label">
            <Icon aria-hidden="true" size={16} />
            Progress
          </p>
        </div>
        <StatusTimeline steps={loanStatusSteps} current={loan.status} />
        <p className="loan-state-copy">{loanStatusCopy(loan)}</p>
        {action ? (
          <>
            <button type="button" className="loan-lender" onClick={onAdvance}>
              {action}
            </button>
            {loan.status === 'Requested' && !lending ? (
              <p className="hint loan-lender-hint">A stand-in, so you can move the loan forward.</p>
            ) : null}
          </>
        ) : (
          <p className="activity-success" role="status">
            Loan completed
          </p>
        )}
      </div>
    </article>
  )
}

function HandoffActivityCard({
  handoff,
  requestQuantity,
  onAdvance,
}: {
  handoff: HandoffRecord
  requestQuantity: number
  onAdvance: () => void
}) {
  const titleId = useId()
  const complete = isHandoffComplete(handoff.status)
  const action = handoffActionLabel(handoff.status)
  const Icon = complete || handoff.status === 'Confirmed' ? Check : Clock
  const neighbors = handoff.parts.map((part) => part.neighborName).join(', ')
  const where = handoff.windowLabel
    ? `${handoff.pickupArea}, ${handoff.windowLabel}`
    : handoff.pickupArea

  return (
    <article
      className={`match-card activity-card${complete ? ' activity-card-complete' : ''}`}
      aria-labelledby={titleId}
    >
      <div className="match-top">
        <ItemPortrait item={handoff.item} />
        <div className="match-copy">
          <p className="eyebrow">{handoff.kind === 'need' ? 'Hand Off · Need' : 'Hand Off · Offer'}</p>
          <div className="match-title-row">
            <h2 id={titleId} className="match-title">
              {handoff.item}
            </h2>
            <StatusBadge status={handoff.status} tone={statusTone('handoff', handoff.status)} />
          </div>
          <p className="match-board-intro">
            {formatItemQuantity(handoff.quantity, handoff.item)} with {neighbors}
          </p>
          <dl className="loan-summary-times exchange-facts">
            <div>
              <dt>Pickup</dt>
              <dd>{where}</dd>
            </div>
          </dl>
          <ul className="match-list">
            {handoff.parts.map((part) => (
              <li key={part.listingId} className="exchange-part">
                <div className="match-person">
                  <span className="match-avatar" aria-hidden="true">
                    {part.initials}
                  </span>
                  <span className="match-person-copy">
                    <span className="match-person-name">
                      {part.neighborName} · {part.quantity}
                    </span>
                    <span className="match-place">
                      <MapPin aria-hidden="true" size={14} />
                      <span>{part.location}</span>
                      <span className="match-distance">{part.distance}</span>
                    </span>
                  </span>
                </div>
                <ul className="match-windows">
                  <li>{part.windowLabel}</li>
                </ul>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div
        className={`loan-state loan-state-${complete ? 'complete' : handoff.status === 'Pending confirmation' ? 'requested' : 'confirmed'}${
          complete ? ' loan-state-celebrate' : ''
        }`}
        aria-live="polite"
      >
        <div className="loan-state-heading">
          <p className="loan-state-label">
            <Icon aria-hidden="true" size={16} />
            Progress
          </p>
        </div>
        <StatusTimeline steps={handoffStatusSteps} current={handoff.status} />
        <p className="loan-state-copy">{handoffStatusCopy(handoff, requestQuantity)}</p>
        {action ? (
          <button type="button" className="loan-lender" onClick={onAdvance}>
            {action}
          </button>
        ) : (
          <p className="activity-success" role="status">
            Handoff completed
          </p>
        )}
      </div>
    </article>
  )
}
