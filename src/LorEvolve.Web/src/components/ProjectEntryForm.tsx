import { useEffect, useState } from 'react'
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
import type { PendingFieldImage } from './FieldImageInput'
import { FieldInput } from './FieldInputs'
import { emptyValue } from '../lore/document'
import { asFieldDefinition, NO_ERAS } from '../projectEntities/fieldDefinition'
import { t, useI18n } from '../i18n'
import { FormActions } from './FormActions'
import { payloadKey } from '../lib/drawerGuard'
import { useDiscardGuard } from '../lib/useDiscardGuard'
import { SectionTitle } from './Section'

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
  onDirtyChange,
  onSavingChange,
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
  /** Given (inside a drawer): told when the form starts or stops differing, and the drawer guards the leaving. */
  onDirtyChange?: (dirty: boolean) => void
  /** Given (inside a drawer): told when a save starts and ends, so the drawer locks. */
  onSavingChange?: (saving: boolean) => void
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
  const [start] = useState(() => payloadKey({ name, summary, values }))
  const isDirty =
    !busy &&
    (payloadKey({ name, summary, values }) !== start || Object.keys(pendingImages).length > 0)
  const { confirmLeave } = useDiscardGuard(
    isDirty,
    onDirtyChange ? null : t(entry ? 'projects.entries.leaveEdited' : 'projects.entries.leaveNew'),
  )
  useEffect(() => {
    onDirtyChange?.(isDirty)
    onSavingChange?.(busy)
  }, [isDirty, busy, onDirtyChange, onSavingChange])
  // Gone, the form holds nothing: the drawer it reported to starts clean next time.
  useEffect(
    () => () => {
      onDirtyChange?.(false)
      onSavingChange?.(false)
    },
    [onDirtyChange, onSavingChange],
  )

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
      <Field
        label={t('projects.entries.name')}
        requiredMark
        name={null}
        value={name}
        onChange={(event) => setName(event.target.value)}
        data-testid={`${prefix}-name`}
        required
      />

      <Field
        label={t('projects.entries.summary')}
        name={null}
        value={summary}
        onChange={(event) => setSummary(event.target.value)}
        data-testid={`${prefix}-summary`}
      />

      {fields.length > 0 ? (
        <SectionTitle level={3} tone="rule-accent">
          {t('projects.entries.values')}
        </SectionTitle>
      ) : null}

      {fields.map((field) => {
        const definition = asFieldDefinition(field)
        return (
          <FieldInput
            key={field.id}
            definition={definition}
            value={values[field.id] ?? emptyValue(definition)}
            universeId={universeId}
            excludeId={entry?.id}
            chronology={NO_ERAS}
            onChange={(next) => setValues((current) => ({ ...current, [field.id]: next }))}
            image={{
              entityId: entry?.id ?? null,
              stored: entry?.fieldImages.find((one) => one.fieldId === field.id) ?? null,
              pending: pendingImages[field.id] ?? null,
              onPending: (held) =>
                setPendingImages((current) => {
                  const { [field.id]: _dropped, ...rest } = current
                  return held ? { ...rest, [field.id]: held } : rest
                }),
              onChanged: () => undefined,
              disabled: busy,
            }}
          />
        )
      })}

      <FormActions
        submitLabel={entry ? t('shell.actions.save') : t('projects.entries.add')}
        busy={busy}
        busyLabel={t('projects.entries.saving')}
        submitTestId={`${prefix}-save`}
        onCancel={() => void confirmLeave().then((ok) => ok && onCancel())}
        cancelTestId={`${prefix}-cancel`}
        inline
      />
    </form>
  )
}
