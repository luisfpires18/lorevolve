import { useEffect, useState, type FormEvent } from 'react'
import {
  useLocation,
  useNavigate,
  useSearchParams,
  type SetURLSearchParams,
} from 'react-router-dom'
import { Search, X } from 'lucide-react'

/** The API's own limit on a search, so the field cannot ask for something it would refuse. */
const SEARCH_MAX = 100
/** Long enough to let a word be typed, short enough that results follow the typing. */
const SEARCH_PAUSE_MS = 300

/**
 * The portal's search, in its bar, on every portal page. On Explore it is Explore's `q`: what is typed is sent after
 * a short pause - or at once on Enter, and at once when it is emptied - so the address and the results follow a
 * word, not every keystroke. Refining a search replaces the history entry; starting or clearing one adds one, so
 * Back returns to the unsearched page. Anywhere else, Enter opens Explore with the search.
 */
export function PortalSearch() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const onExplore = pathname === '/explore'
  const q = onExplore ? (params.get('q') ?? '').trim().slice(0, SEARCH_MAX) : ''

  const [draft, setDraft] = useState(q)
  const [draftFor, setDraftFor] = useState(q)

  // Back, Forward or a filter reset changed the address: the field shows what the address now says - unless it
  // already does, give or take the spaces still being typed.
  if (draftFor !== q) {
    setDraftFor(q)
    if (draft.trim() !== q) setDraft(q)
  }

  useEffect(() => {
    if (!onExplore || draft.trim() === q || draft.trim() === '') return
    const timer = window.setTimeout(() => commitSearch(draft, q, setParams), SEARCH_PAUSE_MS)
    return () => {
      window.clearTimeout(timer)
    }
  }, [draft, q, onExplore, setParams])

  function submit(event: FormEvent) {
    event.preventDefault()
    if (onExplore) {
      commitSearch(draft, q, setParams)
      return
    }
    const next = draft.trim().slice(0, SEARCH_MAX)
    void navigate(next ? `/explore?${new URLSearchParams({ q: next })}` : '/explore')
  }

  return (
    <form className="portal-search" role="search" onSubmit={submit}>
      <label className="visually-hidden" htmlFor="portal-q">
        Search worlds
      </label>
      <Search className="portal-search__icon" aria-hidden="true" size={18} strokeWidth={1.75} />
      <input
        className="portal-search__input"
        id="portal-q"
        type="search"
        placeholder="Search worlds and authors"
        value={draft}
        maxLength={SEARCH_MAX}
        autoComplete="off"
        dir="auto"
        onChange={(event) => {
          setDraft(event.target.value)
          if (onExplore && event.target.value.trim() === '') commitSearch('', q, setParams)
        }}
        data-testid="explore-search"
      />
      {draft ? (
        <button
          className="portal-search__clear"
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setDraft('')
            if (onExplore) commitSearch('', q, setParams)
            document.getElementById('portal-q')?.focus()
          }}
          data-testid="explore-search-clear"
        >
          <X aria-hidden="true" size={16} strokeWidth={1.75} />
        </button>
      ) : null}
    </form>
  )
}

/** Puts a search into Explore's address. Refining one replaces the entry; starting or clearing one adds an entry. */
function commitSearch(value: string, q: string, setParams: SetURLSearchParams) {
  const next = value.trim().slice(0, SEARCH_MAX)
  if (next === q) return
  setParams(
    (was) => {
      const now = new URLSearchParams(was)
      if (next) now.set('q', next)
      else now.delete('q')
      return now
    },
    { replace: Boolean(q) && Boolean(next) },
  )
}
