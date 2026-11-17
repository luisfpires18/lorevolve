import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { fieldImageUrl } from '../lore/images'
import { EMPTY_FACT, renderFact } from '../lore/facts'
import { listProjectTypes } from '../projectEntities/api'
import { fieldRows } from '../projectEntities/fieldRows'
import {
  FieldKind,
  type ProjectEntityDetail,
  type ProjectEntityType,
} from '../projectEntities/types'
import { useUniverseAccess } from '../universes/access'
import type { WorkspaceContext } from '../pages/UniverseWorkspace'
import { t, useI18n } from '../i18n'
import { Drawer } from './Drawer'
import { ProjectEntryForm } from './ProjectEntries'

/**
 * An entry's field values (#287), in its own type's order and read from its own game's types, so a same-named type of
 * another game never lends a field. One component for every type. Edit opens the entry form for those who may edit;
 * the API still decides.
 */
export function ProjectEntityFields({
  projectId,
  universeId,
  detail,
  onSaved,
}: {
  projectId: string
  universeId: string
  detail: ProjectEntityDetail
  onSaved: () => void
}) {
  useI18n()
  const chronology = useOutletContext<WorkspaceContext>().chronology
  const access = useUniverseAccess()
  // undefined while reading; null when the read failed, which leaves the stored values and no Edit.
  const [type, setType] = useState<ProjectEntityType | null | undefined>(undefined)
  const [editing, setEditing] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    listProjectTypes(projectId, controller.signal)
      .then((types) => setType(types.find((one) => one.id === detail.entityTypeId) ?? null))
      .catch(() => {
        if (!controller.signal.aborted) setType(null)
      })
    return () => controller.abort()
  }, [projectId, detail.entityTypeId])

  if (type === undefined) return null

  const rows = fieldRows(type, detail)

  return (
    <section data-testid="game-entity-fields">
      <div className="projects__head">
        <h2 className="sectionrule">{t('projects.gameEntities.entity.fields')}</h2>
        {type && access.editContent ? (
          <button
            className="button button--secondary"
            type="button"
            onClick={() => {
              setFailed(null)
              setEditing(true)
            }}
            data-testid="project-entity-edit"
          >
            {t('projects.gameEntities.entity.edit')}
          </button>
        ) : null}
      </div>
      {rows.length > 0 ? (
        <dl className="facts">
          {rows.map((row) => {
            const shown =
              row.kind === FieldKind.Image
                ? null
                : row.value
                  ? renderFact(row.value, chronology)
                  : EMPTY_FACT
            return (
              <div className="facts__row" key={row.id} data-testid={`game-entity-field-${row.id}`}>
                <dt className="facts__key">
                  <bdi>{row.name}</bdi>
                </dt>
                <dd className="facts__value prose">
                  {row.image ? (
                    <img
                      className="tile"
                      src={fieldImageUrl(universeId, detail.id, row.image, 'crop')}
                      width={row.image.width}
                      height={row.image.height}
                      alt={t('projects.gameEntities.entity.fieldImageAlt', { name: row.name })}
                    />
                  ) : shown === null || shown === EMPTY_FACT ? (
                    <span className="projectcard__meta">
                      {t('projects.gameEntities.entity.noValue')}
                    </span>
                  ) : (
                    shown
                  )}
                </dd>
              </div>
            )
          })}
        </dl>
      ) : (
        <p className="projectcard__meta" data-testid="game-entity-no-fields">
          {t('projects.gameEntities.entity.noFields')}
        </p>
      )}
      {editing && type ? (
        <Drawer
          testId="project-entity-edit-drawer"
          titleId="project-entity-edit-title"
          title={t('projects.gameEntities.entity.editTitle')}
          onClose={() => setEditing(false)}
          actions={() => null}
        >
          {failed ? (
            <p role="alert" data-testid="project-entity-edit-failed">
              {failed}
            </p>
          ) : null}
          <ProjectEntryForm
            projectId={projectId}
            universeId={universeId}
            entityTypeId={detail.entityTypeId}
            fields={[...type.fields, ...type.inheritedFields]}
            entry={detail}
            onSaved={(notice) => {
              setEditing(false)
              setFailed(notice)
              onSaved()
            }}
            onFailed={(error) =>
              setFailed(error instanceof Error ? error.message : t('projects.entries.failed'))
            }
            onCancel={() => setEditing(false)}
          />
        </Drawer>
      ) : null}
      {failed && !editing ? (
        <p role="alert" data-testid="project-entity-edit-notice">
          {failed}
        </p>
      ) : null}
    </section>
  )
}
