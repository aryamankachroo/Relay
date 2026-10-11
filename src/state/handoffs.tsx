import { useCallback, useMemo, useState, type ReactNode } from 'react'
import {
  nextHandoffStatus,
  type ExchangeDraft,
  type ExchangeRequest,
  type HandoffPart,
  type HandoffRecord,
} from '../data/exchanges.ts'
import { HandoffContext } from './handoffStore.ts'

/**
 * Seeded Hand Off requests for the walkthrough.
 * Refresh reloads this known set (in-memory only — no persistence).
 */
function createSeededRequests(): ExchangeRequest[] {
  return [
  {
    id: 'exchange-seed-notebooks',
    kind: 'need',
    item: 'Notebooks',
    quantity: 20,
    pickupArea: '14 Willow Court',
    windowLabel: 'Saturday morning',
    status: 'Matched',
    fulfilled: 20,
  },
  {
    id: 'exchange-seed-ladder',
    kind: 'need',
    item: 'Ladder',
    quantity: 1,
    pickupArea: '14 Willow Court',
    windowLabel: 'Saturday',
    status: 'Matched',
    fulfilled: 1,
  },
  {
    id: 'exchange-seed-cooler',
    kind: 'offer',
    item: 'Cooler',
    quantity: 1,
    pickupArea: '14 Willow Court',
    windowLabel: 'Sunday afternoon',
    status: 'Matched',
    fulfilled: 1,
  },
  ]
}

function createSeededHandoffs(): HandoffRecord[] {
  return [
  {
    id: 'handoff-seed-notebooks',
    requestId: 'exchange-seed-notebooks',
    kind: 'need',
    item: 'Notebooks',
    quantity: 20,
    pickupArea: '14 Willow Court',
    windowLabel: 'Saturday morning',
    status: 'Confirmed',
    parts: [
      {
        listingId: 'offer-priya-notebooks',
        neighborName: 'Priya Shah',
        initials: 'PS',
        quantity: 12,
        location: '22 Willow Court',
        distance: 'About 80 yards',
        windowLabel: 'Saturday, 10 am–12 pm',
      },
      {
        listingId: 'offer-jordan-notebooks',
        neighborName: 'Jordan Hale',
        initials: 'JH',
        quantity: 8,
        location: '8 Birch Lane',
        distance: 'About 2 blocks',
        windowLabel: 'Saturday, 2–4 pm',
      },
    ],
  },
  {
    id: 'handoff-seed-ladder',
    requestId: 'exchange-seed-ladder',
    kind: 'need',
    item: 'Ladder',
    quantity: 1,
    pickupArea: '14 Willow Court',
    windowLabel: 'Saturday',
    status: 'Pending confirmation',
    parts: [
      {
        listingId: 'offer-elena-ladder',
        neighborName: 'Elena Voss',
        initials: 'EV',
        quantity: 1,
        location: '5 Cedar Path',
        distance: 'About 3 blocks',
        windowLabel: 'Saturday, 9–11 am',
      },
    ],
  },
  {
    id: 'handoff-seed-cooler',
    requestId: 'exchange-seed-cooler',
    kind: 'offer',
    item: 'Cooler',
    quantity: 1,
    pickupArea: '14 Willow Court',
    windowLabel: 'Sunday afternoon',
    status: 'Received',
    parts: [
      {
        listingId: 'need-maya-cooler',
        neighborName: 'Maya Chen',
        initials: 'MC',
        quantity: 1,
        location: '18 Oak Street',
        distance: 'About 4 blocks',
        windowLabel: 'Sunday, 1–3 pm',
      },
    ],
  },
  ]
}

export function HandoffsProvider({ children }: { children: ReactNode }) {
  const [requests, setRequests] = useState<ExchangeRequest[]>(createSeededRequests)
  const [handoffs, setHandoffs] = useState<HandoffRecord[]>(createSeededHandoffs)

  const postExchange = useCallback((draft: ExchangeDraft) => {
    const request: ExchangeRequest = {
      id: crypto.randomUUID(),
      kind: draft.kind,
      item: draft.item,
      quantity: draft.quantity,
      pickupArea: draft.pickupArea,
      windowLabel: draft.windowLabel,
      status: 'Open',
      fulfilled: 0,
    }
    setRequests((current) => [...current, request])
    return request
  }, [])

  const updateExchange = useCallback((id: string, draft: ExchangeDraft) => {
    setRequests((current) =>
      current.map((item) =>
        item.id === id && item.fulfilled === 0
          ? {
              ...item,
              kind: draft.kind,
              item: draft.item,
              quantity: draft.quantity,
              pickupArea: draft.pickupArea,
              windowLabel: draft.windowLabel,
            }
          : item,
      ),
    )
  }, [])

  const arrangeHandoff = useCallback(
    (requestId: string, parts: readonly HandoffPart[]) => {
      const request = requests.find((item) => item.id === requestId)
      if (!request || parts.length === 0) return null

      const remaining = request.quantity - request.fulfilled
      if (remaining <= 0) return null

      const existing = handoffs.find((item) => item.requestId === requestId) ?? null
      // Append only while the first handoff is still waiting; later statuses are locked in.
      if (existing && existing.status !== 'Pending confirmation') return null

      const usedIds = new Set(existing?.parts.map((part) => part.listingId) ?? [])
      let left = remaining
      const capped: HandoffPart[] = []
      for (const part of parts) {
        if (left <= 0 || usedIds.has(part.listingId) || part.quantity <= 0) continue
        const quantity = Math.min(part.quantity, left)
        capped.push({ ...part, quantity })
        usedIds.add(part.listingId)
        left -= quantity
      }
      if (capped.length === 0) return null

      const added = capped.reduce((sum, part) => sum + part.quantity, 0)
      const nextFulfilled = request.fulfilled + added
      const nextStatus = nextFulfilled >= request.quantity ? 'Matched' : 'Open'

      setRequests((current) =>
        current.map((item) =>
          item.id === requestId
            ? { ...item, fulfilled: nextFulfilled, status: nextStatus }
            : item,
        ),
      )

      if (existing) {
        const updated: HandoffRecord = {
          ...existing,
          quantity: existing.quantity + added,
          parts: [...existing.parts, ...capped],
        }
        setHandoffs((current) =>
          current.map((item) => (item.id === existing.id ? updated : item)),
        )
        return updated
      }

      const record: HandoffRecord = {
        id: crypto.randomUUID(),
        requestId,
        kind: request.kind,
        item: request.item,
        quantity: added,
        pickupArea: request.pickupArea,
        windowLabel: request.windowLabel,
        parts: capped,
        status: 'Pending confirmation',
      }
      setHandoffs((current) =>
        current.some((item) => item.requestId === requestId) ? current : [...current, record],
      )
      return record
    },
    [requests, handoffs],
  )

  const advanceHandoff = useCallback((handoffId: string) => {
    setHandoffs((current) =>
      current.map((record) => {
        if (record.id !== handoffId) return record
        const next = nextHandoffStatus(record.status)
        return next ? { ...record, status: next } : record
      }),
    )
  }, [])

  const value = useMemo(
    () => ({
      requests,
      handoffs,
      postExchange,
      updateExchange,
      arrangeHandoff,
      advanceHandoff,
    }),
    [requests, handoffs, postExchange, updateExchange, arrangeHandoff, advanceHandoff],
  )

  return <HandoffContext.Provider value={value}>{children}</HandoffContext.Provider>
}
