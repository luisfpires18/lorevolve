import { useEffect, useState } from 'react'
import { getProject } from './api'
import { ProjectKind, type ProjectDetail } from './types'

type LoadState = { for: string; project: ProjectDetail | null }

/**
 * The game a Game Entities address names (#284, #286): `game` is the project only when it is a Game of this universe,
 * otherwise null, so a foreign project's name never reaches the screen or the tab title. `loading` is true until the
 * read for this id has answered. The API still decides who may read it; this only keeps the screen honest.
 */
export function useGameProject(projectId: string | undefined, universeId: string | undefined) {
  const [state, setState] = useState<LoadState | null>(null)

  useEffect(() => {
    if (!projectId) return
    const controller = new AbortController()
    getProject(projectId, controller.signal)
      .then((project) => setState({ for: projectId, project }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ for: projectId, project: null })
      })
    return () => controller.abort()
  }, [projectId])

  const read = state !== null && state.for === projectId ? state : null
  const loaded = read?.project ?? null
  const game: ProjectDetail | null =
    loaded !== null && loaded.kind === ProjectKind.Game && loaded.universe.id === universeId
      ? loaded
      : null
  return { loading: read === null, game }
}
