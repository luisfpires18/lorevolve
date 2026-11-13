import { useEffect, useId, useRef, useState } from 'react'
import { ApiError } from '../lib/api'
import { t, tx, useI18n } from '../i18n'
import { formatDate, formatDateTime } from '../lib/dates'
import {
  ConnectedAppStatus,
  disconnectApp,
  listConnectedApps,
  stopProposals,
  type ConnectedApp,
  type ConnectedAppStatusValue,
} from '../mcp/api'

type Load = { kind: 'loading' } | { kind: 'ready'; apps: ConnectedApp[] } | { kind: 'error' }

const STATUS_WORDS: Record<ConnectedAppStatusValue, string> = {
  get [ConnectedAppStatus.Active]() {
    return t('data.connectedApps.status.active')
  },
  get [ConnectedAppStatus.NoAccess]() {
    return t('data.connectedApps.status.noAccess')
  },
  get [ConnectedAppStatus.Expired]() {
    return t('data.connectedApps.status.expired')
  },
}

/**
 * Profile -> Connected apps (ADR 0046): the AI apps this account has let read a universe, one row per connection, each
 * disconnected on its own after a confirmation. Disconnecting ends that app's access at once; the LorEvolve session and the
 * other connections carry on. Nothing secret is ever shown, because the API never sends any.
 */
export function ConnectedApps() {
  const { t } = useI18n()
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [announcement, setAnnouncement] = useState('')
  const headingRef = useRef<HTMLHeadingElement>(null)

  function read(signal?: AbortSignal) {
    listConnectedApps(signal)
      .then((apps) => setLoad({ kind: 'ready', apps }))
      .catch(() => {
        if (!signal?.aborted) setLoad({ kind: 'error' })
      })
  }

  useEffect(() => {
    const controller = new AbortController()
    read(controller.signal)
    return () => controller.abort()
  }, [])

  // Arriving from Connect to AI's link lands on this section.
  useEffect(() => {
    if (load.kind === 'ready' && window.location.hash === '#connected-apps') {
      headingRef.current?.scrollIntoView({ block: 'start' })
    }
  }, [load.kind])

  function removed(app: ConnectedApp) {
    setLoad((current) =>
      current.kind === 'ready'
        ? { kind: 'ready', apps: current.apps.filter((one) => one.id !== app.id) }
        : current,
    )
    setAnnouncement(
      t('data.connectedApps.disconnectedAnnouncement', {
        client: app.clientName,
        universe: app.universeName,
      }),
    )
    headingRef.current?.focus()
  }

  return (
    <section
      className="profile__public connectedapps"
      id="connected-apps"
      aria-labelledby="profile-connected-heading"
      data-testid="connected-apps"
    >
      <h2
        className="profile__subtitle"
        id="profile-connected-heading"
        ref={headingRef}
        tabIndex={-1}
      >
        {t('data.connectedApps.title')}
      </h2>
      <p className="settings__note">{t('data.connectedApps.note')}</p>

      {load.kind === 'loading' ? (
        <p className="usage__status" role="status">
          {t('data.connectedApps.loading')}
        </p>
      ) : load.kind === 'error' ? (
        <div className="form__message" role="alert" data-testid="connected-apps-error">
          <p>{t('data.connectedApps.loadFailed')}</p>
          <button
            className="button button--secondary button--sm"
            type="button"
            onClick={() => read()}
          >
            {t('data.connectedApps.retry')}
          </button>
        </div>
      ) : load.apps.length === 0 ? (
        <p className="connectedapps__empty" data-testid="connected-apps-empty">
          {t('data.connectedApps.empty')}
        </p>
      ) : (
        <ul className="connectedapps__list">
          {load.apps.map((app) => (
            <ConnectedAppRow key={app.id} app={app} onRemoved={() => removed(app)} />
          ))}
        </ul>
      )}

      <p className="visually-hidden" role="status" data-testid="connected-apps-announcer">
        {announcement}
      </p>
    </section>
  )
}

function ConnectedAppRow({ app: listed, onRemoved }: { app: ConnectedApp; onRemoved: () => void }) {
  const { t } = useI18n()
  const [app, setApp] = useState(listed)
  const [stopping, setStopping] = useState(false)
  const [stopped, setStopped] = useState(false)
  const id = useId()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const confirm = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const wasConfirming = useRef(false)

  useEffect(() => {
    if (confirming) {
      wasConfirming.current = true
      confirm.current?.focus()
    } else if (wasConfirming.current) {
      wasConfirming.current = false
      button.current?.focus()
    }
  }, [confirming])

  async function disconnect() {
    setBusy(true)
    setError(null)
    try {
      await disconnectApp(app.id)
      onRemoved()
    } catch (problem: unknown) {
      // Already gone, disconnected in another tab, is what was asked for.
      if (problem instanceof ApiError && problem.status === 404) {
        onRemoved()
        return
      }
      setError(t('data.connectedApps.disconnectFailed'))
      setBusy(false)
    }
  }

  async function stop() {
    setStopping(true)
    setError(null)
    try {
      await stopProposals(app.id)
      setApp({ ...app, canPropose: false, canProposeSchema: false })
      setStopped(true)
    } catch {
      setError(t('data.connectedApps.readerFailed'))
    } finally {
      setStopping(false)
    }
  }

  return (
    <li className="connectedapps__row" data-testid="connected-app" data-status={app.status}>
      <div className="connectedapps__who">
        <p className="connectedapps__name">
          <bdi>{app.clientName}</bdi>
        </p>
        <p className="connectedapps__meta">
          {app.verifiedHost
            ? tx('data.connectedApps.publishedBy', { host: <bdi>{app.verifiedHost}</bdi> })
            : t('data.connectedApps.unverified')}
          {' · '}
          {app.canPropose ? t('data.connectedApps.creator') : t('data.connectedApps.reader')}
        </p>
        <p className="connectedapps__meta">
          {tx('data.connectedApps.reads', { universe: <bdi>{app.universeName}</bdi> })}
        </p>
        <p className="connectedapps__meta">
          {t('data.connectedApps.connectedOn', { date: formatDate(app.createdAt) })}
          {' · '}
          {app.lastUsedAt
            ? t('data.connectedApps.lastUsed', { date: formatDateTime(app.lastUsedAt) })
            : t('data.connectedApps.neverUsed')}
        </p>
        <p
          className={
            app.status === ConnectedAppStatus.Active
              ? 'connectedapps__status'
              : 'connectedapps__status connectedapps__status--off'
          }
          data-testid="connected-app-status"
        >
          {STATUS_WORDS[app.status]}
        </p>
      </div>
      <div className="connectedapps__controls">
        {app.canPropose ? (
          <button
            className="button button--secondary"
            type="button"
            onClick={() => void stop()}
            disabled={busy || stopping}
            aria-label={t('data.connectedApps.makeReaderLabel', {
              client: app.clientName,
              universe: app.universeName,
            })}
            data-testid="stop-app-proposals"
          >
            {stopping ? t('data.connectedApps.changing') : t('data.connectedApps.makeReader')}
          </button>
        ) : null}
        <button
          ref={button}
          className="button button--secondary button--danger-quiet"
          type="button"
          onClick={() => setConfirming(true)}
          disabled={busy || confirming}
          aria-label={t('data.connectedApps.disconnectLabel', {
            client: app.clientName,
            universe: app.universeName,
          })}
          data-testid="disconnect-app"
        >
          {t('data.connectedApps.disconnect')}
        </button>
      </div>
      {confirming ? (
        <div
          className="settings__confirm connectedapps__confirm"
          role="group"
          aria-labelledby={`${id}-confirm`}
          tabIndex={-1}
          ref={confirm}
          data-testid="disconnect-app-confirm"
        >
          <p className="settings__confirmtitle" id={`${id}-confirm`}>
            {tx('data.connectedApps.confirmTitle', {
              client: <bdi>{app.clientName}</bdi>,
              universe: <bdi>{app.universeName}</bdi>,
            })}
          </p>
          <p className="settings__note">{t('data.connectedApps.confirmNote')}</p>
          <div className="form__actions">
            <button
              className="button button--danger"
              type="button"
              onClick={() => void disconnect()}
              disabled={busy}
              data-testid="confirm-disconnect-app"
            >
              {busy ? t('data.connectedApps.disconnecting') : t('data.connectedApps.disconnect')}
            </button>
            <button
              className="button button--secondary"
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
            >
              {t('data.connectedApps.keep')}
            </button>
          </div>
        </div>
      ) : null}
      {stopped ? (
        <p className="connectedapps__meta" role="status" data-testid="app-proposals-stopped">
          {t('data.connectedApps.stopped')}
        </p>
      ) : null}
      {error ? (
        <p className="form__message connectedapps__error" role="alert">
          {error}
        </p>
      ) : null}
    </li>
  )
}
