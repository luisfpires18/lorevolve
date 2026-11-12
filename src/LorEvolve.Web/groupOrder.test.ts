// Run with `node --test groupOrder.test.ts` (Node 22.18+ strips the types itself).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { byGroupPriority } from './src/lore/groupOrder.ts'

const lore = (name: string, entityTypeId: string) => ({ name, entityTypeId })

test('lore reads by group priority, picked order inside a group, ungrouped types last', () => {
  const groups = [
    { typeIds: ['character'] },
    { typeIds: ['faction'] },
    { typeIds: ['place', 'kingdom'] },
  ]
  const picked = [
    lore('Fortis', 'place'),
    lore('Rowan', 'character'),
    lore('Sword', 'item'),
    lore('Frontline', 'faction'),
    lore('Arkazia', 'kingdom'),
    lore('Ruth', 'character'),
  ]
  assert.deepEqual(
    byGroupPriority(picked, groups).map((entry) => entry.name),
    ['Rowan', 'Ruth', 'Frontline', 'Fortis', 'Arkazia', 'Sword'],
  )
})

test('a type in two groups reads under the first-ranked one, and no groups keeps the picked order', () => {
  const groups = [{ typeIds: ['faction'] }, { typeIds: ['character', 'faction'] }]
  const picked = [lore('Ruth', 'character'), lore('Frontline', 'faction')]
  assert.deepEqual(
    byGroupPriority(picked, groups).map((entry) => entry.name),
    ['Frontline', 'Ruth'],
  )
  assert.deepEqual(
    byGroupPriority(picked, []).map((entry) => entry.name),
    ['Ruth', 'Frontline'],
  )
})
