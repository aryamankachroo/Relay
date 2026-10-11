import { demoResident } from './index.ts'
import { demoNeighbors } from './lending.ts'

/**
 * Mock needs and offers around Willow Court.
 * Notebook amounts are written out so a need for 20 can be covered by 12 + 8.
 * Nothing calls a model or a backend.
 */

export type ExchangeKind = 'need' | 'offer'

export type ExchangeDraft = {
  kind: ExchangeKind
  item: string
  quantity: number
  pickupArea: string
  windowLabel: string
}

export type ExchangeRequest = ExchangeDraft & {
  id: string
  status: 'Open' | 'Matched'
  fulfilled: number
}

export type HandoffPart = {
  listingId: string
  neighborName: string
  initials: string
  quantity: number
  location: string
  distance: string
  windowLabel: string
}

export type HandoffStatus = 'Pending confirmation' | 'Confirmed' | 'Received'

export const handoffStatusSteps = ['Pending confirmation', 'Confirmed', 'Received'] as const

export type HandoffRecord = {
  id: string
  requestId: string
  kind: ExchangeKind
  item: string
  quantity: number
  pickupArea: string
  windowLabel: string
  parts: HandoffPart[]
  status: HandoffStatus
}

export function nextHandoffStatus(status: HandoffStatus): HandoffStatus | null {
  const index = handoffStatusSteps.indexOf(status)
  if (index < 0 || index >= handoffStatusSteps.length - 1) return null
  return handoffStatusSteps[index + 1] ?? null
}

export function canAdvanceHandoff(from: HandoffStatus, to: HandoffStatus) {
  return nextHandoffStatus(from) === to
}

export function isHandoffComplete(status: HandoffStatus) {
  return status === 'Received'
}

export function handoffActionLabel(status: HandoffStatus) {
  if (status === 'Pending confirmation') return 'Confirm handoff'
  if (status === 'Confirmed') return 'Mark received'
  return null
}

export function handoffStatusCopy(handoff: HandoffRecord, requestQuantity: number) {
  const names = handoff.parts.map((part) => part.neighborName)
  const neighbor =
    names.length === 0
      ? 'a neighbor'
      : names.length === 1
        ? names[0]
        : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  const phrase = formatItemQuantity(handoff.quantity, handoff.item)
  const where = handoff.windowLabel
    ? `${handoff.pickupArea}, ${handoff.windowLabel}`
    : handoff.pickupArea

  if (handoff.status === 'Pending confirmation') {
    return `${phrase} arranged with ${neighbor}. Waiting on confirmation before pickup at ${where}.`
  }
  if (handoff.status === 'Confirmed') {
    const full = handoff.quantity >= requestQuantity
    return full
      ? `${phrase} ${handoff.quantity === 1 ? 'is' : 'are'} confirmed with ${neighbor}. Pickup is ${where}.`
      : `${handoff.quantity} of ${requestQuantity} ${handoff.item.toLowerCase()} ${
          handoff.quantity === 1 ? 'is' : 'are'
        } confirmed with ${neighbor}. Pickup is ${where}.`
  }
  return `${phrase} received from ${neighbor}. This handoff is finished.`
}

type CatalogItem = {
  key: string
  singular: string
  plural: string
  aliases: readonly string[]
}

const catalog: readonly CatalogItem[] = [
  {
    key: 'notebook',
    singular: 'Notebook',
    plural: 'Notebooks',
    aliases: ['composition books', 'composition book', 'notebooks', 'notebook'],
  },
  {
    key: 'ladder',
    singular: 'Ladder',
    plural: 'Ladders',
    aliases: ['step ladders', 'step ladder', 'ladders', 'ladder'],
  },
  {
    key: 'drill',
    singular: 'Drill',
    plural: 'Drills',
    aliases: ['drills', 'drill'],
  },
  {
    key: 'saw',
    singular: 'Saw',
    plural: 'Saws',
    aliases: ['circular saw', 'hand saw', 'saws', 'saw'],
  },
  {
    key: 'cooler',
    singular: 'Cooler',
    plural: 'Coolers',
    aliases: ['coolers', 'cooler'],
  },
  {
    key: 'folding table',
    singular: 'Folding table',
    plural: 'Folding tables',
    aliases: ['folding tables', 'folding table', 'banquet table'],
  },
]

const moreNeighbors = [
  {
    id: 'neighbor-maya',
    name: 'Maya Chen',
    initials: 'MC',
    street: '18 Oak Street',
  },
  {
    id: 'neighbor-luis',
    name: 'Luis Ortega',
    initials: 'LO',
    street: '3 Maple Row',
  },
] as const

export const exchangeNeighbors = [...demoNeighbors, ...moreNeighbors]

export type ExchangeNeighbor = (typeof exchangeNeighbors)[number]

export type CommunityPost = {
  id: string
  kind: ExchangeKind
  itemKey: string
  itemName: string
  quantity: number
  residentId: ExchangeNeighbor['id']
  distance: string
  location: string
  windowLabel: string
  available: boolean
  closedNote?: string
  note: string
}

export type CommunityMatch = CommunityPost & {
  resident: ExchangeNeighbor
}

export const communityPosts: readonly CommunityPost[] = [
  {
    id: 'offer-priya-notebooks',
    kind: 'offer',
    itemKey: 'notebook',
    itemName: 'Notebooks',
    quantity: 12,
    residentId: 'neighbor-priya',
    distance: 'About 80 yards',
    location: '22 Willow Court',
    windowLabel: 'Saturday, 10 am–12 pm',
    available: true,
    note: 'Unused composition books from last semester. I can leave the stack on the porch.',
  },
  {
    id: 'offer-jordan-notebooks',
    kind: 'offer',
    itemKey: 'notebook',
    itemName: 'Notebooks',
    quantity: 8,
    residentId: 'neighbor-jordan',
    distance: 'About 2 blocks',
    location: '8 Birch Lane',
    windowLabel: 'Saturday, 2–4 pm',
    available: true,
    note: 'Left over from a supply drive. Happy to meet at the curb.',
  },
  {
    id: 'offer-elena-notebooks',
    kind: 'offer',
    itemKey: 'notebook',
    itemName: 'Notebooks',
    quantity: 10,
    residentId: 'neighbor-elena',
    distance: 'About 3 blocks',
    location: '5 Cedar Path',
    windowLabel: 'Sunday, 1–3 pm',
    available: false,
    closedNote: 'Away until Monday',
    note: 'I have a stack, but I am out of town this weekend.',
  },
  {
    id: 'need-maya-notebooks',
    kind: 'need',
    itemKey: 'notebook',
    itemName: 'Notebooks',
    quantity: 12,
    residentId: 'neighbor-maya',
    distance: 'About 4 blocks',
    location: '18 Oak Street',
    windowLabel: 'Saturday morning',
    available: true,
    note: 'For the classroom supply bin. Porch drop-off is perfect.',
  },
  {
    id: 'need-luis-notebooks',
    kind: 'need',
    itemKey: 'notebook',
    itemName: 'Notebooks',
    quantity: 8,
    residentId: 'neighbor-luis',
    distance: 'About 5 blocks',
    location: '3 Maple Row',
    windowLabel: 'Saturday afternoon',
    available: true,
    note: 'Helping with the same school drive. I can pick them up.',
  },
  {
    id: 'offer-elena-ladder',
    kind: 'offer',
    itemKey: 'ladder',
    itemName: 'Ladder',
    quantity: 1,
    residentId: 'neighbor-elena',
    distance: 'About 3 blocks',
    location: '5 Cedar Path',
    windowLabel: 'Saturday, 9–11 am',
    available: true,
    note: 'Six-foot step ladder. A porch handoff is easiest.',
  },
  {
    id: 'need-jordan-ladder',
    kind: 'need',
    itemKey: 'ladder',
    itemName: 'Ladder',
    quantity: 1,
    residentId: 'neighbor-jordan',
    distance: 'About 2 blocks',
    location: '8 Birch Lane',
    windowLabel: 'Saturday',
    available: true,
    note: 'Changing a porch light. I can come by Saturday.',
  },
  {
    id: 'need-maya-cooler',
    kind: 'need',
    itemKey: 'cooler',
    itemName: 'Cooler',
    quantity: 1,
    residentId: 'neighbor-maya',
    distance: 'About 4 blocks',
    location: '18 Oak Street',
    windowLabel: 'Sunday, 1–3 pm',
    available: true,
    note: 'For a block picnic. Porch pickup works for me.',
  },
  {
    id: 'offer-luis-cooler',
    kind: 'offer',
    itemKey: 'cooler',
    itemName: 'Cooler',
    quantity: 1,
    residentId: 'neighbor-luis',
    distance: 'About 5 blocks',
    location: '3 Maple Row',
    windowLabel: 'Sunday afternoon',
    available: false,
    closedNote: 'Already promised this weekend',
    note: 'I have one, but it is spoken for until Monday.',
  },
]

export type QuantityAllocation = {
  listing: CommunityMatch
  quantity: number
}

export function knownItemIn(text: string) {
  const entries = catalog
    .flatMap((item) => item.aliases.map((alias) => ({ alias, item })))
    .sort((left, right) => right.alias.length - left.alias.length)

  return entries.find((entry) => new RegExp(`\\b${escapeRegex(entry.alias)}\\b`, 'i').test(text))?.item
}

export function itemKey(name: string) {
  const known = knownItemIn(name)
  if (known) return known.key
  return singularize(normalizePhrase(name))
}

export function itemLabel(name: string, quantity: number) {
  const known = knownItemIn(name)
  if (known) return quantity === 1 ? known.singular : known.plural

  const singular = titleCase(singularize(normalizePhrase(name)))
  if (!singular) return ''
  return quantity === 1 ? singular : pluralizeLabel(singular)
}

export function formatItemQuantity(quantity: number, item: string) {
  return `${quantity} ${itemLabel(item, quantity).toLowerCase()}`
}

export function sanitizeExchange(draft: ExchangeDraft): ExchangeDraft | null {
  const item = draft.item.trim().replace(/\s+/g, ' ')
  if (!item) return null

  const quantity = clampQuantity(draft.quantity)
  const pickupArea = draft.pickupArea.trim().replace(/\s+/g, ' ') || demoResident.street
  const windowLabel = draft.windowLabel.trim().replace(/\s+/g, ' ')

  return {
    kind: draft.kind,
    item,
    quantity,
    pickupArea,
    windowLabel,
  }
}

/** Needs look for offers. Offers look for needs. */
export function matchesForExchange(
  draft: ExchangeDraft,
  posts: readonly CommunityPost[] = communityPosts,
): CommunityMatch[] {
  const key = itemKey(draft.item)
  const opposite: ExchangeKind = draft.kind === 'need' ? 'offer' : 'need'

  return posts.flatMap((post) => {
    if (post.kind !== opposite || post.itemKey !== key) return []
    const resident = exchangeNeighbors.find((person) => person.id === post.residentId)
    if (!resident) return []
    return [{ ...post, resident }]
  })
}

/** Greedy fill in listing order. Twelve notebooks, then eight, covers twenty. */
export function suggestedSelection(quantity: number, listings: readonly CommunityMatch[]) {
  let remaining = quantity
  const ids: string[] = []

  for (const listing of listings) {
    if (!listing.available || remaining <= 0) continue
    ids.push(listing.id)
    remaining -= Math.min(listing.quantity, remaining)
  }

  return ids
}

export function allocateQuantity(
  quantity: number,
  listings: readonly CommunityMatch[],
  selectedIds: readonly string[],
): QuantityAllocation[] {
  let remaining = quantity
  const parts: QuantityAllocation[] = []

  for (const listing of listings) {
    if (!selectedIds.includes(listing.id) || !listing.available) continue
    const take = Math.min(listing.quantity, remaining)
    if (take <= 0) continue
    remaining -= take
    parts.push({ listing, quantity: take })
  }

  return parts
}

export function clampQuantity(value: number) {
  if (!Number.isFinite(value)) return 1
  return Math.max(1, Math.min(99, Math.round(value)))
}

function normalizePhrase(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function singularize(value: string) {
  const words = value.split(' ')
  const lastIndex = words.length - 1
  const last = words[lastIndex] ?? ''
  if (last.length <= 3 || !last.endsWith('s') || last.endsWith('ss')) return value
  words[lastIndex] = last.endsWith('es') ? last.slice(0, -2) : last.slice(0, -1)
  return words.join(' ')
}

function pluralizeLabel(singular: string) {
  const lower = singular.toLowerCase()
  if (lower.endsWith('s')) return singular
  return `${singular}s`
}

function titleCase(value: string) {
  return value.replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
