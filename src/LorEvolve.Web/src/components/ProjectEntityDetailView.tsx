import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fieldImageUrl } from '../lore/images'
import { getProjectEntity } from '../projectEntities/api'
import type { ProjectEntityDetail } from '../projectEntities/types'
import { ApiError } from '../lib/api'
import { t, useI18n } from '../i18n'
import { EmptyState } from './EmptyState'
import { EntityTile } from './EntityTile'
import { PageHeader } from './PageHeader'
import { ProjectEntityFields } from './ProjectEntityFields'
import { TypeIcon } from './TypeIcon'

type LoadState =
  | { kind: 'ready'; for: string; entity: ProjectEntityDetail }
  | { kind: 'missing'; for: string }
  | { kind: 'failed'; for: string; message: string }

/**
 * The one detail screen of a project's entry (#286), the same for every type: its name, type, picture and full
 * description. The caller has already checked that `projectId` is a Game of this universe, and names it here for the
 * crumbs; this view reads the entry by project and id together, so another project's entry is a 404, shown as not found
 * without saying why. Field values and Edit (#287) follow the description.
 */
export function ProjectEntityDetailView({
  projectId,
  universeId,
  entityId,
  gameName,
  gameHref,
}: {
  projectId: string
  universeId: string
  entityId: string
  /** The checked game's name and its directory address: the first crumb and the way back from a not-found. */
  gameName: string
  gameHref: string
}) {
  useI18n()
  const [state, setState] = useState<LoadState | null>(null)
  // Bumped after an edit: the entry is read again, so every part of the screen shows what was saved (#287).
  const [reloadKey, setReloadKey] = useState(0)
  const read = state !== null && state.for === entityId ? state : null

  useEffect(() => {
    const controller = new AbortController()
    getProjectEntity(projectId, entityId, controller.signal)
      .then((entity) => setState({ kind: 'ready', for: entityId, entity }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        // The API decides access: a missing id, another project's entry or no access all answer 404 or 403.
        if (error instanceof ApiError && (error.status === 404 || error.status === 403)) {
          setState({ kind: 'missing', for: entityId })
        } else {
          setState({
            kind: 'failed',
            for: entityId,
            message:
              error instanceof Error ? error.message : t('projects.gameEntities.entity.failed'),
          })
        }
      })
    return () => controller.abort()
  }, [projectId, entityId, reloadKey])

  if (read === null) {
    return (
      <p className="projects__lede" data-testid="game-entity-loading">
        {t('projects.gameEntities.entity.loading')}
      </p>
    )
  }

  if (read.kind === 'missing') {
    return (
      <EmptyState
        title={t('projects.gameEntities.entity.notFound')}
        hint={t('projects.gameEntities.entity.notFoundHint')}
        action={<Link to={gameHref}>{t('projects.gameEntities.entity.backToGame')}</Link>}
        testId="game-entity-missing"
      />
    )
  }

  if (read.kind === 'failed') {
    return (
      <p role="alert" data-testid="game-entity-failed">
        {read.message}
      </p>
    )
  }

  const { entity } = read
  // The server returns fieldImages in the type's field order, archived fields left out, so the first leads.
  const image = entity.fieldImages[0] ?? null

  return (
    <article className="projects" data-testid="game-entity-page">
      <PageHeader
        crumb={
          <nav aria-label={t('entity.page.head.breadcrumb')}>
            <ol>
              <li>
                <Link to={gameHref} data-testid="game-entity-crumb-game">
                  <bdi>{gameName}</bdi>
                </Link>
              </li>
              <li>
                {/* Back to this entry's own type, with its row marked as the list marks a named entry (#195). */}
                <Link
                  to={`${gameHref}?type=${entity.entityTypeId}&entry=${entity.id}`}
                  data-testid="game-entity-crumb-type"
                >
                  <TypeIcon iconKey={null} className="entry__typeicon" />
                  <bdi>{entity.entityTypeName}</bdi>
                </Link>
              </li>
            </ol>
          </nav>
        }
        title={<bdi>{entity.name}</bdi>}
        titleTestId="game-entity-title"
      />
      <div className="entitydetail">
        <div className="entitydetail__media">
          {image ? (
            <img
              className="tile"
              src={fieldImageUrl(universeId, entity.id, image, 'crop')}
              width={image.width}
              height={image.height}
              alt={t('projects.gameEntities.entity.imageAlt', { name: entity.name })}
              data-testid="game-entity-image"
            />
          ) : (
            <>
              <EntityTile
                className="tile"
                universeId={universeId}
                entityId={entity.id}
                image={null}
                typeIcon={null}
                typeAccent={null}
              />
              <p className="projectcard__meta" data-testid="game-entity-no-image">
                {t('projects.gameEntities.entity.noImage')}
              </p>
            </>
          )}
        </div>
        <div>
          {entity.summary ? (
            <p className="prose entitydetail__description" data-testid="game-entity-description">
              {entity.summary}
            </p>
          ) : (
            <p className="projectcard__meta" data-testid="game-entity-no-description">
              {t('projects.gameEntities.entity.noDescription')}
            </p>
          )}
          <ProjectEntityFields
            projectId={projectId}
            universeId={universeId}
            detail={entity}
            onSaved={() => setReloadKey((key) => key + 1)}
          />
        </div>
      </div>
    </article>
  )
}
