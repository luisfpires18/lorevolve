import type { ChronologyPointDraft } from '../components/ChronologyPointFields'
import type { EntityChoice } from '../components/EntityPicker'
import { hasCalendar, namesEras } from '../chronology/format'
import type { Chronology, ChronologyValue } from '../chronology/types'
import { differing, type Change } from '../lib/editConflict'
import type { SceneSuggestion } from '../suggestions/api'
import { chapterLabel, sceneWhen, UNCHAPTERED } from './format'
import type { Chapter, Scene, SceneLoreReference } from './types'

/*
 * A scene's form as the scene drawer holds it, sends it and compares it: shared by the drawer itself and the review
 * drawer, which shows a suggested change to a scene in the same words (task 045).
 */

export const EMPTY_POINT: ChronologyPointDraft = { eraId: '', year: '', month: '', day: '' }

export interface SceneDraft {
  title: string
  summary: string
  notes: string
  pov: EntityChoice | null
  point: ChronologyPointDraft
  entities: EntityChoice[]
  /** The chapter's id, or '' for Unchaptered - the select's own empty value. */
  chapterId: string
}

/**
 * A reference as the pickers hold it. An entry in the Trash keeps its place - the form posts every
 * reference back, so dropping it would delete it on the next save - and says why it is unavailable.
 */
function choiceOf(reference: SceneLoreReference): EntityChoice {
  return {
    id: reference.entityId,
    name: reference.isTrashed ? `${reference.name} (in Trash)` : reference.name,
  }
}

function numberText(value: number | null) {
  return value === null ? '' : String(value)
}

/** A scene's form, as a scene or a suggestion holds it. */
type SceneFields = Pick<
  Scene,
  'title' | 'chapterId' | 'summary' | 'notes' | 'pov' | 'chronology' | 'entities'
>

export function draftFrom(scene: SceneFields | null, chapterId: string | null): SceneDraft {
  if (!scene) {
    return {
      title: '',
      summary: '',
      notes: '',
      pov: null,
      point: EMPTY_POINT,
      entities: [],
      chapterId: chapterId ?? '',
    }
  }

  return {
    chapterId: scene.chapterId ?? '',
    title: scene.title,
    summary: scene.summary ?? '',
    notes: scene.notes ?? '',
    pov: scene.pov ? choiceOf(scene.pov) : null,
    point: scene.chronology
      ? {
          eraId: scene.chronology.eraId ?? '',
          year: numberText(scene.chronology.year),
          month: scene.chronology.monthId ?? numberText(scene.chronology.month),
          day: numberText(scene.chronology.day),
        }
      : EMPTY_POINT,
    entities: scene.entities.map(choiceOf),
  }
}

/** An empty box is no claim at all; anything unreadable is left for the API to refuse. */
function toNumber(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null
}

function trimmed(value: string) {
  const text = value.trim()
  return text === '' ? null : text
}

/**
 * Nothing typed at all is a scene not placed in time. Anything typed is sent as it stands: a custom calendar's month by its
 * id, a simple month by its number.
 */
export function chronologyOf(
  point: ChronologyPointDraft,
  reckonsInEras: boolean,
  custom: boolean,
): ChronologyValue | null {
  if (Object.values(point).every((part) => part.trim() === '')) return null

  return {
    eraId: reckonsInEras ? trimmed(point.eraId) : null,
    year: toNumber(point.year),
    month: custom ? null : toNumber(point.month),
    day: toNumber(point.day),
    monthId: custom ? trimmed(point.month) : null,
  }
}

/** The draft as the save sends it: every reference as its id, nothing typed in the date as no date at all. */
export function inputOf(draft: SceneDraft, reckonsInEras: boolean, custom: boolean) {
  return {
    title: draft.title.trim(),
    summary: trimmed(draft.summary),
    notes: trimmed(draft.notes),
    povEntityId: draft.pov?.id ?? null,
    chronology: chronologyOf(draft.point, reckonsInEras, custom),
    entityIds: draft.entities.map((choice) => choice.id),
    chapterId: draft.chapterId === '' ? null : draft.chapterId,
  }
}

/** What differs between two drafts of a scene, in the form's own words: its fields, as the form shows them. */
function changesOf(
  latest: SceneDraft,
  mine: SceneDraft,
  chapterName: (id: string) => string,
  when: (draft: SceneDraft) => string,
): Change[] {
  const names = (choices: EntityChoice[]) =>
    choices
      .map((choice) => choice.name)
      .sort()
      .join(', ')

  return differing([
    { label: 'Title', latest: latest.title, mine: mine.title.trim() },
    { label: 'Chapter', latest: chapterName(latest.chapterId), mine: chapterName(mine.chapterId) },
    { label: 'Summary', latest: latest.summary, mine: mine.summary.trim() },
    { label: 'Notes', latest: latest.notes, mine: mine.notes.trim() },
    { label: 'Point of view', latest: latest.pov?.name ?? '', mine: mine.pov?.name ?? '' },
    { label: 'When', latest: when(latest), mine: when(mine) },
    { label: 'Lore', latest: names(latest.entities), mine: names(mine.entities) },
  ])
}

/**
 * A comparison of two of a scene's forms in the form's own words, for a story of these chapters: a chapter by its label,
 * a date as the universe writes it.
 */
export function sceneChangesIn(chapters: Chapter[], chronology: Chronology) {
  const reckonsInEras = namesEras(chronology)
  const custom = hasCalendar(chronology)

  return (latest: SceneDraft, mine: SceneDraft) =>
    changesOf(
      latest,
      mine,
      (id) => {
        if (id === '') return UNCHAPTERED
        const index = chapters.findIndex((chapter) => chapter.id === id)
        return index < 0 ? 'Another chapter' : chapterLabel(index, chapters[index].title)
      },
      (draft) =>
        sceneWhen(chronology, chronologyOf(draft.point, reckonsInEras, custom))?.text ?? '',
    )
}

/** A scene suggestion's two sides, as the scene form shows its fields (task 045). */
export function describeSceneSuggestion(chapters: Chapter[], chronology: Chronology) {
  const compare = sceneChangesIn(chapters, chronology)
  return (before: SceneSuggestion, proposed: SceneSuggestion) =>
    compare(draftFrom(before, null), draftFrom(proposed, null))
}
