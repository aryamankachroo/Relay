import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatReply, formatWindow } from './format.mjs'

const names = new Map([
  ['avery', 'Avery Moss'],
  ['jordan', 'Jordan Lee'],
  ['sam', 'Sam Ortiz'],
])
const weekend = { start: '2026-10-17T09:00:00', end: '2026-10-18T18:00:00' }

test('tool list names the nearest lender and flags tools outside the catalog', () => {
  const text = formatReply(
    {
      type: 'tool_list',
      window: weekend,
      tools: [
        {
          name: 'Clamps',
          catalog_item_id: 'clamps',
          have_already: false,
          neighbors: [
            { resident_name: 'Jordan Lee', distance: 3 },
            { resident_name: 'Sam Ortiz', distance: 5 },
          ],
        },
        { name: 'Drill', catalog_item_id: 'drill', have_already: false, neighbors: [] },
        { name: 'Socket set', catalog_item_id: null, have_already: false, neighbors: [] },
        { name: 'Level', catalog_item_id: 'level', have_already: true, neighbors: [] },
      ],
    },
    { names, siteUrl: 'http://relay.test' },
  )
  assert.equal(
    text,
    [
      'Tools for your project (Saturday 9 am – Sunday 6 pm):',
      '- Clamps: Jordan Lee can lend, about 3 blocks away (+1 more)',
      '- Drill: nobody nearby listed one',
      '- Socket set: not in the Relay catalog yet',
      '- Level: you have one',
      '',
      'Book or follow along: http://relay.test',
    ].join('\n'),
  )
})

test('confirmation asks for yes or no', () => {
  const text = formatReply({
    type: 'confirmation',
    kind: 'need',
    item: { id: 'notebooks', name: 'Notebooks' },
    quantity: 20,
    area: null,
    window: { start: '2026-10-17T09:00:00', end: '2026-10-17T18:00:00' },
  })
  assert.equal(text, 'Post a need for 20 Notebooks, Saturday 9 am–6 pm? Reply yes or no.')
})

test('match lists who covers the need', () => {
  const text = formatReply(
    {
      type: 'match',
      item: { id: 'notebooks', name: 'Notebooks' },
      quantity: 20,
      filled_quantity: 20,
      complete: true,
      allocations: [
        { resident_id: 'jordan', quantity: 12 },
        { resident_id: 'sam', quantity: 8 },
      ],
    },
    { names },
  )
  assert.equal(text, 'All 20 Notebooks are covered by Jordan Lee (12), Sam Ortiz (8).')
})

test('match with no offers says so', () => {
  const text = formatReply({
    type: 'match',
    item: { id: 'drill', name: 'Drill' },
    quantity: 1,
    filled_quantity: 0,
    complete: false,
    allocations: [],
  })
  assert.equal(text, 'Your need for 1 Drill is posted. Nobody has offered any yet.')
})

test('loan, handoff and request statuses read plainly', () => {
  assert.equal(
    formatReply(
      { type: 'loan_status', record: 'loan', lender_id: 'jordan', borrower_id: 'avery', status: 'picked_up' },
      { names },
    ),
    'Loan from Jordan Lee to Avery Moss is picked up.',
  )
  assert.equal(
    formatReply({ type: 'loan_status', record: 'handoff', status: 'proposed' }),
    'Handoff is waiting on confirmation.',
  )
  assert.equal(
    formatReply({ type: 'loan_status', record: 'request', status: 'declined_by_user' }),
    'Request is declined by user.',
  )
})

test('no match passes the backend message through', () => {
  assert.equal(formatReply({ type: 'no_match', message: 'Nothing is waiting.' }), 'Nothing is waiting.')
})

test('unknown cards get a safe reply', () => {
  assert.match(formatReply({ type: 'surprise' }), /could not answer/)
})

test('windows without an end show just the start', () => {
  assert.equal(formatWindow({ start: '2026-10-17T14:30:00Z', end: null }), 'Saturday 2:30 pm')
  assert.equal(formatWindow(null), '')
})
