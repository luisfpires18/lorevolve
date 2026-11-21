import { useSearchParams } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { ExploreFilters } from '../components/portal/ExploreFilters'
import { WorldGrid } from '../components/portal/WorldGrid'
import { listPublicUniverses, type ExploreQuery } from '../portal/api'
import { usePublicPages } from '../portal/usePublicPages'
import { CATEGORIES, GENRES } from '../publishing/types'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { t, tn, useI18n } from '../i18n'
import { Button } from '../components/Button'
import { LoadError } from '../components/LoadError'
import { Announce } from '../components/Announce'
import { ShowMore } from '../components/ShowMore'

/** The API's own limit on a search; the portal bar's field holds the same. */
const SEARCH_MAX = 100

/**
 * Explore: the public portal's front page, at `/` (ADR 0069; `/explore` comes here). One question - what worlds can I explore? - answered with the
 * universes their authors have published, one card each, and nothing invented: no metrics, no featured row, no
 * placeholder worlds (ADR 0036).
 *
 * <p>Discovery lives in the address, so a filtered Explore can be shared, refreshed and walked with Back and
 * Forward: `q`, `category`, `genre` and `sort=az`, each left out when it is the default. The API does the
 * filtering, over the public fields only. More results arrive with "Show more" rather than an endless
 * scroll: a button is reachable, finite and says what it will do. The pages loaded that way are not in the
 * address - a refresh starts from the first page again, with the same filters.</p>
 */
export default function ExplorePage() {
  useI18n()
  useDocumentTitle(t('portal.explore.documentTitle'))
  const [params, setParams] = useSearchParams()

  // Only keys LorEvolve knows. A stale or hand-edited address shows everything rather than an error.
  const category = CATEGORIES.find((option) => option.key === params.get('category'))?.key
  const genre = GENRES.find((option) => option.key === params.get('genre'))?.key
  const sort = params.get('sort') === 'az' ? ('az' as const) : undefined
  const q = (params.get('q') ?? '').trim().slice(0, SEARCH_MAX)
  const query: ExploreQuery = { category, genre, q: q || undefined, sort }
  const queryKey = JSON.stringify(query)
  const isFiltered = Boolean(category || genre || q)

  const pages = usePublicPages(queryKey, (page, signal) => listPublicUniverses(query, page, signal))
  const loading = pages.status === 'loading'

  function clearAll() {
    setParams(new URLSearchParams())
  }

  return (
    <div className="explore" data-testid="explore">
      <section className="explore-hero" aria-labelledby="explore-title">
        <div className="explore-hero__inner">
          <h1 className="explore-hero__title" id="explore-title">
            {t('portal.explore.title')}
          </h1>
          <p className="explore-hero__lede">{t('portal.explore.lede')}</p>
          <ExploreFilters category={category} genre={genre} sort={sort} />
        </div>
      </section>

      <div className="explore__body">
        {/* Announced, not shown: the grid says how many at a glance, and Show more says how many are left. */}
        <Announce testId="explore-count">
          {loading
            ? t('portal.explore.finding')
            : pages.status === 'ready'
              ? countLine(pages.items.length, pages.totalCount, isFiltered)
              : ''}
        </Announce>

        <h2 className="visually-hidden">{t('portal.explore.worldsHeading')}</h2>

        {loading ? <WorldGrid skeleton={8} testId="explore-loading" /> : null}

        {pages.status === 'error' ? (
          <LoadError
            message={t('portal.explore.error.message')}
            onRetry={pages.retry}
            retryLabel={t('portal.explore.error.retry')}
            testId="explore-error"
            className="explore__error"
          />
        ) : null}

        {pages.status === 'ready' && pages.items.length === 0 && !isFiltered ? (
          <EmptyState
            testId="explore-empty"
            title={t('portal.explore.empty.title')}
            hint={t('portal.explore.empty.hint')}
          />
        ) : null}

        {pages.status === 'ready' && pages.items.length === 0 && isFiltered ? (
          <EmptyState
            testId="explore-no-match"
            title={t('portal.explore.noMatch.title')}
            hint={t('portal.explore.noMatch.hint')}
            action={
              <Button tone="secondary" onClick={clearAll}>
                {t('portal.explore.noMatch.clear')}
              </Button>
            }
          />
        ) : null}

        {pages.items.length > 0 ? (
          <WorldGrid worlds={pages.items} eager={6} testId="explore-list" />
        ) : null}

        <ShowMore
          hasMore={pages.hasMore}
          status={pages.more}
          onMore={pages.showMore}
          shown={pages.items.length}
          total={pages.totalCount}
          countLabel={t('portal.explore.shown', {
            shown: pages.items.length,
            total: pages.totalCount,
          })}
          announce={false}
          testId="explore-more"
        />
      </div>
    </div>
  )
}

function countLine(shown: number, total: number, isFiltered: boolean) {
  // Nothing to count: the empty state below says so, once.
  if (total === 0) return ''
  const vars = { shown, total }
  if (shown < total) return tn('portal.explore.count.partial', total, vars)
  return tn(isFiltered ? 'portal.explore.count.matching' : 'portal.explore.count.all', total, vars)
}
