import { apiFetch, prime } from './api'
import { getUniverse } from '../universes/api'
import { getChronology } from '../chronology/api'
import {
  getEntity,
  listEntities,
  listEntityTypeGroups,
  listEntityTypes,
  readLorePageSize,
} from '../lore/api'
import { getEntityArticle } from '../lore/article'

/**
 * Every read the address is known to need, started as the app boots, beside the session check and the screen's code.
 *
 * Without this a workspace page is a chain: the session, then the universe (with its chronology, types and groups), then
 * the page's own list or entry, then its pictures - each hop a round trip, and on the hosted app a round trip is 70 to
 * 200 ms. With it the session, the universe and the page's first read go out together, and the screens that mount later
 * take the answers already in flight (`prime` in lib/api.ts). A read nobody takes within ten seconds is dropped, so a
 * stale answer is never served, and a 401 here is left to the session probe to interpret.
 */
export function warmStart(pathname: string, search: string) {
  if (!pathname.startsWith('/app')) return
  prime(() => apiFetch('/api/auth/me'))
  // The account's own picture, which the workspace chrome asks for on every page.
  prime(() => apiFetch('/api/profile/image'))

  const match = /^\/app\/universes\/([^/]+)(?:\/([^/]+))?(?:\/([^/]+))?/.exec(pathname)
  if (!match) return
  const [, universeId, section, next] = match
  prime(() => getUniverse(universeId))
  prime(() => getChronology(universeId))
  const types = prime(() => listEntityTypes(universeId))
  prime(() => listEntityTypeGroups(universeId))

  if (section !== 'lore') return
  if (next) {
    if (next !== 'new' && next !== 'mass-create') {
      prime(() => getEntity(universeId, next))
      prime(() => getEntityArticle(universeId, next))
    }
    return
  }
  // The plain list of one type, which is where a Lore card leads: the first page exactly as LorePage asks for it. Any
  // other filter in the address is LorePage's own to read.
  const params = new URLSearchParams(search)
  const type = params.get('type')
  if (!type || [...params.keys()].some((key) => key !== 'type')) return
  // Only a type this universe has: LorePage reads nothing for an address naming any other, and neither does this.
  // The types are already on their way, and this runs before the workspace sees them.
  void types.then(
    (list) => {
      if (!list.some((candidate) => candidate.id === type)) return
      prime(() =>
        listEntities(universeId, {
          search: '',
          entityTypeId: type,
          entityTypeGroupId: null,
          includeDescendants: true,
          canonStatus: null,
          tag: null,
          page: 1,
          pageSize: readLorePageSize(),
          fieldFilters: [],
          exact: false,
          sort: null,
        }),
      )
    },
    () => undefined,
  )
}
