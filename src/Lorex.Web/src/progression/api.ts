import { apiFetch } from '../lib/api'
import type {
  Ability,
  AbilityInput,
  Era,
  EraInput,
  Form,
  FormInput,
  Progression,
  ProgressionInput,
  ProgressionRevisionDetail,
  ProgressionRevisionSummary,
} from './types'

/** The 409 a save or restore gets when the eras were saved somewhere else after they were read here. */
export const PROGRESSION_CHANGED = 'entity_progression_changed'

/** The 409 for removing an era that still holds a value in an archived field. */
export const ERA_ARCHIVED_VALUES = 'entity_era_archived_values'

/** The 409 for a version that can no longer be put back exactly as it was saved. */
export const REVISION_UNRESTORABLE = 'entity_progression_revision_unrestorable'

function progression(universeId: string, entityId: string) {
  return `/api/universes/${universeId}/entities/${entityId}/progression`
}

export function getProgression(universeId: string, entityId: string, signal?: AbortSignal) {
  return apiFetch<Progression>(progression(universeId, entityId), { signal })
}

export function saveProgression(universeId: string, entityId: string, input: ProgressionInput) {
  return apiFetch<Progression>(progression(universeId, entityId), {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function listProgressionRevisions(
  universeId: string,
  entityId: string,
  signal?: AbortSignal,
) {
  return apiFetch<ProgressionRevisionSummary[]>(`${progression(universeId, entityId)}/revisions`, {
    signal,
  })
}

export function getProgressionRevision(universeId: string, entityId: string, revisionId: string) {
  return apiFetch<ProgressionRevisionDetail>(
    `${progression(universeId, entityId)}/revisions/${revisionId}`,
  )
}

export function restoreProgressionRevision(
  universeId: string,
  entityId: string,
  revisionId: string,
  expectedVersion: number,
) {
  return apiFetch<Progression>(
    `${progression(universeId, entityId)}/revisions/${revisionId}/restore`,
    {
      method: 'POST',
      body: JSON.stringify({ expectedVersion }),
    },
  )
}

/** An era as read, sent back unchanged: what a save does with every era it did not touch. */
export function eraInputOf(era: Era): EraInput {
  return {
    id: era.id,
    name: era.name,
    description: era.description,
    start: era.start,
    end: era.end,
    storyIds: era.stories.map((story) => story.id),
    sceneIds: era.scenes.map((scene) => scene.id),
    fields: era.fields.map((field) => ({
      fieldDefinitionId: field.fieldDefinitionId,
      cleared: field.cleared,
      text: field.text,
      number: field.number,
      boolean: field.boolean,
      date: field.date,
      optionIds: field.optionIds.length > 0 ? field.optionIds : null,
      referencedEntityId: field.referencedEntityId,
      eraId: field.eraId,
    })),
  }
}

/** A form as read, sent back as it is - or without the eras in `dropping` (an era being removed with the same save). */
export function formInputOf(form: Form, dropping: Set<string> = new Set()): FormInput {
  return {
    id: form.id,
    name: form.name,
    description: form.description,
    unlockEraId: form.unlock.era && !dropping.has(form.unlock.era.id) ? form.unlock.era.id : null,
    unlockSceneId: form.unlock.scene?.id ?? null,
    unlockMomentId: form.unlock.moment?.id ?? null,
    eraIds: form.eras.map((era) => era.id).filter((id) => !dropping.has(id)),
    sceneIds: form.scenes.map((scene) => scene.id),
  }
}

export function abilityInputOf(
  ability: Ability,
  dropping: Set<string> = new Set(),
  droppingForms: Set<string> = new Set(),
): AbilityInput {
  return {
    ...formInputOf(ability, dropping),
    formIds: ability.forms.map((form) => form.id).filter((id) => !droppingForms.has(id)),
  }
}
