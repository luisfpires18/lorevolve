import { t } from '../i18n'
import { ApiError } from '../lib/api'
import { reorderProjects } from './api'
import type { ProjectDetail, ProjectKindValue } from './types'
import type { WorkspaceContext } from '../pages/UniverseWorkspace'
import type { useShelfState } from './useShelfState'

/** Puts the keyboard back on a moved card's menu, once the list has drawn it in its new place. */
export function focusCardMenu(rowAttribute: string, id: string, testPrefix: 'shelf' | 'story') {
  requestAnimationFrame(() =>
    document
      .querySelector<HTMLElement>(`[${rowAttribute}="${id}"] [data-testid="${testPrefix}-actions"]`)
      ?.focus(),
  )
}

/** The list with one card's cover replaced: what a `CoverDrawer` writes back when a picture is saved. */
export function withCover<T extends { id: string; cover?: unknown }>(
  list: readonly T[],
  id: string,
  cover: T['cover'],
): T[] {
  return list.map((one) => (one.id === id ? { ...one, cover } : one))
}

export function shelfActions({
  universe,
  kinds,
  state,
  isMoving,
  setState,
  setAnnouncement,
  setMoveError,
}: ReturnType<typeof useShelfState> & {
  universe: WorkspaceContext['universe']
  kinds: readonly ProjectKindValue[]
}) {
  /** The card of the same kind next to this one, the way it would move, or -1 at the end of its kind. */
  function neighbour(list: ProjectDetail[], from: number, by: -1 | 1) {
    for (let at = from + by; at >= 0 && at < list.length; at += by) {
      if (list[at].kind === list[from].kind) return at
    }
    return -1
  }

  /** Moves one project past its neighbour of the same kind, on screen first; a refusal puts it back. */
  async function move(project: ProjectDetail, by: -1 | 1) {
    if (state.kind !== 'ready' || isMoving.current) return
    const before = state.value
    const from = before.findIndex((candidate) => candidate.id === project.id)
    const to = from < 0 ? -1 : neighbour(before, from, by)
    if (to < 0) return

    const after = [...before]
    after[from] = before[to]
    after[to] = before[from]
    const ofKind = after.filter((candidate) => candidate.kind === project.kind)
    isMoving.current = true
    setMoveError(null)
    setState({ kind: 'ready', value: after })
    focusCardMenu('data-project-id', project.id, 'shelf')
    try {
      const saved = await reorderProjects(
        universe.id,
        project.kind,
        ofKind.map((candidate) => candidate.id),
      )
      setState({
        kind: 'ready',
        value: saved.filter((candidate) => kinds.includes(candidate.kind)),
      })
      setAnnouncement(
        t('projects.shelf.moved', {
          name: project.name,
          n: ofKind.findIndex((candidate) => candidate.id === project.id) + 1,
          total: ofKind.length,
        }),
      )
    } catch (error: unknown) {
      setState({ kind: 'ready', value: before })
      setMoveError(error instanceof ApiError ? error.message : t('projects.shelf.moveFailed'))
    } finally {
      isMoving.current = false
    }
  }

  return { neighbour, move }
}
