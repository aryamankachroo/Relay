import { createContext, useContext } from 'react'

export const ShelfResidentContext = createContext<string | null>(null)

export function useShelfResident() {
  const residentId = useContext(ShelfResidentContext)
  if (!residentId) throw new Error('useShelfResident must be used within ShelfResidentProvider')
  return residentId
}
