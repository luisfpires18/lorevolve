import { useState } from 'react'
import { useDebouncedValue } from './useDebouncedValue'

/**
 * A list searched on this screen: what is typed, the search once typing settles, and the page. A search that has
 * settled goes back to the first page in the same render, so one request goes out.
 */
export function useSearchedPage() {
  const [search, setSearch] = useState('')
  const searched = useDebouncedValue(search)
  const [pageFor, setPageFor] = useState(searched)
  const [page, setPage] = useState(1)
  if (pageFor !== searched) {
    setPageFor(searched)
    setPage(1)
  }
  return { search, setSearch, searched, page, setPage }
}
