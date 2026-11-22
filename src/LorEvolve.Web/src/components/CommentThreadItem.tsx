import { COMMENT_MAX_LENGTH, type CommentThread } from '../comments/api'
import { useI18n } from '../i18n'
import { Field } from './Field'
import type { useUniverseAccess } from '../universes/access'
import { confirmAction } from '../lib/confirm'
import { Button } from './Button'
import { FormActions } from './FormActions'
import { QuietNote } from './QuietNote'
import { VersionActor } from './VersionActor'

/** One comment thread: its comments, how it was resolved, the reply form or Reply, and Resolve or Reopen. */
export function CommentThreadItem({
  thread,
  newId,
  access,
  replyTo,
  setReplyTo,
  reply,
  setReply,
  replyError,
  setReplyError,
  busy,
  postReply,
  resolve,
}: {
  thread: CommentThread
  newId: string
  access: ReturnType<typeof useUniverseAccess>
  replyTo: string | null
  setReplyTo: (value: string | null) => void
  reply: string
  setReply: (value: string) => void
  replyError: string | null
  setReplyError: (value: string | null) => void
  busy: string | null
  postReply: (threadId: string) => Promise<void>
  resolve: (thread: CommentThread) => Promise<void>
}) {
  const { t } = useI18n()
  const isReplying = replyTo === thread.id
  const replyId = `${newId}-reply-${thread.id}`
  return (
    <li
      className="reviewthread"
      data-testid="comment-thread"
      data-resolved={thread.isResolved ? 'true' : 'false'}
    >
      <ol className="plainlist stack stack--3">
        {thread.comments.map((comment, index) => (
          <li
            className={index === 0 ? 'reviewcomment' : 'reviewcomment reviewcomment--reply'}
            key={comment.id}
            data-testid="comment"
          >
            <p className="reviewcomment__meta">
              <VersionActor
                name={comment.authorName}
                unknown={t('review.comments.unknownAuthor')}
                at={comment.createdAt}
                testId="comment-author"
              />
            </p>
            <p className="reviewcomment__body" dir="auto" data-testid="comment-body">
              {comment.body}
            </p>
          </li>
        ))}
      </ol>

      {thread.isResolved ? (
        <QuietNote className="reviewthread__resolved" testId="comment-resolved">
          <VersionActor
            name={thread.resolvedByName}
            unknown={t('review.comments.unknownResolver')}
            lead="review.comments.resolvedBy"
            at={thread.resolvedAt}
          />
        </QuietNote>
      ) : null}

      {isReplying ? (
        <form
          className="reviewthread__reply"
          onSubmit={(event) => {
            event.preventDefault()
            void postReply(thread.id)
          }}
        >
          <Field id={replyId} label={t('review.comments.reply')} error={replyError}>
            {(control) => (
              <textarea
                {...control}
                className="field__input field__input--area"
                rows={3}
                dir="auto"
                maxLength={COMMENT_MAX_LENGTH}
                value={reply}
                onChange={(event) => setReply(event.target.value)}
                autoFocus
                data-testid="comment-reply-text"
              />
            )}
          </Field>
          <div className="reviewthread__tools">
            <FormActions
              submitLabel={t('review.comments.replyPost')}
              busy={busy === thread.id}
              busyLabel={t('review.comments.posting')}
              disabled={busy !== null}
              submitTestId="comment-reply-post"
              onCancel={() => {
                setReplyTo(null)
                setReply('')
                setReplyError(null)
              }}
              size="sm"
            />
          </div>
        </form>
      ) : (
        <div className="reviewthread__tools">
          {access.comment && !thread.isResolved ? (
            <Button
              tone="text"
              size="sm"
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
            </Button>
          ) : null}
          {access.resolveComments ? (
            <Button
              tone="text"
              size="sm"
              disabled={busy !== null}
              onClick={() => void resolve(thread)}
              data-testid={thread.isResolved ? 'comment-reopen' : 'comment-resolve'}
            >
              {thread.isResolved ? t('review.comments.reopen') : t('review.comments.resolve')}
            </Button>
          ) : null}
        </div>
      )}
    </li>
  )
}
