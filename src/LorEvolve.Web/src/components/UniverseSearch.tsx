import { Search } from 'lucide-react'
import { useI18n } from '../i18n'
import { useUniverseSearchState } from '../search/useUniverseSearchState'
import { useUniverseSearchFetch } from '../search/useUniverseSearchFetch'
import { universeSearchActions } from '../search/universeSearchActions'
import { UniverseSearchList } from './search/UniverseSearchList'
import { Announce } from './Announce'
import { useKeepListInView } from './entityPickerList'

/**
 * The persistent search bar of a universe (ADR 0031): a combobox whose popup lists what the universe's recorded content
 * holds of what was typed - lore and articles, stories, chapters, scenes, arcs, manuscripts and the universe's
 * ideas - and opens the one chosen where it already lives.
 *
 * The APG "combobox with listbox popup", list autocomplete with manual selection. The focus stays in the box; the arrows
 * move a highlighted option named by `aria-activedescendant`; Enter opens it, or the first result when none is highlighted;
 * Escape closes the list, and clears the box when the list is already closed; Tab leaves. A result is opened with a push
 * onto the history - never one entry per key - so Back returns to where the search was made.
 *
 * Only results for exactly what is in the box are ever listed: while a newer search is on its way the list says it is
 * searching instead of showing the last answer as if it were this one's, and an older answer arriving late is never shown.
 * A search that is replaced is aborted, and an abort is not a failure.
 *
 * Opening a result is a way out of the page like following a link, so it asks the same leave question first when unsaved
 * writing would be left behind (`confirmLeaving`), and staying keeps the list, the text and the focus. A result on the page
 * already open - the same address with another anchor - leaves nothing and asks nothing.
 */
export function UniverseSearch({ universeId }: { universeId: string }) {
  const { t, tn } = useI18n()
  const state = useUniverseSearchState()
  const {
    inputId,
    listId,
    hintId,
    optionId,
    input,
    text,
    setText,
    settled,
    attempt,
    setSettled,
    opened,
    isOpen,
    active,
    query,
  } = state
  useUniverseSearchFetch({ universeId, query, attempt, setSettled })

  const current = settled !== null && settled.query === query ? settled : null
  const response = current?.kind === 'ready' ? current.response : null
  const results = response?.results ?? []

  const status =
    query === ''
      ? 'idle'
      : current === null
        ? 'searching'
        : current.kind === 'error'
          ? 'error'
          : results.length === 0
            ? 'empty'
            : 'results'

  const showList = isOpen && status === 'results'
  const activeIndex =
    active !== null && active.query === query && active.index < results.length ? active.index : -1

  // The highlighted option is kept in view as the arrows walk past the edge of the list.
  useKeepListInView(optionId(activeIndex), activeIndex >= 0, activeIndex)

  const announcement = !isOpen
    ? opened
    : status === 'error'
      ? t('lore.search.unreachable')
      : status === 'empty'
        ? t('lore.search.empty', { query })
        : status === 'results'
          ? tn(
              response?.hasMore
                ? 'lore.search.announce.resultsMore'
                : 'lore.search.announce.results',
              results.length,
              { n: results.length },
            )
          : ''

  const { openList, open, onKeyDown, onBlur, retry } = universeSearchActions({
    ...state,
    universeId,
    t,
    results,
    showList,
    activeIndex,
  })

  return (
    <div className="unisearch" role="search" onBlur={onBlur} data-testid="universe-search">
      <label className="visually-hidden" htmlFor={inputId}>
        {t('lore.search.label')}
      </label>
      <span className="unisearch__icon" aria-hidden="true">
        <Search size={17} strokeWidth={1.75} />
      </span>
      <input
        ref={input}
        id={inputId}
        className="unisearch__input"
        type="search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        aria-describedby={hintId}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
        placeholder={t('lore.search.label')}
        value={text}
        onChange={(event) => {
          setText(event.target.value)
          openList()
        }}
        onFocus={openList}
        onClick={openList}
        onKeyDown={onKeyDown}
        data-testid="universe-search-input"
      />
      <p className="visually-hidden" id={hintId}>
        {t('lore.search.hint')}
      </p>
      <Announce testId="universe-search-announcer">{announcement}</Announce>

      <UniverseSearchList
        isOpen={isOpen}
        status={status}
        query={query}
        retry={retry}
        listId={listId}
        showList={showList}
        results={results}
        optionId={optionId}
        activeIndex={activeIndex}
        open={open}
        response={response}
      />
    </div>
  )
}
