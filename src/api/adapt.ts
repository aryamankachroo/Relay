import type { ChecklistTool } from '../data/bookshelfProject.ts'
import {
  itemLabel,
  type ExchangeDraft,
  type ExchangeRequest,
  type HandoffPart,
  type HandoffRecord,
  type HandoffStatus,
} from '../data/exchanges.ts'
import { demoResident } from '../data/index.ts'
import {
  residentLenderId,
  type LoanRequest,
  type LoanStatus,
  type NeighborMatch,
  type PickupWindow,
  type ReturnWindow,
  type ToolCondition,
  type ToolPortraitId,
} from '../data/lending.ts'
import type {
  ApiActivity,
  ApiCatalogItem,
  ApiConfirmationCard,
  ApiHandoff,
  ApiLoan,
  ApiNeighbor,
  ApiProjectTool,
  ApiRequest,
  ApiResident,
  ApiWindow,
} from './types.ts'

/** Residents and catalog names, so ids from the API can be shown as people and things. */
export type Directory = {
  residents: ReadonlyMap<string, ApiResident>
  catalog: ReadonlyMap<string, ApiCatalogItem>
}

export type ProjectTool = ChecklistTool & {
  catalogItemId: string
  inCatalog: boolean
  haveAlready: boolean
  neighbors: readonly ApiNeighbor[]
}

/** The backend and the Snowflake seed write demo wall-clock times ("Saturday 9 am") as UTC. */
const demoTimeZone = 'UTC'
const hour = 60 * 60 * 1000
const pickupLength = 2 * hour
const day = 24 * hour

export function createDirectory(residents: ApiResident[], catalog: ApiCatalogItem[]): Directory {
  return {
    residents: new Map(residents.map((row) => [row.id, row])),
    catalog: new Map(catalog.map((row) => [row.id, row])),
  }
}

export function portraitFor(catalogItemId: string, label = ''): ToolPortraitId | undefined {
  const text = label.toLowerCase()
  if (catalogItemId === 'saw') return text.includes('circular') ? 'circular-saw' : 'hand-saw'
  if (catalogItemId === 'sander') return 'orbital-sander'
  if (catalogItemId === 'drill') return 'cordless-drill'
  return undefined
}

export function distanceLabel(distance: number) {
  const blocks = Math.round(distance)
  if (blocks <= 1) return 'Next door'
  return `About ${blocks} blocks`
}

export function formatWindow(window: ApiWindow | null | undefined) {
  const start = parseTime(window?.start)
  const end = parseTime(window?.end)
  if (!start) return ''
  if (!end) return formatMoment(start)
  return formatSlot(start, end)
}

export function projectTools(
  tools: readonly ApiProjectTool[],
  previous: readonly ProjectTool[] = [],
): ProjectTool[] {
  return tools.map((tool) => ({
    id: tool.id,
    name: tool.name,
    required: !tool.optional,
    selected: previous.find((item) => item.id === tool.id)?.selected ?? true,
    catalogItemId: tool.catalog_item_id ?? '',
    inCatalog: tool.catalog_item_id !== null,
    haveAlready: tool.have_already,
    neighbors: tool.neighbors,
  }))
}

export function neighborMatch(
  tool: ProjectTool,
  neighbor: ApiNeighbor,
  projectWindow: ApiWindow | null,
  directory: Directory | null,
): NeighborMatch {
  const resident = directory?.residents.get(neighbor.resident_id)
  const name = resident?.name ?? neighbor.resident_name
  return {
    id: listingId(neighbor.inventory_id, neighbor.resident_id, tool.catalogItemId),
    toolName: tool.name,
    itemName: tool.name,
    portrait: portraitFor(tool.catalogItemId, neighbor.condition_note),
    residentId: neighbor.resident_id,
    catalogItemId: tool.catalogItemId,
    distance: distanceLabel(neighbor.distance),
    condition: conditionFrom(neighbor.condition_note),
    notes:
      neighbor.condition_note ||
      `${neighbor.quantity === 1 ? 'One' : neighbor.quantity} listed to lend.`,
    ...lendingWindows(neighbor, projectWindow),
    resident: {
      id: neighbor.resident_id,
      name,
      initials: resident?.initials ?? initialsOf(name),
      street: resident?.street ?? '',
    },
  }
}

const loanStatuses: Record<ApiLoan['status'], LoanStatus | null> = {
  requested: 'Requested',
  confirmed: 'Confirmed',
  picked_up: 'Picked up',
  returned: 'Returned',
  declined: null,
}

export function loanFromApi(loan: ApiLoan, directory: Directory, viewerId: string): LoanRequest | null {
  const status = loanStatuses[loan.status]
  if (!status) return null
  const name = directory.catalog.get(loan.catalog_item_id)?.name ?? loan.catalog_item_id
  const averyLends = loan.lender_id === viewerId
  const lender = directory.residents.get(loan.lender_id)
  const borrower = directory.residents.get(loan.borrower_id)
  const start = parseTime(loan.window.start)
  const end = parseTime(loan.window.end)

  return {
    id: loan.loan_id,
    listingId: listingId(loan.inventory_id, loan.lender_id, loan.catalog_item_id),
    toolName: name,
    itemName: name,
    lenderId: averyLends ? residentLenderId : loan.lender_id,
    lenderName: averyLends ? demoResident.name : (lender?.name ?? loan.lender_id),
    lenderInitials: averyLends ? demoResident.initials : (lender?.initials ?? initialsOf(loan.lender_id)),
    portrait: portraitFor(loan.catalog_item_id),
    pickupWindowId: `${loan.loan_id}-pickup`,
    pickupLabel: start ? formatMoment(start) : 'a time to agree on',
    returnWindowId: `${loan.loan_id}-return`,
    returnLabel: end ? formatMoment(end) : 'the agreed time',
    status,
    ...(averyLends
      ? {
          borrowerId: loan.borrower_id,
          borrowerName: borrower?.name ?? loan.borrower_id,
          borrowerInitials: borrower?.initials ?? initialsOf(loan.borrower_id),
        }
      : {}),
  }
}

const handoffStatuses: Record<ApiHandoff['status'], HandoffStatus | null> = {
  proposed: 'Pending confirmation',
  confirmed: 'Confirmed',
  received: 'Received',
  declined: null,
}

const hiddenRequestStatuses = new Set(['pending_confirm', 'declined'])

/** Avery's published needs and offers, with how much of each is already arranged. */
export function exchangeRequestsFromApi(
  activity: ApiActivity,
  directory: Directory,
  viewerId: string,
): ExchangeRequest[] {
  const live = activity.handoffs.filter((handoff) => handoff.status !== 'declined')
  return activity.requests.flatMap((request) => {
    if (request.resident_id !== viewerId) return []
    if (request.kind !== 'need' && request.kind !== 'offer') return []
    if (hiddenRequestStatuses.has(request.status)) return []
    const arranged =
      request.kind === 'need'
        ? live
            .filter((handoff) => handoff.need_request_id === request.id)
            .flatMap((handoff) => handoff.allocations)
        : live
            .flatMap((handoff) => handoff.allocations)
            .filter((row) => row.offer_request_id === request.id)
    const quantity = Math.max(request.quantity, 1)
    const fulfilled = Math.min(
      quantity,
      arranged.reduce((sum, row) => sum + row.quantity, 0),
    )
    return [
      {
        id: request.id,
        kind: request.kind,
        item: itemLabel(catalogName(directory, request.catalog_item_id), quantity),
        quantity,
        pickupArea: request.area || demoResident.street,
        windowLabel: formatWindow(request.window),
        status: fulfilled >= quantity ? 'Matched' : 'Open',
        fulfilled,
      },
    ]
  })
}

/** Handoffs Avery is part of, as recipient (a need) or donor (an offer). */
export function handoffsFromApi(
  activity: ApiActivity,
  directory: Directory,
  viewerId: string,
): HandoffRecord[] {
  const requests = new Map(activity.requests.map((row) => [row.id, row]))
  return activity.handoffs.flatMap((handoff): HandoffRecord[] => {
    const status = handoffStatuses[handoff.status]
    if (!status) return []
    const need = requests.get(handoff.need_request_id)
    const item = catalogName(directory, need?.catalog_item_id ?? '')
    const recipient = directory.residents.get(handoff.recipient_id)

    if (handoff.recipient_id === viewerId) {
      const parts = handoff.allocations.map((row) =>
        handoffPart(
          row.offer_request_id,
          row.resident_id,
          row.quantity,
          requests.get(row.offer_request_id),
          need,
          directory,
          viewerId,
        ),
      )
      const quantity = parts.reduce((sum, part) => sum + part.quantity, 0)
      return [
        {
          id: handoff.id,
          requestId: handoff.need_request_id,
          kind: 'need' as const,
          item: itemLabel(item, quantity),
          quantity,
          pickupArea: need?.area || demoResident.street,
          windowLabel: formatWindow(need?.window),
          parts,
          status,
        },
      ]
    }

    const mine = handoff.allocations.find((row) => row.resident_id === viewerId)
    if (!mine) return []
    return [
      {
        id: handoff.id,
        requestId: mine.offer_request_id,
        kind: 'offer' as const,
        item: itemLabel(item, mine.quantity),
        quantity: mine.quantity,
        pickupArea: need?.area || recipient?.street || demoResident.street,
        windowLabel: formatWindow(need?.window),
        parts: [
          handoffPart(handoff.need_request_id, handoff.recipient_id, mine.quantity, need, need, directory, viewerId),
        ],
        status,
      },
    ]
  })
}

export function draftFromConfirmation(card: ApiConfirmationCard): ExchangeDraft {
  return {
    kind: card.kind,
    item: itemLabel(card.item.name, card.quantity),
    quantity: card.quantity,
    pickupArea: card.area || demoResident.street,
    windowLabel: formatWindow(card.window),
  }
}

export function formatSlotIso(start: string, end: string) {
  const from = parseTime(start)
  const to = parseTime(end)
  if (!from || !to) return ''
  return formatSlot(from, to)
}

function handoffPart(
  listing: string,
  neighborId: string,
  quantity: number,
  post: ApiRequest | undefined,
  need: ApiRequest | undefined,
  directory: Directory,
  viewerId: string,
): HandoffPart {
  const neighbor = directory.residents.get(neighborId)
  const avery = directory.residents.get(viewerId)
  const distance =
    neighbor && avery ? Math.abs(neighbor.x - avery.x) + Math.abs(neighbor.y - avery.y) : 0
  return {
    listingId: listing,
    neighborName: neighbor?.name ?? neighborId,
    initials: neighbor?.initials ?? initialsOf(neighborId),
    quantity,
    location: post?.area || neighbor?.street || '',
    distance: distanceLabel(distance),
    windowLabel: formatWindow(post?.window ?? need?.window) || 'Time to agree on',
  }
}

/** Two-hour pickups inside the lender's windows and the project window, each due back a day later. */
function lendingWindows(
  neighbor: ApiNeighbor,
  projectWindow: ApiWindow | null,
): { pickupWindows: PickupWindow[]; returnWindows: ReturnWindow[] } {
  const project = spanOf(projectWindow?.start, projectWindow?.end)
  const listed = neighbor.windows.flatMap((window) => {
    const span = Array.isArray(window) ? spanOf(window[0], window[1]) : spanOf(window.start, window.end)
    return span ? [span] : []
  })
  const ranges = (listed.length > 0 ? listed : [project ?? tomorrow()]).flatMap((range) => {
    if (!project) return [range]
    const start = Math.max(range.start, project.start)
    const end = Math.min(range.end, project.end)
    return end > start ? [{ start, end }] : []
  })

  const pickupWindows: PickupWindow[] = []
  const returnWindows: ReturnWindow[] = []
  for (const range of ranges) {
    let cursor = Math.ceil(range.start / hour) * hour
    let taken = 0
    while (taken < 2 && pickupWindows.length < 4 && cursor < range.end) {
      const end = Math.min(cursor + pickupLength, range.end)
      const id = `${neighbor.resident_id}-${cursor}`
      const due = end + day
      pickupWindows.push({
        id,
        label: formatSlot(new Date(cursor), new Date(end)),
        available: true,
        returnWindowIds: [`${id}-back`],
        start: new Date(cursor).toISOString(),
        end: new Date(end).toISOString(),
      })
      returnWindows.push({
        id: `${id}-back`,
        label: `${weekday(new Date(due))} by ${clock(new Date(due))}`,
        available: true,
        end: new Date(due).toISOString(),
      })
      taken += 1
      cursor += 3 * hour
    }
  }
  return { pickupWindows, returnWindows }
}

function tomorrow() {
  const start = new Date()
  start.setUTCDate(start.getUTCDate() + 1)
  start.setUTCHours(10, 0, 0, 0)
  return { start: start.getTime(), end: start.getTime() + 8 * hour }
}

function spanOf(start: string | null | undefined, end: string | null | undefined) {
  const from = parseTime(start)
  const to = parseTime(end)
  if (!from || !to || to <= from) return null
  return { start: from.getTime(), end: to.getTime() }
}

function parseTime(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatSlot(start: Date, end: Date) {
  if (start.toISOString().slice(0, 10) === end.toISOString().slice(0, 10)) {
    return `${weekday(start)}, ${clock(start)}–${clock(end)}`
  }
  return `${formatMoment(start)} – ${formatMoment(end)}`
}

function formatMoment(date: Date) {
  return `${weekday(date)}, ${clock(date)}`
}

function weekday(date: Date) {
  return date.toLocaleDateString(undefined, { weekday: 'long', timeZone: demoTimeZone })
}

function clock(date: Date) {
  return date
    .toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: demoTimeZone })
    .replace(':00', '')
    .toLowerCase()
}

function conditionFrom(note: string): ToolCondition {
  const text = note.toLowerCase()
  if (/\b(excellent|like new|brand new|new)\b/.test(text)) return 'Excellent'
  if (/\b(worn|fair|old|scuffed)\b/.test(text)) return 'Fair'
  return 'Good'
}

function listingId(inventoryId: string | null | undefined, lenderId: string, catalogItemId: string) {
  return inventoryId || `${lenderId}:${catalogItemId}`
}

function catalogName(directory: Directory, id: string) {
  return directory.catalog.get(id)?.name ?? id
}

function initialsOf(name: string) {
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0]![0]}${parts.at(-1)![0]}`.toUpperCase()
  return name.slice(0, 2).toUpperCase()
}
