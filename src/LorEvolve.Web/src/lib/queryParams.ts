/**
 * The address with these changes: a key set to a value, or deleted when null or empty. It goes back to the first page
 * (drops `page`, then applies a page the changes give), unless `keepPage` says the move keeps the page as it is.
 */
export function changed(
  from: URLSearchParams,
  changes: Record<string, string | null>,
  { keepPage = false }: { keepPage?: boolean } = {},
) {
  const next = new URLSearchParams(from)
  if (!keepPage) next.delete('page')
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === '') next.delete(key)
    else next.set(key, value)
  }
  return next
}

/** The address on page `next` of the list `key` pages: the key is left out for the first page. */
export function pageParam(params: URLSearchParams, key: string, next: number) {
  const updated = new URLSearchParams(params)
  if (next <= 1) updated.delete(key)
  else updated.set(key, String(next))
  return updated
}
