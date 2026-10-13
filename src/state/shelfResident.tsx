import type { ReactNode } from 'react'
import { ShelfResidentContext } from './shelfResidentStore.ts'

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
