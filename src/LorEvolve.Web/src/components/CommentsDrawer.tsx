import { useEffect } from 'react'
import { QueryTabList, TabPanel } from './QueryTabs'
import { ReviewSuggestions } from './ReviewSuggestions'
import { listComments, type CommentSubject } from '../comments/api'
import { useI18n } from '../i18n'
import { Drawer } from './Drawer'
import type { Change } from '../lib/editConflict'
import { useReturnFocus } from '../lib/returnFocus'
import { useUniverseAccess } from '../universes/access'
import { useCommentsDrawerState } from '../comments/useCommentsDrawerState'
import { commentsDrawerActions } from '../comments/commentsDrawerActions'
import { CommentThreadItem } from './CommentThreadItem'
import { CommentNewForm } from './CommentNewForm'

const SUBJECT_WORDS = {
  entry: 'review.comments.subject.entry',
  story: 'review.comments.subject.story',
  scene: 'review.comments.subject.scene',
} as const

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
export function CommentsDrawer<T>({
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
  const state = useCommentsDrawerState()
  const {
    headingId,
    newId,
    tab,
    setTab,
    draft,
    setDraft,
    replyTo,
    setReplyTo,
    reply,
    setReply,
    busy,
    message,
    draftError,
    replyError,
    setReplyError,
    threads,
    setThreads,
    failed,
    setFailed,
  } = state

  const isDirty = draft.trim() !== '' || (replyTo !== null && reply.trim() !== '')
  useReturnFocus()

  useEffect(() => {
    const controller = new AbortController()

    listComments(path, controller.signal)
      .then(setThreads)
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true)
      })

    return () => controller.abort()
  }, [path])

  const { suggest, post, postReply, resolve } = commentsDrawerActions({
    ...state,
    universeId,
    path,
    t,
    isDirty,
    onClose,
    onSuggest,
  })

  const open = threads?.filter((thread) => !thread.isResolved) ?? []
  const resolved = threads?.filter((thread) => thread.isResolved) ?? []

  return (
    <Drawer
      className="reviewdrawer"
      testId="comments-drawer"
      titleId={headingId}
      eyebrow={t('review.comments.drawer.eyebrow')}
      title={<bdi>{subjectName}</bdi>}
      context={<p className="drawer__context">{t(SUBJECT_WORDS[kind])}</p>}
      isDirty={isDirty}
      leaveMessage={t('review.comments.leave.title')}
      onClose={onClose}
      actions={(close) => (
        <button
          className="button button--secondary"
          type="button"
          onClick={close}
          data-testid="comments-close"
        >
          {t('review.comments.drawer.close')}
        </button>
      )}
    >
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
          <CommentNewForm
            newId={newId}
            draft={draft}
            setDraft={setDraft}
            draftError={draftError}
            busy={busy}
            post={post}
          />
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
                  {open.map((thread) => (
                    <CommentThreadItem
                      key={thread.id}
                      thread={thread}
                      newId={newId}
                      access={access}
                      replyTo={replyTo}
                      setReplyTo={setReplyTo}
                      reply={reply}
                      setReply={setReply}
                      replyError={replyError}
                      setReplyError={setReplyError}
                      busy={busy}
                      postReply={postReply}
                      resolve={resolve}
                    />
                  ))}
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
                  {resolved.map((thread) => (
                    <CommentThreadItem
                      key={thread.id}
                      thread={thread}
                      newId={newId}
                      access={access}
                      replyTo={replyTo}
                      setReplyTo={setReplyTo}
                      reply={reply}
                      setReply={setReply}
                      replyError={replyError}
                      setReplyError={setReplyError}
                      busy={busy}
                      postReply={postReply}
                      resolve={resolve}
                    />
                  ))}
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
    </Drawer>
  )
}
