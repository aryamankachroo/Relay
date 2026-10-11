import {
  bookshelfProject,
  normalizeToolName,
  ownedInventoryNames,
  seededInventory,
  type InventoryItem,
} from './bookshelfProject.ts'

/**
 * Mock neighbors and the tools they will lend.
 * Listings name tools from the bookshelf list, and only tools Avery does not already own.
 * Pickup and return windows are written out here. Nothing computes a schedule.
 */

export const demoNeighbors = [
  {
    id: 'neighbor-priya',
    name: 'Priya Shah',
    initials: 'PS',
    street: '22 Willow Court',
  },
  {
    id: 'neighbor-jordan',
    name: 'Jordan Hale',
    initials: 'JH',
    street: '8 Birch Lane',
  },
  {
    id: 'neighbor-elena',
    name: 'Elena Voss',
    initials: 'EV',
    street: '5 Cedar Path',
  },
] as const

export type DemoNeighbor = (typeof demoNeighbors)[number]
export type NeighborId = DemoNeighbor['id']
export type LendableToolName = (typeof bookshelfProject.tools)[number]['name']
export type ToolCondition = 'Excellent' | 'Good' | 'Fair'
export type ToolPortraitId = 'circular-saw' | 'hand-saw' | 'orbital-sander' | 'cordless-drill'

export type ReturnWindow = {
  id: string
  label: string
  available: boolean
  closedNote?: string
}

export type PickupWindow = {
  id: string
  label: string
  available: boolean
  closedNote?: string
  /** Return windows this neighbor will accept after this pickup. */
  returnWindowIds: readonly string[]
}

export type NeighborListing = {
  id: string
  toolName: LendableToolName
  itemName: string
  portrait: ToolPortraitId
  residentId: NeighborId
  distance: string
  condition: ToolCondition
  notes: string
  pickupWindows: readonly PickupWindow[]
  returnWindows: readonly ReturnWindow[]
}

export type NeighborMatch = NeighborListing & {
  resident: DemoNeighbor
}

export type LoanStatus = 'Requested' | 'Confirmed' | 'Picked up' | 'Returned'

export const loanStatusSteps = ['Requested', 'Confirmed', 'Picked up', 'Returned'] as const

export const residentLenderId = 'resident-avery'

export type LoanRequest = {
  id: string
  listingId: string
  toolName: string
  itemName: string
  lenderId: string
  lenderName: string
  lenderInitials: string
  portrait?: ToolPortraitId
  pickupWindowId: string
  pickupLabel: string
  returnWindowId: string
  returnLabel: string
  status: LoanStatus
  /** Set when Avery is lending from My Inventory. */
  inventoryItemId?: string
  borrowerId?: string
  borrowerName?: string
  borrowerInitials?: string
}

/** Avery is lending this item out (incoming request or active outbound loan). */
export function isResidentLending(request: LoanRequest) {
  return request.lenderId === residentLenderId
}

/** Item is committed or already with the borrower — show as on loan in inventory. */
export function isItemOnLoan(status: LoanStatus) {
  return status === 'Confirmed' || status === 'Picked up'
}

export function nextLoanStatus(status: LoanStatus): LoanStatus | null {
  const index = loanStatusSteps.indexOf(status)
  if (index < 0 || index >= loanStatusSteps.length - 1) return null
  return loanStatusSteps[index + 1] ?? null
}

export function canAdvanceLoan(from: LoanStatus, to: LoanStatus) {
  return nextLoanStatus(from) === to
}

export function isLoanComplete(status: LoanStatus) {
  return status === 'Returned'
}

export function loanActionLabel(request: LoanRequest) {
  if (request.status === 'Requested') {
    return isResidentLending(request)
      ? 'Accept request'
      : `Accept as ${givenName(request.lenderName)}`
  }
  if (request.status === 'Confirmed') return 'Mark picked up'
  if (request.status === 'Picked up') return 'Mark returned'
  return null
}

export function loanStatusCopy(request: LoanRequest) {
  const tool = request.itemName.toLowerCase()

  if (isResidentLending(request)) {
    const borrower = request.borrowerName ?? 'a neighbor'
    if (request.status === 'Requested') {
      return `${borrower} asked to borrow your ${tool}. Pickup ${request.pickupLabel}; back by ${request.returnLabel}.`
    }
    if (request.status === 'Confirmed') {
      return `You accepted. ${givenName(borrower)} picks up ${request.pickupLabel}; back by ${request.returnLabel}.`
    }
    if (request.status === 'Picked up') {
      return `${givenName(borrower)} has your ${tool}. Expect it back by ${request.returnLabel}.`
    }
    return `${givenName(borrower)} returned your ${tool}. This loan is finished.`
  }

  const who = request.lenderName
  if (request.status === 'Requested') {
    return `Asked ${who} for the ${tool}. Waiting on confirmation before pickup at ${request.pickupLabel}.`
  }
  if (request.status === 'Confirmed') {
    return `${who} confirmed the ${tool}. Pickup is ${request.pickupLabel}; back by ${request.returnLabel}.`
  }
  if (request.status === 'Picked up') {
    return `You have the ${tool}. Return it to ${who} by ${request.returnLabel}.`
  }
  return `Returned the ${tool} to ${who}. This loan is finished.`
}

/** Active outbound loan for a shelf item (confirmed or picked up). */
export function outboundLoanForItem(
  loans: readonly LoanRequest[],
  inventoryItemId: string,
): LoanRequest | null {
  return (
    loans.find(
      (loan) =>
        loan.inventoryItemId === inventoryItemId &&
        isResidentLending(loan) &&
        isItemOnLoan(loan.status),
    ) ?? null
  )
}

/** Pending borrow request aimed at a shelf item. */
export function pendingLoanForItem(
  loans: readonly LoanRequest[],
  inventoryItemId: string,
): LoanRequest | null {
  return (
    loans.find(
      (loan) =>
        loan.inventoryItemId === inventoryItemId &&
        isResidentLending(loan) &&
        loan.status === 'Requested',
    ) ?? null
  )
}

export function incomingLoanRequests(loans: readonly LoanRequest[]) {
  return loans.filter((loan) => isResidentLending(loan) && !isLoanComplete(loan.status))
}

export const neighborListings: readonly NeighborListing[] = [
  {
    id: 'listing-priya-saw',
    toolName: 'Saw',
    itemName: 'Circular saw',
    portrait: 'circular-saw',
    residentId: 'neighbor-priya',
    distance: 'About 80 yards',
    condition: 'Excellent',
    notes: 'The blade is new, and the case comes with it. Fine for a weekend of cuts.',
    pickupWindows: [
      {
        id: 'priya-pick-sat-9',
        label: 'Saturday, 9–11 am',
        available: true,
        returnWindowIds: [
          'priya-back-sat-6',
          'priya-back-sun-11',
          'priya-back-sun-5',
          'priya-back-mon-8',
        ],
      },
      {
        id: 'priya-pick-sat-2',
        label: 'Saturday, 2–4 pm',
        available: true,
        returnWindowIds: ['priya-back-sun-5', 'priya-back-mon-8'],
      },
      {
        id: 'priya-pick-sun-10',
        label: 'Sunday, 10 am–12 pm',
        available: false,
        closedNote: 'At the farmers market',
        returnWindowIds: ['priya-back-sun-5', 'priya-back-mon-8'],
      },
    ],
    returnWindows: [
      { id: 'priya-back-sat-6', label: 'Saturday by 6 pm', available: true },
      {
        id: 'priya-back-sun-11',
        label: 'Sunday by 11 am',
        available: false,
        closedNote: 'Away that morning',
      },
      { id: 'priya-back-sun-5', label: 'Sunday by 5 pm', available: true },
      { id: 'priya-back-mon-8', label: 'Monday by 8 am', available: true },
    ],
  },
  {
    id: 'listing-jordan-saw',
    toolName: 'Saw',
    itemName: 'Hand saw',
    portrait: 'hand-saw',
    residentId: 'neighbor-jordan',
    distance: 'About 2 blocks',
    condition: 'Good',
    notes: 'The handle is worn smooth. It still tracks straight, and I can leave it on the porch.',
    pickupWindows: [
      {
        id: 'jordan-pick-sat-11',
        label: 'Saturday, 11 am–1 pm',
        available: true,
        returnWindowIds: ['jordan-back-sat-8', 'jordan-back-sun-4'],
      },
      {
        id: 'jordan-pick-sat-5',
        label: 'Saturday, 5–7 pm',
        available: false,
        closedNote: "Dinner at my sister's",
        returnWindowIds: ['jordan-back-sun-4'],
      },
      {
        id: 'jordan-pick-sun-9',
        label: 'Sunday, 9–11 am',
        available: true,
        returnWindowIds: ['jordan-back-sun-4', 'jordan-back-mon-12'],
      },
    ],
    returnWindows: [
      { id: 'jordan-back-sat-8', label: 'Saturday by 8 pm', available: true },
      { id: 'jordan-back-sun-4', label: 'Sunday by 4 pm', available: true },
      {
        id: 'jordan-back-mon-12',
        label: 'Monday by noon',
        available: false,
        closedNote: 'Leaving for a work trip',
      },
    ],
  },
  {
    id: 'listing-elena-sander',
    toolName: 'Sander',
    itemName: 'Orbital sander',
    portrait: 'orbital-sander',
    residentId: 'neighbor-elena',
    distance: 'About 3 blocks',
    condition: 'Good',
    notes: 'Half the sanding sheets are left. Please coil the cord when you bring it back.',
    pickupWindows: [
      {
        id: 'elena-pick-sat-10',
        label: 'Saturday, 10 am–12 pm',
        available: true,
        returnWindowIds: ['elena-back-sat-7', 'elena-back-sun-6', 'elena-back-mon-9'],
      },
      {
        id: 'elena-pick-sat-4',
        label: 'Saturday, 4–6 pm',
        available: false,
        closedNote: 'Out that afternoon',
        returnWindowIds: ['elena-back-sun-6', 'elena-back-mon-9'],
      },
      {
        id: 'elena-pick-sun-1',
        label: 'Sunday, 1–3 pm',
        available: true,
        returnWindowIds: ['elena-back-sun-6', 'elena-back-mon-9'],
      },
    ],
    returnWindows: [
      { id: 'elena-back-sat-7', label: 'Saturday by 7 pm', available: true },
      { id: 'elena-back-sun-6', label: 'Sunday by 6 pm', available: true },
      { id: 'elena-back-mon-9', label: 'Monday by 9 am', available: true },
    ],
  },
]

export function givenName(name: string) {
  return name.split(' ')[0] ?? name
}

export function isPickupSelectable(window: PickupWindow | undefined) {
  return Boolean(window?.available)
}

/** A return can be chosen only when this pickup lists it and the window itself is open. */
export function isReturnSelectable(pickup: PickupWindow | undefined, due: ReturnWindow | undefined) {
  if (!pickup?.available || !due?.available) return false
  return pickup.returnWindowIds.includes(due.id)
}

/** Skip tools the resident already owns. Pass live inventory so My Inventory edits reshape matches. */
export function matchesForTool(
  toolName: string,
  inventory: readonly InventoryItem[] = seededInventory,
): NeighborMatch[] {
  const key = normalizeToolName(toolName)
  if (ownedInventoryNames(inventory).has(key)) return []

  return neighborListings.flatMap((listing) => {
    if (normalizeToolName(listing.toolName) !== key) return []
    const resident = demoNeighbors.find((person) => person.id === listing.residentId)
    if (!resident) return []
    return [{ ...listing, resident }]
  })
}
