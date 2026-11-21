import { t } from '../i18n'
import type { Load } from '../lib/useAsyncRead'
import type { ProjectDetail } from './types'
import { useGameProject } from './useGameProject'

/**
 * `useGameProject` read as one state for ReadGate (#284, #286): loading, failed, or ready with the game, where a null
 * game (not a game of this universe, 403 too, G9) is the page's not-found state. `game` and `retry` pass through.
 */
export function useGameProjectLoad(projectId: string | undefined, universeId: string | undefined) {
  const { loading, failed, retry, game } = useGameProject(projectId, universeId)
  const load: Load<ProjectDetail | null> = loading
    ? { kind: 'loading' }
    : failed
      ? { kind: 'error', message: t('projects.one.failed') }
      : { kind: 'ready', value: game }
  return { load, game, retry }
}
