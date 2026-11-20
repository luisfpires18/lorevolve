import { t, useI18n } from '../../i18n'
import { useUniverseAccess } from '../../universes/access'
import { AtSign, FilePenLine, History, Info, LocateFixed, Pencil } from 'lucide-react'
import { ActionMenu, ActionMenuItem } from '../ActionMenu'
import { LoreContext } from '../LoreContext'
import { findMentions } from '../../lore/mentions'
import { ReviewComments } from '../ReviewComments'
import { describeSceneSuggestion } from '../../stories/sceneDraft'
import type { Chronology } from '../../chronology/types'
import type { Chapter, Scene } from '../../stories/types'
import { storyProjectPath } from '../../projects/sections'
import type { useManuscriptState } from '../../stories/useManuscriptState'
import { DisclosureButton } from '../DisclosureButton'

export type ManuscriptToolsProps = ReturnType<typeof useManuscriptState> & {
  universeId: string
  storyId: string
  scene: Scene
  chronology: Chronology
  chapters: Chapter[]
  access: ReturnType<typeof useUniverseAccess>
  mentioned: ReturnType<typeof findMentions>
  hasContext: boolean
  onEditScene: (scene: Scene) => void
  onSuggestScene: (scene: Scene) => void
  onSceneChanged: () => void
  onSceneSaved: (scene: Scene) => void
}

/** The tools beside the scene's title: details, history, Lore Context, comments and the scene's menu. */
export function ManuscriptTools({
  historyId,
  titleId,
  contextId,
  stored,
  isHistoryOpen,
  setIsHistoryOpen,
  isContextOpen,
  setIsContextOpen,
  setIsReading,
  setIsLinking,
  mentioned,
  hasContext,
  access,
  universeId,
  storyId,
  scene,
  chronology,
  chapters,
  onEditScene,
  onSuggestScene,
  onSceneChanged,
  onSceneSaved,
}: ManuscriptToolsProps) {
  useI18n() // Re-renders on a language change; the words are read through the module's t.

  return (
    <div className="manuscript__tools rowtools">
      {hasContext ? (
        <DisclosureButton
          tone="text"
          icon={Info}
          className="manuscript__detailstoggle"
          expanded={isContextOpen}
          controls={contextId}
          onToggle={() => setIsContextOpen((open) => !open)}
          title={t('manuscript.editor.detailsTitle')}
          data-testid="manuscript-details-toggle"
        >
          <span className="visually-hidden">{t('manuscript.editor.detailsName')}</span>
        </DisclosureButton>
      ) : null}
      {access.manageHistory && (stored.updatedAt !== null || isHistoryOpen) ? (
        <DisclosureButton
          tone="text"
          icon={History}
          expanded={isHistoryOpen}
          controls={historyId}
          aria-describedby={titleId}
          onToggle={() => setIsHistoryOpen((open) => !open)}
          data-testid="manuscript-history-toggle"
        >
          <span className="manuscript__toolname">{t('manuscript.editor.historyName')}</span>
          <span className="manuscript__toolshort" aria-hidden="true">
            {t('manuscript.editor.historyShort')}
          </span>
        </DisclosureButton>
      ) : null}
      <LoreContext
        universeId={universeId}
        storyId={storyId}
        scene={scene}
        chronology={chronology}
        mentions={mentioned}
        onSceneSaved={onSceneSaved}
        onSceneChanged={onSceneChanged}
      />
      <ReviewComments
        universeId={universeId}
        subject={{ kind: 'scene', storyId, sceneId: scene.id }}
        subjectName={scene.title}
        describeSuggestion={describeSceneSuggestion(chapters, chronology)}
        onSuggestionAccepted={onSceneChanged}
        onSuggest={() => onSuggestScene(scene)}
      />
      <ActionMenu
        label={t('manuscript.editor.moreActions', { title: scene.title })}
        triggerTestId="manuscript-scene-actions"
      >
        {access.editContent ? (
          <ActionMenuItem
            icon={Pencil}
            onClick={() => onEditScene(scene)}
            testId="manuscript-edit-scene"
          >
            {t('manuscript.editor.editScene')}
          </ActionMenuItem>
        ) : null}
        {access.suggestChanges && !access.editContent ? (
          <ActionMenuItem
            icon={FilePenLine}
            onClick={() => onSuggestScene(scene)}
            testId="manuscript-suggest-scene"
          >
            {t('manuscript.editor.suggest')}
          </ActionMenuItem>
        ) : null}
        {access.editContent && scene.entities.some((entity) => !entity.isTrashed) ? (
          <ActionMenuItem
            icon={AtSign}
            onClick={() => {
              setIsReading(false)
              setIsLinking(true)
            }}
            testId="manuscript-link-names"
          >
            {t('manuscript.editor.linkNames')}
          </ActionMenuItem>
        ) : null}
        <ActionMenuItem
          icon={LocateFixed}
          to={`${storyProjectPath(universeId, storyId)}#scene-${scene.id}`}
          testId="manuscript-show-scene"
        >
          {t('manuscript.editor.showInScenes')}
        </ActionMenuItem>
      </ActionMenu>
    </div>
  )
}
