import { useCallback } from 'react'
import { useAsyncRead } from '../lib/useAsyncRead'
import { getFamilyTree } from './api'
import { listEntityRelationships, listRelationshipTypes } from '../relationships/api'
import type { RelationshipType } from '../relationships/types'
import type { useFamilyTreeState } from './useFamilyTreeState'
import type { useWorkspaceTypes } from '../pages/useWorkspaceTypes'

// Each read keeps what it showed until its next answer lands; the page's `answeredFor` says which entry that is.
const KEEP = { keep: true } as const

/** The family page's reads: the relationship kinds, the entry's tree, and its relationships that are not family. */
export function useFamilyTreeReads({
  universe,
  entityId,
  setAnsweredFor,
}: ReturnType<typeof useFamilyTreeState> & {
  universe: ReturnType<typeof useWorkspaceTypes>['universe']
  entityId: string | undefined
}) {
  const kindsRead = useAsyncRead(
    useCallback(
      (signal: AbortSignal) => listRelationshipTypes(universe.id, signal).catch(() => []),
      [universe.id],
    ),
    KEEP,
  )

  // The tree and what it answered are set together, so an answer is never shown for the entry before it.
  const tree = useAsyncRead(
    useCallback(
      (signal: AbortSignal) =>
        entityId
          ? getFamilyTree(universe.id, entityId, signal).then(
              (value) => {
                setAnsweredFor(entityId)
                return value
              },
              (error: unknown) => {
                if (!signal.aborted) setAnsweredFor(entityId)
                throw error
              },
            )
          : undefined,
      [universe.id, entityId, setAnsweredFor],
    ),
    // The API answers 404 for an entry that is not here, belongs to another universe, or is in the Trash.
    { keep: true, keepOnFailure: false, missing: true },
  )

  // The focal entry's relationships, for the ones that are not family. Read beside the tree, never into it; not
  // readable is left unsaid, since the tree above is complete without it.
  const othersRead = useAsyncRead(
    useCallback(
      (signal: AbortSignal) =>
        entityId
          ? listEntityRelationships(universe.id, entityId, signal).then(
              (views) => ({ entityId, views }),
              () => ({ entityId, views: [] }),
            )
          : undefined,
      [universe.id, entityId],
    ),
    KEEP,
  )

  const kinds = kindsRead.load.kind === 'ready' ? kindsRead.load.value : null
  /** A kind made here joins the list at once: no reload. */
  const setKinds = kindsRead.setLoad
  const addKind = useCallback(
    (created: RelationshipType) =>
      setKinds((now) => ({
        kind: 'ready',
        value: [...(now.kind === 'ready' ? now.value : []), created],
      })),
    [setKinds],
  )
  const others = othersRead.load.kind === 'ready' ? othersRead.load.value : null

  /** Reads all three again quietly, as a change made on the page asks. */
  function reread() {
    kindsRead.refresh()
    tree.refresh()
    othersRead.refresh()
  }
  /** The tree's Retry: it says loading again; the other two read again quietly. */
  function retry() {
    kindsRead.refresh()
    tree.retry()
    othersRead.refresh()
  }

  return { kinds, addKind, tree: tree.load, others, reread, retry }
}
