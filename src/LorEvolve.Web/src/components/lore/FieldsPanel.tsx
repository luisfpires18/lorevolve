import { useState, type ReactNode } from 'react'
import { useI18n } from '../../i18n'
import { confirmDelete } from '../../lib/confirm'
import { FIELD_KIND_LABELS } from '../../lore/fieldKinds'
import type { EntityType, FieldDefinition } from '../../lore/typeDefinitions'
import type { FieldSave } from '../../lore/fieldDialogActions'
import { asFieldDefinition, PROJECT_FIELD_KINDS } from '../../projectEntities/fieldDefinition'
import type { ProjectField } from '../../projectEntities/types'
import { NewButton } from '../NewButton'
import { QuietNote } from '../QuietNote'
import { FieldDialog } from './FieldDialog'
import { InheritedFields } from './InheritedFields'
import { TypeFieldRow } from './TypeFieldRow'

/** A type's fields panel: the frame its row's Fields button names in `aria-controls`. */
export function FieldsPanel({
  id,
  testId,
  children,
}: {
  id?: string
  testId: string
  children: ReactNode
}) {
  return (
    <div id={id} className="types__fields" data-testid={testId}>
      {children}
    </div>
  )
}

/** A type's own fields, one `TypeFieldRow` each. */
export function FieldList({
  fields,
  label,
  testId,
  ...row
}: {
  fields: FieldDefinition[]
  /** The list's `aria-label`; left out where the panel names it by test id instead. */
  label?: string
  testId?: string
} & Omit<Parameters<typeof TypeFieldRow>[0], 'field'>) {
  return (
    <ul className="plainlist stack" aria-label={label} data-testid={testId}>
      {fields.map((field) => (
        <TypeFieldRow key={field.id} field={field} {...row} />
      ))}
    </ul>
  )
}

/** The fields of a type whose fields are a plain list: a project type, a type template. */
export function PlainFieldsPanel({
  id,
  testIds,
  owner,
  fields,
  inherited,
  canEdit,
  busy,
  setBusy,
  failing,
  refresh,
  deleteMessage,
  add,
  save,
  remove,
}: {
  id: string
  testIds: { panel: string; list: string; add: string }
  /** The type's or template's name: the field drawer's owner and the inherited note's type. */
  owner: string
  fields: ProjectField[]
  /** What the types above hand down, read-only (a project type). */
  inherited?: { owner: Pick<EntityType, 'id' | 'name'>; fields: FieldDefinition[] }[]
  canEdit: boolean
  busy: boolean
  setBusy: (busy: boolean) => void
  failing: (error: unknown) => void
  refresh: () => void
  /** The delete question's message: the place says what a delete does. */
  deleteMessage: string
  add: FieldSave
  /** The template's existing field edit, passed through. Without it (a project type, as today) the rows have no Edit and the drawer only adds. */
  save?: (fieldId: string, input: Parameters<FieldSave>[0]) => Promise<unknown>
  remove: (fieldId: string) => Promise<unknown>
}) {
  const { t } = useI18n()
  // The field drawer: a field being edited, or 'new'.
  const [field, setField] = useState<FieldDefinition | 'new' | null>(null)
  const summary = (each: FieldDefinition) => FIELD_KIND_LABELS[each.kind]

  function removeField(each: FieldDefinition) {
    return confirmDelete(
      {
        title: t('entityTypes.fields.deleteTitle', { name: each.name }),
        message: deleteMessage,
        confirmLabel: t('entityTypes.fields.deleteConfirm'),
      },
      () => remove(each.id).then(refresh),
      { setBusy, fail: failing },
    )
  }

  return (
    <FieldsPanel id={id} testId={testIds.panel}>
      {fields.length === 0 && !inherited?.length ? (
        <QuietNote spacing="flush">{t('projects.schema.noFields')}</QuietNote>
      ) : (
        <>
          {inherited ? (
            <InheritedFields type={{ name: owner }} inherited={inherited} summary={summary} />
          ) : null}
          <FieldList
            fields={fields.map(asFieldDefinition)}
            testId={testIds.list}
            canEdit={canEdit}
            busy={busy}
            summary={summary}
            setEditing={save ? setField : undefined}
            remove={removeField}
          />
        </>
      )}

      {canEdit ? (
        <NewButton
          tone="secondary"
          size="sm"
          data-testid={testIds.add}
          onClick={() => setField('new')}
        >
          {t('projects.schema.addField')}
        </NewButton>
      ) : null}

      {field ? (
        <FieldDialog
          field={field === 'new' ? null : field}
          owner={owner}
          kinds={PROJECT_FIELD_KINDS}
          save={(input) => (field === 'new' || !save ? add(input) : save(field.id, input))}
          onClose={() => setField(null)}
          onSaved={async () => {
            setField(null)
            refresh()
          }}
        />
      ) : null}
    </FieldsPanel>
  )
}
