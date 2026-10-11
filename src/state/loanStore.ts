import { createContext, useContext } from 'react'
import type { LoanRequest, NeighborMatch } from '../data/lending.ts'

export type LoanStore = {
  requests: readonly LoanRequest[]
  requestLoan: (match: NeighborMatch, pickupId: string, returnId: string) => void
  advanceLoan: (requestId: string) => void
}

export const LoanRequestsContext = createContext<LoanStore | null>(null)

export function useLoanRequests() {
  const store = useContext(LoanRequestsContext)
  if (!store) throw new Error('useLoanRequests must be used within LoanRequestsProvider')
  return store
}
