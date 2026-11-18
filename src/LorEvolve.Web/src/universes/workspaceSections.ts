import { ALL_SECTIONS, FRONT, owns } from './sections'

const SECTIONS = ALL_SECTIONS

/** The part of the URL below this universe, without its surrounding slashes. */
function pathWithin(pathname: string, id: string | undefined) {
  const base = `/app/universes/${id ?? ''}`
  const rest = pathname.startsWith(base) ? pathname.slice(base.length) : ''
  return rest.replace(/^\/+|\/+$/g, '')
}

/**
 * Which section the current URL is in. `lore/:entityId` is still Lore. The section itself, not its name: the name is
 * read from the dictionary where it is shown, and nothing branches on words that change with the language.
 */
export function currentSection(pathname: string, id: string | undefined) {
  const segment = pathWithin(pathname, id).split('/')[0] ?? ''
  return SECTIONS.find((section) => owns(section, segment)) ?? FRONT[0]
}
