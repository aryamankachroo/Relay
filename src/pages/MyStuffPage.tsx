import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import {
  Bike,
  Flower2,
  Home,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
  UtensilsCrossed,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react'
import { GlassCard } from '../components/GlassCard.tsx'
import { StatusBadge } from '../components/StatusTimeline.tsx'
import {
  createInventoryDraft,
  draftFromItem,
  inventoryCategories,
  itemConditions,
  normalizeToolName,
  type InventoryCategory,
  type InventoryDraft,
  type InventoryItem,
} from '../data/bookshelfProject.ts'
import { demoResident } from '../data/index.ts'
import {
  givenName,
  incomingLoanRequests,
  outboundLoanForItem,
  pendingLoanForItem,
  type LoanRequest,
} from '../data/lending.ts'
import { statusTone } from '../data/status.ts'
import { useInventory } from '../state/inventoryStore.ts'
import { useLoanRequests } from '../state/loanStore.ts'

const nameMaxLength = 40
const notesMaxLength = 120

type CategoryFilter = 'All' | InventoryCategory

const categoryIcons: Record<InventoryCategory, LucideIcon> = {
  Tools: Wrench,
  Garden: Flower2,
  Kitchen: UtensilsCrossed,
  Household: Home,
  Sports: Bike,
}

export function MyStuffPage() {
  const headingId = useId()
  const searchId = useId()
  const categoryId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { items, addItem, updateItem, removeItem, setAvailableToLend } = useInventory()
  const { requests: loans, advanceLoan } = useLoanRequests()

  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<CategoryFilter>('All')
  const [editor, setEditor] = useState<{ mode: 'add' } | { mode: 'edit'; item: InventoryItem } | null>(
    null,
  )
  const [draft, setDraft] = useState<InventoryDraft>(createInventoryDraft)
  const [formNote, setFormNote] = useState('')

  const lendableCount = useMemo(
    () => items.filter((item) => item.availableToLend && !outboundLoanForItem(loans, item.id)).length,
    [items, loans],
  )

  const incoming = useMemo(() => incomingLoanRequests(loans), [loans])
  const pendingIncoming = useMemo(
    () => incoming.filter((loan) => loan.status === 'Requested'),
    [incoming],
  )

  const visibleItems = useMemo(() => {
    const needle = normalizeToolName(query)
    return items.filter((item) => {
      if (category !== 'All' && item.category !== category) return false
      if (!needle) return true
      const haystack = normalizeToolName(
        [item.name, item.notes, item.category, item.condition].join(' '),
      )
      return haystack.includes(needle)
    })
  }, [items, query, category])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (editor) {
      if (!dialog.open) dialog.showModal()
      return
    }

    if (dialog.open) dialog.close()
  }, [editor])

  function openAdd() {
    setDraft(createInventoryDraft())
    setFormNote('')
    setEditor({ mode: 'add' })
  }

  function openEdit(item: InventoryItem) {
    setDraft(draftFromItem(item))
    setFormNote('')
    setEditor({ mode: 'edit', item })
  }

  function closeEditor() {
    setEditor(null)
    setFormNote('')
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editor) return

    const saved =
      editor.mode === 'add' ? addItem(draft) : updateItem(editor.item.id, draft)

    if (!saved) {
      setFormNote(
        draft.name.trim()
          ? 'That name is already on your shelf.'
          : 'Give this item a name first.',
      )
      return
    }

    closeEditor()
  }

  const filtersActive = query.trim().length > 0 || category !== 'All'
  const emptyShelf = items.length === 0
  const emptyFilter = !emptyShelf && visibleItems.length === 0

  return (
    <section className="shelf-page" aria-labelledby={headingId}>
      <GlassCard tone="strong" className="shelf-hero">
        <div className="shelf-hero-copy">
          <div className="shelf-hero-badge">
            <span className="icon-chip sphere-mint">
              <Package aria-hidden="true" size={22} />
            </span>
            <div className="grid gap-1">
              <p className="eyebrow">Your shelf</p>
              <h1 id={headingId} className="shelf-title">
                My Inventory
              </h1>
            </div>
          </div>
          <p className="shelf-lead">{demoResident.street}</p>
          <p className="hint">
            {items.length} {items.length === 1 ? 'item' : 'items'} · {lendableCount} open to lend
          </p>
        </div>
        <button type="button" className="tool-primary shelf-add-trigger" onClick={openAdd}>
          <Plus aria-hidden="true" size={18} />
          Add item
        </button>
      </GlassCard>

      <GlassCard tone="solid" className="shelf-toolbar">
        <div className="shelf-search">
          <Search aria-hidden="true" size={18} className="shelf-search-icon" />
          <label className="sr-only" htmlFor={searchId}>
            Search your inventory
          </label>
          <input
            id={searchId}
            className="shelf-search-input"
            value={query}
            placeholder="Search by name, note, or condition"
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="shelf-filter">
          <label className="shelf-filter-label" htmlFor={categoryId}>
            Category
          </label>
          <select
            id={categoryId}
            className="shelf-filter-select"
            value={category}
            onChange={(event) => setCategory(event.target.value as CategoryFilter)}
          >
            <option value="All">All categories</option>
            {inventoryCategories.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
      </GlassCard>

      {pendingIncoming.length > 0 ? (
        <GlassCard tone="solid" className="shelf-incoming">
          <div className="shelf-incoming-head">
            <p className="eyebrow">Incoming requests</p>
            <h2 className="shelf-incoming-title">Neighbors waiting on you</h2>
          </div>
          <ul className="shelf-incoming-list">
            {pendingIncoming.map((loan) => (
              <li key={loan.id}>
                <IncomingLoanRow loan={loan} onAccept={() => advanceLoan(loan.id)} />
              </li>
            ))}
          </ul>
        </GlassCard>
      ) : null}

      {emptyShelf ? (
        <GlassCard tone="glass" className="shelf-empty">
          <span className="icon-chip sphere-aqua">
            <Package aria-hidden="true" size={22} />
          </span>
          <h2 className="shelf-empty-title">Your shelf is clear</h2>
          <p className="shelf-empty-copy">
            Add a tool, a bowl set, or anything neighbors might borrow. Chat will pick it up on the
            next inventory check.
          </p>
          <button type="button" className="tool-primary shelf-empty-action" onClick={openAdd}>
            <Plus aria-hidden="true" size={18} />
            Add your first item
          </button>
        </GlassCard>
      ) : emptyFilter ? (
        <GlassCard tone="glass" className="shelf-empty">
          <h2 className="shelf-empty-title">Nothing matches</h2>
          <p className="shelf-empty-copy">
            Try another search or category. Your full shelf is still here.
          </p>
          <button
            type="button"
            className="tool-add-button"
            onClick={() => {
              setQuery('')
              setCategory('All')
            }}
          >
            Clear filters
          </button>
        </GlassCard>
      ) : (
        <ul className="shelf-grid">
          {visibleItems.map((item) => {
            const onLoan = outboundLoanForItem(loans, item.id)
            const pending = pendingLoanForItem(loans, item.id)
            return (
              <li key={item.id}>
                <InventoryCard
                  item={item}
                  onLoan={onLoan}
                  pending={pending}
                  onEdit={() => openEdit(item)}
                  onRemove={() => removeItem(item.id)}
                  onToggleLend={(available) => setAvailableToLend(item.id, available)}
                  onAcceptPending={pending ? () => advanceLoan(pending.id) : undefined}
                />
              </li>
            )
          })}
        </ul>
      )}

      {filtersActive && !emptyShelf && !emptyFilter ? (
        <p className="hint shelf-result-note">
          Showing {visibleItems.length} of {items.length}{' '}
          {items.length === 1 ? 'item' : 'items'}.
        </p>
      ) : null}

      <dialog
        ref={dialogRef}
        className="shelf-dialog"
        aria-labelledby="shelf-dialog-title"
        onCancel={closeEditor}
        onClose={closeEditor}
      >
        {editor ? (
          <InventoryEditor
            mode={editor.mode}
            draft={draft}
            note={formNote}
            onDraftChange={setDraft}
            onNoteClear={() => setFormNote('')}
            onSubmit={onSubmit}
            onCancel={closeEditor}
          />
        ) : null}
      </dialog>
    </section>
  )
}

function InventoryCard({
  item,
  onLoan,
  pending,
  onEdit,
  onRemove,
  onToggleLend,
  onAcceptPending,
}: {
  item: InventoryItem
  onLoan: LoanRequest | null
  pending: LoanRequest | null
  onEdit: () => void
  onRemove: () => void
  onToggleLend: (available: boolean) => void
  onAcceptPending?: () => void
}) {
  const titleId = useId()
  const lendId = useId()
  const Icon = categoryIcons[item.category]
  const lentOut = Boolean(onLoan)
  const available = lentOut ? false : item.availableToLend

  return (
    <article
      className={`shelf-card${lentOut ? ' shelf-card-on-loan' : ''}`}
      aria-labelledby={titleId}
    >
      <div className="shelf-card-top">
        <span className={`shelf-card-icon shelf-card-icon-${item.category.toLowerCase()}`}>
          <Icon aria-hidden="true" size={22} />
        </span>
        <div className="shelf-card-heading">
          <p className="eyebrow">{item.category}</p>
          <h2 id={titleId} className="shelf-card-title">
            {item.name}
          </h2>
        </div>
        <div className="shelf-card-actions">
          <button type="button" className="shelf-icon-button" aria-label={`Edit ${item.name}`} onClick={onEdit}>
            <Pencil aria-hidden="true" size={16} />
          </button>
          <button
            type="button"
            className="shelf-icon-button shelf-icon-button-danger"
            aria-label={`Remove ${item.name}`}
            onClick={onRemove}
          >
            <Trash2 aria-hidden="true" size={16} />
          </button>
        </div>
      </div>

      {onLoan ? (
        <div className="shelf-loan-banner" role="status">
          <div className="shelf-loan-banner-top">
            <StatusBadge status="On loan" tone="active" />
            <span className="shelf-loan-borrower">
              with {onLoan.borrowerName ?? 'a neighbor'}
            </span>
          </div>
          <p className="shelf-loan-return">Back by {onLoan.returnLabel}</p>
        </div>
      ) : pending ? (
        <div className="shelf-loan-banner shelf-loan-banner-pending" role="status">
          <div className="shelf-loan-banner-top">
            <StatusBadge status="Requested" tone={statusTone('loan', 'Requested')} />
            <span className="shelf-loan-borrower">
              {pending.borrowerName ?? 'A neighbor'} wants this
            </span>
          </div>
          <p className="shelf-loan-return">
            Pickup {pending.pickupLabel} · back by {pending.returnLabel}
          </p>
          {onAcceptPending ? (
            <button type="button" className="loan-lender shelf-loan-accept" onClick={onAcceptPending}>
              Accept request
            </button>
          ) : null}
        </div>
      ) : null}

      <dl className="shelf-meta">
        <MetaRow label="Qty">{item.quantity}</MetaRow>
        <MetaRow label="Condition">
          <span className={`shelf-condition shelf-condition-${item.condition.toLowerCase()}`}>
            {item.condition}
          </span>
        </MetaRow>
      </dl>

      {item.notes ? <p className="shelf-notes">{item.notes}</p> : <p className="shelf-notes shelf-notes-empty">No notes yet.</p>}

      <LendSwitch
        id={lendId}
        checked={available}
        disabled={lentOut}
        hint={
          lentOut
            ? `Out with ${givenName(onLoan?.borrowerName ?? 'a neighbor')} until return.`
            : available
              ? 'Neighbors can ask for this.'
              : 'Kept for home use only.'
        }
        onChange={onToggleLend}
      />
    </article>
  )
}

function IncomingLoanRow({ loan, onAccept }: { loan: LoanRequest; onAccept: () => void }) {
  return (
    <div className="shelf-incoming-row">
      <div className="shelf-incoming-copy">
        <p className="shelf-incoming-item">{loan.itemName}</p>
        <p className="shelf-incoming-meta">
          {loan.borrowerName ?? 'A neighbor'} · pickup {loan.pickupLabel} · back by {loan.returnLabel}
        </p>
      </div>
      <button type="button" className="loan-lender" onClick={onAccept}>
        Accept request
      </button>
    </div>
  )
}

function LendSwitch({
  id,
  checked,
  disabled = false,
  hint,
  onChange,
  form = false,
}: {
  id: string
  checked: boolean
  disabled?: boolean
  hint: string
  onChange: (available: boolean) => void
  form?: boolean
}) {
  return (
    <label
      className={`shelf-lend${form ? ' shelf-lend-form' : ''}${disabled ? ' shelf-lend-disabled' : ''}`}
      htmlFor={id}
    >
      <span className="shelf-lend-copy">
        <span className="shelf-lend-title">Available to lend</span>
        <span className="shelf-lend-hint">{hint}</span>
      </span>
      <span className="shelf-switch-control">
        <input
          id={id}
          className="shelf-switch-input"
          type="checkbox"
          role="switch"
          aria-checked={checked}
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="shelf-switch-track" aria-hidden="true">
          <span className="shelf-switch-knob" />
        </span>
      </span>
    </label>
  )
}

function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="shelf-meta-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function InventoryEditor({
  mode,
  draft,
  note,
  onDraftChange,
  onNoteClear,
  onSubmit,
  onCancel,
}: {
  mode: 'add' | 'edit'
  draft: InventoryDraft
  note: string
  onDraftChange: (draft: InventoryDraft) => void
  onNoteClear: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onCancel: () => void
}) {
  const nameId = useId()
  const categoryId = useId()
  const quantityId = useId()
  const conditionId = useId()
  const notesId = useId()
  const lendId = useId()
  const noteId = useId()
  const canSave = draft.name.trim().length > 0

  function patch(partial: Partial<InventoryDraft>) {
    onDraftChange({ ...draft, ...partial })
    if (note) onNoteClear()
  }

  return (
    <form className="shelf-form" onSubmit={onSubmit}>
      <div className="shelf-form-head">
        <div>
          <p className="eyebrow">{mode === 'add' ? 'New on the shelf' : 'Update item'}</p>
          <h2 id="shelf-dialog-title" className="shelf-form-title">
            {mode === 'add' ? 'Add item' : 'Edit item'}
          </h2>
        </div>
        <button type="button" className="shelf-icon-button" aria-label="Close" onClick={onCancel}>
          <X aria-hidden="true" size={18} />
        </button>
      </div>

      <div className="shelf-form-grid">
        <div className="shelf-field shelf-field-wide">
          <label htmlFor={nameId}>Name</label>
          <input
            id={nameId}
            value={draft.name}
            maxLength={nameMaxLength}
            placeholder="e.g. Circular saw"
            autoComplete="off"
            autoCapitalize="words"
            autoFocus
            required
            onChange={(event) => patch({ name: event.target.value })}
          />
        </div>

        <div className="shelf-field">
          <label htmlFor={categoryId}>Category</label>
          <select
            id={categoryId}
            value={draft.category}
            onChange={(event) => patch({ category: event.target.value as InventoryCategory })}
          >
            {inventoryCategories.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        <div className="shelf-field">
          <label htmlFor={quantityId}>Quantity</label>
          <input
            id={quantityId}
            type="number"
            min={1}
            max={99}
            value={draft.quantity}
            onChange={(event) => patch({ quantity: Number(event.target.value) })}
          />
        </div>

        <div className="shelf-field">
          <label htmlFor={conditionId}>Condition</label>
          <select
            id={conditionId}
            value={draft.condition}
            onChange={(event) =>
              patch({ condition: event.target.value as InventoryDraft['condition'] })
            }
          >
            {itemConditions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        <div className="shelf-field shelf-field-wide">
          <label htmlFor={notesId}>Notes</label>
          <textarea
            id={notesId}
            value={draft.notes}
            maxLength={notesMaxLength}
            rows={3}
            placeholder="Anything a neighbor should know before borrowing."
            onChange={(event) => patch({ notes: event.target.value })}
          />
        </div>
      </div>

      <LendSwitch
        id={lendId}
        form
        checked={draft.availableToLend}
        hint="Turn this on if neighbors can request it."
        onChange={(available) => patch({ availableToLend: available })}
      />

      {note ? (
        <p id={noteId} className="tool-add-note" role="status">
          {note}
        </p>
      ) : null}

      <div className="shelf-form-actions">
        <button type="button" className="tool-add-button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="tool-primary shelf-form-save" disabled={!canSave}>
          {mode === 'add' ? 'Add to shelf' : 'Save changes'}
        </button>
      </div>
    </form>
  )
}
