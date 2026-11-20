import { useEffect, useState } from 'react'
import { Pencil } from 'lucide-react'
import { Link } from 'react-router-dom'
import { entityImageUrl, fieldImageUrl } from '../lore/images'
import { getProjectEntity } from '../projectEntities/api'
import type { ProjectEntityDetail } from '../projectEntities/types'
import { ApiError } from '../lib/api'
import { useUniverseAccess } from '../universes/access'
import { t, tx, useI18n } from '../i18n'
import { EmptyState } from './EmptyState'
import { ProjectEntityFields } from './ProjectEntityFields'
import { TypeIcon } from './TypeIcon'
import { Button } from './Button'
import { Crumb } from './Crumb'
import { EntryHead } from './EntryHead'
import { errorText } from '../lib/errorText'
import { ReadGate } from './ReadGate'
import { DateText } from './DateText'
import { QuietNote } from './QuietNote'

type LoadState =
  | { kind: 'ready'; for: string; value: ProjectEntityDetail }
  | { kind: 'missing'; for: string }
  | { kind: 'error'; for: string; message: string }

/**
 * The one detail screen of a project's entry (#286), the same for every type: its name, type, picture and full
 * description. Game Entities (after checking the game is of this universe) and a project's own Entities view both open
 * it, each naming its directory for the crumbs; this view reads the entry by project and id together, so another project's entry is a 404, shown as not found
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
  const access = useUniverseAccess()
  const [editing, setEditing] = useState(false)
  const read = state !== null && state.for === entityId ? state : null

  useEffect(() => {
    const controller = new AbortController()
    getProjectEntity(projectId, entityId, controller.signal)
      .then((entity) => setState({ kind: 'ready', for: entityId, value: entity }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        // The API decides access: a missing id, another project's entry or no access all answer 404 or 403.
        if (error instanceof ApiError && (error.status === 404 || error.status === 403)) {
          setState({ kind: 'missing', for: entityId })
        } else {
          setState({
            kind: 'error',
            for: entityId,
            message: errorText(error, t('projects.gameEntities.entity.failed')),
          })
        }
      })
    return () => controller.abort()
  }, [projectId, entityId, reloadKey])

  return (
    <ReadGate
      load={read ?? { kind: 'loading' }}
      loading={{ text: t('projects.gameEntities.entity.loading'), testId: 'game-entity-loading' }}
      error={{ onRetry: () => setReloadKey((key) => key + 1), testId: 'game-entity-failed' }}
      missing={
        <EmptyState
          title={t('projects.gameEntities.entity.notFound')}
          hint={t('projects.gameEntities.entity.notFoundHint')}
          action={<Link to={gameHref}>{t('projects.gameEntities.entity.backToGame')}</Link>}
          testId="game-entity-missing"
        />
      }
    >
      {(entity) => {
        // The entry's own picture leads, as on a Lore entry's page; without one, the first Image field's picture (the server
        // returns fieldImages in the type's field order, archived fields left out).
        const portrait = entity.image
        const fieldImage = portrait ? null : (entity.fieldImages[0] ?? null)
        const picture = portrait
          ? {
              src: entityImageUrl(
                universeId,
                entity.id,
                portrait,
                portrait.hasDisplay ? 'display' : 'original',
              ),
              width: portrait.width,
              height: portrait.height,
            }
          : fieldImage
            ? {
                src: fieldImageUrl(universeId, entity.id, fieldImage, 'crop'),
                width: fieldImage.width,
                height: fieldImage.height,
              }
            : null
        const typeHref = `${gameHref}?type=${entity.entityTypeId}&entry=${entity.id}`

        // Lore's entry page, read side (#286): the same head, bar, picture, facts and dates, with this project's crumbs.
        return (
          <article
            className="entry"
            style={
              entity.entityTypeAccentColor
                ? { ['--entry-accent' as string]: entity.entityTypeAccentColor }
                : undefined
            }
            data-testid="game-entity-page"
          >
            <EntryHead
              crumb={
                <Crumb
                  items={[
                    {
                      to: gameHref,
                      label: <bdi>{gameName}</bdi>,
                      testId: 'game-entity-crumb-game',
                    },
                  ]}
                />
              }
              // Back to this entry's own type, with its row marked as the list marks a named entry (#195).
              type={
                <Link
                  className="entry__type"
                  to={typeHref}
                  style={
                    entity.entityTypeAccentColor
                      ? { ['--type-accent' as string]: entity.entityTypeAccentColor }
                      : undefined
                  }
                  data-testid="game-entity-crumb-type"
                >
                  <TypeIcon iconKey={entity.entityTypeIcon} className="entry__typeicon" />
                  <bdi>{entity.entityTypeName}</bdi>
                </Link>
              }
              name={<bdi>{entity.name}</bdi>}
              nameTestId="game-entity-title"
            >
              {entity.summary ? (
                <p className="entry__summary prose" data-testid="game-entity-description">
                  {entity.summary}
                </p>
              ) : (
                <p
                  className="entry__summary projectcard__meta"
                  data-testid="game-entity-no-description"
                >
                  {t('projects.gameEntities.entity.noDescription')}
                </p>
              )}
            </EntryHead>

            {access.editContent ? (
              <div className="entry__bar">
                <div className="entry__lenses" />
                <div className="entry__tools">
                  <Button
                    tone="secondary"
                    icon={Pencil}
                    onClick={() => setEditing(true)}
                    data-testid="project-entity-edit"
                  >
                    {t('projects.gameEntities.entity.edit')}
                  </Button>
                </div>
              </div>
            ) : null}

            <div
              className="entry__layout"
              data-picture={picture ? 'true' : 'false'}
              data-shape={picture ? pictureShape(picture) : undefined}
            >
              {picture ? (
                <figure className="entry__media">
                  <img
                    src={picture.src}
                    width={picture.width}
                    height={picture.height}
                    alt={t('projects.gameEntities.entity.imageAlt', { name: entity.name })}
                    decoding="async"
                    data-testid="game-entity-image"
                  />
                </figure>
              ) : null}

              <div className="entry__main">
                <ProjectEntityFields
                  projectId={projectId}
                  universeId={universeId}
                  detail={entity}
                  editing={editing}
                  onEditingChange={setEditing}
                  onSaved={() => setReloadKey((key) => key + 1)}
                />
              </div>

              <aside className="entry__rail" aria-label={t('entity.page.rail.label')}>
                {picture ? null : (
                  <QuietNote spacing="flush" testId="game-entity-no-image">
                    {t('projects.gameEntities.entity.noImage')}
                  </QuietNote>
                )}
                <p className="rail__meta">
                  {tx('entity.page.rail.created', { date: <DateText value={entity.createdAt} /> })}
                  <br />
                  {tx('entity.page.rail.lastChanged', {
                    date: <DateText value={entity.updatedAt} />,
                  })}
                </p>
              </aside>
            </div>
          </article>
        )
      }}
    </ReadGate>
  )
}

/** Lore's own rule for how the picture sits beside the facts. */
function pictureShape(image: { width: number; height: number }) {
  const ratio = image.width / image.height
  return ratio > 1.25 ? 'landscape' : ratio < 0.9 ? 'portrait' : 'square'
}
