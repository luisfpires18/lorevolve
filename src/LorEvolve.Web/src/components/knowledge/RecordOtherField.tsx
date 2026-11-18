import type { Dispatch, SetStateAction } from 'react'
import { EntityPicker } from '../EntityPicker'
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
    <>
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
      {errors.other ? (
        <p className="field__error" data-testid="knowledge-other-error">
          {errors.other}
        </p>
      ) : null}
    </>
  )
}
