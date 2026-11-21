import { useCallback } from 'react'
import { t, tx, useI18n } from '../../i18n'
import { useAsyncRead } from '../../lib/useAsyncRead'
import { getWorldRule } from '../../worldRules/api'
import { Callout } from '../Callout'
import { DateText } from '../DateText'
import { DocumentHead } from '../DocumentHead'
import { EmptyState } from '../EmptyState'
import { ReadGate } from '../ReadGate'

/** One world rule as text, for a collaborator who reads but does not edit (ADR 0041 amendment). */
export function WorldRuleReading({
  universeId,
  ruleId,
  listPath,
}: {
  universeId: string
  ruleId: string
  listPath: string
}) {
  useI18n() // re-renders when the language changes
  const read = useCallback(
    (signal: AbortSignal) => getWorldRule(universeId, ruleId, signal),
    [universeId, ruleId],
  )
  const { load: state, retry } = useAsyncRead(read, {
    missing: true,
    failed: t('canon.rule.readFailed'),
  })

  return (
    <article className="rule" data-testid="world-rule-reading">
      <DocumentHead
        back={{ to: listPath, label: t('canon.rule.back'), testId: 'world-rule-back' }}
        title={state.kind === 'ready' ? <bdi>{state.value.title}</bdi> : t('canon.rule.heading')}
        titleTestId="world-rule-heading"
      />
      <ReadGate
        load={state}
        loading={{ text: t('canon.rule.opening') }}
        error={{ onRetry: retry, retryLabel: t('canon.rule.retry') }}
        missing={<EmptyState title={t('canon.rule.missing')} testId="world-rule-missing" />}
      >
        {(rule) => (
          <>
            {rule.description ? (
              <p className="rule__reading prose" data-testid="world-rule-text">
                {rule.description}
              </p>
            ) : (
              <Callout look="notice" as="p">
                {t('canon.rule.noDescription')}
              </Callout>
            )}
            <p className="rule__meta">
              {tx('canon.rule.lastChanged', { date: <DateText value={rule.updatedAt} /> })}
            </p>
          </>
        )}
      </ReadGate>
    </article>
  )
}
