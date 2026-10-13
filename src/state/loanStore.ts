import { createContext, useContext } from 'react'
import type { LoanRequest, NeighborMatch } from '../data/lending.ts'

export type LoanStore = {
  requests: readonly LoanRequest[]
  /** Resolves to a message the card can show when the request was not sent. */
  requestLoan: (match: NeighborMatch, pickupId: string, returnId: string) => Promise<string | null>
  advanceLoan: (requestId: string) => Promise<string | null>
}

export const LoanRequestsContext = createContext<LoanStore | null>(null)

export function useLoanRequests() {
  const store = useContext(LoanRequestsContext)
  if (!store) throw new Error('useLoanRequests must be used within LoanRequestsProvider')
  return store
}
