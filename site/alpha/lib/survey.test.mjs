// node site/alpha/lib/survey.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readSurvey } from './survey.js'

test('only answered questions are kept, and empty ones are skipped', () => {
  const { answers } = readSurvey('signup', { publish: 'parts', browse: '', wished: '  maps that move  ', ai: null })
  assert.deepEqual(answers, { publish: 'parts', wished: 'maps that move' })
})

test('an empty survey is a valid survey', () => {
  assert.deepEqual(readSurvey('signup', {}).answers, {})
})

test('unknown parts, questions and choices are refused', () => {
  assert.equal(readSurvey('middle', {}).field, 'part')
  assert.equal(readSurvey('signup', { favouriteColour: 'blue' }).field, 'favouriteColour')
  assert.equal(readSurvey('signup', { publish: 'sometimes' }).field, 'publish')
  assert.equal(readSurvey('signup', { usefulness: {} }).field, 'usefulness')
  assert.equal(readSurvey('signup', []).field, 'answers')
})

test('up to five interests, each a known feature', () => {
  assert.deepEqual(readSurvey('signup', { interests: ['maps', 'maps', 'lore'] }).answers.interests, ['maps', 'lore'])
  assert.equal(readSurvey('signup', { interests: ['lore', 'types', 'maps', 'ideas', 'plot', 'search'] }).field, 'interests')
  assert.equal(readSurvey('signup', { interests: ['teleporting'] }).field, 'interests')
})

test('the usefulness grid takes known features and known ratings only', () => {
  assert.deepEqual(readSurvey('end', { usefulness: { lore: 'must', mcp: 'untried' } }).answers.usefulness, { lore: 'must', mcp: 'untried' })
  assert.equal(readSurvey('end', { usefulness: { lore: 'amazing' } }).field, 'usefulness')
  assert.equal(readSurvey('end', { usefulness: { flying: 'must' } }).field, 'usefulness')
})

test('prices are bounded and rounded, and "Something else" text needs that choice', () => {
  const { answers } = readSurvey('end', { priceTooCheap: '2.499', priceTooExpensive: 30, payPreference: 'usage', payOther: 'ignored' })
  assert.deepEqual(answers, { priceTooCheap: 2.5, priceTooExpensive: 30, payPreference: 'usage' })
  assert.equal(readSurvey('end', { priceTooCheap: -1 }).field, 'priceTooCheap')
  assert.equal(readSurvey('end', { payPreference: 'other', payOther: ' yearly ' }).answers.payOther, 'yearly')
})

test('free text is bounded', () => {
  assert.equal(readSurvey('end', { confused: 'x'.repeat(2001) }).error, 'too_long')
  assert.equal(readSurvey('end', { confused: 3 }).error, 'invalid')
})
