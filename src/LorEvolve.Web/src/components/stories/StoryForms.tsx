import { useI18n } from '../../i18n'
import { StoryPartForm } from '../StoryPartForm'
import { SceneForm } from '../SceneForm'
import { StoryForm } from '../StoryForm'
import { arcNumber, chapterNumber } from '../../stories/format'
import type { Chapter, PlotArc, StoryDetail } from '../../stories/types'
import type { Chronology } from '../../chronology/types'
import type { storyPatches } from '../../stories/storyPatches'
import type { useStoryState } from '../../stories/useStoryState'
import type { chapterGroups } from '../../stories/structure'

/** The scene, chapter, arc and story forms, each open on its own. */
export function StoryForms({
  universe,
  chronology,
  story,
  arcs,
  chapters,
  groups,
  sceneForm,
  setSceneForm,
  chapterForm,
  setChapterForm,
  arcForm,
  setArcForm,
  storyForm,
  setStoryForm,
  setSent,
  setAnnouncement,
  reload,
  showStory,
}: Pick<
  ReturnType<typeof useStoryState>,
  | 'sceneForm'
  | 'setSceneForm'
  | 'chapterForm'
  | 'setChapterForm'
  | 'arcForm'
  | 'setArcForm'
  | 'storyForm'
  | 'setStoryForm'
  | 'setSent'
  | 'setAnnouncement'
> &
  Pick<ReturnType<typeof storyPatches>, 'showStory'> & {
    universe: { id: string }
    chronology: Chronology
    story: StoryDetail
    arcs: PlotArc[]
    chapters: Chapter[]
    groups: ReturnType<typeof chapterGroups>
    reload: () => void
  }) {
  const { t } = useI18n()

  return (
    <>
      {sceneForm.mode !== 'closed' ? (
        <SceneForm
          universeId={universe.id}
          storyId={story.id}
          scene={sceneForm.mode === 'new' ? null : sceneForm.scene}
          chapters={chapters}
          arcs={arcs}
          chapterId={sceneForm.mode === 'new' ? sceneForm.chapterId : sceneForm.scene.chapterId}
          chronology={chronology}
          startWithBeat={sceneForm.mode === 'edit' && sceneForm.addBeat === true}
          onClose={() => setSceneForm({ mode: 'closed' })}
          onSaved={(saved) => {
            setSceneForm({ mode: 'closed' })
            setAnnouncement(t('stories.page.savedScene', { title: saved.title }))
            reload()
          }}
          onSuggested={
            sceneForm.mode === 'suggest'
              ? () => {
                  setSceneForm({ mode: 'closed' })
                  setSent(true)
                }
              : undefined
          }
        />
      ) : null}

      {chapterForm.mode !== 'closed' ? (
        <StoryPartForm
          kind="chapter"
          universeId={universe.id}
          storyId={story.id}
          part={chapterForm.mode === 'edit' ? chapterForm.chapter : null}
          number={chapterForm.mode === 'edit' ? chapterNumber(chapterForm.index) : null}
          plotArcId={chapterForm.mode === 'new' ? chapterForm.arcId : null}
          arcs={groups.arcs.map((entry) => entry.arc)}
          onClose={() => setChapterForm({ mode: 'closed' })}
          onSaved={(saved) => {
            setChapterForm({ mode: 'closed' })
            setAnnouncement(t('stories.page.savedChapter', { title: saved.title }))
            reload()
          }}
        />
      ) : null}

      {arcForm.mode !== 'closed' ? (
        <StoryPartForm
          kind="arc"
          universeId={universe.id}
          storyId={story.id}
          part={arcForm.mode === 'edit' ? arcForm.arc : null}
          number={arcForm.mode === 'edit' ? arcNumber(arcForm.index) : null}
          onClose={() => setArcForm({ mode: 'closed' })}
          onSaved={(saved) => {
            setArcForm({ mode: 'closed' })
            setAnnouncement(t('stories.page.savedArc', { title: saved.title }))
            reload()
          }}
        />
      ) : null}

      {storyForm !== 'closed' ? (
        <StoryForm
          universeId={universe.id}
          story={story}
          onClose={() => setStoryForm('closed')}
          onSuggested={
            storyForm === 'suggest'
              ? () => {
                  setStoryForm('closed')
                  setSent(true)
                }
              : undefined
          }
          onSaved={(saved) => {
            setStoryForm('closed')
            showStory(saved)
          }}
        />
      ) : null}
    </>
  )
}
