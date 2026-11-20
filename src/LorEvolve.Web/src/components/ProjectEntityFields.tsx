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
import type { WorkspaceContext } from '../pages/UniverseWorkspace'
import { t, useI18n } from '../i18n'
import { Drawer } from './Drawer'
import { EntityImageField } from './EntityImageField'
import { ProjectEntryForm } from './ProjectEntryForm'
import { errorText } from '../lib/errorText'
import { FormMessage } from './FormMessage'
import { QuietNote } from './QuietNote'
import { Fact } from './Fact'
import { FactList } from './FactList'

/**
 * An entry's field values (#287), in its own type's order and read from its own game's types, so a same-named type of
 * another game never lends a field. One component for every type. Edit opens the entry form for those who may edit;
 * the API still decides.
 */
export function ProjectEntityFields({
  projectId,
  universeId,
  detail,
  editing,
  onEditingChange: setEditing,
  onSaved,
}: {
  projectId: string
  universeId: string
  detail: ProjectEntityDetail
  /** Whether the Edit drawer is open; the page's bar holds the Edit button, as Lore's does. */
  editing: boolean
  onEditingChange: (editing: boolean) => void
  onSaved: () => void
}) {
  useI18n()
  const chronology = useOutletContext<WorkspaceContext>().chronology
  // undefined while reading; null when the read failed, which leaves the stored values and no Edit.
  const [type, setType] = useState<ProjectEntityType | null | undefined>(undefined)
  const [failed, setFailed] = useState<string | null>(null)
  // The edit form inside the drawer reports these, so the drawer guards and locks.
  const [entryDirty, setEntryDirty] = useState(false)
  const [entrySaving, setEntrySaving] = useState(false)

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
      {rows.length > 0 ? (
        <FactList>
          {rows.map((row) => {
            const shown =
              row.kind === FieldKind.Image
                ? null
                : row.value
                  ? renderFact(row.value, chronology)
                  : EMPTY_FACT
            return (
              <Fact
                name={<bdi>{row.name}</bdi>}
                key={row.id}
                testId={`game-entity-field-${row.id}`}
                valueClassName="prose"
              >
                {row.image ? (
                  <img
                    className="tile"
                    src={fieldImageUrl(universeId, detail.id, row.image, 'crop')}
                    width={row.image.width}
                    height={row.image.height}
                    alt={t('projects.gameEntities.entity.fieldImageAlt', { name: row.name })}
                  />
                ) : shown === null || shown === EMPTY_FACT ? (
                  <QuietNote as="span">{t('projects.gameEntities.entity.noValue')}</QuietNote>
                ) : (
                  shown
                )}
              </Fact>
            )
          })}
        </FactList>
      ) : (
        <QuietNote spacing="flush" testId="game-entity-no-fields">
          {t('projects.gameEntities.entity.noFields')}
        </QuietNote>
      )}
      {editing && type ? (
        <Drawer
          testId="project-entity-edit-drawer"
          titleId="project-entity-edit-title"
          title={t('projects.gameEntities.entity.editTitle')}
          isDirty={entryDirty}
          leaveMessage={t('projects.entries.leaveEdited')}
          busy={entrySaving}
          onClose={() => setEditing(false)}
          actions={() => null}
        >
          {failed ? <FormMessage testId="project-entity-edit-failed">{failed}</FormMessage> : null}
          {/* The entry's own picture, edited as a Lore entry's is: Lore's control and its routes (#286). */}
          <section className="entryform__section">
            <EntityImageField
              universeId={universeId}
              entityId={detail.id}
              image={detail.image}
              pending={null}
              onPending={() => undefined}
              onChanged={() => onSaved()}
              disabled={false}
            />
          </section>
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
            onFailed={(error) => setFailed(errorText(error, t('projects.entries.failed')))}
            onCancel={() => setEditing(false)}
            onDirtyChange={setEntryDirty}
            onSavingChange={setEntrySaving}
          />
        </Drawer>
      ) : null}
      {failed && !editing ? (
        <FormMessage testId="project-entity-edit-notice">{failed}</FormMessage>
      ) : null}
    </section>
  )
}
