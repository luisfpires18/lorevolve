import { deleteChapter, deletePlotArc, deleteScene, deleteStory } from './api'
import { arcCountLabel, arcLabel, chapterCountLabel, chapterLabel, sceneCountLabel } from './format'
import { scenesIn } from './structure'
import type { Chapter, PlotArc, Scene, StoryDetail } from './types'
import type { WorkspaceContext } from '../pages/UniverseWorkspace'
import { confirmAction } from '../lib/confirm'
import type { NavigateFunction } from 'react-router-dom'
import type { useI18n } from '../i18n'
import type { useStoryState } from './useStoryState'
import type { chapterGroups } from './structure'

/** What is sent to the Trash: an arc, a scene, a chapter, or the whole story. */
export function storyRemovals({
  t,
  tx,
  universe,
  refreshProjects,
  navigate,
  setAnnouncement,
  reload,
  setMessage,
  story,
  arcs,
  chapters,
  scenes,
  hasChapters,
  groups,
}: Pick<ReturnType<typeof useStoryState>, 'setAnnouncement'> &
  Pick<WorkspaceContext, 'refreshProjects'> & {
    t: ReturnType<typeof useI18n>['t']
    tx: ReturnType<typeof useI18n>['tx']
    universe: { id: string }
    navigate: NavigateFunction
    reload: () => void
    setMessage: (text: string | null) => void
    story: StoryDetail
    arcs: PlotArc[]
    chapters: Chapter[]
    scenes: Scene[]
    hasChapters: boolean
    groups: ReturnType<typeof chapterGroups>
  }) {
  /** The arc alone goes to the Trash. Its chapters stay, in no arc until it is restored. */
  async function removeArc(arc: PlotArc, index: number) {
    const count = groups.arcs[index]?.chapters.length ?? 0
    setMessage(null)
    const removed = await confirmAction({
      title: t('stories.page.removeArc.title', { label: arcLabel(index, arc.title) }),
      message:
        count === 0
          ? t('stories.page.removeArc.empty')
          : t('stories.page.removeArc.message', { chapters: chapterCountLabel(count) }),
      confirmLabel: t('stories.page.removeArc.confirm'),
      busyLabel: t('stories.page.removeArc.busy'),
      variant: 'warning',
      failure: t('stories.page.removeArc.failure'),
      action: () => deletePlotArc(universe.id, story.id, arc.id),
    })
    if (!removed) return
    setAnnouncement(t('stories.page.removeArc.done', { title: arc.title }))
    reload()
  }

  async function removeScene(scene: Scene) {
    setMessage(null)
    const removed = await confirmAction({
      title: tx('stories.page.removeScene.title', { title: <bdi>{scene.title}</bdi> }),
      message:
        scene.beats.length === 0
          ? t('stories.page.removeScene.message')
          : t('stories.page.removeScene.messageWithBeats'),
      confirmLabel: t('stories.page.removeScene.confirm'),
      busyLabel: t('stories.page.removeScene.busy'),
      variant: 'warning',
      failure: t('stories.page.removeScene.failure'),
      action: () => deleteScene(universe.id, story.id, scene.id),
    })
    if (!removed) return
    setAnnouncement(t('stories.page.removeScene.done', { title: scene.title }))
    reload()
  }

  /** Removes the chapter only. Its scenes move, in order, to the end of Unchaptered. */
  async function removeChapter(chapter: Chapter, index: number) {
    const count = scenesIn(scenes, chapter.id).length
    setMessage(null)
    const removed = await confirmAction({
      title: t('stories.page.removeChapter.title', { label: chapterLabel(index, chapter.title) }),
      message:
        count === 0
          ? t('stories.page.removeChapter.messageEmpty')
          : t('stories.page.removeChapter.message', { scenes: sceneCountLabel(count) }),
      confirmLabel: t('stories.page.removeChapter.confirm'),
      busyLabel: t('stories.page.removeChapter.busy'),
      variant: 'warning',
      failure: t('stories.page.removeChapter.failure'),
      action: () => deleteChapter(universe.id, story.id, chapter.id),
    })
    if (!removed) return
    setAnnouncement(
      count === 0
        ? t('stories.page.removeChapter.done', { title: chapter.title })
        : t(
            count === 1
              ? 'stories.page.removeChapter.doneOne'
              : 'stories.page.removeChapter.doneMany',
            { title: chapter.title, scenes: sceneCountLabel(count) },
          ),
    )
    reload()
  }

  async function removeStory() {
    // What goes with the story, one line each, so its size is read before it is moved (Issue #50).
    const details = [
      ...(hasChapters ? [chapterCountLabel(chapters.length)] : []),
      t('stories.page.removeStory.scenes', { scenes: sceneCountLabel(scenes.length) }),
      ...(arcs.length > 0 ? [arcCountLabel(arcs.length)] : []),
    ]
    setMessage(null)
    const removed = await confirmAction({
      title: tx('stories.page.removeStory.title', { title: <bdi>{story.title}</bdi> }),
      message: t('stories.page.removeStory.message'),
      details,
      confirmLabel: t('stories.page.removeStory.confirm'),
      busyLabel: t('stories.page.removeStory.busy'),
      variant: 'warning',
      failure: t('stories.page.removeStory.failure'),
      action: () => deleteStory(universe.id, story.id),
    })
    if (removed) {
      // The last Writing project may have gone to the Trash: the sidebar follows (#272).
      refreshProjects().catch(() => undefined)
      navigate(`/app/universes/${universe.id}/writing`)
    }
  }
  return { removeArc, removeScene, removeChapter, removeStory }
}
