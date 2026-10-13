/** How much of a need or offer is delivered, reserved, or still open. */

export type CoverageStatus = 'Open' | 'Matched'

export type AllocationSlice = {
  status: string
  quantity: number
  needId: string
  offerId: string
}

export type Coverage = {
  delivered: number
  reserved: number
  outstanding: number
  fulfilled: number
  status: CoverageStatus
}

const reservedStatuses = new Set(['proposed', 'confirmed'])

export function coverageFor(
  kind: 'need' | 'offer',
  requestId: string,
  quantity: number,
  allocations: readonly AllocationSlice[],
): Coverage {
  const mine = allocations.filter((row) =>
    kind === 'need' ? row.needId === requestId : row.offerId === requestId,
  )
  const delivered = sum(mine.filter((row) => row.status === 'received'))
  const reserved = sum(mine.filter((row) => reservedStatuses.has(row.status)))
  const outstanding = Math.max(0, quantity)
  return {
    delivered,
    reserved,
    outstanding,
    fulfilled: reserved,
    status: outstanding === 0 || reserved >= outstanding ? 'Matched' : 'Open',
  }
}

function sum(rows: readonly AllocationSlice[]) {
  return rows.reduce((total, row) => total + row.quantity, 0)
}
