/** Shapes returned by the FastAPI backend in `backend/app`. */

export type ApiWindow = { start: string | null; end: string | null }

/** Lender windows arrive as `[start, end]` pairs or `{ start, end }` objects. */
export type ApiLenderWindow = [string, string] | { start: string; end: string }

export type ApiResident = {
  id: string
  name: string
  short_name: string | null
  street: string
  initials: string
  x: number
  y: number
}

export type ApiCatalogItem = {
  id: string
  name: string
  category: string
  demo_price_cents: number
  default_loan_hours: number
}

export type ApiNeighbor = {
  inventory_id: string
  resident_id: string
  resident_name: string
  distance: number
  quantity: number
  condition_note: string
  windows: ApiLenderWindow[]
}

export type ApiProjectTool = {
  id: string
  /** Null for a tool Gemini suggested that is not in the catalog. */
  catalog_item_id: string | null
  name: string
  optional: boolean
  have_already: boolean
  neighbors: ApiNeighbor[]
}

export type ApiProject = {
  id: string
  resident_id: string
  raw_text: string
  window: ApiWindow
  tools: ApiProjectTool[]
}

export type ApiToolListCard = {
  type: 'tool_list'
  project_id: string
  raw_text: string
  window: ApiWindow
  snowflake: string
  tools: ApiProjectTool[]
}

export type ApiConfirmationCard = {
  type: 'confirmation'
  request_id: string
  kind: 'need' | 'offer'
  item: { id: string; name: string }
  quantity: number
  area: string | null
  window: ApiWindow
  status: 'pending_confirm'
}

export type ApiAllocation = {
  offer_request_id: string
  resident_id: string
  quantity: number
}

export type ApiMatchCard = {
  type: 'match'
  handoff_id: string
  need_request_id: string
  recipient_id: string
  item: { id: string; name: string }
  quantity: number
  filled_quantity: number
  complete: boolean
  allocations: ApiAllocation[]
  snowflake: string
  status: string
}

export type ApiLoanStatus =
  | 'requested'
  | 'confirmed'
  | 'picked_up'
  | 'returned'
  | 'declined'

export type ApiLoan = {
  loan_id: string
  lender_id: string
  borrower_id: string
  inventory_id: string | null
  catalog_item_id: string
  request_id: string | null
  window: ApiWindow
  status: ApiLoanStatus
  quantity: number
}

export type ApiHandoffStatus = 'proposed' | 'confirmed' | 'received' | 'declined'

export type ApiHandoff = {
  id: string
  need_request_id: string
  recipient_id: string
  status: ApiHandoffStatus
  recipient_confirmed: boolean
  allocations: (ApiAllocation & { donor_confirmed: boolean })[]
}

export type ApiRequest = {
  id: string
  resident_id: string
  kind: string
  raw_text: string | null
  catalog_item_id: string
  quantity: number
  area: string | null
  window: ApiWindow
  status: string
}

export type ApiLoanStatusCard =
  | ({ type: 'loan_status'; record: 'loan' } & ApiLoan)
  | ({ type: 'loan_status'; record: 'handoff' } & ApiHandoff)
  | { type: 'loan_status'; record: 'request'; request_id: string; status: string }

export type ApiNoMatchCard = {
  type: 'no_match'
  message: string
  request_id?: string
}

export type ApiChatCard =
  | ApiToolListCard
  | ApiConfirmationCard
  | ApiMatchCard
  | ApiLoanStatusCard
  | ApiNoMatchCard

export type ApiActivity = {
  requests: ApiRequest[]
  loans: ApiLoan[]
  handoffs: ApiHandoff[]
}

export type ApiConflict = {
  message: string
  next_free_slot: { start: string; end: string } | null
}

export type ApiInventoryItem = {
  inventory_id?: string
  resident_id: string
  resident_name: string
  catalog_item: string
  catalog_item_id: string | null
  catalog_name: string
  category?: string
  condition?: string
  quantity: number
  willing_to_lend: boolean
  condition_note: string
  distance?: number
}

export type ApiInventory = {
  snowflake: string
  snowflake_message?: string
  items: ApiInventoryItem[]
  resident_id?: string
}
