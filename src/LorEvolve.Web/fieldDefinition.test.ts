// Run with `node --test fieldDefinition.test.ts` (Node 22.18+ strips the types itself).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { asEntryDetail, asEntryType } from './src/projectEntities/fieldDefinition.ts'
import type {
  ProjectEntityDetail,
  ProjectEntityType,
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
