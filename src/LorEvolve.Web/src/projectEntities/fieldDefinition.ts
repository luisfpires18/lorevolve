import type { Chronology } from '../chronology/types'
import type { FieldDefinition } from '../lore/typeDefinitions'
import { FieldKind, type FieldKindValue, type ProjectField, type ProjectTypeInput } from './types'

/** A project has no date periods: an empty chronology, so a number never offers an era. */
export const NO_ERAS: Chronology = {
  eras: [],
  unplacedMomentCount: 0,
  unplacedYearCount: 0,
  calendar: null,
}

/** The kinds a project field can be, in the enum's order: every one but a link to a Lore entry. */
export const PROJECT_FIELD_KINDS: FieldKindValue[] = Object.values(FieldKind).filter(
  (kind) => kind !== FieldKind.EntityReference,
)

/**
 * A project field as the `FieldDefinition` Lore's `FieldInput` draws: no default, meaning or
 * target, never archived. Only what the form reads is real; the counts and version are unused.
 */
export function asFieldDefinition(field: ProjectField): FieldDefinition {
  return {
    id: field.id,
    name: field.name,
    kind: field.kind,
    isRequired: field.isRequired,
    displayOrder: field.displayOrder,
    defaultValue: null,
    options: field.options,
    semantic: null,
    targetEntityTypeId: null,
    targetGroupId: null,
    archivedAt: null,
    entryCount: 0,
    trashedEntryCount: 0,
    usedInHistory: false,
    version: 0,
    sectionId: null,
    imageShape: field.imageShape,
  }
}

/**
 * A project type or a template as the type drawer saves it. The route replaces the whole type: what the drawer does not
 * edit (description, colour) goes back as it is stored, or empty for a new one.
 */
export function typeInput(
  values: { name: string; icon: string | null; parentId: string | null },
  stored: { description: string | null; accentColor: string | null } | null,
): ProjectTypeInput {
  return {
    name: values.name,
    description: stored ? stored.description : null,
    icon: values.icon,
    accentColor: stored ? stored.accentColor : null,
    parentId: values.parentId,
  }
}
