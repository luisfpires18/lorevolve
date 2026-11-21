import { useCallback, useId, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { Drawer } from './Drawer'
import { SearchField } from './SearchField'
import { SegmentedControl } from './SegmentedControl'
import { SegmentedField } from './SegmentedField'
import { useDebouncedValue } from '../lib/useDebouncedValue'
import { useAsyncRead } from '../lib/useAsyncRead'
import { FormActions } from './FormActions'
import { LoadingNote } from './LoadingNote'
import { FormMessage } from './FormMessage'
import { Callout } from './Callout'

/** How one search result is offered. */
export interface PickOption {
  key: string
  name: string
  /** Isolates the name's text direction from the words around it. */
  isolate?: boolean
  context: string | null
}

interface SearchPickDrawerProps<T, K extends string | number> {
  testId: string
  /** Prefix of the close, search, empty, results and option test ids: `<prefix>-close` and so on. */
  testPrefix: string
  eyebrow: ReactNode
  title: string
  searchLabel: string
  /** A choice of what to search, shown above the search box. Each change asks again. */
  narrow?: {
    label: string
    initial: K
    options: ComponentProps<typeof SegmentedControl<K>>['options']
  }
  placeholder: (choice: K | undefined) => string
  /** Read when the settled words or the choice change: what it searches stays fixed while the drawer is open. */
  search: (words: string, choice: K | undefined, signal: AbortSignal) => Promise<T[]>
  option: (item: T) => PickOption
  /** Option keys already chosen: shown disabled, with the `done` word instead of `add`. */
  chosen: Set<string>
  onChoose: (item: T) => void
  onClose: () => void
  words: {
    looking: string
    failed: string
    /** Nothing to offer: `named` when words are typed, `none` when not. */
    empty: { named: string; none: string }
    add: string
    done: string
  }
}

/**
 * Choosing one thing found by name, in the drawer every LorEvolve form uses: an optional choice of what to search, a
 * search box, then the matches as buttons. Every control is an ordinary button or field, so Tab walks it in order,
 * Escape closes it and the focus goes back to what opened it.
 */
export function SearchPickDrawer<T, K extends string | number = never>({
  testId,
  testPrefix,
  eyebrow,
  title,
  searchLabel,
  narrow,
  placeholder,
  search,
  option,
  chosen,
  onChoose,
  onClose,
  words,
}: SearchPickDrawerProps<T, K>) {
  const searchBox = useRef<HTMLInputElement>(null)
  const headingId = useId()
  const searchId = useId()
  const resultsId = useId()
  const [choice, setChoice] = useState(narrow?.initial)
  const [query, setQuery] = useState('')
  // Typing settles before the API is asked, so a fast typist makes one call, not ten.
  const settled = useDebouncedValue(query)
  const read = useCallback(
    (signal: AbortSignal) => search(settled, choice, signal),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settled, choice],
  )
  const { load } = useAsyncRead(read, { key: `${choice}:${settled}` })
  // Words not settled yet are still being looked up, so a list is never shown for words no longer typed.
  const results = query !== settled || load.kind === 'loading' ? undefined : load

  return (
    <Drawer
      initialFocus={searchBox}
      testId={testId}
      titleId={headingId}
      className="ideapicker"
      eyebrow={eyebrow}
      title={title}
      onClose={onClose}
      actions={() => (
        <FormActions onCancel={onClose} dismiss="close" cancelTestId={`${testPrefix}-close`} />
      )}
    >
      {narrow && choice !== undefined ? (
        <SegmentedField
          label={narrow.label}
          options={narrow.options}
          value={choice}
          onChange={setChoice}
        />
      ) : null}

      <SearchField
        id={searchId}
        label={searchLabel}
        inputRef={searchBox}
        value={query}
        placeholder={placeholder(choice)}
        onChange={setQuery}
        clearOnEscape
        aria-controls={resultsId}
        testId={`${testPrefix}-search`}
      />

      <div id={resultsId} aria-live="polite">
        {results === undefined ? (
          <LoadingNote className="ideapicker__notice">{words.looking}</LoadingNote>
        ) : results.kind !== 'ready' ? (
          <FormMessage>{words.failed}</FormMessage>
        ) : results.value.length === 0 ? (
          <Callout
            look="notice"
            as="p"
            className="ideapicker__notice"
            testId={`${testPrefix}-empty`}
          >
            {query.trim() ? words.empty.named : words.empty.none}
          </Callout>
        ) : (
          <ul className="ideapicker__results" data-testid={`${testPrefix}-results`}>
            {results.value.map((item) => {
              const shown = option(item)
              const done = chosen.has(shown.key)
              return (
                <li key={shown.key}>
                  <button
                    className="ideapicker__option"
                    type="button"
                    disabled={done}
                    onClick={() => onChoose(item)}
                    data-testid={`${testPrefix}-option`}
                    data-name={shown.name}
                  >
                    <span className="ideapicker__name">
                      {shown.isolate ? <bdi>{shown.name}</bdi> : shown.name}
                    </span>
                    {shown.context ? (
                      <span className="ideapicker__context">{shown.context}</span>
                    ) : null}
                    <span className="ideapicker__state">{done ? words.done : words.add}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Drawer>
  )
}
