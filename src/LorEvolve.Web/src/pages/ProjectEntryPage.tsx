import { useCallback, useMemo } from 'react'
import { ReadGate } from '../components/ReadGate'
import { useI18n } from '../i18n'
import { useAsyncRead } from '../lib/useAsyncRead'
import { EntrySourceContext, EntryTypesContext } from '../lore/entrySource'
import { listProjectTypes } from '../projectEntities/api'
import { asEntryType, NO_ERAS } from '../projectEntities/fieldDefinition'
import { projectSource } from '../projectEntities/projectSource'
import { EntityPage } from '../screens'

/**
 * A project entry on the Lore entry page (#551), at `base/<id>` or `base/new?type=`. The page reads and writes through
 * the project's source and draws the project's types; everything Lore-only stays off.
 */
export function ProjectEntryPage({
  projectId,
  base,
  typesHref,
  entityId,
}: {
  projectId: string
  /** The project's entry list: an entry is `base/<id>`, and Delete lands here. */
  base: string
  typesHref: string
  entityId?: string
}) {
  const { t } = useI18n()
  // Built from three strings, so the entry read keyed on the source never runs again on a render and an edit is kept.
  const source = useMemo(
    () => projectSource(projectId, base, typesHref),
    [projectId, base, typesHref],
  )
  const read = useCallback(
    (signal: AbortSignal) => listProjectTypes(projectId, signal),
    [projectId],
  )
  const { load, retry } = useAsyncRead(read, {
    failed: t('projects.gameEntities.entity.failed'),
    key: projectId,
  })

  // The page's types, one object per read, so they stay put between renders.
  const value = load.kind === 'ready' ? load.value : null
  const types = useMemo(
    () => (value ? { entryTypes: value.map(asEntryType), chronology: NO_ERAS } : null),
    [value],
  )

  return (
    <ReadGate
      load={load}
      loading={{ text: t('projects.gameEntities.entity.loading') }}
      error={{ onRetry: retry }}
    >
      {() => (
        <EntrySourceContext.Provider value={source}>
          <EntryTypesContext.Provider value={types}>
            <EntityPage entityId={entityId} />
          </EntryTypesContext.Provider>
        </EntrySourceContext.Provider>
      )}
    </ReadGate>
  )
}
