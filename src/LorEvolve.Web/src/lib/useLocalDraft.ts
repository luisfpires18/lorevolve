import { useCallback, useEffect, useRef, useState } from 'react'
import {
  discardDraft,
  draftKey,
  keepDraft,
  readDraft,
  type DraftScope,
  type LocalDraft,
} from './localDrafts'

/** How long writing pauses before a recovery copy is kept. Short enough to lose little, long enough not to write per key. */
const KEEP_AFTER_MS = 700

/** How long an editor waits to learn whether a copy exists before it opens as if there were none. */
const READ_TIMEOUT_MS = 2000

export interface LocalDraftState {
  /**
   * The copy found for this editor when it opened: `undefined` while it is being looked for, `null` when there is none
   * - or once it has been recovered or discarded - and the copy otherwise.
   */
  found: LocalDraft | null | undefined

  /** Keeps `content` as the recovery copy, shortly after the writing pauses. */
  keep: (content: string, baseUpdatedAt: string | null) => void

  /** Drops the copy this editor kept, if it kept one - for writing that matches what is saved again. */
  forget: () => void

  /** Drops the copy, whoever kept it: the author discarded the unsaved text, or chose to leave it behind. */
  discard: () => void

  /** Stops offering the found copy without touching it: it was recovered into the editor and is still the latest. */
  settle: () => void

  /** True once keeping a copy has failed, until one succeeds again. */
  failed: boolean
}

/**
 * The recovery copy of one editor's unsaved writing (`lib/localDrafts.ts`).
 *
 * The editor decides what is unsaved; this keeps it. While the writing differs from what is saved the editor calls
 * `keep`, and the copy lands shortly after the typing pauses - and at once when the page is hidden or the editor goes
 * away, so a closed tab or a phone switching apps loses little. When the writing matches what is saved again it calls
 * `forget`. When the author discards the writing, `discard`.
 *
 * `scope` is null until the account is known; nothing is read or kept then.
 */
export function useLocalDraft(scope: DraftScope | null): LocalDraftState {
  const key = scope ? draftKey(scope) : null
  const current = useRef(scope)
  const pending = useRef<{ content: string; baseUpdatedAt: string | null } | null>(null)
  const timer = useRef<number | null>(null)
  const kept = useRef(false)

  const [found, setFound] = useState<{ key: string; draft: LocalDraft | null } | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    current.current = scope
  })

  useEffect(() => {
    const reading = current.current
    if (key === null || reading === null) return

    let answered = false
    function answer(draft: LocalDraft | null) {
      if (answered) return
      answered = true
      window.clearTimeout(waiting)
      setFound({ key: key!, draft })
    }

    // No storage, no copy - and storage that never answers, blocked or wedged, must not hold the writing either: after a
    // moment the editor opens on what is saved, exactly as it would have without recovery.
    const waiting = window.setTimeout(() => answer(null), READ_TIMEOUT_MS)
    readDraft(reading).then(answer, () => answer(null))

    return () => {
      answered = true
      window.clearTimeout(waiting)
    }
  }, [key])

  const cancel = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
    pending.current = null
  }, [])

  const flush = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }

    const next = pending.current
    const scopeNow = current.current
    pending.current = null
    if (!next || !scopeNow) return

    kept.current = true
    keepDraft(scopeNow, next.content, next.baseUpdatedAt).then(
      () => setFailed(false),
      () => setFailed(true),
    )
  }, [])

  const keep = useCallback(
    (content: string, baseUpdatedAt: string | null) => {
      pending.current = { content, baseUpdatedAt }
      if (timer.current !== null) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(flush, KEEP_AFTER_MS)
    },
    [flush],
  )

  const drop = useCallback(() => {
    const scopeNow = current.current
    kept.current = false
    if (scopeNow) void discardDraft(scopeNow).catch(() => undefined)
  }, [])

  const forget = useCallback(() => {
    const hadPending = pending.current !== null
    cancel()
    if (kept.current || hadPending) drop()
  }, [cancel, drop])

  const discard = useCallback(() => {
    cancel()
    setFound((previous) => (previous ? { ...previous, draft: null } : previous))
    drop()
  }, [cancel, drop])

  const settle = useCallback(() => {
    setFound((previous) => (previous ? { ...previous, draft: null } : previous))
  }, [])

  useEffect(() => {
    function onHidden() {
      if (document.visibilityState === 'hidden') flush()
    }

    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onHidden)

    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onHidden)
      // Leaving the editor any other way than by discarding keeps what was waiting to be kept.
      flush()
    }
  }, [flush])

  return {
    found: key === null ? null : found?.key === key ? found.draft : undefined,
    keep,
    forget,
    discard,
    settle,
    failed,
  }
}

/** Whether two `updatedAt` values from the API name the same save: both nothing, or the same instant. */
export function sameSave(a: string | null, b: string | null) {
  if (a === null || b === null) return a === b
  return Date.parse(a) === Date.parse(b)
}
