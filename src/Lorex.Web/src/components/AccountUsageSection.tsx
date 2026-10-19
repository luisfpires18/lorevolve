import { useEffect, useId, useState } from 'react'
import { getAssistantUsage } from '../assistant/api'
import type { AssistantUsage } from '../assistant/types'

const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })

type Load = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; usage: AssistantUsage }

/**
 * The Profile's Usage section: allowances that refill on their own, one indicator each. Today only the AI Assistant's
 * questions (ADR 0045); another indicator goes beside it as its own `usage__item`.
 *
 * The numbers are the server's own count, the same one that refuses a question, so nothing here is estimated. It is
 * read when the Profile opens, again when the tab comes back into view (a question may have been asked in another), and
 * once more when the current window ends - one timer, never polling.
 */
export function AccountUsageSection() {
  const headingId = useId()
  const assistantId = useId()
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    getAssistantUsage(controller.signal)
      .then((usage) => setLoad({ kind: 'ready', usage }))
      .catch(() => {
        // A refresh that fails keeps the numbers already shown; only a first read that fails says so.
        if (!controller.signal.aborted)
          setLoad((now) => (now.kind === 'ready' ? now : { kind: 'error' }))
      })

    return () => {
      controller.abort()
    }
  }, [reloadKey])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') setReloadKey((key) => key + 1)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const resetsAt = load.kind === 'ready' ? load.usage.resetsAt : null

  useEffect(() => {
    if (!resetsAt) return
    // A second past the end, so the server has certainly closed the window.
    const timer = window.setTimeout(
      () => setReloadKey((key) => key + 1),
      Math.max(0, new Date(resetsAt).getTime() - Date.now()) + 1000,
    )
    return () => {
      window.clearTimeout(timer)
    }
  }, [resetsAt])

  return (
    <section
      className="profile__public usage"
      aria-labelledby={headingId}
      aria-busy={load.kind === 'loading'}
      data-testid="profile-usage"
    >
      <h2 className="profile__subtitle" id={headingId}>
        Usage
      </h2>

      <div className="usage__item" data-testid="usage-assistant">
        <h3 className="usage__name" id={assistantId}>
          AI Assistant
        </h3>

        {load.kind === 'loading' ? (
          <p className="usage__status" role="status">
            Checking your usage…
          </p>
        ) : null}

        {load.kind === 'error' ? (
          <div
            className="notice notice--error usage__error"
            role="alert"
            data-testid="usage-assistant-error"
          >
            <p>Your usage didn't load.</p>
            <button
              className="button button--secondary"
              type="button"
              onClick={() => {
                setLoad({ kind: 'loading' })
                setReloadKey((key) => key + 1)
              }}
            >
              Try again
            </button>
          </div>
        ) : null}

        {load.kind === 'ready' ? <AssistantMeter usage={load.usage} labelId={assistantId} /> : null}
      </div>
    </section>
  )
}

function AssistantMeter({ usage, labelId }: { usage: AssistantUsage; labelId: string }) {
  const percent = Math.min(100, Math.round((usage.used / usage.limit) * 100))
  const full = usage.remaining <= 0
  const amount = `${usage.used} of ${usage.limit} questions used`
  const minutes = Math.round(usage.windowSeconds / 60)

  return (
    <>
      <p className="usage__amount">
        <span data-testid="usage-assistant-amount">{amount}</span>
        <span className="usage__percent" data-testid="usage-assistant-percent">
          {percent}%
        </span>
      </p>

      <div
        className="progressbar usage__meter"
        role="meter"
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${amount}, ${percent}%`}
        data-state={full ? 'full' : undefined}
        data-testid="usage-assistant-meter"
      >
        <span className="progressbar__fill" style={{ width: `${percent}%` }} />
      </div>

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
        You can ask {usage.limit} questions every {minutes} minutes, across all your universes. A
        question counts even when the answer fails. The {minutes} minutes start with your first
        question, and then all {usage.limit} come back at once.
      </p>
    </>
  )
}
