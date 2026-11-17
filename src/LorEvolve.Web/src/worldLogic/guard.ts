import {
  CLAUSE_OPERATORS,
  COMPARE_OPERATORS,
  FIELD_TYPES,
  MAX_CONDITION_LENGTH,
  MAX_DEPTH,
  MAX_NODES,
  MAX_WHERE_CLAUSES,
  SCHEMA_VERSION,
  SOURCE_FIELDS,
  TIME_SCOPES,
  type ClauseOperator,
  type CompareOperator,
  type Source,
  type ValueType,
} from './conditionSchema.ts'
import type { SystemRuleDetail, SystemRuleInput } from './types'

/**
 * The guard builder's tree logic (Issue #359). The builder edits the condition's JSON value itself and nothing else:
 * every edit is `setAt` along one path, which copies only the objects on that path and spreads each, so a key the
 * builder does not know survives, and a part it cannot edit (`within`, `ruleHolds`, `always`, a named entry) is never
 * rebuilt. Nothing here talks to the server; `conditionSchema.ts` holds the closed sets this offers from.
 */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
export type JsonObject = { [key: string]: Json }
/** Keys into the condition: object keys and array indexes, `[]` for the root. */
export type Path = (string | number)[]

/** Something that stops a save, at the block it belongs to. `key` is under `guardBuilder` in the i18n files. */
export interface Problem {
  key: string
  path: Path
  /** The server's own sentence, for a code the builder has no words for. */
  message?: string
}

export type NodeClass = 'all' | 'any' | 'not' | 'compare' | 'exists' | 'related' | 'readonly'
export type BlockKind = Exclude<NodeClass, 'readonly'>
export const BLOCK_KINDS: BlockKind[] = ['all', 'any', 'not', 'compare', 'exists', 'related']

/** `kept` is a part the schema knows and the builder cannot edit: shown as kept, untouched until replaced. */
export type OperandKind = 'literal' | 'attribute' | 'self' | 'count' | 'kept'
export type NewOperandKind = Exclude<OperandKind, 'kept'>
export const OPERAND_KINDS: NewOperandKind[] = ['literal', 'attribute', 'self', 'count']

/** The literal types a value can be written in here. A reference needs an entry picker, which is a follow-up. */
export const LITERAL_TYPES = ['boolean', 'number', 'text', 'timePoint'] as const
export type LiteralType = (typeof LITERAL_TYPES)[number]

export const SOURCES = Object.keys(SOURCE_FIELDS) as Source[]

const ORDERINGS: readonly string[] = ['lt', 'lte', 'gt', 'gte']

export function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const has = (value: JsonObject, key: string) => Object.prototype.hasOwnProperty.call(value, key)

const inList = (list: readonly string[], value: unknown): value is string =>
  typeof value === 'string' && list.includes(value)

const isSelf = (value: unknown) => isObject(value) && value.subject === 'self'

export function getAt(tree: Json, path: Path): Json | undefined {
  let at: Json | undefined = tree
  for (const key of path) {
    if (Array.isArray(at) && typeof key === 'number') at = at[key]
    else if (isObject(at) && typeof key === 'string') at = at[key]
    else return undefined
  }
  return at
}

/** The tree with `value` at `path`. Only the objects and arrays on the path are copied; every other key is kept. */
export function setAt(tree: Json, path: Path, value: Json): Json {
  if (path.length === 0) return value
  const [key, ...rest] = path
  if (Array.isArray(tree) && typeof key === 'number') {
    const next = [...tree]
    next[key] = setAt(tree[key] ?? null, rest, value)
    return next
  }
  if (isObject(tree) && typeof key === 'string') {
    return { ...tree, [key]: setAt(tree[key] ?? null, rest, value) }
  }
  throw new Error(`The condition has no ${String(key)} here.`)
}

/** The tree without the array item at `path`. */
export function removeAt(tree: Json, path: Path): Json {
  const index = path[path.length - 1]
  const list = getAt(tree, path.slice(0, -1))
  if (!Array.isArray(list) || typeof index !== 'number') {
    throw new Error('Only an item of a list can be removed.')
  }
  return setAt(
    tree,
    path.slice(0, -1),
    list.filter((_, at) => at !== index),
  )
}

/** Whether a value fits a literal type. A number may be a string while it is being typed; `checkComplete` flags it. */
function fits(value: Json | undefined, type: ValueType) {
  switch (type) {
    case 'boolean':
      return typeof value === 'boolean'
    case 'number':
      return typeof value === 'number' || typeof value === 'string'
    case 'text':
      return typeof value === 'string'
    case 'timePoint':
      return typeof value === 'string' && inList(TIME_SCOPES, scopeOf(value))
    default:
      return false
  }
}

/** A time point is `scope:value`. */
export function scopeOf(point: string) {
  const at = point.indexOf(':')
  return at > 0 ? point.slice(0, at) : ''
}

export function pointValueOf(point: string) {
  const at = point.indexOf(':')
  return at >= 0 ? point.slice(at + 1) : point
}

/** What an operand slot shows, or null when the operand is not one the schema describes. */
export function classifyOperand(operand: Json | undefined): OperandKind | null {
  if (!isObject(operand)) return null
  if (has(operand, 'literal')) {
    if (operand.type === 'reference') return 'kept'
    return inList(LITERAL_TYPES, operand.type) && fits(operand.literal, operand.type as ValueType)
      ? 'literal'
      : null
  }
  if (has(operand, 'attribute')) {
    if (typeof operand.attribute !== 'string' || !isObject(operand.of)) return null
    return isSelf(operand.of) ? 'attribute' : 'kept'
  }
  if (has(operand, 'field')) return isObject(operand.of) ? 'kept' : null
  if (has(operand, 'subject')) {
    if (typeof operand.subject !== 'string') return null
    return operand.subject === 'self' ? 'self' : 'kept'
  }
  if (has(operand, 'count')) {
    if (isEditableQuery(operand.count)) return 'count'
    return isObject(operand.count) ? 'kept' : null
  }
  return null
}

/** The value type a clause over this field compares, from the schema's own table. */
export function fieldType(from: Source, field: string): ValueType {
  return FIELD_TYPES[`${from}.${field}`] ?? 'text'
}

function isEditableClause(from: Source, clause: Json): boolean {
  if (!isObject(clause)) return false
  const { field, op } = clause
  if (!inList(SOURCE_FIELDS[from], field) || !inList(CLAUSE_OPERATORS, op)) return false
  if ((field === 'subjectIds') !== (op === 'contains')) return false
  const required = fieldType(from, field)
  if (required === 'reference') {
    return isSelf(clause.operandValue) && !has(clause, 'value')
  }
  return !has(clause, 'operandValue') && clause.type === required && fits(clause.value, required)
}

export function isEditableQuery(query: Json | undefined): boolean {
  if (!isObject(query) || !inList(SOURCES, query.from) || !Array.isArray(query.where)) return false
  const from = query.from as Source
  return query.where.every((clause) => isEditableClause(from, clause))
}

/**
 * Which block a node is drawn as. A node is editable only when every part of it is understood: a wrong operator, an
 * operand the schema does not describe or a clause the builder cannot write makes it read-only, and `within`,
 * `ruleHolds` and `always` always are.
 */
export function classifyNode(node: Json | undefined): NodeClass {
  if (!isObject(node)) return 'readonly'
  switch (node.kind) {
    case 'all':
    case 'any':
      return Array.isArray(node.of) ? node.kind : 'readonly'
    case 'not':
      return isObject(node.of) ? 'not' : 'readonly'
    case 'compare':
      return inList(COMPARE_OPERATORS, node.op) &&
        classifyOperand(node.left) !== null &&
        classifyOperand(node.right) !== null
        ? 'compare'
        : 'readonly'
    case 'exists':
      return isEditableQuery(node.query) ? 'exists' : 'readonly'
    case 'related':
      return typeof node.relation === 'string' &&
        classifyOperand(node.from) !== null &&
        classifyOperand(node.to) !== null
        ? 'related'
        : 'readonly'
    default:
      return 'readonly'
  }
}

/** The path of every block the builder draws: editable groups open, everything else is one block. */
export function blockPaths(node: Json, path: Path = []): Path[] {
  const kind = classifyNode(node)
  const paths: Path[] = [path]
  if ((kind === 'all' || kind === 'any') && isObject(node)) {
    ;(node.of as Json[]).forEach((child, index) =>
      paths.push(...blockPaths(child, [...path, 'of', index])),
    )
  } else if (kind === 'not' && isObject(node)) {
    paths.push(...blockPaths(node.of, [...path, 'of']))
  }
  return paths
}

/** A block's address in the tree, as its `data-path` and the key its problems are grouped by. */
export function pathKey(path: Path) {
  return path.length === 0 ? 'root' : path.join('.')
}

/** The drawn block nearest to a path: the longest block path it starts with. */
export function blockFor(path: Path, blocks: Path[]): Path {
  let best: Path = []
  for (const block of blocks) {
    if (
      block.length > best.length &&
      block.length <= path.length &&
      block.every((key, at) => path[at] === key)
    ) {
      best = block
    }
  }
  return best
}

/**
 * A refusal's dotted path (`condition.of[1].left.of`) as keys into the condition, or null when it is not under the
 * condition (an exception) or does not parse.
 */
export function pathOf(serverPath: string): Path | null {
  if (!/^condition(?=$|[.[])/.test(serverPath)) return null
  const rest = serverPath.slice('condition'.length)
  const step = /\.([A-Za-z_]\w*)|\[(\d+)\]/y
  const path: Path = []
  while (step.lastIndex < rest.length) {
    const match = step.exec(rest)
    if (!match) return null
    path.push(match[1] ?? Number(match[2]))
  }
  return path
}

export interface Measure {
  depth: number
  nodes: number
  problem: Problem | null
}

/**
 * The save-time limits, counted the way `ConditionSchema.Validate` counts them: the root is depth 1, a group's child,
 * an operand and an operand's `of` each go one deeper, and a query goes none deeper; operands and queries count as
 * nodes; a query holds at most eight clauses; the text is at most 32768 long. The first limit passed is the problem.
 */
export function measure(condition: Json): Measure {
  let nodes = 0
  let depth = 0
  let problem: Problem | null = null

  if (JSON.stringify(condition).length > MAX_CONDITION_LENGTH) {
    return { depth, nodes, problem: { key: 'limits.size', path: [] } }
  }

  function enter(path: Path, at: number) {
    depth = Math.max(depth, at)
    if (at > MAX_DEPTH) {
      problem = { key: 'limits.depth', path }
      return false
    }
    nodes += 1
    if (nodes > MAX_NODES) {
      problem = { key: 'limits.nodes', path }
      return false
    }
    return true
  }

  function node(value: Json | undefined, path: Path, at: number) {
    if (problem || value === undefined || !enter(path, at) || !isObject(value)) return
    switch (value.kind) {
      case 'all':
      case 'any':
        if (Array.isArray(value.of)) {
          value.of.forEach((child, index) => node(child, [...path, 'of', index], at + 1))
        }
        return
      case 'not':
        if (isObject(value.of)) node(value.of, [...path, 'of'], at + 1)
        return
      case 'compare':
        operand(value.left, [...path, 'left'], at + 1)
        operand(value.right, [...path, 'right'], at + 1)
        return
      case 'exists':
        query(value.query, [...path, 'query'], at)
        return
      case 'related':
        operand(value.from, [...path, 'from'], at + 1)
        operand(value.to, [...path, 'to'], at + 1)
        return
      case 'within':
        operand(value.point, [...path, 'point'], at + 1)
        operand(value.from, [...path, 'from'], at + 1)
        operand(value.to, [...path, 'to'], at + 1)
        return
    }
  }

  function operand(value: Json | undefined, path: Path, at: number) {
    if (problem || value === undefined || !enter(path, at) || !isObject(value)) return
    if (has(value, 'literal')) return
    if (has(value, 'attribute') || has(value, 'field')) {
      operand(value.of, [...path, 'of'], at + 1)
    } else if (has(value, 'count')) {
      query(value.count, [...path, 'count'], at)
    }
  }

  function query(value: Json | undefined, path: Path, at: number) {
    if (problem || value === undefined) return
    nodes += 1
    if (nodes > MAX_NODES) {
      problem = { key: 'limits.nodes', path }
      return
    }
    if (!isObject(value) || !Array.isArray(value.where)) return
    if (value.where.length > MAX_WHERE_CLAUSES) {
      problem = { key: 'limits.where', path }
      return
    }
    value.where.forEach((clause, index) => {
      if (isObject(clause) && has(clause, 'operandValue')) {
        operand(clause.operandValue, [...path, 'where', index, 'operandValue'], at + 1)
      }
    })
  }

  node(condition, [], 1)
  return { depth, nodes, problem }
}

/** What is left unfinished in the editable parts: each would be refused or could never hold. */
export function checkComplete(condition: Json): Problem[] {
  const problems: Problem[] = []

  function value(literal: Json | undefined, type: Json | undefined, path: Path) {
    if (type === 'number' && typeof literal !== 'number') {
      problems.push({ key: 'required.number', path })
    }
    if (
      type === 'timePoint' &&
      (typeof literal !== 'string' || pointValueOf(literal).trim() === '')
    ) {
      problems.push({ key: 'required.timePoint', path })
    }
  }

  function query(at: Json | undefined, path: Path) {
    if (!isObject(at) || !Array.isArray(at.where)) return
    at.where.forEach((clause, index) => {
      if (isObject(clause) && has(clause, 'value')) {
        value(clause.value, clause.type, [...path, 'where', index])
      }
    })
  }

  function operand(at: Json | undefined, path: Path) {
    const kind = classifyOperand(at)
    if (!isObject(at)) return
    if (kind === 'attribute' && String(at.attribute).trim() === '') {
      problems.push({ key: 'required.attribute', path })
    } else if (kind === 'literal') {
      value(at.literal, at.type, path)
    } else if (kind === 'count') {
      query(at.count, [...path, 'count'])
    }
  }

  function node(at: Json | undefined, path: Path) {
    const kind = classifyNode(at)
    if (!isObject(at)) return
    if (kind === 'all' || kind === 'any') {
      const children = at.of as Json[]
      if (children.length === 0) problems.push({ key: 'required.group', path })
      children.forEach((child, index) => node(child, [...path, 'of', index]))
    } else if (kind === 'not') {
      node(at.of, [...path, 'of'])
    } else if (kind === 'compare') {
      operand(at.left, [...path, 'left'])
      operand(at.right, [...path, 'right'])
    } else if (kind === 'exists') {
      query(at.query, [...path, 'query'])
    } else if (kind === 'related') {
      if (String(at.relation).trim() === '') problems.push({ key: 'required.relation', path })
      operand(at.from, [...path, 'from'])
      operand(at.to, [...path, 'to'])
    }
  }

  node(condition, [])
  return problems
}

/** A read-only block's one line: an i18n key under `guardBuilder` and its parameters. */
export function summarize(
  node: Json | undefined,
  titleOf: (ruleId: string) => string | undefined,
): { key: string; params?: Record<string, string> } {
  if (isObject(node)) {
    if (node.kind === 'within') return { key: 'summaries.within' }
    if (node.kind === 'ruleHolds') {
      const title = typeof node.ruleId === 'string' ? titleOf(node.ruleId) : undefined
      return title
        ? { key: 'summaries.ruleHolds', params: { title } }
        : { key: 'summaries.ruleHoldsUnknown' }
    }
    if (node.kind === 'always') {
      if (node.value === 'true') return { key: 'summaries.alwaysTrue' }
      if (node.value === 'false') return { key: 'summaries.alwaysFalse' }
      if (node.value === 'unknown') return { key: 'summaries.alwaysUnknown' }
    }
  }
  return { key: 'summaries.other' }
}

function canonical(value: Json | undefined): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

/** Whether two conditions say the same thing: key order is not meaning. */
export function sameCondition(a: Json | undefined, b: Json | undefined) {
  return canonical(a) === canonical(b)
}

function defaultValue(type: LiteralType): Json {
  if (type === 'boolean') return true
  if (type === 'timePoint') return `${TIME_SCOPES[0]}:`
  return ''
}

export function newLiteral(type: LiteralType): JsonObject {
  return { literal: defaultValue(type), type }
}

export function newOperand(kind: NewOperandKind): JsonObject {
  switch (kind) {
    case 'literal':
      return newLiteral('text')
    case 'attribute':
      return { attribute: '', of: { subject: 'self' } }
    case 'self':
      return { subject: 'self' }
    case 'count':
      return { count: newQuery('subjects') }
  }
}

export function newQuery(from: Source): JsonObject {
  return { from, where: [] }
}

/** A clause's value part for a field: a typed value, or this entry for a reference. */
function valuePart(type: ValueType): JsonObject {
  if (type === 'reference') return { operandValue: { subject: 'self' } }
  return { value: defaultValue(type as LiteralType), type }
}

/** A new clause starts on the source's first text field, the one most often meant. */
export function newClause(from: Source): JsonObject {
  const field =
    SOURCE_FIELDS[from].find((name) => fieldType(from, name) === 'text') ?? SOURCE_FIELDS[from][0]
  return withField({}, from, field)
}

/** The operators a clause over this field may use: membership for an event's subjects, orderings for a time. */
export function clauseOperators(from: Source, field: string): ClauseOperator[] {
  if (field === 'subjectIds') return ['contains']
  return fieldType(from, field) === 'timePoint' ? [...COMPARE_OPERATORS] : ['eq', 'ne']
}

/** The clause on another field: the value part is rebuilt for its type, every other key is kept. */
export function withField(clause: JsonObject, from: Source, field: string): JsonObject {
  const { value: _value, type: _type, operandValue: _operand, ...rest } = clause
  const operators = clauseOperators(from, field)
  const op = inList(operators, rest.op) ? rest.op : operators[0]
  return { ...rest, field, op, ...valuePart(fieldType(from, field)) }
}

const isPlain = (operand: Json | undefined) =>
  isObject(operand) &&
  has(operand, 'literal') &&
  (operand.type === 'boolean' || operand.type === 'text')

/** The orderings are hidden when a side is a yes or no, or text: neither is ordered. */
export function compareOperators(
  left: Json | undefined,
  right: Json | undefined,
): CompareOperator[] {
  return isPlain(left) || isPlain(right) ? ['eq', 'ne'] : [...COMPARE_OPERATORS]
}

/** A comparison whose operator no longer applies to its sides goes back to "is". */
export function fixOperator(node: JsonObject): JsonObject {
  return ORDERINGS.includes(String(node.op)) && compareOperators(node.left, node.right).length === 2
    ? { ...node, op: 'eq' }
    : node
}

export function newNode(kind: BlockKind): JsonObject {
  switch (kind) {
    case 'all':
    case 'any':
      return { kind, of: [newNode('compare')] }
    case 'not':
      return { kind, of: newNode('compare') }
    case 'compare':
      return { kind, left: newOperand('attribute'), op: 'eq', right: newOperand('literal') }
    case 'exists':
      return { kind, query: newQuery('subjects') }
    case 'related':
      return { kind, relation: '', from: newOperand('self'), to: newOperand('attribute') }
  }
}

/** A new guard: everything in one group, starting with one comparison. */
export function newGuard(): JsonObject {
  return newNode('all')
}

/** The root wrapped in a group, so blocks can be added beside it. */
export function wrap(node: Json): JsonObject {
  return { kind: 'all', of: [node] }
}

/**
 * The PUT for a loaded rule: the builder's title and condition, and everything else exactly as it was read. An update
 * is a whole-record save, so `exceptions` and `dependsOn` are sent back untouched; the builder never edits either.
 */
export function toUpdateRequest(
  detail: SystemRuleDetail,
  title: string,
  condition: Json,
): SystemRuleInput {
  return {
    title,
    description: detail.description,
    projectId: detail.projectId,
    schemaVersion: detail.schemaVersion ?? SCHEMA_VERSION,
    condition,
    dependsOn: detail.dependsOn,
    exceptions: detail.exceptions ?? null,
    expectedVersion: detail.version,
  }
}

/** The POST for a new guard: no description, no exceptions, no dependencies. */
export function toCreateRequest(
  title: string,
  condition: Json,
  projectId: string | null,
): SystemRuleInput {
  return { title, description: '', projectId, schemaVersion: SCHEMA_VERSION, condition }
}
