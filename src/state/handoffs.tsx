import { useCallback, useMemo, type ReactNode } from 'react'
import { exchangeRequestsFromApi, handoffsFromApi } from '../api/adapt.ts'
import { api } from '../api/client.ts'
import type { ExchangeDraft } from '../data/exchanges.ts'
import { useActivityFeed } from './activityFeedStore.ts'
import { useShelfResident } from './shelfResident.tsx'
import { HandoffContext } from './handoffStore.ts'

/** Hand Off needs, offers, and handoffs, read from the API activity poll. */
export function HandoffsProvider({ children }: { children: ReactNode }) {
  const { activity, directory, refresh } = useActivityFeed()
  const shelfId = useShelfResident()

  const requests = useMemo(
    () => (activity && directory ? exchangeRequestsFromApi(activity, directory, shelfId) : []),
    [activity, directory, shelfId],
  )
  const handoffs = useMemo(
    () => (activity && directory ? handoffsFromApi(activity, directory, shelfId) : []),
    [activity, directory, shelfId],
  )

  const confirmExchange = useCallback(
    async (draft: ExchangeDraft, pendingRequestId: string | null) => {
      try {
        let requestId = pendingRequestId
        if (!requestId) {
          const drafted = await api.chat(shelfId, sentenceFor(draft))
          if (drafted.type !== 'confirmation') {
            return {
              requestId: null,
              message: drafted.type === 'no_match' ? drafted.message : 'Relay could not read that item.',
            }
          }
          requestId = drafted.request_id
        }
        const result = await api.confirmRequest(shelfId, requestId)
        await refresh()
        return { requestId, message: result.type === 'no_match' ? result.message : null }
      } catch (caught) {
        return {
          requestId: null,
          message: caught instanceof Error ? caught.message : 'The Relay API is not answering.',
        }
      }
    },
    [refresh, shelfId],
  )

  const advanceHandoff = useCallback(
    async (handoffId: string) => {
      const handoff = activity?.handoffs.find((item) => item.id === handoffId)
      if (!handoff) return 'That handoff is no longer on this list.'
      try {
        if (handoff.status === 'proposed') {
          const mine =
            handoff.recipient_id === shelfId ||
            handoff.allocations.some((row) => row.resident_id === shelfId)
          if (!mine) return 'Only the people in this handoff can confirm it.'
          await api.confirmHandoff(handoff.id, shelfId)
        } else if (handoff.status === 'confirmed') {
          if (handoff.recipient_id !== shelfId) return 'Only the person receiving this can mark it received.'
          await api.receiveHandoff(handoff.id)
        }
      } catch (caught) {
        await refresh()
        return caught instanceof Error ? caught.message : 'The handoff could not be updated.'
      }
      await refresh()
      return null
    },
    [activity, refresh, shelfId],
  )

  const value = useMemo(
    () => ({ requests, handoffs, confirmExchange, advanceHandoff }),
    [requests, handoffs, confirmExchange, advanceHandoff],
  )

  return <HandoffContext.Provider value={value}>{children}</HandoffContext.Provider>
}

function sentenceFor(draft: ExchangeDraft) {
  const what = `${draft.quantity} ${draft.item.toLowerCase()}`
  const when = draft.windowLabel ? ` ${draft.windowLabel}` : ''
  const where = draft.pickupArea ? ` at ${draft.pickupArea}` : ''
  return draft.kind === 'need' ? `I need ${what}${when}${where}` : `I have ${what} to give${when}${where}`
}
