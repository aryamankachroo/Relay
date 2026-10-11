import { useId, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { Check, Circle, ClipboardCheck, Plus, X } from 'lucide-react'
import { NeighborMatchList } from './NeighborMatchCard.tsx'
import { projectTools, type ProjectTool } from '../api/adapt.ts'
import { api } from '../api/client.ts'
import type { ApiCatalogItem, ApiProject, ApiProjectTool, ApiWindow } from '../api/types.ts'
import { normalizeToolName, type ChecklistTool, type InventorySplit } from '../data/bookshelfProject.ts'
import { useActivityFeed } from '../state/activityFeedStore.ts'

const toolNameMaxLength = 40

export function ToolChecklistCard({
  title,
  summary,
  projectId,
  window,
  tools: initialTools,
}: {
  title: string
  summary: string
  projectId: string
  window: ApiWindow | null
  tools: ApiProjectTool[]
}) {
  const titleId = useId()
  const addInputId = useId()
  const addNoteId = useId()
  const resultRef = useRef<HTMLDivElement>(null)
  const { directory } = useActivityFeed()
  const [tools, setTools] = useState<ProjectTool[]>(() => projectTools(initialTools))
  const [draftName, setDraftName] = useState('')
  const [addNote, setAddNote] = useState('')
  const [checked, setChecked] = useState(false)

  const split = checked ? splitByHaveAlready(tools) : null
  const canAdd = draftName.trim().length > 0

  useLayoutEffect(() => {
    if (!checked) return
    scrollResultIntoView(resultRef.current)
  }, [checked])

  async function save(change: Promise<ApiProject>) {
    try {
      const project = await change
      setTools((current) => projectTools(project.tools, current))
      return true
    } catch (caught) {
      setAddNote(caught instanceof Error ? caught.message : 'The list could not be saved.')
      return false
    }
  }

  function toggleSelected(id: string) {
    setTools((current) =>
      current.map((tool) => (tool.id === id ? { ...tool, selected: !tool.selected } : tool)),
    )
  }

  function toggleRequired(id: string) {
    const tool = tools.find((item) => item.id === id)
    if (!tool) return
    void save(api.updateTool(projectId, id, { optional: tool.required }))
  }

  function removeTool(id: string) {
    void save(api.removeTool(projectId, id))
  }

  async function onAddTool(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = draftName.trim().replace(/\s+/g, ' ')
    if (!name) return

    const catalog = directory ? [...directory.catalog.values()] : await api.catalog().catch(() => [])
    const item = catalogItemNamed(name, catalog)
    if (!item) {
      const known = catalog.filter((row) => row.category === 'tool').map((row) => row.name.toLowerCase())
      setAddNote(
        known.length > 0
          ? `Not in the catalog yet. Try ${known.join(', ')}.`
          : 'Not in the catalog yet.',
      )
      return
    }
    if (tools.some((tool) => tool.catalogItemId === item.id)) {
      setAddNote('Already on the list.')
      return
    }

    if (await save(api.addTool(projectId, item.id))) {
      setDraftName('')
      setAddNote('')
    }
  }

  function onCheckInventory() {
    if (checked) {
      scrollResultIntoView(resultRef.current)
      return
    }
    setChecked(true)
  }

  return (
    <div className="tool-card">
      <div className="tool-card-copy">
        <p className="eyebrow">Project</p>
        <h2 id={titleId} className="tool-card-title">
          {title}
        </h2>
        <p className="tool-card-summary">{summary}</p>
      </div>
      {tools.length === 0 ? (
        <p className="tool-card-empty">Add a tool to start the list.</p>
      ) : (
        <ul className="tool-list" aria-labelledby={titleId}>
          {tools.map((tool) => (
            <li key={tool.id} className="tool-row">
              <label className="tool-select">
                <span className="tool-check">
                  <input
                    type="checkbox"
                    className="tool-toggle"
                    checked={tool.selected}
                    onChange={() => toggleSelected(tool.id)}
                  />
                  <span className="tool-box" aria-hidden="true" />
                </span>
                <span className="tool-name">{tool.name}</span>
              </label>
              <button
                type="button"
                className={
                  tool.required ? 'tool-flag tool-flag-required' : 'tool-flag tool-flag-optional'
                }
                aria-pressed={tool.required}
                aria-label={
                  tool.required
                    ? `${tool.name} is required. Mark as optional.`
                    : `${tool.name} is optional. Mark as required.`
                }
                onClick={() => toggleRequired(tool.id)}
              >
                {tool.required ? 'Required' : 'Optional'}
              </button>
              <button
                type="button"
                className="tool-remove"
                aria-label={`Remove ${tool.name}`}
                onClick={() => removeTool(tool.id)}
              >
                <X aria-hidden="true" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="hint tool-card-hint">Only checked tools are compared with your inventory.</p>
      <div className="tool-add-block">
        <form className="tool-add" onSubmit={(event) => void onAddTool(event)}>
          <label className="sr-only" htmlFor={addInputId}>
            Tool name
          </label>
          <input
            id={addInputId}
            className="tool-add-input"
            value={draftName}
            placeholder="Tool name"
            maxLength={toolNameMaxLength}
            autoComplete="off"
            autoCapitalize="words"
            aria-describedby={addNote ? addNoteId : undefined}
            onChange={(event) => {
              setDraftName(event.target.value)
              if (addNote) setAddNote('')
            }}
          />
          <button type="submit" className="tool-add-button" disabled={!canAdd}>
            <Plus aria-hidden="true" size={16} />
            Add
          </button>
        </form>
        {addNote ? (
          <p id={addNoteId} className="tool-add-note">
            {addNote}
          </p>
        ) : null}
      </div>
      <button type="button" className="tool-primary" onClick={onCheckInventory}>
        <ClipboardCheck aria-hidden="true" size={18} />
        Check my inventory
      </button>
      {split ? (
        <div className="inventory-followup" ref={resultRef}>
          <div className="inventory-result" aria-live="polite">
            <InventoryResult split={split} />
            {split.missing.length > 0 ? (
              <p className="sr-only">Nearby matches for the tools you need are listed below.</p>
            ) : null}
          </div>
          {split.missing.length > 0 ? (
            <NeighborMatchList tools={split.missing} projectWindow={window} />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/** The API marks tools Avery already owns, from the Snowflake inventory. */
function splitByHaveAlready(tools: readonly ProjectTool[]) {
  const selected = tools.filter((tool) => tool.selected)
  return {
    owned: selected.filter((tool) => tool.haveAlready),
    missing: selected.filter((tool) => !tool.haveAlready),
  }
}

function catalogItemNamed(name: string, catalog: readonly ApiCatalogItem[]) {
  const key = normalizeToolName(name)
  const singular = key.endsWith('s') ? key.slice(0, -1) : key
  return catalog.find((item) => {
    const itemName = normalizeToolName(item.name)
    return [itemName, item.id.replace(/-/g, ' ')].some(
      (candidate) => candidate === key || candidate === singular || candidate === `${key}s`,
    )
  })
}

function InventoryResult({ split }: { split: InventorySplit }) {
  if (split.owned.length === 0 && split.missing.length === 0) {
    return (
      <p className="inventory-note">
        Check a tool on the list, and I will compare it with your inventory.
      </p>
    )
  }

  if (split.missing.length === 0) {
    return (
      <div className="inventory-clear">
        <div className="inventory-clear-heading">
          <Check aria-hidden="true" size={20} />
          <p className="inventory-clear-title">You have everything</p>
        </div>
        <p className="inventory-clear-copy">Every tool you checked is already in your inventory.</p>
        <ul className="inventory-items">
          {split.owned.map((tool) => (
            <InventoryItem key={tool.id} tool={tool} tone="owned" />
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="inventory-split">
      <InventoryPanel
        title="You have"
        tools={split.owned}
        tone="owned"
        emptyLabel="None of the checked tools are in your inventory yet."
      />
      <InventoryPanel title="You need" tools={split.missing} tone="missing" emptyLabel="" />
    </div>
  )
}

function InventoryPanel({
  title,
  tools,
  tone,
  emptyLabel,
}: {
  title: string
  tools: ChecklistTool[]
  tone: 'owned' | 'missing'
  emptyLabel: string
}) {
  const headingId = useId()

  return (
    <section className={`inventory-panel inventory-panel-${tone}`} aria-labelledby={headingId}>
      <h3 id={headingId} className="inventory-heading">
        {title}
        <span className="inventory-count">{tools.length}</span>
      </h3>
      {tools.length === 0 ? (
        <p className="inventory-empty">{emptyLabel}</p>
      ) : (
        <ul className="inventory-items">
          {tools.map((tool) => (
            <InventoryItem key={tool.id} tool={tool} tone={tone} />
          ))}
        </ul>
      )}
    </section>
  )
}

function InventoryItem({ tool, tone }: { tool: ChecklistTool; tone: 'owned' | 'missing' }) {
  const Icon = tone === 'owned' ? Check : Circle

  return (
    <li className={`inventory-item inventory-item-${tone}`}>
      <Icon aria-hidden="true" size={16} />
      <span className="inventory-item-name">{tool.name}</span>
      {tool.required ? null : <span className="inventory-optional">Optional</span>}
    </li>
  )
}

function scrollResultIntoView(result: HTMLElement | null) {
  const log = result?.closest('.chat-log')
  if (!result || !(log instanceof HTMLElement)) return
  const top = result.getBoundingClientRect().top - log.getBoundingClientRect().top + log.scrollTop - 12
  log.scrollTo({ top: Math.max(0, top), behavior: 'auto' })
}
