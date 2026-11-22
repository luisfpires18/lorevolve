import { ENTITY_PAGE_SIZE } from '../lore/api'
import { entryHrefs, type EntrySource } from '../lore/entrySource'
import type { EntityDetail, EntityInput } from '../lore/types'
import {
  createProjectEntity,
  deleteProjectEntity,
  getProjectEntity,
  listProjectEntities,
  PROJECT_ENTRY_CHANGED,
  saveProjectEntity,
} from './api'
import { asEntryDetail, asEntrySummary, pageOf } from './fieldDefinition'
import type { ProjectEntityInput } from './types'

/** The most rows one list read asks for: `ProjectEntityEndpoints.ListMaxTake`. */
const PROJECT_LIST_TAKE = 500
/** The longest name search the list endpoint takes. */
const PROJECT_SEARCH_MAX = 200

/** A project's entries, drawn by the Lore list and entry page (#551). Its list is at `base`; Delete lands there. */
export function projectSource(projectId: string, base: string, types: string): EntrySource {
  return {
    kind: 'project',
    get: (id, signal) => getProjectEntity(projectId, id, signal).then(asEntryDetail),
    // shortcut: one read of up to 500 rows, cut into pages here (#551 pick 1); past 500 only search reaches the rest.
    // Upgrade to the API's skip/take and a count when a project nears it.
    list: (query, signal) =>
      listProjectEntities(projectId, query.entityTypeId ?? undefined, signal, {
        skip: 0,
        take: PROJECT_LIST_TAKE,
        q: query.search.trim().slice(0, PROJECT_SEARCH_MAX) || undefined,
        sort: query.sort ?? 'updated',
        includeDescendants: query.includeDescendants,
      }).then((rows) =>
        pageOf(rows.map(asEntrySummary), query.page, query.pageSize ?? ENTITY_PAGE_SIZE),
      ),
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
