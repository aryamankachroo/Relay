import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { demoResident } from '../data/index.ts'
import {
  isReturnSelectable,
  nextLoanStatus,
  residentLenderId,
  type LoanRequest,
  type NeighborMatch,
} from '../data/lending.ts'
import { LoanRequestsContext } from './loanStore.ts'

/**
 * Seeded Borrow Tomorrow loans for the hackathon walkthrough.
 * Refresh reloads this known set (in-memory only — no persistence).
 * Stages: Requested (accept), Picked up (return), Returned (Garden count).
 * Jordan’s hand saw is left open so Chat can demonstrate a fresh request.
 * Avery-as-lender seeds cover incoming accept + an item already out on loan.
 */
function createSeededLoans(): LoanRequest[] {
  return [
    {
      id: 'loan-seed-priya-saw',
      listingId: 'listing-priya-saw',
      toolName: 'Saw',
      itemName: 'Circular saw',
      lenderId: 'neighbor-priya',
      lenderName: 'Priya Shah',
      lenderInitials: 'PS',
      portrait: 'circular-saw',
      pickupWindowId: 'priya-pick-sat-9',
      pickupLabel: 'Saturday, 9–11 am',
      returnWindowId: 'priya-back-sun-5',
      returnLabel: 'Sunday by 5 pm',
      status: 'Requested',
    },
    {
      id: 'loan-seed-elena-sander',
      listingId: 'listing-elena-sander',
      toolName: 'Sander',
      itemName: 'Orbital sander',
      lenderId: 'neighbor-elena',
      lenderName: 'Elena Voss',
      lenderInitials: 'EV',
      portrait: 'orbital-sander',
      pickupWindowId: 'elena-pick-sat-10',
      pickupLabel: 'Saturday, 10 am–12 pm',
      returnWindowId: 'elena-back-sun-6',
      returnLabel: 'Sunday by 6 pm',
      status: 'Picked up',
    },
    {
      id: 'loan-seed-returned-drill',
      listingId: 'listing-maya-drill',
      toolName: 'Drill',
      itemName: 'Cordless drill',
      lenderId: 'neighbor-maya',
      lenderName: 'Maya Chen',
      lenderInitials: 'MC',
      portrait: 'cordless-drill',
      pickupWindowId: 'past-pick',
      pickupLabel: 'Last Saturday, 10 am–12 pm',
      returnWindowId: 'past-return',
      returnLabel: 'Last Sunday by 5 pm',
      status: 'Returned',
    },
    {
      id: 'loan-seed-incoming-hammer',
      listingId: 'inv-hammer',
      toolName: 'Hammer',
      itemName: 'Hammer',
      lenderId: residentLenderId,
      lenderName: demoResident.name,
      lenderInitials: demoResident.initials,
      inventoryItemId: 'inv-hammer',
      borrowerId: 'neighbor-jordan',
      borrowerName: 'Jordan Hale',
      borrowerInitials: 'JH',
      pickupWindowId: 'avery-pick-sat-2',
      pickupLabel: 'Saturday, 2–4 pm',
      returnWindowId: 'avery-back-sun-5',
      returnLabel: 'Sunday by 5 pm',
      status: 'Requested',
    },
    {
      id: 'loan-seed-outbound-cord',
      listingId: 'inv-extension-cord',
      toolName: 'Extension cord',
      itemName: 'Extension cord',
      lenderId: residentLenderId,
      lenderName: demoResident.name,
      lenderInitials: demoResident.initials,
      inventoryItemId: 'inv-extension-cord',
      borrowerId: 'neighbor-priya',
      borrowerName: 'Priya Shah',
      borrowerInitials: 'PS',
      pickupWindowId: 'avery-pick-fri-5',
      pickupLabel: 'Friday, 5–6 pm',
      returnWindowId: 'avery-back-mon-9',
      returnLabel: 'Monday by 9 am',
      status: 'Picked up',
    },
  ]
}

export function LoanRequestsProvider({ children }: { children: ReactNode }) {
  const [requests, setRequests] = useState<LoanRequest[]>(createSeededLoans)

  const requestLoan = useCallback((match: NeighborMatch, pickupId: string, returnId: string) => {
    const pickup = match.pickupWindows.find((window) => window.id === pickupId)
    const due = match.returnWindows.find((window) => window.id === returnId)
    if (!pickup || !due || !isReturnSelectable(pickup, due)) return

    setRequests((current) => {
      const openDuplicate = current.some(
        (loan) => loan.listingId === match.id && loan.status !== 'Returned',
      )
      if (openDuplicate) return current
      return [
        ...current,
        {
          id: crypto.randomUUID(),
          listingId: match.id,
          toolName: match.toolName,
          itemName: match.itemName,
          lenderId: match.resident.id,
          lenderName: match.resident.name,
          lenderInitials: match.resident.initials,
          portrait: match.portrait,
          pickupWindowId: pickup.id,
          pickupLabel: pickup.label,
          returnWindowId: due.id,
          returnLabel: due.label,
          status: 'Requested',
        },
      ]
    })
  }, [])

  const advanceLoan = useCallback((requestId: string) => {
    setRequests((current) => {
      const target = current.find((loan) => loan.id === requestId)
      if (!target) return current
      const next = nextLoanStatus(target.status)
      if (!next) return current
      return current.map((loan) => (loan.id === requestId ? { ...loan, status: next } : loan))
    })
  }, [])

  const value = useMemo(
    () => ({ requests, requestLoan, advanceLoan }),
    [requests, requestLoan, advanceLoan],
  )

  return <LoanRequestsContext.Provider value={value}>{children}</LoanRequestsContext.Provider>
}
