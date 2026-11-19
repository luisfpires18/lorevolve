import { t } from '../../i18n'
import type { LoadState } from '../../universes/useWorkspaceState'
import { LoadError } from '../LoadError'

/** The universe could not be read: what went wrong, and Try again for the universe and its types. */
export function WorkspaceLoadError({
  state,
  refresh,
  refreshTypes,
}: {
  state: Extract<LoadState, { kind: 'error' }>
  refresh: () => void
  refreshTypes: () => Promise<void>
}) {
  return (
    <LoadError
      message={state.message}
      onRetry={() => {
        refresh()
        refreshTypes().catch(() => undefined)
      }}
      retryLabel={t('workspace.missing.tryAgain')}
    />
  )
}
