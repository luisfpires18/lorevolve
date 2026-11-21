import { Field } from '../Field'
import { useI18n } from '../../i18n'
import type { EraChoice } from '../RelationshipPeriodsField'
import type { Chronology } from '../../chronology/types'
import { labelChoices, type RelationshipType } from '../../relationships/types'
import type { useUniverseAccess } from '../../universes/access'
import { labelFor, type RelationDraft } from '../../relationships/relationDraft'
import type { useRelationsState } from '../../relationships/useRelationsState'
import { RelationFormFields } from './RelationFormFields'
import { RelationFormPeriods } from './RelationFormPeriods'
import { RelationPreview } from './RelationPreview'
import { FormActions } from '../FormActions'

export function RelationForm({
  draft,
  types,
  entityName,
  entityId,
  universeId,
  chronology,
  access,
  fieldErrors,
  choices,
  readingValue,
  eraChoices,
  ends,
  erasOf,
  isSaving,
  editingId,
  save,
  mayDiscard,
  close,
  edit,
}: {
  draft: RelationDraft
  types: RelationshipType[]
  entityName: string
  entityId: string
  universeId: string
  chronology: Chronology
  access: ReturnType<typeof useUniverseAccess>
  fieldErrors: Record<string, string>
  choices: ReturnType<typeof labelChoices>
  readingValue: string
  eraChoices: EraChoice[]
  ends: string[]
  erasOf: ReturnType<typeof useRelationsState>['erasOf']
  isSaving: boolean
  editingId: string | null
  save: () => Promise<void>
  mayDiscard: () => Promise<boolean>
  close: () => void
  edit: (change: Partial<RelationDraft>) => void
}) {
  const { t } = useI18n()

  return (
    <div className="relform" data-testid="relationship-form">
      <RelationPreview
        subject={entityName || t('relationships.section.thisEntryCap')}
        verb={labelFor(types, draft.typeId, draft.useInverse)}
        object={draft.related?.name ?? '…'}
        testId="relationship-preview"
        isolate={false}
      />

      <RelationFormFields
        draft={draft}
        fieldErrors={fieldErrors}
        choices={choices}
        readingValue={readingValue}
        edit={edit}
        universeId={universeId}
        entityId={entityId}
        access={access}
        chronology={chronology}
      />

      <RelationFormPeriods
        chronology={chronology}
        eraChoices={eraChoices}
        ends={ends}
        erasOf={erasOf}
        draft={draft}
        edit={edit}
        fieldErrors={fieldErrors}
      />

      <Field
        as="textarea"
        label={t('relationships.section.notes')}
        id="relation-notes"
        error={fieldErrors.notes}
        rows={2}
        placeholder={t('relationships.section.notesPlaceholder')}
        value={draft.notes}
        onChange={(event) => edit({ notes: event.target.value })}
        data-testid="relation-notes"
      />

      <FormActions
        submitLabel={
          editingId ? t('relationships.section.save') : t('relationships.section.addSubmit')
        }
        busy={isSaving}
        busyLabel={
          editingId ? t('relationships.section.saving') : t('relationships.section.adding')
        }
        onSubmit={save}
        submitTestId="save-relationship"
        onCancel={() => {
          void mayDiscard().then((discarding) => discarding && close())
        }}
        inline
      />
    </div>
  )
}
