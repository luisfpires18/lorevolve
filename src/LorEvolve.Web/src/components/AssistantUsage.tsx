import { useEffect, useId } from 'react'
import { getAssistantUsage } from '../assistant/api'
import type { AssistantKindUsage } from '../assistant/types'
import { useUsageLoad } from '../lib/useUsageLoad'
import { UsageItem, UsageMeter } from './UsageItem'
import { dateFormat } from '../i18n/format'
import { useI18n } from '../i18n'

const TIME: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }

/**
 * The AI Assistant's allowance in the Profile's Usage section (ADR 0045): questions and change requests, each counted
 * apart.
 *
 * The numbers are the server's own count, the same one that refuses a question, so nothing here is estimated. It is
 * read when the Profile opens, again when the tab comes back into view (a question may have been asked in another), and
 * once more when the sooner window ends - one timer, never polling.
 */
export function AssistantUsage() {
  const { t } = useI18n()
  const { load, refresh, retry } = useUsageLoad(getAssistantUsage)

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  const resets =
    load.kind === 'ready'
      ? [load.value.ask.resetsAt, load.value.propose.resetsAt]
          .filter((at): at is string => at !== null)
          .map((at) => new Date(at).getTime())
      : []
  const resetsAt = resets.length > 0 ? Math.min(...resets) : null

  useEffect(() => {
    if (resetsAt === null) return
    // A second past the end, so the server has certainly closed the window.
    const timer = window.setTimeout(refresh, Math.max(0, resetsAt - Date.now()) + 1000)
    return () => {
      window.clearTimeout(timer)
    }
  }, [resetsAt, refresh])

  return (
    <UsageItem
      name={t('account.assistant.name')}
      testId="usage-assistant"
      load={load}
      onRetry={retry}
    >
      {(usage) => {
        const minutes = Math.round(usage.windowSeconds / 60)

        return (
          <>
            <KindUsage kind="ask" testId="usage-assistant" usage={usage.ask} />
            <KindUsage kind="propose" testId="usage-assistant-propose" usage={usage.propose} />

            <p className="settings__note">
              {t('account.assistant.note', {
                ask: usage.ask.limit,
                propose: usage.propose.limit,
                minutes,
              })}
            </p>
          </>
        )
      }}
    </UsageItem>
  )
}

function KindUsage({
  kind,
  testId,
  usage,
}: {
  kind: 'ask' | 'propose'
  testId: string
  usage: AssistantKindUsage
}) {
  const { t, tn } = useI18n()
  const labelId = useId()
  const full = usage.remaining <= 0
  const time = usage.resetsAt ? dateFormat(TIME).format(new Date(usage.resetsAt)) : null
  const words =
    kind === 'ask'
      ? {
          name: t('account.assistant.ask.name'),
          amount: t('account.assistant.ask.amount', { used: usage.used, limit: usage.limit }),
          none:
            time === null
              ? t('account.assistant.ask.none')
              : t('account.assistant.ask.noneAgain', { time }),
          left: tn('account.assistant.ask.left', usage.remaining, { n: usage.remaining }),
        }
      : {
          name: t('account.assistant.propose.name'),
          amount: t('account.assistant.propose.amount', { used: usage.used, limit: usage.limit }),
          none:
            time === null
              ? t('account.assistant.propose.none')
              : t('account.assistant.propose.noneAgain', { time }),
          left: tn('account.assistant.propose.left', usage.remaining, { n: usage.remaining }),
        }

  return (
    <div className="usage__kind">
      <h4 className="usage__kind-name" id={labelId}>
        {words.name}
      </h4>
      <UsageMeter
        labelId={labelId}
        testId={testId}
        amount={words.amount}
        used={usage.used}
        limit={usage.limit}
        full={full}
      />

      {full ? (
        <p className="usage__full" data-testid={`${testId}-left`}>
          {words.none}
        </p>
      ) : (
        <p className="usage__left" data-testid={`${testId}-left`}>
          {words.left}
        </p>
      )}
    </div>
  )
}
