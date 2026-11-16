import { useEffect } from 'react'

const BRAND = 'LorEvolve'

/**
 * The tab's title while a screen is shown: its parts, most specific first, then the brand, all joined by a bar -
 * "Lore | Hollowmere | LorEvolve". With no parts, the brand alone. Put back when the screen goes.
 *
 * One hook for the whole of LorEvolve, and one owner per screen. On the portal that is the page itself, in the same words
 * the server writes into the page's head (ADR 0038), so a page reached by a link inside the app reads as one reached
 * from outside. In the workspace it is the shell: the account-level layout names Universes, Ideas or Profile, and a
 * universe's shell names the section and the universe. Nothing beneath a shell sets one, so two never race.
 */
export function useDocumentTitle(...parts: string[]) {
  useWholeTitle(documentTitle(...parts))
}

/** The title useDocumentTitle would set, for a screen that owns its title only some of the time. */
export function documentTitle(...parts: string[]) {
  const named = parts.filter(Boolean)
  return named.length > 0 ? `${named.join(' | ')} | ${BRAND}` : BRAND
}

/** The tab's whole title as given; null leaves it to the shell above. */
export function useWholeTitle(full: string | null) {
  useEffect(() => {
    if (full === null) return
    const previous = document.title
    document.title = full
    return () => {
      document.title = previous
    }
  }, [full])
}
