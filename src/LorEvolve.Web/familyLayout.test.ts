// Run with `node --test familyLayout.test.ts` (Node 22.18+ strips the types itself).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { arrangeFamily, type LayoutInput } from './src/familyTree/layout.ts'

const parent = (parentEntityId: string, childEntityId: string) => ({
  parentEntityId,
  childEntityId,
})
let next = 0
const both = (a: string, b: string) => {
  const relationshipId = `r${(next += 1)}`
  return [
    { relationshipId, entityId: a, relatedEntityId: b },
    { relationshipId, entityId: b, relatedEntityId: a },
  ]
}

/** Hollowtide as seeded on DEV, seen from Edric: the case that fell apart. */
function hollowtide(): LayoutInput {
  return {
    focalId: 'Edric',
    others: ['Isolde'],
    rows: {
      grandparents: [],
      parents: ['Aldric', 'Maren'],
      siblings: ['Sabine', 'Tomas'],
      children: ['Corin', 'Ilsa', 'Wren'],
      grandchildren: [],
    },
    links: [
      ...['Edric', 'Sabine', 'Tomas'].flatMap((child) => [
        parent('Aldric', child),
        parent('Maren', child),
      ]),
      ...['Corin', 'Ilsa', 'Wren'].map((child) => parent('Edric', child)),
    ],
    connections: [
      ...both('Edric', 'Isolde'),
      ...both('Aldric', 'Maren'),
      ...both('Edric', 'Sabine'),
      ...both('Edric', 'Tomas'),
      ...both('Sabine', 'Tomas'),
      ...both('Corin', 'Ilsa'),
      ...both('Maren', 'Wren'),
    ],
  }
}

test('a spouse with no parent links stands beside the focal entry, in the middle of its siblings', () => {
  const layout = arrangeFamily(hollowtide())
  assert.deepEqual(layout.rows.siblings, [['Sabine'], ['Edric', 'Isolde'], ['Tomas']])
  assert.deepEqual(layout.rows.parents, [['Aldric', 'Maren']])
  assert.deepEqual(layout.rows.children, [['Corin'], ['Ilsa'], ['Wren']])
})

test('co-parents are a couple; recorded family between siblings or across generations joins nobody', () => {
  const { couples } = arrangeFamily(hollowtide())
  assert.deepEqual(
    couples.map(({ left, right, parents }) => ({ left, right, parents })),
    [
      { left: 'Aldric', right: 'Maren', parents: true },
      { left: 'Edric', right: 'Isolde', parents: false },
    ],
  )
  // Aldric partner of Maren is drawn by their join; "sibling of" and "guardian of" are not.
  assert.equal(couples[0].relationshipIds.length, 1)
  assert.equal(couples[1].relationshipIds.length, 1)
})

test('children stand under their own parents, and each family under its couple', () => {
  const layout = arrangeFamily({
    focalId: 'Lia',
    others: [],
    rows: {
      grandparents: [],
      // Listed in the order that would put each child under the wrong couple.
      parents: ['Bo', 'Ann', 'Cy', 'Di'],
      siblings: ['Zed'],
      children: [],
      grandchildren: [],
    },
    links: [parent('Ann', 'Zed'), parent('Bo', 'Zed'), parent('Cy', 'Lia'), parent('Di', 'Lia')],
    connections: [],
  })
  assert.deepEqual(layout.rows.parents, [
    ['Bo', 'Ann'],
    ['Cy', 'Di'],
  ])
  assert.deepEqual(layout.rows.siblings, [['Zed'], ['Lia']])
})

test('grandparents follow the parent they stand above', () => {
  const layout = arrangeFamily({
    focalId: 'Lia',
    others: [],
    rows: {
      grandparents: ['Mum of Di', 'Dad of Cy'],
      parents: ['Cy', 'Di'],
      siblings: [],
      children: [],
      grandchildren: [],
    },
    links: [
      parent('Cy', 'Lia'),
      parent('Di', 'Lia'),
      parent('Dad of Cy', 'Cy'),
      parent('Mum of Di', 'Di'),
    ],
    connections: [],
  })
  assert.deepEqual(layout.rows.grandparents, [['Dad of Cy'], ['Mum of Di']])
})

test('a star of recorded family keeps two beside the entry, and the rest stand apart', () => {
  const layout = arrangeFamily({
    focalId: 'Bilbo',
    others: ['Frodo', 'Merry', 'Pippin'],
    rows: { grandparents: [], parents: [], siblings: [], children: [], grandchildren: [] },
    links: [],
    connections: [...both('Bilbo', 'Frodo'), ...both('Bilbo', 'Merry'), ...both('Bilbo', 'Pippin')],
  })
  assert.deepEqual(layout.rows.siblings, [['Frodo', 'Bilbo', 'Merry'], ['Pippin']])
  assert.equal(layout.couples.length, 2)
})
