// Run with `node --test systemMachine.test.ts` (Node 22.18+ strips the types itself).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  addState,
  addTransition,
  advanceVersions,
  edgePoint,
  EMPTY_MACHINE,
  guardMark,
  LINE_GAP,
  lineOffsets,
  moveState,
  openCount,
  problemAt,
  removeState,
  removeTransition,
  sameMachine,
  setInitial,
  toRequest,
  updateState,
  updateTransition,
  type MachineDoc,
} from './src/worldLogic/machine.ts'

const state = (id: string, value = id) => ({
  id,
  name: id.toUpperCase(),
  value,
  initial: false,
  x: 0,
  y: 0,
})
const line = (id: string, fromStateId: string, toStateId: string) => ({
  id,
  fromStateId,
  toStateId,
  label: '',
  guardRuleId: null,
})

function machine(): MachineDoc {
  let doc = addState(EMPTY_MACHINE, state('a'))
  doc = addState(doc, state('b'))
  doc = addState(doc, state('c'))
  doc = addTransition(doc, line('ab', 'a', 'b'))
  doc = addTransition(doc, line('bc', 'b', 'c'))
  return doc
}

test('the first state added is the initial one, and only it', () => {
  const doc = machine()
  assert.deepEqual(
    doc.states.map((each) => each.initial),
    [true, false, false],
  )
})

test('states are updated and moved, and making one initial takes it from the rest', () => {
  let doc = updateState(machine(), 'b', { name: 'Bee' })
  doc = moveState(doc, 'c', 40, 80)
  assert.equal(doc.states[1].name, 'Bee')
  assert.deepEqual([doc.states[2].x, doc.states[2].y], [40, 80])

  doc = updateState(doc, 'c', { initial: true })
  assert.deepEqual(
    doc.states.map((each) => each.initial),
    [false, false, true],
  )
  assert.deepEqual(
    setInitial(doc, 'a').states.map((each) => each.initial),
    [true, false, false],
  )
})

test('removing a state takes its transitions, and the initial passes to the first state left', () => {
  const doc = removeState(machine(), 'a')
  assert.deepEqual(
    doc.states.map((each) => each.id),
    ['b', 'c'],
  )
  assert.deepEqual(
    doc.transitions.map((each) => each.id),
    ['bc'],
  )
  assert.equal(doc.states[0].initial, true)

  const notInitial = removeState(machine(), 'c')
  assert.equal(notInitial.states[0].initial, true)
  assert.deepEqual(
    notInitial.transitions.map((each) => each.id),
    ['ab'],
  )
})

test('transitions are updated and removed', () => {
  let doc = updateTransition(machine(), 'ab', { label: 'wake', guardRuleId: 'r1' })
  assert.equal(doc.transitions[0].label, 'wake')
  assert.equal(doc.transitions[0].guardRuleId, 'r1')
  doc = removeTransition(doc, 'ab')
  assert.deepEqual(
    doc.transitions.map((each) => each.id),
    ['bc'],
  )
})

test('toRequest sends a blank binding and a blank label as null', () => {
  const request = toRequest(machine(), 7)
  assert.equal(request.schemaVersion, 1)
  assert.equal(request.expectedVersion, 7)
  assert.equal(request.binding, null)
  assert.equal(request.transitions[0].label, null)

  const bound = toRequest(
    { ...machine(), binding: { subjectType: 'Character', attribute: 'Mood' } },
    1,
  )
  assert.deepEqual(bound.binding, { subjectType: 'Character', attribute: 'Mood' })
})

test('sameMachine reads what would be saved, not how the draft holds it', () => {
  const doc = machine()
  assert.equal(sameMachine(doc, structuredClone(doc)), true)
  assert.equal(
    sameMachine(doc, updateTransition(doc, 'ab', { label: '  ' })),
    true,
    'a blank label is no label either way',
  )
  assert.equal(sameMachine(doc, moveState(doc, 'a', 1, 0)), false)
})

test('problemAt names the item a refusal is about, in the document that was sent', () => {
  const sent = machine()
  assert.deepEqual(problemAt('states[1].value', sent), { item: 'b', prop: 'value' })
  assert.deepEqual(problemAt('transitions[1].guardruleid', sent), {
    item: 'bc',
    prop: 'guardruleid',
  })
  assert.deepEqual(problemAt('states[0]', sent), { item: 'a', prop: '' })
  assert.deepEqual(problemAt('binding.subjecttype', sent), { item: 'binding', prop: 'subjecttype' })
  assert.deepEqual(problemAt('binding', sent), { item: 'machine', prop: '' })
  assert.deepEqual(problemAt('states', sent), { item: 'machine', prop: '' })
  assert.deepEqual(problemAt('schemaversion', sent), { item: 'machine', prop: '' })
  assert.deepEqual(problemAt('states[9].name', sent), { item: 'machine', prop: '' })
  assert.deepEqual(problemAt('something.else', sent), { item: 'machine', prop: '' })
})

test('edgePoint stops a line at the border of the card it leaves', () => {
  const rect = { x: 0, y: 0, width: 100, height: 40 }
  assert.deepEqual(edgePoint(rect, { x: 50, y: 20 }, { x: 250, y: 20 }), { x: 100, y: 20 })
  assert.deepEqual(edgePoint(rect, { x: 50, y: 20 }, { x: 50, y: -100 }), { x: 50, y: 0 })
  assert.deepEqual(edgePoint(rect, { x: 50, y: 20 }, { x: 150, y: 120 }), { x: 70, y: 40 })
  assert.deepEqual(edgePoint(rect, { x: 50, y: 20 }, { x: 50, y: 20 }), { x: 50, y: 20 })
})

test('lineOffsets spreads the transitions between one pair, both directions together', () => {
  const lone = lineOffsets([line('ab', 'a', 'b')])
  assert.equal(lone.get('ab'), 0)

  const both = lineOffsets([line('ab', 'a', 'b'), line('ba', 'b', 'a'), line('bc', 'b', 'c')])
  assert.equal(both.get('ab'), -LINE_GAP / 2)
  // Reversed, so negated: along its own normal, which points the other way, it lands on the opposite side.
  assert.equal(both.get('ba'), -LINE_GAP / 2)
  assert.equal(both.get('bc'), 0)
})

test('advanceVersions moves the other base only when it was the version the save started from', () => {
  assert.deepEqual(advanceVersions({ details: 3, machine: 3 }, 'machine', 3, 4), {
    details: 4,
    machine: 4,
  })
  assert.deepEqual(advanceVersions({ details: 2, machine: 3 }, 'machine', 3, 4), {
    details: 2,
    machine: 4,
  })
  assert.deepEqual(advanceVersions({ details: 5, machine: 5 }, 'details', 5, 6), {
    details: 6,
    machine: 6,
  })
  assert.deepEqual(advanceVersions({ details: 5, machine: 5 }, 'machine', 5, 5), {
    details: 5,
    machine: 5,
  })
})

test('guardMark gives three marks, and an error guard is unknown with its code', () => {
  const row = (
    guard: 'true' | 'false' | 'unknown' | 'error' | 'none',
    errorCode = null as string | null,
  ) => ({
    transitionId: 't',
    guard,
    errorCode,
  })
  assert.deepEqual(guardMark(row('true')), { kind: 'holds', code: null })
  assert.deepEqual(guardMark(row('none')), { kind: 'holds', code: null })
  assert.deepEqual(guardMark(row('false')), { kind: 'fails', code: null })
  assert.deepEqual(guardMark(row('unknown')), { kind: 'unknown', code: null })
  assert.deepEqual(guardMark(row('error', 'type_mismatch')), {
    kind: 'unknown',
    code: 'type_mismatch',
  })
})

test('openCount reads a state count, and a state not listed has none', () => {
  const open = [
    { stateId: 'a', count: 2 },
    { stateId: 'c', count: 1 },
  ]
  assert.equal(openCount(open, 'a'), 2)
  assert.equal(openCount(open, 'c'), 1)
  assert.equal(openCount(open, 'b'), 0)
  assert.equal(openCount([], 'a'), 0)
})
