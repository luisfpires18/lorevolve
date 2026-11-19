import { useEffect } from 'react'
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
          projects: projects.filter((project) => kinds.includes(project.kind)),
        }),
      )
      .catch(() => {
        if (!controller.signal.aborted) setState({ kind: 'failed' })
      })
    return () => controller.abort()
  }, [universe.id, kinds, attempt])
}
