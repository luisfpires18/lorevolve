import { useEffect, useId, useRef, useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { ActionIcon } from './ActionIcon'
import { QueryTabList, TabPanel } from './QueryTabs'
import { ReviewSuggestions } from './ReviewSuggestions'
import {
  COMMENT_MAX_LENGTH,
  commentsPath,
  listComments,
  replyToThread,
  setThreadResolved,
  startThread,
  type CommentSubject,
  type CommentThread,
} from '../comments/api'
import { useI18n } from '../i18n'
import { ApiError } from '../lib/api'
import { formatDateTime } from '../lib/dates'
import { useDrawerGuard } from '../lib/drawerGuard'
import type { Change } from '../lib/editConflict'
import { useReturnFocus } from '../lib/returnFocus'
import { suggestionsPath } from '../suggestions/api'
import { useUniverseAccess } from '../universes/access'
import { confirmAction } from '../lib/confirm'

interface ReviewCommentsProps<T> {
  universeId: string
  subject: CommentSubject
  /** What the comments are about, as its title or name, for the drawer's heading. */
  subjectName: string
  /** A suggestion's two sides as the subject's own form shows its fields (task 045). */
  describeSuggestion: (before: T, proposed: T) => Change[]
  /** An accepted suggestion changed the subject: the page reads it again. */
  onSuggestionAccepted: () => void
  /** Opens the subject's own form to write a suggestion; the drawer closes first. */
  onSuggest: () => void
}

const SUBJECT_WORDS = {
  entry: 'review.comments.subject.entry',
  story: 'review.comments.subject.story',
  scene: 'review.comments.subject.scene',
} as const

type ReviewTab = 'comments' | 'suggestions'

/**
 * The review layer for one piece of content: a Review button opening a drawer about the content as a whole, with its
 * comment threads (task 043) and its suggested changes (task 045) on two tabs. Nothing is read until the drawer opens -
 * comments then, suggestions only once their tab is chosen - so a page holding many subjects asks for none of either.
 * Every member reads; who may write, resolve, suggest and decide is the API's decision, mirrored here only to leave out
 * controls a role cannot use.
 */
export function ReviewComments<T>({
  universeId,
  subject,
  subjectName,
  describeSuggestion,
  onSuggestionAccepted,
  onSuggest,
}: ReviewCommentsProps<T>) {
  const { t } = useI18n()
  const [isOpen, setIsOpen] = useState(false)
  const path = commentsPath(universeId, subject)

  return (
    <>
      <button
        className="button button--text reviewtrigger"
        type="button"
        aria-haspopup="dialog"
        title={t('review.comments.trigger.title')}
        onClick={() => setIsOpen(true)}
        data-testid="comments-trigger"
      >
        <ActionIcon icon={MessageSquare} />
        <span className="reviewtrigger__label">{t('review.comments.trigger.label')}</span>
      </button>

      {isOpen ? (
        <CommentsDrawer
          key={path}
          universeId={universeId}
          path={path}
          suggestions={suggestionsPath(universeId, subject)}
          kind={subject.kind}
          subjectName={subjectName}
          describeSuggestion={describeSuggestion}
          onSuggestionAccepted={onSuggestionAccepted}
          onSuggest={onSuggest}
          onClose={() => setIsOpen(false)}
        />
      ) : null}
    </>
  )
}

interface DrawerProps<T> {
  universeId: string
  path: string
  suggestions: string
  kind: CommentSubject['kind']
  subjectName: string
  describeSuggestion: (before: T, proposed: T) => Change[]
  onSuggestionAccepted: () => void
  onSuggest: () => void
  onClose: () => void
}

/** Comments read once, when it opens; afterwards kept in step by what each post, reply, resolve and reopen answers. */
function CommentsDrawer<T>({
  universeId,
  path,
  suggestions,
  kind,
  subjectName,
  describeSuggestion,
  onSuggestionAccepted,
  onSuggest,
  onClose,
}: DrawerProps<T>) {
  const { t, tx } = useI18n()
  const access = useUniverseAccess()
  const dialog = useRef<HTMLDialogElement>(null)
  const headingId = useId()
  const newId = useId()
  const [tab, setTab] = useState<ReviewTab>('comments')
  const [draft, setDraft] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [replyError, setReplyError] = useState<string | null>(null)
  const [threads, setThreads] = useState<CommentThread[] | null>(null)
  const [failed, setFailed] = useState(false)

  const isDirty = draft.trim() !== '' || (replyTo !== null && reply.trim() !== '')
  const { close, dialogProps } = useDrawerGuard(isDirty, t('review.comments.leave.title'), onClose)

  useReturnFocus()

  /** Leaves the drawer for the subject's form - asking first if a comment would be lost. */
  async function suggest() {
    if (
      isDirty &&
      !(await confirmAction({
        title: t('review.comments.leave.title'),
        confirmLabel: t('review.comments.leave.confirm'),
        cancelLabel: t('review.comments.leave.keep'),
        variant: 'destructive',
      }))
    ) {
      return
    }
    onClose()
    onSuggest()
  }

  useEffect(() => {
    dialog.current?.showModal()
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    listComments(path, controller.signal)
      .then(setThreads)
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true)
      })

    return () => controller.abort()
  }, [path])

  const onThreads = (change: (current: CommentThread[]) => CommentThread[]) =>
    setThreads((current) => (current === null ? current : change(current)))

  const replace = (updated: CommentThread) =>
    onThreads((current) => current.map((each) => (each.id === updated.id ? updated : each)))

  /** The API's own words for a refusal it explains; otherwise `fallback`. */
  function explain(error: unknown, fallback: string, onField: (text: string) => void) {
    if (error instanceof ApiError && error.fieldErrors.body) {
      onField(error.fieldErrors.body)
    } else if (error instanceof ApiError && error.status === 409) {
      setMessage(error.message)
    } else {
      setMessage(fallback)
    }
  }

  async function post() {
    setMessage(null)
    setDraftError(null)
    setBusy('new')
    try {
      const created = await startThread(path, draft)
      onThreads((current) => [created, ...current])
      setDraft('')
    } catch (error: unknown) {
      explain(error, t('review.comments.postFailed'), setDraftError)
    } finally {
      setBusy(null)
    }
  }

  async function postReply(threadId: string) {
    setMessage(null)
    setReplyError(null)
    setBusy(threadId)
    try {
      replace(await replyToThread(universeId, threadId, reply))
      setReply('')
      setReplyTo(null)
    } catch (error: unknown) {
      explain(error, t('review.comments.postFailed'), setReplyError)
    } finally {
      setBusy(null)
    }
  }

  async function resolve(thread: CommentThread) {
    setMessage(null)
    setBusy(thread.id)
    // Moved to its new list at once; the server's thread replaces it, or the old one comes back.
    replace({ ...thread, isResolved: !thread.isResolved })
    if (replyTo === thread.id) setReplyTo(null)
    try {
      replace(await setThreadResolved(universeId, thread.id, !thread.isResolved))
    } catch {
      replace(thread)
      setMessage(t('review.comments.threadFailed'))
    } finally {
      setBusy(null)
    }
  }

  const open = threads?.filter((thread) => !thread.isResolved) ?? []
  const resolved = threads?.filter((thread) => thread.isResolved) ?? []

  function renderThread(thread: CommentThread) {
    const isReplying = replyTo === thread.id
    const replyId = `${newId}-reply-${thread.id}`
    return (
      <li
        className="reviewthread"
        key={thread.id}
        data-testid="comment-thread"
        data-resolved={thread.isResolved ? 'true' : 'false'}
      >
        <ol className="reviewthread__comments">
          {thread.comments.map((comment, index) => (
            <li
              className={index === 0 ? 'reviewcomment' : 'reviewcomment reviewcomment--reply'}
              key={comment.id}
              data-testid="comment"
            >
              <p className="reviewcomment__meta">
                <span className="reviewcomment__author" data-testid="comment-author">
                  {comment.authorName === null ? (
                    t('review.comments.unknownAuthor')
                  ) : (
                    <bdi>{comment.authorName}</bdi>
                  )}
                </span>
                <time dateTime={comment.createdAt}>{formatDateTime(comment.createdAt)}</time>
              </p>
              <p className="reviewcomment__body" dir="auto" data-testid="comment-body">
                {comment.body}
              </p>
            </li>
          ))}
        </ol>

        {thread.isResolved ? (
          <p className="reviewthread__resolved" data-testid="comment-resolved">
            {tx('review.comments.resolvedBy', {
              name:
                thread.resolvedByName === null ? (
                  t('review.comments.unknownResolver')
                ) : (
                  <bdi>{thread.resolvedByName}</bdi>
                ),
            })}
            {thread.resolvedAt ? <> · {formatDateTime(thread.resolvedAt)}</> : null}
          </p>
        ) : null}

        {isReplying ? (
          <form
            className="reviewthread__reply"
            onSubmit={(event) => {
              event.preventDefault()
              void postReply(thread.id)
            }}
          >
            <label className="field__label" htmlFor={replyId}>
              {t('review.comments.reply')}
            </label>
            <textarea
              id={replyId}
              className="field__input field__input--area"
              rows={3}
              dir="auto"
              maxLength={COMMENT_MAX_LENGTH}
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              aria-invalid={replyError ? true : undefined}
              aria-describedby={replyError ? `${replyId}-error` : undefined}
              autoFocus
              data-testid="comment-reply-text"
            />
            {replyError ? (
              <p className="field__error" id={`${replyId}-error`}>
                {replyError}
              </p>
            ) : null}
            <div className="reviewthread__tools">
              <button
                className="button button--sm"
                type="submit"
                disabled={busy !== null}
                data-testid="comment-reply-post"
              >
                {busy === thread.id ? t('review.comments.posting') : t('review.comments.replyPost')}
              </button>
              <button
                className="button button--text button--sm"
                type="button"
                onClick={() => {
                  setReplyTo(null)
                  setReply('')
                  setReplyError(null)
                }}
              >
                {t('review.comments.cancel')}
              </button>
            </div>
          </form>
        ) : (
          <div className="reviewthread__tools">
            {access.comment && !thread.isResolved ? (
              <button
                className="button button--text button--sm"
                type="button"
                disabled={busy !== null}
                onClick={async () => {
                  if (
                    replyTo !== null &&
                    reply.trim() !== '' &&
                    !(await confirmAction({
                      title: t('review.comments.replyLeave.title'),
                      confirmLabel: t('review.comments.replyLeave.confirm'),
                      cancelLabel: t('review.comments.replyLeave.keep'),
                      variant: 'destructive',
                    }))
                  ) {
                    return
                  }
                  setReplyTo(thread.id)
                  setReply('')
                  setReplyError(null)
                }}
                data-testid="comment-reply"
              >
                {t('review.comments.reply')}
              </button>
            ) : null}
            {access.resolveComments ? (
              <button
                className="button button--text button--sm"
                type="button"
                disabled={busy !== null}
                onClick={() => void resolve(thread)}
                data-testid={thread.isResolved ? 'comment-reopen' : 'comment-resolve'}
              >
                {thread.isResolved ? t('review.comments.reopen') : t('review.comments.resolve')}
              </button>
            ) : null}
          </div>
        )}
      </li>
    )
  }

  return (
    <dialog
      className="drawer reviewdrawer"
      ref={dialog}
      aria-labelledby={headingId}
      {...dialogProps}
      data-testid="comments-drawer"
    >
      <div className="drawer__panel">
        <header className="drawer__head">
          <p className="drawer__eyebrow">{t('review.comments.drawer.eyebrow')}</p>
          <h2 className="drawer__title" id={headingId}>
            <bdi>{subjectName}</bdi>
          </h2>
          <p className="drawer__context">{t(SUBJECT_WORDS[kind])}</p>
        </header>

        <div className="drawer__body">
          <QueryTabList
            label={t('review.comments.tabs.label')}
            idPrefix="review"
            tabs={[
              { id: 'comments', label: t('review.comments.tabs.comments') },
              { id: 'suggestions', label: t('review.comments.tabs.suggestions') },
            ]}
            tab={tab}
            onChoose={setTab}
          />

          <TabPanel idPrefix="review" id="comments" tab={tab}>
            {message ? (
              <p className="form__message" role="alert" data-testid="comments-error">
                {message}
              </p>
            ) : null}

            {access.comment ? (
              <form
                className="reviewform"
                onSubmit={(event) => {
                  event.preventDefault()
                  void post()
                }}
              >
                <label className="field__label" htmlFor={newId}>
                  {t('review.comments.newComment')}
                </label>
                <textarea
                  id={newId}
                  className="field__input field__input--area"
                  rows={3}
                  dir="auto"
                  maxLength={COMMENT_MAX_LENGTH}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  aria-invalid={draftError ? true : undefined}
                  aria-describedby={draftError ? `${newId}-error` : undefined}
                  data-testid="comment-new-text"
                />
                {draftError ? (
                  <p className="field__error" id={`${newId}-error`}>
                    {draftError}
                  </p>
                ) : null}
                <div>
                  <button
                    className="button button--sm"
                    type="submit"
                    disabled={busy !== null}
                    data-testid="comment-new-post"
                  >
                    {busy === 'new' ? t('review.comments.posting') : t('review.comments.post')}
                  </button>
                </div>
              </form>
            ) : (
              <p className="history__quiet" data-testid="comments-read-only">
                {t('review.comments.readOnly')}
              </p>
            )}

            {failed ? (
              <p className="history__quiet" role="status">
                {t('review.comments.readFailed')}
              </p>
            ) : threads === null ? (
              <p className="history__quiet" role="status">
                {t('review.comments.opening')}
              </p>
            ) : threads.length === 0 ? (
              <p className="history__quiet" data-testid="comments-empty">
                {t('review.comments.empty')}
              </p>
            ) : (
              <>
                {open.length > 0 ? (
                  <section className="reviewsection" aria-labelledby={`${headingId}-open`}>
                    <h3 className="reviewsection__title" id={`${headingId}-open`}>
                      {tx('review.comments.open', {
                        n: <span className="reviewsection__count">{open.length}</span>,
                      })}
                    </h3>
                    <ol className="reviewsection__list" data-testid="comments-open">
                      {open.map(renderThread)}
                    </ol>
                  </section>
                ) : null}
                {resolved.length > 0 ? (
                  <details className="reviewsection" data-testid="comments-resolved-group">
                    <summary className="reviewsection__title">
                      {tx('review.comments.resolved', {
                        n: <span className="reviewsection__count">{resolved.length}</span>,
                      })}
                    </summary>
                    <ol className="reviewsection__list" data-testid="comments-resolved">
                      {resolved.map(renderThread)}
                    </ol>
                  </details>
                ) : null}
              </>
            )}
          </TabPanel>

          <TabPanel idPrefix="review" id="suggestions" tab={tab}>
            <ReviewSuggestions
              universeId={universeId}
              path={suggestions}
              what={kind}
              active={tab === 'suggestions'}
              describe={describeSuggestion}
              onAccepted={onSuggestionAccepted}
              onSuggest={suggest}
            />
          </TabPanel>
        </div>

        <footer className="drawer__actions">
          <button
            className="button button--secondary"
            type="button"
            onClick={close}
            data-testid="comments-close"
          >
            {t('review.comments.drawer.close')}
          </button>
        </footer>
      </div>
    </dialog>
  )
}
