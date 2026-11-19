import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArchiveRestore, Search } from 'lucide-react'
import { Field } from '../components/Field'
import { useI18n } from '../i18n'
import { RestoreBackup } from '../components/RestoreBackup'
import { UniverseCard } from '../components/UniverseCard'
import { UniverseForm } from '../components/UniverseForm'
import { createUniverse, listUniverses } from '../universes/api'
import { EmptyState } from '../components/EmptyState'
import { Button } from '../components/Button'
import { NewButton } from '../components/NewButton'
import { LoadError } from '../components/LoadError'
import { LoadingNote } from '../components/LoadingNote'
import { useAsyncRead } from '../lib/useAsyncRead'

export default function UniversesPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [search, setSearch] = useState('')
  const [searched, setSearched] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [page, setPage] = useState(1)
  const [isCreating, setIsCreating] = useState(false)
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
  const read = useCallback(
    async (signal: AbortSignal) => {
      const result = await listUniverses({ search: searched, includeArchived, page }, signal)
      // An empty Active list may only mean everything is archived, so that case asks once more.
      let nothing = false
      if (result.items.length === 0 && !searched.trim() && page === 1) {
        nothing =
          includeArchived ||
          (await listUniverses({ search: '', includeArchived: true, page: 1 }, signal, 1))
            .totalCount === 0
      }
      setIsFirstRun(nothing)
      return result
    },
    [searched, includeArchived, page],
  )
  const { load: state, retry } = useAsyncRead(read, { failed: t('universe.list.loadFailed') })

  function changeFilter(next: boolean) {
    setIncludeArchived(next)
    setPage(1)
  }

  const result = state.kind === 'ready' ? state.value : null
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
          <NewButton
            onClick={() => {
              setRestoring(false)
              setIsCreating(true)
            }}
            data-testid="new-universe"
          >
            {t('universe.list.new')}
          </NewButton>
          <Button
            tone="secondary"
            icon={ArchiveRestore}
            aria-expanded={isRestoring}
            onClick={() => setRestoring(true)}
            data-testid="restore-backup"
          >
            {t('universe.list.restore')}
          </Button>
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
        <Field className="controls__search" id="universe-search" label={t('universe.list.filter')}>
          {(control) => (
            <span className="controls__searchfield">
              <Search
                className="controls__searchicon"
                aria-hidden="true"
                focusable="false"
                strokeWidth={1.75}
              />
              <input
                {...control}
                className="field__input"
                type="search"
                placeholder={t('universe.list.filterPlaceholder')}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </span>
          )}
        </Field>

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

      {state.kind === 'loading' ? <LoadingNote>{t('universe.list.loading')}</LoadingNote> : null}

      {state.kind === 'error' ? (
        <LoadError message={state.message} onRetry={retry} retryLabel={t('universe.list.retry')} />
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
              <NewButton
                onClick={() => {
                  setRestoring(false)
                  setIsCreating(true)
                }}
              >
                {t('universe.list.emptyNew')}
              </NewButton>
            )
          }
        />
      ) : null}

      {result && result.totalPages > 1 ? (
        <nav className="pager" aria-label={t('universe.list.pagination')}>
          <Button
            tone="secondary"
            disabled={result.page <= 1}
            onClick={() => setPage((current) => current - 1)}
          >
            {t('universe.list.previous')}
          </Button>
          <span className="pager__position">
            {t('universe.list.page', { page: result.page, total: result.totalPages })}
          </span>
          <Button
            tone="secondary"
            disabled={result.page >= result.totalPages}
            onClick={() => setPage((current) => current + 1)}
          >
            {t('universe.list.next')}
          </Button>
        </nav>
      ) : null}
    </>
  )
}
