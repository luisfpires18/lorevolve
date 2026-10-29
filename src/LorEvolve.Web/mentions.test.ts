// Run with `node --test mentions.test.ts` (Node 22.18+ strips the types itself).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  findMentions,
  markedPieces,
  mentionQueryAt,
  mentionToken,
  plainExcerpt,
  plainMentions,
} from './src/lore/mentions.ts'

const ID = '3f9c1a2b-7d4e-4c1a-9b2f-0e8d6a5c4b3a'
const token = `@[Akron Wright](lore:${ID})`

test('a mention is found by its exact shape and read as its name', () => {
  const text = `She saw ${token} at dusk.`
  assert.deepEqual(findMentions(text), [
    { start: 8, length: token.length, name: 'Akron Wright', entityId: ID },
  ])
  assert.equal(plainMentions(text), 'She saw Akron Wright at dusk.')
})

test('anything not exactly a mention is prose, kept as typed', () => {
  for (const prose of [
    'mail me at a@example.test',
    '@[Akron Wright](lore:not-an-id)',
    '@[Akron Wright] (lore:' + ID + ')',
    '@[Akron\nWright](lore:' + ID + ')',
    '[Akron Wright](lore:' + ID + ')',
  ]) {
    assert.deepEqual(findMentions(prose), [], prose)
  }
  assert.equal(plainMentions('No mention.\n\n  Spaces kept.  '), 'No mention.\n\n  Spaces kept.  ')
})

test('an excerpt cut through a mention shows no markup', () => {
  assert.equal(plainExcerpt(`ght](lore:${ID}) walked in`), 'ght walked in')
  assert.equal(plainExcerpt('then @[Akron Wr'), 'then Akron Wr')
  assert.equal(plainExcerpt(`then @[Akron Wright](lore:3f9c`), 'then Akron Wright')
  assert.equal(plainExcerpt(`a ${token} b`), 'a Akron Wright b')
})

test('a token never carries brackets or line breaks in its name', () => {
  assert.equal(mentionToken('The [Old] King\n', ID), `@[The Old King](lore:${ID})`)
  assert.equal(findMentions(mentionToken('The [Old] King', ID)).length, 1)
})

test('an @ opens a mention only where a mention could start', () => {
  assert.deepEqual(mentionQueryAt('Then @Akr', 9), { start: 5, query: 'Akr' })
  assert.deepEqual(mentionQueryAt('@', 1), { start: 0, query: '' })
  assert.deepEqual(mentionQueryAt('("@Mi', 5), { start: 2, query: 'Mi' })
  assert.deepEqual(mentionQueryAt('@Akron Wr', 9), { start: 0, query: 'Akron Wr' })
  assert.equal(mentionQueryAt('mail a@exa', 10), null)
  assert.equal(mentionQueryAt('@ Akron', 7), null)
  assert.equal(mentionQueryAt('@Akron\nWr', 9), null)
  assert.equal(mentionQueryAt(`${token}`, token.length), null)
  assert.equal(mentionQueryAt('no at here', 10), null)
})

test('the backdrop pieces are the text exactly, each name apart from its markup', () => {
  const text = `${token} sat with him.\n\n@[Akron](lore:not-an-id) and ${token}\n`
  const pieces = markedPieces(text)
  assert.equal(pieces.map((piece) => piece.text).join(''), text)
  assert.deepEqual(
    pieces.filter((piece) => piece.part === 'name').map((piece) => piece.text),
    ['Akron Wright', 'Akron Wright'],
  )
  assert.deepEqual(pieces.slice(0, 3), [
    { text: '@[', part: 'markup' },
    { text: 'Akron Wright', part: 'name' },
    { text: `](lore:${ID})`, part: 'markup' },
  ])
  assert.deepEqual(markedPieces('No mention here.'), [{ text: 'No mention here.' }])
  assert.deepEqual(markedPieces(''), [])
})
