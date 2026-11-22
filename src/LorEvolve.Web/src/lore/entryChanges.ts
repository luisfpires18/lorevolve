import type { Draft, EntryFields } from './entryDraft'
import { emptyValue } from './document'
import type { Chronology } from '../chronology/types'
import { differing, type Change } from '../lib/editConflict'
import { CANON_LABELS, type EntityDetail } from './types'
import type { EntityType } from './typeDefinitions'
import { renderFact } from './facts'
import { t } from '../i18n'

/**
 * The entry a link field held when the entry was read, named for the picker that shows it.
 *
 * An entry in the Trash is never offered by a search, so it is named as being there. Either way the stored id stays the
 * field's value until the author changes it, so saving any other field keeps the link.
 */
export function heldReference(detail: EntityDetail | null, fieldDefinitionId: string) {
  const held = detail?.fields.find((value) => value.fieldDefinitionId === fieldDefinitionId)

  if (!held?.referencedEntityId) {
    return null
  }

  const name = held.referencedEntityName ?? t('entity.page.held.unavailable')

  return {
    id: held.referencedEntityId,
    name: held.referencedEntityIsTrashed ? t('entity.page.held.inTrash', { name }) : name,
  }
}

/** One field as the reader sees it: the same words for the saved value and the author's unsaved one. */
export function factText(value: Parameters<typeof renderFact>[0], chronology: Chronology) {
  return String(renderFact({ ...value, optionValues: [...value.optionValues].sort() }, chronology))
}

/**
 * What differs between the latest saved entry and the form's unsaved changes, field by field, in the reader's words. A link
 * the author newly chose is named only if the page already knows the entry; the picker does not hand its name back.
 */
export function entryChanges(
  latest: EntryFields,
  draft: Draft,
  types: EntityType[],
  chronology: Chronology,
  opened: EntryFields | null,
): Change[] {
  const sorted = (values: string[]) => [...values].sort().join(', ')
  const rows: Change[] = [
    { label: t('entity.page.changes.name'), latest: latest.name, mine: draft.name.trim() },
    {
      label: t('entity.page.changes.type'),
      latest: latest.entityTypeName,
      mine:
        draft.entityTypeId === latest.entityTypeId
          ? latest.entityTypeName
          : (types.find((type) => type.id === draft.entityTypeId)?.name ?? ''),
    },
    {
      label: t('entity.page.changes.status'),
      latest: CANON_LABELS[latest.canonStatus],
      mine: CANON_LABELS[draft.canonStatus],
    },
    {
      label: t('entity.page.changes.summary'),
      latest: latest.summary ?? '',
      mine: draft.summary.trim(),
    },
    {
      label: t('entity.page.changes.aliases'),
      latest: sorted(latest.aliases),
      mine: sorted(draft.aliases),
    },
    { label: t('entity.page.changes.tags'), latest: sorted(latest.tags), mine: sorted(draft.tags) },
  ]

  const definitions = types.find((type) => type.id === draft.entityTypeId)?.fields ?? []
  for (const definition of definitions) {
    const saved = latest.fields.find((value) => value.fieldDefinitionId === definition.id)
    const mine = draft.fields[definition.id] ?? emptyValue(definition)
    const known = [
      saved,
      opened?.fields.find((value) => value.fieldDefinitionId === definition.id),
    ].find(
      (value) =>
        value?.referencedEntityId != null && value.referencedEntityId === mine.referencedEntityId,
    )

    rows.push({
      label: definition.name,
      latest: saved
        ? factText(saved, chronology)
        : factText({ ...emptyFact, kind: definition.kind }, chronology),
      mine: factText(
        {
          kind: definition.kind,
          text: mine.text,
          number: mine.number,
          eraId: mine.eraId,
          boolean: mine.boolean,
          date: mine.date,
          optionValues: (mine.optionIds ?? []).map(
            (id) => definition.options.find((option) => option.id === id)?.value ?? '',
          ),
          referencedEntityName:
            mine.referencedEntityId === null
              ? null
              : (known?.referencedEntityName ?? t('entity.page.changes.anotherEntry')),
          referencedEntityIsTrashed: known?.referencedEntityIsTrashed ?? false,
        },
        chronology,
      ),
    })
  }

  return differing(rows)
}

export const emptyFact = {
  text: null,
  number: null,
  eraId: null,
  boolean: null,
  date: null,
  optionValues: [],
  referencedEntityName: null,
  referencedEntityIsTrashed: false,
}
