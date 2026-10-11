import { createContext, useContext } from 'react'
import type { ExchangeDraft, ExchangeRequest, HandoffRecord } from '../data/exchanges.ts'

export type ConfirmedExchange = {
  /** Avery's published request, or null when nothing was published. */
  requestId: string | null
  /** Shown when the API had no match or could not publish. */
  message: string | null
}

export type HandoffStore = {
  requests: readonly ExchangeRequest[]
  handoffs: readonly HandoffRecord[]
  /** Publishes the pending request, or a fresh one when the draft was edited, and matches it. */
  confirmExchange: (draft: ExchangeDraft, pendingRequestId: string | null) => Promise<ConfirmedExchange>
  advanceHandoff: (handoffId: string) => Promise<void>
}

export const HandoffContext = createContext<HandoffStore | null>(null)

export function useHandoffs() {
  const store = useContext(HandoffContext)
  if (!store) throw new Error('useHandoffs must be used within HandoffsProvider')
  return store
}
