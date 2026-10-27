import { useEffect, useId, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronRight, Search, UserSearch } from 'lucide-react'
import { ActionIcon } from './ActionIcon'
import { EmptyState } from './EmptyState'
import { EntityPicker, type EntityChoice } from './EntityPicker'
import { listFamilies } from '../familyTree/api'
import type { FamilyDiscoveryPage } from '../familyTree/types'

/** What a family summary carries in history, so "Browse families" on its tree can come back to this search and page. */
export interface FamiliesReturn {
  familiesFrom: string
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; key: string; result: FamilyDiscoveryPage }
  | { kind: 'error'; key: string }

/**
 * The Family Tree's opening page: the families the universe already holds, found from its family links (ADR 0035
 * amendment), so a tree is a click away without knowing whose to ask for.
 *
 * A family has no name of its own - it is a group of connected entries - so a summary names a few members and says how
 * many there are, and opens the tree on one of them. The search and the page live in the address (`?q=` and `?page=`):
 * a reload, a shared link and the browser's Back all land on the same list. Only typing waits a moment before asking.
 *
 * Choosing a character is the second way in, for someone with no family yet - the way a first connection is recorded. It
 * is the same picker the tree uses, folded away until it is wanted, and open from the start when there is no family to
 * show.
 */
export function FamilyDiscovery({
  universeId,
  canEdit,
  onChoose,
}: {
  universeId: string
  canEdit: boolean
  onChoose: (choice: EntityChoice | null) => void
}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const q = searchParams.get('q') ?? ''
  const page = Math.max(1, Number(searchParams.get('page')) || 1)

  const [text, setText] = useState(q)
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [reads, setReads] = useState(0)
  const [isFinding, setIsFinding] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const focusHeading = useRef(false)
  const headingId = useId()
  const searchId = useId()
  const pickerId = useId()

  // The address leads: Back or Forward to another search puts its words back in the box. Adjusted while rendering, when
  // the address's search changes, rather than in an effect.
  const [shownQ, setShownQ] = useState(q)
  if (shownQ !== q) {
    setShownQ(q)
    if (text.trim() !== q) setText(q)
  }

  // Typing settles for a moment before the address - and so the list - follows, on the first page, replacing the entry
  // rather than leaving one per keystroke in the history.
  useEffect(() => {
    if (text.trim() === q) return
    const timer = setTimeout(() => {
      const next = new URLSearchParams(searchParams)
      if (text.trim()) next.set('q', text.trim())
      else next.delete('q')
      next.delete('page')
      setSearchParams(next, { replace: true })
    }, 150)
    return () => {
      clearTimeout(timer)
    }
  }, [text, q, searchParams, setSearchParams])

  const key = `${q}\u0000${page}\u0000${reads}`

  useEffect(() => {
    const controller = new AbortController()
    listFamilies(universeId, { q, page }, controller.signal)
      .then((result) => setState({ kind: 'ready', key, result }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ kind: 'error', key })
      })
    return () => {
      controller.abort()
    }
  }, [universeId, q, page, key])

  // The answer for another search or page is kept on screen while the next arrives, so the list does not jump.
  const result = state.kind === 'ready' ? state.result : null
  const isCurrent = state.kind !== 'loading' && state.key === key

  useEffect(() => {
    if (isCurrent && focusHeading.current) {
      focusHeading.current = false
      headingRef.current?.focus()
    }
  }, [isCurrent])

  // Unfiltered and empty: no family exists yet, and choosing someone is the way to start one.
  const isEmpty = isCurrent && !!result && result.totalCount === 0 && !q
  const showPicker = isFinding || isEmpty

  useEffect(() => {
    if (isFinding) pickerRef.current?.querySelector('input')?.focus()
  }, [isFinding])

  function goToPage(next: number) {
    const params = new URLSearchParams(searchParams)
    if (next > 1) params.set('page', String(next))
    else params.delete('page')
    focusHeading.current = true
    navigate({ search: params.toString() ? `?${params}` : '' })
  }

  const returnTo: FamiliesReturn = { familiesFrom: location.search }

  return (
    <div className="discovery" data-testid="family-discovery">
      {isEmpty ? null : (
        <div className="discovery__bar">
          <div className="discovery__search">
            <label className="field__label" htmlFor={searchId}>
              Search families by member
            </label>
            <span className="controls__searchfield">
              <Search className="controls__searchicon" aria-hidden="true" focusable="false" />
              <input
                id={searchId}
                className="field__input"
                type="search"
                name="q"
                placeholder="Any name in the family"
                autoComplete="off"
                spellCheck={false}
                value={text}
                onChange={(event) => setText(event.target.value)}
                data-testid="family-search"
              />
            </span>
          </div>
          <button
            className="button button--secondary"
            type="button"
            aria-expanded={isFinding}
            aria-controls={pickerId}
            onClick={() => setIsFinding((open) => !open)}
            data-testid="family-find-character"
          >
            <ActionIcon icon={UserSearch} />
            Find a character
          </button>
        </div>
      )}

      {isEmpty ? (
        <EmptyState
          testId="family-none"
          title="No families recorded yet."
          hint={
            canEdit
              ? 'A family shows up here once two people are connected by a kind with a family meaning. Choose someone to record their first connection.'
              : 'A family shows up here once two people are connected by a kind with a family meaning.'
          }
        />
      ) : null}

      {showPicker ? (
        <div
          className="discovery__picker"
          id={pickerId}
          ref={pickerRef}
          data-testid="family-picker"
        >
          <EntityPicker
            label="Whose family?"
            universeId={universeId}
            value={null}
            onChange={onChoose}
            familyTreeOnly
            placeholder="Search this universe"
          />
          {isEmpty ? null : (
            <p className="discovery__pickerhint">
              Opens anyone&rsquo;s tree, even with no family recorded yet.
            </p>
          )}
        </div>
      ) : null}

      {isEmpty ? null : (
        <section className="discovery__families" aria-labelledby={headingId}>
          <div className="discovery__head">
            <h2 className="settings__heading" id={headingId} ref={headingRef} tabIndex={-1}>
              Families in this universe
            </h2>
            {result ? (
              <p className="discovery__count" role="status" data-testid="family-count">
                {result.totalCount === 0
                  ? 'No family has a member by that name.'
                  : q
                    ? `${result.totalCount} ${result.totalCount === 1 ? 'family includes' : 'families include'} “${q}”.`
                    : `${result.totalCount} ${result.totalCount === 1 ? 'family' : 'families'}`}
              </p>
            ) : null}
          </div>

          {state.kind === 'loading' && !result ? (
            <p className="notice" role="status">
              Finding families…
            </p>
          ) : null}

          {state.kind === 'error' && isCurrent ? (
            <div className="notice notice--error" role="alert" data-testid="family-discovery-error">
              <p>The families could not be read.</p>
              <button
                className="button button--secondary"
                type="button"
                onClick={() => setReads((current) => current + 1)}
              >
                Try again
              </button>
            </div>
          ) : null}

          {result && result.items.length > 0 ? (
            <ul className="discovery__list" aria-busy={!isCurrent} data-testid="family-list">
              {result.items.map((family) => (
                <li key={family.focusEntityId}>
                  <Link
                    className="familycard"
                    to={`/app/universes/${universeId}/family-tree/${family.focusEntityId}`}
                    state={returnTo}
                    data-testid="family-card"
                  >
                    <span className="familycard__names">
                      {family.previewMembers.map((member, index) => (
                        <span key={member.entityId}>
                          {index > 0 ? ', ' : null}
                          <bdi>{member.name}</bdi>
                        </span>
                      ))}
                    </span>
                    <span className="familycard__count" data-testid="family-card-count">
                      {family.memberCount} {family.memberCount === 1 ? 'member' : 'members'}
                    </span>
                    <ChevronRight
                      className="familycard__chevron"
                      aria-hidden="true"
                      focusable="false"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}

          {result && result.totalPages > 1 ? (
            <nav className="pager" aria-label="Family pages">
              <button
                className="button button--secondary"
                type="button"
                disabled={result.page <= 1}
                onClick={() => goToPage(result.page - 1)}
              >
                Previous
              </button>
              <span className="pager__position">
                Page {result.page} of {result.totalPages}
              </span>
              <button
                className="button button--secondary"
                type="button"
                disabled={result.page >= result.totalPages}
                onClick={() => goToPage(result.page + 1)}
                data-testid="family-next-page"
              >
                Next
              </button>
            </nav>
          ) : null}
        </section>
      )}
    </div>
  )
}
