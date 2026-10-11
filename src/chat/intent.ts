import { demoResident } from '../data/index.ts'
import {
  clampQuantity,
  itemLabel,
  knownItemIn,
  type ExchangeDraft,
  type ExchangeKind,
} from '../data/exchanges.ts'

/**
 * Keyword mock for the chat prototype.
 * A few phrases decide need versus offer. Item, quantity, place, and time are read off the sentence.
 */

const offerPatterns = [
  /\bi have\b/i,
  /\bi['’]ve got\b/i,
  /\bto give away\b/i,
  /\bgiving away\b/i,
  /\bgive away\b/i,
  /\bto lend\b/i,
  /\bcan lend\b/i,
  /\bto donate\b/i,
  /\bto share\b/i,
  /\boffering\b/i,
]

const needPatterns = [
  /\bi need\b/i,
  /\bwe need\b/i,
  /\bin need of\b/i,
  /\blooking for\b/i,
  /\bcould use\b/i,
]

const numberWords: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  twelve: 12,
  twenty: 20,
  dozen: 12,
}

const quantityWord = 'a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve|twenty|dozen'
const dayName = 'monday|tuesday|wednesday|thursday|friday|saturday|sunday'
const dayPart = 'morning|afternoon|evening|night'
const meridiem = String.raw`a\.?m\.?|p\.?m\.?`
const clock = String.raw`\d{1,2}(?::\d{2})?(?:\s*(?:${meridiem}))?`
const range = String.raw`${clock}\s*[–—-]\s*${clock}`
const streetName = 'willow court|birch lane|cedar path|oak street|maple row'
const spotName = 'porch|driveway|front step|curb'

const windowPattern = new RegExp(
  String.raw`\b(?:(?:on|for)\s+)?(?:(?:${dayName})(?:\s+(?:${dayPart}))?(?:,?\s*${range})?|this\s+weekend|tomorrow|today|(?:${dayPart})|${range})\b`,
  'i',
)

const streets = [
  { pattern: /\bwillow court\b/i, label: 'Willow Court' },
  { pattern: /\bbirch lane\b/i, label: 'Birch Lane' },
  { pattern: /\bcedar path\b/i, label: 'Cedar Path' },
  { pattern: /\boak street\b/i, label: 'Oak Street' },
  { pattern: /\bmaple row\b/i, label: 'Maple Row' },
]

export function parseExchange(text: string): ExchangeDraft | null {
  const source = text.trim()
  const kind = detectKind(source)
  if (!kind) return null

  const windowMatch = source.match(windowPattern)?.[0] ?? ''
  let working = windowMatch ? source.replace(windowMatch, ' ') : source
  working = stripPlace(working)
  working = working.replace(/\bfor\b\s+.+$/i, ' ')

  const { quantity, token } = extractQuantity(working)
  if (token) working = working.replace(new RegExp(`\\b${escapeToken(token)}\\b`, 'i'), ' ')

  const known = knownItemIn(source)
  const item = known ? itemLabel(known.singular, quantity) : cleanupItem(working)
  if (!item) return null

  return {
    kind,
    item,
    quantity,
    pickupArea: extractPickup(source),
    windowLabel: windowMatch ? formatWindow(windowMatch) : '',
  }
}

function detectKind(text: string): ExchangeKind | null {
  if (/\bhave a need\b/i.test(text)) return 'need'

  const offerAt = earliest(text, offerPatterns)
  const needAt = earliest(text, needPatterns)
  if (offerAt === null && needAt === null) return null
  if (offerAt === null) return 'need'
  if (needAt === null) return 'offer'
  return offerAt <= needAt ? 'offer' : 'need'
}

function earliest(text: string, patterns: readonly RegExp[]) {
  let best: number | null = null
  for (const pattern of patterns) {
    const match = pattern.exec(text)
    if (!match) continue
    if (best === null || match.index < best) best = match.index
  }
  return best
}

function extractQuantity(working: string) {
  const digit = working.match(/\b(\d{1,3})\b/)
  if (digit?.[1]) return { quantity: clampQuantity(Number(digit[1])), token: digit[1] }

  const word = working.match(new RegExp(String.raw`\b(${quantityWord})\b`, 'i'))
  if (word?.[1]) {
    return { quantity: numberWords[word[1].toLowerCase()] ?? 1, token: word[1] }
  }

  return { quantity: 1, token: null }
}

function extractPickup(text: string) {
  const spot = text.match(new RegExp(String.raw`\b(${spotName})\b`, 'i'))
  const street = streets.find((entry) => entry.pattern.test(text))
  const spotLabel = spot?.[1] ? titleWord(spot[1]) : ''

  if (spotLabel && street) {
    const place = street.label === 'Willow Court' ? demoResident.street : street.label
    return `${spotLabel} at ${place}`
  }
  if (spotLabel) return `${spotLabel} at ${demoResident.street}`
  if (street?.label === 'Willow Court') return demoResident.street
  if (street) return street.label
  return demoResident.street
}

function stripPlace(text: string) {
  return text
    .replace(
      new RegExp(String.raw`\b(?:at|on|near|from)\s+(?:the\s+|my\s+)?(?:${spotName})\b`, 'gi'),
      ' ',
    )
    .replace(new RegExp(String.raw`\b(?:at|on|near|from)\s+\d{1,5}\s+(?:${streetName})\b`, 'gi'), ' ')
    .replace(new RegExp(String.raw`\b\d{1,5}\s+(?:${streetName})\b`, 'gi'), ' ')
    .replace(new RegExp(String.raw`\b(?:${streetName}|${spotName})\b`, 'gi'), ' ')
}

function cleanupItem(working: string) {
  let text = working
  const fillers = [
    /\bi have\b/gi,
    /\bi['’]ve got\b/gi,
    /\bi need\b/gi,
    /\bwe need\b/gi,
    /\blooking for\b/gi,
    /\bcould use\b/gi,
    /\bin need of\b/gi,
    /\bto give away\b/gi,
    /\bgiving away\b/gi,
    /\bgive away\b/gi,
    /\bto lend\b/gi,
    /\bcan lend\b/gi,
    /\bto donate\b/gi,
    /\bto share\b/gi,
    /\boffering\b/gi,
    /\bunused\b/gi,
    /\bextra\b/gi,
    /\bspare\b/gi,
    /\bplease\b/gi,
    /\baround\b/gi,
    /\bsome\b/gi,
    /\bthe\b/gi,
    /\bmy\b/gi,
    /\bour\b/gi,
    /\ba\b/gi,
    /\ban\b/gi,
    /\band\b/gi,
    /\bto\b/gi,
  ]

  for (const pattern of fillers) text = text.replace(pattern, ' ')
  text = text.replace(/\b\d+\b/g, ' ').replace(/[^a-z0-9\s-]/gi, ' ').replace(/\s+/g, ' ').trim()
  return text ? titleWordPhrase(text) : ''
}

function formatWindow(raw: string) {
  const cleaned = raw
    .replace(/^(?:on|for)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

  if (cleaned === 'this weekend' || cleaned === 'tomorrow' || cleaned === 'today') {
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
  }

  return cleaned
    .replace(/(^|\s)([a-z])/g, (_, space: string, letter: string) => `${space}${letter.toUpperCase()}`)
    .replace(/\b(Am|Pm)\b/g, (value) => value.toLowerCase())
    .replace(/\b(Morning|Afternoon|Evening|Night)\b/g, (value) => value.toLowerCase())
}

function titleWord(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
}

function titleWordPhrase(value: string) {
  return value.replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
}

function escapeToken(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
