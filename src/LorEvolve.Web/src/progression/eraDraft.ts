import type { ChronologyPointDraft } from '../components/ChronologyPointFields'
import type { EntityChoice } from '../components/EntityPicker'
import type { ChronologyValue } from '../chronology/types'
import { t } from '../i18n'
import { emptyValue } from '../lore/document'
import type { FieldValueInput } from '../lore/types'
import type { FieldDefinition } from '../lore/typeDefinitions'
import type { Era, EraFieldInput, EraScene, EraStory } from './types'
import { chronologyOf, EMPTY_POINT } from '../stories/sceneDraft'

export type Mode = 'inherit' | 'set' | 'cleared'

export interface FieldDraft {
  mode: Mode
  value: FieldValueInput
  /** The entry an existing override links to, named as it was read, so the picker shows it until it is changed. */
  held: EntityChoice | null
}

export interface EraDraft {
  name: string
  description: string
  start: ChronologyPointDraft
  end: ChronologyPointDraft
  stories: EraStory[]
  scenes: EraScene[]
  fields: Record<string, FieldDraft>
}

export function text(value: number | null | undefined) {
  return value === null || value === undefined ? '' : String(value)
}

export function pointDraft(value: ChronologyValue | null): ChronologyPointDraft {
  return value
    ? {
        eraId: value.eraId ?? '',
        year: text(value.year),
        month: value.monthId ?? text(value.month),
        day: text(value.day),
      }
    : EMPTY_POINT
}

export function draftOf(era: Era | null, definitions: FieldDefinition[]): EraDraft {
  const overrides = new Map((era?.fields ?? []).map((field) => [field.fieldDefinitionId, field]))

  return {
    name: era?.name ?? '',
    description: era?.description ?? '',
    start: pointDraft(era?.start ?? null),
    end: pointDraft(era?.end ?? null),
    stories: era?.stories ?? [],
    scenes: era?.scenes ?? [],
    fields: Object.fromEntries(
      definitions.map((definition) => {
        const override = overrides.get(definition.id)
        const value: FieldValueInput = override
          ? {
              fieldDefinitionId: definition.id,
              text: override.text,
              number: override.number,
              boolean: override.boolean,
              date: override.date,
              optionIds: override.optionIds,
              referencedEntityId: override.referencedEntityId,
              eraId: override.eraId,
            }
          : emptyValue(definition)
        return [
          definition.id,
          {
            mode: override ? (override.cleared ? 'cleared' : 'set') : 'inherit',
            value,
            held: override?.referencedEntityId
              ? {
                  id: override.referencedEntityId,
                  name: override.referencedEntityIsTrashed
                    ? t('time.eraForm.heldInTrash', {
                        name: override.referencedEntityName ?? t('time.eraForm.unavailable'),
                      })
                    : (override.referencedEntityName ?? t('time.eraForm.unavailable')),
                }
              : null,
          },
        ]
      }),
    ),
  }
}

export function inputOf(
  draft: EraDraft,
  id: string | null,
  reckonsInEras: boolean,
  custom: boolean,
) {
  const fields: EraFieldInput[] = Object.values(draft.fields)
    .filter((field) => field.mode !== 'inherit')
    .map((field) =>
      field.mode === 'cleared'
        ? {
            fieldDefinitionId: field.value.fieldDefinitionId,
            cleared: true,
            text: null,
            number: null,
            boolean: null,
            date: null,
            optionIds: null,
            referencedEntityId: null,
            eraId: null,
          }
        : { ...field.value, cleared: false },
    )

  return {
    id,
    name: draft.name.trim(),
    description: draft.description.trim() === '' ? null : draft.description.trim(),
    start: chronologyOf(draft.start, reckonsInEras, custom),
    end: chronologyOf(draft.end, reckonsInEras, custom),
    storyIds: draft.stories.map((story) => story.id),
    sceneIds: draft.scenes.map((scene) => scene.id),
    fields,
  }
}
