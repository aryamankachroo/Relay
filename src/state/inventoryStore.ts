import { createContext, useContext } from 'react'
import type { InventoryDraft, InventoryItem } from '../data/bookshelfProject.ts'

export type InventoryStore = {
  items: readonly InventoryItem[]
  addItem: (draft: InventoryDraft) => boolean
  updateItem: (id: string, draft: InventoryDraft) => boolean
  removeItem: (id: string) => void
  setAvailableToLend: (id: string, available: boolean) => void
}

export const InventoryContext = createContext<InventoryStore | null>(null)

export function useInventory() {
  const store = useContext(InventoryContext)
  if (!store) throw new Error('useInventory must be used within InventoryProvider')
  return store
}
