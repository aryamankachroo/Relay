import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ApiError, api } from '../api/client.ts'
import type { ApiInventoryItem } from '../api/types.ts'
import {
  normalizeToolName,
  type InventoryDraft,
  type InventoryItem,
} from '../data/bookshelfProject.ts'
import { InventoryContext } from './inventoryStore.ts'

export function InventoryProvider({ residentId, children }: { residentId: string; children: ReactNode }) {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancel = false
    api
      .inventory(residentId)
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
  }, [residentId])

  const addItem = useCallback(async (draft: InventoryDraft) => {
    const next = sanitizeDraft(draft)
    if (!next) return false
    if (hasDuplicateName(items, next.name)) return false
    try {
      const saved = await api.createInventory(residentId, shelfBody(next))
      setItems((current) => [...current, toShelfItem(saved)])
      return true
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) return false
      return false
    }
  }, [items, residentId])

  const updateItem = useCallback(async (id: string, draft: InventoryDraft) => {
    const next = sanitizeDraft(draft)
    if (!next) return false
    if (hasDuplicateName(items, next.name, id)) return false
    try {
      const saved = await api.updateInventory(residentId, id, shelfBody(next))
      setItems((current) => current.map((item) => (item.id === id ? toShelfItem(saved) : item)))
      return true
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) return false
      return false
    }
  }, [items, residentId])

  const removeItem = useCallback(async (id: string) => {
    const previous = items
    setItems((current) => current.filter((item) => item.id !== id))
    try {
      await api.deleteInventory(residentId, id)
    } catch {
      setItems(previous)
    }
  }, [items, residentId])

  const setAvailableToLend = useCallback(async (id: string, available: boolean) => {
    const current = items.find((item) => item.id === id)
    if (!current) return
    setItems((rows) => rows.map((item) => (item.id === id ? { ...item, availableToLend: available } : item)))
    try {
      const saved = await api.updateInventory(residentId, id, shelfBody({ ...current, availableToLend: available }))
      setItems((rows) => rows.map((item) => (item.id === id ? toShelfItem(saved) : item)))
    } catch {
      setItems((rows) => rows.map((item) => (item.id === id ? current : item)))
    }
  }, [items, residentId])

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

const shelfCategories = ['Tools', 'Garden', 'Kitchen', 'Household', 'Sports'] as const
const shelfConditions = ['Excellent', 'Good', 'Fair'] as const

function shelfBody(item: Omit<InventoryItem, 'id'>) {
  return {
    name: item.name,
    category: item.category,
    quantity: item.quantity,
    condition: item.condition,
    notes: item.notes,
    available_to_lend: item.availableToLend,
  }
}

function toShelfItem(row: ApiInventoryItem): InventoryItem {
  const name = row.catalog_name || row.catalog_item || 'Item'
  const quantity = Number(row.quantity)
  const category = shelfCategories.find((value) => value === row.category) ?? 'Household'
  const condition = shelfConditions.find((value) => value === row.condition) ?? 'Good'
  return {
    id: row.inventory_id || `${row.resident_id}:${row.catalog_item}`,
    name,
    category,
    quantity: Number.isFinite(quantity) ? quantity : 0,
    condition,
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
