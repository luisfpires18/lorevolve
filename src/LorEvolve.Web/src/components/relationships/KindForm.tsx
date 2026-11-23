import { t } from '../../i18n'
import { Field } from '../Field'
import type { TypeDraft } from '../../relationships/typeDraft'
import { KindFormCanon } from './KindFormCanon'
import { KindFormFamily } from './KindFormFamily'
import { FormActions } from '../FormActions'
import { KindFields } from '../KindFields'

export function KindForm({
  draft,
  edit,
  fieldErrors,
  orderError,
  isSaving,
  editingId,
  save,
  close,
}: {
  draft: TypeDraft
  edit: (change: Partial<TypeDraft>) => void
  fieldErrors: Record<string, string>
  orderError: string | undefined
  isSaving: boolean
  editingId: string | null
  save: () => Promise<void>
  close: () => void
}) {
  return (
    <div className="reltype__form" data-testid="relationship-type-form">
      <KindFields
        draft={draft}
        edit={edit}
        fieldErrors={fieldErrors}
        idPrefix="reltype"
        words={{
          name: t('relationships.types.readsAs'),
          inverse: t('relationships.types.readsAsOther'),
          symmetric: t('relationships.types.symmetric'),
        }}
        bothWays={t('relationships.types.bothRead', {
          name: draft.name.trim() || t('relationships.types.thisFallback'),
        })}
        bothWaysSpacing="block"
      />

      <Field
        label={t('relationships.types.description')}
        name="reltype-description"
        value={draft.description}
        onChange={(event) => edit({ description: event.target.value })}
        error={fieldErrors.description}
      />

      <KindFormCanon draft={draft} edit={edit} fieldErrors={fieldErrors} orderError={orderError} />

      <KindFormFamily draft={draft} edit={edit} fieldErrors={fieldErrors} />

      <FormActions
        submitLabel={
          editingId ? t('relationships.types.saveKind') : t('relationships.types.addKindSubmit')
        }
        busy={isSaving}
        busyLabel={editingId ? t('relationships.types.saving') : t('relationships.types.adding')}
        onSubmit={save}
        submitTestId="save-relationship-type"
        onCancel={close}
        inline
      />
    </div>
  )
}
