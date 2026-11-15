import { t } from '../i18n'
import type { Chapter, PlotArc, Scene } from './types'

/**
 * One container's scenes in the order they are told: the chapter `chapterId` names, or Unchaptered when
 * it is null. A scene's `sortOrder` is its place inside its container, never across the story.
 */
export function scenesIn(scenes: Scene[], chapterId: string | null) {
  return scenes
    .filter((scene) => scene.chapterId === chapterId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

/** The live arc a chapter is told in, or null: an arc the story no longer shows holds no chapter (ADR 0070). */
export function arcOf(arcs: PlotArc[], chapter: Chapter) {
  return chapter.plotArcId !== null && arcs.some((arc) => arc.id === chapter.plotArcId)
    ? chapter.plotArcId
    : null
}

/**
 * The story's chapters as the Scenes view groups them (ADR 0070): the chapters in no arc, then each arc in its order with its
 * own chapters - each group in the story's one chapter order.
 */
export function chapterGroups(arcs: PlotArc[], chapters: Chapter[]) {
  const ordered = [...chapters].sort((a, b) => a.sortOrder - b.sortOrder)
  return {
    unarced: ordered.filter((chapter) => arcOf(arcs, chapter) === null),
    arcs: [...arcs]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((arc) => ({
        arc,
        chapters: ordered.filter((chapter) => arcOf(arcs, chapter) === arc.id),
      })),
  }
}

/** Each chapter's number as the author reads it: from 1 inside its arc, or among the chapters in no arc. */
export function chapterNumbers(arcs: PlotArc[], chapters: Chapter[]) {
  const groups = chapterGroups(arcs, chapters)
  const numbers = new Map<string, number>()
  for (const group of [groups.unarced, ...groups.arcs.map((entry) => entry.chapters)]) {
    group.forEach((chapter, index) => numbers.set(chapter.id, index + 1))
  }
  return numbers
}

/**
 * Every scene in the order the story reads: Unchaptered first, then the chapters in no arc, then each arc's chapters, each
 * container in its own narrative order. The order the API sends, restored after a change made on screen before the save
 * lands.
 */
export function readingOrder(arcs: PlotArc[], chapters: Chapter[], scenes: Scene[]) {
  const groups = chapterGroups(arcs, chapters)
  const sequence = [...groups.unarced, ...groups.arcs.flatMap((entry) => entry.chapters)]
  const rank = new Map(sequence.map((chapter, index) => [chapter.id, index]))
  const place = (scene: Scene) =>
    scene.chapterId === null ? -1 : (rank.get(scene.chapterId) ?? sequence.length)

  return [...scenes].sort((a, b) => place(a) - place(b) || a.sortOrder - b.sortOrder)
}

/** A chapter as a choice: LorEvolve's words (`prefix`) and the author's title, apart for a `<bdi>`, and both as one label. */
function choice(chapter: Chapter, prefix: string) {
  return {
    id: chapter.id,
    prefix,
    title: chapter.title,
    label: t('stories.chapter.choice', { prefix, title: chapter.title }),
  }
}

/**
 * Each chapter's full label as a choice reads it, in the order the Scenes view shows them: "Chapter 2: Ashes" for one in no
 * arc, "Arc 1, Chapter 2: Ashes" inside an arc - a number alone repeats from arc to arc (ADR 0070).
 */
export function chapterChoices(arcs: PlotArc[], chapters: Chapter[]) {
  const groups = chapterGroups(arcs, chapters)
  const sortedArcs = groups.arcs.map((entry) => entry.arc)
  return [
    ...groups.unarced.map((chapter, index) =>
      choice(chapter, t('stories.chapter.number', { n: index + 1 })),
    ),
    ...groups.arcs.flatMap(({ arc, chapters: inArc }) =>
      inArc.map((chapter, index) =>
        choice(
          chapter,
          t('stories.chapter.inArc', { arc: sortedArcs.indexOf(arc) + 1, n: index + 1 }),
        ),
      ),
    ),
  ]
}
