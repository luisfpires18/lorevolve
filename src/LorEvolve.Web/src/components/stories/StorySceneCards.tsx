import { useUniverseAccess } from '../../universes/access'
import { SceneCard, type MoveTarget } from '../SceneCard'
import { ContentPublication } from '../ContentPublication'
import type { Scene, StoryDetail } from '../../stories/types'
import type { Chronology } from '../../chronology/types'
import type { storyPatches } from '../../stories/storyPatches'
import type { storyRemovals } from '../../stories/storyRemovals'
import type { storySceneMoves } from '../../stories/storySceneMoves'
import type { useStoryState } from '../../stories/useStoryState'

export type StorySceneCardsProps = Pick<ReturnType<typeof useStoryState>, 'setSceneForm'> &
  Pick<ReturnType<typeof storyPatches>, 'patchScene'> &
  Pick<ReturnType<typeof storyRemovals>, 'removeScene'> &
  Pick<ReturnType<typeof storySceneMoves>, 'reorderLore' | 'moveWithin' | 'moveTo'> & {
    access: ReturnType<typeof useUniverseAccess>
    universe: { id: string }
    chronology: Chronology
    story: StoryDetail
    targets: MoveTarget[]
    storyIsPublic: boolean | null
  }

/** A container's scenes as cards: the same keyed list the Scenes view draws. */
export function StorySceneCards({
  container,
  titleLevel,
  access,
  universe,
  chronology,
  story,
  targets,
  storyIsPublic,
  setSceneForm,
  reorderLore,
  patchScene,
  moveWithin,
  moveTo,
  removeScene,
}: StorySceneCardsProps & { container: Scene[]; titleLevel: 3 | 4 | 5 }) {
  return container.map((scene, index) => (
    <SceneCard
      key={scene.id}
      universeId={universe.id}
      chronology={chronology}
      scene={scene}
      index={index}
      count={container.length}
      titleLevel={titleLevel}
      moveTargets={targets.filter((target) => target.chapterId !== scene.chapterId)}
      onMove={(target, by) => void moveWithin(target, by)}
      onMoveTo={(target, chapterId) => void moveTo(target, chapterId)}
      onEdit={(target) => setSceneForm({ mode: 'edit', scene: target })}
      onAddBeat={(target) => setSceneForm({ mode: 'edit', scene: target, addBeat: true })}
      onSuggest={(target) => setSceneForm({ mode: 'suggest', scene: target })}
      onDelete={(target) => void removeScene(target)}
      onReorderLore={(target, entityIds) => void reorderLore(target, entityIds)}
      publication={
        access.publish ? (
          <ContentPublication
            universeId={universe.id}
            kind="scene"
            id={scene.id}
            name={scene.title}
            placement="bar"
            part={{
              storyId: story.id,
              visibility: scene.visibility,
              storyIsPublic,
              onChange: (visibility) => patchScene(scene.id, { visibility }),
            }}
          />
        ) : null
      }
    />
  ))
}
