import type { EntityArticle } from './article'
import { emptyValue, valuedFields } from './document'
import {
  CanonStatus,
  type CanonStatusValue,
  type EntityDetail,
  type FieldValueInput,
} from './types'
import type { EntityType } from './typeDefinitions'
import { FieldKind } from './fieldKinds'
import { t } from '../i18n'

export interface Draft {
  entityTypeId: string
  name: string
  summary: string
  canonStatus: CanonStatusValue
  aliases: string[]
  tags: string[]
  fields: Record<string, FieldValueInput>
}

/** What the entry form edits, as an entry or a suggestion holds it (task 045). */
export type EntryFields = Pick<
  EntityDetail,
  | 'entityTypeId'
  | 'entityTypeName'
  | 'name'
  | 'summary'
  | 'canonStatus'
  | 'aliases'
  | 'tags'
  | 'fields'
>

export function draftFromDetail(detail: EntryFields): Draft {
  const fields: Record<string, FieldValueInput> = {}
  for (const value of detail.fields) {
    fields[value.fieldDefinitionId] = {
      fieldDefinitionId: value.fieldDefinitionId,
      text: value.text,
      number: value.number,
      boolean: value.boolean,
      date: value.date,
      optionIds: value.optionIds,
      referencedEntityId: value.referencedEntityId,
      eraId: value.eraId,
    }
  }

  return {
    entityTypeId: detail.entityTypeId,
    name: detail.name,
    summary: detail.summary ?? '',
    canonStatus: detail.canonStatus,
    aliases: detail.aliases,
    tags: detail.tags,
    fields,
  }
}

/** The entry a new one is copied from, as read when the form opened, and its article if it has one (Issue #27). */
export interface CopySource {
  detail: EntityDetail
  article: EntityArticle | null
}

/**
 * A new entry's starting form when it is copied from another: the source's type, summary, tags and field values, named
 * as a copy and at the first Canon step. Its aliases and its links to other entries start out of it - the copy panel adds
 * them back on request - and nothing else of the source is read at all.
 */
export function copiedDraft(detail: EntityDetail, types: EntityType[]): Draft {
  const draft = draftFromDetail(detail)
  for (const value of detail.fields) {
    if (value.kind === FieldKind.EntityReference) delete draft.fields[value.fieldDefinitionId]
  }

  return {
    ...draft,
    entityTypeId: types.some((type) => type.id === detail.entityTypeId)
      ? detail.entityTypeId
      : types[0].id,
    name: t('entity.page.copyName', { name: detail.name }),
    canonStatus: CanonStatus.Idea,
    aliases: [],
  }
}

/** The source's links to other entries the copy may take: each link field that points at an entry still out of the Trash. */
export function copyableReferences(detail: EntityDetail) {
  return detail.fields.filter(
    (value) =>
      value.kind === FieldKind.EntityReference &&
      value.referencedEntityId !== null &&
      !value.referencedEntityIsTrashed,
  )
}

/**
 * A draft as the save would send it, as one string: every field its type defines, an untouched one as its empty
 * value. So a field typed into and cleared again compares equal to one never touched.
 */
export function comparable(draft: Draft, types: EntityType[]) {
  const definitions = types.find((type) => type.id === draft.entityTypeId)?.fields ?? []
  return JSON.stringify({
    ...draft,
    fields: valuedFields(definitions).map(
      (definition) => draft.fields[definition.id] ?? emptyValue(definition),
    ),
  })
}
