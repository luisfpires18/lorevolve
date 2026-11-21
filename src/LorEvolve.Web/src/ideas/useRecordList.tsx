import { useEffect, useState } from 'react'
import { Quoted } from '../components/NameList'
import { listAllUniverses } from './api'
import type { IdeaQuery } from './types'
import { t, tx } from '../i18n'
import type { Load } from '../lib/useAsyncRead'
import type { Outcome } from '../lib/outcome'
import type { UniverseSummary } from '../universes/types'

/** The value of the Show filter that means records in no universe. Never a universe id. */
export const UNASSIGNED = 'unassigned'

/** The words of an ideas list (`ideas.browser`) or the boards list (`ideas.boards`). */
export type RecordWords = 'ideas.browser' | 'ideas.boards'

/**
 * An ideas or boards list's states and reads: what is typed, the universes for the Show filter, the page the address
 * asks for, and Restore, which says what it did. The page is kept while the next one is read; only Retry shows loading.
 * `read` and `restoreRecord` are the feature's API calls (stable module functions). Ideas pass `storyId` and
 * `projectId` (G20); boards leave them out.
 */
export function useRecordList<P, R extends { id: string; title: string }>({
  search,
  universe,
  show,
  storyId = null,
  projectId = null,
  deleted,
  page,
  read,
  restoreRecord,
  restored,
  words: w,
}: {
  search: string
  universe: { id: string; name: string } | null
  show: string
  storyId?: string | null
  projectId?: string | null
  deleted: boolean
  page: number
  read: (query: IdeaQuery, signal?: AbortSignal) => Promise<P>
  restoreRecord: (id: string) => Promise<R>
  /** What a restore that worked says, with the way to the record. */
  restored: (record: R) => Outcome
  words: RecordWords
}) {
  const [typed, setTyped] = useState(search)
  const [state, setState] = useState<Load<P>>({ kind: 'loading' })
  const [reads, setReads] = useState(0)
  const [universes, setUniverses] = useState<UniverseSummary[] | null>(null)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  useEffect(() => {
    if (universe) return
    const controller = new AbortController()
    listAllUniverses(controller.signal)
      .then(setUniverses)
      .catch(() => {
        if (!controller.signal.aborted) setUniverses(null)
      })
    return () => controller.abort()
  }, [universe])

  useEffect(() => {
    const controller = new AbortController()
    read(
      {
        universeId: show !== '' && show !== UNASSIGNED ? show : null,
        storyId,
        projectId,
        unassigned: show === UNASSIGNED,
        deleted,
        search,
        page,
      },
      controller.signal,
    )
      .then((result) => setState({ kind: 'ready', value: result }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ kind: 'error', message: t(`${w}.loadFailed`) })
      })
    return () => controller.abort()
  }, [show, storyId, projectId, deleted, search, page, reads, read, w])

  async function restore(record: { id: string; title: string }) {
    setRestoring(record.id)
    setOutcome(null)
    try {
      setOutcome(restored(await restoreRecord(record.id)))
    } catch {
      setOutcome({
        text: tx(`${w}.restoreFailed`, { title: <Quoted text={record.title} /> }),
        link: null,
      })
    } finally {
      setRestoring(null)
      setReads((current) => current + 1)
    }
  }

  function retry() {
    setState({ kind: 'loading' })
    setReads((current) => current + 1)
  }

  return {
    typed,
    setTyped,
    state,
    setReads,
    universes,
    restoring,
    outcome,
    setOutcome,
    restore,
    retry,
  }
}
