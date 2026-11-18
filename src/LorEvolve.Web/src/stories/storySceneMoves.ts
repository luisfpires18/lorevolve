import { ApiError } from '../lib/api'
import { moveScene, reorderScenes, updateScene } from './api'
import { scenesIn } from './structure'
import type { Scene, StoryDetail } from './types'
import type { useI18n } from '../i18n'
import type { useStoryState } from './useStoryState'
import type { storyPatches } from './storyPatches'

/** Where the focus goes back to once a scene has moved: its ⋯ menu, wherever the scene now is. */
const sceneMenu = (sceneId: string) => `#scene-${sceneId} [data-testid="scene-actions"]`

/** The scenes' own moves: their lore chips dragged into a new order, and a scene moved within or to a chapter. */
export function storySceneMoves({
  t,
  universe,
  setAnnouncement,
  reload,
  setMessage,
  story,
  scenes,
  hasChapters,
  containerName,
  isMoving,
  pendingFocus,
  patchScene,
  showStory,
  showContainer,
}: Pick<ReturnType<typeof useStoryState>, 'setAnnouncement' | 'isMoving' | 'pendingFocus'> &
  Pick<ReturnType<typeof storyPatches>, 'patchScene' | 'showStory' | 'showContainer'> & {
    t: ReturnType<typeof useI18n>['t']
    universe: { id: string }
    reload: () => void
    setMessage: (text: string | null) => void
    story: StoryDetail
    scenes: Scene[]
    hasChapters: boolean
    containerName: (chapterId: string | null) => string
  }) {
  /**
   * The lore of one scene, dragged into a new order on its card. The chips move at once and the scene is saved behind
   * them; a refused save puts the story back as the server has it and says so.
   */
  async function reorderLore(scene: Scene, entityIds: string[]) {
    const byId = new Map(scene.entities.map((reference) => [reference.entityId, reference]))
    const reordered = entityIds.map((id) => byId.get(id)).filter((one) => one !== undefined)
    if (reordered.length !== scene.entities.length) return

    setMessage(null)
    patchScene(scene.id, { entities: reordered })

    try {
      const saved = await updateScene(universe.id, story.id, scene.id, {
        title: scene.title,
        summary: scene.summary,
        notes: scene.notes,
        povEntityId: scene.pov?.entityId ?? null,
        chronology: scene.chronology,
        entityIds,
        chapterId: scene.chapterId,
        expectedVersion: scene.version,
      })
      patchScene(scene.id, saved)
      setAnnouncement(t('stories.page.loreReordered', { title: scene.title }))
    } catch (error: unknown) {
      patchScene(scene.id, { entities: scene.entities })
      setMessage(error instanceof ApiError ? error.message : t('stories.page.orderFailed'))
      reload()
    }
  }

  /** Moves one scene one place inside its container, at once on screen, and puts it back if refused. */
  async function moveWithin(scene: Scene, by: -1 | 1) {
    if (isMoving.current) return

    const container = scenesIn(scenes, scene.chapterId)
    const from = container.findIndex((candidate) => candidate.id === scene.id)
    const to = from + by
    if (from < 0 || to < 0 || to >= container.length) return

    const next = [...container]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)

    isMoving.current = true
    setMessage(null)
    pendingFocus.current = sceneMenu(scene.id)
    showContainer(
      scene.chapterId,
      next.map((candidate, index) => ({ ...candidate, sortOrder: index })),
    )

    try {
      showContainer(
        scene.chapterId,
        await reorderScenes(
          universe.id,
          story.id,
          scene.chapterId,
          next.map((candidate) => candidate.id),
        ),
      )
      setAnnouncement(
        hasChapters
          ? t('stories.page.sceneMovedIn', {
              title: scene.title,
              n: to + 1,
              total: next.length,
              container: containerName(scene.chapterId),
            })
          : t('stories.page.sceneMoved', { title: scene.title, n: to + 1, total: next.length }),
      )
    } catch (error: unknown) {
      showStory(story)
      setMessage(error instanceof ApiError ? error.message : t('stories.page.orderFailed'))
    } finally {
      isMoving.current = false
    }
  }

  /** Moves one scene to the end of another chapter, or of Unchaptered. */
  async function moveTo(scene: Scene, chapterId: string | null) {
    if (isMoving.current) return

    isMoving.current = true
    setMessage(null)

    try {
      const saved = await moveScene(universe.id, story.id, scene.id, chapterId)
      pendingFocus.current = sceneMenu(scene.id)
      showStory(saved)

      const count = scenesIn(saved.scenes, chapterId).length
      setAnnouncement(
        t('stories.page.sceneMovedTo', {
          title: scene.title,
          container: containerName(chapterId),
          n: count,
          total: count,
        }),
      )
    } catch (error: unknown) {
      setMessage(error instanceof ApiError ? error.message : t('stories.page.sceneMoveFailed'))
      document.querySelector<HTMLElement>(sceneMenu(scene.id))?.focus()
    } finally {
      isMoving.current = false
    }
  }
  return { reorderLore, moveWithin, moveTo }
}
