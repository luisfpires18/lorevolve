import { useEffect, useId } from 'react'
import { getAssistantUsage } from '../assistant/api'
import type { AssistantKindUsage } from '../assistant/types'
import { useUsageLoad } from '../lib/useUsageLoad'
import { UsageItem, UsageMeter } from './UsageItem'

const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })

/**
 * The AI Assistant's allowance in the Profile's Usage section (ADR 0045): questions and change requests, each counted
 * apart.
 *
 * The numbers are the server's own count, the same one that refuses a question, so nothing here is estimated. It is
 * read when the Profile opens, again when the tab comes back into view (a question may have been asked in another), and
 * once more when the sooner window ends - one timer, never polling.
 */
export function AssistantUsage() {
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
    <UsageItem name="AI Assistant" testId="usage-assistant" load={load} onRetry={retry}>
      {(usage) => {
        const minutes = Math.round(usage.windowSeconds / 60)

        return (
          <>
            <KindUsage
              name="Questions"
              testId="usage-assistant"
              usage={usage.ask}
              noun={['question', 'questions']}
            />
            <KindUsage
              name="Change requests"
              testId="usage-assistant-propose"
              usage={usage.propose}
              noun={['change request', 'change requests']}
            />

            <p className="settings__note">
              Each hour you can ask {usage.ask.limit} questions and send {usage.propose.limit}{' '}
              change requests, across all your universes. One counts even when the answer fails. The{' '}
              {minutes} minutes start with your first one, and then they all come back at once.
            </p>
          </>
        )
      }}
    </UsageItem>
  )
}

function KindUsage({
  name,
  testId,
  usage,
  noun,
}: {
  name: string
  testId: string
  usage: AssistantKindUsage
  noun: [string, string]
}) {
  const labelId = useId()
  const full = usage.remaining <= 0

  return (
    <div className="usage__kind">
      <h4 className="usage__kind-name" id={labelId}>
        {name}
      </h4>
      <UsageMeter
        labelId={labelId}
        testId={testId}
        amount={`${usage.used} of ${usage.limit} ${noun[1]} used`}
        used={usage.used}
        limit={usage.limit}
        full={full}
      />

      {full ? (
        <p className="usage__full" data-testid={`${testId}-left`}>
          No {noun[1]} left.
          {usage.resetsAt
            ? ` You can ask again at ${timeFormatter.format(new Date(usage.resetsAt))}.`
            : null}
        </p>
      ) : (
        <p className="usage__left" data-testid={`${testId}-left`}>
          {usage.remaining === 1 ? `1 ${noun[0]} left` : `${usage.remaining} ${noun[1]} left`}
        </p>
      )}
    </div>
  )
}
