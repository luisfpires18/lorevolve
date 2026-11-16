import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { listProjectTypes } from '../projectEntities/api'
import type { ProjectEntityType } from '../projectEntities/types'
import { buildTypeTree } from '../lore/typeTree'
import { LoreCatalog, LoreCatalogSkeleton } from './LoreCatalog'
import { ProjectEntries } from './ProjectEntries'
import { ProjectSchema } from './ProjectSchema'
import { t, useI18n } from '../i18n'

/**
 * A project's Entities view (#196): its types as cards, one type's entries a page at a time, and the type editor as an
 * action rather than a panel above the content, so an author reaching entries never passes a schema editor on the way.
 *
 * Which of the three is open lives in the address (`?type=` and `?manage=types`), so each is a link, the browser's
 * back button leaves it, and a direct load opens it. The editor is the same `ProjectSchema` the overview used to hold:
 * it moved, it did not change, and it only ever edits this project's types.
 */
export function ProjectEntitiesView({
  projectId,
  universeId,
  reloadKey,
  onChanged,
}: {
  projectId: string
  /** The universe the project belongs to: an entry's pictures are stored under it. */
  universeId: string
  /** The page's `schemaVersion`: bumped by a schema write, so the cards and the entries re-read what they offer. */
  reloadKey: number
  onChanged: () => void
}) {
  useI18n()
  const [params] = useSearchParams()
  // Explicit, because a relative link under the project's splat route would resolve without the view's segment.
  const { pathname } = useLocation()
  const typeId = params.get('type')
  const managing = params.get('manage') === 'types'
  // The entry a link from elsewhere named, carried to the list so that it opens on that row (#195).
  const entryId = params.get('entry')
  // The way back to the cards, said as Lore says it above a type: a quiet crumb over the screen's own name.
  const back = (
    <Link to={pathname} data-testid="project-entities-back">
      {t('projects.entities.title')}
    </Link>
  )

  if (managing) {
    return (
      <div className="projectbody" data-testid="project-entities-manage">
        <ProjectSchema
          projectId={projectId}
          reloadKey={reloadKey}
          onChanged={onChanged}
          crumb={back}
        />
      </div>
    )
  }

  if (typeId) {
    return (
      <div className="projectbody" data-testid="project-entities-type">
        {/* Keyed by the type, so opening another card starts its own first page rather than carrying this one's. */}
        <ProjectEntries
          key={typeId}
          projectId={projectId}
          universeId={universeId}
          fixedTypeId={typeId}
          openEntryId={entryId ?? undefined}
          reloadKey={reloadKey}
          crumb={back}
        />
      </div>
    )
  }

  return (
    <TypeCards
      pathname={pathname}
      projectId={projectId}
      reloadKey={reloadKey}
      onChanged={onChanged}
    />
  )
}

/**
 * The first screen: every type as Lore's own card - its icon, its description, where it sits and its count - from the one
 * list request that already carries the counts. It is Lore's catalog itself, not a copy, so the two cannot drift apart.
 */
function TypeCards({
  pathname,
  projectId,
  reloadKey,
  onChanged,
}: {
  pathname: string
  projectId: string
  reloadKey: number
  onChanged: () => void
}) {
  const [types, setTypes] = useState<ProjectEntityType[] | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  // A project type's own entry count is what the card reads as listed; its drill-in lists that type's entries only.
  const tree = useMemo(
    () =>
      buildTypeTree((types ?? []).map((type) => ({ ...type, listedEntityCount: type.entryCount }))),
    [types],
  )

  // Mounted afresh each time the author comes back to the cards, so a count changed in a drill-in is read again here.
  useEffect(() => {
    const controller = new AbortController()
    listProjectTypes(projectId, controller.signal)
      .then(setTypes)
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setTypes([])
        setFailed(error instanceof Error ? error.message : t('projects.schema.failed'))
      })
    return () => controller.abort()
  }, [projectId, reloadKey])

  if (types === null) {
    return <LoreCatalogSkeleton />
  }

  // No types yet: the schema panel is the empty state, because it is what offers the starter templates.
  if (types.length === 0 && failed === null) {
    return <ProjectSchema projectId={projectId} reloadKey={reloadKey} onChanged={onChanged} />
  }

  return (
    <section className="projects" data-testid="project-entity-types">
      <header className="projects__head">
        <div className="projects__headtext">
          <h2>{t('projects.entities.title')}</h2>
          <p className="projects__lede">{t('projects.entities.lede')}</p>
        </div>
        <Link
          to={`${pathname}?manage=types`}
          className="button button--secondary"
          data-testid="project-types-manage"
        >
          {t('projects.entities.manage')}
        </Link>
      </header>

      {failed ? (
        <p role="alert" data-testid="project-entity-types-failed">
          {failed}
        </p>
      ) : null}

      <div data-testid="project-entity-type-cards">
        {/* A project's types have no groups, so the catalog shows no "Browse by group" and never calls these two. */}
        <LoreCatalog
          tree={tree}
          groups={[]}
          browsing={null}
          onBrowse={() => undefined}
          typeHref={(typeId) => `${pathname}?type=${typeId}`}
          groupHref={() => pathname}
          typesUrl={`${pathname}?manage=types`}
          countBranch={false}
        />
      </div>
    </section>
  )
}
