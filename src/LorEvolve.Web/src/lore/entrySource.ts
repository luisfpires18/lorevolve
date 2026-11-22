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
import type { EntityType } from './typeDefinitions'
import type { Chronology } from '../chronology/types'

/** Where the entry screens read and write an entry, and the addresses they link to (#551). Lore is one source. */
export type EntrySource = {
  /** Lore draws everything; a project entry has no Canon status, article, views, notes, publication or Trash (#551). */
  kind: 'lore' | 'project'
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
    kind: 'lore',
    get: (id, signal) => getEntity(universeId, id, signal),
    list: (query, signal) => listEntities(universeId, query, signal),
    create: (input) => createEntity(universeId, input),
    save: (id, input) => updateEntity(universeId, id, input),
    remove: (id) => deleteEntity(universeId, id),
    changedCode: ENTRY_CHANGED,
    href: entryHrefs(
      lore,
      `/app/universes/${universeId}/types`,
      `/app/universes/${universeId}/trash`,
    ),
  }
}

/** An entry list's addresses under `base`; the type id is encoded. */
export function entryHrefs(base: string, types: string, afterRemove: string): EntrySource['href'] {
  const typed = (path: string, typeId?: string | null) =>
    typeId == null ? path : `${path}?type=${encodeURIComponent(typeId)}`
  return {
    list: (typeId) => typed(base, typeId),
    entry: (id) => `${base}/${id}`,
    create: (typeId) => typed(`${base}/new`, typeId),
    types,
    afterRemove,
  }
}

/** The types and chronology a mounted source's entries are of. Null: the universe's. */
export const EntryTypesContext = createContext<{
  entryTypes: EntityType[]
  chronology: Chronology
} | null>(null)

/** Mounted by a screen that draws another source's entries (C2). */
export const EntrySourceContext = createContext<EntrySource | null>(null)

/** The mounted source, else the universe's Lore. One object per universe id, so reads keyed on it run as before. */
export function useEntrySource(): EntrySource {
  const mounted = useContext(EntrySourceContext)
  const { universe } = useOutletContext<WorkspaceContext>()
  const lore = useMemo(() => loreSource(universe.id), [universe.id])
  return mounted ?? lore
}
