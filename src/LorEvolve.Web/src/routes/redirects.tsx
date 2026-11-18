import { Navigate, useLocation } from 'react-router-dom'

/**
 * Explore's address until ADR 0069. Kept, and sent to the front door with its search intact, so an old link or
 * bookmark still lands on the worlds; the server answers the same address with a 301 for crawlers and previews.
 */
export function ExploreRedirect() {
  const { search } = useLocation()
  return <Navigate to={{ pathname: '/', search }} replace />
}
/** The old stories list (LOREX-049, #277): Writing is the list now. The query and hash ride along. */
export function StoriesToWriting() {
  const { search, hash } = useLocation()
  return <Navigate to={{ pathname: '../writing', search, hash }} relative="path" replace />
}
