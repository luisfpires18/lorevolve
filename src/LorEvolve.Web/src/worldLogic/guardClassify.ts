import {
  CLAUSE_OPERATORS,
  COMPARE_OPERATORS,
  FIELD_TYPES,
  SOURCE_FIELDS,
  TIME_SCOPES,
  type Source,
  type ValueType,
} from './conditionSchema.ts'
import {
  isObject,
  has,
  inList,
  LITERAL_TYPES,
  scopeOf,
  SOURCES,
  type Json,
  type NodeClass,
  type OperandKind,
} from './guard.ts'

const isSelf = (value: unknown) => isObject(value) && value.subject === 'self'

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
