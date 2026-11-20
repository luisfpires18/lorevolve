import { EntityPicker } from '../EntityPicker'
import { ValidationTermSelect } from '../ValidationTermSelect'
import { t, useI18n } from '../../i18n'
import { ValidationTermKind } from '../../ruleValidation/types'
import { useValidationTerms } from '../../ruleValidation/useValidationTerms'
import type { TimelineEntry } from '../../timeline/types'
import type { Dispatch, SetStateAction } from 'react'
import { DETAIL_ERROR_KEYS, type MomentDraft } from '../../timeline/momentDraft'
import { Button } from '../Button'
import { FormMessage } from '../FormMessage'
import { QuietNote } from '../QuietNote'

/** The folded validation details: the kind of event, the method and the one who took part. */
export function MomentDetails({
  universeId,
  entry,
  draft,
  edit,
  fieldErrors,
  detailsOpen,
  setDetailsOpen,
  detailCount,
  terms,
  termsFailed,
  addTerm,
  reloadTerms,
}: {
  universeId: string
  entry: TimelineEntry | null
  draft: MomentDraft
  edit: (change: Partial<MomentDraft>) => void
  fieldErrors: Record<string, string>
  detailsOpen: boolean
  setDetailsOpen: Dispatch<SetStateAction<boolean>>
  detailCount: number
  terms: ReturnType<typeof useValidationTerms>['terms']
  termsFailed: ReturnType<typeof useValidationTerms>['failed']
  addTerm: ReturnType<typeof useValidationTerms>['add']
  reloadTerms: ReturnType<typeof useValidationTerms>['reload']
}) {
  useI18n()
  return (
    <details
      className="moment__details"
      open={detailsOpen}
      onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
      data-testid="moment-validation"
    >
      <summary data-testid="moment-validation-toggle">
        {t('time.momentForm.details')}
        {detailCount > 0 ? (
          <span className="moment__detailscount">
            {' '}
            {t('time.momentForm.detailsSet', { n: detailCount })}
          </span>
        ) : (
          <span className="moment__detailscount"> {t('time.momentForm.detailsOptional')}</span>
        )}
      </summary>

      <div className="moment__detailsbody">
        <QuietNote spacing="flush">{t('time.momentForm.detailsHint')}</QuietNote>

        {termsFailed ? (
          <FormMessage>
            {t('time.momentForm.termsFailed')}{' '}
            <Button tone="secondary" size="sm" onClick={reloadTerms}>
              {t('time.momentForm.tryAgain')}
            </Button>
          </FormMessage>
        ) : null}

        <ValidationTermSelect
          universeId={universeId}
          kind={ValidationTermKind.EventKind}
          label={t('time.momentForm.eventKind')}
          terms={terms}
          value={draft.eventKindId}
          selectedName={
            entry?.validation?.eventKind?.id === draft.eventKindId
              ? entry.validation.eventKind.name
              : null
          }
          emptyLabel={t('time.momentForm.eventKindNone')}
          onChange={(eventKindId) => edit({ eventKindId })}
          onCreated={addTerm}
          error={fieldErrors[DETAIL_ERROR_KEYS.eventKind]}
          testId="moment-event-kind"
        />

        <ValidationTermSelect
          universeId={universeId}
          kind={ValidationTermKind.Method}
          label={t('time.momentForm.method')}
          terms={terms}
          value={draft.methodId}
          selectedName={
            entry?.validation?.method?.id === draft.methodId ? entry.validation.method.name : null
          }
          emptyLabel={t('time.momentForm.methodNone')}
          onChange={(methodId) => edit({ methodId })}
          onCreated={addTerm}
          error={fieldErrors[DETAIL_ERROR_KEYS.method]}
          testId="moment-method"
        />

        <EntityPicker
          label={t('time.momentForm.participant')}
          universeId={universeId}
          value={draft.participant}
          onChange={(participant) => edit({ participant })}
          placeholder={t('time.momentForm.participantPlaceholder')}
          error={fieldErrors[DETAIL_ERROR_KEYS.participant]}
        />
      </div>
    </details>
  )
}
