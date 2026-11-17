/**
 * The closed sets and the save-time limits of a version 1 condition, copied from
 * `src/LorEvolve.Api/Features/Systems/ConditionSchema.cs:25-94`. The server stays the authority: this copy only lets the
 * guard builder offer nothing it would refuse. `guardBuilder.test.ts` reads that file and fails when the two drift.
 */
export const SCHEMA_VERSION = 1

export const MAX_DEPTH = 16
export const MAX_NODES = 256
export const MAX_WHERE_CLAUSES = 8
/** The server counts the condition's raw text in UTF-16 units, which is what `string.length` counts too. */
export const MAX_CONDITION_LENGTH = 32_768

export const NODE_KINDS = [
  'all',
  'any',
  'not',
  'compare',
  'exists',
  'related',
  'within',
  'ruleHolds',
  'always',
] as const

export const COMPARE_OPERATORS = ['eq', 'ne', 'lt', 'lte', 'gt', 'gte'] as const

export const CLAUSE_OPERATORS = ['eq', 'ne', 'lt', 'lte', 'gt', 'gte', 'contains'] as const

export const VALUE_TYPES = ['boolean', 'number', 'text', 'timePoint', 'reference'] as const

export const ALWAYS_VALUES = ['true', 'false', 'unknown'] as const

export const SOURCE_FIELDS = {
  subjects: ['id', 'type'],
  relations: ['type', 'fromId', 'toId'],
  events: ['id', 'kind', 'method', 'subjectIds', 'at', 'canon'],
} as const

export type ValueType = (typeof VALUE_TYPES)[number]
export type Source = keyof typeof SOURCE_FIELDS
export type CompareOperator = (typeof COMPARE_OPERATORS)[number]
export type ClauseOperator = (typeof CLAUSE_OPERATORS)[number]

export const FIELD_TYPES: Record<string, ValueType> = {
  'subjects.id': 'reference',
  'subjects.type': 'text',
  'relations.type': 'text',
  'relations.fromId': 'reference',
  'relations.toId': 'reference',
  'events.id': 'reference',
  'events.kind': 'text',
  'events.method': 'text',
  'events.subjectIds': 'reference',
  'events.at': 'timePoint',
  'events.canon': 'boolean',
}

export const TIME_SCOPES = ['calendar', 'era', 'year'] as const

/** The codes a refused save can carry (`ConditionSchema.Validate`), each with its own words in the builder. */
export const CONDITION_CODES = [
  'schema_version_unsupported',
  'node_limit',
  'depth_limit',
  'invalid_reference',
  'node_arity',
  'unknown_node_kind',
  'unknown_operator',
  'unknown_field',
  'unknown_source',
  'type_mismatch',
  'operator_not_applicable',
] as const
