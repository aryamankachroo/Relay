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
      if (!handoff) return
      try {
        if (handoff.status === 'proposed') {
          // Demo stand-in: confirm for the recipient and every donor who has not yet.
          const parties = new Set<string>()
          if (!handoff.recipient_confirmed) parties.add(handoff.recipient_id)
          for (const row of handoff.allocations) if (!row.donor_confirmed) parties.add(row.resident_id)
          for (const party of parties) await api.confirmHandoff(handoff.id, party)
        } else if (handoff.status === 'confirmed') {
          await api.receiveHandoff(handoff.id)
        }
      } catch {
        // Another tab may have moved it first; the refresh below shows the real status.
      }
      await refresh()
    },
    [activity, refresh],
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
