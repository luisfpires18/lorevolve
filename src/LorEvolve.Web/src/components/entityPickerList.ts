import { useEffect, type KeyboardEvent, type RefObject } from 'react'
import type { EntitySummary } from '../lore/types'

/** A click outside closes the list without choosing anything. */
export function useCloseOnOutside(
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
 *
 * The one place a list is scrolled into view: the pickers' lists, the universe search's highlighted option (passed
 * by its element id, which changes as the arrows move) and a highlighted invitation row. Runs again when `count` does.
 */
export function useKeepListInView(
  list: RefObject<HTMLElement | null> | string,
  isOpen: boolean,
  count: number,
) {
  useEffect(() => {
    if (!isOpen) return
    const element = typeof list === 'string' ? document.getElementById(list) : list.current
    element?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [list, isOpen, count])
}

export interface ListKeyOptions {
  isOpen: boolean
  open: () => void
  close: () => void
  results: EntitySummary[]
  active: number
  setActive: (update: (current: number) => number) => void
  choose: (item: EntitySummary) => void
  /** A last row after the results that is not an entry - Create "..." - taken by Enter like any other. */
  extra?: () => void
}

export function listKeyDown(event: KeyboardEvent<HTMLInputElement>, options: ListKeyOptions) {
  const { isOpen, open, close, results, active, setActive, choose, extra } = options
  const count = results.length + (extra ? 1 : 0)

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    if (!isOpen) {
      open()
      return
    }
    const step = event.key === 'ArrowDown' ? 1 : -1
    setActive((current) => (count === 0 ? 0 : (current + step + count) % count))
  } else if (event.key === 'Enter') {
    if (isOpen && results[active]) {
      event.preventDefault()
      choose(results[active])
    } else if (isOpen && extra && active === results.length) {
      event.preventDefault()
      extra()
    }
  } else if (event.key === 'Escape') {
    if (isOpen) {
      event.preventDefault()
      close()
    }
  }
}
