import { useCallback, useState } from 'react'
import { Quoted } from '../components/NameList'
import { listAllUniverses } from './api'
import type { IdeaQuery } from './types'
import { tx } from '../i18n'
import { useAsyncRead } from '../lib/useAsyncRead'
import type { Outcome } from '../lib/outcome'

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
  const [restoring, setRestoring] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  // The Show filter's universes, read only outside a universe; a list that cannot be read offers none.
  const universesRead = useAsyncRead(
    useCallback(
      (signal: AbortSignal) => (universe ? undefined : listAllUniverses(signal).catch(() => null)),
      [universe],
    ),
    { keep: true },
  )
  const universes = universesRead.load.kind === 'ready' ? universesRead.load.value : null

  // A new filter, search or page keeps the list shown until it lands; a read again that fails says so.
  const list = useAsyncRead(
    useCallback(
      (signal: AbortSignal) =>
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
          signal,
        ),
      [show, storyId, projectId, deleted, search, page, read],
    ),
    { keep: true, keepOnFailure: false },
  )

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
      list.refresh()
    }
  }

  return {
    typed,
    setTyped,
    state: list.load,
    reread: list.refresh,
    universes,
    restoring,
    outcome,
    setOutcome,
    restore,
    retry: list.retry,
  }
}
