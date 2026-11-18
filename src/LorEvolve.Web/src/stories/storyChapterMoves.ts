import { ApiError } from '../lib/api'
import { moveChapterToArc, reorderChapters, reorderPlotArcs } from './api'
import { arcLabel } from './format'
import type { Chapter, PlotArc, StoryDetail } from './types'
import type { useI18n } from '../i18n'
import type { useStoryState } from './useStoryState'
import type { storyPatches } from './storyPatches'
import type { chapterGroups } from './structure'

/** The chapters' and arcs' moves: a chapter within its arc or to another, and an arc among the arcs. */
export function storyChapterMoves({
  t,
  universe,
  setAnnouncement,
  isMoving,
  pendingFocus,
  reload,
  setMessage,
  story,
  chapters,
  groups,
  arcIndex,
  showStory,
  showArcs,
  showChapters,
}: Pick<ReturnType<typeof useStoryState>, 'setAnnouncement' | 'isMoving' | 'pendingFocus'> &
  Pick<ReturnType<typeof storyPatches>, 'showStory' | 'showArcs' | 'showChapters'> & {
    t: ReturnType<typeof useI18n>['t']
    universe: { id: string }
    reload: () => void
    setMessage: (text: string | null) => void
    story: StoryDetail
    chapters: Chapter[]
    groups: ReturnType<typeof chapterGroups>
    arcIndex: (arcId: string | null) => number
  }) {
  /**
   * Moves one chapter one place inside its arc - or among the chapters in no arc - at once on screen, and puts it back if
   * refused. The story keeps one chapter order, so the move swaps it with its neighbour there.
   */
  async function moveChapter(chapter: Chapter, by: -1 | 1) {
    if (isMoving.current) return

    const arcId =
      chapter.plotArcId !== null && arcIndex(chapter.plotArcId) >= 0 ? chapter.plotArcId : null
    const group = arcId === null ? groups.unarced : groups.arcs[arcIndex(arcId)].chapters
    const inGroup = group.findIndex((candidate) => candidate.id === chapter.id)
    const neighbour = group[inGroup + by]
    if (inGroup < 0 || !neighbour) return

    const ordered = [...chapters].sort((a, b) => a.sortOrder - b.sortOrder)
    const from = ordered.findIndex((candidate) => candidate.id === chapter.id)
    const to = ordered.findIndex((candidate) => candidate.id === neighbour.id)
    const next = [...ordered]
    next[from] = neighbour
    next[to] = chapter

    isMoving.current = true
    setMessage(null)
    pendingFocus.current = `#chapter-${chapter.id} [data-testid="chapter-actions"]`
    showChapters(next.map((candidate, index) => ({ ...candidate, sortOrder: index })))

    try {
      showChapters(
        await reorderChapters(
          universe.id,
          story.id,
          next.map((candidate) => candidate.id),
        ),
      )
      setAnnouncement(
        t('stories.page.chapterMoved', {
          title: chapter.title,
          n: inGroup + by + 1,
          total: group.length,
        }),
      )
    } catch (error: unknown) {
      showStory(story)
      setMessage(error instanceof ApiError ? error.message : t('stories.page.orderFailed'))
    } finally {
      isMoving.current = false
    }
  }

  /** Moves a chapter into another arc, last there, or out of every arc (ADR 0070). Its scenes go with it. */
  async function moveChapterArc(chapter: Chapter, arcId: string | null) {
    if (isMoving.current) return

    isMoving.current = true
    setMessage(null)
    try {
      await moveChapterToArc(universe.id, story.id, chapter.id, arcId)
      pendingFocus.current = `#chapter-${chapter.id} [data-testid="chapter-actions"]`
      const index = arcIndex(arcId)
      setAnnouncement(
        arcId === null || index < 0
          ? t('stories.page.chapterNoArc', { title: chapter.title })
          : t('stories.page.chapterMovedToArc', {
              title: chapter.title,
              label: arcLabel(index, groups.arcs[index].arc.title),
            }),
      )
      reload()
    } catch (error: unknown) {
      setMessage(error instanceof ApiError ? error.message : t('stories.page.chapterMoveFailed'))
    } finally {
      isMoving.current = false
    }
  }

  /** Moves one arc one place, at once on screen, and puts it back if refused. */
  async function moveArc(arc: PlotArc, by: -1 | 1) {
    if (isMoving.current) return

    const ordered = groups.arcs.map((entry) => entry.arc)
    const from = ordered.findIndex((candidate) => candidate.id === arc.id)
    const to = from + by
    if (from < 0 || to < 0 || to >= ordered.length) return

    const next = [...ordered]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)

    isMoving.current = true
    setMessage(null)
    pendingFocus.current = `#arc-${arc.id} [data-testid="arc-actions"]`
    showArcs(next.map((candidate, index) => ({ ...candidate, sortOrder: index })))

    try {
      showArcs(
        await reorderPlotArcs(
          universe.id,
          story.id,
          next.map((candidate) => candidate.id),
        ),
      )
      setAnnouncement(
        t('stories.page.arcMoved', { title: arc.title, n: to + 1, total: next.length }),
      )
    } catch (error: unknown) {
      showStory(story)
      setMessage(error instanceof ApiError ? error.message : t('stories.page.orderFailed'))
    } finally {
      isMoving.current = false
    }
  }
  return { moveChapter, moveChapterArc, moveArc }
}
