import { createContext, useContext } from 'react'
import type { ExchangeDraft, ExchangeRequest, HandoffPart, HandoffRecord } from '../data/exchanges.ts'

export type HandoffStore = {
  requests: readonly ExchangeRequest[]
  handoffs: readonly HandoffRecord[]
  postExchange: (draft: ExchangeDraft) => ExchangeRequest
  updateExchange: (id: string, draft: ExchangeDraft) => void
  arrangeHandoff: (requestId: string, parts: readonly HandoffPart[]) => HandoffRecord | null
  advanceHandoff: (handoffId: string) => void
}

export const HandoffContext = createContext<HandoffStore | null>(null)

export function useHandoffs() {
  const store = useContext(HandoffContext)
  if (!store) throw new Error('useHandoffs must be used within HandoffsProvider')
  return store
}
