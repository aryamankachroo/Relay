import { demoResident } from './index.ts'
import { communityPosts } from './exchanges.ts'
import {
  demoNeighbors,
  isItemOnLoan,
  neighborListings,
  type LoanRequest,
  type LoanStatus,
  type NeighborListing,
} from './lending.ts'
import type { InventoryItem } from './bookshelfProject.ts'

export type SceneResidentId = string

export type SceneResident = {
  id: SceneResidentId
  name: string
  initials: string
  /** Fictional demo profile. Not a geocoded address and not the map pin. */
  street: string
  isYou: boolean
  /** Items this person will lend, used by map search when there is no loan listing. */
  offers?: readonly string[]
  /**
   * Placement on the real map backdrop. These points sit on a compact cluster
   * of residential blocks in Park Slope so the demo reads as one neighborhood.
   * They are not geocodes of the fictional street names.
   */
  longitude: number
  latitude: number
}

export type SceneItem = {
  id: string
  name: string
  detail: string
}

export type ShareLink = {
  id: string
  fromId: SceneResidentId
  toId: SceneResidentId
  itemName: string
  status: LoanStatus
  active: boolean
}

/**
 * Map backdrop for the fictional Willow Court residents.
 * Park Slope is a real place. The residents are not.
 */
export const demoMapBackdrop = {
  name: 'Park Slope, Brooklyn',
  minZoom: 14,
  maxZoom: 18,
} as const

/** Avery plus the three seeded lenders, placed a few blocks apart. */
export const sceneResidents: readonly SceneResident[] = [
  {
    id: 'resident-avery',
    name: demoResident.name,
    initials: demoResident.initials,
    street: demoResident.street,
    isYou: true,
    longitude: -73.980476,
    latitude: 40.667858,
  },
  {
    id: 'neighbor-priya',
    name: demoNeighbors[0].name,
    initials: demoNeighbors[0].initials,
    street: demoNeighbors[0].street,
    isYou: false,
    longitude: -73.982572,
    latitude: 40.668433,
  },
  {
    id: 'neighbor-jordan',
    name: demoNeighbors[1].name,
    initials: demoNeighbors[1].initials,
    street: demoNeighbors[1].street,
    isYou: false,
    longitude: -73.982544,
    latitude: 40.666716,
  },
  {
    id: 'neighbor-elena',
    name: demoNeighbors[2].name,
    initials: demoNeighbors[2].initials,
    street: demoNeighbors[2].street,
    isYou: false,
    longitude: -73.980326,
    latitude: 40.666533,
  },
  {
    id: 'neighbor-luis',
    name: 'Luis Alvarez',
    initials: 'LA',
    street: '11 Willow Court',
    isYou: false,
    offers: ['Garden hose', 'Soccer ball'],
    longitude: -73.9814,
    latitude: 40.6681,
  },
  {
    id: 'neighbor-nia',
    name: 'Nia Patel',
    initials: 'NP',
    street: '4 Oak Lane',
    isYou: false,
    offers: ['Folding table', 'Mixing bowl'],
    longitude: -73.9796,
    latitude: 40.6674,
  },
  {
    id: 'neighbor-owen',
    name: 'Owen Blake',
    initials: 'OB',
    street: '7 Willow Court',
    isYou: false,
    offers: ['Extension cord', 'Hedge trimmer'],
    longitude: -73.9831,
    latitude: 40.6672,
  },
]

export function sceneResidentById(id: string) {
  return sceneResidents.find((resident) => resident.id === id)
}

export function blockPin(x: number, y: number) {
  return {
    longitude: -73.980476 + x * 0.00045,
    latitude: 40.667858 + y * 0.00035,
  }
}

/** Room for the city-scale block grid, projected onto the same map origin. */
export function listingMapBounds(): [[number, number], [number, number]] {
  const westPin = blockPin(-500, 0)
  const eastPin = blockPin(500, 0)
  const southPin = blockPin(0, -500)
  const northPin = blockPin(0, 500)
  return [
    [westPin.longitude - 0.02, southPin.latitude - 0.02],
    [eastPin.longitude + 0.02, northPin.latitude + 0.02],
  ]
}

export function residentsFromListings(
  you: { id: string; name: string; initials: string; street: string },
  items: readonly { resident_id: string; resident_name: string; x?: number; y?: number; catalog_item: string; catalog_name?: string; willing_to_lend?: boolean }[],
): SceneResident[] {
  const people = new Map<string, SceneResident>()
  people.set(you.id, {
    id: you.id,
    name: you.name,
    initials: you.initials,
    street: you.street,
    isYou: true,
    offers: [],
    ...blockPin(0, 0),
  })
  for (const item of items) {
    if (item.willing_to_lend === false) continue
    const name = item.catalog_name || item.catalog_item
    const pin = blockPin(Number(item.x) || 0, Number(item.y) || 0)
    const existing = people.get(item.resident_id)
    if (!existing) {
      const words = item.resident_name.split(/\s+/).filter(Boolean)
      const initials = words.length > 1 ? `${words[0][0]}${words[words.length - 1][0]}` : (words[0]?.slice(0, 2) ?? '')
      people.set(item.resident_id, {
        id: item.resident_id,
        name: item.resident_name,
        initials: initials.toUpperCase(),
        street: '',
        isYou: item.resident_id === you.id,
        offers: name ? [name] : [],
        ...pin,
      })
      continue
    }
    if (name && !existing.offers?.includes(name)) {
      people.set(item.resident_id, { ...existing, offers: [...(existing.offers ?? []), name] })
    }
  }
  return [...people.values()]
}

export function shareLinksBetween(loans: readonly LoanRequest[], youId: string): ShareLink[] {
  return loans.flatMap((loan) => {
    if (loan.status === 'Returned') return []
    const fromId = loan.borrowerId && loan.borrowerId !== 'resident-avery' ? loan.borrowerId : youId
    const toId = loan.lenderId === 'resident-avery' ? youId : loan.lenderId
    if (!fromId || !toId || fromId === toId) return []
    return [
      {
        id: loan.id,
        fromId,
        toId,
        itemName: loan.itemName,
        status: loan.status,
        active: loan.status !== 'Requested',
      },
    ]
  })
}

/** Bounds that frame every demo pin. */
export function demoResidentBounds(): [[number, number], [number, number]] {
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  for (const resident of sceneResidents) {
    west = Math.min(west, resident.longitude)
    east = Math.max(east, resident.longitude)
    south = Math.min(south, resident.latitude)
    north = Math.max(north, resident.latitude)
  }
  return [
    [west, south],
    [east, north],
  ]
}

/** A little of the surrounding neighborhood, still short of a city-wide wander. */
export function demoExploreBounds(): [[number, number], [number, number]] {
  const [[west, south], [east, north]] = demoResidentBounds()
  return [
    [west - 0.012, south - 0.008],
    [east + 0.012, north + 0.008],
  ]
}

function sceneIdForResident(id: string): SceneResidentId | null {
  if (sceneResidents.some((resident) => resident.id === id)) {
    return id as SceneResidentId
  }
  return null
}

/**
 * Active and requested loans draw a path between Avery and the other party.
 * Avery may be borrower or lender. Returned loans drop off.
 */
export function shareLinksFromLoans(loans: readonly LoanRequest[]): ShareLink[] {
  return loans.flatMap((loan) => {
    if (loan.status === 'Returned') return []

    const lenderId = sceneIdForResident(loan.lenderId)
    if (!lenderId) return []

    if (lenderId === 'resident-avery') {
      const borrowerId = loan.borrowerId ? sceneIdForResident(loan.borrowerId) : null
      if (!borrowerId || borrowerId === 'resident-avery') return []
      return [
        {
          id: loan.id,
          fromId: 'resident-avery',
          toId: borrowerId,
          itemName: loan.itemName,
          status: loan.status,
          active: loan.status !== 'Requested',
        },
      ]
    }

    return [
      {
        id: loan.id,
        fromId: 'resident-avery',
        toId: lenderId,
        itemName: loan.itemName,
        status: loan.status,
        active: loan.status !== 'Requested',
      },
    ]
  })
}

export function linksForResident(residentId: string, links: readonly ShareLink[]) {
  return links.filter((link) => link.fromId === residentId || link.toId === residentId)
}

function pickupAvailability(listing: NeighborListing) {
  const open = listing.pickupWindows.filter((window) => window.available)
  if (open.length === 0) {
    return listing.pickupWindows.find((window) => window.closedNote)?.closedNote ?? 'No open pickup'
  }
  if (open.length === 1) return open[0]?.label ?? 'Open'
  return `${open[0]?.label ?? 'Open'} · ${open.length - 1} more open`
}

function lentItemNames(residentId: SceneResidentId, loans: readonly LoanRequest[]) {
  const names = new Set<string>()
  for (const loan of loans) {
    if (loan.lenderId !== residentId || !isItemOnLoan(loan.status)) continue
    names.add(loan.itemName.trim().toLowerCase())
  }
  return names
}

export function itemsForResident(
  residentId: SceneResidentId,
  inventory: readonly InventoryItem[],
  loans: readonly LoanRequest[] = [],
): SceneItem[] {
  const committed = lentItemNames(residentId, loans)

  if (residentId === 'resident-avery') {
    const lentIds = new Set(
      loans.flatMap((loan) =>
        loan.lenderId === residentId && loan.inventoryItemId && isItemOnLoan(loan.status)
          ? [loan.inventoryItemId]
          : [],
      ),
    )
    return inventory
      .filter((item) => item.availableToLend && !lentIds.has(item.id) && !committed.has(item.name.trim().toLowerCase()))
      .map((item) => ({
        id: item.id,
        name: item.name,
        detail: item.quantity > 1 ? `${item.quantity} · ${item.condition} · Ready to lend` : `${item.condition} · Ready to lend`,
      }))
  }

  const listings = neighborListings
    .filter((listing) => listing.residentId === residentId && !committed.has(listing.itemName.trim().toLowerCase()))
    .map((listing) => ({
      id: listing.id,
      name: listing.itemName,
      detail: `${listing.condition} · ${pickupAvailability(listing)}`,
    }))

  const offers = communityPosts
    .filter(
      (post) =>
        post.residentId === residentId &&
        post.kind === 'offer' &&
        post.available &&
        !committed.has(post.itemName.trim().toLowerCase()),
    )
    .map((post) => ({
      id: post.id,
      name: post.quantity > 1 ? `${post.quantity} ${post.itemName.toLowerCase()}` : post.itemName,
      detail: post.windowLabel,
    }))

  const merged = [...listings, ...offers]
  const seen = new Set<string>()
  return merged.filter((item) => {
    const key = item.name.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
