import { createContext, useContext, useMemo } from 'react'
import { useOutletContext } from 'react-router-dom'
import type { WorkspaceContext } from '../pages/UniverseWorkspace'
import {
  createEntity,
  deleteEntity,
  ENTRY_CHANGED,
  getEntity,
  listEntities,
  updateEntity,
} from './api'
import type { EntityDetail, EntityInput, EntityPage, EntityQuery } from './types'

/** Where the entry screens read and write an entry, and the addresses they link to (#551). Lore is one source. */
export type EntrySource = {
  get(id: string, signal?: AbortSignal): Promise<EntityDetail>
  list(query: EntityQuery, signal?: AbortSignal): Promise<EntityPage>
  create(input: EntityInput): Promise<EntityDetail>
  /** `detail` is the entry as opened: a source whose input holds more than the form edits reads the rest from it. */
  save(id: string, input: EntityInput, detail: EntityDetail | null): Promise<EntityDetail>
  remove(id: string): Promise<void>
  /** The 409 code of a save over a newer version. */
  changedCode: string
  href: {
    list(typeId?: string | null): string
    entry(id: string): string
    create(typeId?: string | null): string
    types: string
    afterRemove: string
  }
}

export function loreSource(universeId: string): EntrySource {
  const lore = `/app/universes/${universeId}/lore`
  return {
    get: (id, signal) => getEntity(universeId, id, signal),
    list: (query, signal) => listEntities(universeId, query, signal),
    create: (input) => createEntity(universeId, input),
    save: (id, input) => updateEntity(universeId, id, input),
    remove: (id) => deleteEntity(universeId, id),
    changedCode: ENTRY_CHANGED,
    href: {
      list: (typeId) => (typeId == null ? lore : `${lore}?type=${typeId}`),
      entry: (id) => `${lore}/${id}`,
      create: (typeId) => (typeId == null ? `${lore}/new` : `${lore}/new?type=${typeId}`),
      types: `/app/universes/${universeId}/types`,
      afterRemove: `/app/universes/${universeId}/trash`,
    },
  }
}

/** Mounted by a screen that draws another source's entries (C2). */
export const EntrySourceContext = createContext<EntrySource | null>(null)

/** The mounted source, else the universe's Lore. One object per universe id, so reads keyed on it run as before. */
export function useEntrySource(): EntrySource {
  const mounted = useContext(EntrySourceContext)
  const { universe } = useOutletContext<WorkspaceContext>()
  const lore = useMemo(() => loreSource(universe.id), [universe.id])
  return mounted ?? lore
}
