import { ENTITY_PAGE_SIZE } from '../lore/api'
import { encodeFieldFilter } from '../lore/fieldFilters'
import { entryHrefs, type EntrySource } from '../lore/entrySource'
import type { EntityDetail, EntityInput } from '../lore/types'
import {
  bulkTrashProjectEntities,
  createProjectEntity,
  deleteProjectEntity,
  getProjectEntity,
  importLoreEntity,
  listProjectEntities,
  PROJECT_ENTRY_CHANGED,
  saveProjectEntity,
} from './api'
import { asEntryDetail, asEntryPage } from './fieldDefinition'
import type { ProjectEntityInput } from './types'

/** The longest name search the list endpoint takes. */
const PROJECT_SEARCH_MAX = 200
/** The largest `skip` the API binds (`int`), as the Lore server caps its own offset: a huge page lands on the last. */
const PROJECT_SKIP_MAX = 2147483647

/** A project's entries, drawn by the Lore list and entry page (#551). Its list is at `base`; they go to `trash`. */
export function projectSource(
  projectId: string,
  base: string,
  types: string,
  trash: string,
): EntrySource {
  return {
    kind: 'project',
    get: (id, signal) => getProjectEntity(projectId, id, signal).then(asEntryDetail),
    // One page per read, with the server's total (#557).
    list: (query, signal) => {
      const size = query.pageSize ?? ENTITY_PAGE_SIZE
      return listProjectEntities(projectId, query.entityTypeId ?? undefined, signal, {
        skip: Math.min((query.page - 1) * size, PROJECT_SKIP_MAX),
        take: size,
        q: query.search.trim().slice(0, PROJECT_SEARCH_MAX) || undefined,
        sort: query.sort ?? 'updated',
        includeDescendants: query.includeDescendants,
        exact: query.exact,
        // Field filters belong to one type, as in Lore.
        fields: query.entityTypeId ? (query.fieldFilters ?? []).map(encodeFieldFilter) : [],
      }).then((found) => asEntryPage(found, query.page, size))
    },
    create: (input) =>
      createProjectEntity(projectId, projectInput(input, null)).then(asEntryDetail),
    save: (id, input, detail) =>
      saveProjectEntity(projectId, id, projectInput(input, detail)).then(asEntryDetail),
    remove: (id) => deleteProjectEntity(projectId, id),
    removeMany: (ids) => bulkTrashProjectEntities(projectId, ids).then(() => undefined),
    importLore: (id, loreEntityId, expectedVersion) =>
      importLoreEntity(projectId, id, loreEntityId, expectedVersion).then((done) => ({
        ...done,
        detail: asEntryDetail(done.entity),
      })),
    changedCode: PROJECT_ENTRY_CHANGED,
    href: entryHrefs(base, types, trash),
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
