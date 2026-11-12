// Run with `node --test fieldInheritance.test.ts` (Node 22.18+ strips the types itself).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ancestorsOf, withInheritedFields } from './src/lore/fieldInheritance.ts'
import type { EntityType } from './src/lore/types.ts'

const field = (id: string, displayOrder: number, sectionId: string | null = null) =>
  ({ id, name: id, displayOrder, sectionId }) as unknown as EntityType['fields'][number]

const type = (
  id: string,
  parentId: string | null,
  fields: EntityType['fields'],
  sections: EntityType['fieldSections'] = [],
) => ({ id, name: id, parentId, fields, fieldSections: sections }) as unknown as EntityType

test('a nested type has every ancestor field, root first, then its own, each in its order', () => {
  const weapons = type('weapons', null, [field('rarity', 2), field('damage', 1)])
  const chaos = type('chaos', 'weapons', [field('rune', 1)])
  const blade = type('blade', 'chaos', [field('edge', 1)])
  const types = [weapons, chaos, blade]

  assert.deepEqual(
    ancestorsOf(blade, types).map((each) => each.id),
    ['weapons', 'chaos'],
  )
  const merged = withInheritedFields(blade, types)
  assert.deepEqual(
    merged.fields.map((each) => each.id),
    ['damage', 'rarity', 'rune', 'edge'],
  )
  assert.deepEqual(
    merged.fields.map((each) => each.displayOrder),
    [0, 1, 2, 3],
  )
  assert.equal(withInheritedFields(weapons, types), weapons)
})

test("an inherited field keeps its owner's section, listed before the type's own sections", () => {
  const parent = type(
    'p',
    null,
    [field('a', 1, 's1')],
    [{ id: 's1', name: 'Combat', displayOrder: 1, startsCollapsed: false }],
  )
  const child = type(
    'c',
    'p',
    [field('b', 1, 's2')],
    [{ id: 's2', name: 'Lore', displayOrder: 1, startsCollapsed: false }],
  )
  const merged = withInheritedFields(child, [parent, child])
  assert.deepEqual(
    merged.fieldSections.map((each) => [each.id, each.displayOrder]),
    [
      ['s1', 1],
      ['s2', 2],
    ],
  )
})

test('a loop or a missing parent ends the walk', () => {
  const a = type('a', 'b', [field('x', 1)])
  const b = type('b', 'a', [field('y', 1)])
  assert.deepEqual(
    withInheritedFields(a, [a, b]).fields.map((each) => each.id),
    ['y', 'x'],
  )
  const orphan = type('o', 'gone', [field('z', 1)])
  assert.equal(withInheritedFields(orphan, [orphan]), orphan)
})
