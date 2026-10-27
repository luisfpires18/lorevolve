import { formatChronologyPoint, isPlaced } from '../chronology/format'
import type { Chronology, ChronologyValue } from '../chronology/types'

/**
 * Where a scene happens in the world, written by the shared chronology formatter - or null when the
 * scene is not placed in time. `placed` is false for a plain year written before the universe named
 * its eras, which is shown apart rather than guessed into one.
 *
 * Display only. Scenes are never sorted by this: a story is read in the order its author set.
 */
export function sceneWhen(chronology: Chronology, value: ChronologyValue | null) {
  if (!value || value.year === null) return null

  return {
    text: formatChronologyPoint(chronology, {
      year: value.year,
      month: value.month,
      day: value.day,
      eraId: value.eraId,
      monthId: value.monthId,
    }),
    placed: isPlaced(chronology, value.eraId),
  }
}

export function sceneCountLabel(count: number) {
  return count === 1 ? '1 scene' : `${count} scenes`
}

export function chapterCountLabel(count: number) {
  return count === 1 ? '1 chapter' : `${count} chapters`
}

/** What a scene that belongs to no chapter is said to be in. A place on screen, not a chapter. */
export const UNCHAPTERED = 'Unchaptered'

/**
 * "Chapter 3": presentation, from the chapter's position in the list. Never stored and never part of
 * the title, so reordering renumbers every chapter without touching a word the author wrote.
 */
export function chapterNumber(index: number) {
  return `Chapter ${index + 1}`
}

/** "Chapter 3: The Fall". */
export function chapterLabel(index: number, title: string) {
  return `${chapterNumber(index)}: ${title}`
}

/** "Chapter 3", or "Unchaptered": where a scene sits, short enough for a chip. */
export function containerNumber(chapters: { id: string }[], chapterId: string | null) {
  if (chapterId === null) return UNCHAPTERED
  const index = chapters.findIndex((chapter) => chapter.id === chapterId)
  return index < 0 ? UNCHAPTERED : chapterNumber(index)
}

/**
 * "Arc 2": presentation, from the arc's position in the story's plot. Never stored and never part of the title, so
 * reordering renumbers every arc without touching a word the author wrote.
 */
export function arcNumber(index: number) {
  return `Arc ${index + 1}`
}

/** "Arc 2: Fall of the King". */
export function arcLabel(index: number, title: string) {
  return `${arcNumber(index)}: ${title}`
}

export function beatCountLabel(count: number) {
  return count === 1 ? '1 beat' : `${count} beats`
}

export function arcCountLabel(count: number) {
  return count === 1 ? '1 arc' : `${count} arcs`
}

/** The container a scene is in, named the way the page names it. */
export function containerLabel(
  chapters: { id: string; title: string }[],
  chapterId: string | null,
) {
  if (chapterId === null) return UNCHAPTERED
  const index = chapters.findIndex((chapter) => chapter.id === chapterId)
  return index < 0 ? UNCHAPTERED : chapterLabel(index, chapters[index].title)
}
