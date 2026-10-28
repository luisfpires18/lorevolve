import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react'
import { plainExcerpt } from '../lore/mentions'
import { useLocation, useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { confirmLeaving } from '../lib/leaveGuard'
import { resultContext, resultPath, searchQuery, searchUniverse } from '../search/api'
import {
  SEARCH_FIELD_LABELS,
  SEARCH_KIND_LABELS,
  type SearchResponse,
  type SearchResult,
} from '../search/types'

/** How long typing has to pause before a search is sent. Short enough to feel immediate, long enough not to send every key. */
const DEBOUNCE_MS = 200

/** A search that has come back, for the query it was sent for. Nothing else is ever shown as its results. */
type Settled =
  { query: string; kind: 'ready'; response: SearchResponse } | { query: string; kind: 'error' }

/**
 * The persistent search bar of a universe (ADR 0031): a combobox whose popup lists what the universe's recorded content
 * holds of what was typed - lore and articles, stories, chapters, scenes, arcs, beats, manuscripts and the universe's
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
  const navigate = useNavigate()
  const location = useLocation()
  const baseId = useId()
  const inputId = `${baseId}input`
  const listId = `${baseId}list`
  const hintId = `${baseId}hint`
  const optionId = (index: number) => `${baseId}option${index}`

  const input = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [settled, setSettled] = useState<Settled | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [opened, setOpened] = useState('')

  // Held as the location the list was opened at, not a boolean, so arriving anywhere else - a result, a link, Back -
  // closes it without an effect chasing the address.
  const [openAt, setOpenAt] = useState<string | null>(null)
  const isOpen = openAt === location.key

  // The highlighted option belongs to one query: typing anything else lets go of it.
  const [active, setActive] = useState<{ query: string; index: number } | null>(null)

  const query = searchQuery(text)

  useEffect(() => {
    if (query === '') return

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      searchUniverse(universeId, query, controller.signal)
        .then((response) => setSettled({ query, kind: 'ready', response }))
        .catch(() => {
          // Replaced by a newer search, or the bar went away: nothing failed.
          if (controller.signal.aborted) return
          setSettled({ query, kind: 'error' })
        })
    }, DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [universeId, query, attempt])

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
  useEffect(() => {
    if (activeIndex < 0) return
    document.getElementById(`${baseId}option${activeIndex}`)?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, baseId])

  const announcement = !isOpen
    ? opened
    : status === 'error'
      ? 'The search could not be reached.'
      : status === 'empty'
        ? `Nothing in this universe matches “${query}”.`
        : status === 'results'
          ? `${results.length === 1 ? '1 result' : `${results.length} results`}${
              response?.hasMore ? ', and more that are not shown' : ''
            }. Use the up and down arrows to choose one.`
          : ''

  /** Shows the list here, and lets go of what was said about the last result opened: it is not news any more. */
  function openList() {
    setOpenAt(location.key)
    setOpened('')
  }

  async function open(result: SearchResult, by: 'keyboard' | 'pointer') {
    const to = resultPath(universeId, result)
    const next = new URL(to, window.location.origin)
    const samePage =
      next.pathname === window.location.pathname && next.search === window.location.search

    // Another page is a way out of this one: the leave question first, as a link asks it. Staying changes nothing here.
    if (!samePage && !(await confirmLeaving())) return

    setOpenAt(null)
    setOpened(`Opened ${SEARCH_KIND_LABELS[result.kind]} “${result.title}”.`)

    // A tap has done its work: letting go of the box puts a phone's keyboard away. A key press keeps the focus here, so the
    // next search or the next result is one key away.
    if (by === 'pointer') input.current?.blur()

    // The very address already open is replaced rather than stacked, so the history never holds the same place twice.
    void navigate(to, { replace: samePage && next.hash === window.location.hash })
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // An input method still composing a word owns these keys.
    if (event.nativeEvent.isComposing) return

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault()
        if (!isOpen) {
          openList()
          if (results.length > 0) setActive({ query, index: 0 })
          return
        }
        if (results.length === 0) return

        const last = results.length - 1
        const index =
          event.key === 'ArrowDown'
            ? activeIndex < 0 || activeIndex === last
              ? 0
              : activeIndex + 1
            : activeIndex <= 0
              ? last
              : activeIndex - 1
        setActive({ query, index })
        return
      }

      case 'Enter': {
        if (!showList) return
        event.preventDefault()
        void open(results[activeIndex < 0 ? 0 : activeIndex], 'keyboard')
        return
      }

      case 'Escape': {
        // Handled here either way, so the browser's own search box never clears itself behind the list's back.
        if (isOpen && query !== '') {
          event.preventDefault()
          setOpenAt(null)
        } else if (text !== '') {
          event.preventDefault()
          setText('')
          setOpened('')
        }
        return
      }

      case 'Tab':
        setOpenAt(null)
        return
    }
  }

  /** The list closes when the focus leaves the bar - for the page, not for the list's own Try again. */
  function onBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpenAt(null)
  }

  function retry() {
    setSettled(null)
    setAttempt((count) => count + 1)
    input.current?.focus()
  }

  return (
    <div className="unisearch" role="search" onBlur={onBlur} data-testid="universe-search">
      <label className="visually-hidden" htmlFor={inputId}>
        Search this universe
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
        placeholder="Search this universe"
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
        Finds words in the lore and articles, stories, chapters, scenes, arcs, beats, manuscripts
        and ideas of this universe. Results are listed as you type.
      </p>
      <p className="visually-hidden" role="status" data-testid="universe-search-announcer">
        {announcement}
      </p>

      {/* Pressing anywhere in the panel keeps the focus in the box, so a click lands before the box can close it. */}
      <div
        className="unisearch__panel"
        hidden={!isOpen}
        onMouseDown={(event) => event.preventDefault()}
        data-testid="universe-search-panel"
      >
        {status === 'idle' ? (
          <p className="unisearch__note">
            Search the lore and articles, stories, chapters, scenes, arcs, beats, manuscripts and
            ideas of this universe.
          </p>
        ) : null}

        {status === 'searching' ? (
          <p className="unisearch__note" data-testid="universe-search-searching">
            Searching…
          </p>
        ) : null}

        {status === 'empty' ? (
          <p className="unisearch__note" data-testid="universe-search-empty">
            Nothing in this universe matches “<span dir="auto">{query}</span>”.
          </p>
        ) : null}

        {status === 'error' ? (
          <div className="unisearch__note unisearch__failure" data-testid="universe-search-error">
            <p>The search could not be reached.</p>
            <button className="button button--secondary" type="button" onClick={retry}>
              Try again
            </button>
          </div>
        ) : null}

        <ul
          className="unisearch__list"
          id={listId}
          role="listbox"
          aria-label="Results"
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
            The closest matches of each kind. Add a word to narrow it down.
          </p>
        ) : null}
      </div>
    </div>
  )
}
