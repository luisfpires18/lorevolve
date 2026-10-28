import { Link } from 'react-router-dom'
import { useDocumentTitle } from '../lib/useDocumentTitle'

/**
 * The one page every public address answers with when it has nothing to show: a private world, a private or trashed
 * entry or story, an author with nothing public, and an address nobody ever held all read the same, and none of them
 * says which it was (ADR 0036, 0037).
 */
export function PortalMissing({ title, testId }: { title: string; testId: string }) {
  useDocumentTitle('Page not available')
  return (
    <div className="pmissing" data-testid={testId}>
      <h1 className="pmissing__title">{title}</h1>
      <p className="pmissing__hint">Its address may be wrong, or it is not public.</p>
      <Link className="portal__pill" to="/explore">
        Explore
      </Link>
    </div>
  )
}

/** A public page that could not be read at all - never mistaken for one that is not there. */
export function PortalError({ onRetry }: { onRetry: () => void }) {
  useDocumentTitle('Page could not be loaded')
  return (
    <div className="pmissing" role="alert" data-testid="public-error">
      <h1 className="pmissing__title">This page could not be loaded.</h1>
      <p className="pmissing__hint">Something went wrong on the way. Try again in a moment.</p>
      <button className="portal__pill" type="button" onClick={onRetry}>
        Try again
      </button>
    </div>
  )
}
