import type { FamilyRow } from './types'

/** The generations, top to bottom. Kept here, not imported, so `node --test` runs this file on its own. */
const ORDER: FamilyRow[] = ['grandparents', 'parents', 'siblings', 'children', 'grandchildren']

export interface LayoutInput {
  /** Each generation's members by id, in the reading's order: direct family first, then by name. */
  rows: Record<FamilyRow, string[]>
  focalId: string
  /** The focal entry's recorded family who hold no derived position: drawn in its row, beside it. */
  others: string[]
  links: { parentEntityId: string; childEntityId: string }[]
  connections: { relationshipId: string; entityId: string; relatedEntityId: string }[]
}

/** Two members drawn side by side and joined: co-parents of a drawn child, or recorded family in one generation. */
export interface FamilyCouple {
  left: string
  right: string
  /** Both are recorded parents of one drawn child, so their children hang from between them. */
  parents: boolean
  /** The recorded family links between them, which this join stands for. */
  relationshipIds: string[]
}

export interface FamilyLayout {
  /** Each generation as units left to right; a unit is one member or a couple (or a chain of them) kept together. */
  rows: Record<FamilyRow, string[][]>
  couples: FamilyCouple[]
}

/**
 * Where everyone stands. Couples come from structure, never from a kind's name (ADR 0040): two co-parents of a drawn
 * child, or two people in one generation joined by recorded family who are not already siblings by a shared parent.
 * The focal entry's unplaced relatives (a spouse with no parent links) count as its generation. Then each generation is
 * ordered under its parents and over its children - a down, up and down sweep of barycentres - so a child's stem stays
 * short, and the focal entry's unit stands in the middle of its siblings.
 */
export function arrangeFamily(input: LayoutInput): FamilyLayout {
  const rowOf = new Map<string, FamilyRow>()
  for (const row of ORDER) for (const id of input.rows[row]) rowOf.set(id, row)
  for (const id of [input.focalId, ...input.others]) rowOf.set(id, 'siblings')

  const parentsOf = new Map<string, Set<string>>()
  const childrenOf = new Map<string, Set<string>>()
  for (const link of input.links) {
    if (!rowOf.has(link.parentEntityId) || !rowOf.has(link.childEntityId)) continue
    add(parentsOf, link.childEntityId, link.parentEntityId)
    add(childrenOf, link.parentEntityId, link.childEntityId)
  }

  const pairs = new Map<string, { parents: boolean; relationshipIds: string[] }>()
  const pair = (a: string, b: string) => {
    const key = [a, b].sort().join('|')
    let found = pairs.get(key)
    if (!found) pairs.set(key, (found = { parents: false, relationshipIds: [] }))
    return found
  }

  for (const parents of parentsOf.values()) {
    const list = [...parents]
    for (let i = 0; i < list.length; i += 1)
      for (let j = i + 1; j < list.length; j += 1)
        if (rowOf.get(list[i]) === rowOf.get(list[j])) pair(list[i], list[j]).parents = true
  }

  for (const connection of input.connections) {
    const { entityId: a, relatedEntityId: b } = connection
    if (a === b || !rowOf.has(a) || !rowOf.has(b) || rowOf.get(a) !== rowOf.get(b)) continue
    // Siblings already share a stem, and a parent and child are never one generation apart for nothing.
    if (shares(parentsOf.get(a), parentsOf.get(b))) continue
    if (parentsOf.get(a)?.has(b) || parentsOf.get(b)?.has(a)) continue
    const found = pair(a, b)
    if (!found.relationshipIds.includes(connection.relationshipId))
      found.relationshipIds.push(connection.relationshipId)
  }

  // Each row's units: members joined by a pair, walked end to end when they form a simple line.
  const rows = {} as Record<FamilyRow, string[][]>
  for (const row of ORDER) {
    const initial =
      row === 'siblings'
        ? [...input.rows.siblings, input.focalId, ...input.others]
        : [...input.rows[row]]
    rows[row] = units(initial, pairs)
  }

  const sweep = (row: FamilyRow, reference: FamilyRow, relatives: Map<string, Set<string>>) => {
    const at = new Map(rows[reference].flat().map((id, index) => [id, index]))
    const key = (unit: string[]) => {
      const places = unit.flatMap((id) =>
        [...(relatives.get(id) ?? [])].filter((other) => at.has(other)),
      )
      return places.length === 0
        ? Number.POSITIVE_INFINITY
        : places.reduce((sum, other) => sum + at.get(other)!, 0) / places.length
    }
    const keyed = rows[row].map((unit, index) => ({ unit, index, key: key(unit) }))
    keyed.sort((first, second) => first.key - second.key || first.index - second.index)
    rows[row] = keyed.map((entry) => entry.unit)
  }

  for (let i = 1; i < ORDER.length; i += 1) sweep(ORDER[i], ORDER[i - 1], parentsOf)
  for (let i = ORDER.indexOf('siblings') - 1; i >= 0; i -= 1)
    sweep(ORDER[i], ORDER[i + 1], childrenOf)
  for (let i = 1; i < ORDER.length; i += 1) sweep(ORDER[i], ORDER[i - 1], parentsOf)

  centreFocal(rows, input.focalId, parentsOf)

  const couples: FamilyCouple[] = []
  for (const row of ORDER)
    for (const unit of rows[row])
      for (let i = 0; i + 1 < unit.length; i += 1) {
        const found = pairs.get([unit[i], unit[i + 1]].sort().join('|'))
        if (found) couples.push({ left: unit[i], right: unit[i + 1], ...found })
      }

  return { rows, couples }
}

/**
 * Members joined by pairs, kept together. A join is taken only while everyone keeps two neighbours at most and no
 * circle forms - co-parents first, then recorded family in the order it came - so every unit is a simple line, walked
 * from its first-listed end. A join left out (a third spouse, a star of uncles) sits apart and shows on hover only.
 */
function units(initial: string[], pairs: Map<string, unknown>): string[][] {
  const index = new Map(initial.map((id, place) => [id, place]))
  const near = new Map<string, string[]>()
  const root = new Map(initial.map((id) => [id, id]))
  const find = (id: string): string => (root.get(id) === id ? id : find(root.get(id)!))
  for (const key of pairs.keys()) {
    const [a, b] = key.split('|')
    if (!index.has(a) || !index.has(b)) continue
    if ((near.get(a)?.length ?? 0) >= 2 || (near.get(b)?.length ?? 0) >= 2) continue
    if (find(a) === find(b)) continue
    root.set(find(a), find(b))
    near.set(a, [...(near.get(a) ?? []), b])
    near.set(b, [...(near.get(b) ?? []), a])
  }

  const seen = new Set<string>()
  const result: string[][] = []
  for (const start of initial) {
    if (seen.has(start)) continue
    const line = initial.filter((id) => find(id) === find(start))
    const walk = [line.find((id) => (near.get(id)?.length ?? 0) <= 1)!]
    while (walk.length < line.length) {
      walk.push(near.get(walk[walk.length - 1])!.find((other) => !walk.includes(other))!)
    }
    for (const id of walk) seen.add(id)
    result.push(walk)
  }
  return result
}

/** The focal entry's unit in the middle of the siblings who share its parents, as the tree has always drawn it. */
function centreFocal(
  rows: Record<FamilyRow, string[][]>,
  focalId: string,
  parentsOf: Map<string, Set<string>>,
) {
  const row = rows.siblings
  const focal = row.findIndex((unit) => unit.includes(focalId))
  if (focal < 0) return
  const theirs = parentsOf.get(focalId)
  const sibling = (unit: string[]) =>
    unit !== row[focal] && unit.some((id) => shares(parentsOf.get(id), theirs))

  let first = focal
  while (first > 0 && sibling(row[first - 1])) first -= 1
  let last = focal
  while (last + 1 < row.length && sibling(row[last + 1])) last += 1

  const group = row.slice(first, last + 1).filter((unit) => unit !== row[focal])
  const half = Math.ceil(group.length / 2)
  row.splice(first, last - first + 1, ...group.slice(0, half), row[focal], ...group.slice(half))
}

function shares(a: Set<string> | undefined, b: Set<string> | undefined) {
  if (!a || !b) return false
  for (const id of a) if (b.has(id)) return true
  return false
}

function add(map: Map<string, Set<string>>, key: string, value: string) {
  let set = map.get(key)
  if (!set) map.set(key, (set = new Set()))
  set.add(value)
}
