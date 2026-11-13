import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArchiveRestore, Plus, Search } from 'lucide-react'
import { ActionIcon } from '../components/ActionIcon'
import { useI18n } from '../i18n'
import { RestoreBackup } from '../components/RestoreBackup'
import { UniverseCard } from '../components/UniverseCard'
import { UniverseForm } from '../components/UniverseForm'
import { createUniverse, listUniverses } from '../universes/api'
import type { UniversePage } from '../universes/types'
import { EmptyState } from '../components/EmptyState'

type LoadState =
  { kind: 'loading' } | { kind: 'ready'; page: UniversePage } | { kind: 'error'; message: string }

export default function UniversesPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [search, setSearch] = useState('')
  const [searched, setSearched] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [page, setPage] = useState(1)
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [isCreating, setIsCreating] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  // No universe at all, archived ones included: the page opens on the form that names the first one.
  const [isFirstRun, setIsFirstRun] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)

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
      .then(async (result) => {
        // An empty Active list may only mean everything is archived, so that case asks once more.
        let nothing = false
        if (result.items.length === 0 && !searched.trim() && page === 1) {
          nothing =
            includeArchived ||
            (
              await listUniverses(
                { search: '', includeArchived: true, page: 1 },
                controller.signal,
                1,
              )
            ).totalCount === 0
        }
        setIsFirstRun(nothing)
        setState({ kind: 'ready', page: result })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState({
          kind: 'error',
          message: error instanceof Error ? error.message : t('universe.list.loadFailed'),
        })
      })

    return () => {
      controller.abort()
    }
  }, [searched, includeArchived, page, reloadKey, t])

  function changeFilter(next: boolean) {
    setIncludeArchived(next)
    setPage(1)
  }

  const result = state.kind === 'ready' ? state.page : null
  const isFiltered = search.trim().length > 0
  const isStarting = isFirstRun && !isDismissed && !isRestoring

  return (
    <>
      <div className="home__heading">
        <div>
          <h1 className="home__title">{t('universe.list.title')}</h1>
          <p className="home__lede">{t('universe.list.lede')}</p>
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
            {t('universe.list.new')}
          </button>
          <button
            className="button button--secondary"
            type="button"
            aria-expanded={isRestoring}
            onClick={() => setRestoring(true)}
            data-testid="restore-backup"
          >
            <ActionIcon icon={ArchiveRestore} />
            {t('universe.list.restore')}
          </button>
        </div>
      </div>

      {isRestoring ? (
        <RestoreBackup
          onCancel={() => setRestoring(false)}
          onRestored={(universe) => void navigate(`/app/universes/${universe.id}`)}
        />
      ) : null}

      {isCreating || isStarting ? (
        <section
          className="composer"
          aria-label={t('universe.list.composerLabel')}
          data-testid="universe-composer"
        >
          <h2 className="composer__title">
            {isFirstRun ? t('universe.list.nameFirst') : t('universe.list.nameNew')}
          </h2>
          <UniverseForm
            // Asked for, the form starts in its name; offered on a first visit, it leaves focus where it was.
            key={isCreating ? 'asked' : 'offered'}
            takesFocus={isCreating}
            submitLabel={t('universe.list.create')}
            busyLabel={t('universe.list.creating')}
            onCancel={() => {
              setIsCreating(false)
              setIsDismissed(true)
            }}
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
            {t('universe.list.filter')}
          </label>
          <span className="controls__searchfield">
            <Search
              className="controls__searchicon"
              aria-hidden="true"
              focusable="false"
              strokeWidth={1.75}
            />
            <input
              id="universe-search"
              className="field__input"
              type="search"
              placeholder={t('universe.list.filterPlaceholder')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </span>
        </div>

        <div className="segmented" role="group" aria-label={t('universe.list.archiveFilter')}>
          <button
            type="button"
            className="segmented__option"
            aria-pressed={!includeArchived}
            onClick={() => changeFilter(false)}
          >
            {t('universe.list.active')}
          </button>
          <button
            type="button"
            className="segmented__option"
            aria-pressed={includeArchived}
            onClick={() => changeFilter(true)}
            data-testid="filter-all"
          >
            {t('universe.list.all')}
          </button>
        </div>
      </div>

      {state.kind === 'loading' ? (
        <p className="notice" role="status">
          {t('universe.list.loading')}
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
            {t('universe.list.retry')}
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

      {result && result.items.length === 0 && !isStarting ? (
        <EmptyState
          testId="universe-empty"
          title={
            <>
              {isFiltered ? t('universe.list.emptyFilteredTitle') : t('universe.list.emptyTitle')}
            </>
          }
          hint={
            <>{isFiltered ? t('universe.list.emptyFilteredHint') : t('universe.list.emptyHint')}</>
          }
          action={
            isFiltered ? undefined : (
              <button
                className="button"
                type="button"
                onClick={() => {
                  setRestoring(false)
                  setIsCreating(true)
                }}
              >
                <ActionIcon icon={Plus} />
                {t('universe.list.emptyNew')}
              </button>
            )
          }
        />
      ) : null}

      {result && result.totalPages > 1 ? (
        <nav className="pager" aria-label={t('universe.list.pagination')}>
          <button
            className="button button--secondary"
            type="button"
            disabled={result.page <= 1}
            onClick={() => setPage((current) => current - 1)}
          >
            {t('universe.list.previous')}
          </button>
          <span className="pager__position">
            {t('universe.list.page', { page: result.page, total: result.totalPages })}
          </span>
          <button
            className="button button--secondary"
            type="button"
            disabled={result.page >= result.totalPages}
            onClick={() => setPage((current) => current + 1)}
          >
            {t('universe.list.next')}
          </button>
        </nav>
      ) : null}
    </>
  )
}
