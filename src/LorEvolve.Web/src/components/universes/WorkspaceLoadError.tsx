import { t } from '../../i18n'
import type { LoadState } from '../../universes/useWorkspaceState'

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
    <div className="notice notice--error" role="alert">
      <p>{state.message}</p>
      <button
        className="button button--secondary"
        type="button"
        onClick={() => {
          refresh()
          refreshTypes().catch(() => undefined)
        }}
      >
        {t('workspace.missing.tryAgain')}
      </button>
    </div>
  )
}
