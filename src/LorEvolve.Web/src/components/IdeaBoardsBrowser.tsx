import { useId } from 'react'
import { Plus } from 'lucide-react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { ActionIcon } from './ActionIcon'
import { IdeasTabs } from './IdeasTabs'
import { Quoted } from './NameList'
import { PageHeader } from './PageHeader'
import { BoardsControls } from './ideas/BoardsControls'
import { BoardsEmpty } from './ideas/BoardsEmpty'
import { BoardsListRows } from './ideas/BoardsListRows'
import { BoardsPager } from './ideas/BoardsPager'
import { useBoardsActions } from '../ideas/useBoardsActions'
import { useBoardsFilters } from '../ideas/useBoardsFilters'
import { useBoardsRead } from '../ideas/useBoardsRead'
import { useBoardsState } from '../ideas/useBoardsState'
import { useI18n } from '../i18n'

/** What a board's editor says it did before handing back to the list. */
export interface BoardsListNotice {
  deleted?: { id: string; title: string }
  created?: { id: string; title: string }
}

/**
 * The account's idea boards, or one universe's (ADR 0066): one board system seen from two places, as ideas are. Most
 * recently updated first; the filter lives in the address. Recently deleted lists deleted boards with Restore.
 */
export function IdeaBoardsBrowser({ universe }: { universe: { id: string; name: string } | null }) {
  const { t, tx } = useI18n()
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const headingId = useId()
  const searchId = useId()
  const showId = useId()
  const ideasPath = universe ? `/app/universes/${universe.id}/ideas` : '/app/ideas'
  const basePath = `${ideasPath}/boards`

  const deleted = params.get('view') === 'deleted'
  const show = universe ? universe.id : (params.get('show') ?? '')
  const search = params.get('q') ?? ''
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)

  const base = useBoardsState(search)
  const { typed, setTyped, state, setState, setReads, universes, restoring, outcome, outcomeRef } =
    base
  const notice = location.state as BoardsListNotice | null

  const { update } = useBoardsFilters({ ...base, setParams, search })
  useBoardsRead({ ...base, universe, show, deleted, search, page, t })
  const { restore } = useBoardsActions({ ...base, tx, basePath })

  const result = state.kind === 'ready' ? state.page : null
  const isFiltered = search.trim() !== '' || (!universe && show !== '')

  return (
    <section className="ideas" aria-labelledby={headingId} data-testid="boards">
      <PageHeader
        title={t('ideas.boards.title')}
        titleId={headingId}
        lede={
          <p className="ideas__lede">
            {universe
              ? tx('ideas.boards.ledeUniverse', { universe: <Quoted text={universe.name} /> })
              : t('ideas.boards.ledeAll')}
          </p>
        }
        actions={
          <Link className="button" to={`${basePath}/new`} data-testid="new-board">
            <ActionIcon icon={Plus} />
            {t('ideas.boards.newBoard')}
          </Link>
        }
      />

      <IdeasTabs basePath={ideasPath} current="boards" />

      {notice?.created && !deleted ? (
        <div className="notice ideas__notice" data-testid="boards-created-notice">
          <p role="status">
            {tx('ideas.boards.created', { title: <Quoted text={notice.created.title} /> })}
          </p>
        </div>
      ) : null}
      {notice?.deleted && !deleted ? (
        <div className="notice ideas__notice" data-testid="boards-deleted-notice">
          <p role="status">
            {tx('ideas.boards.deletedNotice', { title: <Quoted text={notice.deleted.title} /> })}
          </p>
        </div>
      ) : null}

      <BoardsControls
        searchId={searchId}
        showId={showId}
        typed={typed}
        setTyped={setTyped}
        universe={universe}
        show={show}
        update={update}
        universes={universes}
        deleted={deleted}
      />

      {outcome ? (
        <div className="notice ideas__outcome" ref={outcomeRef} tabIndex={-1}>
          <p role="status" data-testid="boards-message">
            {outcome.text}
          </p>
          {outcome.to ? <Link to={outcome.to}>{t('ideas.boards.openIt')}</Link> : null}
        </div>
      ) : null}

      {state.kind === 'loading' ? (
        <p className="notice" role="status">
          {t('ideas.boards.loading')}
        </p>
      ) : null}

      {state.kind === 'error' ? (
        <div className="notice notice--error" role="alert" data-testid="boards-load-error">
          <p>{state.message}</p>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => {
              setState({ kind: 'loading' })
              setReads((current) => current + 1)
            }}
          >
            {t('ideas.boards.retry')}
          </button>
        </div>
      ) : null}

      {result && result.items.length > 0 ? (
        <BoardsListRows
          result={result}
          deleted={deleted}
          basePath={basePath}
          universe={universe}
          restoring={restoring}
          restore={restore}
        />
      ) : null}

      {result && result.items.length === 0 ? (
        <BoardsEmpty deleted={deleted} isFiltered={isFiltered} basePath={basePath} />
      ) : null}

      {result && result.totalPages > 1 ? <BoardsPager result={result} update={update} /> : null}
    </section>
  )
}
