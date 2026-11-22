import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { LoreCatalogSkeleton } from '../components/LoreCatalog'
import { ProjectSchema } from '../components/ProjectSchema'
import { ReadGate } from '../components/ReadGate'
import { useI18n } from '../i18n'
import { useAsyncRead } from '../lib/useAsyncRead'
import { EntrySourceContext, EntryTypesContext } from '../lore/entrySource'
import { listProjectTypes } from '../projectEntities/api'
import { asEntryType, NO_ERAS } from '../projectEntities/fieldDefinition'
import { projectSource } from '../projectEntities/projectSource'
import { EntityPage, LorePage } from '../screens'

/**
 * A project's entries on the Lore screens (#551): with `list`, the Lore list at `base`; else the entry page, at
 * `base/<id>` or `base/new?type=`. Both read and write through the project's source and draw the project's types;
 * everything Lore-only stays off.
 */
export function ProjectLore({
  projectId,
  base,
  typesHref,
  entityId,
  list = false,
  reloadKey = 0,
  onChanged,
}: {
  projectId: string
  /** The project's entry list: an entry is `base/<id>`, and Delete lands here. */
  base: string
  /** The project's type editor: its own Types view, or `base?manage=types` where it has none. */
  typesHref: string
  entityId?: string
  list?: boolean
  /** Bumped by a schema write, so the types are read again. */
  reloadKey?: number
  onChanged?: () => void
}) {
  const { t } = useI18n()
  const [params] = useSearchParams()
  const { hash } = useLocation()
  // Built from three strings, so a read keyed on the source never runs again on a render and an edit is kept.
  const source = useMemo(
    () => projectSource(projectId, base, typesHref),
    [projectId, base, typesHref],
  )
  const read = useCallback(
    (signal: AbortSignal) => listProjectTypes(projectId, signal),
    [projectId],
  )
  const { load, retry, refresh } = useAsyncRead(read, {
    failed: list ? t('projects.schema.failed') : t('projects.gameEntities.entity.failed'),
    key: projectId,
  })
  // A schema write here (the starter offer, the editor) reads the types again, keeping what is shown meanwhile.
  const readFor = useRef(reloadKey)
  useEffect(() => {
    if (readFor.current === reloadKey) return
    readFor.current = reloadKey
    refresh()
  }, [reloadKey, refresh])

  // The page's types, one object per read, so they stay put between renders.
  const value = load.kind === 'ready' ? load.value : null
  const types = useMemo(
    () => (value ? { entryTypes: value.map(asEntryType), chronology: NO_ERAS } : null),
    [value],
  )

  if (list && params.get('manage') === 'types') {
    if (typesHref !== `${base}?manage=types`) {
      // The old address keeps whatever else it carried, as every other project address does on its way to its view.
      const rest = new URLSearchParams(params)
      rest.delete('manage')
      const query = rest.toString()
      return <Navigate to={`${typesHref}${query ? `?${query}` : ''}${hash}`} replace />
    }
    return (
      <div data-testid="project-entities-manage">
        <ProjectSchema
          projectId={projectId}
          reloadKey={reloadKey}
          onChanged={onChanged}
          crumb={{ to: base, label: t('projects.entities.title'), testId: 'project-entities-back' }}
        />
      </div>
    )
  }

  // The old `?type=&add=1` address lands on the create page.
  const adding = list && params.get('add') === '1' ? params.get('type') : null
  if (adding) return <Navigate to={source.href.create(adding)} replace />

  return (
    <ReadGate
      load={load}
      loading={
        list
          ? { skeleton: <LoreCatalogSkeleton /> }
          : { text: t('projects.gameEntities.entity.loading') }
      }
      error={{ onRetry: retry }}
    >
      {(projectTypes) =>
        // No types yet: the schema panel is the empty state, because it is what offers the starter templates.
        list && projectTypes.length === 0 ? (
          <ProjectSchema projectId={projectId} reloadKey={reloadKey} onChanged={onChanged} />
        ) : (
          <EntrySourceContext.Provider value={source}>
            <EntryTypesContext.Provider value={types}>
              {list ? <LorePage /> : <EntityPage entityId={entityId} />}
            </EntryTypesContext.Provider>
          </EntrySourceContext.Provider>
        )
      }
    </ReadGate>
  )
}
