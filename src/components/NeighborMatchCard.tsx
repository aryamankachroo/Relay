import { useId, useLayoutEffect, useRef, useState, type FormEvent, type RefObject } from 'react'
import { Check, Clock, HandHelping, MapPin } from 'lucide-react'
import {
  givenName,
  isLoanComplete,
  isPickupSelectable,
  isReturnSelectable,
  loanActionLabel,
  loanStatusCopy,
  loanStatusSteps,
  matchesForTool,
  type LoanRequest,
  type NeighborMatch,
  type PickupWindow,
  type ReturnWindow,
} from '../data/lending.ts'
import type { ChecklistTool, InventoryItem } from '../data/bookshelfProject.ts'
import { useInventory } from '../state/inventoryStore.ts'
import { useLoanRequests } from '../state/loanStore.ts'
import { statusTone } from '../data/status.ts'
import { StatusBadge, StatusTimeline } from './StatusTimeline.tsx'
import { ToolPortrait } from './ToolPortrait.tsx'

type LoanStep = 'schedule' | 'confirm'

export function NeighborMatchList({ tools }: { tools: readonly ChecklistTool[] }) {
  const headingId = useId()
  const { items } = useInventory()
  const { requests, requestLoan, advanceLoan } = useLoanRequests()

  return (
    <section className="match-board" aria-labelledby={headingId}>
      <div className="match-board-copy">
        <h3 id={headingId} className="match-board-title">
          Nearby to borrow
        </h3>
        <p className="match-board-intro">
          Neighbors who listed a tool you need. A tool with no listing says so.
        </p>
      </div>
      {tools.map((tool) => (
        <ToolMatchGroup
          key={tool.id}
          tool={tool}
          inventory={items}
          requests={requests}
          onRequestLoan={requestLoan}
          onAdvanceLoan={advanceLoan}
        />
      ))}
    </section>
  )
}

function ToolMatchGroup({
  tool,
  inventory,
  requests,
  onRequestLoan,
  onAdvanceLoan,
}: {
  tool: ChecklistTool
  inventory: readonly InventoryItem[]
  requests: readonly LoanRequest[]
  onRequestLoan: (match: NeighborMatch, pickupId: string, returnId: string) => void
  onAdvanceLoan: (requestId: string) => void
}) {
  const headingId = useId()
  const matches = matchesForTool(tool.name, inventory)

  return (
    <section className="match-group" aria-labelledby={headingId}>
      <h4 id={headingId} className="match-group-title">
        {tool.name}
        {tool.required ? null : <span className="inventory-optional">Optional</span>}
      </h4>
      {matches.length === 0 ? (
        <p className="match-none">No nearby match for {tool.name}. Nobody listed one to lend.</p>
      ) : (
        <ul className="match-list">
          {matches.map((match) => {
            const request =
              requests.find((loan) => loan.listingId === match.id && loan.status !== 'Returned') ??
              requests.find((loan) => loan.listingId === match.id) ??
              null
            return (
              <li key={match.id}>
                <NeighborMatchCard
                  match={match}
                  request={request}
                  onRequestLoan={(pickupId, returnId) => onRequestLoan(match, pickupId, returnId)}
                  onAdvanceLoan={() => {
                    if (request) onAdvanceLoan(request.id)
                  }}
                />
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export function NeighborMatchCard({
  match,
  request,
  onRequestLoan,
  onAdvanceLoan,
}: {
  match: NeighborMatch
  request: LoanRequest | null
  onRequestLoan: (pickupId: string, returnId: string) => void
  onAdvanceLoan: () => void
}) {
  const titleId = useId()
  const formId = useId()
  const cardRef = useRef<HTMLElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const summaryRef = useRef<HTMLDivElement>(null)
  const actionsRef = useRef<HTMLDivElement>(null)
  const statusRef = useRef<HTMLDivElement>(null)
  const skipScroll = useRef(true)
  const [step, setStep] = useState<LoanStep | null>(null)
  const [pickupId, setPickupId] = useState('')
  const [returnId, setReturnId] = useState('')

  const pickup = match.pickupWindows.find((window) => window.id === pickupId)
  const due = match.returnWindows.find((window) => window.id === returnId)
  const ready = isReturnSelectable(pickup, due)
  const openPickups = match.pickupWindows.filter((window) => window.available)
  const scheduling = !request && step !== null

  useLayoutEffect(() => {
    if (skipScroll.current) {
      skipScroll.current = false
      return
    }
    if (request) {
      scrollIntoLog(statusRef.current, 'end')
      statusRef.current?.focus({ preventScroll: true })
      return
    }
    if (step === 'confirm') {
      scrollIntoLog(actionsRef.current, 'end')
      summaryRef.current?.focus({ preventScroll: true })
      return
    }
    if (step === 'schedule') {
      scrollIntoLog(formRef.current, 'start')
      const firstOpen = formRef.current?.querySelector('input:not(:disabled)')
      if (firstOpen instanceof HTMLInputElement) firstOpen.focus({ preventScroll: true })
    }
  }, [step, request])

  function choosePickup(id: string) {
    const next = match.pickupWindows.find((window) => window.id === id)
    if (!isPickupSelectable(next)) return
    setPickupId(id)
    setReturnId((current) => {
      const selected = match.returnWindows.find((window) => window.id === current)
      return isReturnSelectable(next, selected) ? current : ''
    })
  }

  function chooseReturn(id: string) {
    const selected = match.returnWindows.find((window) => window.id === id)
    if (!isReturnSelectable(pickup, selected)) return
    setReturnId(id)
  }

  function closeForm() {
    setStep(null)
    setPickupId('')
    setReturnId('')
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!ready || !pickup || !due) return
    if (step === 'schedule') {
      setStep('confirm')
      return
    }
    onRequestLoan(pickup.id, due.id)
  }

  return (
    <article className="match-card" aria-labelledby={titleId} ref={cardRef}>
      <div className="match-top">
        <ToolPortrait portrait={match.portrait} />
        <div className="match-copy">
          <div className="match-title-row">
            <h5 id={titleId} className="match-title">
              {match.itemName}
            </h5>
            <span className={`match-condition match-condition-${match.condition.toLowerCase()}`}>
              {match.condition}
            </span>
          </div>
          <div className="match-person">
            <span className="match-avatar" aria-hidden="true">
              {match.resident.initials}
            </span>
            <span className="match-person-copy">
              <span className="match-person-name">{match.resident.name}</span>
              <span className="match-place">
                <MapPin aria-hidden="true" size={14} />
                <span>{match.resident.street}</span>
                <span className="match-distance">{match.distance}</span>
              </span>
            </span>
          </div>
          <p className="match-notes">
            <span className="match-notes-label">Note from {givenName(match.resident.name)}</span>
            {match.notes}
          </p>
          {request || scheduling ? null : (
            <div className="match-pickup">
              <p className="match-kicker">
                <Clock aria-hidden="true" size={14} />
                Pickup windows
              </p>
              {openPickups.length === 0 ? (
                <p className="match-none-inline">No open pickup window.</p>
              ) : (
                <ul className="match-windows">
                  {openPickups.map((window) => (
                    <li key={window.id}>{window.label}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
      {request ? (
        <LoanStatus request={request} statusRef={statusRef} onAdvance={onAdvanceLoan} />
      ) : step === null ? (
        <button
          type="button"
          className="tool-primary"
          disabled={openPickups.length === 0}
          aria-label={`Request the ${match.itemName} from ${match.resident.name}`}
          onClick={() => setStep('schedule')}
        >
          <HandHelping aria-hidden="true" size={18} />
          Request this loan
        </button>
      ) : (
        <form className="loan-form" ref={formRef} onSubmit={onSubmit}>
          {step === 'schedule' ? (
            <>
              <p className="loan-form-hint">Pick an open window. Closed times stay unavailable.</p>
              <fieldset className="loan-field">
                <legend className="loan-legend">Pickup time</legend>
                <div className="loan-options">
                  {match.pickupWindows.map((window) => (
                    <TimeChoice
                      key={window.id}
                      name={`${formId}-pickup`}
                      slot={window}
                      detail={pickupDetail(window)}
                      checked={pickupId === window.id}
                      disabled={!isPickupSelectable(window)}
                      onSelect={() => choosePickup(window.id)}
                    />
                  ))}
                </div>
              </fieldset>
              <fieldset className="loan-field">
                <legend className="loan-legend">Expected return</legend>
                {pickup ? (
                  <div className="loan-options">
                    {match.returnWindows.map((window) => (
                      <TimeChoice
                        key={window.id}
                        name={`${formId}-return`}
                        slot={window}
                        detail={returnDetail(pickup, window)}
                        checked={returnId === window.id}
                        disabled={!isReturnSelectable(pickup, window)}
                        onSelect={() => chooseReturn(window.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="loan-wait">Choose a pickup time first.</p>
                )}
              </fieldset>
            </>
          ) : (
            <div className="loan-summary" ref={summaryRef} tabIndex={-1}>
              <p className="eyebrow">Confirm this request</p>
              <p className="loan-summary-lead">
                Ask {match.resident.name} for the {match.itemName.toLowerCase()}.
              </p>
              <dl className="loan-summary-times">
                <div>
                  <dt>Pickup</dt>
                  <dd>{pickup?.label}</dd>
                </div>
                <div>
                  <dt>Back by</dt>
                  <dd>{due?.label}</dd>
                </div>
              </dl>
            </div>
          )}
          <div className="loan-actions" ref={actionsRef}>
            <button className="tool-primary" type="submit" disabled={step === 'schedule' && !ready}>
              {step === 'schedule' ? 'Review request' : 'Send request'}
            </button>
            <button
              type="button"
              className="loan-back"
              onClick={step === 'schedule' ? closeForm : () => setStep('schedule')}
            >
              {step === 'schedule' ? 'Back' : 'Change times'}
            </button>
          </div>
        </form>
      )}
    </article>
  )
}

function LoanStatus({
  request,
  statusRef,
  onAdvance,
}: {
  request: LoanRequest
  statusRef: RefObject<HTMLDivElement | null>
  onAdvance: () => void
}) {
  const complete = isLoanComplete(request.status)
  const action = loanActionLabel(request)
  const Icon = complete || request.status === 'Confirmed' || request.status === 'Picked up' ? Check : Clock

  return (
    <div
      className={`loan-state loan-state-${complete ? 'complete' : request.status === 'Requested' ? 'requested' : 'confirmed'}${
        complete ? ' loan-state-celebrate' : ''
      }`}
      ref={statusRef}
      tabIndex={-1}
      aria-live="polite"
    >
      <div className="loan-state-heading">
        <p className="loan-state-label">
          <Icon aria-hidden="true" size={16} />
          Borrow Tomorrow
        </p>
        <StatusBadge status={request.status} tone={statusTone('loan', request.status)} />
      </div>
      <StatusTimeline steps={loanStatusSteps} current={request.status} />
      <p className="loan-state-copy">{loanStatusCopy(request)}</p>
      {action ? (
        <>
          <button type="button" className="loan-lender" onClick={onAdvance}>
            {action}
          </button>
          {request.status === 'Requested' ? (
            <p className="hint loan-lender-hint">A stand-in, so you can move the loan forward.</p>
          ) : null}
        </>
      ) : (
        <p className="activity-success" role="status">
          Loan completed
        </p>
      )}
    </div>
  )
}

function TimeChoice({
  name,
  slot,
  detail,
  checked,
  disabled,
  onSelect,
}: {
  name: string
  slot: PickupWindow | ReturnWindow
  detail: string
  checked: boolean
  disabled: boolean
  onSelect: () => void
}) {
  return (
    <label className="loan-option">
      <input
        className="loan-radio-input"
        type="radio"
        name={name}
        value={slot.id}
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
      />
      <span className="loan-radio" aria-hidden="true" />
      <span className="loan-option-copy">
        <span className="loan-option-label">{slot.label}</span>
        {detail ? <span className="loan-option-note">{detail}</span> : null}
      </span>
    </label>
  )
}

function pickupDetail(window: PickupWindow) {
  if (window.available) return ''
  return window.closedNote ? `Unavailable · ${window.closedNote}` : 'Unavailable'
}

function returnDetail(pickup: PickupWindow, window: ReturnWindow) {
  if (!window.available) {
    return window.closedNote ? `Unavailable · ${window.closedNote}` : 'Unavailable'
  }
  if (!pickup.returnWindowIds.includes(window.id)) return 'Not offered after that pickup'
  return ''
}

function scrollIntoLog(element: HTMLElement | null, edge: 'start' | 'end') {
  const log = element?.closest('.chat-log')
  if (!element || !(log instanceof HTMLElement)) return
  const logRect = log.getBoundingClientRect()
  const elementRect = element.getBoundingClientRect()
  const top =
    edge === 'start'
      ? elementRect.top - logRect.top + log.scrollTop - 12
      : elementRect.bottom - logRect.bottom + log.scrollTop + 12
  log.scrollTo({ top: Math.max(0, top), behavior: 'auto' })
}
