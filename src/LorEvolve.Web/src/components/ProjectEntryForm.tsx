import { useState } from 'react'
import { Field } from './Field'
import { createProjectEntity, saveProjectEntity } from '../projectEntities/api'
import { valuesFromDetail } from '../projectEntities/fieldRows'
import { setFieldImage } from '../lore/images'
import {
  FieldKind,
  type FieldValueInput,
  type ProjectEntityDetail,
  type ProjectField,
} from '../projectEntities/types'
import { FieldImageInput, type PendingFieldImage } from './FieldImageInput'
import { t, useI18n } from '../i18n'
import { ValueField } from './projectEntities/ValueField'
import { Button } from './Button'

/**
 * The one entry form (#287): New on the list, and Edit on an entry's own screen. Edit starts from the stored entry and
 * saves it with its version, so a change made elsewhere in between is refused rather than overwritten. The type is
 * never changed here. A picture is not a value: on New it waits for the entry to exist, on Edit it is stored in place.
 */
export function ProjectEntryForm({
  projectId,
  universeId,
  entityTypeId,
  fields,
  entry,
  onSaved,
  onFailed,
  onCancel,
}: {
  projectId: string
  universeId: string
  entityTypeId: string
  fields: ProjectField[]
  /** Set for Edit; it carries the version and the canon link a save sends back. */
  entry?: ProjectEntityDetail
  /** After the save; the notice names any picture that could not be stored. */
  onSaved: (notice: string | null) => void
  onFailed: (error: unknown) => void
  onCancel: () => void
}) {
  useI18n()
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState(entry?.name ?? '')
  const [summary, setSummary] = useState(entry?.summary ?? '')
  const [values, setValues] = useState<Record<string, FieldValueInput>>(() =>
    entry ? valuesFromDetail(entry, fields) : {},
  )
  // An Image field's picture waits here until the entry exists, by field id: it is its own write after the create.
  const [pendingImages, setPendingImages] = useState<Record<string, PendingFieldImage>>({})
  const imageFieldIds = new Set(
    fields.filter((one) => one.kind === FieldKind.Image).map((one) => one.id),
  )
  const prefix = entry ? 'project-entry-edit' : 'project-entry-new'

  return (
    <form
      className="form"
      data-testid={prefix}
      onSubmit={(event) => {
        event.preventDefault()
        if (busy) return
        setBusy(true)
        const input = {
          entityTypeId,
          name,
          summary: summary.length > 0 ? summary : null,
          // The save replaces the link, so an edit sends the stored one back and never clears it by leaving it out.
          canonEntityId: entry?.canonEntityId ?? null,
          // A picture is never a value: it is uploaded below, once the entry has an id.
          fields: Object.values(values).filter((one) => !imageFieldIds.has(one.fieldDefinitionId)),
          expectedVersion: entry?.version ?? null,
        }
        ;(entry
          ? saveProjectEntity(projectId, entry.id, input)
          : createProjectEntity(projectId, input)
        )
          .then(async (saved) => {
            // Each picture is its own write and may fail on its own: the entry is already stored.
            const refused: string[] = []
            for (const [fieldId, held] of Object.entries(pendingImages)) {
              try {
                await setFieldImage(universeId, saved.id, fieldId, held.file, held.crop)
              } catch {
                refused.push(fields.find((one) => one.id === fieldId)?.name ?? '')
              }
            }
            onSaved(
              refused.length > 0
                ? t('entity.fieldImage.uploadFailed', { name: refused.join(', ') })
                : null,
            )
          })
          .catch((error: unknown) => {
            setBusy(false)
            onFailed(error)
          })
      }}
    >
      <Field label={t('projects.entries.name')}>
        {(control) => (
          <input
            {...control}
            className="field__input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            data-testid={`${prefix}-name`}
            required
          />
        )}
      </Field>

      <Field label={t('projects.entries.summary')}>
        {(control) => (
          <input
            {...control}
            className="field__input"
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            data-testid={`${prefix}-summary`}
          />
        )}
      </Field>

      {fields.length > 0 ? (
        <h4 className="sectionrule sectionrule--accent">{t('projects.entries.values')}</h4>
      ) : null}

      {fields.map((field) =>
        field.kind === FieldKind.Image ? (
          <FieldImageInput
            key={field.id}
            universeId={universeId}
            entityId={entry?.id ?? null}
            fieldId={field.id}
            name={field.name}
            shape={field.imageShape}
            image={entry?.fieldImages.find((one) => one.fieldId === field.id) ?? null}
            pending={pendingImages[field.id] ?? null}
            onPending={(held) =>
              setPendingImages((current) => {
                const { [field.id]: _dropped, ...rest } = current
                return held ? { ...rest, [field.id]: held } : rest
              })
            }
            onChanged={() => undefined}
            disabled={busy}
          />
        ) : (
          <ValueField
            key={field.id}
            field={field}
            value={values[field.id]}
            onChange={(next) => setValues((current) => ({ ...current, [field.id]: next }))}
          />
        ),
      )}

      <div className="form__actions">
        <Button type="submit" disabled={busy} data-testid={`${prefix}-save`}>
          {busy
            ? t('projects.entries.saving')
            : entry
              ? t('projects.entries.saveEdit')
              : t('projects.entries.add')}
        </Button>
        <Button tone="secondary" onClick={onCancel} data-testid={`${prefix}-cancel`}>
          {t('projects.common.cancel')}
        </Button>
      </div>
    </form>
  )
}
