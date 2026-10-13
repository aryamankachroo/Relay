import assert from 'node:assert/strict'
import test from 'node:test'
import { coverageFor } from './coverage.ts'

test('a received portion does not mark the leftover need as matched', () => {
  const coverage = coverageFor('need', 'need-1', 8, [
    { status: 'received', quantity: 12, needId: 'need-1', offerId: 'offer-1' },
  ])
  assert.deepEqual(coverage, {
    delivered: 12,
    reserved: 0,
    outstanding: 8,
    fulfilled: 0,
    status: 'Open',
  })
})

test('eight received from twenty leaves twelve open', () => {
  const coverage = coverageFor('need', 'need-1', 12, [
    { status: 'received', quantity: 8, needId: 'need-1', offerId: 'offer-1' },
  ])
  assert.equal(coverage.outstanding, 12)
  assert.equal(coverage.status, 'Open')
})

test('a reserved offer covers only what is still outstanding', () => {
  const coverage = coverageFor('need', 'need-1', 20, [
    { status: 'proposed', quantity: 8, needId: 'need-1', offerId: 'offer-1' },
    { status: 'received', quantity: 4, needId: 'other', offerId: 'offer-2' },
  ])
  assert.equal(coverage.reserved, 8)
  assert.equal(coverage.delivered, 0)
  assert.equal(coverage.status, 'Open')
})

test('reserving the whole remainder marks the need matched', () => {
  const coverage = coverageFor('need', 'need-1', 8, [
    { status: 'confirmed', quantity: 8, needId: 'need-1', offerId: 'offer-2' },
  ])
  assert.equal(coverage.status, 'Matched')
})
