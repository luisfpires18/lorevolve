import { useEffect } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Search, UserSearch } from 'lucide-react'
import { EmptyState } from './EmptyState'
import { EntityPicker, type EntityChoice } from './EntityPicker'
import { useI18n } from '../i18n'
import { Field } from './Field'
import { useDiscoveryReads } from '../familyTree/useDiscoveryReads'
import { useDiscoverySearch } from '../familyTree/useDiscoverySearch'
import { useDiscoveryState } from '../familyTree/useDiscoveryState'
import { DiscoveryFamilies } from './familyTree/DiscoveryFamilies'
import { Button } from './Button'
import { QuietNote } from './QuietNote'

/** What a family summary carries in history, so "Browse families" on its tree can come back to this search and page. */
export interface FamiliesReturn {
  familiesFrom: string
}

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
  const { t } = useI18n()
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const q = searchParams.get('q') ?? ''
  const page = Math.max(1, Number(searchParams.get('page')) || 1)

  const discoveryState = useDiscoveryState({ q })
  const {
    text,
    setText,
    state,
    setReads,
    isFinding,
    setIsFinding,
    pickerRef,
    headingRef,
    focusHeading,
    headingId,
    searchId,
    pickerId,
  } = discoveryState

  useDiscoverySearch({ ...discoveryState, q, searchParams, setSearchParams })

  const { result, isCurrent } = useDiscoveryReads({ ...discoveryState, universeId, q, page })

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
          <Field
            label={t('places.discovery.searchLabel')}
            id={searchId}
            className="discovery__search"
          >
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
                  name="q"
                  placeholder={t('places.discovery.searchPlaceholder')}
                  autoComplete="off"
                  spellCheck={false}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  data-testid="family-search"
                />
              </span>
            )}
          </Field>
          <Button
            tone="secondary"
            icon={UserSearch}
            aria-expanded={isFinding}
            aria-controls={pickerId}
            onClick={() => setIsFinding((open) => !open)}
            data-testid="family-find-character"
          >
            {t('places.discovery.find')}
          </Button>
        </div>
      )}

      {isEmpty ? (
        <EmptyState
          testId="family-none"
          title={t('places.discovery.noneTitle')}
          hint={canEdit ? t('places.discovery.noneHintEditor') : t('places.discovery.noneHint')}
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
            label={t('places.discovery.whose')}
            universeId={universeId}
            value={null}
            onChange={onChoose}
            familyTreeOnly
            placeholder={t('places.discovery.pickerPlaceholder')}
          />
          {isEmpty ? null : (
            <QuietNote className="discovery__pickerhint">
              {t('places.discovery.pickerHint')}
            </QuietNote>
          )}
        </div>
      ) : null}

      {isEmpty ? null : (
        <DiscoveryFamilies
          universeId={universeId}
          headingId={headingId}
          headingRef={headingRef}
          q={q}
          state={state}
          result={result}
          isCurrent={isCurrent}
          setReads={setReads}
          returnTo={returnTo}
          goToPage={goToPage}
        />
      )}
    </div>
  )
}
