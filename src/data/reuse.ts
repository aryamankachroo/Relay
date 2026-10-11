import { isHandoffComplete, type HandoffStatus } from './exchanges.ts'
import { isLoanComplete, type LoanStatus } from './lending.ts'

/**
 * One finished Borrow Tomorrow loan or Hand Off counts as a reuse event.
 * Counts only in-memory seeded + session activity so refresh restores a known demo total.
 */
export function countCompletedReuse(
  loans: readonly { status: LoanStatus }[],
  handoffs: readonly { status: HandoffStatus }[],
) {
  return (
    loans.filter((loan) => isLoanComplete(loan.status)).length +
    handoffs.filter((handoff) => isHandoffComplete(handoff.status)).length
  )
}

export type GardenStage = 0 | 1 | 2 | 3 | 4

/** Visual fullness of the garden beds. Stages are decorative, not tree-planting claims. */
export function gardenStageForCount(count: number): GardenStage {
  if (count <= 0) return 0
  if (count === 1) return 1
  if (count === 2) return 2
  if (count <= 4) return 3
  return 4
}

export function gardenStageLabel(stage: GardenStage) {
  if (stage === 0) return 'Fresh beds'
  if (stage === 1) return 'First sprouts'
  if (stage === 2) return 'Young plants'
  if (stage === 3) return 'In bloom'
  return 'Lush beds'
}
