/** The backend and the Snowflake seed write demo wall-clock times ("Saturday 9 am") as UTC. */
const timeZone = 'UTC'

const loanStatus = {
  requested: 'requested',
  confirmed: 'confirmed',
  picked_up: 'picked up',
  returned: 'returned',
  declined: 'declined',
}

const handoffStatus = {
  proposed: 'waiting on confirmation',
  confirmed: 'confirmed',
  received: 'received',
  declined: 'declined',
}

/**
 * Turn a Relay chat card into a plain text message.
 * `names` maps resident ids to display names; `siteUrl` is the booking link.
 */
export function formatReply(card, { names = new Map(), siteUrl = '' } = {}) {
  const nameOf = (id) => names.get(id) ?? id
  const link = siteUrl ? `\n\nBook or follow along: ${siteUrl}` : ''

  switch (card?.type) {
    case 'tool_list':
      return toolList(card) + link
    case 'confirmation': {
      const action = card.kind === 'offer' ? 'Offer' : 'Post a need for'
      const when = formatWindow(card.window)
      const where = card.area ? ` at ${card.area}` : ''
      return `${action} ${card.quantity} ${card.item.name}${where}${when ? `, ${when}` : ''}? Reply yes or no.`
    }
    case 'match':
      return match(card, nameOf) + link
    case 'loan_status':
      return loanStatusText(card, nameOf)
    case 'no_match':
      return card.message
    default:
      return 'Relay could not answer that one. Try again in a moment.'
  }
}

function toolList(card) {
  const when = formatWindow(card.window)
  const lines = card.tools.map((tool) => {
    if (tool.have_already) return `- ${tool.name}: you have one`
    if (tool.catalog_item_id === null) return `- ${tool.name}: not in the Relay catalog yet`
    const [nearest, ...others] = tool.neighbors
    if (!nearest) return `- ${tool.name}: nobody nearby listed one`
    const more = others.length ? ` (+${others.length} more)` : ''
    return `- ${tool.name}: ${nearest.resident_name} can lend, ${distanceLabel(nearest.distance)}${more}`
  })
  return [`Tools for your project${when ? ` (${when})` : ''}:`, ...lines].join('\n')
}

function match(card, nameOf) {
  if (!card.allocations.length) {
    return `Your need for ${card.quantity} ${card.item.name} is posted. Nobody has offered any yet.`
  }
  const givers = card.allocations
    .map((row) => `${nameOf(row.resident_id)} (${row.quantity})`)
    .join(', ')
  const filled = card.complete
    ? `All ${card.quantity} ${card.item.name} are covered`
    : `${card.filled_quantity} of ${card.quantity} ${card.item.name} are covered`
  return `${filled} by ${givers}.`
}

function loanStatusText(card, nameOf) {
  if (card.record === 'loan') {
    const status = loanStatus[card.status] ?? card.status
    return `Loan from ${nameOf(card.lender_id)} to ${nameOf(card.borrower_id)} is ${status}.`
  }
  if (card.record === 'handoff') {
    return `Handoff is ${handoffStatus[card.status] ?? card.status}.`
  }
  return `Request is ${String(card.status).replaceAll('_', ' ')}.`
}

function distanceLabel(distance) {
  const blocks = Math.round(Number(distance) || 0)
  return blocks <= 1 ? 'next door' : `about ${blocks} blocks away`
}

export function formatWindow(window) {
  const start = parse(window?.start)
  const end = parse(window?.end)
  if (!start) return ''
  if (!end) return moment(start)
  const sameDay = day(start) === day(end)
  return sameDay ? `${day(start)} ${hour(start)}–${hour(end)}` : `${moment(start)} – ${moment(end)}`
}

function parse(value) {
  if (!value) return null
  const text = /Z|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? null : date
}

function day(date) {
  return date.toLocaleDateString('en-US', { weekday: 'long', timeZone })
}

function hour(date) {
  return date
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone })
    .replace(':00', '')
    .replace(' AM', ' am')
    .replace(' PM', ' pm')
}

function moment(date) {
  return `${day(date)} ${hour(date)}`
}
