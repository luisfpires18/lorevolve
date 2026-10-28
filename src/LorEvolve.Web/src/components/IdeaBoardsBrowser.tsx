import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { ActionIcon } from './ActionIcon'
import { EmptyState } from './EmptyState'
import { IdeasTabs } from './IdeasTabs'
import { Quoted } from './NameList'
import { PageHeader } from './PageHeader'
import { listAllUniverses } from '../ideas/api'
import {
  listIdeaBoards,
  restoreIdeaBoard,
  type IdeaBoardPage,
  type IdeaBoardSummary,
} from '../ideas/boards'
import { formatDate, formatDateTime } from '../lib/dates'
import type { UniverseSummary } from '../universes/types'

type LoadState =
  { kind: 'loading' } | { kind: 'ready'; page: IdeaBoardPage } | { kind: 'error'; message: string }

/** What a board's editor says it did before handing back to the list. */
export interface BoardsListNotice {
  deleted?: { id: string; title: string }
  created?: { id: string; title: string }
}

const UNASSIGNED = 'unassigned'

/**
 * The account's idea boards, or one universe's (ADR 0066): one board system seen from two places, as ideas are. Most
 * recently updated first; the filter lives in the address. Recently deleted lists deleted boards with Restore.
 */
export function IdeaBoardsBrowser({ universe }: { universe: { id: string; name: string } | null }) {
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

  const [typed, setTyped] = useState(search)
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [reads, setReads] = useState(0)
  const [universes, setUniverses] = useState<UniverseSummary[] | null>(null)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<{ text: ReactNode; to: string | null } | null>(null)
  const outcomeRef = useRef<HTMLDivElement>(null)
  const notice = location.state as BoardsListNotice | null

  function update(change: Record<string, string | null>) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        for (const [key, value] of Object.entries(change)) {
          if (value === null || value === '') next.delete(key)
          else next.set(key, value)
        }
        if (!('page' in change)) next.delete('page')
        return next
      },
      { replace: 'q' in change },
    )
  }

  // Typing settles before the address - and so the request - changes.
  useEffect(() => {
    if (typed === search) return
    const timer = setTimeout(() => update({ q: typed.trim() === '' ? '' : typed }), 200)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed, search])

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
    listIdeaBoards(
      {
        universeId: show !== '' && show !== UNASSIGNED ? show : null,
        unassigned: show === UNASSIGNED,
        deleted,
        search,
        page,
      },
      controller.signal,
    )
      .then((result) => setState({ kind: 'ready', page: result }))
      .catch(() => {
        if (!controller.signal.aborted)
          setState({ kind: 'error', message: 'The boards could not be read.' })
      })
    return () => controller.abort()
  }, [show, deleted, search, page, reads])

  useEffect(() => {
    if (outcome) outcomeRef.current?.focus()
  }, [outcome])

  async function restore(board: IdeaBoardSummary) {
    setRestoring(board.id)
    setOutcome(null)
    try {
      const restored = await restoreIdeaBoard(board.id)
      setOutcome({
        text: (
          <>
            <Quoted text={restored.title} /> is back in your boards.
          </>
        ),
        to: `${basePath}/${restored.id}`,
      })
    } catch {
      setOutcome({
        text: (
          <>
            <Quoted text={board.title} /> could not be restored. Try again.
          </>
        ),
        to: null,
      })
    } finally {
      setRestoring(null)
      setReads((current) => current + 1)
    }
  }

  const result = state.kind === 'ready' ? state.page : null
  const isFiltered = search.trim() !== '' || (!universe && show !== '')

  return (
    <section className="ideas" aria-labelledby={headingId} data-testid="boards">
      <PageHeader
        title="Idea boards"
        titleId={headingId}
        lede={
          <p className="ideas__lede">
            {universe ? (
              <>
                Boards for <Quoted text={universe.name} />: notes, ideas and lore laid out side by
                side. Only you can see them.
              </>
            ) : (
              'Every board you have, in a universe or not. Only you can see them, and they stay out of your lore.'
            )}
          </p>
        }
        actions={
          <Link className="button" to={`${basePath}/new`} data-testid="new-board">
            <ActionIcon icon={Plus} />
            New board
          </Link>
        }
      />

      <IdeasTabs basePath={ideasPath} current="boards" />

      {notice?.created && !deleted ? (
        <div className="notice ideas__notice" data-testid="boards-created-notice">
          <p role="status">
            Created <Quoted text={notice.created.title} />.
          </p>
        </div>
      ) : null}
      {notice?.deleted && !deleted ? (
        <div className="notice ideas__notice" data-testid="boards-deleted-notice">
          <p role="status">
            <Quoted text={notice.deleted.title} /> was deleted. It is in Recently deleted, where you
            can restore it.
          </p>
        </div>
      ) : null}

      <div className="controls ideas__controls">
        <div className="controls__search">
          <label className="field__label" htmlFor={searchId}>
            Filter boards
          </label>
          <input
            id={searchId}
            className="field__input"
            type="search"
            placeholder="Words in a title"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            data-testid="boards-search"
          />
        </div>

        {universe ? null : (
          <div className="ideas__show">
            <label className="field__label" htmlFor={showId}>
              Show
            </label>
            <select
              id={showId}
              className="field__input field__input--select"
              value={show}
              onChange={(event) => update({ show: event.target.value })}
              data-testid="boards-show"
            >
              <option value="">All boards</option>
              <option value={UNASSIGNED}>No universe</option>
              {(universes ?? []).map((one) => (
                <option key={one.id} value={one.id}>
                  {one.isArchived ? `${one.name} (archived)` : one.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="segmented" role="group" aria-label="Which boards">
          <button
            type="button"
            className="segmented__option"
            aria-pressed={!deleted}
            onClick={() => update({ view: null })}
            data-testid="boards-view-live"
          >
            Boards
          </button>
          <button
            type="button"
            className="segmented__option"
            aria-pressed={deleted}
            onClick={() => update({ view: 'deleted' })}
            data-testid="boards-view-deleted"
          >
            Recently deleted
          </button>
        </div>
      </div>

      {outcome ? (
        <div className="notice ideas__outcome" ref={outcomeRef} tabIndex={-1}>
          <p role="status" data-testid="boards-message">
            {outcome.text}
          </p>
          {outcome.to ? <Link to={outcome.to}>Open it</Link> : null}
        </div>
      ) : null}

      {state.kind === 'loading' ? (
        <p className="notice" role="status">
          Gathering boards…
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
            Try again
          </button>
        </div>
      ) : null}

      {result && result.items.length > 0 ? (
        <ul className="idealist" data-testid="board-rows">
          {result.items.map((board) => (
            <li
              className={deleted ? 'idearow' : 'idearow rowlink'}
              key={board.id}
              data-testid="board-row"
              data-title={board.title}
            >
              <div className="idearow__main">
                {deleted ? (
                  <p className="idearow__title">
                    <bdi>{board.title}</bdi>
                  </p>
                ) : (
                  <Link
                    className="idearow__title rowlink__target"
                    to={`${basePath}/${board.id}`}
                    data-testid="board-open"
                  >
                    <bdi>{board.title}</bdi>
                  </Link>
                )}
                <p className="idearow__meta">
                  {universe ? null : (
                    <span
                      className={
                        board.universe
                          ? 'idearow__universe'
                          : 'idearow__universe idearow__universe--none'
                      }
                    >
                      {board.universe ? board.universe.name : 'No universe'}
                    </span>
                  )}
                  <span>{board.cardCount === 1 ? '1 card' : `${board.cardCount} cards`}</span>
                  {deleted && board.deletedAt ? (
                    <span>
                      Deleted{' '}
                      <time dateTime={board.deletedAt}>{formatDateTime(board.deletedAt)}</time>
                    </span>
                  ) : (
                    <span>
                      Updated <time dateTime={board.updatedAt}>{formatDate(board.updatedAt)}</time>
                    </span>
                  )}
                </p>
              </div>
              {deleted ? (
                <button
                  className="button button--secondary idearow__restore"
                  type="button"
                  disabled={restoring !== null}
                  onClick={() => void restore(board)}
                  aria-label={`Restore board “${board.title}”`}
                  data-testid="board-restore"
                >
                  {restoring === board.id ? 'Restoring…' : 'Restore'}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {result && result.items.length === 0 ? (
        deleted ? (
          <EmptyState
            testId="boards-empty"
            title="Nothing recently deleted."
            hint="A deleted board waits here, whole, until you restore it."
          />
        ) : isFiltered ? (
          <EmptyState
            testId="boards-empty"
            title="No boards match."
            hint="Try other words, or show all boards."
          />
        ) : (
          <EmptyState
            testId="boards-empty"
            title="No boards yet."
            hint="Lay notes, ideas and lore out side by side, and draw lines between them."
            action={
              <Link className="button" to={`${basePath}/new`} data-testid="empty-new-board">
                <ActionIcon icon={Plus} />
                New board
              </Link>
            }
          />
        )
      ) : null}

      {result && result.totalPages > 1 ? (
        <nav className="pager" aria-label="Pagination">
          <button
            className="button button--secondary"
            type="button"
            disabled={result.page <= 1}
            onClick={() => update({ page: String(result.page - 1) })}
          >
            Previous
          </button>
          <span className="pager__position">
            Page {result.page} of {result.totalPages}
          </span>
          <button
            className="button button--secondary"
            type="button"
            disabled={result.page >= result.totalPages}
            onClick={() => update({ page: String(result.page + 1) })}
          >
            Next
          </button>
        </nav>
      ) : null}
    </section>
  )
}
