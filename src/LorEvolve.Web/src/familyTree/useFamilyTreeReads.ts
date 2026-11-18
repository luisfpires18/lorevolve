import { useEffect } from 'react'
import { getFamilyTree } from './api'
import { listEntityRelationships, listRelationshipTypes } from '../relationships/api'
import type { useFamilyTreeState } from './useFamilyTreeState'
import type { useWorkspaceTypes } from '../pages/useWorkspaceTypes'

export function useFamilyTreeReads({
  universe,
  entityId,
  reads,
  setKinds,
  setState,
  setOthers,
}: ReturnType<typeof useFamilyTreeState> & {
  universe: ReturnType<typeof useWorkspaceTypes>['universe']
  entityId: string | undefined
}) {
  useEffect(() => {
    const controller = new AbortController()

    listRelationshipTypes(universe.id, controller.signal)
      .then(setKinds)
      .catch(() => {
        if (!controller.signal.aborted) setKinds([])
      })

    return () => {
      controller.abort()
    }
  }, [universe.id, reads])

  useEffect(() => {
    if (!entityId) return

    const controller = new AbortController()

    getFamilyTree(universe.id, entityId, controller.signal)
      .then((tree) => setState({ kind: 'ready', entityId, tree }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        // The API answers 404 for an entry that is not here, belongs to another universe, or is in the Trash.
        setState(
          (error as { status?: number }).status === 404
            ? { kind: 'missing', entityId }
            : { kind: 'error', entityId },
        )
      })

    return () => {
      controller.abort()
    }
  }, [universe.id, entityId, reads])

  // The focal entry's relationships, for the ones that are not family. Read beside the tree, never into it.
  useEffect(() => {
    if (!entityId) return

    const controller = new AbortController()

    listEntityRelationships(universe.id, entityId, controller.signal)
      .then((views) => setOthers({ entityId, views }))
      .catch(() => {
        // Not readable is left unsaid: the tree above is complete without it.
        if (!controller.signal.aborted) setOthers({ entityId, views: [] })
      })

    return () => {
      controller.abort()
    }
  }, [universe.id, entityId, reads])
}
