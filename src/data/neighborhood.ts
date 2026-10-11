import { demoResident } from './index.ts'
import { communityPosts } from './exchanges.ts'
import {
  demoNeighbors,
  neighborListings,
  type LoanRequest,
  type LoanStatus,
} from './lending.ts'
import type { InventoryItem } from './bookshelfProject.ts'

export type SceneResidentId = 'resident-avery' | (typeof demoNeighbors)[number]['id']

export type SceneResident = {
  id: SceneResidentId
  name: string
  initials: string
  street: string
  isYou: boolean
  /** House anchor in the 800×480 scene viewBox. */
  x: number
  y: number
  roof: string
  wall: string
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

/** Avery plus the three seeded lenders — the demo block on Willow Court. */
export const sceneResidents: readonly SceneResident[] = [
  {
    id: 'resident-avery',
    name: demoResident.name,
    initials: demoResident.initials,
    street: demoResident.street,
    isYou: true,
    x: 318,
    y: 292,
    roof: '#2ecfbf',
    wall: '#f4fcff',
  },
  {
    id: 'neighbor-priya',
    name: demoNeighbors[0].name,
    initials: demoNeighbors[0].initials,
    street: demoNeighbors[0].street,
    isYou: false,
    x: 128,
    y: 248,
    roof: '#3eb6ef',
    wall: '#e5f6ff',
  },
  {
    id: 'neighbor-jordan',
    name: demoNeighbors[1].name,
    initials: demoNeighbors[1].initials,
    street: demoNeighbors[1].street,
    isYou: false,
    x: 538,
    y: 238,
    roof: '#3cbf64',
    wall: '#f4fcff',
  },
  {
    id: 'neighbor-elena',
    name: demoNeighbors[2].name,
    initials: demoNeighbors[2].initials,
    street: demoNeighbors[2].street,
    isYou: false,
    x: 668,
    y: 318,
    roof: '#0c749f',
    wall: '#c9fff8',
  },
]

export function sceneResidentById(id: string) {
  return sceneResidents.find((resident) => resident.id === id)
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
          fromId: 'resident-avery' as const,
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
        fromId: 'resident-avery' as const,
        toId: lenderId,
        itemName: loan.itemName,
        status: loan.status,
        active: loan.status !== 'Requested',
      },
    ]
  })
}

export function itemsForResident(
  residentId: SceneResidentId,
  inventory: readonly InventoryItem[],
): SceneItem[] {
  if (residentId === 'resident-avery') {
    return inventory
      .filter((item) => item.availableToLend)
      .slice(0, 4)
      .map((item) => ({
        id: item.id,
        name: item.name,
        detail: item.condition,
      }))
  }

  const listings = neighborListings
    .filter((listing) => listing.residentId === residentId)
    .map((listing) => ({
      id: listing.id,
      name: listing.itemName,
      detail: listing.condition,
    }))

  const offers = communityPosts
    .filter((post) => post.residentId === residentId && post.kind === 'offer' && post.available)
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
