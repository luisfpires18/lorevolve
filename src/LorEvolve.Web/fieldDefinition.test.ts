// Run with `node --test fieldDefinition.test.ts` (Node 22.18+ strips the types itself).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  asEntryDetail,
  asEntrySummary,
  asEntryPage,
  asEntryType,
} from './src/projectEntities/fieldDefinition.ts'
import type {
  ProjectEntityDetail,
  ProjectEntityPage,
  ProjectEntityType,
  ProjectEntitySummary,
  ProjectField,
} from './src/projectEntities/types.ts'

const field = (id: string, displayOrder: number): ProjectField => ({
  id,
  name: id,
  kind: 0,
  isRequired: false,
  displayOrder,
  options: [],
  imageShape: null,
})

const type: ProjectEntityType = {
  id: 'knight',
  name: 'Knight',
  description: null,
  icon: null,
  accentColor: null,
  parentId: 'person',
  displayOrder: 3,
  entryCount: 4,
  fields: [field('motto', 0), field('rank', 1)],
  inheritedFields: [field('born', 0)],
}

test('a project type reads as a Lore entry type: inherited fields first, numbered from 0', () => {
  const shaped = asEntryType(type)
  assert.deepEqual(
    shaped.fields.map((one) => [one.id, one.displayOrder]),
    [
      ['born', 0],
      ['motto', 1],
      ['rank', 2],
    ],
  )
  assert.equal(shaped.parentId, 'person')
  assert.deepEqual(
    [shaped.entityCount, shaped.listedEntityCount, shaped.trashedEntityCount],
    [4, 4, 0],
  )
  assert.deepEqual(
    [shaped.archivedFields, shaped.fieldSections, shaped.fieldLayoutVersion],
    [[], [], 0],
  )
  assert.deepEqual([shaped.familyTreeEligible, shaped.familyTreeOffered], [false, false])
})

test('a project entry reads as a Lore entry with none of Lore own parts, its Lore link kept', () => {
  const entry: ProjectEntityDetail = {
    id: 'e1',
    name: 'Bastion',
    summary: null,
    entityTypeId: 'knight',
    entityTypeName: 'Knight',
    entityTypeIcon: null,
    entityTypeAccentColor: null,
    createdAt: '2026-11-22T00:00:00Z',
    updatedAt: '2026-11-22T00:00:00Z',
    fields: [],
    fieldImages: [],
    image: null,
    version: 2,
    canonEntityId: 'lore-1',
  }
  const shaped = asEntryDetail(entry)
  assert.equal(shaped.canonEntityId, 'lore-1')
  assert.equal(shaped.version, 2)
  assert.deepEqual([shaped.aliases, shaped.tags, shaped.articleExcerpt], [[], [], null])
  assert.deepEqual(
    [shaped.isArchived, shaped.hasFamilyConnections, shaped.hasProgression],
    [false, false, false],
  )
})

const row = (id: string): ProjectEntitySummary => ({
  id,
  name: id,
  summary: null,
  entityTypeId: 'knight',
  entityTypeName: 'Knight',
  entityTypeIcon: null,
  entityTypeAccentColor: null,
  canonEntityId: null,
  canonEntityName: null,
  updatedAt: '2026-11-22T00:00:00Z',
  image: null,
})
// What the server answers for `page` of `total` entries: that page's rows and the total of them all.
const served = (total: number, page: number, size: number): ProjectEntityPage => {
  const from = Math.min((page - 1) * size, total)
  const count = Math.min(size, total - from)
  return {
    items: Array.from({ length: count }, (_, index) => row(`e${from + index + 1}`)),
    totalCount: total,
  }
}
const read = (total: number, page: number, size = 12) => {
  const one = asEntryPage(served(total, page, size), page, size)
  return [one.items.map((item) => item.id), one.page, one.pageSize, one.totalCount, one.totalPages]
}

test('a project list row reads as a Lore card with none of Lore own parts, its Lore link kept', () => {
  const shaped = asEntrySummary({ ...row('e1'), canonEntityId: 'lore-1', canonEntityName: 'Bram' })
  assert.equal(shaped.canonEntityName, 'Bram')
  assert.deepEqual([shaped.aliases, shaped.tags, shaped.articleExcerpt], [[], [], null])
  assert.deepEqual([shaped.canonStatus, shaped.isArchived], [1, false])
})

test("a server page reads as a Lore page with the server's total", () => {
  const ids = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, index) => `e${from + index}`)
  // The first page, a middle page and the last, short one.
  assert.deepEqual(read(30, 1), [ids(1, 12), 1, 12, 30, 3])
  assert.deepEqual(read(30, 2), [ids(13, 24), 2, 12, 30, 3])
  assert.deepEqual(read(30, 3), [ids(25, 30), 3, 12, 30, 3])
  // A page past the end keeps its number and the real totals, so the list moves to the last page.
  assert.deepEqual(read(30, 4), [[], 4, 12, 30, 3])
  // No entries: no pages.
  assert.deepEqual(read(0, 1), [[], 1, 12, 0, 0])
  assert.deepEqual(read(41, 2, 40), [ids(41, 41), 2, 40, 41, 2])
  // Each row reads as a Lore card.
  const card = asEntryPage(served(1, 1, 12), 1, 12).items[0]
  assert.deepEqual([card.canonStatus, card.isArchived, card.aliases, card.tags], [1, false, [], []])
})
