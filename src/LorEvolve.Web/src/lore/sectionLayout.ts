import type { EntityType } from './typeDefinitions'

/** A section as the drawer edits it: `key` is its id, or a stand-in until a new one is saved. */
export interface DraftSection {
  key: string
  id: string | null
  name: string
  startsCollapsed: boolean
}

/**
 * The type's layout as the drawer edits it. `placed` is every field, archived ones included, by the key of its section ('' for
 * none): an archived field is not shown here, but is sent where it is, so a restore after this save still finds its section.
 * `order` is every field's id in the type's order; a group's fields are the ones placed in it, in this order.
 */
export function layoutOf(type: EntityType) {
  const all = [...type.fields, ...(type.archivedFields ?? [])].sort(
    (a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name),
  )
  return {
    order: all.map((field) => field.id),
    sections: type.fieldSections.map((section): DraftSection => ({
      key: section.id,
      id: section.id,
      name: section.name,
      startsCollapsed: section.startsCollapsed,
    })),
    placed: Object.fromEntries(
      [...type.fields, ...(type.archivedFields ?? [])].map((field) => [
        field.id,
        field.sectionId ?? '',
      ]),
    ) as Record<string, string>,
  }
}
