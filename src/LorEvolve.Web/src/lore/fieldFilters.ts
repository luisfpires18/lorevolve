import { FieldKind, type EntityType, type FieldDefinition, type FieldKindValue } from './types'

/**
 * Lore's custom-field filters (refinement 034): one module for their grammar, their wording and what makes one valid,
 * so the page, the address and the API never parse them three ways.
 *
 * A filter travels as one `field` value, in the address and to the API alike: `<fieldId>:<op>:<value>`. It is split at
 * the first two colons only - the id is a GUID and the operator a fixed word, so neither holds one, and the value may
 * hold anything; `URLSearchParams` does the escaping. Several filters are several `field` values, in the order added,
 * and all of them must hold (AND). Options and linked entries are named by id, never by what they are called.
 *
 * Fields are the selected type's own - nothing is inherited - so a filter means nothing once the type changes. The API
 * checks every one again and refuses what it cannot resolve.
 */

export const MAX_FIELD_FILTERS = 10

/** The address and API key for a filter. */
export const FIELD_FILTER_PARAM = 'field'

export type FieldFilterOp = 'eq' | 'contains' | 'gt' | 'lt' | 'is' | 'isNot' | 'notContains'

export interface FieldFilter {
  fieldId: string
  op: FieldFilterOp
  /** Text or a number as typed, `true`/`false`, or an option's or entry's id. */
  value: string
}

/** What the value is chosen with. */
export type FieldValueControl = 'text' | 'number' | 'yesNo' | 'option' | 'entry'

interface FilterRule {
  control: FieldValueControl
  /** The comparisons offered, the first being the default, each in the words a filter reads in. */
  ops: { op: FieldFilterOp; label: string }[]
}

const TEXT: FilterRule = {
  control: 'text',
  ops: [
    { op: 'contains', label: 'contains' },
    { op: 'eq', label: 'is' },
  ],
}

/** Date is left out on purpose: what a date means waits on each universe's own calendar. */
const RULES: Partial<Record<FieldKindValue, FilterRule>> = {
  [FieldKind.ShortText]: TEXT,
  [FieldKind.LongText]: TEXT,
  [FieldKind.Number]: {
    control: 'number',
    ops: [
      { op: 'gt', label: 'is more than' },
      { op: 'lt', label: 'is less than' },
      { op: 'eq', label: 'is' },
    ],
  },
  [FieldKind.Boolean]: { control: 'yesNo', ops: [{ op: 'is', label: 'is' }] },
  [FieldKind.Select]: {
    control: 'option',
    ops: [
      { op: 'is', label: 'is' },
      { op: 'isNot', label: 'is not' },
    ],
  },
  [FieldKind.MultiSelect]: {
    control: 'option',
    ops: [
      { op: 'contains', label: 'includes' },
      { op: 'notContains', label: 'does not include' },
    ],
  },
  [FieldKind.EntityReference]: {
    control: 'entry',
    ops: [
      { op: 'is', label: 'is' },
      { op: 'isNot', label: 'is not' },
    ],
  },
}

export function filterRule(field: FieldDefinition): FilterRule | null {
  return RULES[field.kind] ?? null
}

/** The selected type's own fields that can be filtered on, in the type's order. */
export function filterableFields(type: EntityType): FieldDefinition[] {
  return [...type.fields]
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .filter((field) => filterRule(field) !== null)
}

export function encodeFieldFilter(filter: FieldFilter): string {
  return `${filter.fieldId}:${filter.op}:${filter.value}`
}

const OPS = new Set<string>(['eq', 'contains', 'gt', 'lt', 'is', 'isNot', 'notContains'])

/** A filter from its address form, or null when it is not one. Only the shape is checked here; `isValidFor` the rest. */
export function decodeFieldFilter(token: string): FieldFilter | null {
  const first = token.indexOf(':')
  const second = first < 0 ? -1 : token.indexOf(':', first + 1)
  if (second < 0) return null
  const op = token.slice(first + 1, second)
  if (!OPS.has(op)) return null
  return { fieldId: token.slice(0, first), op: op as FieldFilterOp, value: token.slice(second + 1) }
}

/** Every filter in the address, in order, malformed ones included as null so a caller can tell they were there. */
export function readFieldFilters(params: URLSearchParams): (FieldFilter | null)[] {
  return params.getAll(FIELD_FILTER_PARAM).map(decodeFieldFilter)
}

/** The address with exactly these filters, and back on the first page: a new set of filters is a new list. */
export function withFieldFilters(params: URLSearchParams, filters: FieldFilter[]): URLSearchParams {
  const next = new URLSearchParams(params)
  next.delete('page')
  next.delete(FIELD_FILTER_PARAM)
  for (const filter of filters) next.append(FIELD_FILTER_PARAM, encodeFieldFilter(filter))
  return next
}

const ENTRY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Whether a value is complete for this field: what Apply waits for, and what a stale address is checked against. */
export function isCompleteValue(field: FieldDefinition, value: string): boolean {
  switch (filterRule(field)?.control) {
    case 'text':
      return value.trim().length > 0
    case 'number':
      return value.trim() !== '' && Number.isFinite(Number(value))
    case 'yesNo':
      return value === 'true' || value === 'false'
    case 'option':
      return field.options.some((option) => option.id === value)
    case 'entry':
      return ENTRY_ID.test(value)
    default:
      return false
  }
}

/** Whether a filter still means something for this type: its field is the type's own, filterable that way, with a value it can take. */
export function isValidFor(filter: FieldFilter | null, type: EntityType): filter is FieldFilter {
  if (filter === null) return false
  const field = type.fields.find((candidate) => candidate.id === filter.fieldId)
  if (!field) return false
  const rule = filterRule(field)
  if (!rule || !rule.ops.some((entry) => entry.op === filter.op)) return false
  return isCompleteValue(field, filter.value)
}

export function opLabel(field: FieldDefinition, op: FieldFilterOp): string {
  return filterRule(field)?.ops.find((entry) => entry.op === op)?.label ?? op
}

/** A filter's value in words: Yes or No, an option's name, a linked entry's name and type, or the text as typed. */
export function valueLabel(
  field: FieldDefinition,
  value: string,
  entryName?: { name: string; typeName: string } | null,
): string {
  switch (filterRule(field)?.control) {
    case 'yesNo':
      return value === 'true' ? 'Yes' : 'No'
    case 'option':
      return field.options.find((option) => option.id === value)?.value ?? ''
    case 'entry':
      return entryName ? `${entryName.name} (${entryName.typeName})` : 'an entry'
    default:
      return value.trim()
  }
}
