import { useCallback, useState } from 'react'
import { Pencil, Trash } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { entityImageUrl, fieldImageUrl } from '../lore/images'
import { confirmDelete } from '../lib/confirm'
import { deleteProjectEntity, getProjectEntity } from '../projectEntities/api'
import type { ProjectEntityDetail } from '../projectEntities/types'
import { isNotFoundOrForbidden, useAsyncRead } from '../lib/useAsyncRead'
import { useUniverseAccess } from '../universes/access'
import { t, useI18n } from '../i18n'
import { EmptyState } from './EmptyState'
import { ProjectEntityFields } from './ProjectEntityFields'
import { ActionMenu, ActionMenuItem } from './ActionMenu'
import { Button } from './Button'
import { Crumb } from './Crumb'
import { EntryHead, EntryTypeLink } from './EntryHead'
import { EntryBar, EntryDates, EntryLayout } from './lore/EntryFrame'
import { ReadGate } from './ReadGate'
import { QuietNote } from './QuietNote'

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
  const access = useUniverseAccess()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const read = useCallback(
    (signal: AbortSignal) => getProjectEntity(projectId, entityId, signal),
    [projectId, entityId],
  )
  // The API decides access: a missing id, another project's entry or no access all answer 404 or 403. A re-read (after
  // an edit, #287, or Try again) keeps the screen until it answers, and a failure shows instead of the old entry.
  const { load, refresh } = useAsyncRead<ProjectEntityDetail>(read, {
    missing: isNotFoundOrForbidden,
    failed: t('projects.gameEntities.entity.failed'),
    key: entityId,
    keepOnFailure: false,
  })

  return (
    <ReadGate
      load={load}
      loading={{ text: t('projects.gameEntities.entity.loading'), testId: 'game-entity-loading' }}
      error={{ onRetry: refresh, testId: 'game-entity-failed' }}
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
                <EntryTypeLink
                  to={typeHref}
                  accent={entity.entityTypeAccentColor}
                  icon={entity.entityTypeIcon}
                  name={entity.entityTypeName}
                  testId="game-entity-crumb-type"
                />
              }
              name={<bdi>{entity.name}</bdi>}
              nameTestId="game-entity-title"
            >
              {entity.summary ? (
                <p className="entry__summary prose" data-testid="game-entity-description">
                  {entity.summary}
                </p>
              ) : (
                <QuietNote spacing="flush" testId="game-entity-no-description">
                  {t('projects.gameEntities.entity.noDescription')}
                </QuietNote>
              )}
            </EntryHead>

            {access.editContent ? (
              <EntryBar
                tools={
                  <>
                    <Button
                      tone="secondary"
                      icon={Pencil}
                      onClick={() => setEditing(true)}
                      data-testid="project-entity-edit"
                    >
                      {t('projects.gameEntities.entity.edit')}
                    </Button>
                    <ActionMenu
                      label={t('projects.common.more', { name: entity.name })}
                      triggerTestId="project-entity-actions"
                    >
                      <ActionMenuItem
                        icon={Trash}
                        tone="danger"
                        testId="project-entity-delete"
                        onClick={() =>
                          void confirmDelete(
                            {
                              title: t('projects.entries.trash.title', { name: entity.name }),
                              message: t('projects.entries.trash.message'),
                              confirmLabel: t('projects.entries.delete'),
                              variant: 'warning',
                            },
                            () =>
                              deleteProjectEntity(projectId, entity.id).then(() =>
                                navigate(gameHref),
                              ),
                          )
                        }
                      >
                        {t('projects.entries.delete')}
                      </ActionMenuItem>
                    </ActionMenu>
                  </>
                }
              />
            ) : null}

            <EntryLayout picture={picture}>
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
                  onSaved={refresh}
                />
              </div>

              <aside className="entry__rail" aria-label={t('entity.page.rail.label')}>
                {picture ? null : (
                  <QuietNote spacing="flush" testId="game-entity-no-image">
                    {t('projects.gameEntities.entity.noImage')}
                  </QuietNote>
                )}
                <EntryDates createdAt={entity.createdAt} updatedAt={entity.updatedAt} />
              </aside>
            </EntryLayout>
          </article>
        )
      }}
    </ReadGate>
  )
}
