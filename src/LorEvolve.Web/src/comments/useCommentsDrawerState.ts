import { useId, useState } from 'react'
import type { CommentThread } from './api'

export type ReviewTab = 'comments' | 'suggestions'

/** The review drawer's two ids and its states: the tab, the drafts, what is busy, the errors and the threads. */
export function useCommentsDrawerState() {
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
  return {
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
    setBusy,
    message,
    setMessage,
    draftError,
    setDraftError,
    replyError,
    setReplyError,
    threads,
    setThreads,
    failed,
    setFailed,
  }
}
