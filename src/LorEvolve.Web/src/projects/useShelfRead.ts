import { useEffect } from 'react'
import { t } from '../i18n'
import { errorText } from '../lib/errorText'
import { listAllProjects } from './api'
import type { ProjectKindValue } from './types'
import type { WorkspaceContext } from '../pages/UniverseWorkspace'
import type { useShelfState } from './useShelfState'

export function useShelfRead({
  universe,
  kinds,
  setState,
  attempt,
}: ReturnType<typeof useShelfState> & {
  universe: WorkspaceContext['universe']
  kinds: readonly ProjectKindValue[]
}) {
  useEffect(() => {
    const controller = new AbortController()
    listAllProjects({ universeId: universe.id }, controller.signal)
      .then((projects) =>
        setState({
          kind: 'ready',
          value: projects.filter((project) => kinds.includes(project.kind)),
        }),
      )
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState({ kind: 'error', message: errorText(error, t('projects.list.failed')) })
      })
    return () => controller.abort()
  }, [universe.id, kinds, attempt])
}
