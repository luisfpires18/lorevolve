import type { FieldSection } from './types'

/** One section with the items it holds, in the order they were given. */
export interface SectionGroup<T> {
  section: FieldSection
  items: T[]
}

/**
 * Items - fields, or an entry's values - split by their field's section (Issue #26): the ungrouped ones first, in the order
 * given, then each section in its place with its own items. A section holding none is left out unless `keepEmpty`. An item
 * naming a section that is not there counts as ungrouped, so nothing is ever hidden by a stale layout.
 */
export function groupBySection<T>(
  items: T[],
  sectionOf: (item: T) => string | null | undefined,
  sections: FieldSection[],
  keepEmpty = false,
): { ungrouped: T[]; groups: SectionGroup<T>[] } {
  const held = new Map(sections.map((section) => [section.id, [] as T[]]))
  const ungrouped: T[] = []
  for (const item of items) {
    const id = sectionOf(item)
    ;(held.get(id ?? '') ?? ungrouped).push(item)
  }

  const groups = [...sections]
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((section) => ({ section, items: held.get(section.id)! }))
    .filter((group) => keepEmpty || group.items.length > 0)
  return { ungrouped, groups }
}
