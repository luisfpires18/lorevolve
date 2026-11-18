import { useRef, useState } from 'react'
import type { Chronology } from '../chronology/types'
import type { EntityType, EntityTypeGroup } from '../lore/typeDefinitions'
import type { ProjectFamily } from './sections'
import type { UniverseDetail } from './types'

export type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; universe: UniverseDetail; chronology: Chronology }
  | { kind: 'missing' }
  | { kind: 'error'; message: string }

/** The shell's read state, the types and groups, the project families, and the three reads' handles. */
export function useWorkspaceState() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [types, setTypes] = useState<EntityType[] | 'failed' | null>(null)
  const [typeGroups, setTypeGroups] = useState<EntityTypeGroup[] | 'failed' | null>(null)
  // The families of project this universe has, which decide the sidebar's Creation and Game Entities (#272). Empty until read.
  const [families, setFamilies] = useState<ReadonlySet<ProjectFamily>>(new Set())
  const projectsRead = useRef<AbortController | null>(null)
  const typesRead = useRef<AbortController | null>(null)
  const typesClaimed = useRef(false)

  return {
    state,
    setState,
    types,
    setTypes,
    typeGroups,
    setTypeGroups,
    families,
    setFamilies,
    projectsRead,
    typesRead,
    typesClaimed,
  }
}
