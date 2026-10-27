import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { WorldCard } from '../components/WorldCard'
import { listPublicUniverses, type ExploreQuery, type PublicUniverse } from '../portal/api'
import heroImage from '../portal/explore-worlds-background.png'
import heroImageWebp from '../portal/explore-worlds-background.webp'
import { CATEGORIES, GENRES } from '../publishing/types'
import { useDocumentTitle } from '../lib/useDocumentTitle'

/** The API's own limit on a search; the portal bar's field holds the same. */
const SEARCH_MAX = 100

type Results =
  | {
      key: string
      kind: 'ready'
      items: PublicUniverse[]
      page: number
      totalCount: number
      totalPages: number
    }
  | { key: string; kind: 'error' }

/**
 * Explore: the public portal's front page. One question - what worlds can I explore? - answered with the
 * universes their authors have published, one card each, and nothing invented: no metrics, no featured row, no
 * placeholder worlds (ADR 0036).
 *
 * <p>Discovery lives in the address, so a filtered Explore can be shared, refreshed and walked with Back and
 * Forward: `q`, `category`, `genre` and `sort=az`, each left out when it is the default. The API does the
 * filtering, over the public fields only. More results arrive with "Show more worlds" rather than an endless
 * scroll: a button is reachable, finite and says what it will do. The pages loaded that way are not in the
 * address - a refresh starts from the first page again, with the same filters.</p>
 */
export default function ExplorePage() {
  useDocumentTitle('Explore Worlds')
  const [params, setParams] = useSearchParams()

  // Only keys LorEvolve knows. A stale or hand-edited address shows everything rather than an error.
  const category = CATEGORIES.find((option) => option.key === params.get('category'))?.key
  const genre = GENRES.find((option) => option.key === params.get('genre'))?.key
  const sort = params.get('sort') === 'az' ? ('az' as const) : undefined
  const q = (params.get('q') ?? '').trim().slice(0, SEARCH_MAX)
  const query: ExploreQuery = { category, genre, q: q || undefined, sort }
  const queryKey = JSON.stringify(query)
  const isFiltered = Boolean(category || genre || q)

  const [attempt, setAttempt] = useState(0)
  const fetchKey = `${queryKey}#${attempt}`
  const [results, setResults] = useState<Results | null>(null)
  const [more, setMore] = useState<'idle' | 'loading' | 'error'>('idle')
  const moreRequest = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    moreRequest.current?.abort()
    listPublicUniverses(JSON.parse(queryKey) as ExploreQuery, 1, controller.signal)
      .then((page) => {
        setMore('idle')
        setResults({ key: fetchKey, kind: 'ready', ...page })
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setResults({ key: fetchKey, kind: 'error' })
      })
    return () => {
      controller.abort()
    }
  }, [queryKey, fetchKey])

  // Anything not for the current address is stale: the address changed, so the answer is still coming.
  const current = results?.key === fetchKey ? results : null
  const ready = current?.kind === 'ready' ? current : null

  function showMore() {
    if (!ready) return
    const controller = new AbortController()
    moreRequest.current = controller
    setMore('loading')
    listPublicUniverses(query, ready.page + 1, controller.signal)
      .then((page) => {
        setMore('idle')
        setResults((was) => {
          if (was?.key !== fetchKey || was.kind !== 'ready') return was
          // Something published meanwhile shifts every later page by one; the slug keeps a world from appearing twice.
          const seen = new Set(was.items.map((world) => world.slug))
          return {
            ...was,
            items: [...was.items, ...page.items.filter((world) => !seen.has(world.slug))],
            page: page.page,
            totalCount: page.totalCount,
            totalPages: page.totalPages,
          }
        })
      })
      .catch(() => {
        if (!controller.signal.aborted) setMore('error')
      })
  }

  function clearAll() {
    setParams(new URLSearchParams())
  }

  return (
    <div className="explore" data-testid="explore">
      <section className="explore-hero" aria-labelledby="explore-title">
        {/* A WebP delivery copy of the approved panorama (Task 012: 250 kB for 2.37 MB), the untouched PNG behind it
            for a browser without WebP. Same pixels, same crop. */}
        <picture className="explore-hero__picture">
          <source srcSet={heroImageWebp} type="image/webp" />
          <img
            className="explore-hero__image"
            src={heroImage}
            alt=""
            width={1916}
            height={821}
            fetchPriority="high"
            decoding="async"
          />
        </picture>
        <div className="explore-hero__inner">
          <h1 className="explore-hero__title" id="explore-title">
            Explore Worlds
          </h1>
          <p className="explore-hero__lede">
            Discover universes their authors have chosen to share.
          </p>
          <div className="explore-filters">
            <nav className="explore-cats" aria-label="Categories">
              <ul className="explore-cats__list">
                {[{ key: undefined, label: 'All' }, ...CATEGORIES].map((option) => (
                  <li key={option.label}>
                    <Link
                      className="explore-cats__chip"
                      to={{ search: withParam(params, 'category', option.key) }}
                      aria-current={option.key === category ? 'true' : undefined}
                      data-testid={`explore-category-${option.key ?? 'all'}`}
                    >
                      {option.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="explore-filters__selects">
              <label className="explore-select">
                <span className="explore-select__label">Genre</span>
                <select
                  className="explore-select__control"
                  value={genre ?? ''}
                  onChange={(event) =>
                    setParams(withParam(params, 'genre', event.target.value || undefined))
                  }
                  data-testid="explore-genre"
                >
                  <option value="">All genres</option>
                  {GENRES.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="explore-select">
                <span className="explore-select__label">Sort by</span>
                <select
                  className="explore-select__control"
                  value={sort ?? 'recent'}
                  onChange={(event) =>
                    setParams(
                      withParam(params, 'sort', event.target.value === 'az' ? 'az' : undefined),
                    )
                  }
                  data-testid="explore-sort"
                >
                  <option value="recent">Recently published</option>
                  <option value="az">A–Z</option>
                </select>
              </label>
            </div>
          </div>
        </div>
      </section>

      <div className="explore__body">
        {/* Announced, not shown: the grid says how many at a glance, and Show more says how many are left. */}
        <p className="visually-hidden" role="status" data-testid="explore-count">
          {current === null
            ? 'Finding worlds…'
            : ready
              ? countLine(ready.items.length, ready.totalCount, isFiltered)
              : ''}
        </p>

        <h2 className="visually-hidden">Worlds</h2>

        {current === null ? (
          <ul className="explore-grid" aria-hidden="true" data-testid="explore-loading">
            {Array.from({ length: 8 }, (_, index) => (
              <li className="worldcard worldcard--skeleton" key={index}>
                <span className="worldcard__art" />
                <span className="worldcard__text">
                  <span className="worldcard__bone worldcard__bone--name" />
                  <span className="worldcard__bone worldcard__bone--chips" />
                  <span className="worldcard__bone worldcard__bone--short" />
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {current?.kind === 'error' ? (
          <div
            className="notice notice--error explore__error"
            role="alert"
            data-testid="explore-error"
          >
            <p>The published worlds could not be loaded. Check your connection and try again.</p>
            <button
              className="button button--secondary"
              type="button"
              onClick={() => setAttempt((count) => count + 1)}
            >
              Try again
            </button>
          </div>
        ) : null}

        {ready && ready.items.length === 0 && !isFiltered ? (
          <EmptyState
            testId="explore-empty"
            title="No worlds have been published yet."
            hint="When an author makes a universe public, it appears here."
          />
        ) : null}

        {ready && ready.items.length === 0 && isFiltered ? (
          <EmptyState
            testId="explore-no-match"
            title="No published worlds match."
            hint="Try another word, category or genre - or see every world."
            action={
              <button className="button button--secondary" type="button" onClick={clearAll}>
                Clear search and filters
              </button>
            }
          />
        ) : null}

        {ready && ready.items.length > 0 ? (
          <ul className="explore-grid" data-testid="explore-list">
            {ready.items.map((world) => (
              <WorldCard key={world.slug} world={world} />
            ))}
          </ul>
        ) : null}

        {ready && ready.page < ready.totalPages ? (
          <div className="explore__more">
            <p className="explore__shown" aria-hidden="true">
              Showing {ready.items.length} of {ready.totalCount} worlds
            </p>
            {more === 'error' ? (
              <p className="explore__more-error" role="alert">
                More worlds could not be loaded.
              </p>
            ) : null}
            <button
              className="button button--secondary explore__more-button"
              type="button"
              onClick={showMore}
              disabled={more === 'loading'}
              aria-busy={more === 'loading'}
              data-testid="explore-more"
            >
              {more === 'loading'
                ? 'Loading worlds…'
                : more === 'error'
                  ? 'Try again'
                  : 'Show more worlds'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** The current address with one parameter set, or removed when it would be the default. */
function withParam(params: URLSearchParams, name: string, value: string | undefined) {
  const next = new URLSearchParams(params)
  if (value) next.set(name, value)
  else next.delete(name)
  const search = next.toString()
  return search ? `?${search}` : ''
}

function countLine(shown: number, total: number, isFiltered: boolean) {
  // Nothing to count: the empty state below says so, once.
  if (total === 0) return ''
  const worlds = total === 1 ? 'world' : 'worlds'
  if (shown < total) return `Showing ${shown} of ${total} ${worlds}`
  return isFiltered ? `${total} ${worlds} match` : `${total} ${worlds}`
}
