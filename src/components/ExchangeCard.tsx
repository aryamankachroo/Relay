import { useId, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { Check, Clock, HandHelping, MapPin } from 'lucide-react'
import { givenName } from '../data/lending.ts'
import {
  allocateQuantity,
  formatItemQuantity,
  handoffActionLabel,
  handoffStatusCopy,
  handoffStatusSteps,
  isHandoffComplete,
  knownItemIn,
  sanitizeExchange,
  suggestedSelection,
  type CommunityMatch,
  type ExchangeDraft,
  type ExchangeKind,
  type ExchangeRequest,
  type HandoffPart,
  type HandoffRecord,
} from '../data/exchanges.ts'
import { useHandoffs } from '../state/handoffStore.ts'
import { statusTone } from '../data/status.ts'
import { StatusBadge, StatusTimeline } from './StatusTimeline.tsx'

const itemMaxLength = 40
const placeMaxLength = 60
const windowMaxLength = 48

export function ExchangeCard({
  draft,
  requestId: pendingRequestId,
}: {
  draft: ExchangeDraft
  requestId: string
}) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const { requests, handoffs, confirmExchange, advanceHandoff } = useHandoffs()
  const [fields, setFields] = useState(draft)
  const [editing, setEditing] = useState(true)
  const [pendingId, setPendingId] = useState<string | null>(pendingRequestId)
  const [requestId, setRequestId] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState('')

  const request = requests.find((item) => item.id === requestId) ?? null
  const handoff = handoffs.find((item) => item.requestId === requestId) ?? null
  const ready =
    fields.item.trim().length > 0 && fields.quantity >= 1 && fields.quantity <= 99 && !sending

  useLayoutEffect(() => {
    if (editing) return
    scrollIntoLog(panelRef.current, 'start')
    panelRef.current?.focus({ preventScroll: true })
  }, [editing, requestId, handoff?.id])

  async function onConfirmDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next = sanitizeExchange(fields)
    if (!next || sending) return

    setSending(true)
    setNotice('')
    const unchanged = pendingId !== null && sameDraft(next, draft)
    const result = await confirmExchange(next, unchanged ? pendingId : null)
    setSending(false)
    setFields(next)
    setNotice(result.message ?? '')
    if (!result.requestId) return

    setPendingId(null)
    setRequestId(result.requestId)
    setEditing(false)
  }

  function onEdit() {
    if (!request || handoff) return
    setFields({
      kind: request.kind,
      item: request.item,
      quantity: request.quantity,
      pickupArea: request.pickupArea,
      windowLabel: request.windowLabel,
    })
    setNotice('')
    setEditing(true)
  }

  return (
    <div className="tool-card">
      <div className="tool-card-copy">
        <p className="eyebrow">{fields.kind === 'need' ? 'Need' : 'Offer'}</p>
        <h2 id={titleId} className="tool-card-title">
          {fields.item.trim() || 'Something to share'}
        </h2>
        <p className="tool-card-summary">
          {editing
            ? `Check the item, quantity, pickup area, and time. Then I will look for ${
                fields.kind === 'need' ? 'offers' : 'needs'
              } nearby.`
            : 'These are the details you confirmed.'}
        </p>
      </div>
      {editing ? (
        <>
          <ExchangeEditor
            fields={fields}
            ready={ready}
            labelledBy={titleId}
            onChange={setFields}
            onSubmit={(event) => void onConfirmDetails(event)}
          />
          {notice ? (
            <p className="tool-add-note" role="alert">
              {notice}
            </p>
          ) : null}
        </>
      ) : request ? (
        <div className="exchange-followup" ref={panelRef} tabIndex={-1}>
          <div className="loan-summary">
            <p className="eyebrow">{request.kind === 'need' ? 'Your need' : 'Your offer'}</p>
            <ExchangeFacts request={request} />
          </div>
          <ExchangeMatches
            request={request}
            handoff={handoff}
            listings={[]}
            selected={selected}
            onToggle={(id) =>
              setSelected((current) =>
                current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
              )
            }
            onEdit={onEdit}
            onArrange={() => undefined}
            onAdvance={() => (handoff ? advanceHandoff(handoff.id) : Promise.resolve(null))}
          />
        </div>
      ) : null}
    </div>
  )
}

function ExchangeEditor({
  fields,
  ready,
  labelledBy,
  onChange,
  onSubmit,
}: {
  fields: ExchangeDraft
  ready: boolean
  labelledBy: string
  onChange: (fields: ExchangeDraft) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  const formId = useId()
  const itemId = useId()
  const quantityId = useId()
  const placeId = useId()
  const windowId = useId()

  function patch(partial: Partial<ExchangeDraft>) {
    onChange({ ...fields, ...partial })
  }

  function onQuantity(raw: string) {
    if (raw === '') {
      patch({ quantity: 0 })
      return
    }
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return
    const quantity = Math.min(99, Math.max(0, Math.round(parsed)))
    patch({ quantity, item: alignItemLabel(fields.item, quantity) })
  }

  return (
    <form className="exchange-form" aria-labelledby={labelledBy} onSubmit={onSubmit}>
      <fieldset className="loan-field">
        <legend className="exchange-legend">This is</legend>
        <div className="loan-options">
          <KindChoice
            formId={formId}
            kind="need"
            label="A need"
            detail="You are looking for this."
            checked={fields.kind === 'need'}
            onSelect={() => patch({ kind: 'need' })}
          />
          <KindChoice
            formId={formId}
            kind="offer"
            label="An offer"
            detail="You can give this away."
            checked={fields.kind === 'offer'}
            onSelect={() => patch({ kind: 'offer' })}
          />
        </div>
      </fieldset>
      <div className="exchange-grid">
        <div className="exchange-field">
          <label htmlFor={itemId}>Item</label>
          <input
            id={itemId}
            value={fields.item}
            maxLength={itemMaxLength}
            placeholder="Notebooks"
            autoComplete="off"
            autoCapitalize="words"
            onChange={(event) => patch({ item: event.target.value })}
          />
        </div>
        <div className="exchange-field">
          <label htmlFor={quantityId}>Quantity</label>
          <input
            id={quantityId}
            type="number"
            inputMode="numeric"
            min={1}
            max={99}
            value={fields.quantity === 0 ? '' : fields.quantity}
            onChange={(event) => onQuantity(event.target.value)}
          />
        </div>
        <div className="exchange-field exchange-field-wide">
          <label htmlFor={placeId}>Pickup area</label>
          <input
            id={placeId}
            value={fields.pickupArea}
            maxLength={placeMaxLength}
            placeholder="14 Willow Court"
            autoComplete="off"
            onChange={(event) => patch({ pickupArea: event.target.value })}
          />
        </div>
        <div className="exchange-field exchange-field-wide">
          <label htmlFor={windowId}>Date or time</label>
          <input
            id={windowId}
            value={fields.windowLabel}
            maxLength={windowMaxLength}
            placeholder="Saturday, or a time window"
            autoComplete="off"
            onChange={(event) => patch({ windowLabel: event.target.value })}
          />
        </div>
      </div>
      <button type="submit" className="tool-primary" disabled={!ready}>
        <Check aria-hidden="true" size={18} />
        Confirm details
      </button>
    </form>
  )
}

function KindChoice({
  formId,
  kind,
  label,
  detail,
  checked,
  onSelect,
}: {
  formId: string
  kind: ExchangeKind
  label: string
  detail: string
  checked: boolean
  onSelect: () => void
}) {
  return (
    <label className="loan-option">
      <input
        className="loan-radio-input"
        type="radio"
        name={`${formId}-kind`}
        value={kind}
        checked={checked}
        onChange={onSelect}
      />
      <span className="loan-radio" aria-hidden="true" />
      <span className="loan-option-copy">
        <span className="loan-option-label">{label}</span>
        <span className="loan-option-note">{detail}</span>
      </span>
    </label>
  )
}

function ExchangeFacts({ request }: { request: ExchangeRequest }) {
  return (
    <dl className="loan-summary-times exchange-facts">
      <div>
        <dt>Item</dt>
        <dd>{request.item}</dd>
      </div>
      <div>
        <dt>Quantity</dt>
        <dd>{request.quantity}</dd>
      </div>
      <div>
        <dt>Pickup area</dt>
        <dd>{request.pickupArea}</dd>
      </div>
      <div>
        <dt>Date or time</dt>
        <dd>{request.windowLabel || 'Whenever works'}</dd>
      </div>
    </dl>
  )
}

function ExchangeMatches({
  request,
  handoff,
  listings,
  selected,
  onToggle,
  onEdit,
  onArrange,
  onAdvance,
}: {
  request: ExchangeRequest
  handoff: HandoffRecord | null
  /** Open posts the resident can still pick; the API already allocated its match into `handoff`. */
  listings: readonly CommunityMatch[]
  selected: readonly string[]
  onToggle: (id: string) => void
  onEdit: () => void
  onArrange: (parts: HandoffPart[]) => void
  onAdvance: () => Promise<string | null>
}) {
  const headingId = useId()
  const claimedIds = new Set(handoff?.parts.map((part) => part.listingId) ?? [])
  const remaining = Math.max(0, request.quantity - request.fulfilled)
  const canAddMore =
    remaining > 0 && (!handoff || handoff.status === 'Pending confirmation')
  const matches = listings.filter((match) => !claimedIds.has(match.id))
  const ordered = [...matches].sort((left, right) => Number(right.available) - Number(left.available))
  const allocations = allocateQuantity(remaining, ordered, selected)
  const covered = allocations.reduce((sum, part) => sum + part.quantity, 0)
  const available = ordered.filter((match) => match.available)
  const suggested = ordered.filter((match) =>
    suggestedSelection(remaining, ordered).includes(match.id),
  )
  const split =
    !handoff &&
    suggested.length > 1 &&
    suggested.every((match) => match.quantity < request.quantity)
  const opposite = request.kind === 'need' ? 'offers' : 'needs'

  function arrange() {
    onArrange(allocations.map((part) => toHandoffPart(part.listing, part.quantity)))
  }

  return (
    <section className="match-board" aria-labelledby={headingId}>
      <div className="match-board-copy">
        <h3 id={headingId} className="match-board-title">
          {request.kind === 'need' ? 'Nearby offers' : 'Nearby needs'}
        </h3>
        <p className="match-board-intro">
          {canAddMore
            ? available.length > 0
              ? handoff
                ? `${request.fulfilled} already arranged. Choose neighbors for the remaining ${remaining}.`
                : 'Each card shows the quantity, neighbor, location, and handoff time.'
              : ordered.length > 0
                ? 'Someone listed this, but no handoff time is open.'
                : handoff
                  ? `No more open ${opposite} for the remaining ${remaining}.`
                  : `No ${opposite} for this yet.`
            : 'Handoff progress is below.'}
        </p>
      </div>
      {handoff ? <HandoffReceipt request={request} handoff={handoff} onAdvance={onAdvance} /> : null}
      {canAddMore ? (
        <>
          {split ? (
            <div className="loan-summary">
              <p className="eyebrow">Partial match</p>
              <p className="loan-summary-lead">
                {request.kind === 'need'
                  ? `No single neighbor has all ${request.quantity}. These offers can split it.`
                  : `No single neighbor needs all ${request.quantity}. These needs can split it.`}
              </p>
            </div>
          ) : null}
          {ordered.length > 0 ? (
            <ul className="match-list">
              {ordered.map((match) => {
                const take = allocations.find((part) => part.listing.id === match.id)?.quantity ?? 0
                const checked = selected.includes(match.id)
                const blocked = !match.available || (!checked && covered >= remaining)
                return (
                  <li key={match.id}>
                    <MatchOption
                      match={match}
                      checked={checked}
                      blocked={blocked}
                      take={take}
                      requestQuantity={remaining}
                      onToggle={() => onToggle(match.id)}
                    />
                  </li>
                )
              })}
            </ul>
          ) : null}
          {available.length === 0 ? (
            handoff ? null : <OpenNote request={request} closed={ordered.length > 0} />
          ) : (
            <div className="loan-actions">
              <p className="exchange-coverage" aria-live="polite">
                {coverageCopy(request.kind, remaining, covered, allocations)}
              </p>
              <button type="button" className="tool-primary" disabled={covered === 0} onClick={arrange}>
                <HandHelping aria-hidden="true" size={18} />
                {handoff ? 'Add to handoff' : 'Arrange handoff'}
              </button>
              {handoff ? null : (
                <button type="button" className="loan-back" onClick={onEdit}>
                  Edit details
                </button>
              )}
            </div>
          )}
          {available.length === 0 && !handoff ? (
            <button type="button" className="loan-back" onClick={onEdit}>
              Edit details
            </button>
          ) : null}
        </>
      ) : null}
    </section>
  )
}

function MatchOption({
  match,
  checked,
  blocked,
  take,
  requestQuantity,
  onToggle,
}: {
  match: CommunityMatch
  checked: boolean
  blocked: boolean
  take: number
  requestQuantity: number
  onToggle: () => void
}) {
  const titleId = useId()
  const availability = match.available
    ? match.windowLabel
    : `Unavailable. ${match.closedNote ?? 'No open handoff time.'}`

  if (!match.available) {
    return (
      <article className="match-card match-card-closed" aria-labelledby={titleId}>
        <MatchBody
          match={match}
          titleId={titleId}
          take={0}
          checked={false}
          requestQuantity={requestQuantity}
          selectable={false}
        />
      </article>
    )
  }

  return (
    <label className="match-card exchange-match">
      <input
        className="exchange-match-input"
        type="checkbox"
        checked={checked}
        disabled={blocked}
        aria-label={`${match.itemName}, ${match.quantity} available, ${match.resident.name}, ${match.location}, ${availability}`}
        onChange={onToggle}
      />
      <span className="exchange-match-body">
        <MatchBody
          match={match}
          titleId={titleId}
          take={take}
          checked={checked}
          requestQuantity={requestQuantity}
          selectable
        />
      </span>
    </label>
  )
}

function MatchBody({
  match,
  titleId,
  take,
  checked,
  requestQuantity,
  selectable,
}: {
  match: CommunityMatch
  titleId: string
  take: number
  checked: boolean
  requestQuantity: number
  selectable: boolean
}) {
  return (
    <>
      <div className="match-title-row">
        {selectable ? <span className="exchange-tick" aria-hidden="true" /> : null}
        <h4 id={titleId} className="match-title">
          {match.itemName}
        </h4>
        <span className={`match-condition match-condition-${match.available ? 'good' : 'fair'}`}>
          {match.quantity} available
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
            <span>{match.location}</span>
            <span className="match-distance">{match.distance}</span>
          </span>
        </span>
      </div>
      <p className="match-notes">
        <span className="match-notes-label">Note from {givenName(match.resident.name)}</span>
        {match.note}
      </p>
      <div className="match-pickup">
        <p className="match-kicker">
          <Clock aria-hidden="true" size={14} />
          Handoff
        </p>
        <ul className="match-windows">
          <li>{match.windowLabel}</li>
          {match.available ? null : (
            <li className="exchange-unavailable">
              Unavailable{match.closedNote ? ` · ${match.closedNote}` : ''}
            </li>
          )}
        </ul>
      </div>
      {take > 0 ? (
        <p className="exchange-contrib">
          Counting {take} toward your {requestQuantity}
        </p>
      ) : selectable && checked && take === 0 ? (
        <p className="exchange-contrib">Already covered by the neighbors above.</p>
      ) : null}
    </>
  )
}

function HandoffReceipt({
  request,
  handoff,
  onAdvance,
}: {
  request: ExchangeRequest
  handoff: HandoffRecord
  onAdvance: () => Promise<string | null>
}) {
  const statusRef = useRef<HTMLDivElement>(null)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const complete = isHandoffComplete(handoff.status)
  const action = handoffActionLabel(handoff.status)
  const Icon = complete || handoff.status === 'Confirmed' ? Check : Clock

  return (
    <div
      className={`loan-state loan-state-${complete ? 'complete' : handoff.status === 'Pending confirmation' ? 'requested' : 'confirmed'}${
        complete ? ' loan-state-celebrate' : ''
      }`}
      ref={statusRef}
      tabIndex={-1}
      aria-live="polite"
    >
      <div className="loan-state-heading">
        <p className="loan-state-label">
          <Icon aria-hidden="true" size={16} />
          Hand Off
        </p>
        <StatusBadge status={handoff.status} tone={statusTone('handoff', handoff.status)} />
      </div>
      <StatusTimeline steps={handoffStatusSteps} current={handoff.status} />
      <p className="loan-state-copy">{handoffStatusCopy(handoff, request.quantity)}</p>
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
      {action ? (
        <>
          <button
            type="button"
            className="loan-lender"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              setNote(null)
              void onAdvance().then((message) => {
                setNote(message)
                setBusy(false)
              })
            }}
          >
            {busy ? 'Saving…' : action}
          </button>
          {note ? <p className="hint loan-lender-hint">{note}</p> : null}
        </>
      ) : (
        <p className="activity-success" role="status">
          Handoff completed
        </p>
      )}
    </div>
  )
}

function OpenNote({ request, closed = false }: { request: ExchangeRequest; closed?: boolean }) {
  const where = request.windowLabel
    ? `${request.pickupArea}, ${request.windowLabel}`
    : request.pickupArea
  const phrase = formatItemQuantity(request.quantity, request.item)
  const copy = openCopy(request, phrase, where, closed)

  return (
    <div className="loan-state loan-state-requested" tabIndex={-1} aria-live="polite">
      <p className="loan-state-label">
        <Clock aria-hidden="true" size={16} />
        Open
      </p>
      <p className="loan-state-copy">{copy}</p>
    </div>
  )
}

function openCopy(request: ExchangeRequest, phrase: string, where: string, closed: boolean) {
  if (closed) {
    return request.kind === 'need'
      ? `Neighbors listed ${request.item.toLowerCase()}, but no handoff time is open. Your need for ${phrase} stays open at ${where}.`
      : `Neighbors asked for ${request.item.toLowerCase()}, but no handoff time is open. Your offer of ${phrase} stays open at ${where}.`
  }

  return request.kind === 'need'
    ? `No nearby offer for ${request.item.toLowerCase()}. Your need for ${phrase} stays open at ${where}.`
    : `No nearby need for ${request.item.toLowerCase()}. Your offer of ${phrase} stays open at ${where}.`
}

function coverageCopy(
  kind: ExchangeKind,
  quantity: number,
  covered: number,
  allocations: { listing: CommunityMatch; quantity: number }[],
) {
  if (allocations.length === 0) return 'Choose at least one neighbor to confirm a handoff.'
  const names = joinList(allocations.map((part) => givenName(part.listing.resident.name)))
  if (covered >= quantity) {
    if (quantity === 1) return `${names} can cover this.`
    return allocations.length > 1
      ? `${names} together cover all ${quantity}.`
      : `${names} covers all ${quantity}.`
  }
  const verb = allocations.length > 1 ? 'cover' : 'covers'
  return `${names} ${verb} ${covered} of ${quantity}. The rest of this ${kind} stays open.`
}

function toHandoffPart(listing: CommunityMatch, quantity: number): HandoffPart {
  return {
    listingId: listing.id,
    neighborName: listing.resident.name,
    initials: listing.resident.initials,
    quantity,
    location: listing.location,
    distance: listing.distance,
    windowLabel: listing.windowLabel,
  }
}

function sameDraft(next: ExchangeDraft, original: ExchangeDraft) {
  const before = sanitizeExchange(original)
  return (
    before !== null &&
    next.kind === before.kind &&
    next.item.toLowerCase() === before.item.toLowerCase() &&
    next.quantity === before.quantity &&
    next.pickupArea === before.pickupArea &&
    next.windowLabel === before.windowLabel
  )
}

function alignItemLabel(item: string, quantity: number) {
  if (quantity < 1) return item
  const known = knownItemIn(item)
  if (!known) return item
  const normalized = item.trim().toLowerCase()
  const exact =
    known.aliases.some((alias) => alias === normalized) ||
    normalized === known.singular.toLowerCase() ||
    normalized === known.plural.toLowerCase()
  if (!exact) return item
  return quantity === 1 ? known.singular : known.plural
}

function joinList(items: string[]) {
  if (items.length <= 1) return items[0] ?? ''
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`
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
