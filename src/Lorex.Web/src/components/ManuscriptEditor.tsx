import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useUniverseAccess } from '../universes/access'
import { SaveAction } from './SaveAction'
import { FilePenLine, History, Info, LocateFixed, Pencil } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ActionIcon } from './ActionIcon'
import { ActionMenu } from './ActionMenu'
import { EditConflict, LatestText } from './EditConflict'
import { LoreContext } from './LoreContext'
import { ManuscriptHistory } from './ManuscriptHistory'
import { ReviewComments } from './ReviewComments'
import { describeSceneSuggestion } from '../stories/sceneDraft'
import { RecoveredDraft } from './RecoveredDraft'
import { SceneBeats, SceneLore, SceneStamp } from './SceneContext'
import { useAuth } from '../auth/useAuth'
import type { Chronology } from '../chronology/types'
import { ApiError } from '../lib/api'
import { isChangedElsewhere } from '../lib/editConflict'
import { useLeaveGuard } from '../lib/leaveGuard'
import { useLocalDraft } from '../lib/useLocalDraft'
import { getSceneManuscript, MANUSCRIPT_CHANGED, saveSceneManuscript } from '../stories/api'
import { sceneWhen } from '../stories/format'
import type { SceneBeatReference } from '../stories/structure'
import {
  MANUSCRIPT_MAX_LENGTH,
  type Chapter,
  type Scene,
  type SceneManuscript,
} from '../stories/types'
import { EmptyState } from './EmptyState'

type LoadState =
  { kind: 'loading' } | { kind: 'ready' } | { kind: 'missing' } | { kind: 'error'; message: string }

/** The manuscript as the API last confirmed it: what "unsaved" is measured against, and what the next save names. */
interface Stored {
  content: string
  updatedAt: string | null
  version: number
}

function storedOf(manuscript: SceneManuscript): Stored {
  return {
    content: manuscript.content,
    updatedAt: manuscript.updatedAt,
    version: manuscript.version,
  }
}

const count = new Intl.NumberFormat('en')

interface ManuscriptEditorProps {
  universeId: string
  storyId: string
  scene: Scene
  chronology: Chronology
  /** Where the scene is told: its container ("Chapter 2: Arrival", none in a story without chapters) and "Scene 1 of 3". */
  where: { container: ReactNode; position: string }
  /** The plot beats that point at this scene. Shown only: the plot owns those links. */
  beats: SceneBeatReference[]
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
 * One scene's prose, and nothing but: a plain text box that keeps every line break, blank line and character exactly as
 * typed. No formatting, no Markdown and no reading of the text - a name written here links to nothing.
 *
 * Above it, where the scene is told, its title, and the manuscript's own history - the one tool beside the title, because
 * recovering a version is part of writing - and Lore, the scene's lore in a drawer over the prose (task 048). Edit scene, which opens the scene's own drawer in place, and Show in Scenes,
 * which leads back to the scene's place in the story's structure, are in the scene's ⋯ menu. Under the title, read-only,
 * the scene's planning as the Scenes view draws it - when and through whose eyes, its lore and its beats, each a link to
 * where it is edited - folded behind Details on a phone, where every line above the prose is a line of prose gone.
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
  beats,
  onEditScene,
  onSuggestScene,
  chapters,
  onSceneChanged,
  onSceneSaved,
  publication,
}: ManuscriptEditorProps) {
  const access = useUniverseAccess()
  const sceneId = scene.id
  const titleId = useId()
  const editorId = useId()
  const statusId = useId()
  const tooLongId = useId()
  const recoveryId = useId()
  const historyId = useId()
  const contextId = useId()

  const { user } = useAuth()
  const { found, keep, forget, discard, settle, failed } = useLocalDraft(
    user ? { accountId: user.id, universeId, kind: 'manuscript', contentId: sceneId } : null,
  )

  const [load, setLoad] = useState<LoadState>({ kind: 'loading' })
  const [reads, setReads] = useState(0)
  const [stored, setStored] = useState<Stored>({ content: '', updatedAt: null, version: 0 })
  const [draft, setDraft] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saves, setSaves] = useState(0)
  const [failure, setFailure] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  // On a phone the scene's planning folds behind Details, so the prose starts on the first screen. Wider, it is always shown.
  const [isContextOpen, setIsContextOpen] = useState(false)
  const [historyKey, setHistoryKey] = useState(0)
  const [announcement, setAnnouncement] = useState('')
  const inFlight = useRef(false)
  const editor = useRef<HTMLTextAreaElement>(null)
  const shortcut = useRef<() => void>(() => {})

  useEffect(() => {
    const controller = new AbortController()

    getSceneManuscript(universeId, storyId, sceneId, controller.signal)
      .then((manuscript) => {
        setStored(storedOf(manuscript))
        setDraft(manuscript.content)
        setLoad({ kind: 'ready' })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setLoad(
          error instanceof ApiError && error.status === 404
            ? { kind: 'missing' }
            : { kind: 'error', message: 'This manuscript could not be opened.' },
        )
      })

    return () => {
      controller.abort()
    }
  }, [universeId, storyId, sceneId, reads])

  const isReady = load.kind === 'ready'
  const isDirty = isReady && draft !== stored.content
  const isTooLong = draft.length > MANUSCRIPT_MAX_LENGTH

  // A recovery copy that differs from what is saved is offered, and holds the writing until the author chooses. While the
  // copy is still being looked for the box waits too, so nothing typed can overwrite a copy nobody has seen yet.
  const offer = isReady && found && found.content !== stored.content ? found : null
  const isHeld = isReady && (offer !== null || found === undefined)

  // A copy identical to what is saved is nothing to recover: it goes without a word.
  useEffect(() => {
    if (isReady && found && found.content === stored.content) discard()
  }, [isReady, found, stored.content, discard])

  // The recovery copy follows the writing: kept while it differs from what is saved, let go once it does not.
  useEffect(() => {
    if (!isReady || isHeld) return
    if (isDirty) {
      keep(draft, stored.updatedAt)
    } else {
      forget()
    }
  }, [isReady, isHeld, isDirty, draft, stored.updatedAt, keep, forget])

  useLeaveGuard(
    isDirty ? `“${scene.title}” has unsaved changes. Leave without saving them?` : null,
    discard,
  )

  /** Saves the text as it stands, naming the stored manuscript's version it was written over. */
  async function save(expectedVersion: number) {
    if (inFlight.current || !isDirty || isTooLong) return

    const content = draft
    inFlight.current = true
    setIsSaving(true)
    setFailure(null)
    setConflict(false)

    try {
      const saved = await saveSceneManuscript(universeId, storyId, sceneId, {
        content,
        expectedVersion,
      })
      // Measured against what was sent, so anything typed while the save was in flight is still unsaved.
      setStored(storedOf(saved))
      setHistoryKey((key) => key + 1)
      setSaves((count) => count + 1)
    } catch (error: unknown) {
      if (isChangedElsewhere(error, MANUSCRIPT_CHANGED)) {
        setConflict(true)
      } else if (error instanceof ApiError && error.status === 404) {
        setFailure(
          'This scene is no longer in the story, so its manuscript could not be saved. It may have been moved to the Trash in another window. Your text is still here: copy it before you leave.',
        )
      } else if (error instanceof ApiError && error.status === 400) {
        setFailure(error.message)
      } else {
        setFailure('The manuscript could not be saved. Your text is still here. Try again.')
      }
    } finally {
      inFlight.current = false
      setIsSaving(false)
      // Save keeps the focus through a save (it is only aria-disabled). Should the focus have been let go anyway, rather
      // than leave it nowhere, it goes back to the prose.
      requestAnimationFrame(() => {
        const active = document.activeElement
        if (!active || active === document.body) editor.current?.focus({ preventScroll: true })
      })
    }
  }

  // Ctrl+S / Cmd+S saves from anywhere while a scene is open - the outline, the tools, or after Save has let go of the
  // focus - and never opens the browser's "Save page". The listener reads the latest save through a ref, so it is
  // added once rather than on every keystroke.
  useEffect(() => {
    shortcut.current = () => void save(stored.version)
  })

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 's') {
        event.preventDefault()
        shortcut.current()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  function reread() {
    setConflict(false)
    setFailure(null)
    setLoad({ kind: 'loading' })
    setReads((current) => current + 1)
  }

  /**
   * The author has seen the latest prose and keeps their own: it stays in the box, still unsaved, now measured against the
   * latest - and the next save names the version they reviewed, so it is refused again if that moved on too.
   */
  function keepMine(latest: SceneManuscript) {
    setStored(storedOf(latest))
    setConflict(false)
    setHistoryKey((key) => key + 1)
    setAnnouncement('Your changes are still unsaved. Save when you’re ready.')
    requestAnimationFrame(() => editor.current?.focus())
  }

  /** Lets this window's unsaved prose go for the latest. The conflict notice has already asked. */
  function takeLatest() {
    discard()
    reread()
  }

  /** Puts the recovery copy in the box as unsaved writing. Saving it is still the author's to do. */
  function recoverDraft() {
    if (!offer) return
    settle()
    setDraft(offer.content)
    setAnnouncement('The recovered draft is in the editor. It is not saved yet.')
    requestAnimationFrame(() => editor.current?.focus())
  }

  function discardDraft() {
    discard()
    setAnnouncement('The recovered draft was discarded. The saved manuscript is unchanged.')
    requestAnimationFrame(() => editor.current?.focus())
  }

  const hasContext =
    sceneWhen(chronology, scene.chronology) !== null ||
    scene.pov !== null ||
    scene.entities.length > 0 ||
    beats.length > 0

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
                title="Scene details"
                data-testid="manuscript-details-toggle"
              >
                <ActionIcon icon={Info} />
                <span className="visually-hidden">Scene details</span>
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
                <span className="manuscript__toolname">Manuscript history</span>
                <span className="manuscript__toolshort" aria-hidden="true">
                  History
                </span>
              </button>
            ) : null}
            <LoreContext
              universeId={universeId}
              storyId={storyId}
              scene={scene}
              chronology={chronology}
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
              label={`More actions for ${scene.title}`}
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
                  Edit scene
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
                  Suggest changes
                </button>
              ) : null}
              <Link
                className="actionmenu__item"
                to={`/app/universes/${universeId}/stories/${storyId}#scene-${scene.id}`}
                data-testid="manuscript-show-scene"
              >
                <ActionIcon icon={LocateFixed} />
                Show in Scenes
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
            <SceneBeats
              universeId={universeId}
              storyId={storyId}
              beats={beats}
              testId="manuscript"
            />
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
              ? 'Opening the manuscript…'
              : offer
                ? 'Recover or discard the recovered draft first.'
                : isDirty
                  ? 'Save your changes first: putting back a saved version would replace text that is not saved.'
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
          Opening the manuscript…
        </p>
      ) : null}

      {load.kind === 'missing' ? (
        <EmptyState
          testId="manuscript-missing"
          title="This scene is not here."
          hint="It may have been moved to the Trash."
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
            Try again
          </button>
        </div>
      ) : null}

      {isReady ? (
        <>
          {offer && access.editContent ? (
            <div id={recoveryId} className="manuscript__recovery">
              <RecoveredDraft
                what="this scene's manuscript"
                draft={offer}
                savedUpdatedAt={stored.updatedAt}
                preview={
                  offer.content === '' ? (
                    <p className="entry__blank">No text in this draft.</p>
                  ) : (
                    <div
                      className="recovery__prose prose"
                      role="region"
                      aria-label="Text of the recovered draft"
                      tabIndex={0}
                    >
                      {offer.content}
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
                what="manuscript"
                read={() => getSceneManuscript(universeId, storyId, sceneId)}
                renderLatest={(latest) => (
                  <LatestText label="Latest saved manuscript">
                    {latest.content === '' ? (
                      <p className="entry__blank">No text in the latest version.</p>
                    ) : (
                      <div className="recovery__prose prose" dir="auto">
                        {latest.content}
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

          <label className="visually-hidden" htmlFor={editorId}>
            Manuscript of “{scene.title}”
          </label>
          <textarea
            ref={editor}
            id={editorId}
            className="manuscript__text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            // Read only for a collaborator who reads (ADR 0041 amendment): the prose, with no Save under it.
            readOnly={isHeld || !access.editContent}
            placeholder={access.editContent ? 'Write the scene.' : 'Nothing written yet.'}
            spellCheck
            aria-describedby={describedBy}
            aria-invalid={isTooLong ? true : undefined}
            aria-keyshortcuts="Control+S Meta+S"
            data-testid="manuscript-editor"
            data-held={isHeld ? 'true' : 'false'}
          />

          {access.editContent ? (
            <div className="manuscript__bar">
              {isTooLong ? (
                <p
                  className="field__error manuscript__toolong"
                  id={tooLongId}
                  data-testid="manuscript-too-long"
                >
                  Too long to save: {count.format(draft.length)} of{' '}
                  {count.format(MANUSCRIPT_MAX_LENGTH)} characters. Split it into more scenes.
                </p>
              ) : null}
              {failed && isDirty ? (
                <p
                  className="recovery__warning"
                  role="status"
                  data-testid="manuscript-recovery-warning"
                >
                  This device could not keep a recovery copy of these changes. Save to keep them.
                </p>
              ) : null}
              {publication ? <div className="manuscript__publication">{publication}</div> : null}
              <SaveAction
                label="Save changes"
                isDirty={isDirty}
                isSaving={isSaving}
                isBlocked={isTooLong}
                saves={saves}
                restingStatus={stored.updatedAt === null ? 'Nothing saved yet' : 'Saved'}
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
