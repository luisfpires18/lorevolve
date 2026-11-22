import { useRouteError } from 'react-router-dom'
import { useI18n } from '../i18n'
import { LoadError } from '../components/LoadError'

/** A screen's code that no longer exists on the server: the tab predates a deploy and asked for an old chunk. */
function isStaleChunk(error: unknown) {
  return (
    error instanceof Error &&
    /dynamically imported module|Importing a module script failed|error loading dynamically imported/i.test(
      error.message,
    )
  )
}

/**
 * What replaces the app when a screen throws while rendering, instead of the router's developer error page. The usual
 * cause after a deploy is a stale chunk, and a reload is the whole fix; anything else is a bug, and a reload is still
 * the only thing the author can do about it. Unsaved writing is kept by the local drafts (ADR 0028).
 */
export function AppCrashed() {
  const error = useRouteError()
  const { t } = useI18n()
  const stale = isStaleChunk(error)
  return (
    <main className="session-pending session-pending--unreachable">
      <LoadError
        message={stale ? t('shell.app.crashed.stale') : t('shell.app.crashed.generic')}
        onRetry={() => window.location.reload()}
        retryLabel={t('shell.app.crashed.reload')}
      />
    </main>
  )
}
