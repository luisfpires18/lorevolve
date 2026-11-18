import { t } from '../../i18n'
import { Field } from '../Field'
import type { TypeDraft } from '../../relationships/typeDraft'
import { KindFormCanon } from './KindFormCanon'
import { KindFormFamily } from './KindFormFamily'

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
      <Field
        label={t('relationships.types.readsAs')}
        name="reltype-name"
        placeholder={t('relationships.types.readsAsPlaceholder')}
        dir="auto"
        value={draft.name}
        onChange={(event) => edit({ name: event.target.value })}
        error={fieldErrors.name}
      />

      {draft.isSymmetric ? (
        <p className="settings__note">
          {t('relationships.types.bothRead', {
            name: draft.name.trim() || t('relationships.types.thisFallback'),
          })}
        </p>
      ) : (
        <Field
          label={t('relationships.types.readsAsOther')}
          name="reltype-inverse"
          placeholder={t('relationships.types.readsAsOtherPlaceholder')}
          dir="auto"
          value={draft.inverseName}
          onChange={(event) => edit({ inverseName: event.target.value })}
          error={fieldErrors.inversename}
        />
      )}

      <label className="check">
        <input
          type="checkbox"
          checked={draft.isSymmetric}
          onChange={(event) => edit({ isSymmetric: event.target.checked })}
          data-testid="reltype-symmetric"
        />
        <span>{t('relationships.types.symmetric')}</span>
      </label>

      <Field
        label={t('relationships.types.description')}
        name="reltype-description"
        placeholder={t('relationships.types.optional')}
        value={draft.description}
        onChange={(event) => edit({ description: event.target.value })}
        error={fieldErrors.description}
      />

      <KindFormCanon draft={draft} edit={edit} fieldErrors={fieldErrors} orderError={orderError} />

      <KindFormFamily draft={draft} edit={edit} fieldErrors={fieldErrors} />

      <div className="relform__actions">
        <button
          className="button"
          type="button"
          onClick={save}
          disabled={isSaving}
          data-testid="save-relationship-type"
        >
          {isSaving
            ? editingId
              ? t('relationships.types.saving')
              : t('relationships.types.adding')
            : editingId
              ? t('relationships.types.saveKind')
              : t('relationships.types.addKindSubmit')}
        </button>
        <button className="button button--secondary" type="button" onClick={close}>
          {t('relationships.types.cancel')}
        </button>
      </div>
    </div>
  )
}
