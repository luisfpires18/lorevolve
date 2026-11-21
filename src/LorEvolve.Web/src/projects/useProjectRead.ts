import { useCallback, useState } from 'react'
import { useAsyncRead } from '../lib/useAsyncRead'
import { getProject, listProjects } from './api'
import { getStory } from '../stories/api'
import type { ProjectDetail } from './types'

/** What the address names. A read that failed throws instead. */
type Found =
  | { kind: 'ready'; project: ProjectDetail }
  /** A Story shown as a Writing Project (#140): read as the story, because no project row exists for it. */
  | { kind: 'story'; title: string }
  /** A story reached at the account-level address, which carries no universe: where it belongs (#199). */
  | { kind: 'elsewhere'; universeId: string }
  | { kind: 'missing' }

/** The project that was read, and the id it was read for. */
type LoadState = (Found | { kind: 'failed' }) & { for: string }

const status = (error: unknown) => (error as { status?: number }).status

async function findProject(
  projectId: string,
  inUniverse: boolean,
  universeId: string | undefined,
  signal: AbortSignal,
): Promise<Found> {
  try {
    return { kind: 'ready', project: await getProject(projectId, signal) }
  } catch (error: unknown) {
    if (status(error) !== 404) throw error
  }
  // `/api/projects/{id}` does not resolve a story id, by design (#140), so a project that is not stored may be a
  // story of this universe. Only read here, never copied: the story's page reads the story itself.
  if (!inUniverse || !universeId) {
    // The account-level address names no universe, so the story's is read from the projects list, which carries
    // story-backed rows with their universe and keeps the one named by `include` (#198).
    const rows = await listProjects({ limit: 1, include: projectId }, signal)
    const row = rows.find((candidate) => candidate.id === projectId)
    return row ? { kind: 'elsewhere', universeId: row.universe.id } : { kind: 'missing' }
  }
  try {
    return { kind: 'story', title: (await getStory(universeId, projectId, signal)).title }
  } catch (storyError: unknown) {
    if (status(storyError) === 404) return { kind: 'missing' }
    throw storyError
  }
}

/** Reads the project the address names, or the story that stands in for it, and keeps the Types version it was read at. */
export function useProjectRead({
  projectId,
  inUniverse,
  universeId,
}: {
  projectId: string | undefined
  inUniverse: boolean
  universeId: string | undefined
}) {
  const [schemaVersion, setSchemaVersion] = useState(0)
  const readProject = useCallback(
    (signal: AbortSignal) =>
      projectId ? findProject(projectId, inUniverse, universeId, signal) : undefined,
    [projectId, inUniverse, universeId],
  )
  // `key`: another id shows loading in the same render; a stale answer must not draw, or Navigate, for one frame.
  const { load, retry } = useAsyncRead(readProject, { key: projectId })

  const read: LoadState | null =
    !projectId || load.kind === 'loading' || load.kind === 'missing'
      ? null
      : load.kind === 'error'
        ? { kind: 'failed', for: projectId }
        : { ...load.value, for: projectId }
  return { schemaVersion, setSchemaVersion, read, retry }
}
