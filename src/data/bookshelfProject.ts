export type SuggestedTool = {
  id: string
  name: string
  required: boolean
}

export type ChecklistTool = SuggestedTool & {
  selected: boolean
}

export type InventoryCategory = 'Tools' | 'Garden' | 'Kitchen' | 'Household' | 'Sports'

export type ItemCondition = 'Excellent' | 'Good' | 'Fair'

export const inventoryCategories = [
  'Tools',
  'Garden',
  'Kitchen',
  'Household',
  'Sports',
] as const satisfies readonly InventoryCategory[]

export const itemConditions = ['Excellent', 'Good', 'Fair'] as const satisfies readonly ItemCondition[]

export type InventoryItem = {
  id: string
  name: string
  category: InventoryCategory
  quantity: number
  condition: ItemCondition
  notes: string
  availableToLend: boolean
}

export type InventoryDraft = {
  name: string
  category: InventoryCategory
  quantity: number
  condition: ItemCondition
  notes: string
  availableToLend: boolean
}

export type InventorySplit = {
  owned: ChecklistTool[]
  missing: ChecklistTool[]
}

/**
 * Mock records for the bookshelf demo.
 * Inventory overlaps the suggested tools so a check can show both owned and missing items.
 * Extra shelf items let a tool added in the chat match something the resident already has.
 */
export const bookshelfProject = {
  title: 'Bookshelf this weekend',
  summary:
    'Here are the tools for that build. Check the ones to compare, mark anything you can skip, and take off what you do not need.',
  tools: [
    { id: 'tool-drill', name: 'Drill', required: true },
    { id: 'tool-saw', name: 'Saw', required: true },
    { id: 'tool-level', name: 'Level', required: true },
    { id: 'tool-sander', name: 'Sander', required: false },
    { id: 'tool-clamps', name: 'Clamps', required: false },
    { id: 'tool-tape-measure', name: 'Tape measure', required: true },
  ] satisfies SuggestedTool[],
}

/** Avery’s shelf. Keep Drill / Level / Clamps / Tape measure here so the chat demo still splits cleanly. */
export const seededInventory: InventoryItem[] = [
  {
    id: 'inv-drill',
    name: 'Drill',
    category: 'Tools',
    quantity: 1,
    condition: 'Good',
    notes: 'Cordless 18V. Bits are in the green case.',
    availableToLend: true,
  },
  {
    id: 'inv-level',
    name: 'Level',
    category: 'Tools',
    quantity: 1,
    condition: 'Excellent',
    notes: '24-inch spirit level. Rarely leaves the shelf.',
    availableToLend: true,
  },
  {
    id: 'inv-clamps',
    name: 'Clamps',
    category: 'Tools',
    quantity: 4,
    condition: 'Good',
    notes: 'Bar clamps in mixed sizes.',
    availableToLend: true,
  },
  {
    id: 'inv-tape-measure',
    name: 'Tape measure',
    category: 'Tools',
    quantity: 2,
    condition: 'Good',
    notes: 'One 25 ft and one smaller pocket tape.',
    availableToLend: true,
  },
  {
    id: 'inv-hammer',
    name: 'Hammer',
    category: 'Tools',
    quantity: 1,
    condition: 'Fair',
    notes: 'Claw hammer. Grip is a little worn.',
    availableToLend: true,
  },
  {
    id: 'inv-screwdriver',
    name: 'Screwdriver',
    category: 'Tools',
    quantity: 1,
    condition: 'Good',
    notes: 'Multi-bit handle with common heads.',
    availableToLend: false,
  },
  {
    id: 'inv-gloves',
    name: 'Work gloves',
    category: 'Tools',
    quantity: 2,
    condition: 'Fair',
    notes: 'Medium pair plus a spare.',
    availableToLend: true,
  },
  {
    id: 'inv-extension-cord',
    name: 'Extension cord',
    category: 'Tools',
    quantity: 1,
    condition: 'Excellent',
    notes: '50 ft outdoor cord on a reel.',
    availableToLend: true,
  },
  {
    id: 'inv-wheelbarrow',
    name: 'Wheelbarrow',
    category: 'Garden',
    quantity: 1,
    condition: 'Good',
    notes: 'Steel tray. Fine for mulch and soil.',
    availableToLend: true,
  },
  {
    id: 'inv-hedge-shears',
    name: 'Hedge shears',
    category: 'Garden',
    quantity: 1,
    condition: 'Good',
    notes: 'Sharpened last spring.',
    availableToLend: true,
  },
  {
    id: 'inv-watering-can',
    name: 'Watering can',
    category: 'Garden',
    quantity: 1,
    condition: 'Excellent',
    notes: 'Two-gallon can with a soft rose.',
    availableToLend: false,
  },
  {
    id: 'inv-mixing-bowls',
    name: 'Mixing bowls',
    category: 'Kitchen',
    quantity: 3,
    condition: 'Excellent',
    notes: 'Nested stainless set.',
    availableToLend: true,
  },
  {
    id: 'inv-cooler',
    name: 'Cooler',
    category: 'Kitchen',
    quantity: 1,
    condition: 'Good',
    notes: 'Handed off to Maya for the block picnic — back on the shelf as a record.',
    availableToLend: false,
  },
  {
    id: 'inv-folding-table',
    name: 'Folding table',
    category: 'Household',
    quantity: 1,
    condition: 'Good',
    notes: 'Six-foot banquet table for projects or parties.',
    availableToLend: true,
  },
  {
    id: 'inv-steam-cleaner',
    name: 'Steam cleaner',
    category: 'Household',
    quantity: 1,
    condition: 'Fair',
    notes: 'Works well on tile. Needs distilled water.',
    availableToLend: false,
  },
  {
    id: 'inv-bike-pump',
    name: 'Bike pump',
    category: 'Sports',
    quantity: 1,
    condition: 'Excellent',
    notes: 'Floor pump with a pressure gauge.',
    availableToLend: true,
  },
  {
    id: 'inv-camping-chairs',
    name: 'Camping chairs',
    category: 'Sports',
    quantity: 2,
    condition: 'Good',
    notes: 'Folding chairs with cup holders.',
    availableToLend: true,
  },
]

export function normalizeToolName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function ownedInventoryNames(inventory: readonly InventoryItem[]) {
  return new Set(inventory.map((item) => normalizeToolName(item.name)))
}

export function createBookshelfChecklist(): ChecklistTool[] {
  return bookshelfProject.tools.map((tool) => ({ ...tool, selected: true }))
}

export function splitByInventory(
  tools: readonly ChecklistTool[],
  inventory: readonly InventoryItem[] = seededInventory,
): InventorySplit {
  const ownedNames = ownedInventoryNames(inventory)
  const owned: ChecklistTool[] = []
  const missing: ChecklistTool[] = []

  for (const tool of tools) {
    if (!tool.selected) continue
    if (ownedNames.has(normalizeToolName(tool.name))) owned.push(tool)
    else missing.push(tool)
  }

  return { owned, missing }
}

export function createInventoryDraft(): InventoryDraft {
  return {
    name: '',
    category: 'Tools',
    quantity: 1,
    condition: 'Good',
    notes: '',
    availableToLend: true,
  }
}

export function draftFromItem(item: InventoryItem): InventoryDraft {
  return {
    name: item.name,
    category: item.category,
    quantity: item.quantity,
    condition: item.condition,
    notes: item.notes,
    availableToLend: item.availableToLend,
  }
}
