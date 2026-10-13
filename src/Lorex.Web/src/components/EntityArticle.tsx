import { useEffect, useId, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { Check, History, Pencil, X } from 'lucide-react'
import { ActionIcon } from './ActionIcon'
import { LoreArticle, LoreEditor } from './LoreEditor'
import { RecoveredDraft } from './RecoveredDraft'
import { VersionActor } from './VersionActor'
import { useAuth } from '../auth/useAuth'
import { useUniverseAccess } from '../universes/access'
import { ApiError } from '../lib/api'
import { formatDateTime } from '../lib/dates'
import { useLeaveGuard } from '../lib/leaveGuard'
import { useLocalDraft } from '../lib/useLocalDraft'
import {
  ARTICLE_CHANGED,
  ARTICLE_MAX_LENGTH,
  getArticleRevision,
  getEntityArticle,
  listArticleRevisions,
  restoreArticleRevision,
  saveEntityArticle,
  type ArticleRevisionDetail,
  type ArticleRevisionSummary,
  type EntityArticle,
} from '../lore/article'
import { isEmptyDocument } from '../lore/document'
import { RevisionKind } from '../lore/revisions'

type LoadState = { kind: 'loading' } | { kind: 'ready' } | { kind: 'missing' } | { kind: 'error' }

/** The article as the API last confirmed it: what the next save names, and what reading mode shows. */
interface Stored {
  content: string
  updatedAt: string | null
}

/** The stored moment a stale save's refusal reports, when it carries one. */
function storedMomentOf(problem: unknown) {
  const updatedAt = (problem as { updatedAt?: unknown } | null)?.updatedAt
  return typeof updatedAt === 'string' ? updatedAt : null
}

/** A document with no text in it is no article, however the editor happens to serialise the emptiness. */
function comparable(json: string | null) {
  return isEmptyDocument(json) ? '' : (json ?? '')
}

interface EntityArticleSectionProps {
  universeId: string
  entityId: string
  entityName: string

  /** False while the entry's own form is open: one editor on the page at a time. */
  canEdit: boolean

  /** Told whenever writing starts or stops, so the page can give the writing its own save bar. */
  onEditingChange: (editing: boolean) => void

  /** A save or a restore landed, and the entry was worked on at this moment. */
  onSaved: (updatedAt: string) => void
}

/**
 * An entry's article: the long-form prose that describes it, beside - never inside - the structured lore.
 *
 * It is read on its own route when the entry opens, and written on it: an explicit Save, or Ctrl+S / Cmd+S while the
 * focus is in the article. The text is unsaved until the API confirms it, so a failed save changes nothing on screen and
 * can be tried again. A save over an article saved from another tab or device since this one opened is refused, and the
 * author chooses - keep this text, or load that one. While anything is unsaved, following a link, signing out or leaving
 * the page asks first.
 *
 * Unsaved writing is also kept on this device as a recovery copy, never sent anywhere (ADR 0029). When the entry opens
 * with a copy that differs from what is saved, the saved article is shown and the copy is offered beside it: recovering
 * puts it in the editor as unsaved changes, and discarding lets it go.
 *
 * The article has no status of its own: it is as settled as its entry, whose Canon control sits above it. And it is
 * never read for meaning - a year written here is a word, not a field.
 *
 * Under the article, its own history: every saved version, readable in place and restorable as the next version.
 */
export function EntityArticleSection({
  universeId,
  entityId,
  entityName,
  canEdit,
  onEditingChange,
  onSaved,
}: EntityArticleSectionProps) {
  const headingId = useId()
  const statusId = useId()
  const tooLongId = useId()
  const noteId = useId()

  const { user } = useAuth()
  // A Viewer or Reviewer reads the article and nothing more: no Edit, no Write, no history (ADR 0041 amendment).
  const access = useUniverseAccess()
  const { found, keep, forget, discard, settle, failed } = useLocalDraft(
    user ? { accountId: user.id, universeId, kind: 'article', contentId: entityId } : null,
  )

  const [load, setLoad] = useState<LoadState>({ kind: 'loading' })
  const [reads, setReads] = useState(0)
  const [stored, setStored] = useState<Stored>({ content: '', updatedAt: null })
  const [isEditing, setIsEditing] = useState(false)
  const [editorKey, setEditorKey] = useState(0)
  const [openingWith, setOpeningWith] = useState<string | null>(null)
  const [draft, setDraft] = useState<string | null>(null)
  const [baseline, setBaseline] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [conflict, setConflict] = useState<{ updatedAt: string | null } | null>(null)
  const [historyKey, setHistoryKey] = useState(0)
  const [announcement, setAnnouncement] = useState('')
  const inFlight = useRef(false)
  const section = useRef<HTMLElement>(null)
  const startButton = useRef<HTMLButtonElement>(null)
  const editor = useRef<Editor | null>(null)
  const shortcut = useRef<() => void>(() => {})

  useEffect(() => {
    const controller = new AbortController()

    getEntityArticle(universeId, entityId, controller.signal)
      .then((article) => {
        setStored({ content: article.content, updatedAt: article.updatedAt })
        setLoad({ kind: 'ready' })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setLoad(
          error instanceof ApiError && error.status === 404
            ? { kind: 'missing' }
            : { kind: 'error' },
        )
      })

    return () => {
      controller.abort()
    }
  }, [universeId, entityId, reads])

  useEffect(() => {
    onEditingChange(isEditing)
  }, [isEditing, onEditingChange])

  useEffect(
    () => () => {
      onEditingChange(false)
    },
    [onEditingChange],
  )

  const isReady = load.kind === 'ready'
  const hasArticle = !isEmptyDocument(stored.content)
  const outgoing = comparable(draft)
  const isDirty =
    isReady && isEditing && draft !== null && outgoing !== comparable(baseline ?? stored.content)
  const isTooLong = outgoing.length > ARTICLE_MAX_LENGTH

  // A recovery copy that differs from what is saved is offered. Writing waits for the author's choice - and, for the
  // moment it takes, for the copy to be looked for - so nothing typed can overwrite a copy nobody has seen yet.
  const offer =
    isReady && !isEditing && found && comparable(found.content) !== comparable(stored.content)
      ? found
      : null
  const isHeld = isReady && !isEditing && (offer !== null || found === undefined)

  // A copy identical to what is saved is nothing to recover: it goes without a word.
  useEffect(() => {
    if (isReady && found && comparable(found.content) === comparable(stored.content)) discard()
  }, [isReady, found, stored.content, discard])

  // The recovery copy follows the writing: kept while it differs from what is saved, let go once it does not.
  useEffect(() => {
    if (!isEditing || draft === null) return
    if (isDirty) {
      keep(outgoing, stored.updatedAt)
    } else {
      forget()
    }
  }, [isEditing, draft, isDirty, outgoing, stored.updatedAt, keep, forget])

  useLeaveGuard(
    isDirty
      ? `The article for “${entityName}” has unsaved changes. Leave without saving them?`
      : null,
    discard,
  )

  /** Saves the document as it stands, naming the stored article it was written over. */
  async function save(expectedUpdatedAt: string | null) {
    if (inFlight.current || !isDirty || isTooLong || draft === null) return

    const sent = draft
    inFlight.current = true
    setIsSaving(true)
    setFailure(null)
    setConflict(null)

    try {
      const saved = await saveEntityArticle(universeId, entityId, {
        content: comparable(sent),
        expectedUpdatedAt,
      })
      // Measured against what was sent, so anything typed while the save was in flight is still unsaved.
      setStored({ content: saved.content, updatedAt: saved.updatedAt })
      setBaseline(sent)
      setHistoryKey((key) => key + 1)
      if (saved.updatedAt) onSaved(saved.updatedAt)
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 409 && error.code === ARTICLE_CHANGED) {
        setConflict({ updatedAt: storedMomentOf(error.problem) })
      } else if (error instanceof ApiError && error.status === 404) {
        setFailure(
          'This entry is no longer here, so the article could not be saved. It may have been moved to the Trash in another window. Your text is still here: copy it before you leave.',
        )
      } else if (error instanceof ApiError && error.status === 400) {
        setFailure(error.fieldErrors.content ?? error.message)
      } else {
        setFailure('The article could not be saved. Your text is still here. Try again.')
      }
    } finally {
      inFlight.current = false
      setIsSaving(false)
      // Save disables itself while it works and once nothing is unsaved, and a disabled button lets go of the focus.
      // Rather than leave it nowhere, it goes back to the writing.
      requestAnimationFrame(() => {
        const active = document.activeElement
        const current = editor.current
        // The writing may have been closed, or reloaded into a new editor, while the save was in flight.
        if ((!active || active === document.body) && current && !current.isDestroyed) {
          current.commands.focus()
        }
      })
    }
  }

  // Ctrl+S / Cmd+S saves while the article is being written and the focus is in it - the text, its toolbar or its save
  // bar - or nowhere at all, and then never opens the browser's "Save page". Anywhere else on the page, and whenever the
  // article is only being read, the shortcut is the browser's. The listener reads the latest save through a ref, so it
  // is added once per editing session rather than on every keystroke.
  useEffect(() => {
    shortcut.current = () => void save(stored.updatedAt)
  })

  useEffect(() => {
    if (!isEditing) return

    function onKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== 's')
        return

      const active = document.activeElement
      const inArticle =
        active === null || active === document.body || (section.current?.contains(active) ?? false)
      if (!inArticle) return

      event.preventDefault()
      shortcut.current()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isEditing])

  /** Opens the writing on the saved article - or, when recovering, on the recovery copy, unsaved against it. */
  function startEditing(recovered: string | null = null) {
    setFailure(null)
    setConflict(null)
    setDraft(null)
    setBaseline(null)
    setOpeningWith(recovered)
    setEditorKey((key) => key + 1)
    setIsEditing(true)
  }

  function finishEditing() {
    if (
      isDirty &&
      !window.confirm('Close the article without saving your changes? They will be lost.')
    ) {
      return
    }

    // The author chose to let the unsaved text go, so its recovery copy goes with it.
    if (isDirty) discard()

    setIsEditing(false)
    setOpeningWith(null)
    setDraft(null)
    setBaseline(null)
    setFailure(null)
    setConflict(null)
    // Back to the control that opened the writing, so the keyboard carries on from where it started.
    requestAnimationFrame(() => startButton.current?.focus())
  }

  function reread() {
    setConflict(null)
    setFailure(null)
    setDraft(null)
    setBaseline(null)
    setOpeningWith(null)
    setLoad({ kind: 'loading' })
    setEditorKey((key) => key + 1)
    setReads((current) => current + 1)
    setHistoryKey((key) => key + 1)
  }

  /** Throws away this window's unsaved text for the version saved elsewhere - only once the author says so. */
  function loadSavedVersion() {
    if (
      !window.confirm(
        'Replace the text here with the version saved elsewhere? What you wrote here since your last save will be lost.',
      )
    ) {
      return
    }
    discard()
    reread()
  }

  /** Puts the recovery copy in the editor as unsaved changes. Saving it is still the author's to do. */
  function recoverDraft() {
    if (!offer) return
    settle()
    startEditing(offer.content)
    setAnnouncement('The recovered draft is in the editor. It is not saved yet.')
  }

  function discardDraft() {
    discard()
    setAnnouncement('The recovered draft was discarded. The saved article is unchanged.')
    requestAnimationFrame(() => startButton.current?.focus())
  }

  const status = isSaving
    ? { state: 'saving', text: 'Saving…' }
    : isDirty
      ? { state: 'dirty', text: 'Unsaved changes' }
      : stored.updatedAt === null
        ? { state: 'empty', text: 'Nothing saved yet' }
        : { state: 'saved', text: 'Saved' }

  const canStart = canEdit && !isHeld
  const note = !canEdit
    ? 'Save or cancel the changes to this entry first, then edit its article.'
    : offer
      ? 'Recover or discard the recovered draft first, then edit the article.'
      : null

  return (
    <section
      ref={section}
      // The entry page's `#article` - where a search result found in the article lands (ADR 0031).
      id="article"
      className="entry__article article"
      aria-labelledby={headingId}
      data-testid="article"
      data-state={isEditing ? 'editing' : 'reading'}
    >
      <div className="article__head">
        {/* Focusable by script only, so arriving at the article puts a keyboard and a screen reader on its heading. */}
        <h2
          className="article__title sectionrule sectionrule--accent"
          id={headingId}
          tabIndex={-1}
          data-arrival-focus
        >
          Article
        </h2>
        {isReady && !isEditing && hasArticle && access.editContent ? (
          <button
            ref={startButton}
            className="button button--secondary"
            type="button"
            onClick={() => startEditing()}
            disabled={!canStart}
            aria-describedby={note ? noteId : undefined}
            data-testid="article-edit"
          >
            <ActionIcon icon={Pencil} />
            Edit article
          </button>
        ) : null}
      </div>

      {/* Beside the control it explains, not after the whole article. */}
      {isReady && !isEditing && note && access.editContent ? (
        <p className="article__note" id={noteId} data-testid="article-note">
          {note}
        </p>
      ) : null}

      {load.kind === 'loading' ? (
        <p className="notice" role="status" data-testid="article-loading">
          Opening the article…
        </p>
      ) : null}

      {load.kind === 'missing' ? (
        <p className="entry__blank" data-testid="article-missing">
          This entry is not here, so neither is its article.
        </p>
      ) : null}

      {load.kind === 'error' ? (
        <div className="notice notice--error" role="alert" data-testid="article-load-error">
          <p>The article could not be opened.</p>
          <button
            className="button button--secondary"
            type="button"
            onClick={reread}
            data-testid="article-retry"
          >
            Try again
          </button>
        </div>
      ) : null}

      {offer && access.editContent ? (
        <RecoveredDraft
          what="this article"
          draft={offer}
          savedUpdatedAt={stored.updatedAt}
          preview={
            isEmptyDocument(offer.content) ? (
              <p className="entry__blank">No text in this draft.</p>
            ) : (
              <LoreArticle content={offer.content} />
            )
          }
          onRecover={recoverDraft}
          onDiscard={discardDraft}
          testId="article-recovery"
        />
      ) : null}

      {isReady && !isEditing ? (
        hasArticle ? (
          <LoreArticle content={stored.content} />
        ) : (
          <div className="article__empty" data-testid="article-empty">
            <p className="article__emptyline">No article yet.</p>
            {access.editContent ? (
              <>
                <p className="article__emptyhint">
                  Everything worth telling about <bdi>{entityName}</bdi> beyond its facts belongs
                  here.
                </p>
                <button
                  ref={startButton}
                  className="button"
                  type="button"
                  onClick={() => startEditing()}
                  disabled={!canStart}
                  aria-describedby={note ? noteId : undefined}
                  data-testid="article-write"
                >
                  <ActionIcon icon={Pencil} />
                  Write the article
                </button>
              </>
            ) : null}
          </div>
        )
      ) : null}

      {isReady && isEditing ? (
        <div className="article__editing">
          {conflict ? (
            <div className="article__conflict" role="alert" data-testid="article-conflict">
              <p className="article__conflicttext">
                This article was saved in another tab or on another device after you opened it here.
                Nothing was overwritten, and your text below is not saved.
              </p>
              <div className="article__conflictactions">
                <button
                  className="button button--secondary"
                  type="button"
                  disabled={isSaving}
                  onClick={() => void save(conflict.updatedAt)}
                  data-testid="article-keep-mine"
                >
                  Save mine over it
                </button>
                <button
                  className="button button--secondary"
                  type="button"
                  disabled={isSaving}
                  onClick={loadSavedVersion}
                  data-testid="article-load-saved"
                >
                  Load the saved version
                </button>
              </div>
            </div>
          ) : null}

          {failure ? (
            <p className="form__message article__failure" role="alert" data-testid="article-error">
              {failure}
            </p>
          ) : null}

          <LoreEditor
            key={editorKey}
            value={openingWith ?? (stored.content || null)}
            autofocus
            onChange={setDraft}
            onReady={(created) => {
              editor.current = created
              const written = JSON.stringify(created.getJSON())
              // A recovered copy is measured against what is saved, so it opens as the unsaved changes it is.
              setBaseline(openingWith === null ? written : stored.content)
              setDraft(written)
            }}
            describedBy={`${statusId} ${tooLongId}`}
            keyShortcuts="Control+S Meta+S"
          />

          <div className="article__bar">
            <p
              className="article__status"
              id={statusId}
              role="status"
              data-state={status.state}
              data-testid="article-status"
            >
              {status.text}
            </p>
            {isTooLong ? (
              <p
                className="field__error article__toolong"
                id={tooLongId}
                data-testid="article-too-long"
              >
                This article is too long to save. Shorten it, or move part of it into another entry.
              </p>
            ) : null}
            {failed && isDirty ? (
              <p className="recovery__warning" role="status" data-testid="article-recovery-warning">
                This device could not keep a recovery copy of these changes. Save to keep them.
              </p>
            ) : null}
            <div className="article__actions">
              <button
                className="button"
                type="button"
                disabled={!isDirty || isSaving || isTooLong}
                onClick={() => void save(stored.updatedAt)}
                aria-describedby={statusId}
                aria-keyshortcuts="Control+S Meta+S"
                data-testid="article-save"
              >
                <ActionIcon icon={Check} />
                {isSaving ? 'Saving…' : 'Save'}
              </button>
              <button
                className="button button--secondary"
                type="button"
                onClick={finishEditing}
                disabled={isSaving}
                data-testid="article-done"
              >
                <ActionIcon icon={X} />
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {load.kind !== 'missing' &&
      !isEditing &&
      stored.updatedAt !== null &&
      access.manageHistory ? (
        <ArticleHistory
          universeId={universeId}
          entityId={entityId}
          reloadKey={historyKey}
          current={stored}
          onRestored={(article) => {
            setStored({ content: article.content, updatedAt: article.updatedAt })
            setHistoryKey((key) => key + 1)
            if (article.updatedAt) onSaved(article.updatedAt)
          }}
          onStale={() => setReads((current) => current + 1)}
        />
      ) : null}

      <p className="visually-hidden" role="status" data-testid="article-announcer">
        {announcement}
      </p>
    </section>
  )
}

interface ArticleHistoryProps {
  universeId: string
  entityId: string

  /** Bumped by the article whenever it is saved or put back, so an open history reads itself again. */
  reloadKey: number

  /** The article as it stands - what a restore names as the version it is written over. */
  current: Stored

  onRestored: (article: EntityArticle) => void

  /** A restore found the article had moved on since it was read: read it again. Nothing unsaved exists while reading. */
  onStale: () => void
}

/** What a version was, in a few words. */
function describeVersion(revision: ArticleRevisionSummary, revisions: ArticleRevisionSummary[]) {
  if (revision.kind === RevisionKind.Restored) {
    const from = revisions.find((candidate) => candidate.id === revision.restoredFromRevisionId)
    return from ? `Restored version ${from.number}` : 'Restored an earlier version'
  }
  if (revision.isEmpty) return 'Cleared the article'
  return revision.kind === RevisionKind.Created ? 'First version' : 'Saved'
}

/**
 * The article's own history, closed until it is asked for - reading an entry costs no history read. Newest first; any
 * version can be read in place, and any but the newest put back, which is recorded as a version of its own.
 */
function ArticleHistory({
  universeId,
  entityId,
  reloadKey,
  current,
  onRestored,
  onStale,
}: ArticleHistoryProps) {
  const bodyId = useId()
  const [isOpen, setIsOpen] = useState(false)
  const [revisions, setRevisions] = useState<ArticleRevisionSummary[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [viewing, setViewing] = useState<{
    id: string
    detail: ArticleRevisionDetail | null
  } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return

    const controller = new AbortController()
    listArticleRevisions(universeId, entityId, controller.signal)
      .then((loaded) => {
        setRevisions(loaded)
        setFailed(false)
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true)
      })

    return () => {
      controller.abort()
    }
  }, [isOpen, universeId, entityId, reloadKey])

  async function view(revisionId: string) {
    if (viewing?.id === revisionId) {
      setViewing(null)
      return
    }

    setViewing({ id: revisionId, detail: null })
    setMessage(null)

    try {
      const detail = await getArticleRevision(universeId, entityId, revisionId)
      setViewing((open) => (open?.id === revisionId ? { id: revisionId, detail } : open))
    } catch {
      setViewing(null)
      setMessage('That version could not be opened.')
    }
  }

  async function restore(revision: ArticleRevisionSummary) {
    if (
      !window.confirm(
        `Put version ${revision.number} of the article back? It becomes the newest version, and nothing in the history is lost.`,
      )
    ) {
      return
    }

    setBusyId(revision.id)
    setMessage(null)

    try {
      const restored = await restoreArticleRevision(
        universeId,
        entityId,
        revision.id,
        current.updatedAt,
      )
      setViewing(null)
      onRestored(restored)
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 409 && error.code === ARTICLE_CHANGED) {
        setMessage(
          'The article was saved somewhere else after this page opened, so nothing was put back. The article above is now the latest.',
        )
        onStale()
      } else if (error instanceof ApiError && error.status === 404) {
        setMessage('This entry is no longer here, so nothing was put back.')
      } else {
        setMessage('That version could not be put back.')
      }
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="article__history">
      <button
        className="button button--secondary article__historytoggle"
        type="button"
        aria-expanded={isOpen}
        aria-controls={bodyId}
        onClick={() => setIsOpen((open) => !open)}
        data-testid="article-history-toggle"
      >
        <ActionIcon icon={History} />
        Article history
      </button>

      {isOpen ? (
        <div id={bodyId}>
          {message ? (
            <p className="form__message" role="alert" data-testid="article-history-error">
              {message}
            </p>
          ) : null}

          {failed ? (
            <p className="history__quiet" role="status">
              The article&rsquo;s history could not be read.
            </p>
          ) : revisions === null ? (
            <p className="history__quiet" role="status">
              Opening&hellip;
            </p>
          ) : revisions.length === 0 ? (
            <p className="history__quiet">No saved versions yet.</p>
          ) : (
            <ol className="history__list" data-testid="article-history-list">
              {revisions.map((revision, index) => (
                <li className="version" key={revision.id} data-version={revision.number}>
                  <p className="version__when">
                    <time dateTime={revision.createdAt}>{formatDateTime(revision.createdAt)}</time>
                  </p>

                  <div className="version__body">
                    <p className="version__what" data-testid="article-version-what">
                      {describeVersion(revision, revisions)}
                      {index === 0 ? <span className="version__now">now showing</span> : null}
                    </p>
                    <p className="version__meta">
                      <span>Version {revision.number}</span>
                      <VersionActor name={revision.actorName} />
                    </p>
                  </div>

                  <div className="version__tools">
                    <button
                      className="button button--text button--sm"
                      type="button"
                      aria-expanded={viewing?.id === revision.id}
                      onClick={() => void view(revision.id)}
                      data-testid="article-version-view"
                    >
                      {viewing?.id === revision.id ? 'Hide' : 'View'}
                    </button>
                    {index > 0 ? (
                      <button
                        className="button button--text button--sm"
                        type="button"
                        disabled={busyId !== null}
                        onClick={() => void restore(revision)}
                        data-testid="article-version-restore"
                      >
                        {busyId === revision.id ? 'Restoring' : 'Restore'}
                      </button>
                    ) : null}
                  </div>

                  {viewing?.id === revision.id ? (
                    <div className="version__snapshot" data-testid="article-version-snapshot">
                      {viewing.detail === null ? (
                        <p className="history__quiet" role="status">
                          Opening&hellip;
                        </p>
                      ) : isEmptyDocument(viewing.detail.content) ? (
                        <p className="entry__blank">No text in this version.</p>
                      ) : (
                        <LoreArticle content={viewing.detail.content} />
                      )}
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : null}
    </div>
  )
}
