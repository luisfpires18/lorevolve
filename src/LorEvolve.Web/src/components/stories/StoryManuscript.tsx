import { useUniverseAccess } from '../../universes/access'
import { ManuscriptPanel } from '../ManuscriptPanel'
import { StoryPartPublication } from '../StoryPartPublication'
import type { StoryDetail } from '../../stories/types'
import type { Chronology } from '../../chronology/types'
import type { storyPatches } from '../../stories/storyPatches'
import type { useStoryState } from '../../stories/useStoryState'

/** The Manuscript view: one scene's prose, opened from the story. */
export function StoryManuscript({
  access,
  universe,
  story,
  chronology,
  sceneId,
  setSceneForm,
  reload,
  patchScene,
  storyIsPublic,
}: Pick<ReturnType<typeof useStoryState>, 'setSceneForm'> &
  Pick<ReturnType<typeof storyPatches>, 'patchScene'> & {
    access: ReturnType<typeof useUniverseAccess>
    universe: { id: string }
    story: StoryDetail
    chronology: Chronology
    sceneId: string | undefined
    reload: () => void
    storyIsPublic: boolean | null
  }) {
  return (
    <ManuscriptPanel
      universeId={universe.id}
      story={story}
      chronology={chronology}
      sceneId={sceneId}
      onEditScene={(scene) => setSceneForm({ mode: 'edit', scene })}
      onSuggestScene={(scene) => setSceneForm({ mode: 'suggest', scene })}
      onSceneChanged={reload}
      onSceneSaved={(saved) => patchScene(saved.id, saved)}
      manuscriptPublication={(scene) =>
        access.publish ? (
          <StoryPartPublication
            universeId={universe.id}
            storyId={story.id}
            kind="manuscript"
            id={scene.id}
            name={scene.title}
            visibility={scene.manuscriptVisibility}
            storyIsPublic={storyIsPublic}
            onChange={(manuscriptVisibility) => patchScene(scene.id, { manuscriptVisibility })}
          />
        ) : null
      }
    />
  )
}
