import { createContext, useContext } from 'react'
import type { InventoryDraft, InventoryItem } from '../data/bookshelfProject.ts'

export type InventoryStore = {
  items: readonly InventoryItem[]
  status: 'loading' | 'ready' | 'error'
  message: string
  addItem: (draft: InventoryDraft) => Promise<boolean>
  updateItem: (id: string, draft: InventoryDraft) => Promise<boolean>
  removeItem: (id: string) => Promise<void>
  setAvailableToLend: (id: string, available: boolean) => Promise<void>
}

export const InventoryContext = createContext<InventoryStore | null>(null)

export function useInventory() {
  const store = useContext(InventoryContext)
  if (!store) throw new Error('useInventory must be used within InventoryProvider')
  return store
}
