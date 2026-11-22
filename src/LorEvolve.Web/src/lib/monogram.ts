/** The first character a name actually carries, upper-cased, so an emoji or a non-Latin name survives. */
export function monogram(name: string, fallback = '?') {
  return [...name.trim()][0]?.toLocaleUpperCase() ?? fallback
}
