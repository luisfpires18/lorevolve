import { useEffect, useRef, useState } from 'react'
import { quietlyGone } from '../lib/errorText'
import { useConfirmFocus } from '../lib/useConfirmFocus'
import { useFormSave } from '../lib/useFormSave'
import { t, tx, useI18n } from '../i18n'
import {
  ConnectedAppStatus,
  disconnectApp,
  listConnectedApps,
  stopProposals,
  type ConnectedApp,
  type ConnectedAppStatusValue,
} from '../mcp/api'
import { Button } from './Button'
import { ManageRow } from './ManageRow'
import { Section } from './Section'
import { Announce } from './Announce'
import { QuietNote } from './QuietNote'
import { useAsyncRead } from '../lib/useAsyncRead'
import { ReadGate } from './ReadGate'
import { DateText } from './DateText'

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
  const { load, setLoad, retry } = useAsyncRead(listConnectedApps)
  const [announcement, setAnnouncement] = useState('')
  const headingRef = useRef<HTMLHeadingElement>(null)

  // Arriving from Connect to AI's link lands on this section.
  useEffect(() => {
    if (load.kind === 'ready' && window.location.hash === '#connected-apps') {
      headingRef.current?.scrollIntoView({ block: 'start' })
    }
  }, [load.kind])

  function removed(app: ConnectedApp) {
    setLoad((current) =>
      current.kind === 'ready'
        ? { kind: 'ready', value: current.value.filter((one) => one.id !== app.id) }
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
    <Section
      className="connectedapps"
      id="connected-apps"
      title={t('data.connectedApps.title')}
      titleId="profile-connected-heading"
      titleProps={{ ref: headingRef, tabIndex: -1 }}
      testId="connected-apps"
    >
      <QuietNote spacing="block">{t('data.connectedApps.note')}</QuietNote>

      <ReadGate
        load={load}
        loading={{ text: t('data.connectedApps.loading'), className: 'usage__status' }}
        error={{
          message: t('data.connectedApps.loadFailed'),
          onRetry: retry,
          retryLabel: t('data.connectedApps.retry'),
          retrySize: 'sm',
          testId: 'connected-apps-error',
        }}
      >
        {(apps) =>
          apps.length === 0 ? (
            <QuietNote className="connectedapps__empty" size="ui" testId="connected-apps-empty">
              {t('data.connectedApps.empty')}
            </QuietNote>
          ) : (
            <ul className="connectedapps__list">
              {apps.map((app) => (
                <ConnectedAppRow key={app.id} app={app} onRemoved={() => removed(app)} />
              ))}
            </ul>
          )
        }
      </ReadGate>

      <Announce testId="connected-apps-announcer">{announcement}</Announce>
    </Section>
  )
}

function ConnectedAppRow({ app: listed, onRemoved }: { app: ConnectedApp; onRemoved: () => void }) {
  const { t } = useI18n()
  const [app, setApp] = useState(listed)
  const [stopped, setStopped] = useState(false)
  const [confirming, setConfirming] = useState(false)
  // Two saves with their own busy state that may overlap. The row shows one error, as one shared line did: starting
  // either clears it, and the save that failed last is the one shown.
  const [failedLast, setFailedLast] = useState<'removal' | 'reader'>('removal')
  const removal = useFormSave({
    needChange: null,
    failed: '',
    refusal: () => {
      setFailedLast('removal')
      return t('data.connectedApps.disconnectFailed')
    },
  })
  const reader = useFormSave({
    needChange: null,
    failed: '',
    refusal: () => {
      setFailedLast('reader')
      return t('data.connectedApps.readerFailed')
    },
  })
  const busy = removal.isSaving
  const stopping = reader.isSaving
  const confirm = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  useConfirmFocus(confirming, confirm, button)

  function disconnect() {
    reader.setMessage(null)
    return removal.save(async () => {
      try {
        await disconnectApp(app.id)
      } catch (problem: unknown) {
        // Already gone, disconnected in another tab, is what was asked for.
        if (!quietlyGone(problem)) throw problem
      }
      onRemoved()
    })
  }

  function stop() {
    removal.setMessage(null)
    return reader.save(async () => {
      await stopProposals(app.id)
      setApp({ ...app, canPropose: false, canProposeSchema: false })
      setStopped(true)
    })
  }

  return (
    <ManageRow
      flush
      start
      testId="connected-app"
      data={{ 'data-status': app.status }}
      whoClassName="connectedapps__who"
      name={app.clientName}
      meta={
        <>
          <QuietNote className="managerow__meta" wrap>
            {app.verifiedHost
              ? tx('data.connectedApps.publishedBy', { host: <bdi>{app.verifiedHost}</bdi> })
              : t('data.connectedApps.unverified')}
            {' · '}
            {app.canPropose ? t('data.connectedApps.creator') : t('data.connectedApps.reader')}
          </QuietNote>
          <QuietNote className="managerow__meta" wrap>
            {tx('data.connectedApps.reads', { universe: <bdi>{app.universeName}</bdi> })}
          </QuietNote>
          <QuietNote className="managerow__meta" wrap>
            {tx('data.connectedApps.connectedOn', { date: <DateText value={app.createdAt} /> })}
            {' · '}
            {app.lastUsedAt
              ? tx('data.connectedApps.lastUsed', {
                  date: <DateText value={app.lastUsedAt} withTime />,
                })
              : t('data.connectedApps.neverUsed')}
          </QuietNote>
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
        </>
      }
      controlsClassName="connectedapps__controls"
      controls={
        <>
          {app.canPropose ? (
            <Button
              tone="secondary"
              onClick={() => void stop()}
              disabled={busy || stopping}
              aria-label={t('data.connectedApps.makeReaderLabel', {
                client: app.clientName,
                universe: app.universeName,
              })}
              data-testid="stop-app-proposals"
            >
              {stopping ? t('data.connectedApps.changing') : t('data.connectedApps.makeReader')}
            </Button>
          ) : null}
          <Button
            tone="danger-quiet"
            ref={button}
            onClick={() => setConfirming(true)}
            disabled={busy || confirming}
            aria-label={t('data.connectedApps.disconnectLabel', {
              client: app.clientName,
              universe: app.universeName,
            })}
            data-testid="disconnect-app"
          >
            {t('data.connectedApps.disconnect')}
          </Button>
        </>
      }
      remove={
        confirming
          ? {
              className: 'connectedapps__confirm',
              title: tx('data.connectedApps.confirmTitle', {
                client: <bdi>{app.clientName}</bdi>,
                universe: <bdi>{app.universeName}</bdi>,
              }),
              note: t('data.connectedApps.confirmNote'),
              submitLabel: t('data.connectedApps.disconnect'),
              busyLabel: t('data.connectedApps.disconnecting'),
              keepLabel: t('data.connectedApps.keep'),
              busy,
              onConfirm: () => void disconnect(),
              onKeep: () => setConfirming(false),
              panelRef: confirm,
              testId: 'disconnect-app-confirm',
              submitTestId: 'confirm-disconnect-app',
            }
          : null
      }
      error={failedLast === 'reader' ? reader.message : removal.message}
      errorClassName="connectedapps__error"
    >
      {stopped ? (
        <QuietNote className="managerow__meta" wrap role="status" testId="app-proposals-stopped">
          {t('data.connectedApps.stopped')}
        </QuietNote>
      ) : null}
    </ManageRow>
  )
}
