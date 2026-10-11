import { useCallback, useMemo, type ReactNode } from 'react'
import { formatSlotIso, loanFromApi } from '../api/adapt.ts'
import { ApiError, api } from '../api/client.ts'
import type { ApiConflict } from '../api/types.ts'
import {
  isReturnSelectable,
  residentLenderId,
  type LoanRequest,
  type NeighborMatch,
} from '../data/lending.ts'
import { useActivityFeed } from './activityFeedStore.ts'
import { useCurrentResident } from './currentResident.ts'
import { LoanRequestsContext } from './loanStore.ts'
import { useShelfResident } from './shelfResident.tsx'

/** Borrow Tomorrow loans Avery is part of, read from the API activity poll. */
export function LoanRequestsProvider({ children }: { children: ReactNode }) {
  const { activity, directory, refresh } = useActivityFeed()
  const you = useCurrentResident()
  const shelfId = useShelfResident()

  const requests = useMemo<LoanRequest[]>(() => {
    if (!activity || !directory) return []
    return activity.loans.flatMap((loan) => {
      if (loan.lender_id !== shelfId && loan.borrower_id !== shelfId) return []
      const request = loanFromApi(loan, directory, shelfId)
      if (!request) return []
      return request.lenderId === residentLenderId
        ? [{ ...request, lenderName: you.name, lenderInitials: you.initials }]
        : [request]
    })
  }, [activity, directory, shelfId, you])

  const requestLoan = useCallback(
    async (match: NeighborMatch, pickupId: string, returnId: string) => {
      const pickup = match.pickupWindows.find((window) => window.id === pickupId)
      const due = match.returnWindows.find((window) => window.id === returnId)
      if (!pickup || !due || !isReturnSelectable(pickup, due)) return 'Choose an open pickup and return.'
      if (!pickup.start || !due.end || !match.catalogItemId) return 'This listing has no bookable time.'

      try {
        await api.createLoan(shelfId, {
          lender_id: match.resident.id,
          catalog_item_id: match.catalogItemId,
          window_start: pickup.start,
          window_end: due.end,
          inventory_id: match.id,
        })
      } catch (caught) {
        return loanProblem(caught)
      }
      await refresh()
      return null
    },
    [refresh, shelfId],
  )

  const advanceLoan = useCallback(
    async (requestId: string) => {
      const loan = requests.find((item) => item.id === requestId)
      if (!loan) return
      const step =
        loan.status === 'Requested'
          ? api.respondLoan(loan.id, 'accept')
          : loan.status === 'Confirmed'
            ? api.pickupLoan(loan.id)
            : loan.status === 'Picked up'
              ? api.returnLoan(loan.id)
              : null
      // A 409 means another tab already moved this loan; the refresh shows where it is.
      await step?.catch(() => null)
      await refresh()
    },
    [requests, refresh],
  )

  const value = useMemo(
    () => ({ requests, requestLoan, advanceLoan }),
    [requests, requestLoan, advanceLoan],
  )

  return <LoanRequestsContext.Provider value={value}>{children}</LoanRequestsContext.Provider>
}

function loanProblem(caught: unknown) {
  if (caught instanceof ApiError && caught.status === 409) {
    const detail = caught.detail as Partial<ApiConflict> | null
    const slot = detail?.next_free_slot
    const next = slot ? formatSlotIso(slot.start, slot.end) : ''
    return next
      ? `That time is already booked. The next free time is ${next}.`
      : 'That time is already booked, and nothing is free in the next week.'
  }
  if (caught instanceof Error) return caught.message
  return 'The request did not go through. Try again.'
}
