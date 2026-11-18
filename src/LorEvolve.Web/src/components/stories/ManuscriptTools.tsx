import { t, useI18n } from '../../i18n'
import { useUniverseAccess } from '../../universes/access'
import { AtSign, FilePenLine, History, Info, LocateFixed, Pencil } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ActionIcon } from '../ActionIcon'
import { ActionMenu } from '../ActionMenu'
import { LoreContext } from '../LoreContext'
import { findMentions } from '../../lore/mentions'
import { ReviewComments } from '../ReviewComments'
import { describeSceneSuggestion } from '../../stories/sceneDraft'
import type { Chronology } from '../../chronology/types'
import type { Chapter, Scene } from '../../stories/types'
import { storyProjectPath } from '../../projects/sections'
import type { useManuscriptState } from '../../stories/useManuscriptState'
import { Button } from '../Button'

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
        <Button
          tone="text"
          icon={Info}
          className="manuscript__detailstoggle"
          aria-expanded={isContextOpen}
          aria-controls={contextId}
          onClick={() => setIsContextOpen((open) => !open)}
          title={t('manuscript.editor.detailsTitle')}
          data-testid="manuscript-details-toggle"
        >
          <span className="visually-hidden">{t('manuscript.editor.detailsName')}</span>
        </Button>
      ) : null}
      {access.manageHistory && (stored.updatedAt !== null || isHistoryOpen) ? (
        <Button
          tone="text"
          icon={History}
          aria-expanded={isHistoryOpen}
          aria-controls={historyId}
          aria-describedby={titleId}
          onClick={() => setIsHistoryOpen((open) => !open)}
          data-testid="manuscript-history-toggle"
        >
          <span className="manuscript__toolname">{t('manuscript.editor.historyName')}</span>
          <span className="manuscript__toolshort" aria-hidden="true">
            {t('manuscript.editor.historyShort')}
          </span>
        </Button>
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
          <button
            className="actionmenu__item"
            type="button"
            onClick={() => onEditScene(scene)}
            data-testid="manuscript-edit-scene"
          >
            <ActionIcon icon={Pencil} />
            {t('manuscript.editor.editScene')}
          </button>
        ) : null}
        {access.suggestChanges && !access.editContent ? (
          <button
            className="actionmenu__item"
            type="button"
            onClick={() => onSuggestScene(scene)}
            data-testid="manuscript-suggest-scene"
          >
            <ActionIcon icon={FilePenLine} />
            {t('manuscript.editor.suggest')}
          </button>
        ) : null}
        {access.editContent && scene.entities.some((entity) => !entity.isTrashed) ? (
          <button
            className="actionmenu__item"
            type="button"
            onClick={() => {
              setIsReading(false)
              setIsLinking(true)
            }}
            data-testid="manuscript-link-names"
          >
            <ActionIcon icon={AtSign} />
            {t('manuscript.editor.linkNames')}
          </button>
        ) : null}
        <Link
          className="actionmenu__item"
          to={`${storyProjectPath(universeId, storyId)}#scene-${scene.id}`}
          data-testid="manuscript-show-scene"
        >
          <ActionIcon icon={LocateFixed} />
          {t('manuscript.editor.showInScenes')}
        </Link>
      </ActionMenu>
    </div>
  )
}
