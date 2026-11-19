import { useEffect, useState } from 'react'
import { ApiError } from '../lib/api'
import { getProject } from './api'
import { ProjectKind, type ProjectDetail } from './types'

type LoadState = { for: string; project: ProjectDetail | null; failed?: true }

/**
 * The game a Game Entities address names (#284, #286): `game` is the project only when it is a Game of this universe,
 * otherwise null, so a foreign project's name never reaches the screen or the tab title. `loading` is true until the
 * read for this id has answered; `failed` is true when the read failed for a reason other than not found, and `retry`
 * reads again. The API still decides who may read it; this only keeps the screen honest.
 */
export function useGameProject(projectId: string | undefined, universeId: string | undefined) {
  const [state, setState] = useState<LoadState | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!projectId) return
    const controller = new AbortController()
    getProject(projectId, controller.signal)
      .then((project) => setState({ for: projectId, project }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        const missing = error instanceof ApiError && (error.status === 404 || error.status === 403)
        setState(
          missing
            ? { for: projectId, project: null }
            : { for: projectId, project: null, failed: true },
        )
      })
    return () => controller.abort()
  }, [projectId, attempt])

  const read = state !== null && state.for === projectId ? state : null
  const loaded = read?.project ?? null
  const game: ProjectDetail | null =
    loaded !== null && loaded.kind === ProjectKind.Game && loaded.universe.id === universeId
      ? loaded
      : null
  const retry = () => {
    setState(null)
    setAttempt((current) => current + 1)
  }
  return { loading: read === null, failed: read?.failed === true, game, retry }
}
