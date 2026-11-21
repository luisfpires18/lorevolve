import { useEffect, useRef, useState } from 'react'
import { blockingFindingsOf } from '../canon/blocked'
import type { CanonBlockingFinding } from '../canon/types'
import { ApiError } from '../lib/api'
import { isChangedElsewhere } from '../lib/editConflict'
import { confirmAction, type ConfirmOptions } from '../lib/confirm'

/** One saved version as a history list reads it: every store's summary has at least these. */
export interface RevisionRow {
  id: string
  number: number
}

/**
 * Where a history reads and puts back its versions: an entry, an article or a scene's manuscript. Memoise it on the
 * record's ids, since the list is read again whenever it changes.
 */
export interface RevisionStore<S, D, R> {
  list: (signal: AbortSignal) => Promise<S[]>
  get: (revisionId: string) => Promise<D>
  restore: (revisionId: string, currentVersion: number) => Promise<R>

  /** The 409 code a restore answers with when the record was saved somewhere else since it was read. */
  changedCode: string
}

/** What a history says about putting a version back, in its own store's words. */
export interface RevisionWords<S> {
  openFailed: string
  confirm: (revision: S, revisions: S[]) => ConfirmOptions
  changedElsewhere: string
  failed: string

  /** Said when the record is gone (404). Without it, a 404 is any other refusal. */
  gone?: string

  /** Said once a version is back, as a status line. Without it, nothing is said. */
  done?: (revision: S) => string
}

/** A line under a history: a refusal (`alert`) or a version put back (`status`). */
export interface RevisionMessage {
  tone: 'status' | 'alert'
  text: string
}

interface RevisionsArgs<S, D, R> {
  store: RevisionStore<S, D, R>
  words: RevisionWords<S>

  /** Bumped whenever the record is saved or put back, so the list reads itself again. */
  reloadKey: number

  /** The record's version as the page last read it: what a restore names as the version it was chosen over. */
  currentVersion: number

  onRestored: (restored: R) => void

  /** A restore found the record had moved on since it was read. */
  onStale: () => void

  /** False while the history is closed, so a closed history costs no read. */
  enabled?: boolean

  /**
   * An article's and a manuscript's history keep an opened version open when the list is read again, and close it
   * when one is put back. An entry's closes it whenever the list moves.
   */
  keepOpenOnReload?: boolean

  /** An entry's restore is a gated save: a Canon refusal shows its findings, and any other refusal the API's words. */
  gated?: boolean

  /** Why no version can be put back right now, if none can. */
  blocked?: string | null
}

/** A record's versions: the list read, a version opened in place, and putting one back. */
export function useEntityRevisions<S extends RevisionRow, D, R>({
  store,
  words,
  reloadKey,
  currentVersion,
  onRestored,
  onStale,
  enabled = true,
  keepOpenOnReload = false,
  gated = false,
  blocked = null,
}: RevisionsArgs<S, D, R>) {
  const [revisions, setRevisions] = useState<S[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [viewing, setViewing] = useState<{ id: string; key: number; detail: D | null } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<RevisionMessage | null>(null)
  const [findings, setFindings] = useState<CanonBlockingFinding[] | null>(null)
  const [reads, setReads] = useState(0)
  const inFlight = useRef(false)

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()

    store
      .list(controller.signal)
      .then((loaded) => {
        setRevisions(loaded)
        setStatus('ready')
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('error')
      })

    return () => {
      controller.abort()
    }
  }, [store, enabled, reloadKey, reads])

  // An entry's version stays open only for the history it was opened against. When a write moves the list underneath
  // it, the expansion is stale rather than closed by an effect, so nothing is left showing a snapshot the list no
  // longer explains.
  const openId = viewing && (keepOpenOnReload || viewing.key === reloadKey) ? viewing.id : null
  const opened = openId ? (viewing?.detail ?? null) : null

  async function open(revisionId: string) {
    if (openId === revisionId) {
      setViewing(null)
      return
    }

    setViewing({ id: revisionId, key: reloadKey, detail: null })
    setMessage(null)

    try {
      const detail = await store.get(revisionId)
      setViewing((now) => (now?.id === revisionId ? { ...now, detail } : now))
    } catch {
      setViewing(null)
      setMessage({ tone: 'alert', text: words.openFailed })
    }
  }

  async function restore(revision: S) {
    if (inFlight.current || blocked !== null) return
    if (!(await confirmAction(words.confirm(revision, revisions)))) return

    inFlight.current = true
    setMessage(null)
    setFindings(null)
    setBusyId(revision.id)

    try {
      const restored = await store.restore(revision.id, currentVersion)
      if (keepOpenOnReload) setViewing(null)
      onRestored(restored)
      if (words.done) setMessage({ tone: 'status', text: words.done(revision) })
    } catch (error: unknown) {
      const refusal = gated ? blockingFindingsOf(error) : null
      if (refusal) {
        setFindings(refusal)
      } else if (isChangedElsewhere(error, store.changedCode)) {
        setMessage({ tone: 'alert', text: words.changedElsewhere })
        onStale()
      } else if (words.gone && error instanceof ApiError && error.status === 404) {
        setMessage({ tone: 'alert', text: words.gone })
      } else if (gated && error instanceof ApiError) {
        setMessage({ tone: 'alert', text: error.message })
      } else {
        setMessage({ tone: 'alert', text: words.failed })
      }
    } finally {
      inFlight.current = false
      setBusyId(null)
    }
  }

  return {
    revisions,
    status,
    setStatus,
    opened,
    busyId,
    message,
    blocked: findings,
    setReads,
    openId,
    open,
    restore,
  }
}
