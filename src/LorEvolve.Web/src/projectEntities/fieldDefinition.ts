import type { Chronology } from '../chronology/types'
import type { EntityDetail } from '../lore/types'
import type { EntityType, FieldDefinition } from '../lore/typeDefinitions'
// The .ts extension lets `node --test` load this file on its own (fieldDefinition.test.ts).
import {
  FieldKind,
  type FieldKindValue,
  type ProjectEntityDetail,
  type ProjectEntityType,
  type ProjectField,
  type ProjectTypeInput,
} from './types.ts'

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
 * A project type as the Lore entry page reads a type (#551): its fields in Lore's order, inherited first, numbered from
 * 0. No sections, archived fields, groups or Family Tree; every entry is listed and none is in the Trash.
 */
export function asEntryType(type: ProjectEntityType): EntityType {
  return {
    id: type.id,
    name: type.name,
    description: type.description,
    icon: type.icon,
    accentColor: type.accentColor,
    displayOrder: type.displayOrder,
    parentId: type.parentId,
    entityCount: type.entryCount,
    listedEntityCount: type.entryCount,
    trashedEntityCount: 0,
    fields: [...type.inheritedFields, ...type.fields].map((field, index) => ({
      ...asFieldDefinition(field),
      displayOrder: index,
    })),
    archivedFields: [],
    fieldSections: [],
    fieldLayoutVersion: 0,
    familyTreeEligible: false,
    familyTreeOffered: false,
  }
}

/** A project entry as the Lore entry page reads an entry: none of Lore's own parts, and its Lore link kept (#551). */
export function asEntryDetail(entry: ProjectEntityDetail): EntityDetail {
  return {
    ...entry,
    // Draft, never shown or sent: a project entry has no Canon status.
    canonStatus: 1,
    isArchived: false,
    aliases: [],
    tags: [],
    articleExcerpt: null,
    hasFamilyConnections: false,
    hasProgression: false,
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
