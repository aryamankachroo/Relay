import { createContext, useContext, type ReactNode } from 'react'

const ShelfResidentContext = createContext<string | null>(null)

/** The existing neighbor this Clerk login keeps. The match does not change. */
export function ShelfResidentProvider({
  residentId,
  children,
}: {
  residentId: string
  children: ReactNode
}) {
  return <ShelfResidentContext.Provider value={residentId}>{children}</ShelfResidentContext.Provider>
}

export function useShelfResident() {
  const residentId = useContext(ShelfResidentContext)
  if (!residentId) throw new Error('useShelfResident must be used within ShelfResidentProvider')
  return residentId
}
