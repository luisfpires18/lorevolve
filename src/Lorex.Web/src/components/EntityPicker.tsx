import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { listEntities } from '../lore/api'
import type { EntitySummary } from '../lore/types'

const MAX_RESULTS = 8

/** What a picker hands back: enough to show a name without a second request. */
export interface EntityChoice {
  id: string
  name: string
  /** The entry's type, where a chooser keeps it to tell two of the same name apart. */
  typeName?: string
}

/**
 * Search-as-you-type over one universe, shared by both pickers. The API does the
 * searching, so nothing is preloaded and a large world costs the same as a small one.
 */
function useEntitySearch(
  universeId: string,
  query: string,
  isOpen: boolean,
  excludeIds: string[],
  familyTreeOnly = false,
  entityTypeId: string | null = null,
  entityTypeGroupId: string | null = null,
) {
  const [results, setResults] = useState<EntitySummary[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [active, setActive] = useState(0)

  // Joined rather than held as an array, so a fresh array carrying the same ids on every
  // render does not restart the search.
  const excludeKey = excludeIds.join(',')

  useEffect(() => {
    if (!isOpen) return

    const excluded = new Set(excludeKey ? excludeKey.split(',') : [])
    const controller = new AbortController()

    // Typing settles before the API is asked, so a fast typist makes one call, not ten.
    const timer = setTimeout(() => {
      setIsSearching(true)
      listEntities(
        universeId,
        {
          search: query,
          entityTypeId,
          entityTypeGroupId,
          canonStatus: null,
          tag: null,
          page: 1,
          familyTreeEligible: familyTreeOnly,
        },
        controller.signal,
      )
        .then((page) => {
          setResults(page.items.filter((item) => !excluded.has(item.id)).slice(0, MAX_RESULTS))
          setActive(0)
        })
        .catch(() => {
          /* An aborted or failed search simply leaves the previous results in place. */
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsSearching(false)
        })
    }, 200)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [universeId, query, excludeKey, isOpen, familyTreeOnly, entityTypeId, entityTypeGroupId])

  return { results, isSearching, active, setActive }
}

/** A click outside closes the list without choosing anything. */
function useCloseOnOutside(
  wrapper: RefObject<HTMLDivElement | null>,
  isOpen: boolean,
  close: () => void,
) {
  useEffect(() => {
    if (!isOpen) return

    function onPointerDown(event: PointerEvent) {
      if (!wrapper.current?.contains(event.target as Node)) close()
    }

    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [wrapper, isOpen, close])
}

/**
 * Keeps an open result list on screen.
 *
 * The list drops out of the field it belongs to, and both pickers are used in places
 * where that field is the last one in a scrolling container - the bottom of the timeline
 * drawer, the foot of a relation form. On a phone the list then opens below the fold,
 * behind the drawer's own action bar, and the author sees nothing happen at all. Asking
 * for the nearest scroll brings it into view without moving anything that already is.
 */
function useKeepListInView(
  list: RefObject<HTMLUListElement | null>,
  isOpen: boolean,
  count: number,
) {
  useEffect(() => {
    if (!isOpen) return
    list.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [list, isOpen, count])
}

interface ListKeyOptions {
  isOpen: boolean
  open: () => void
  close: () => void
  results: EntitySummary[]
  active: number
  setActive: (update: (current: number) => number) => void
  choose: (item: EntitySummary) => void
}

/** Arrow keys walk the list, Enter takes the highlighted row, Escape gives up on it. */
function listKeyDown(event: KeyboardEvent<HTMLInputElement>, options: ListKeyOptions) {
  const { isOpen, open, close, results, active, setActive, choose } = options

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    if (!isOpen) {
      open()
      return
    }
    const step = event.key === 'ArrowDown' ? 1 : -1
    setActive((current) =>
      results.length === 0 ? 0 : (current + step + results.length) % results.length,
    )
  } else if (event.key === 'Enter') {
    if (isOpen && results[active]) {
      event.preventDefault()
      choose(results[active])
    }
  } else if (event.key === 'Escape') {
    if (isOpen) {
      event.preventDefault()
      close()
    }
  }
}

interface EntityPickerProps {
  label: string
  universeId: string
  /** The entity currently chosen, so the field can show its name rather than an id. */
  value: EntityChoice | null
  onChange: (choice: EntityChoice | null) => void
  /** Left out of the results. Normally the entry being edited. */
  excludeId?: string
  /** Only entries whose type is enabled for the Family Tree. */
  familyTreeOnly?: boolean
  /**
   * Only entries of exactly this type, searched for by the API rather than filtered here: a link field limited to one
   * type. Null or left out offers every type.
   */
  entityTypeId?: string | null
  /** Only entries whose type is in this semantic group: a link field limited to a group. */
  entityTypeGroupId?: string | null
  placeholder?: string
  error?: string
}

/** One entity, or none. Used for a relation's other end and for the timeline filter. */
export function EntityPicker({
  label,
  universeId,
  value,
  onChange,
  excludeId,
  familyTreeOnly = false,
  entityTypeId = null,
  entityTypeGroupId = null,
  placeholder = 'Search this universe',
  error,
}: EntityPickerProps) {
  const inputId = useId()
  const listId = useId()

  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  const wrapper = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const focusInput = useRef(false)
  const { results, isSearching, active, setActive } = useEntitySearch(
    universeId,
    query,
    isOpen,
    excludeId ? [excludeId] : [],
    familyTreeOnly,
    entityTypeId,
    entityTypeGroupId,
  )

  useCloseOnOutside(wrapper, isOpen, () => setIsOpen(false))
  useKeepListInView(list, isOpen, results.length)

  // Change removes the button that was pressed, so the focus follows to the search box that replaces it rather than falling
  // to the page.
  useEffect(() => {
    if (focusInput.current && !value) {
      focusInput.current = false
      input.current?.focus()
    }
  })

  function choose(item: EntitySummary) {
    onChange({ id: item.id, name: item.name, typeName: item.entityTypeName })
    setIsOpen(false)
    setQuery('')
  }

  return (
    <div className="field picker" ref={wrapper}>
      <label className="field__label" htmlFor={inputId}>
        {label}
      </label>

      {value ? (
        <p className="picker__chosen">
          <span className="picker__chosenname">
            <bdi>{value.name}</bdi>
          </span>
          <button
            className="button button--secondary button--sm"
            type="button"
            onClick={() => {
              focusInput.current = true
              onChange(null)
              setIsOpen(true)
            }}
            data-testid="picker-clear"
          >
            Change
          </button>
        </p>
      ) : (
        <>
          <input
            id={inputId}
            ref={input}
            className="field__input"
            type="text"
            role="combobox"
            autoComplete="off"
            aria-expanded={isOpen}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-invalid={error ? true : undefined}
            aria-activedescendant={
              isOpen && results[active] ? `${listId}-${results[active].id}` : undefined
            }
            placeholder={placeholder}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setIsOpen(true)
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={(event) =>
              listKeyDown(event, {
                isOpen,
                open: () => setIsOpen(true),
                close: () => setIsOpen(false),
                results,
                active,
                setActive,
                choose,
              })
            }
            data-testid="picker-input"
          />

          {isOpen ? (
            <ul className="picker__list" id={listId} role="listbox" aria-label={label} ref={list}>
              {results.map((item, index) => (
                <li key={item.id}>
                  <button
                    id={`${listId}-${item.id}`}
                    className="picker__option"
                    type="button"
                    role="option"
                    aria-selected={index === active}
                    onMouseEnter={() => setActive(() => index)}
                    onClick={() => choose(item)}
                    data-testid={`picker-option-${item.name}`}
                  >
                    <span className="picker__name">
                      <bdi>{item.name}</bdi>
                    </span>
                    <span className="picker__kind">
                      <bdi>{item.entityTypeName}</bdi>
                    </span>
                  </button>
                </li>
              ))}

              {results.length === 0 ? (
                <li className="picker__none">
                  {isSearching ? 'Looking…' : 'Nothing here by that name.'}
                </li>
              ) : null}
            </ul>
          ) : null}
        </>
      )}

      {error ? <p className="field__error">{error}</p> : null}
    </div>
  )
}

interface EntityMultiPickerProps {
  label: string
  hint?: string
  universeId: string
  /** Everyone and everything already taking part, in the order they were added. */
  value: EntityChoice[]
  onChange: (choices: EntityChoice[]) => void
  placeholder?: string
  error?: string
}

/**
 * Several entities at once, on the same search. Chosen ones sit as tokens in the field
 * and drop out of the results, so nothing can be added twice.
 */
export function EntityMultiPicker({
  label,
  hint,
  universeId,
  value,
  onChange,
  placeholder = 'Search this universe',
  error,
}: EntityMultiPickerProps) {
  const inputId = useId()
  const listId = useId()
  const hintId = useId()

  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  const wrapper = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const { results, isSearching, active, setActive } = useEntitySearch(
    universeId,
    query,
    isOpen,
    value.map((choice) => choice.id),
  )

  useCloseOnOutside(wrapper, isOpen, () => setIsOpen(false))
  useKeepListInView(list, isOpen, results.length)

  function choose(item: EntitySummary) {
    onChange([...value, { id: item.id, name: item.name }])
    setQuery('')
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Backspace on an empty field takes the last one back off, as it does for tags.
    if (event.key === 'Backspace' && query === '' && value.length > 0) {
      onChange(value.slice(0, -1))
      return
    }

    listKeyDown(event, {
      isOpen,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
      results,
      active,
      setActive,
      choose,
    })
  }

  return (
    <div className="field picker" ref={wrapper}>
      <label className="field__label" htmlFor={inputId}>
        {label}
      </label>
      {hint ? (
        <p className="field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}

      <div className="tokens" data-testid="participants">
        {value.map((choice) => (
          <span className="token" key={choice.id}>
            <bdi>{choice.name}</bdi>
            <button
              type="button"
              className="token__remove"
              aria-label={`Remove ${choice.name}`}
              onClick={() => onChange(value.filter((candidate) => candidate.id !== choice.id))}
              data-testid={`participant-remove-${choice.name}`}
            >
              &times;
            </button>
          </span>
        ))}
        <input
          id={inputId}
          className="tokens__input"
          type="text"
          role="combobox"
          autoComplete="off"
          aria-expanded={isOpen}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-describedby={hint ? hintId : undefined}
          aria-invalid={error ? true : undefined}
          aria-activedescendant={
            isOpen && results[active] ? `${listId}-${results[active].id}` : undefined
          }
          placeholder={value.length === 0 ? placeholder : ''}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setIsOpen(true)
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={onKeyDown}
          data-testid="participant-input"
        />
      </div>

      {isOpen ? (
        <ul className="picker__list" id={listId} role="listbox" aria-label={label} ref={list}>
          {results.map((item, index) => (
            <li key={item.id}>
              <button
                id={`${listId}-${item.id}`}
                className="picker__option"
                type="button"
                role="option"
                aria-selected={index === active}
                onMouseEnter={() => setActive(() => index)}
                onClick={() => choose(item)}
                data-testid={`participant-option-${item.name}`}
              >
                <span className="picker__name">
                  <bdi>{item.name}</bdi>
                </span>
                <span className="picker__kind">
                  <bdi>{item.entityTypeName}</bdi>
                </span>
              </button>
            </li>
          ))}

          {results.length === 0 ? (
            <li className="picker__none">
              {isSearching ? 'Looking…' : 'Nothing here by that name.'}
            </li>
          ) : null}
        </ul>
      ) : null}

      {error ? <p className="field__error">{error}</p> : null}
    </div>
  )
}
