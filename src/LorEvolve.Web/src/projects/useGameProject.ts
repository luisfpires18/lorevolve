import { useCallback } from 'react'
import { isNotFoundOrForbidden, useAsyncRead } from '../lib/useAsyncRead'
import { getProject } from './api'
import { ProjectKind, type ProjectDetail } from './types'

/**
 * The game a Game Entities address names (#284, #286): `game` is the project only when it is a Game of this universe,
 * otherwise null, so a foreign project's name never reaches the screen or the tab title. `loading` is true until the
 * read for this id has answered; `failed` is true when the read failed for a reason other than not found, and `retry`
 * reads again. The API still decides who may read it; this only keeps the screen honest.
 */
export function useGameProject(projectId: string | undefined, universeId: string | undefined) {
  const read = useCallback(
    (signal: AbortSignal) => (projectId ? getProject(projectId, signal) : undefined),
    [projectId],
  )
  // `key`: another id shows loading in the same render, never the last game's answer for one frame.
  const { load, retry } = useAsyncRead(read, { missing: isNotFoundOrForbidden, key: projectId })

  const loaded = load.kind === 'ready' ? load.value : null
  const game: ProjectDetail | null =
    loaded !== null && loaded.kind === ProjectKind.Game && loaded.universe.id === universeId
      ? loaded
      : null
  return { loading: load.kind === 'loading', failed: load.kind === 'error', game, retry }
}
