import { useSearchParams } from 'react-router-dom'

export interface QueryTab<Id extends string> {
  id: Id
  label: string
}

/**
 * A page's tabs, kept in the address as `?tab=` so a reload or a link lands on the same one. The first tab is the page
 * itself and leaves the parameter out; an unknown value reads as the first tab without rewriting the address.
 *
 * `history` says what choosing a tab does to the browser's history. `replace`, the default, is Settings' behaviour:
 * Back leaves the page. `push` makes each chosen tab a step of its own, so Back and Forward walk the tabs (Types).
 * Choosing the tab already open writes nothing either way.
 */
export function useQueryTab<Id extends string>(
  tabs: readonly QueryTab<Id>[],
  { history = 'replace' }: { history?: 'push' | 'replace' } = {},
) {
  const [params, setParams] = useSearchParams()
  const asked = params.get('tab')
  const tab = tabs.find((each) => each.id === asked)?.id ?? tabs[0].id

  function choose(next: Id) {
    if (next === tab) return
    setParams(
      (current) => {
        const copy = new URLSearchParams(current)
        if (next === tabs[0].id) copy.delete('tab')
        else copy.set('tab', next)
        return copy
      },
      { replace: history === 'replace' },
    )
  }

  return [tab, choose] as const
}
