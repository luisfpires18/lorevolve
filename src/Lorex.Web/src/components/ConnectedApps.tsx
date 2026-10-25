import { useEffect, useId, useRef, useState } from 'react'
import { ApiError } from '../lib/api'
import { formatDate, formatDateTime } from '../lib/dates'
import {
  ConnectedAppStatus,
  disconnectApp,
  listConnectedApps,
  stopProposals,
  stopSchemaProposals,
  type ConnectedApp,
  type ConnectedAppStatusValue,
} from '../mcp/api'

type Load = { kind: 'loading' } | { kind: 'ready'; apps: ConnectedApp[] } | { kind: 'error' }

const STATUS_WORDS: Record<ConnectedAppStatusValue, string> = {
  [ConnectedAppStatus.Active]: 'Connected',
  [ConnectedAppStatus.NoAccess]: 'No access: you’re no longer a member of this universe',
  [ConnectedAppStatus.Expired]: 'Needs reconnecting: connect it again from the app to use it',
}

/**
 * Profile -> Connected apps (ADR 0046): the AI apps this account has let read a universe, one row per connection, each
 * disconnected on its own after a confirmation. Disconnecting ends that app's access at once; the LoreX session and the
 * other connections carry on. Nothing secret is ever shown, because the API never sends any.
 */
export function ConnectedApps() {
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
    setAnnouncement(`${app.clientName} is disconnected from ${app.universeName}.`)
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
        Connected apps
      </h2>
      <p className="settings__note">
        AI apps you&rsquo;ve allowed to read a universe. Each one reads only that universe, with
        your access, and can&rsquo;t change anything.
      </p>

      {load.kind === 'loading' ? (
        <p className="usage__status" role="status">
          Loading your connected apps&hellip;
        </p>
      ) : load.kind === 'error' ? (
        <div className="form__message" role="alert" data-testid="connected-apps-error">
          <p>Your connected apps couldn&rsquo;t be loaded.</p>
          <button
            className="button button--secondary button--sm"
            type="button"
            onClick={() => read()}
          >
            Try again
          </button>
        </div>
      ) : load.apps.length === 0 ? (
        <p className="connectedapps__empty" data-testid="connected-apps-empty">
          No apps are connected. To connect one, open a universe and choose Connect to AI.
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
  const [app, setApp] = useState(listed)
  const [stopping, setStopping] = useState(false)
  const [stopped, setStopped] = useState(false)
  const [stoppingSchema, setStoppingSchema] = useState(false)
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
      setError('The app couldn’t be disconnected. Try again.')
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
      setError('Proposals couldn’t be turned off. Try again.')
    } finally {
      setStopping(false)
    }
  }

  async function stopSchema() {
    setStoppingSchema(true)
    setError(null)
    try {
      await stopSchemaProposals(app.id)
      setApp({ ...app, canProposeSchema: false })
    } catch {
      setError('Schema proposals couldn’t be turned off. Try again.')
    } finally {
      setStoppingSchema(false)
    }
  }

  return (
    <li className="connectedapps__row" data-testid="connected-app" data-status={app.status}>
      <div className="connectedapps__who">
        <p className="connectedapps__name">
          <bdi>{app.clientName}</bdi>
        </p>
        <p className="connectedapps__meta">
          {app.verifiedHost ? (
            <>
              Published by <bdi>{app.verifiedHost}</bdi>
            </>
          ) : (
            'Unverified app'
          )}
          {' · '}
          {app.canProposeSchema
            ? 'Reads, and can propose changes, types, fields and groups for review'
            : app.canPropose
              ? 'Reads, and can propose changes for review'
              : 'Read-only'}
        </p>
        <p className="connectedapps__meta">
          Reads <bdi>{app.universeName}</bdi>
        </p>
        <p className="connectedapps__meta">
          Connected {formatDate(app.createdAt)}
          {' · '}
          {app.lastUsedAt ? `Last used ${formatDateTime(app.lastUsedAt)}` : 'Not used yet'}
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
        {app.canProposeSchema ? (
          <button
            className="button button--secondary"
            type="button"
            onClick={() => void stopSchema()}
            disabled={busy || stopping || stoppingSchema}
            aria-label={`Stop ${app.clientName} proposing types, fields and groups to ${app.universeName}`}
            data-testid="stop-app-schema"
          >
            {stoppingSchema ? 'Stopping' : 'Stop schema proposals'}
          </button>
        ) : null}
        {app.canPropose ? (
          <button
            className="button button--secondary"
            type="button"
            onClick={() => void stop()}
            disabled={busy || stopping}
            aria-label={`Stop ${app.clientName} proposing changes to ${app.universeName}`}
            data-testid="stop-app-proposals"
          >
            {stopping ? 'Stopping' : 'Stop proposals'}
          </button>
        ) : null}
        <button
          ref={button}
          className="button button--secondary button--danger-quiet"
          type="button"
          onClick={() => setConfirming(true)}
          disabled={busy || confirming}
          aria-label={`Disconnect ${app.clientName} from ${app.universeName}`}
          data-testid="disconnect-app"
        >
          Disconnect
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
            Disconnect <bdi>{app.clientName}</bdi> from <bdi>{app.universeName}</bdi>?
          </p>
          <p className="settings__note">
            The app loses access straight away. You stay signed in to LoreX, and your other
            connections keep working. You can connect it again later.
          </p>
          <div className="form__actions">
            <button
              className="button button--danger"
              type="button"
              onClick={() => void disconnect()}
              disabled={busy}
              data-testid="confirm-disconnect-app"
            >
              {busy ? 'Disconnecting' : 'Disconnect'}
            </button>
            <button
              className="button button--secondary"
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
            >
              Keep
            </button>
          </div>
        </div>
      ) : null}
      {stopped ? (
        <p className="connectedapps__meta" role="status" data-testid="app-proposals-stopped">
          It can&rsquo;t propose changes any more, and can still read. What it already proposed can
          only be rejected.
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
