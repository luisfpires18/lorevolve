import type { FocusEvent, KeyboardEvent } from 'react'
import { confirmLeaving } from '../lib/leaveGuard'
import { resultPath } from './api'
import { SEARCH_KIND_LABELS, type SearchResult } from './types'
import type { useI18n } from '../i18n'
import type { useUniverseSearchState } from './useUniverseSearchState'

/** The search bar's handlers: opening the list, opening a result, the keys, leaving the bar and Try again. */
export function universeSearchActions({
  universeId,
  t,
  navigate,
  location,
  input,
  text,
  setText,
  setSettled,
  setAttempt,
  setOpened,
  setOpenAt,
  isOpen,
  setActive,
  query,
  results,
  showList,
  activeIndex,
}: ReturnType<typeof useUniverseSearchState> & {
  universeId: string
  t: ReturnType<typeof useI18n>['t']
  results: SearchResult[]
  showList: boolean
  activeIndex: number
}) {
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
    setOpened(
      t('lore.search.opened', { kind: SEARCH_KIND_LABELS[result.kind], title: result.title }),
    )

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
  return { openList, open, onKeyDown, onBlur, retry }
}
