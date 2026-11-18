import { useState } from 'react'
import type { FamilyTree } from './types'
import type { EntityType, EntityTypeGroup } from '../lore/typeDefinitions'
import type { RelationshipType, RelationshipView } from '../relationships/types'

/** The types and groups the page reads to say where the tree is offered: none yet, read, or not readable. */
export type Setup = { types: EntityType[]; groups: EntityTypeGroup[] } | 'failed' | null

/**
 * Every answered state carries the entry it is about, so a tree, a refusal or a failure that belongs to the
 * entry before this one is never shown for this one - it reads as still on its way instead.
 */
export type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; entityId: string; tree: FamilyTree }
  | { kind: 'missing'; entityId: string }
  | { kind: 'error'; entityId: string }

export function useFamilyTreeState() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [kinds, setKinds] = useState<RelationshipType[] | null>(null)
  const [setupReads, setSetupReads] = useState(0)
  const [others, setOthers] = useState<{ entityId: string; views: RelationshipView[] } | null>(null)
  const [addingFor, setAddingFor] = useState<string | null>(null)
  const [isCreatingKind, setIsCreatingKind] = useState(false)
  const [reads, setReads] = useState(0)
  return {
    state,
    setState,
    kinds,
    setKinds,
    setupReads,
    setSetupReads,
    others,
    setOthers,
    addingFor,
    setAddingFor,
    isCreatingKind,
    setIsCreatingKind,
    reads,
    setReads,
  }
}
