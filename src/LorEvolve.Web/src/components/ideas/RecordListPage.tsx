import { useCallback, useId, type ReactNode } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { OutcomeNotice, StatusNotice } from '../Callout'
import { ReadGate } from '../ReadGate'
import { Quoted } from '../NameList'
import { PagedList } from '../Pager'
import { RecordListControls } from './RecordListControls'
import { RecordListEmpty } from './RecordListEmpty'
import type { IdeaQuery } from '../../ideas/types'
import { useRecordList, type RecordWords } from '../../ideas/useRecordList'
import { t, tx, useI18n } from '../../i18n'
import { useListFilters } from '../../lib/useListFilters'
import type { Outcome } from '../../lib/outcome'

/** What a record's editor says it did before handing back to the list. */
export interface RecordListNotice {
  deleted?: { id: string; title: string }
  created?: { id: string; title: string }
}

/** How a row is drawn: the list's state the row needs. */
export interface RecordRowState<Item> {
  deleted: boolean
  restoring: string | null
  restore: (record: Item) => Promise<void>
}

/**
 * An ideas or boards list (ADR 0066): the header, the capture (ideas only, live view), what the editor reported, the
 * filters, what a restore did, the rows, the empty state and the pager. The filter lives in the address, so Back,
 * Forward and a reload keep it. `testId` (`ideas`, `boards`) names the section and prefixes its parts' test ids.
 * Catalogue: `docs/design/ui-components.md`.
 */
export function RecordListPage<
  Item extends { id: string; title: string },
  R extends { id: string; title: string },
>({
  testId,
  className,
  words: w,
  universe,
  basePath,
  headingId,
  header,
  capture,
  storyId,
  projectId,
  read,
  restoreRecord,
  restored,
  follow,
  allLabel,
  strayOption,
  listTestId,
  renderRow,
  emptyScope,
  newLabel,
  newTestId,
  restoredLinkTestId,
}: {
  testId: string
  className: string
  words: RecordWords
  universe: { id: string; name: string } | null
  basePath: string
  headingId: string
  header: ReactNode
  /** The one-line capture over the live list; `onCaptured` reads the first page again. */
  capture?: (onCaptured: () => void) => ReactNode
  storyId?: string | null
  projectId?: string | null
  read: (
    query: IdeaQuery,
    signal?: AbortSignal,
  ) => Promise<{ items: Item[]; page: number; totalPages: number }>
  restoreRecord: (id: string) => Promise<R>
  restored: (record: R) => Outcome
  /** The ideas list: the box follows the address and `update` is memoised. The boards list: neither (G1). */
  follow: boolean
  allLabel: string
  strayOption: boolean
  listTestId: string
  renderRow: (record: Item, row: RecordRowState<Item>) => ReactNode
  emptyScope?: 'story' | 'project' | null
  newLabel: string
  newTestId: string
  restoredLinkTestId?: string
}) {
  useI18n() // Re-renders on a language change; the words are read through the module's t.
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const searchId = useId()
  const showId = useId()

  const deleted = params.get('view') === 'deleted'
  const show = universe ? universe.id : (params.get('show') ?? '')
  const search = params.get('q') ?? ''
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)

  const list = useRecordList({
    search,
    universe,
    show,
    storyId,
    projectId,
    deleted,
    page,
    read,
    restoreRecord,
    restored,
    words: w,
  })
  const { state, universes, restoring, outcome, setOutcome, reread, restore } = list
  const { update } = useListFilters({
    ...list,
    setParams,
    search,
    followAddress: follow,
    memo: follow,
  })

  /** A captured record is the newest: shown at the top of the first page, which is read again. */
  const captured = useCallback(() => {
    setOutcome(null)
    if (page !== 1) update({ page: null })
    reread()
  }, [page, update, setOutcome, reread])

  const notice = location.state as RecordListNotice | null
  const result = state.kind === 'ready' ? state.value : null
  const isFiltered = search.trim() !== '' || (!universe && show !== '')

  return (
    <section className={className} aria-labelledby={headingId} data-testid={testId}>
      {header}

      {capture && !deleted ? capture(captured) : null}

      {notice?.created && !deleted ? (
        <StatusNotice className="ideas__notice" testId={`${testId}-created-notice`}>
          {tx(`${w}.created`, { title: <Quoted text={notice.created.title} /> })}
        </StatusNotice>
      ) : null}

      {notice?.deleted && !deleted ? (
        <StatusNotice className="ideas__notice" testId={`${testId}-deleted-notice`}>
          {tx(`${w}.deletedNotice`, { title: <Quoted text={notice.deleted.title} /> })}
        </StatusNotice>
      ) : null}

      <RecordListControls
        testIdPrefix={testId}
        words={w}
        allLabel={allLabel}
        strayOption={strayOption}
        searchId={searchId}
        showId={showId}
        typed={list.typed}
        setTyped={list.setTyped}
        universe={universe}
        show={show}
        update={update}
        universes={universes}
        deleted={deleted}
      />

      <OutcomeNotice
        outcome={outcome}
        className="ideas__outcome"
        messageTestId={`${testId}-message`}
        linkTestId={restoredLinkTestId}
      />

      {/* The rows are drawn below, from the page kept while the next one is read. */}
      <ReadGate
        load={state}
        loading={{ text: t(`${w}.loading`) }}
        error={{
          message: t(`${w}.loadFailed`),
          onRetry: list.retry,
          retryLabel: t(`${w}.retry`),
          testId: `${testId}-load-error`,
        }}
      >
        {() => null}
      </ReadGate>

      {result ? (
        <PagedList
          result={result}
          renderItem={(record) => renderRow(record, { deleted, restoring, restore })}
          listClassName="idealist"
          listTestId={listTestId}
          empty={
            <RecordListEmpty
              testId={`${testId}-empty`}
              words={w}
              deleted={deleted}
              isFiltered={isFiltered}
              scope={emptyScope}
              newPath={`${basePath}/new`}
              newLabel={newLabel}
              newTestId={newTestId}
            />
          }
          onPage={(next) => update({ page: String(next) })}
        />
      ) : null}
    </section>
  )
}
