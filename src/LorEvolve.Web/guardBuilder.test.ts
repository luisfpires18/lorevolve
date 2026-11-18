// Run with `node --test guardBuilder.test.ts` (Node 22.18+ strips the types itself).
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  ALWAYS_VALUES,
  CLAUSE_OPERATORS,
  COMPARE_OPERATORS,
  FIELD_TYPES,
  MAX_CONDITION_LENGTH,
  MAX_DEPTH,
  MAX_NODES,
  MAX_WHERE_CLAUSES,
  NODE_KINDS,
  SOURCE_FIELDS,
  TIME_SCOPES,
  VALUE_TYPES,
} from './src/worldLogic/conditionSchema.ts'
import {
  getAt,
  isObject,
  removeAt,
  setAt,
  type Json,
  type JsonObject,
  type Path,
} from './src/worldLogic/guard.ts'
import { classifyNode, classifyOperand } from './src/worldLogic/guardClassify.ts'
import { blockFor, blockPaths, pathOf } from './src/worldLogic/guardPaths.ts'
import { checkComplete, measure } from './src/worldLogic/guardChecks.ts'
import { sameCondition, summarize } from './src/worldLogic/guardSummary.ts'
import {
  clauseOperators,
  compareOperators,
  newClause,
  newGuard,
  newNode,
  withField,
  wrap,
} from './src/worldLogic/guardBlocks.ts'
import { toUpdateRequest } from './src/worldLogic/guardRequests.ts'
import type { SystemRuleDetail } from './src/worldLogic/types.ts'

const here = import.meta.dirname
const schema = readFileSync(
  join(here, '../LorEvolve.Api/Features/Systems/ConditionSchema.cs'),
  'utf8',
)
const fixtures = join(here, '../../tests/LorEvolve.Api.Tests/Fixtures/WorldLogic')

const quoted = (text: string) => [...text.matchAll(/"([^"]*)"/g)].map((match) => match[1])

function serverList(name: string) {
  const match = new RegExp(`${name} =\\s*\\[([^\\]]*)\\]`).exec(schema)
  assert.ok(match, `${name} is in ConditionSchema.cs`)
  return quoted(match[1])
}

function serverNumber(name: string) {
  const match = new RegExp(`const int ${name} = ([\\d_]+);`).exec(schema)
  assert.ok(match, `${name} is in ConditionSchema.cs`)
  return Number(match[1].replaceAll('_', ''))
}

test('the closed sets and limits are the server’s own', () => {
  assert.deepEqual([...NODE_KINDS], serverList('NodeKinds'))
  assert.deepEqual([...COMPARE_OPERATORS], serverList('CompareOperators'))
  assert.deepEqual([...CLAUSE_OPERATORS], serverList('ClauseOperators'))
  assert.deepEqual([...VALUE_TYPES], serverList('ValueTypes'))
  assert.deepEqual([...ALWAYS_VALUES], serverList('AlwaysValues'))
  assert.deepEqual([...TIME_SCOPES], serverList('TimeScopes'))

  const sources = Object.fromEntries(
    [...schema.matchAll(/\["(\w+)"\] = \[([^\]]*)\]/g)].map((match) => [
      match[1],
      quoted(match[2]),
    ]),
  )
  assert.deepEqual(
    Object.fromEntries(Object.entries(SOURCE_FIELDS).map(([key, fields]) => [key, [...fields]])),
    sources,
  )
  const types = Object.fromEntries(
    [...schema.matchAll(/\["(\w+\.\w+)"\] = "(\w+)"/g)].map((match) => [match[1], match[2]]),
  )
  assert.deepEqual(FIELD_TYPES, types)

  assert.equal(MAX_DEPTH, serverNumber('MaxDepth'))
  assert.equal(MAX_NODES, serverNumber('MaxNodes'))
  assert.equal(MAX_WHERE_CLAUSES, serverNumber('MaxWhereClauses'))
  assert.equal(MAX_CONDITION_LENGTH, serverNumber('MaxConditionBytes'))
})

/** One edit the builder can make to a block, at that block's path. */
function editAt(tree: Json, path: Path): { tree: Json; key: string } | null {
  const node = getAt(tree, path) as JsonObject
  switch (classifyNode(node)) {
    case 'all':
    case 'any':
      return {
        tree: setAt(tree, [...path, 'kind'], node.kind === 'all' ? 'any' : 'all'),
        key: 'kind',
      }
    case 'compare':
      return { tree: setAt(tree, [...path, 'op'], node.op === 'eq' ? 'ne' : 'eq'), key: 'op' }
    case 'related':
      return {
        tree: setAt(tree, [...path, 'relation'], `${String(node.relation)}x`),
        key: 'relation',
      }
    case 'exists': {
      const query = node.query as JsonObject
      const where = [...(query.where as Json[]), newClause(query.from as 'subjects')]
      return { tree: setAt(tree, [...path, 'query', 'where'], where), key: 'query' }
    }
    default:
      return null
  }
}

test('an edit to one block of every fixture rule keeps every other key', () => {
  let edited = 0
  for (const file of readdirSync(fixtures).filter((name) => name.endsWith('.json'))) {
    const fixture = JSON.parse(readFileSync(join(fixtures, file), 'utf8')) as {
      rules: { id: string; condition: Json }[]
    }
    for (const rule of fixture.rules) {
      const original = structuredClone(rule.condition)
      const target = blockPaths(original)
        .reverse()
        .find((path) => editAt(original, path) !== null)
      if (!target) {
        // Nothing editable: the root can still be put in a group, and stays whole inside it.
        assert.equal(
          JSON.stringify(getAt(wrap(original), ['of', 0])),
          JSON.stringify(rule.condition),
        )
        continue
      }
      const { tree, key } = editAt(original, target)!
      edited += 1
      assert.ok(sameCondition(setAt(tree, target, null), setAt(original, target, null)), rule.id)
      const before = getAt(original, target) as JsonObject
      const after = getAt(tree, target) as JsonObject
      assert.deepEqual(Object.keys(after), Object.keys(before), rule.id)
      for (const each of Object.keys(before).filter((name) => name !== key)) {
        assert.deepEqual(after[each], before[each], `${rule.id} ${each}`)
      }
      // The original tree is never written to.
      assert.deepEqual(original, rule.condition, rule.id)
    }
  }
  assert.ok(edited > 20, `edited ${edited} rules`)
})

const within: JsonObject = {
  kind: 'within',
  point: { field: 'at', from: 'events', of: { subject: 'self' } },
  from: { literal: 'year:1', type: 'timePoint' },
  to: { literal: 'year:9', type: 'timePoint' },
}
const ruleHolds: JsonObject = { kind: 'ruleHolds', ruleId: '5b9c4f2e-7c1d-4e44-9a51-0b6a3b0f6a10' }
const always: JsonObject = { kind: 'always', value: 'unknown' }
const compare = (op = 'eq'): JsonObject => ({
  kind: 'compare',
  left: { attribute: 'mood', of: { subject: 'self' } },
  op,
  right: { literal: 'calm', type: 'text' },
})

test('within, ruleHolds and always stay byte-equal after a sibling edit', () => {
  const tree: Json = { kind: 'all', of: [within, ruleHolds, always, compare()] }
  for (const path of [
    ['of', 0],
    ['of', 1],
    ['of', 2],
  ] as Path[]) {
    assert.equal(classifyNode(getAt(tree, path)), 'readonly')
  }
  const after = setAt(tree, ['of', 3, 'op'], 'ne')
  assert.equal(JSON.stringify(getAt(after, ['of', 0])), JSON.stringify(within))
  assert.equal(JSON.stringify(getAt(after, ['of', 1])), JSON.stringify(ruleHolds))
  assert.equal(JSON.stringify(getAt(after, ['of', 2])), JSON.stringify(always))
  assert.equal(getAt(after, ['of', 3, 'op']), 'ne')

  const removed = removeAt(after, ['of', 3])
  assert.equal(
    JSON.stringify(removed),
    JSON.stringify({ kind: 'all', of: [within, ruleHolds, always] }),
  )
})

test('unknown keys survive an edit', () => {
  const tree: Json = {
    kind: 'all',
    note: 'kept',
    of: [
      {
        ...compare(),
        comment: { by: 'mcp' },
        left: { attribute: 'mood', of: { subject: 'self' }, extra: 1 },
      },
    ],
  }
  const after = setAt(tree, ['of', 0, 'op'], 'ne') as JsonObject
  assert.equal(after.note, 'kept')
  assert.deepEqual(getAt(after, ['of', 0, 'comment']), { by: 'mcp' })
  assert.equal(getAt(after, ['of', 0, 'left', 'extra']), 1)

  const clause = withField(
    { field: 'type', op: 'eq', value: 'x', type: 'text', why: 'kept' },
    'events',
    'canon',
  )
  assert.deepEqual(clause, { field: 'canon', op: 'eq', why: 'kept', value: true, type: 'boolean' })
})

function nots(count: number): Json {
  let node: Json = { kind: 'always', value: 'true' }
  for (let at = 0; at < count; at += 1) node = { kind: 'not', of: node }
  return node
}

test('measure counts depth, nodes, clauses and size the way the server does', () => {
  // Fifteen nots put the always at depth 16; sixteen put it at 17.
  assert.equal(measure(nots(15)).problem, null)
  assert.equal(measure(nots(15)).depth, 16)
  assert.deepEqual(measure(nots(16)).problem, {
    key: 'limits.depth',
    path: Array.from({ length: 16 }, () => 'of'),
  })
  // An operand is one deeper than its comparison, and its `of` one deeper again.
  const deepCompare = setAt(
    nots(14),
    Array.from({ length: 14 }, () => 'of'),
    compare(),
  )
  assert.equal(measure(deepCompare).problem?.key, 'limits.depth')
  assert.deepEqual(measure(deepCompare).problem?.path, [
    ...Array.from({ length: 14 }, () => 'of'),
    'left',
    'of',
  ])

  const group = (children: number): Json => ({
    kind: 'any',
    of: Array.from({ length: children }, () => ({ kind: 'always', value: 'false' })),
  })
  assert.equal(measure(group(MAX_NODES - 1)).nodes, MAX_NODES)
  assert.equal(measure(group(MAX_NODES - 1)).problem, null)
  assert.deepEqual(measure(group(MAX_NODES)).problem, {
    key: 'limits.nodes',
    path: ['of', MAX_NODES - 1],
  })

  const search = (clauses: number): Json => ({
    kind: 'exists',
    query: {
      from: 'subjects',
      where: Array.from({ length: clauses }, () => ({
        field: 'type',
        op: 'eq',
        value: 'Character',
        type: 'text',
      })),
    },
  })
  assert.equal(measure(search(MAX_WHERE_CLAUSES)).problem, null)
  assert.deepEqual(measure(search(MAX_WHERE_CLAUSES + 1)).problem, {
    key: 'limits.where',
    path: ['query'],
  })

  const sized = (length: number): Json => {
    const base = JSON.stringify(setAt(compare(), ['right', 'literal'], '')).length
    return setAt(compare(), ['right', 'literal'], 'x'.repeat(length - base))
  }
  assert.equal(JSON.stringify(sized(MAX_CONDITION_LENGTH)).length, MAX_CONDITION_LENGTH)
  assert.equal(measure(sized(MAX_CONDITION_LENGTH)).problem, null)
  assert.deepEqual(measure(sized(MAX_CONDITION_LENGTH + 1)).problem, {
    key: 'limits.size',
    path: [],
  })
})

test('a refusal path finds the block it names', () => {
  assert.deepEqual(pathOf('condition.of[1].left.of'), ['of', 1, 'left', 'of'])
  assert.deepEqual(pathOf('condition'), [])
  assert.deepEqual(pathOf('condition.query.where[2]'), ['query', 'where', 2])
  assert.equal(pathOf('exceptions[0].when'), null)
  assert.equal(pathOf('exceptions[0].when.of[1]'), null)
  assert.equal(pathOf('condition.of[x]'), null)
  assert.equal(pathOf('conditions.of[0]'), null)

  const tree: Json = { kind: 'all', of: [always, { kind: 'not', of: compare() }, within] }
  const blocks = blockPaths(tree)
  assert.deepEqual(blocks, [[], ['of', 0], ['of', 1], ['of', 1, 'of'], ['of', 2]])
  assert.deepEqual(blockFor(pathOf('condition.of[1].of.left.of')!, blocks), ['of', 1, 'of'])
  // Inside a read-only block the block itself is the nearest one drawn.
  assert.deepEqual(blockFor(pathOf('condition.of[2].point.of')!, blocks), ['of', 2])
  assert.deepEqual(blockFor(pathOf('condition')!, blocks), [])
})

test('a part the builder cannot edit is kept, and a node it cannot read is read-only', () => {
  const named = { subject: '5b9c4f2e-7c1d-4e44-9a51-0b6a3b0f6a10' }
  assert.equal(classifyOperand(named), 'kept')
  assert.equal(classifyNode({ ...compare(), right: named }), 'compare')
  assert.equal(classifyOperand({ field: 'at', from: 'events', of: { subject: 'self' } }), 'kept')
  assert.equal(classifyOperand({ attribute: 'mood', of: named }), 'kept')
  assert.equal(classifyOperand({ literal: named.subject, type: 'reference' }), 'kept')
  assert.equal(classifyOperand({ subject: 'self' }), 'self')
  assert.equal(classifyOperand({ mystery: true }), null)
  assert.equal(classifyNode({ ...compare(), op: 'between' }), 'readonly')
  assert.equal(classifyNode({ ...compare(), left: { mystery: true } }), 'readonly')
  assert.equal(
    classifyNode({
      kind: 'exists',
      query: {
        from: 'subjects',
        where: [{ field: 'attributes.mood', op: 'eq', value: 'x', type: 'text' }],
      },
    }),
    'readonly',
  )
  assert.equal(classifyNode({ kind: 'teleport' }), 'readonly')
})

test('only an event’s subjects take includes, and they take nothing else', () => {
  assert.deepEqual(clauseOperators('events', 'subjectIds'), ['contains'])
  for (const [source, fields] of Object.entries(SOURCE_FIELDS)) {
    for (const field of fields) {
      if (field === 'subjectIds') continue
      assert.ok(
        !clauseOperators(source as 'events', field).includes('contains'),
        `${source}.${field}`,
      )
    }
  }
  // Orderings are offered for a time, and hidden beside a yes or no, or text.
  assert.deepEqual(clauseOperators('events', 'at'), [...COMPARE_OPERATORS])
  assert.deepEqual(compareOperators(compare().left, compare().right), ['eq', 'ne'])
  assert.deepEqual(compareOperators({ subject: 'self' }, { literal: 1, type: 'number' }), [
    ...COMPARE_OPERATORS,
  ])
})

test('the defaults are unfinished until filled in', () => {
  assert.deepEqual(
    checkComplete(newGuard()).map((problem) => problem.key),
    ['required.attribute'],
  )
  assert.deepEqual(
    checkComplete(newNode('related')).map((problem) => problem.key),
    ['required.relation', 'required.attribute'],
  )
  assert.deepEqual(checkComplete({ kind: 'all', of: [] }), [{ key: 'required.group', path: [] }])
  const literal = (value: Json, type: string): Json =>
    setAt(compare(), ['right'], { literal: value, type })
  assert.deepEqual(checkComplete(literal('', 'number')), [
    { key: 'required.number', path: ['right'] },
  ])
  assert.deepEqual(checkComplete(literal('1.', 'number')), [
    { key: 'required.number', path: ['right'] },
  ])
  assert.deepEqual(checkComplete(literal(1.5, 'number')), [])
  assert.deepEqual(checkComplete(literal('calendar:', 'timePoint')), [
    { key: 'required.timePoint', path: ['right'] },
  ])
  assert.deepEqual(checkComplete(literal('', 'text')), [])
  assert.deepEqual(checkComplete(compare()), [])
})

test('a read-only block says what it is', () => {
  const titleOf = (id: string) => (id === ruleHolds.ruleId ? 'Calm enough' : undefined)
  assert.deepEqual(summarize(within, titleOf), { key: 'summaries.within' })
  assert.deepEqual(summarize(ruleHolds, titleOf), {
    key: 'summaries.ruleHolds',
    params: { title: 'Calm enough' },
  })
  assert.deepEqual(summarize({ ...ruleHolds, ruleId: 'elsewhere' }, titleOf), {
    key: 'summaries.ruleHoldsUnknown',
  })
  assert.deepEqual(summarize({ kind: 'always', value: 'true' }, titleOf), {
    key: 'summaries.alwaysTrue',
  })
  assert.deepEqual(summarize({ kind: 'always', value: 'false' }, titleOf), {
    key: 'summaries.alwaysFalse',
  })
  assert.deepEqual(summarize(always, titleOf), { key: 'summaries.alwaysUnknown' })
  assert.deepEqual(summarize({ ...compare(), op: 'between' }, titleOf), { key: 'summaries.other' })
})

test('an untouched update sends exceptions and dependencies back as they were read', () => {
  const exceptions = [
    {
      id: 'festival',
      scope: { kind: 'universe' },
      when: { kind: 'always', value: 'true' },
      note: 1.0,
    },
  ]
  const detail: SystemRuleDetail = {
    id: 'rule',
    title: 'Calm enough',
    description: 'Written over MCP.',
    scope: 'Project',
    projectId: 'project',
    schemaVersion: 1,
    condition: { kind: 'all', of: [ruleHolds, compare()] },
    dependsOn: [String(ruleHolds.ruleId)],
    systems: [],
    version: 7,
    createdAt: '',
    updatedAt: '',
    exceptions,
  }
  const request = toUpdateRequest(detail, detail.title, detail.condition as Json)
  assert.deepEqual(request, {
    title: 'Calm enough',
    description: 'Written over MCP.',
    projectId: 'project',
    schemaVersion: 1,
    condition: detail.condition,
    dependsOn: [ruleHolds.ruleId],
    exceptions,
    expectedVersion: 7,
  })
  assert.equal(JSON.stringify(request.exceptions), JSON.stringify(exceptions))
  assert.equal(
    toUpdateRequest({ ...detail, exceptions: null, schemaVersion: null }, 'x', null).schemaVersion,
    1,
  )
  assert.equal(toUpdateRequest({ ...detail, exceptions: undefined }, 'x', null).exceptions, null)
})

test('two conditions that differ only in key order are the same', () => {
  assert.ok(
    sameCondition(
      { kind: 'compare', op: 'eq', left: 1, right: 2 },
      { right: 2, left: 1, op: 'eq', kind: 'compare' },
    ),
  )
  assert.ok(!sameCondition(compare('eq'), compare('ne')))
  assert.ok(isObject(newGuard()))
})
