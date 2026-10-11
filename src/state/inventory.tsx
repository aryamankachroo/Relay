import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from '../api/client.ts'
import type { ApiInventoryItem } from '../api/types.ts'
import {
  normalizeToolName,
  type InventoryDraft,
  type InventoryItem,
} from '../data/bookshelfProject.ts'
import { InventoryContext } from './inventoryStore.ts'

export function InventoryProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancel = false
    api
      .inventory()
      .then((body) => {
        if (cancel) return
        if (body.snowflake !== 'ok') {
          setItems([])
          setStatus('error')
          setMessage(body.snowflake_message || 'Snowflake inventory is not available.')
          return
        }
        setItems(body.items.map(toShelfItem))
        setStatus('ready')
        setMessage('')
      })
      .catch((error: unknown) => {
        if (cancel) return
        setItems([])
        setStatus('error')
        setMessage(error instanceof Error ? error.message : 'Could not load inventory.')
      })
    return () => {
      cancel = true
    }
  }, [])

  const addItem = useCallback((draft: InventoryDraft) => {
    const next = sanitizeDraft(draft)
    if (!next) return false

    let added = false
    setItems((current) => {
      if (hasDuplicateName(current, next.name)) return current
      added = true
      return [
        ...current,
        {
          id: crypto.randomUUID(),
          ...next,
        },
      ]
    })
    return added
  }, [])

  const updateItem = useCallback((id: string, draft: InventoryDraft) => {
    const next = sanitizeDraft(draft)
    if (!next) return false

    let updated = false
    setItems((current) => {
      if (hasDuplicateName(current, next.name, id)) return current
      let found = false
      const mapped = current.map((item) => {
        if (item.id !== id) return item
        found = true
        return { ...item, ...next }
      })
      updated = found
      return found ? mapped : current
    })
    return updated
  }, [])

  const removeItem = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id))
  }, [])

  const setAvailableToLend = useCallback((id: string, available: boolean) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, availableToLend: available } : item)),
    )
  }, [])

  const value = useMemo(
    () => ({ items, status, message, addItem, updateItem, removeItem, setAvailableToLend }),
    [items, status, message, addItem, updateItem, removeItem, setAvailableToLend],
  )

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>
}

function sanitizeDraft(draft: InventoryDraft): Omit<InventoryItem, 'id'> | null {
  const name = draft.name.trim().replace(/\s+/g, ' ')
  if (!name) return null

  const quantity = Math.max(1, Math.min(99, Math.round(Number(draft.quantity)) || 1))

  return {
    name,
    category: draft.category,
    quantity,
    condition: draft.condition,
    notes: draft.notes.trim().replace(/\s+/g, ' '),
    availableToLend: draft.availableToLend,
  }
}

function toShelfItem(row: ApiInventoryItem): InventoryItem {
  const name = row.catalog_name || row.catalog_item || 'Item'
  return {
    id: row.inventory_id || `${row.resident_id}:${row.catalog_item}`,
    name,
    category: 'Tools',
    quantity: Number(row.quantity) || 1,
    condition: 'Good',
    notes: row.condition_note || '',
    availableToLend: Boolean(row.willing_to_lend),
  }
}

function hasDuplicateName(items: readonly InventoryItem[], name: string, ignoreId?: string) {
  const key = normalizeToolName(name)
  return items.some(
    (item) => item.id !== ignoreId && normalizeToolName(item.name) === key,
  )
}
