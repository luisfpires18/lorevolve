import type { EntityImageRef, FieldImageRef, FieldValue, FieldValueInput } from '../lore/types'
import type { FieldImageShapeValue } from '../lore/fieldKinds'

export type { FieldValue, FieldValueInput } from '../lore/types'

/**
 * A project's own schema and entries (#144).
 *
 * The field kinds are the lore's own, as numbers on the wire: the API sends an int and nothing in the client infers a
 * kind from a name.
 */
export const FieldKind = {
  ShortText: 0,
  LongText: 1,
  Number: 2,
  Boolean: 3,
  Date: 4,
  Select: 5,
  MultiSelect: 6,
  EntityReference: 7,
  Image: 8,
} as const

export type FieldKindValue = (typeof FieldKind)[keyof typeof FieldKind]

export type ProjectFieldOption = {
  id: string
  value: string
  displayOrder: number
}

export type ProjectField = {
  id: string
  name: string
  kind: FieldKindValue
  isRequired: boolean
  displayOrder: number
  options: ProjectFieldOption[]
  /** For an Image field: the frame its picture is cropped to. Null for every other kind. */
  imageShape: FieldImageShapeValue | null
}

export type ProjectEntityType = {
  id: string
  name: string
  description: string | null
  icon: string | null
  accentColor: string | null
  parentId: string | null
  displayOrder: number
  entryCount: number
  fields: ProjectField[]
  /** The fields this type has from the types above it, defined once on the parent and never copied down. */
  inheritedFields: ProjectField[]
}

export type ProjectTemplate = {
  name: string
  types: string[]
  alreadyApplied: boolean
}

export type ProjectTypeInput = {
  name: string
  description: string | null
  icon: string | null
  accentColor: string | null
  parentId: string | null
}

export type ProjectFieldInput = {
  name: string
  kind: FieldKindValue
  isRequired: boolean | null
  options: string[] | null
  /** Only for an Image field; left out for every other kind. */
  imageShape?: FieldImageShapeValue | null
}

export type ProjectEntityInput = {
  entityTypeId: string
  name: string
  summary: string | null
  canonEntityId: string | null
  fields: FieldValueInput[] | null
  expectedVersion: number | null
}

export type ProjectEntitySummary = {
  id: string
  name: string
  summary: string | null
  entityTypeId: string
  entityTypeName: string
  entityTypeIcon: string | null
  entityTypeAccentColor: string | null
  canonEntityId: string | null
  canonEntityName: string | null
  updatedAt: string
  /** The entry's own picture, as a Lore card shows it (#286). */
  image: EntityImageRef | null
}

/** One page of a project's entries and the total of every entry that matches the same filters (#557). */
export type ProjectEntityPage = { items: ProjectEntitySummary[]; totalCount: number }

export type ProjectEntityDetail = {
  id: string
  name: string
  summary: string | null
  entityTypeId: string
  entityTypeName: string
  entityTypeIcon: string | null
  entityTypeAccentColor: string | null
  createdAt: string
  updatedAt: string
  fields: FieldValue[]
  fieldImages: FieldImageRef[]
  /** The entry's own picture, through Lore's entry image routes (#286). */
  image: EntityImageRef | null
  version: number
  /** The lore entry this one is linked to (#287); an edit sends it back so the link is kept. */
  canonEntityId: string | null
}
