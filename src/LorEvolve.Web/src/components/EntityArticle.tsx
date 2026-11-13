import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { Check, History, Pencil, X } from 'lucide-react'
import { ActionIcon } from './ActionIcon'
import { EditConflict, LatestText } from './EditConflict'
import { LoreArticle } from './ArticleView'

// The editor and its 125 KB of Tiptap and ProseMirror come only when an author presses Edit; reading needs neither.
const LoreEditor = lazy(() =>
  import('./LoreEditor').then((module) => ({ default: module.LoreEditor })),
)
import { RecoveredDraft } from './RecoveredDraft'
import { VersionActor } from './VersionActor'
import { useAuth } from '../auth/useAuth'
import { useUniverseAccess } from '../universes/access'
import { ApiError } from '../lib/api'
import { formatDateTime } from '../lib/dates'
import { isChangedElsewhere } from '../lib/editConflict'
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
import { confirmAction, confirmDiscard } from '../lib/confirm'
import { t, useI18n } from '../i18n'

type LoadState = { kind: 'loading' } | { kind: 'ready' } | { kind: 'missing' } | { kind: 'error' }

/** The article as the API last confirmed it: what the next save names, and what reading mode shows. */
interface Stored {
  content: string
  updatedAt: string | null
  version: number
}

function storedOf(article: EntityArticle): Stored {
  return { content: article.content, updatedAt: article.updatedAt, version: article.version }
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
 * can be tried again. A save over an article saved by someone else, or from another tab or device, since this one opened is
 * refused (ADR 0043): the text stays in the editor, the author reviews the latest saved article, and then keeps their own
 * text - saving again over what they have seen - or takes the latest. While anything is unsaved, following a link, signing
 * out or leaving the page asks first.
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
  const { t, tx } = useI18n()
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
  const [stored, setStored] = useState<Stored>({ content: '', updatedAt: null, version: 0 })
  const [isEditing, setIsEditing] = useState(false)
  const [editorKey, setEditorKey] = useState(0)
  const [openingWith, setOpeningWith] = useState<string | null>(null)
  const [draft, setDraft] = useState<string | null>(null)
  const [baseline, setBaseline] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
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
        setStored(storedOf(article))
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
  // Parsing up to 200k characters is the cost here, so only the draft is read again on every keystroke.
  const hasArticle = useMemo(() => !isEmptyDocument(stored.content), [stored.content])
  const saved = useMemo(() => comparable(baseline ?? stored.content), [baseline, stored.content])
  const outgoing = comparable(draft)
  const isDirty = isReady && isEditing && draft !== null && outgoing !== saved
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

  useLeaveGuard(isDirty ? t('entity.article.leaveGuard', { name: entityName }) : null, discard)

  /** Saves the document as it stands, naming the stored article's version it was written over. */
  async function save(expectedVersion: number) {
    if (inFlight.current || !isDirty || isTooLong || draft === null) return

    const sent = draft
    inFlight.current = true
    setIsSaving(true)
    setFailure(null)
    setConflict(false)

    try {
      const saved = await saveEntityArticle(universeId, entityId, {
        content: comparable(sent),
        expectedVersion,
      })
      // Measured against what was sent, so anything typed while the save was in flight is still unsaved.
      setStored(storedOf(saved))
      setBaseline(sent)
      setHistoryKey((key) => key + 1)
      if (saved.updatedAt) onSaved(saved.updatedAt)
    } catch (error: unknown) {
      if (isChangedElsewhere(error, ARTICLE_CHANGED)) {
        setConflict(true)
      } else if (error instanceof ApiError && error.status === 404) {
        setFailure(t('entity.article.gone'))
      } else if (error instanceof ApiError && error.status === 400) {
        setFailure(error.fieldErrors.content ?? error.message)
      } else {
        setFailure(t('entity.article.saveFailed'))
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
    shortcut.current = () => void save(stored.version)
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
    setConflict(false)
    setDraft(null)
    setBaseline(null)
    setOpeningWith(recovered)
    setEditorKey((key) => key + 1)
    setIsEditing(true)
  }

  async function finishEditing() {
    if (isDirty && !(await confirmDiscard(t('entity.article.discardConfirm')))) {
      return
    }

    // The author chose to let the unsaved text go, so its recovery copy goes with it.
    if (isDirty) discard()

    setIsEditing(false)
    setOpeningWith(null)
    setDraft(null)
    setBaseline(null)
    setFailure(null)
    setConflict(false)
    // Back to the control that opened the writing, so the keyboard carries on from where it started.
    requestAnimationFrame(() => startButton.current?.focus())
  }

  function reread() {
    setConflict(false)
    setFailure(null)
    setDraft(null)
    setBaseline(null)
    setOpeningWith(null)
    setLoad({ kind: 'loading' })
    setEditorKey((key) => key + 1)
    setReads((current) => current + 1)
    setHistoryKey((key) => key + 1)
  }

  /**
   * The author has seen the latest article and keeps their own text: it stays in the editor, still unsaved, now measured
   * against the latest - and the next save names the version they reviewed, so it is refused again if that moved on too.
   */
  function keepMine(latest: EntityArticle) {
    setStored(storedOf(latest))
    setBaseline(latest.content)
    setConflict(false)
    setHistoryKey((key) => key + 1)
    if (latest.updatedAt) onSaved(latest.updatedAt)
    setAnnouncement(t('entity.article.announce.keptMine'))
    requestAnimationFrame(() => editor.current?.commands.focus())
  }

  /** Lets this window's unsaved text go for the latest article. The conflict notice has already asked. */
  function takeLatest() {
    discard()
    reread()
  }

  /** Puts the recovery copy in the editor as unsaved changes. Saving it is still the author's to do. */
  function recoverDraft() {
    if (!offer) return
    settle()
    startEditing(offer.content)
    setAnnouncement(t('entity.article.announce.recovered'))
  }

  function discardDraft() {
    discard()
    setAnnouncement(t('entity.article.announce.discarded'))
    requestAnimationFrame(() => startButton.current?.focus())
  }

  const status = isSaving
    ? { state: 'saving', text: t('entity.article.status.saving') }
    : isDirty
      ? { state: 'dirty', text: t('entity.article.status.unsaved') }
      : stored.updatedAt === null
        ? { state: 'empty', text: t('entity.article.status.empty') }
        : { state: 'saved', text: t('entity.article.status.saved') }

  const canStart = canEdit && !isHeld
  const note = !canEdit
    ? t('entity.article.note.entryOpen')
    : offer
      ? t('entity.article.note.draftOffered')
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
          {t('entity.article.title')}
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
            {t('entity.article.edit')}
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
          {t('entity.article.opening')}
        </p>
      ) : null}

      {load.kind === 'missing' ? (
        <p className="entry__blank" data-testid="article-missing">
          {t('entity.article.missing')}
        </p>
      ) : null}

      {load.kind === 'error' ? (
        <div className="notice notice--error" role="alert" data-testid="article-load-error">
          <p>{t('entity.article.openFailed')}</p>
          <button
            className="button button--secondary"
            type="button"
            onClick={reread}
            data-testid="article-retry"
          >
            {t('entity.article.retry')}
          </button>
        </div>
      ) : null}

      {offer && access.editContent ? (
        <RecoveredDraft
          what={t('entity.article.recoveredWhat')}
          draft={offer}
          savedUpdatedAt={stored.updatedAt}
          preview={
            isEmptyDocument(offer.content) ? (
              <p className="entry__blank">{t('entity.article.draftBlank')}</p>
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
            <p className="article__emptyline">{t('entity.article.empty.line')}</p>
            {access.editContent ? (
              <>
                <p className="article__emptyhint">
                  {tx('entity.article.empty.hint', { name: <bdi>{entityName}</bdi> })}
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
                  {t('entity.article.empty.write')}
                </button>
              </>
            ) : null}
          </div>
        )
      ) : null}

      {isReady && isEditing ? (
        <div className="article__editing">
          {conflict ? (
            <EditConflict
              what={t('entity.article.conflictWhat')}
              read={() => getEntityArticle(universeId, entityId)}
              renderLatest={(latest) => (
                <LatestText label={t('entity.article.latestLabel')}>
                  {isEmptyDocument(latest.content) ? (
                    <p className="entry__blank">{t('entity.article.latestBlank')}</p>
                  ) : (
                    <LoreArticle content={latest.content} />
                  )}
                </LatestText>
              )}
              onKeepMine={keepMine}
              onUseLatest={takeLatest}
              testId="article-conflict"
            />
          ) : null}

          {failure ? (
            <p className="form__message article__failure" role="alert" data-testid="article-error">
              {failure}
            </p>
          ) : null}

          <Suspense fallback={null}>
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
          </Suspense>

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
                {t('entity.article.tooLong')}
              </p>
            ) : null}
            {failed && isDirty ? (
              <p className="recovery__warning" role="status" data-testid="article-recovery-warning">
                {t('entity.article.recoveryWarning')}
              </p>
            ) : null}
            <div className="article__actions">
              <button
                className="button"
                type="button"
                disabled={!isDirty || isSaving || isTooLong}
                onClick={() => void save(stored.version)}
                aria-describedby={statusId}
                aria-keyshortcuts="Control+S Meta+S"
                data-testid="article-save"
              >
                <ActionIcon icon={Check} />
                {isSaving ? t('entity.article.saving') : t('entity.article.save')}
              </button>
              <button
                className="button button--secondary"
                type="button"
                onClick={finishEditing}
                disabled={isSaving}
                data-testid="article-done"
              >
                <ActionIcon icon={X} />
                {t('entity.article.done')}
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
            setStored(storedOf(article))
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
    return from
      ? t('entity.articleHistory.restored', { number: from.number })
      : t('entity.articleHistory.restoredEarlier')
  }
  if (revision.isEmpty) return t('entity.articleHistory.cleared')
  return revision.kind === RevisionKind.Created
    ? t('entity.articleHistory.first')
    : t('entity.articleHistory.saved')
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
  const { t } = useI18n()
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
      setMessage(t('entity.articleHistory.openFailed'))
    }
  }

  async function restore(revision: ArticleRevisionSummary) {
    if (
      !(await confirmAction({
        title: t('entity.articleHistory.confirm.title', { number: revision.number }),
        message: t('entity.articleHistory.confirm.message'),
        confirmLabel: t('entity.articleHistory.confirm.confirm'),
      }))
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
        current.version,
      )
      setViewing(null)
      onRestored(restored)
    } catch (error: unknown) {
      if (isChangedElsewhere(error, ARTICLE_CHANGED)) {
        setMessage(t('entity.articleHistory.stale'))
        onStale()
      } else if (error instanceof ApiError && error.status === 404) {
        setMessage(t('entity.articleHistory.entryGone'))
      } else {
        setMessage(t('entity.articleHistory.restoreFailed'))
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
        {t('entity.articleHistory.toggle')}
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
              {t('entity.articleHistory.readFailed')}
            </p>
          ) : revisions === null ? (
            <p className="history__quiet" role="status">
              {t('entity.articleHistory.opening')}
            </p>
          ) : revisions.length === 0 ? (
            <p className="history__quiet">{t('entity.articleHistory.none')}</p>
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
                      {index === 0 ? (
                        <span className="version__now">
                          {t('entity.articleHistory.nowShowing')}
                        </span>
                      ) : null}
                    </p>
                    <p className="version__meta">
                      <span>{t('entity.articleHistory.version', { number: revision.number })}</span>
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
                      {viewing?.id === revision.id
                        ? t('entity.articleHistory.hide')
                        : t('entity.articleHistory.view')}
                    </button>
                    {index > 0 ? (
                      <button
                        className="button button--text button--sm"
                        type="button"
                        disabled={busyId !== null}
                        onClick={() => void restore(revision)}
                        data-testid="article-version-restore"
                      >
                        {busyId === revision.id
                          ? t('entity.articleHistory.restoring')
                          : t('entity.articleHistory.restore')}
                      </button>
                    ) : null}
                  </div>

                  {viewing?.id === revision.id ? (
                    <div className="version__snapshot" data-testid="article-version-snapshot">
                      {viewing.detail === null ? (
                        <p className="history__quiet" role="status">
                          {t('entity.articleHistory.snapshotOpening')}
                        </p>
                      ) : isEmptyDocument(viewing.detail.content) ? (
                        <p className="entry__blank">{t('entity.articleHistory.snapshotBlank')}</p>
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
