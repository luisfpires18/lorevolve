import {
  COMPARE_OPERATORS,
  SOURCE_FIELDS,
  TIME_SCOPES,
  type ClauseOperator,
  type CompareOperator,
  type Source,
  type ValueType,
} from './conditionSchema.ts'
import {
  isObject,
  has,
  inList,
  type Json,
  type JsonObject,
  type BlockKind,
  type LiteralType,
  type NewOperandKind,
} from './guard.ts'
import { fieldType } from './guardClassify.ts'

const ORDERINGS: readonly string[] = ['lt', 'lte', 'gt', 'gte']

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
