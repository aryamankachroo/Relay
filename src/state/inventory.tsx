import { useCallback, useMemo, useState, type ReactNode } from 'react'
import {
  normalizeToolName,
  seededInventory,
  type InventoryDraft,
  type InventoryItem,
} from '../data/bookshelfProject.ts'
import { InventoryContext } from './inventoryStore.ts'

/** Refresh restores Avery’s known Willow Court shelf (in-memory only). */
function createSeededInventory(): InventoryItem[] {
  return seededInventory.map((item) => ({ ...item }))
}

export function InventoryProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<InventoryItem[]>(createSeededInventory)

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
    () => ({ items, addItem, updateItem, removeItem, setAvailableToLend }),
    [items, addItem, updateItem, removeItem, setAvailableToLend],
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

function hasDuplicateName(items: readonly InventoryItem[], name: string, ignoreId?: string) {
  const key = normalizeToolName(name)
  return items.some(
    (item) => item.id !== ignoreId && normalizeToolName(item.name) === key,
  )
}
