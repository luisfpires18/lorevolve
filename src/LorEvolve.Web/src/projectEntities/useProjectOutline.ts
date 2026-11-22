import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ApiError } from '../lib/api'
import { confirmAction } from '../lib/confirm'
import { listSeasons } from './seasons'
import {
  createNode,
  deleteNode,
  descendantCount,
  getStructure,
  type ProjectNodeSummary,
  type ProjectStructureTree,
} from './structure'
import { nameOf } from './levelWords'
import { t, tn } from '../i18n'
import { errorText } from '../lib/errorText'
import { settleRead } from '../lib/settleRead'
import { useLoadedList } from '../lib/useLoadedList'

/** The outline's tree and its state, the read, the linked node, and the changes the buttons make. */
export function useProjectOutline({ projectId }: { projectId: string }) {
  const [hasLegacy, setHasLegacy] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  // A link from a story arc or event (#296), or a Volume on this same page (#297), names the node to open; ignored
  // when unknown.
  const [params, setParams] = useSearchParams()
  const linked = params.get('node')

  // A project with no outline yet answers 404: that is 'none', not a failure.
  const read = useCallback(
    (signal?: AbortSignal) =>
      getStructure(projectId, signal).catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 404) return 'none' as const
        throw error
      }),
    [projectId],
  )
  const {
    data: tree,
    failed,
    setFailed,
    busy,
    setBusy,
    refresh,
    failing,
    run,
  } = useLoadedList<ProjectStructureTree | 'none'>(read, t('projects.structure.failed'))

  // The seasons read before the outline existed, asked for once the outline itself is read.
  const hasTree = tree !== null && tree !== 'none'
  useEffect(() => {
    if (!hasTree) return
    const controller = new AbortController()
    settleRead(
      listSeasons(projectId, controller.signal),
      controller.signal,
      (seasons) => setHasLegacy(seasons.length > 0),
      (error) => setFailed(errorText(error, t('projects.structure.failed'))),
    )
    return () => controller.abort()
  }, [projectId, hasTree, setFailed])

  // Opens the linked node once the tree is read, and again only when the link itself changes.
  const opened = useRef<string | null>(null)
  useEffect(() => {
    if (!linked) {
      opened.current = null
      return
    }
    if (linked === opened.current || !tree || tree === 'none') return
    if (tree.nodes.some((node) => node.id === linked)) {
      opened.current = linked
      setEditing(linked)
    }
  }, [linked, tree])

  // Closing drops the link too, so the same link opens the node again next time.
  const closeEditor = () => {
    setEditing(null)
    if (linked) {
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          next.delete('node')
          return next
        },
        { replace: true },
      )
    }
  }

  function add(level: string, parentId: string | null) {
    setBusy(true)
    createNode(projectId, { level, parentId })
      .then((created) => refresh().then(() => setEditing(created.id)))
      .catch(failing)
  }

  async function remove(current: ProjectStructureTree, node: ProjectNodeSummary) {
    const inside = descendantCount(current, node.id)
    if (
      !(await confirmAction({
        title: t('projects.structure.deleteTitle', { name: nameOf(node) }),
        message:
          inside === 0
            ? t('projects.structure.deleteEmpty')
            : tn('projects.structure.deleteMessage', inside),
        confirmLabel: t('projects.structure.delete'),
        variant: 'destructive',
      }))
    ) {
      return
    }
    run(() => deleteNode(projectId, node.id))
  }
  return {
    tree,
    hasLegacy,
    failed,
    busy,
    editing,
    setEditing,
    closeEditor,
    refresh,
    failing,
    run,
    add,
    remove,
  }
}
