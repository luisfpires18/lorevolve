import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import type { QueryTab } from '../lib/queryTab'

interface QueryTabListProps<Id extends string> {
  /** Names the tab list, and prefixes every tab's and panel's id. */
  label: string
  idPrefix: string
  tabs: readonly QueryTab<Id>[]
  tab: Id
  onChoose: (next: Id) => void
}

/** The tab row: the tab pattern's keys - arrows move and choose, Home and End jump - and, on a phone, the chosen tab kept
 *  in view inside a row that scrolls sideways without moving the page. */
export function QueryTabList<Id extends string>({
  label,
  idPrefix,
  tabs,
  tab,
  onChoose,
}: QueryTabListProps<Id>) {
  const tabRefs = useRef(new Map<Id, HTMLButtonElement>())
  const tabList = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const list = tabList.current
    const chosen = tabRefs.current.get(tab)
    if (!list || !chosen) return
    const start = chosen.offsetLeft - list.offsetLeft
    const end = start + chosen.offsetWidth
    if (start < list.scrollLeft) list.scrollLeft = start
    else if (end > list.scrollLeft + list.clientWidth) list.scrollLeft = end - list.clientWidth
  }, [tab])

  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    const at = tabs.findIndex((each) => each.id === tab)
    const to =
      event.key === 'ArrowRight'
        ? (at + 1) % tabs.length
        : event.key === 'ArrowLeft'
          ? (at - 1 + tabs.length) % tabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? tabs.length - 1
              : -1
    if (to < 0) return
    event.preventDefault()
    onChoose(tabs[to].id)
    tabRefs.current.get(tabs[to].id)?.focus()
  }

  return (
    <div
      ref={tabList}
      className="tabs"
      role="tablist"
      aria-label={label}
      onKeyDown={onKey}
      data-testid={`${idPrefix}-tabs`}
    >
      {tabs.map((each) => (
        <button
          key={each.id}
          ref={(node) => {
            if (node) tabRefs.current.set(each.id, node)
            else tabRefs.current.delete(each.id)
          }}
          className="tabs__tab"
          type="button"
          role="tab"
          id={`${idPrefix}-tab-${each.id}`}
          aria-selected={tab === each.id}
          aria-controls={`${idPrefix}-panel-${each.id}`}
          tabIndex={tab === each.id ? 0 : -1}
          onClick={() => onChoose(each.id)}
          data-testid={`${idPrefix}-tab-${each.id}`}
        >
          {each.label}
        </button>
      ))}
    </div>
  )
}

/** One tab's panel. Always mounted and only hidden, so a draft and its leave guard survive a tab change. */
export function TabPanel({
  idPrefix,
  id,
  tab,
  children,
}: {
  idPrefix: string
  id: string
  tab: string
  children: ReactNode
}) {
  return (
    <div
      className="tabs__panel"
      role="tabpanel"
      id={`${idPrefix}-panel-${id}`}
      aria-labelledby={`${idPrefix}-tab-${id}`}
      hidden={tab !== id}
      tabIndex={0}
      data-testid={`${idPrefix}-panel-${id}`}
    >
      {children}
    </div>
  )
}
