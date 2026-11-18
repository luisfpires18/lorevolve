import { ChapterSection, type ArcTarget } from '../ChapterSection'
import { arcLabel } from '../../stories/format'
import { scenesIn } from '../../stories/structure'
import type { Chapter, Scene } from '../../stories/types'
import type { storyChapterMoves } from '../../stories/storyChapterMoves'
import type { storyRemovals } from '../../stories/storyRemovals'
import type { useStoryState } from '../../stories/useStoryState'
import type { chapterGroups } from '../../stories/structure'
import { StorySceneCards, type StorySceneCardsProps } from './StorySceneCards'

export type StoryChapterSectionsProps = StorySceneCardsProps &
  Pick<ReturnType<typeof useStoryState>, 'setChapterForm'> &
  Pick<ReturnType<typeof storyChapterMoves>, 'moveChapter' | 'moveChapterArc'> &
  Pick<ReturnType<typeof storyRemovals>, 'removeChapter'> & {
    scenes: Scene[]
    opensOn: string | null
    arcIndex: (arcId: string | null) => number
    groups: ReturnType<typeof chapterGroups>
  }

/** Chapters as sections, each with its scenes. */
export function StoryChapterSections(
  props: StoryChapterSectionsProps & { group: Chapter[]; titleLevel: 3 | 4 },
) {
  const {
    group,
    titleLevel,
    scenes,
    opensOn,
    arcIndex,
    groups,
    setSceneForm,
    setChapterForm,
    moveChapter,
    moveChapterArc,
    removeChapter,
  } = props

  /** Every place a chapter may move to but the one it is in: each other arc, and no arc. */
  function arcTargets(chapter: Chapter): ArcTarget[] {
    const current =
      chapter.plotArcId !== null && arcIndex(chapter.plotArcId) >= 0 ? chapter.plotArcId : null
    return [
      ...groups.arcs
        .map((entry, index) => ({ id: entry.arc.id, label: arcLabel(index, entry.arc.title) }))
        .filter((target) => target.id !== current),
      ...(current === null ? [] : [{ id: null, label: '' }]),
    ]
  }

  return group.map((chapter, index) => {
    const inside = scenesIn(scenes, chapter.id)
    return (
      <ChapterSection
        key={chapter.id}
        chapter={chapter}
        index={index}
        count={group.length}
        sceneCount={inside.length}
        titleLevel={titleLevel}
        arcTargets={arcTargets(chapter)}
        onMoveToArc={(target, arcId) => void moveChapterArc(target, arcId)}
        onMove={(target, by) => void moveChapter(target, by)}
        onAddScene={(target) => setSceneForm({ mode: 'new', chapterId: target.id })}
        onEdit={(target, at) => setChapterForm({ mode: 'edit', chapter: target, index: at })}
        onDelete={(target, at) => void removeChapter(target, at)}
        startsOpen={chapter.id === opensOn}
      >
        <ol className="scenes" data-testid="chapter-scenes">
          <StorySceneCards {...props} container={inside} titleLevel={titleLevel === 4 ? 5 : 4} />
        </ol>
      </ChapterSection>
    )
  })
}
