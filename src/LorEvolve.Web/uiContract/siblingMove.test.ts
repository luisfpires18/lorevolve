// Run with `node --test uiContract/siblingMove.test.ts` (Node 22.18+ strips the types itself).
//
// Keeps the Up and Down wiring of an ordered row on its shared part (#456): a caller says where its row
// sits (`sibling`), and `lib/siblingMove.ts` works out the first and last row, the direction and the step.
// The lists below only shrink, and a stale entry fails. Catalogue: docs/design/ui-components.md.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { siblingMove, type MoveDirection } from '../src/lib/siblingMove.ts'
import { elements, filesWith, read, stripComments, tsxFiles } from './support.ts'

const moves = (index: number, count: number) => {
  const seen: [number, MoveDirection][] = []
  const move = siblingMove({
    index,
    count,
    busy: false,
    to: (next, direction) => seen.push([next, direction]),
  })
  return { move, seen }
}

test('the first row cannot go up, the last cannot go down', () => {
  const first = moves(0, 3).move
  assert.equal(first.isFirst, true)
  assert.equal(first.isLast, false)
  const last = moves(2, 3).move
  assert.equal(last.isFirst, false)
  assert.equal(last.isLast, true)
})

test('a middle row is neither first nor last; a single row is both', () => {
  const middle = moves(1, 3).move
  assert.equal(middle.isFirst, false)
  assert.equal(middle.isLast, false)
  const only = moves(0, 1).move
  assert.equal(only.isFirst, true)
  assert.equal(only.isLast, true)
})

test('Up goes one place back and Down one place on, with the direction', () => {
  for (const [index, count] of [
    [0, 3],
    [1, 3],
    [2, 3],
    [0, 1],
  ]) {
    const { move, seen } = moves(index, count)
    move.onMove('up')
    move.onMove('down')
    assert.deepEqual(seen, [
      [index - 1, 'up'],
      [index + 1, 'down'],
    ])
    // A parent that takes a step (a scene, a story group) gets the distance from the row.
    assert.deepEqual(
      seen.map(([next]) => next - index),
      [-1, 1],
    )
  }
})

test('busy and the button ref pass through unchanged', () => {
  const buttonRef = () => {}
  const move = siblingMove({ index: 1, count: 3, busy: true, to: () => {}, buttonRef })
  assert.equal(move.busy, true)
  assert.equal(move.buttonRef, buttonRef)
  assert.equal(moves(1, 3).move.buttonRef, undefined)
})

// A hand-written move on a type row: the old `move` prop, or its first and last test.
const handWrittenMove = (source: string) =>
  elements(source, 'TypeRowActions').some(({ tag }) => /\bmove=|\bisFirst\b|\bisLast\b/.test(tag))

// Where Up and Down still map to a step by hand, and why.
const DIRECTION_MAPS = [
  'src/components/MoveItems.tsx', // the buttons: which end each one tips at, and the step it reports
  'src/lore/typeActions.tsx', // a Lore type picks its neighbour type, not an index (drag and reparent)
]

const writesDirection = (source: string) => /direction === 'up'/.test(stripComments(source))

test('the guard catches a hand-written move on a type row', () => {
  assert.ok(
    handWrittenMove('<TypeRowActions name="x" move={{ isFirst: index === 0, isLast: true }} />'),
  )
  assert.ok(
    handWrittenMove('<TypeRowActions\n  name="x"\n  move={canEdit ? { busy } : undefined}\n/>'),
  )
  assert.ok(!handWrittenMove('<TypeRowActions name="x" sibling={{ index, count, busy, to }} />'))
  assert.ok(!handWrittenMove('<MoveItems first={a} last={b} />'))
  assert.ok(writesDirection("onMove: (direction) => run(index + (direction === 'up' ? -1 : 1))"))
})

test('a type row says where it sits; no caller writes first, last or the direction', () => {
  assert.deepEqual(
    tsxFiles.filter((file) => handWrittenMove(read(file))),
    [],
    'pass `sibling` to <TypeRowActions> (lib/siblingMove.ts), not `move`',
  )
  const found = tsxFiles.filter((file) => writesDirection(read(file)))
  assert.deepEqual(
    found.filter((file) => !DIRECTION_MAPS.includes(file)),
    [],
    'let siblingMove map the direction: `sibling={{ index, count, busy, to }}`',
  )
  assert.deepEqual(
    DIRECTION_MAPS.filter((file) => !found.includes(file)),
    [],
    'stale allowlist entry: remove it',
  )
  assert.ok(filesWith(/<TypeRowActions/).length > 0)
})
