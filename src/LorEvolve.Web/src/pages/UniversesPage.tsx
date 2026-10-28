import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArchiveRestore, Plus, Search } from 'lucide-react'
import { ActionIcon } from '../components/ActionIcon'
import { RestoreBackup } from '../components/RestoreBackup'
import { UniverseCard } from '../components/UniverseCard'
import { UniverseForm } from '../components/UniverseForm'
import { createUniverse, listUniverses } from '../universes/api'
import type { UniversePage } from '../universes/types'
import { EmptyState } from '../components/EmptyState'

type LoadState =
  { kind: 'loading' } | { kind: 'ready'; page: UniversePage } | { kind: 'error'; message: string }

export default function UniversesPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [search, setSearch] = useState('')
  const [searched, setSearched] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [page, setPage] = useState(1)
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [isCreating, setIsCreating] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  // A universe's Settings links here with `?restore`, because restoring makes a universe rather than changing one.
  const isRestoring = searchParams.has('restore')

  function setRestoring(open: boolean) {
    if (open === isRestoring) return
    setSearchParams(open ? { restore: '' } : {}, { replace: true })
    if (open) setIsCreating(false)
  }

  // Only typing waits, so a search does not fire a request per keystroke. The search the list is asked for moves a
  // moment after the box settles, and goes back to the first page with it - one request, as before.
  useEffect(() => {
    if (search === searched) return
    const timer = setTimeout(() => {
      setSearched(search)
      setPage(1)
    }, 150)
    return () => {
      clearTimeout(timer)
    }
  }, [search, searched])

  // Everything else - the first load, a page, the archive filter, trying again, coming back - asks at once.
  useEffect(() => {
    const controller = new AbortController()
    listUniverses({ search: searched, includeArchived, page }, controller.signal)
      .then((result) => setState({ kind: 'ready', page: result }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Could not load your universes.',
        })
      })

    return () => {
      controller.abort()
    }
  }, [searched, includeArchived, page, reloadKey])

  function changeFilter(next: boolean) {
    setIncludeArchived(next)
    setPage(1)
  }

  const result = state.kind === 'ready' ? state.page : null
  const isFiltered = search.trim().length > 0

  return (
    <>
      <div className="home__heading">
        <div>
          <h1 className="home__title">Universes</h1>
          <p className="home__lede">Your worlds, and any shared with you.</p>
        </div>
        <div className="home__actions">
          <button
            className="button"
            type="button"
            onClick={() => {
              setRestoring(false)
              setIsCreating(true)
            }}
            data-testid="new-universe"
          >
            <ActionIcon icon={Plus} />
            New universe
          </button>
          <button
            className="button button--secondary"
            type="button"
            aria-expanded={isRestoring}
            onClick={() => setRestoring(true)}
            data-testid="restore-backup"
          >
            <ActionIcon icon={ArchiveRestore} />
            Restore backup
          </button>
        </div>
      </div>

      {isRestoring ? (
        <RestoreBackup
          onCancel={() => setRestoring(false)}
          onRestored={(universe) => void navigate(`/app/universes/${universe.id}`)}
        />
      ) : null}

      {isCreating ? (
        <section className="composer" aria-label="Create a universe">
          <h2 className="composer__title">Name a new world</h2>
          <UniverseForm
            submitLabel="Create universe"
            busyLabel="Creating"
            onCancel={() => setIsCreating(false)}
            onSubmit={async (input) => {
              const created = await createUniverse(input)
              await navigate(`/app/universes/${created.id}`)
            }}
          />
        </section>
      ) : null}

      <div className="controls">
        <div className="controls__search">
          <label className="field__label" htmlFor="universe-search">
            Filter universes
          </label>
          <span className="controls__searchfield">
            <Search className="controls__searchicon" aria-hidden="true" focusable="false" />
            <input
              id="universe-search"
              className="field__input"
              type="search"
              placeholder="Name of a world"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </span>
        </div>

        <div className="segmented" role="group" aria-label="Archive filter">
          <button
            type="button"
            className="segmented__option"
            aria-pressed={!includeArchived}
            onClick={() => changeFilter(false)}
          >
            Active
          </button>
          <button
            type="button"
            className="segmented__option"
            aria-pressed={includeArchived}
            onClick={() => changeFilter(true)}
            data-testid="filter-all"
          >
            All
          </button>
        </div>
      </div>

      {state.kind === 'loading' ? (
        <p className="notice" role="status">
          Gathering your universes…
        </p>
      ) : null}

      {state.kind === 'error' ? (
        <div className="notice notice--error" role="alert">
          <p>{state.message}</p>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => setReloadKey((current) => current + 1)}
          >
            Try again
          </button>
        </div>
      ) : null}

      {result && result.items.length > 0 ? (
        <ul className="plates" data-testid="universe-grid">
          {result.items.map((universe) => (
            <li key={universe.id}>
              <UniverseCard universe={universe} />
            </li>
          ))}
        </ul>
      ) : null}

      {result && result.items.length === 0 ? (
        <EmptyState
          testId="universe-empty"
          title={<>{isFiltered ? 'Nothing here by that name.' : 'No universes yet.'}</>}
          hint={
            <>
              {isFiltered
                ? 'Try a different word, or clear the search.'
                : 'Start one, and everything you invent will hang off it.'}
            </>
          }
        />
      ) : null}

      {result && result.totalPages > 1 ? (
        <nav className="pager" aria-label="Pagination">
          <button
            className="button button--secondary"
            type="button"
            disabled={result.page <= 1}
            onClick={() => setPage((current) => current - 1)}
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
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </button>
        </nav>
      ) : null}
    </>
  )
}
