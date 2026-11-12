import type { EntityType } from './types'

/**
 * The types above `type`, root first: whose fields it inherits (ADR 0007 amendment, 2026-11-12). A parent missing from the
 * list, or a loop in older data, ends the walk.
 */
export function ancestorsOf(type: EntityType, types: readonly EntityType[]): EntityType[] {
  const byId = new Map(types.map((each) => [each.id, each]))
  const above: EntityType[] = []
  const seen = new Set([type.id])
  let parent = type.parentId ? byId.get(type.parentId) : undefined
  while (parent && !seen.has(parent.id)) {
    seen.add(parent.id)
    above.unshift(parent)
    parent = parent.parentId ? byId.get(parent.parentId) : undefined
  }
  return above
}

/**
 * The type as an entry of it is edited, shown and filtered: every field it inherits from the types above it, root first,
 * then its own, each type's fields in its own order; and those types' sections before its own, so an inherited field keeps
 * the section its type gives it. A type with nothing above it comes back as it is. Never sent back: the Types screen edits
 * each type's own fields only.
 */
export function withInheritedFields(type: EntityType, types: readonly EntityType[]): EntityType {
  const above = ancestorsOf(type, types)
  if (above.length === 0) return type
  const chain = [...above, type]
  const byOrder = <T extends { displayOrder: number }>(items: readonly T[]) =>
    [...items].sort((a, b) => a.displayOrder - b.displayOrder)
  const fields = chain
    .flatMap((owner) => byOrder(owner.fields))
    .map((field, index) => ({ ...field, displayOrder: index }))
  const fieldSections = chain
    .flatMap((owner) => byOrder(owner.fieldSections ?? []))
    .map((section, index) => ({ ...section, displayOrder: index + 1 }))
  return { ...type, fields, fieldSections }
}
