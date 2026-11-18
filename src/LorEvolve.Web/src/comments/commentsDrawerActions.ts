import { replyToThread, setThreadResolved, startThread, type CommentThread } from './api'
import { ApiError } from '../lib/api'
import { confirmAction } from '../lib/confirm'
import type { useI18n } from '../i18n'
import type { useCommentsDrawerState } from './useCommentsDrawerState'

/** The review drawer's handlers: leaving for a suggestion, and posting, replying, resolving and reopening threads. */
export function commentsDrawerActions({
  universeId,
  path,
  t,
  isDirty,
  onClose,
  onSuggest,
  draft,
  setDraft,
  replyTo,
  setReplyTo,
  reply,
  setReply,
  setBusy,
  setMessage,
  setDraftError,
  setReplyError,
  setThreads,
}: ReturnType<typeof useCommentsDrawerState> & {
  universeId: string
  path: string
  t: ReturnType<typeof useI18n>['t']
  isDirty: boolean
  onClose: () => void
  onSuggest: () => void
}) {
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
  return { suggest, post, postReply, resolve }
}
