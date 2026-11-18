import type { ReactNode } from 'react'
import { t, useI18n } from '../i18n'
import { useUniverseAccess } from '../universes/access'
import { SaveAction } from './SaveAction'
import { AtSign, FilePenLine, History, Info, LocateFixed, Pencil } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ActionIcon } from './ActionIcon'
import { ActionMenu } from './ActionMenu'
import { EditConflict, LatestText } from './EditConflict'
import { LoreContext } from './LoreContext'
import { findMentions, plainMentions } from '../lore/mentions'
import { MentionProse } from './MentionProse'
import { ManuscriptWriter } from './ManuscriptWriter'
import { NameLinker } from './NameLinker'
import { ManuscriptHistory } from './ManuscriptHistory'
import { ReviewComments } from './ReviewComments'
import { describeSceneSuggestion } from '../stories/sceneDraft'
import { RecoveredDraft } from './RecoveredDraft'
import { SceneBeatList, SceneLore, SceneStamp } from './SceneContext'
import type { Chronology } from '../chronology/types'
import { getSceneManuscript } from '../stories/api'
import { sceneWhen } from '../stories/format'
import { MANUSCRIPT_MAX_LENGTH, type Chapter, type Scene } from '../stories/types'
import { EmptyState } from './EmptyState'
import { numberFormat } from '../i18n/format'
import { storyProjectPath } from '../projects/sections'
import { storedOf, useManuscriptState } from '../stories/useManuscriptState'
import { useManuscriptLoad } from '../stories/useManuscriptLoad'
import { useManuscriptRecovery } from '../stories/useManuscriptRecovery'
import { useManuscriptSave } from '../stories/useManuscriptSave'
import { useManuscriptActions } from '../stories/useManuscriptActions'

const count = (value: number) => numberFormat({}, 'en').format(value)

interface ManuscriptEditorProps {
  universeId: string
  storyId: string
  scene: Scene
  chronology: Chronology
  /** Where the scene is told: its container ("Chapter 2: Arrival", none in a story without chapters) and "Scene 1 of 3". */
  where: { container: ReactNode; position: string }
  /** Opens the scene's own form. Its planning is edited there, never here. */
  onEditScene: (scene: Scene) => void
  /** Opens the scene's form to send a suggestion instead (task 045). */
  onSuggestScene: (scene: Scene) => void
  /** The story's chapters, for how a suggested chapter reads. */
  chapters: Chapter[]
  /** An accepted suggestion changed the scene: the story is read again. */
  onSceneChanged: () => void
  /** Lore Context saved the scene's links: the story page shows the scene as the API answered. */
  onSceneSaved: (scene: Scene) => void
  /** The prose's publication control (ADR 0039), in the save bar beside Save: where the prose is kept is where it is published. */
  publication?: ReactNode
}

/**
 * One scene's prose, and nothing but: plain text that keeps every line break, blank line and character exactly as typed.
 * No formatting and no Markdown. The one thing read in it is a Lore mention, drawn in Write as a chip with its name and
 * stored as `@[Name](lore:<id>)` (ADR 0058).
 *
 * Above it, where the scene is told, its title, and the manuscript's own history - the one tool beside the title, because
 * recovering a version is part of writing - and Lore, the scene's lore in a drawer over the prose (task 048). Edit scene, which opens the scene's own drawer in place, and Show in Scenes,
 * which leads back to the scene's place in the story's structure, are in the scene's ⋯ menu. Under the title, read-only,
 * the scene's planning as the Scenes view draws it - when and through whose eyes, its lore and its beats, edited in the
 * scene's own drawer - folded behind Details on a phone, where every line above the prose is a line of prose gone.
 *
 * Mounted once per scene - the panel keys it by the scene's id - so opening another scene starts from nothing and never
 * shows the last scene's prose under the new title while the new one loads.
 *
 * Saving is explicit: the Save button, or Ctrl+S / Cmd+S from anywhere on the page. The text is unsaved until the API
 * confirms it, so a failed save changes nothing on screen and can simply be tried again. A save over prose that was saved
 * by someone else, or from another tab or device, since this one opened is refused by the API (ADR 0043): the prose stays
 * in the box, the author reviews the latest saved prose, and then keeps their own - saving again over what they have seen
 * - or takes the latest. While anything is unsaved, following a link, signing out or leaving the page asks first.
 *
 * Unsaved writing is also kept on this device as a recovery copy, never sent anywhere. If a scene opens with a copy that
 * differs from what is saved, the saved prose stays in the box, held, until the author recovers the copy or discards it.
 */
export function ManuscriptEditor({
  universeId,
  storyId,
  scene,
  chronology,
  where,
  onEditScene,
  onSuggestScene,
  chapters,
  onSceneChanged,
  onSceneSaved,
  publication,
}: ManuscriptEditorProps) {
  useI18n() // Re-renders on a language change; the words are read through the module's t.
  const access = useUniverseAccess()
  const state = useManuscriptState({ universeId, scene })
  const {
    sceneId,
    titleId,
    statusId,
    tooLongId,
    recoveryId,
    historyId,
    contextId,
    found,
    failed,
    load,
    stored,
    setStored,
    draft,
    setDraft,
    isSaving,
    saves,
    failure,
    conflict,
    isHistoryOpen,
    setIsHistoryOpen,
    isContextOpen,
    setIsContextOpen,
    historyKey,
    setHistoryKey,
    isReading,
    setIsReading,
    isLinking,
    setIsLinking,
    announcement,
    setAnnouncement,
    editor,
  } = state

  useManuscriptLoad({ ...state, universeId, storyId })

  const isReady = load.kind === 'ready'
  const isDirty = isReady && draft !== stored.content
  const isTooLong = draft.length > MANUSCRIPT_MAX_LENGTH

  // A recovery copy that differs from what is saved is offered, and holds the writing until the author chooses. While the
  // copy is still being looked for the box waits too, so nothing typed can overwrite a copy nobody has seen yet.
  const offer = isReady && found && found.content !== stored.content ? found : null
  const isHeld = isReady && (offer !== null || found === undefined)
  const mentioned = isReady ? findMentions(draft) : []

  useManuscriptRecovery({ ...state, isReady, isDirty, isHeld, scene })

  const { save } = useManuscriptSave({ ...state, universeId, storyId, isDirty, isTooLong })

  const { linkFromLore, reread, keepMine, takeLatest, recoverDraft, discardDraft } =
    useManuscriptActions({ ...state, offer })

  const hasContext =
    sceneWhen(chronology, scene.chronology) !== null ||
    scene.pov !== null ||
    scene.entities.length > 0 ||
    scene.beats.length > 0

  const describedBy = [statusId, isTooLong ? tooLongId : null, offer ? recoveryId : null]
    .filter(Boolean)
    .join(' ')

  return (
    <section
      className="manuscript__editor"
      aria-labelledby={titleId}
      data-testid="manuscript-scene"
      data-title={scene.title}
    >
      <header className="manuscript__head">
        <p className="manuscript__where" data-testid="manuscript-where">
          {where.container ? <>{where.container} · </> : null}
          <span className="manuscript__position">{where.position}</span>
        </p>

        <div className="manuscript__titlerow">
          <h3 className="manuscript__title" id={titleId} data-testid="manuscript-scene-title">
            <bdi>{scene.title}</bdi>
          </h3>

          <div className="manuscript__tools rowtools">
            {hasContext ? (
              <button
                className="button button--text manuscript__detailstoggle"
                type="button"
                aria-expanded={isContextOpen}
                aria-controls={contextId}
                onClick={() => setIsContextOpen((open) => !open)}
                title={t('manuscript.editor.detailsTitle')}
                data-testid="manuscript-details-toggle"
              >
                <ActionIcon icon={Info} />
                <span className="visually-hidden">{t('manuscript.editor.detailsName')}</span>
              </button>
            ) : null}
            {access.manageHistory && (stored.updatedAt !== null || isHistoryOpen) ? (
              <button
                className="button button--text"
                type="button"
                aria-expanded={isHistoryOpen}
                aria-controls={historyId}
                aria-describedby={titleId}
                onClick={() => setIsHistoryOpen((open) => !open)}
                data-testid="manuscript-history-toggle"
              >
                <ActionIcon icon={History} />
                <span className="manuscript__toolname">{t('manuscript.editor.historyName')}</span>
                <span className="manuscript__toolshort" aria-hidden="true">
                  {t('manuscript.editor.historyShort')}
                </span>
              </button>
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
        </div>

        {hasContext ? (
          <div
            className="manuscript__context"
            id={contextId}
            data-open={isContextOpen ? 'true' : 'false'}
          >
            <SceneStamp
              universeId={universeId}
              chronology={chronology}
              scene={scene}
              testId="manuscript"
            />
            <SceneLore universeId={universeId} scene={scene} testId="manuscript" />
            <SceneBeatList beats={scene.beats} testId="manuscript" />
          </div>
        ) : null}
      </header>

      {isHistoryOpen && access.manageHistory ? (
        <ManuscriptHistory
          id={historyId}
          universeId={universeId}
          storyId={storyId}
          sceneId={sceneId}
          reloadKey={historyKey}
          current={stored}
          blocked={
            !isReady
              ? t('manuscript.editor.blocked.opening')
              : offer
                ? t('manuscript.editor.blocked.recovered')
                : isDirty
                  ? t('manuscript.editor.blocked.unsaved')
                  : null
          }
          onRestored={(restored) => {
            setStored(storedOf(restored))
            setDraft(restored.content)
            setHistoryKey((key) => key + 1)
          }}
          onStale={reread}
        />
      ) : null}

      {load.kind === 'loading' ? (
        <p className="notice" role="status" data-testid="manuscript-loading">
          {t('manuscript.editor.opening')}
        </p>
      ) : null}

      {load.kind === 'missing' ? (
        <EmptyState
          testId="manuscript-missing"
          title={t('manuscript.editor.missing.title')}
          hint={t('manuscript.editor.missing.hint')}
        />
      ) : null}

      {load.kind === 'error' ? (
        <div className="notice notice--error" role="alert" data-testid="manuscript-load-error">
          <p>{load.message}</p>
          <button
            className="button button--secondary"
            type="button"
            onClick={reread}
            data-testid="manuscript-retry"
          >
            {t('manuscript.editor.retry')}
          </button>
        </div>
      ) : null}

      {isReady ? (
        <>
          {offer && access.editContent ? (
            <div id={recoveryId} className="manuscript__recovery">
              <RecoveredDraft
                what={t('manuscript.editor.recoveredWhat')}
                draft={offer}
                savedUpdatedAt={stored.updatedAt}
                preview={
                  offer.content === '' ? (
                    <p className="entry__blank">{t('manuscript.editor.draftEmpty')}</p>
                  ) : (
                    <div
                      className="recovery__prose prose"
                      role="region"
                      aria-label={t('manuscript.editor.draftText')}
                      tabIndex={0}
                    >
                      {plainMentions(offer.content)}
                    </div>
                  )
                }
                onRecover={recoverDraft}
                onDiscard={discardDraft}
                testId="manuscript-recovery"
              />
            </div>
          ) : null}

          {conflict ? (
            <div className="manuscript__conflict">
              <EditConflict
                what={t('manuscript.editor.conflictWhat')}
                read={() => getSceneManuscript(universeId, storyId, sceneId)}
                renderLatest={(latest) => (
                  <LatestText label={t('manuscript.editor.latestLabel')}>
                    {latest.content === '' ? (
                      <p className="entry__blank">{t('manuscript.editor.latestEmpty')}</p>
                    ) : (
                      <div className="recovery__prose prose" dir="auto">
                        {plainMentions(latest.content)}
                      </div>
                    )}
                  </LatestText>
                )}
                onKeepMine={keepMine}
                onUseLatest={takeLatest}
                testId="manuscript-conflict"
              />
            </div>
          ) : null}

          {failure ? (
            <p
              className="form__message manuscript__failure"
              role="alert"
              data-testid="manuscript-error"
            >
              {failure}
            </p>
          ) : null}

          {access.editContent ? (
            <div
              className="segmented manuscript__mode"
              role="group"
              aria-label={t('manuscript.editor.mode')}
            >
              <button
                className="segmented__option"
                type="button"
                aria-pressed={!isReading}
                onClick={() => setIsReading(false)}
                data-testid="manuscript-mode-write"
              >
                {t('manuscript.editor.modeWrite')}
              </button>
              <button
                className="segmented__option"
                type="button"
                aria-pressed={isReading}
                onClick={() => setIsReading(true)}
                data-testid="manuscript-mode-read"
              >
                {t('manuscript.editor.modeRead')}
              </button>
            </div>
          ) : null}

          {isLinking && access.editContent && !isReading && !isHeld ? (
            <NameLinker
              universeId={universeId}
              entities={scene.entities}
              text={draft}
              onLink={linkFromLore}
              onClose={() => setIsLinking(false)}
            />
          ) : null}
          {access.editContent && !isReading ? (
            <ManuscriptWriter
              universeId={universeId}
              value={draft}
              onChange={setDraft}
              readOnly={isHeld}
              label={t('manuscript.editor.writeLabel', { title: scene.title })}
              placeholder={t('manuscript.editor.placeholder')}
              describedBy={describedBy}
              invalid={isTooLong}
              onAnnounce={setAnnouncement}
              onReady={(made) => {
                editor.current = made
              }}
            />
          ) : (
            // Read, and a collaborator who only reads (ADR 0041 amendment): the prose as prose, each mention a link to its
            // entry (issue 31).
            <div
              className="manuscript__text manuscript__read prose"
              role="region"
              aria-label={t('manuscript.editor.readLabel', { title: scene.title })}
              tabIndex={0}
              data-testid="manuscript-read"
            >
              {draft === '' ? (
                <p className="entry__blank">{t('manuscript.editor.nothingYet')}</p>
              ) : (
                <MentionProse universeId={universeId} text={draft} />
              )}
            </div>
          )}

          {access.editContent ? (
            <div className="manuscript__bar">
              {isTooLong ? (
                <p
                  className="field__error manuscript__toolong"
                  id={tooLongId}
                  data-testid="manuscript-too-long"
                >
                  {t('manuscript.editor.tooLong', {
                    used: count(draft.length),
                    max: count(MANUSCRIPT_MAX_LENGTH),
                  })}
                </p>
              ) : null}
              {failed && isDirty ? (
                <p
                  className="recovery__warning"
                  role="status"
                  data-testid="manuscript-recovery-warning"
                >
                  {t('manuscript.editor.noRecoveryCopy')}
                </p>
              ) : null}
              {publication ? <div className="manuscript__publication">{publication}</div> : null}
              <SaveAction
                label={t('manuscript.editor.save')}
                isDirty={isDirty}
                isSaving={isSaving}
                isBlocked={isTooLong}
                saves={saves}
                restingStatus={
                  stored.updatedAt === null
                    ? t('manuscript.editor.nothingSaved')
                    : t('manuscript.editor.savedStatus')
                }
                statusId={statusId}
                statusTestId="manuscript-status"
                testId="manuscript-save"
                type="button"
                onSave={() => void save(stored.version)}
                keyShortcuts="Control+S Meta+S"
              />
            </div>
          ) : null}
        </>
      ) : null}

      <p className="visually-hidden" role="status" data-testid="manuscript-announcer">
        {announcement}
      </p>
    </section>
  )
}
