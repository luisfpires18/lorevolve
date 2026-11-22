import { plainExcerpt } from '../../lore/mentions'
import { useI18n } from '../../i18n'
import { resultContext } from '../../search/api'
import {
  SEARCH_FIELD_LABELS,
  SEARCH_KIND_LABELS,
  type SearchResponse,
  type SearchResult,
} from '../../search/types'
import { Button } from '../Button'

/** The search bar's panel: the idle, searching, empty and error notes, the option list and More. */
export function UniverseSearchList({
  isOpen,
  status,
  query,
  retry,
  listId,
  showList,
  results,
  optionId,
  activeIndex,
  open,
  response,
}: {
  isOpen: boolean
  status: 'idle' | 'searching' | 'error' | 'empty' | 'results'
  query: string
  retry: () => void
  listId: string
  showList: boolean
  results: SearchResult[]
  optionId: (index: number) => string
  activeIndex: number
  open: (result: SearchResult, by: 'keyboard' | 'pointer') => Promise<void>
  response: SearchResponse | null
}) {
  const { t, tx } = useI18n()
  return (
    <>
      {/* Pressing anywhere in the panel keeps the focus in the box, so a click lands before the box can close it. */}
      <div
        className="unisearch__panel"
        hidden={!isOpen}
        onMouseDown={(event) => event.preventDefault()}
        data-testid="universe-search-panel"
      >
        {status === 'idle' ? <p className="unisearch__note">{t('lore.search.idle')}</p> : null}

        {status === 'searching' ? (
          <p className="unisearch__note" data-testid="universe-search-searching">
            {t('lore.search.searching')}
          </p>
        ) : null}

        {status === 'empty' ? (
          <p className="unisearch__note" data-testid="universe-search-empty">
            {tx('lore.search.empty', { query: <span dir="auto">{query}</span> })}
          </p>
        ) : null}

        {status === 'error' ? (
          <div className="unisearch__note unisearch__failure" data-testid="universe-search-error">
            <p>{t('lore.search.unreachable')}</p>
            <Button tone="secondary" onClick={retry}>
              {t('lore.search.retry')}
            </Button>
          </div>
        ) : null}

        <ul
          className="unisearch__list"
          id={listId}
          role="listbox"
          aria-label={t('lore.search.results')}
          hidden={!showList}
          data-testid="universe-search-results"
        >
          {showList
            ? results.map((result, index) => {
                const context = resultContext(result)
                const where = SEARCH_FIELD_LABELS[result.matchedIn]

                return (
                  <li
                    key={`${result.kind}:${result.id}`}
                    id={optionId(index)}
                    className="unisearch__option"
                    role="option"
                    aria-selected={index === activeIndex}
                    data-kind={result.kind}
                    data-testid="universe-search-result"
                    onClick={() => void open(result, 'pointer')}
                  >
                    <span className="unisearch__kind">{SEARCH_KIND_LABELS[result.kind]}</span>
                    <span className="unisearch__body">
                      <span className="unisearch__title" dir="auto">
                        {result.title}
                      </span>
                      {context ? (
                        <span className="unisearch__context" dir="auto">
                          {context}
                        </span>
                      ) : null}
                      {result.excerpt ? (
                        <span className="unisearch__excerpt">
                          {where ? <span className="unisearch__where">{where}</span> : null}
                          <span className="unisearch__excerpttext" dir="auto">
                            {/* A manuscript excerpt may hold a mention, cut or whole: read as its name (issue 31). */}
                            {result.excerpt.map((part, at) =>
                              part.isMatch ? (
                                <mark key={at}>{plainExcerpt(part.text)}</mark>
                              ) : (
                                <span key={at}>{plainExcerpt(part.text)}</span>
                              ),
                            )}
                          </span>
                        </span>
                      ) : null}
                    </span>
                  </li>
                )
              })
            : null}
        </ul>

        {showList && response?.hasMore ? (
          <p className="unisearch__more" data-testid="universe-search-more">
            {t('lore.search.more')}
          </p>
        ) : null}
      </div>
    </>
  )
}
