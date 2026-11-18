import type { EntityChoice } from '../components/EntityPicker'
import { t } from '../i18n'
import { CanonStatus, type CanonStatusValue } from '../lore/types'
import { DateKind, type DateKindValue, type TimelineEntry, type TimelineStoryLink } from './types'

/**
 * The draft holds every component as a string. An empty number input is genuinely empty
 * rather than zero, and a year of 0 stays distinct from no year at all. An empty era is no
 * era chosen yet.
 */
export interface MomentDraft {
  title: string
  description: string
  canonStatus: CanonStatusValue
  dateKind: DateKindValue
  startYear: string
  startMonth: string
  startDay: string
  endYear: string
  endMonth: string
  endDay: string
  startEraId: string
  endEraId: string
  eraLabel: string
  entities: EntityChoice[]
  /** The validation details, each chosen on its own: an event kind and a method by id, and a participant. */
  eventKindId: string
  methodId: string
  participant: EntityChoice | null
  /** The stories it is linked to. One in the Trash stays in the set, marked, so a save never drops it quietly. */
  stories: TimelineStoryLink[]
}

/** The six chronology boxes, named so one handler can serve all of them. */
export type ComponentKey =
  'startYear' | 'startMonth' | 'startDay' | 'endYear' | 'endMonth' | 'endDay'

export type EraKey = 'startEraId' | 'endEraId'

/** The field error keys a refused save's details carry, as the API client lowercases them. */
export const DETAIL_ERROR_KEYS = {
  eventKind: 'validation.eventkindid',
  method: 'validation.methodid',
  participant: 'validation.participantentityid',
} as const

export const EMPTY: MomentDraft = {
  title: '',
  description: '',
  canonStatus: CanonStatus.Idea,
  dateKind: DateKind.Exact,
  startYear: '',
  startMonth: '',
  startDay: '',
  endYear: '',
  endMonth: '',
  endDay: '',
  startEraId: '',
  endEraId: '',
  eraLabel: '',
  entities: [],
  eventKindId: '',
  methodId: '',
  participant: null,
  stories: [],
}

export function numberText(value: number | null) {
  return value === null ? '' : String(value)
}

export function draftFrom(entry: TimelineEntry): MomentDraft {
  const details = entry.validation

  return {
    title: entry.title,
    description: entry.description ?? '',
    canonStatus: entry.canonStatus,
    dateKind: entry.date.kind,
    startYear: numberText(entry.date.startYear),
    // A custom calendar's month is held by its id; a simple month by its number.
    startMonth: entry.date.startMonthId ?? numberText(entry.date.startMonth),
    startDay: numberText(entry.date.startDay),
    endYear: numberText(entry.date.endYear),
    endMonth: entry.date.endMonthId ?? numberText(entry.date.endMonth),
    endDay: numberText(entry.date.endDay),
    startEraId: entry.date.startEraId ?? '',
    endEraId: entry.date.endEraId ?? '',
    eraLabel: entry.date.eraLabel ?? '',
    // A participant in the Trash keeps its place in the set - the form posts every id back,
    // so dropping it here would delete the participation on the next save. It is labelled
    // instead, so the author can see why it is not clickable anywhere else.
    entities: entry.entities.map((link) => ({
      id: link.entityId,
      name: link.isTrashed ? t('time.momentForm.entityInTrash', { name: link.name }) : link.name,
    })),
    eventKindId: details?.eventKind?.id ?? '',
    methodId: details?.method?.id ?? '',
    participant: details?.participant
      ? {
          id: details.participant.entityId,
          name: details.participant.isTrashed
            ? t('time.momentForm.participantInTrash', { name: details.participant.name })
            : details.participant.name,
        }
      : null,
    stories: entry.stories,
  }
}

/** An empty box is no claim at all; anything unreadable is left for the API to refuse. */
export function toNumber(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null
}

export function trimmed(value: string) {
  const text = value.trim()
  return text === '' ? null : text
}

/**
 * The draft as the save sends it: a kind carries only its own date parts, a universe with eras no free label, and a
 * universe with a custom calendar its months by id rather than by number.
 */
export function inputOf(draft: MomentDraft, reckonsInEras: boolean, custom: boolean) {
  const isDatedKind = draft.dateKind !== DateKind.Unknown
  const isRangeKind = draft.dateKind === DateKind.Range

  return {
    title: draft.title.trim(),
    description: trimmed(draft.description),
    canonStatus: draft.canonStatus,
    dateKind: draft.dateKind,
    startYear: toNumber(draft.startYear),
    startMonth: custom ? null : toNumber(draft.startMonth),
    startMonthId: custom ? trimmed(draft.startMonth) : null,
    startDay: toNumber(draft.startDay),
    endYear: toNumber(draft.endYear),
    endMonth: custom ? null : toNumber(draft.endMonth),
    endMonthId: custom ? trimmed(draft.endMonth) : null,
    endDay: toNumber(draft.endDay),
    // A universe with eras has no free-text label; one without has no eras to send.
    eraLabel: reckonsInEras ? null : trimmed(draft.eraLabel),
    startEraId: reckonsInEras && isDatedKind ? trimmed(draft.startEraId) : null,
    endEraId: reckonsInEras && isRangeKind ? trimmed(draft.endEraId) : null,
    entityIds: draft.entities.map((choice) => choice.id),
    // Always sent whole, a story in the Trash included; an empty list unlinks every story.
    storyIds: draft.stories.map((story) => story.storyId),
    // Always sent whole: all three empty removes the details.
    validation: {
      eventKindId: trimmed(draft.eventKindId),
      methodId: trimmed(draft.methodId),
      participantEntityId: draft.participant?.id ?? null,
    },
  }
}
