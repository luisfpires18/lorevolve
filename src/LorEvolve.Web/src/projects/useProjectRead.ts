import { useEffect, useState } from 'react'
import { getProject, listProjects } from './api'
import { getStory } from '../stories/api'
import type { ProjectDetail } from './types'

/** The project that was read, and the id it was read for; see `ProjectsPage` for why the key is kept. */
type LoadState =
  | { kind: 'ready'; for: string; project: ProjectDetail }
  /** A Story shown as a Writing Project (#140): read as the story, because no project row exists for it. */
  | { kind: 'story'; for: string; title: string }
  /** A story reached at the account-level address, which carries no universe: where it belongs (#199). */
  | { kind: 'elsewhere'; for: string; universeId: string }
  | { kind: 'missing'; for: string }
  | { kind: 'failed'; for: string }

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
  const [state, setState] = useState<LoadState | null>(null)
  const [schemaVersion, setSchemaVersion] = useState(0)
  const read = state !== null && state.for === projectId ? state : null

  useEffect(() => {
    if (!projectId) return
    const controller = new AbortController()
    getProject(projectId, controller.signal)
      .then((project) => setState({ kind: 'ready', for: projectId, project }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        const status = (error as { status?: number }).status
        if (status !== 404) {
          setState({ kind: 'failed', for: projectId })
          return
        }
        // `/api/projects/{id}` does not resolve a story id, by design (#140), so a project that is not stored may be a
        // story of this universe. Only read here, never copied: the story's page reads the story itself.
        if (!inUniverse || !universeId) {
          // The account-level address names no universe, so the story's is read from the projects list, which carries
          // story-backed rows with their universe and keeps the one named by `include` (#198).
          listProjects({ limit: 1, include: projectId }, controller.signal)
            .then((rows) => {
              const row = rows.find((candidate) => candidate.id === projectId)
              setState(
                row
                  ? { kind: 'elsewhere', for: projectId, universeId: row.universe.id }
                  : { kind: 'missing', for: projectId },
              )
            })
            .catch(() => {
              if (!controller.signal.aborted) setState({ kind: 'failed', for: projectId })
            })
          return
        }
        getStory(universeId, projectId, controller.signal)
          .then((story) => setState({ kind: 'story', for: projectId, title: story.title }))
          .catch((storyError: unknown) => {
            if (controller.signal.aborted) return
            const storyStatus = (storyError as { status?: number }).status
            setState(
              storyStatus === 404
                ? { kind: 'missing', for: projectId }
                : { kind: 'failed', for: projectId },
            )
          })
      })
    return () => controller.abort()
  }, [projectId, inUniverse, universeId])
  return { schemaVersion, setSchemaVersion, read }
}
