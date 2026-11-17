import type {
  SystemMachineDetail,
  SystemMachineGuardRow,
  SystemMachineInput,
  SystemMachineState,
  SystemMachineTransition,
} from './types'

/**
 * A System's machine as the editor holds it (ADR 0073): pure edits of one document, the refusal paths the API answers
 * mapped back to the item they name, and the geometry the canvas draws with. Nothing here talks to the API, so the
 * unit tests read it directly (`systemMachine.test.ts`).
 *
 * The draft keeps the binding as two strings and a transition's label as a string, empty when unset; `toRequest` turns
 * an empty binding and an empty label back into the nulls the API stores, so a draft and the stored machine compare
 * the same way the server does.
 */
export interface MachineDoc {
  binding: { subjectType: string; attribute: string }
  states: SystemMachineState[]
  transitions: MachineTransition[]
}

export type MachineTransition = Omit<SystemMachineTransition, 'label'> & { label: string }

/** A state card's fixed size, in canvas units. */
export const STATE_WIDTH = 176
export const STATE_HEIGHT = 72

export const EMPTY_MACHINE: MachineDoc = {
  binding: { subjectType: '', attribute: '' },
  states: [],
  transitions: [],
}

export function docOf(detail: SystemMachineDetail): MachineDoc {
  return {
    binding: {
      subjectType: detail.binding?.subjectType ?? '',
      attribute: detail.binding?.attribute ?? '',
    },
    states: detail.states.map((state) => ({ ...state })),
    transitions: detail.transitions.map((transition) => ({
      ...transition,
      label: transition.label ?? '',
    })),
  }
}

/** The PUT body. A binding with both halves blank is no binding; a blank label is no label. */
export function toRequest(doc: MachineDoc, expectedVersion: number): SystemMachineInput {
  const { subjectType, attribute } = doc.binding
  return {
    // The one document version this build writes. This file imports types only, so Node runs its tests unbundled.
    schemaVersion: 1,
    binding:
      subjectType.trim() === '' && attribute.trim() === '' ? null : { subjectType, attribute },
    states: doc.states.map(({ id, name, value, initial, x, y }) => ({
      id,
      name,
      value,
      initial,
      x,
      y,
    })),
    transitions: doc.transitions.map(({ id, fromStateId, toStateId, label, guardRuleId }) => ({
      id,
      fromStateId,
      toStateId,
      label: label.trim() === '' ? null : label,
      guardRuleId,
    })),
    expectedVersion,
  }
}

/** Whether two documents would save the same machine. */
export function sameMachine(a: MachineDoc, b: MachineDoc) {
  return JSON.stringify(toRequest(a, 0)) === JSON.stringify(toRequest(b, 0))
}

/** Adds a state at the end. The first state of a machine is its initial one. */
export function addState(doc: MachineDoc, state: SystemMachineState): MachineDoc {
  const added = { ...state, initial: doc.states.length === 0 ? true : state.initial }
  const next = { ...doc, states: [...doc.states, added] }
  return added.initial ? setInitial(next, added.id) : next
}

/** Changes a state. Making it initial takes that from every other state. */
export function updateState(
  doc: MachineDoc,
  id: string,
  change: Partial<Omit<SystemMachineState, 'id'>>,
): MachineDoc {
  const next = {
    ...doc,
    states: doc.states.map((state) => (state.id === id ? { ...state, ...change } : state)),
  }
  return change.initial ? setInitial(next, id) : next
}

export function moveState(doc: MachineDoc, id: string, x: number, y: number) {
  return updateState(doc, id, { x, y })
}

/** Removes a state and every transition that touches it. When it was initial, the first state left takes over. */
export function removeState(doc: MachineDoc, id: string): MachineDoc {
  const gone = doc.states.find((state) => state.id === id)
  const states = doc.states.filter((state) => state.id !== id)
  const transitions = doc.transitions.filter(
    (transition) => transition.fromStateId !== id && transition.toStateId !== id,
  )
  const next = { ...doc, states, transitions }
  return gone?.initial && states.length > 0 ? setInitial(next, states[0].id) : next
}

/** Exactly one state is initial: this one. */
export function setInitial(doc: MachineDoc, id: string): MachineDoc {
  return { ...doc, states: doc.states.map((state) => ({ ...state, initial: state.id === id })) }
}

export function addTransition(doc: MachineDoc, transition: MachineTransition): MachineDoc {
  return { ...doc, transitions: [...doc.transitions, transition] }
}

export function updateTransition(
  doc: MachineDoc,
  id: string,
  change: Partial<Omit<MachineTransition, 'id'>>,
): MachineDoc {
  return {
    ...doc,
    transitions: doc.transitions.map((transition) =>
      transition.id === id ? { ...transition, ...change } : transition,
    ),
  }
}

export function removeTransition(doc: MachineDoc, id: string): MachineDoc {
  return { ...doc, transitions: doc.transitions.filter((transition) => transition.id !== id) }
}

/** Where a refusal belongs: an item's id with the property it names, the binding, or the machine as a whole. */
export interface Problem {
  item: string
  prop: string
}

/**
 * Maps a refusal's field key (lowercased by `lib/api.ts`) to the item it names in the document that was sent, so an
 * index still points at the right state after later edits moved it. `states[i].prop`, `transitions[i].prop` and
 * `binding.prop` name an item; anything else, or an index the sent document does not have, is the machine's.
 */
export function problemAt(key: string, sent: MachineDoc): Problem {
  const indexed = /^(states|transitions)\[(\d+)\](?:\.(\w+))?$/.exec(key)
  if (indexed) {
    const list = indexed[1] === 'states' ? sent.states : sent.transitions
    const item = list[Number(indexed[2])]
    return item ? { item: item.id, prop: indexed[3] ?? '' } : { item: 'machine', prop: '' }
  }
  const binding = /^binding\.(\w+)$/.exec(key)
  if (binding) return { item: 'binding', prop: binding[1] }
  return { item: 'machine', prop: '' }
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

/** Where the line from `from`, inside `rect`, towards `toward` crosses the rect's border, so an arrowhead shows. */
export function edgePoint(rect: Rect, from: Point, toward: Point): Point {
  const dx = toward.x - from.x
  const dy = toward.y - from.y
  const reach = (start: number, low: number, high: number, delta: number) =>
    delta > 0 ? (high - start) / delta : delta < 0 ? (low - start) / delta : Infinity
  const t = Math.max(
    0,
    Math.min(
      reach(from.x, rect.x, rect.x + rect.width, dx),
      reach(from.y, rect.y, rect.y + rect.height, dy),
    ),
  )
  return t === Infinity ? from : { x: from.x + dx * t, y: from.y + dy * t }
}

/** The gap between transitions that join the same two states, in canvas units. */
export const LINE_GAP = 16

/**
 * How far each transition is drawn off the straight line between its states, along its own left-hand normal, so the
 * transitions between one pair never overlap. Both directions share one spread: a reversed transition's offset is
 * negated, because its normal points the other way.
 */
export function lineOffsets(transitions: MachineTransition[]) {
  const groups = new Map<string, MachineTransition[]>()
  for (const transition of transitions) {
    const key = [transition.fromStateId, transition.toStateId].sort().join('|')
    groups.set(key, [...(groups.get(key) ?? []), transition])
  }
  const offsets = new Map<string, number>()
  for (const group of groups.values()) {
    group.forEach((transition, index) => {
      const spread = (index - (group.length - 1) / 2) * LINE_GAP
      const reversed = transition.fromStateId > transition.toStateId
      offsets.set(transition.id, reversed ? -spread : spread)
    })
  }
  return offsets
}

/** How many open or reviewing findings a state has, from the machine's `openFindings`; a state not listed has none. */
export function openCount(openFindings: SystemMachineDetail['openFindings'], stateId: string) {
  return openFindings.find((each) => each.stateId === stateId)?.count ?? 0
}

/** The three marks "Try an entry" puts on a transition. */
export type GuardMarkKind = 'holds' | 'fails' | 'unknown'

/**
 * One guard's answer for the tried entry, as a mark. No guard and an exempt rule both hold; an `error` guard shows as
 * unknown with its code, because the author is told three marks and a broken guard proves nothing either way.
 */
export function guardMark(row: SystemMachineGuardRow): {
  kind: GuardMarkKind
  code: string | null
} {
  if (row.guard === 'true' || row.guard === 'none') return { kind: 'holds', code: null }
  if (row.guard === 'false') return { kind: 'fails', code: null }
  return { kind: 'unknown', code: row.errorCode }
}

/** The two versions the System editor's saves are written over: its name save's and its machine save's. */
export interface BaseVersions {
  details: number
  machine: number
}

/**
 * After one save moved the System from `from` to `to`: that save's base is `to`, and the other base moves too only when
 * it was `from`. So an author is never refused by their own earlier save, and a stale draft is still refused.
 */
export function advanceVersions(
  bases: BaseVersions,
  which: keyof BaseVersions,
  from: number,
  to: number,
): BaseVersions {
  const other = which === 'details' ? 'machine' : 'details'
  const next = { ...bases, [which]: to }
  if (bases[other] === from) next[other] = to
  return next
}
