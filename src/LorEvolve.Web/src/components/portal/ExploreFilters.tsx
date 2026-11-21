import { Link, useSearchParams } from 'react-router-dom'
import { CATEGORIES, categoryLabel, GENRES, genreLabel } from '../../publishing/types'
import { t } from '../../i18n'

/**
 * Explore's filters in its hero: the category chips, then the genre and sort selects. Each writes the address, so a
 * filtered Explore can be shared; the page reads the same address for its query. Split from `ExplorePage`.
 */
export function ExploreFilters({
  category,
  genre,
  sort,
}: {
  category: string | undefined
  genre: string | undefined
  sort: 'az' | undefined
}) {
  const [params, setParams] = useSearchParams()

  return (
    <div className="explore-filters">
      <nav className="explore-cats" aria-label={t('portal.explore.categories')}>
        <ul className="explore-cats__list">
          {[
            { key: undefined, label: t('portal.explore.all') },
            ...CATEGORIES.map((option) => ({
              key: option.key,
              label: categoryLabel(option.value),
            })),
          ].map((option) => (
            <li key={option.key ?? 'all'}>
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
          <span className="explore-select__label">{t('portal.explore.genre')}</span>
          <select
            className="explore-select__control"
            value={genre ?? ''}
            onChange={(event) =>
              setParams(withParam(params, 'genre', event.target.value || undefined))
            }
            data-testid="explore-genre"
          >
            <option value="">{t('portal.explore.allGenres')}</option>
            {GENRES.map((option) => (
              <option key={option.key} value={option.key}>
                {genreLabel(option.value)}
              </option>
            ))}
          </select>
        </label>
        <label className="explore-select">
          <span className="explore-select__label">{t('portal.explore.sortBy')}</span>
          <select
            className="explore-select__control"
            value={sort ?? 'recent'}
            onChange={(event) =>
              setParams(withParam(params, 'sort', event.target.value === 'az' ? 'az' : undefined))
            }
            data-testid="explore-sort"
          >
            <option value="recent">{t('portal.explore.sortRecent')}</option>
            <option value="az">{t('portal.explore.sortAz')}</option>
          </select>
        </label>
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
