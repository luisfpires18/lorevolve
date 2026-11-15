// Run with `node --test i18n.test.ts` (Node 22.18+ strips the types itself).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fill, pickLocale, splitPlaceholders, translate, translatePlural } from './src/i18n/core.ts'

const en = {
  greeting: { hello: 'Hello, {name}' },
  entries: { one: '{count} entry', other: '{count} entries' },
  onlyEnglish: 'Only in English',
}
const pt = {
  greeting: { hello: 'Olá, {name}' },
  entries: { one: '{count} entrada', other: '{count} entradas' },
}
const known = [
  { code: 'en', ready: true },
  { code: 'pt-PT', ready: true },
  { code: 'fr', ready: false },
]

test('a message fills its placeholders and leaves an unknown one visible', () => {
  assert.equal(translate(pt, en, 'greeting.hello', { name: 'Ana' }), 'Olá, Ana')
  assert.equal(fill('{a} and {b}', { a: 1 }), '1 and {b}')
})

test('a message the translation lacks falls back to English, then to the key', () => {
  assert.equal(translate(pt, en, 'onlyEnglish'), 'Only in English')
  assert.equal(translate(pt, en, 'missing.key'), 'missing.key')
  assert.equal(translate(pt, en, 'greeting'), 'greeting')
})

test('plurals follow each language: Portuguese counts zero as plural', () => {
  assert.equal(translatePlural('en', en, en, 'entries', 1), '1 entry')
  assert.equal(translatePlural('en', en, en, 'entries', 0), '0 entries')
  assert.equal(translatePlural('pt-PT', pt, en, 'entries', 0), '0 entradas')
  assert.equal(translatePlural('pt-PT', pt, en, 'entries', 1), '1 entrada')
  assert.equal(translatePlural('pt-PT', pt, en, 'entries', 1234), '1234 entradas')
  assert.equal(translatePlural('en', en, en, 'entries', 1234), '1,234 entries')
})

test('placeholders split out for nodes', () => {
  assert.deepEqual(splitPlaceholders('Read {link} first.'), ['Read ', '{link}', ' first.'])
})

test('the saved choice wins when LorEvolve knows it, ready or not', () => {
  assert.equal(pickLocale('pt-PT', ['en-US'], known), 'pt-PT')
  assert.equal(pickLocale('fr', ['en-US'], known), 'fr')
  assert.equal(pickLocale('de', ['pt-BR'], known), 'pt-PT')
})

test('without a choice, the first browser language a ready translation covers, else English', () => {
  assert.equal(pickLocale(null, ['pt-BR', 'en'], known), 'pt-PT')
  assert.equal(pickLocale(null, ['pt'], known), 'pt-PT')
  assert.equal(pickLocale(null, ['fr-FR', 'en-GB'], known), 'en')
  assert.equal(pickLocale(null, ['de-DE'], known), 'en')
  assert.equal(pickLocale(null, [], known), 'en')
})

test('a group may hold a message called other without becoming a plural', () => {
  const groups = { kinds: { other: 'Other', audio: 'Audio' } }
  assert.equal(translate(groups, groups, 'kinds.other'), 'Other')
  assert.equal(translate(groups, groups, 'kinds.audio'), 'Audio')
})

test('a plural may take its count as its own placeholder, ungrouped', () => {
  const raw = { edits: { one: '{n} edit', other: '{n} edits' } }
  // What every `tn(key, count, { n: count })` call site relies on: `{count}` is filled with the
  // formatted number, and any var passed by the caller is filled as given.
  assert.equal(translatePlural('en', raw, raw, 'edits', 1234, { n: 1234 }), '1234 edits')
  assert.equal(translatePlural('en', raw, raw, 'edits', 1, { n: 1 }), '1 edit')
  // Without the override the placeholder is left visible, rather than silently dropped.
  assert.equal(translatePlural('en', raw, raw, 'edits', 2), '{n} edits')
})
