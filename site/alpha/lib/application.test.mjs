// node site/alpha/lib/application.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readApplication } from './application.js'

const valid = { email: ' Someone@Example.org ', name: 'A', useCase: 'B', consent: true }

test('a minimal application is accepted and the email normalised', () => {
  const { row } = readApplication(valid)
  assert.deepEqual(row, { email: 'someone@example.org', name: 'A', useCase: 'B' })
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

test('pricing answers sent the old way are ignored, not stored', () => {
  assert.deepEqual(Object.keys(readApplication({ ...valid, payPreference: 'usage', priceTooCheap: 2 }).row), ['email', 'name', 'useCase'])
})
