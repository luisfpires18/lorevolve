import type { Dispatch, SetStateAction } from 'react'
import { EntityPicker } from '../EntityPicker'
import { Field } from '../Field'
import { t } from '../../i18n'
import type { Draft, Side } from '../../knowledge/recordDraft'

/** The record's other entry: the knower or the subject, beside this entry shown fixed, and its error. */
export function RecordOtherField({
  universeId,
  entityId,
  entityName,
  side,
  draft,
  setDraft,
  errors,
}: {
  universeId: string
  entityId: string
  entityName: string
  side: Side
  draft: Draft
  setDraft: Dispatch<SetStateAction<Draft>>
  errors: Record<string, string>
}) {
  return (
    <Field
      group
      hideLabel
      className="field--flow"
      label={
        side === 'knows'
          ? t('ai.knowledge.form.whoKnowsFixed')
          : t('ai.knowledge.form.whoKnowsPicker')
      }
      error={errors.other}
      errorTestId="knowledge-other-error"
    >
      {(group) => (
        <div {...group} className="field__stack">
          {side === 'knows' ? (
            <>
              <p className="knowledge__fixedlabel">{t('ai.knowledge.form.whoKnowsFixed')}</p>
              <p className="knowledge__fixed" data-testid="knowledge-knower">
                <bdi>{entityName}</bdi>
              </p>
              <EntityPicker
                label={t('ai.knowledge.form.aboutOptional')}
                universeId={universeId}
                value={draft.other}
                onChange={(other) => setDraft((current) => ({ ...current, other }))}
                excludeId={entityId}
              />
            </>
          ) : (
            <>
              <EntityPicker
                label={t('ai.knowledge.form.whoKnowsPicker')}
                universeId={universeId}
                value={draft.other}
                onChange={(other) => setDraft((current) => ({ ...current, other }))}
                excludeId={entityId}
              />
              <p className="knowledge__fixedlabel">{t('ai.knowledge.form.aboutFixed')}</p>
              <p className="knowledge__fixed" data-testid="knowledge-subject">
                <bdi>{entityName}</bdi>
              </p>
            </>
          )}
        </div>
      )}
    </Field>
  )
}
