import { SOURCE_FIELDS, type Source } from './conditionSchema.ts'

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

export function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export const has = (value: JsonObject, key: string) =>
  Object.prototype.hasOwnProperty.call(value, key)

export const inList = (list: readonly string[], value: unknown): value is string =>
  typeof value === 'string' && list.includes(value)

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

/** A time point is `scope:value`. */
export function scopeOf(point: string) {
  const at = point.indexOf(':')
  return at > 0 ? point.slice(0, at) : ''
}

export function pointValueOf(point: string) {
  const at = point.indexOf(':')
  return at >= 0 ? point.slice(at + 1) : point
}
