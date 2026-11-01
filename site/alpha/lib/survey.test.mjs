// node site/alpha/lib/survey.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readSurvey } from './survey.js'

test('only answered questions are kept, and empty ones are skipped', () => {
  const { answers } = readSurvey({ publish: 'parts', browse: '', wished: '  maps that move  ', ai: null })
  assert.deepEqual(answers, { publish: 'parts', wished: 'maps that move' })
})

test('an empty survey is a valid survey', () => {
  assert.deepEqual(readSurvey({}).answers, {})
})

test('unknown questions and choices are refused, and so is anything that names a person', () => {
  assert.equal(readSurvey({ favouriteColour: 'blue' }).field, 'favouriteColour')
  assert.equal(readSurvey({ email: 'someone@example.org' }).field, 'email')
  assert.equal(readSurvey({ name: 'A' }).field, 'name')
  assert.equal(readSurvey({ publish: 'sometimes' }).field, 'publish')
  assert.equal(readSurvey({ usefulness: {} }).field, 'usefulness')
  assert.equal(readSurvey([]).field, 'answers')
  assert.equal(readSurvey(null).field, 'answers')
})

test('app kind and storage take their own choices only', () => {
  assert.deepEqual(readSurvey({ appKind: 'desktop', storage: 'local' }).answers, { appKind: 'desktop', storage: 'local' })
  assert.equal(readSurvey({ appKind: 'mobile' }).field, 'appKind')
  assert.equal(readSurvey({ storage: 'usb' }).field, 'storage')
})

test('any number of interests, each a known feature, duplicates dropped', () => {
  assert.deepEqual(readSurvey({ interests: ['maps', 'maps', 'lore'] }).answers.interests, ['maps', 'lore'])
  assert.equal(readSurvey({ interests: ['lore', 'types', 'maps', 'ideas', 'plot', 'search'] }).answers.interests.length, 6)
  assert.equal(readSurvey({ interests: ['teleporting'] }).field, 'interests')
})

test('prices are bounded and rounded, and "Something else" text needs that choice', () => {
  const { answers } = readSurvey({ priceTooCheap: '2.499', priceTooExpensive: 30, payPreference: 'usage', payOther: 'ignored' })
  assert.deepEqual(answers, { priceTooCheap: 2.5, priceTooExpensive: 30, payPreference: 'usage' })
  assert.equal(readSurvey({ priceTooCheap: -1 }).field, 'priceTooCheap')
  assert.equal(readSurvey({ payPreference: 'other', payOther: ' yearly ' }).answers.payOther, 'yearly')
})

test('free text is bounded', () => {
  assert.equal(readSurvey({ wished: 'x'.repeat(2001) }).error, 'too_long')
  assert.equal(readSurvey({ useCase: 'x'.repeat(1001) }).error, 'too_long')
  assert.equal(readSurvey({ wished: 3 }).error, 'invalid')
})
