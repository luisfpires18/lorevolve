import { t } from '../i18n'
import type {
  Ability,
  AbilityInput,
  Appearance,
  EraScene,
  Form,
  MomentRef,
  Progression,
} from './types'

export type Kind = 'form' | 'ability' | 'appearance'

export type Item = Form | Ability | Appearance

export function nameOf(item: Item) {
  return 'label' in item ? item.label : item.name
}

export function listOf(progression: Progression, kind: Kind): Item[] {
  return kind === 'form'
    ? progression.forms
    : kind === 'ability'
      ? progression.abilities
      : progression.appearances
}

export interface ItemDraft {
  name: string
  description: string
  unlockEraId: string
  unlockScene: EraScene[]
  unlockMoment: MomentRef | null
  eraIds: string[]
  scenes: EraScene[]
  formIds: string[]
}

export function draftOf(item: Item | null): ItemDraft {
  const unlock = item && 'unlock' in item ? item.unlock : null
  return {
    name: item ? nameOf(item) : '',
    description: (item && ('notes' in item ? item.notes : item.description)) ?? '',
    unlockEraId: unlock?.era?.id ?? '',
    unlockScene: unlock?.scene ? [unlock.scene] : [],
    unlockMoment: unlock?.moment ?? null,
    eraIds: item?.eras.map((era) => era.id) ?? [],
    scenes: item?.scenes ?? [],
    formIds: item && 'forms' in item ? item.forms.map((form) => form.id) : [],
  }
}

export function inputOf(draft: ItemDraft, id: string | null): AbilityInput {
  return {
    id,
    name: draft.name.trim(),
    description: draft.description.trim() === '' ? null : draft.description.trim(),
    unlockEraId: draft.unlockEraId || null,
    unlockSceneId: draft.unlockScene[0]?.id ?? null,
    unlockMomentId: draft.unlockMoment?.id ?? null,
    eraIds: draft.eraIds,
    sceneIds: draft.scenes.map((scene) => scene.id),
    formIds: draft.formIds,
  }
}

/** The parts of a form or ability that show their own error; any other refusal is said in the message above them. */
export const SHOWN = [
  'name',
  'description',
  'unlockEraId',
  'unlockSceneId',
  'unlockMomentId',
  'eraIds',
  'sceneIds',
  'formIds',
]

/** The server's limit on what a form or ability is (`ProgressionLimits.DescriptionMaxLength`). */
export const DESCRIPTION_MAX = 10000

/** The name each kind goes by in the progression's error keys (`forms[0].name`): the server's, not shown. */
export const LISTS: Record<Kind, string> = {
  form: 'forms',
  ability: 'abilities',
  appearance: 'appearances',
}

/** Every sentence that names the kind, whole, so another language can inflect each one. */
export function wordsOf(kind: Kind) {
  if (kind === 'form') {
    return {
      unsaved: t('progression.item.form.unsaved'),
      someDetails: t('progression.item.form.someDetails'),
      saveFailed: t('progression.item.form.saveFailed'),
      heading: t('progression.item.form.heading'),
      eyebrow: (name: string) => t('progression.item.form.eyebrow', { name }),
      eyebrowNew: (name: string) => t('progression.item.form.eyebrowNew', { name }),
      save: t('progression.item.form.save'),
      add: t('progression.item.form.add'),
    }
  }
  if (kind === 'ability') {
    return {
      unsaved: t('progression.item.ability.unsaved'),
      someDetails: t('progression.item.ability.someDetails'),
      saveFailed: t('progression.item.ability.saveFailed'),
      heading: t('progression.item.ability.heading'),
      eyebrow: (name: string) => t('progression.item.ability.eyebrow', { name }),
      eyebrowNew: (name: string) => t('progression.item.ability.eyebrowNew', { name }),
      save: t('progression.item.ability.save'),
      add: t('progression.item.ability.add'),
    }
  }
  return {
    unsaved: t('progression.item.appearance.unsaved'),
    someDetails: t('progression.item.appearance.someDetails'),
    saveFailed: t('progression.item.appearance.saveFailed'),
    heading: t('progression.item.appearance.heading'),
    eyebrow: (name: string) => t('progression.item.appearance.eyebrow', { name }),
    eyebrowNew: (name: string) => t('progression.item.appearance.eyebrowNew', { name }),
    save: t('progression.item.appearance.save'),
    add: t('progression.item.appearance.add'),
  }
}

/** An appearance's name and description are its label and notes (Issue #43), in its errors too. */
export function partOf(kind: Kind, part: string) {
  if (kind !== 'appearance') return part
  return part === 'name' ? 'label' : part === 'description' ? 'notes' : part
}
