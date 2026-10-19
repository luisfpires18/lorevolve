import { useEffect } from 'react'
import { getAssistantUsage } from '../assistant/api'
import { useUsageLoad } from '../lib/useUsageLoad'
import { UsageItem, UsageMeter } from './UsageItem'

const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })

/**
 * The AI Assistant's questions in the Profile's Usage section (ADR 0045).
 *
 * The numbers are the server's own count, the same one that refuses a question, so nothing here is estimated. It is
 * read when the Profile opens, again when the tab comes back into view (a question may have been asked in another), and
 * once more when the current window ends - one timer, never polling.
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

  const resetsAt = load.kind === 'ready' ? load.value.resetsAt : null

  useEffect(() => {
    if (!resetsAt) return
    // A second past the end, so the server has certainly closed the window.
    const timer = window.setTimeout(
      refresh,
      Math.max(0, new Date(resetsAt).getTime() - Date.now()) + 1000,
    )
    return () => {
      window.clearTimeout(timer)
    }
  }, [resetsAt, refresh])

  return (
    <UsageItem name="AI Assistant" testId="usage-assistant" load={load} onRetry={retry}>
      {(usage, labelId) => {
        const full = usage.remaining <= 0
        const minutes = Math.round(usage.windowSeconds / 60)

        return (
          <>
            <UsageMeter
              labelId={labelId}
              testId="usage-assistant"
              amount={`${usage.used} of ${usage.limit} questions used`}
              used={usage.used}
              limit={usage.limit}
              full={full}
            />

            {full ? (
              <p className="usage__full" data-testid="usage-assistant-left">
                No questions left.
                {usage.resetsAt
                  ? ` You can ask again at ${timeFormatter.format(new Date(usage.resetsAt))}.`
                  : null}
              </p>
            ) : (
              <p className="usage__left" data-testid="usage-assistant-left">
                {usage.remaining === 1 ? '1 question left' : `${usage.remaining} questions left`}
              </p>
            )}

            <p className="settings__note">
              You can ask {usage.limit} questions every {minutes} minutes, across all your
              universes. A question counts even when the answer fails. The {minutes} minutes start
              with your first question, and then all {usage.limit} come back at once.
            </p>
          </>
        )
      }}
    </UsageItem>
  )
}
