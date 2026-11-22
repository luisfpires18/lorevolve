import { entryHrefs, type EntrySource } from '../lore/entrySource'
import type { EntityDetail, EntityInput } from '../lore/types'
import {
  createProjectEntity,
  deleteProjectEntity,
  getProjectEntity,
  PROJECT_ENTRY_CHANGED,
  saveProjectEntity,
} from './api'
import { asEntryDetail } from './fieldDefinition'
import type { ProjectEntityInput } from './types'

/** A project's entries, drawn by the Lore entry page (#551). Its list is at `base`; Delete lands there. */
export function projectSource(projectId: string, base: string, types: string): EntrySource {
  return {
    kind: 'project',
    get: (id, signal) => getProjectEntity(projectId, id, signal).then(asEntryDetail),
    // shortcut: nothing lists through a project source until C3 moves the project list (#551).
    list: () => Promise.reject(new Error('A project lists through ProjectEntries until #551 C3')),
    create: (input) =>
      createProjectEntity(projectId, projectInput(input, null)).then(asEntryDetail),
    save: (id, input, detail) =>
      saveProjectEntity(projectId, id, projectInput(input, detail)).then(asEntryDetail),
    remove: (id) => deleteProjectEntity(projectId, id),
    changedCode: PROJECT_ENTRY_CHANGED,
    href: entryHrefs(base, types, base),
  }
}

// Canon status, aliases and tags are dropped. The opened entry's Lore link goes back: an omitted one is cleared
// (ProjectEntityEndpoints.cs:299).
function projectInput(input: EntityInput, detail: EntityDetail | null): ProjectEntityInput {
  return {
    entityTypeId: input.entityTypeId,
    name: input.name,
    summary: input.summary,
    canonEntityId: detail?.canonEntityId ?? null,
    fields: input.fields,
    expectedVersion: input.expectedVersion ?? null,
  }
}
