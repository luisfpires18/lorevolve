// node site/alpha/lib/application.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readApplication } from './application.js'

const valid = { email: ' Someone@Example.org ', name: 'A', useCase: 'B', consent: true }

test('a minimal application is accepted and the email normalised', () => {
  const { row } = readApplication(valid)
  assert.equal(row.email, 'someone@example.org')
  assert.equal(row.payPreference, null)
  assert.equal(row.priceTooCheap, null)
})

test('consent must be exactly true', () => {
  assert.equal(readApplication({ ...valid, consent: 'yes' }).field, 'consent')
  assert.equal(readApplication({ ...valid, consent: undefined }).field, 'consent')
})

test('required fields, lengths and the email shape are checked', () => {
  assert.equal(readApplication({ ...valid, name: '   ' }).field, 'name')
  assert.equal(readApplication({ ...valid, useCase: 'x'.repeat(1001) }).error, 'too_long')
  assert.equal(readApplication({ ...valid, email: 'not-an-email' }).field, 'email')
  assert.equal(readApplication({ ...valid, email: 42 }).field, 'email')
})

test('survey answers are optional and bounded', () => {
  const { row } = readApplication({ ...valid, payPreference: 'other', payOther: ' Yearly ', priceTooCheap: '2.499', priceTooExpensive: 30, suggestion: '' })
  assert.deepEqual([row.payPreference, row.payOther, row.priceTooCheap, row.priceTooExpensive, row.suggestion], ['other', 'Yearly', 2.5, 30, null])
  assert.equal(readApplication({ ...valid, payPreference: 'barter' }).field, 'payPreference')
  assert.equal(readApplication({ ...valid, priceTooCheap: -1 }).field, 'priceTooCheap')
  assert.equal(readApplication({ ...valid, priceTooExpensive: 'lots' }).field, 'priceTooExpensive')
})

test('"Something else" text is dropped unless that choice is made', () => {
  assert.equal(readApplication({ ...valid, payPreference: 'usage', payOther: 'ignored' }).row.payOther, null)
})
