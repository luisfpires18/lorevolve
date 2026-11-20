import { Field } from '../Field'
import { useI18n } from '../../i18n'
import { EntityPicker } from '../EntityPicker'
import type { Chronology } from '../../chronology/types'
import { labelChoices } from '../../relationships/types'
import { CanonStatusPicker } from '../CanonStatusPicker'
import type { useUniverseAccess } from '../../universes/access'
import type { RelationDraft } from '../../relationships/relationDraft'

export function RelationFormFields({
  draft,
  fieldErrors,
  choices,
  readingValue,
  edit,
  universeId,
  entityId,
  access,
  chronology,
}: {
  draft: RelationDraft
  fieldErrors: Record<string, string>
  choices: ReturnType<typeof labelChoices>
  readingValue: string
  edit: (change: Partial<RelationDraft>) => void
  universeId: string
  entityId: string
  access: ReturnType<typeof useUniverseAccess>
  chronology: Chronology
}) {
  const { t } = useI18n()

  return (
    <div className="relform__grid">
      <Field
        label={t('relationships.section.reading')}
        id="relation-reading"
        error={fieldErrors.relationshiptypeid}
      >
        {(control) => (
          <select
            {...control}
            className="field__input field__input--select"
            value={readingValue}
            onChange={(event) => {
              const chosen = choices.find((choice) => choice.key === event.target.value)
              if (chosen) {
                edit({ typeId: chosen.typeId, useInverse: chosen.useInverse })
              }
            }}
            data-testid="relationship-reading"
          >
            {choices.map((choice) => (
              <option key={choice.key} value={choice.key}>
                {choice.label}
              </option>
            ))}
          </select>
        )}
      </Field>

      <EntityPicker
        label={t('relationships.section.connectedTo')}
        universeId={universeId}
        value={draft.related}
        onChange={(related) => edit({ related })}
        excludeId={entityId}
        error={fieldErrors.targetentityid ?? fieldErrors.sourceentityid}
        // The form only opens for someone who may edit content, which is who may create Lore. Any type: a relation's
        // other end has no limit of its own.
        quickCreate={
          access.editContent ? { chronology, keepHint: t('relationships.section.keepHint') } : null
        }
      />

      <CanonStatusPicker
        field={{ label: t('relationships.section.status') }}
        optionTestId="relation-canon-"
        value={draft.canonStatus}
        onChange={(canonStatus) => edit({ canonStatus })}
      />
    </div>
  )
}
