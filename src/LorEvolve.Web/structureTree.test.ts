// Run with `node --test structureTree.test.ts` (Node 22.18+ strips the types itself).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  addableLevels,
  childrenOf,
  descendantCount,
  moveTargets,
  showsArt,
} from './src/projectEntities/structureTree.ts'

const node = (id: string, level: string, parentId: string | null, sortOrder = 0) => ({
  id,
  parentId,
  level,
  title: id,
  summary: null,
  bodyLength: 0,
  sortOrder,
  version: 1,
})

// A feature film: Act 1 holds a scene and a sequence with a scene and a beat.
const tree = {
  format: 'feature-film',
  roots: ['act'],
  children: { act: ['sequence', 'scene'], sequence: ['scene'], scene: ['beat'], beat: [] },
  nodes: [
    node('act1', 'act', null, 0),
    node('act2', 'act', null, 1),
    node('seq', 'sequence', 'act1', 1),
    node('direct', 'scene', 'act1', 0),
    node('inner', 'scene', 'seq', 0),
    node('beat', 'beat', 'inner', 0),
  ],
}

test('children come back in their places', () => {
  assert.deepEqual(
    childrenOf(tree, 'act1').map((each) => each.id),
    ['direct', 'seq'],
  )
  assert.deepEqual(
    childrenOf(tree, null).map((each) => each.id),
    ['act1', 'act2'],
  )
})

test('the add buttons follow the rules at the root and under each level', () => {
  assert.deepEqual(addableLevels(tree, null), ['act'])
  assert.deepEqual(addableLevels(tree, 'act'), ['sequence', 'scene'])
  assert.deepEqual(addableLevels(tree, 'beat'), [])
  assert.deepEqual(addableLevels(tree, 'unknown'), [])
})

test('a delete counts everything inside at any depth', () => {
  assert.equal(descendantCount(tree, 'act1'), 4)
  assert.equal(descendantCount(tree, 'beat'), 0)
})

test('a node moves only where its level is allowed, never into itself, and not to its own parent', () => {
  const inner = tree.nodes.find((each) => each.id === 'inner')!
  assert.deepEqual(
    moveTargets(tree, inner).map((each) => each?.id ?? 'root'),
    ['act1', 'act2'],
  )

  const seq = tree.nodes.find((each) => each.id === 'seq')!
  assert.deepEqual(
    moveTargets(tree, seq).map((each) => each?.id ?? 'root'),
    ['act2'],
  )

  // In a short film a beat moves only to another scene.
  const short = {
    format: 'short-film',
    roots: ['scene'],
    children: { scene: ['beat'], beat: [] },
    nodes: [node('s1', 'scene', null, 0), node('s2', 'scene', null, 1), node('b', 'beat', 's1', 0)],
  }
  const beat = short.nodes.find((each) => each.id === 'b')!
  assert.deepEqual(
    moveTargets(short, beat).map((each) => each?.id ?? 'root'),
    ['s2'],
  )
})

test('the art placeholder stands in for a missing picture and a crop that failed to load', () => {
  assert.equal(showsArt(null, null), false)
  assert.equal(showsArt(undefined, null), false)
  assert.equal(showsArt({ cropId: 'a' }, null), true)
  assert.equal(showsArt({ cropId: 'a' }, 'a'), false)
  // A new crop after a failed one is tried again.
  assert.equal(showsArt({ cropId: 'b' }, 'a'), true)
})
