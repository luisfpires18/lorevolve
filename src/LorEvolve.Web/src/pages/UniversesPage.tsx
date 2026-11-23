import { CardGrid } from '../components/CardGrid'
import { useCallback, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArchiveRestore } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { SearchField } from '../components/SearchField'
import { SegmentedControl } from '../components/SegmentedControl'
import { Pager } from '../components/Pager'
import { useSearchedPage } from '../lib/useSearchedPage'
import { useI18n } from '../i18n'
import { RestoreBackup } from '../components/RestoreBackup'
import { UniverseCard } from '../components/UniverseCard'
import { UniverseForm } from '../components/UniverseForm'
import { createUniverse, listUniverses } from '../universes/api'
import { EmptyState } from '../components/EmptyState'
import { Button } from '../components/Button'
import { NewButton } from '../components/NewButton'
import { ReadGate } from '../components/ReadGate'
import { useAsyncRead } from '../lib/useAsyncRead'

export default function UniversesPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // Only typing waits, so a search does not fire a request per keystroke.
  const { search, setSearch, searched, page, setPage } = useSearchedPage()
  const [includeArchived, setIncludeArchived] = useState(false)
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

  const isFiltered = search.trim().length > 0
  const isStarting = isFirstRun && !isDismissed && !isRestoring

  return (
    <>
      <PageHeader
        title={t('universe.list.title')}
        lede={t('universe.list.lede')}
        actions={
          <>
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
          </>
        }
      />

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
        <SearchField
          className="controls__search"
          id="universe-search"
          label={t('universe.list.filter')}
          value={search}
          onChange={setSearch}
        />

        <SegmentedControl
          label={t('universe.list.archiveFilter')}
          options={[
            { value: 'active', label: t('universe.list.active') },
            { value: 'all', label: t('universe.list.all'), testId: 'filter-all' },
          ]}
          value={includeArchived ? 'all' : 'active'}
          onChange={(filter) => changeFilter(filter === 'all')}
        />
      </div>

      <ReadGate
        load={state}
        loading={{ text: t('universe.list.loading') }}
        error={{ onRetry: retry, retryLabel: t('universe.list.retry') }}
      >
        {(result) => (
          <>
            {result.items.length > 0 ? (
              <CardGrid gap={5} testId="universe-grid">
                {result.items.map((universe) => (
                  <li key={universe.id}>
                    <UniverseCard universe={universe} />
                  </li>
                ))}
              </CardGrid>
            ) : null}

            {result.items.length === 0 && !isStarting ? (
              <EmptyState
                testId="universe-empty"
                title={
                  <>
                    {isFiltered
                      ? t('universe.list.emptyFilteredTitle')
                      : t('universe.list.emptyTitle')}
                  </>
                }
                hint={
                  <>
                    {isFiltered
                      ? t('universe.list.emptyFilteredHint')
                      : t('universe.list.emptyHint')}
                  </>
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

            <Pager page={result.page} totalPages={result.totalPages} onPage={setPage} />
          </>
        )}
      </ReadGate>
    </>
  )
}
