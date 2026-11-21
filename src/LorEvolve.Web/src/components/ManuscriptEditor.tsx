import type { ReactNode } from 'react'
import { t, useI18n } from '../i18n'
import { useUniverseAccess } from '../universes/access'
import { findMentions, plainMentions } from '../lore/mentions'
import { ArticleHistory } from './lore/ArticleHistory'
import {
  manuscriptHistoryWords,
  manuscriptPanel,
  useManuscriptRevisions,
} from '../stories/manuscriptHistory'
import type { Chronology } from '../chronology/types'
import { sceneWhen } from '../stories/format'
import { MANUSCRIPT_MAX_LENGTH, type Chapter, type Scene } from '../stories/types'
import { EmptyState } from './EmptyState'
import { storedOf, useManuscriptState } from '../stories/useManuscriptState'
import { useManuscriptLoad } from '../stories/useManuscriptLoad'
import { useManuscriptRecovery } from '../stories/useManuscriptRecovery'
import { useManuscriptSave } from '../stories/useManuscriptSave'
import { useManuscriptActions } from '../stories/useManuscriptActions'
import { ManuscriptHead } from './stories/ManuscriptHead'
import { ManuscriptNotices } from './stories/ManuscriptNotices'
import { ManuscriptBody } from './stories/ManuscriptBody'
import { ManuscriptTools } from './stories/ManuscriptTools'
import { SceneBeatList, SceneLore, SceneStamp } from './SceneContext'
import { FactList } from './FactList'
import { SaveBar } from './SaveAction'
import { Announce } from './Announce'
import { ReadGate } from './ReadGate'

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
    found,
    historyId,
    stored,
    setStored,
    draft,
    setDraft,
    load,
    isHistoryOpen,
    historyKey,
    setHistoryKey,
    announcement,
  } = state

  useManuscriptLoad({ ...state, universeId, storyId })
  const revisionStore = useManuscriptRevisions(universeId, storyId, sceneId)

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

  const view = {
    ...state,
    universeId,
    storyId,
    scene,
    chronology,
    chapters,
    access,
    onEditScene,
    onSuggestScene,
    onSceneChanged,
    onSceneSaved,
    publication,
    isDirty,
    isTooLong,
    isHeld,
    offer,
    mentioned,
    hasContext,
    describedBy,
    save,
    linkFromLore,
    reread,
    keepMine,
    takeLatest,
    recoverDraft,
    discardDraft,
  }

  return (
    <section
      className="manuscript__editor"
      aria-labelledby={titleId}
      data-testid="manuscript-scene"
      data-title={scene.title}
    >
      <ManuscriptHead
        where={where}
        titleId={titleId}
        title={scene.title}
        whereTestId="manuscript-where"
        titleTestId="manuscript-scene-title"
        tools={<ManuscriptTools {...view} />}
        context={
          hasContext ? (
            <div id={state.contextId} hidden={state.isPhone && !state.isContextOpen}>
              <FactList look="inline">
                <SceneStamp
                  universeId={universeId}
                  chronology={chronology}
                  scene={scene}
                  testId="manuscript"
                />
                <SceneLore universeId={universeId} scene={scene} testId="manuscript" />
                <SceneBeatList beats={scene.beats} testId="manuscript" />
              </FactList>
            </div>
          ) : null
        }
      />

      {isHistoryOpen && access.manageHistory ? (
        <ArticleHistory
          store={revisionStore}
          words={manuscriptHistoryWords()}
          renderVersion={(detail, revision) =>
            detail.content === '' ? null : (
              <div
                className="recovery__preview recovery__prose prose"
                role="region"
                aria-label={t('manuscript.history.textOf', { number: revision.number })}
                tabIndex={0}
              >
                {plainMentions(detail.content)}
              </div>
            )
          }
          testId="manuscript"
          messageTestId="manuscript-history-message"
          panel={manuscriptPanel(historyId, { isReady, recovered: Boolean(offer), isDirty })}
          reloadKey={historyKey}
          current={stored}
          onRestored={(restored) => {
            setStored(storedOf(restored))
            setDraft(restored.content)
            setHistoryKey((key) => key + 1)
          }}
          onStale={reread}
        />
      ) : null}

      <ReadGate
        load={load}
        loading={{ text: t('manuscript.editor.opening'), testId: 'manuscript-loading' }}
        error={{
          onRetry: reread,
          retryLabel: t('manuscript.editor.retry'),
          retryTestId: 'manuscript-retry',
          testId: 'manuscript-load-error',
        }}
        missing={
          <EmptyState
            testId="manuscript-missing"
            title={t('manuscript.editor.missing.title')}
            hint={t('manuscript.editor.missing.hint')}
          />
        }
      >
        {() => (
          <>
            <ManuscriptNotices {...view} />
            <ManuscriptBody {...view} />
            {access.editContent ? (
              <SaveBar
                keyShortcuts
                count={{
                  id: tooLongId,
                  used: draft.length,
                  max: MANUSCRIPT_MAX_LENGTH,
                  show: 'over',
                  words: { tooLong: 'manuscript.editor.tooLong' },
                  toolong: true,
                  testId: 'manuscript-too-long',
                }}
                warning={
                  state.failed && isDirty
                    ? {
                        text: t('manuscript.editor.noRecoveryCopy'),
                        testId: 'manuscript-recovery-warning',
                      }
                    : null
                }
                save={{
                  label: t('manuscript.editor.save'),
                  isDirty,
                  isSaving: state.isSaving,
                  isBlocked: isTooLong,
                  saves: state.saves,
                  restingStatus:
                    stored.updatedAt === null
                      ? t('manuscript.editor.nothingSaved')
                      : t('manuscript.editor.savedStatus'),
                  statusId,
                  statusTestId: 'manuscript-status',
                  testId: 'manuscript-save',
                  type: 'button',
                  onSave: () => void save(stored.version),
                }}
              >
                {publication}
              </SaveBar>
            ) : null}
          </>
        )}
      </ReadGate>

      <Announce testId="manuscript-announcer">{announcement}</Announce>
    </section>
  )
}
