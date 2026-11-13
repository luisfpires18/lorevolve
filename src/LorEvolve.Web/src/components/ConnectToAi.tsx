import { useEffect, useId, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Plug } from 'lucide-react'
import { ActionIcon } from './ActionIcon'
import { useI18n } from '../i18n'
import { getMcpConnectInfo, readable } from '../mcp/api'
import { useDrawerGuard } from '../lib/drawerGuard'
import { useReturnFocus } from '../lib/returnFocus'

type Load =
  | { kind: 'loading' }
  | { kind: 'ready'; url: string | null; name: string | null }
  | { kind: 'error' }

/**
 * Connect to AI (ADR 0046): an action on the universe's front page, opening a drawer with this universe's MCP URL to copy into an
 * AI app, how the connection is approved, what it can read, and where it is ended. Nothing is connected from here: an
 * app connects only once its user signs in to LorEvolve in the browser and approves it.
 */
export function ConnectToAi({
  universeId,
  universeName,
}: {
  universeId: string
  universeName: string
}) {
  const { t } = useI18n()
  const location = useLocation()
  // Open for one address only, as the Assistant's drawer is: following the Profile link closes it.
  const [openAt, setOpenAt] = useState<string | null>(null)
  const isOpen = openAt === location.key

  return (
    <>
      <button
        className="button button--secondary"
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpenAt(location.key)}
        data-testid="connect-ai-trigger"
      >
        <ActionIcon icon={Plug} />
        {t('assistant.connect.trigger')}
      </button>

      {isOpen ? (
        <ConnectDrawer
          universeId={universeId}
          universeName={universeName}
          onClose={() => setOpenAt(null)}
        />
      ) : null}
    </>
  )
}

function ConnectDrawer({
  universeId,
  universeName,
  onClose,
}: {
  universeId: string
  universeName: string
  onClose: () => void
}) {
  const { t } = useI18n()
  const dialog = useRef<HTMLDialogElement>(null)
  const headingId = useId()
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const { close, dialogProps } = useDrawerGuard(false, '', onClose)

  useReturnFocus()

  useEffect(() => {
    dialog.current?.showModal()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    getMcpConnectInfo(universeId, controller.signal)
      .then((info) =>
        setLoad({ kind: 'ready', url: info.mcpUrl, name: info.suggestedName ?? null }),
      )
      .catch(() => {
        if (!controller.signal.aborted) setLoad({ kind: 'error' })
      })
    return () => controller.abort()
  }, [universeId])

  return (
    <dialog
      className="drawer connectdrawer"
      ref={dialog}
      aria-labelledby={headingId}
      {...dialogProps}
      data-testid="connect-ai-drawer"
    >
      <div className="drawer__panel">
        <header className="drawer__head">
          <p className="drawer__eyebrow">{t('assistant.connect.eyebrow')}</p>
          <h2 className="drawer__title" id={headingId}>
            <bdi>{universeName}</bdi>
          </h2>
          <p className="drawer__context">{t('assistant.connect.context')}</p>
        </header>

        <div className="drawer__body connect__body">
          {load.kind === 'loading' ? (
            <p className="history__quiet" role="status">
              {t('assistant.connect.loading')}
            </p>
          ) : load.kind === 'error' ? (
            <p className="form__message" role="alert" data-testid="connect-ai-error">
              {t('assistant.connect.loadFailed')}
            </p>
          ) : load.url === null ? (
            <p className="history__quiet" data-testid="connect-ai-unavailable">
              {t('assistant.connect.unavailable')}
            </p>
          ) : (
            <ConnectSteps url={load.url} name={load.name} onFollow={onClose} />
          )}
        </div>

        <footer className="drawer__actions">
          <button
            className="button button--secondary"
            type="button"
            onClick={close}
            data-testid="connect-ai-close"
          >
            {t('assistant.connect.close')}
          </button>
        </footer>
      </div>
    </dialog>
  )
}

function ConnectSteps({
  url,
  name,
  onFollow,
}: {
  url: string
  name: string | null
  onFollow: () => void
}) {
  const { t, tx } = useI18n()
  const inputId = useId()
  const hintId = useId()
  const input = useRef<HTMLInputElement>(null)
  const [copied, setCopied] = useState<'idle' | 'copied' | 'manual'>('idle')

  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error('No clipboard')
      await navigator.clipboard.writeText(url)
      setCopied('copied')
    } catch {
      // The clipboard can be refused; the address is then selected for copying by hand.
      setCopied('manual')
      input.current?.focus()
      input.current?.select()
    }
  }

  return (
    <>
      <div className="connect__url">
        <label className="field__label" htmlFor={inputId}>
          {t('assistant.connect.urlLabel')}
        </label>
        <div className="connect__copyrow">
          <input
            ref={input}
            id={inputId}
            className="field__input connect__input"
            type="text"
            readOnly
            value={url}
            aria-describedby={hintId}
            onFocus={(event) => event.target.select()}
            data-testid="connect-ai-url"
          />
          <button
            className="button"
            type="button"
            onClick={() => void copy()}
            data-testid="connect-ai-copy"
          >
            {t('assistant.connect.copy')}
          </button>
        </div>
        <p className="connect__hint" id={hintId}>
          {t('assistant.connect.urlHint')}
        </p>
        <p className="connect__status" role="status" data-testid="connect-ai-copy-status">
          {copied === 'copied'
            ? t('assistant.connect.copied')
            : copied === 'manual'
              ? t('assistant.connect.copyManual')
              : ''}
        </p>
      </div>

      <section className="connect__section" aria-labelledby={`${inputId}-how`}>
        <h3 className="connect__heading" id={`${inputId}-how`}>
          {t('assistant.connect.how')}
        </h3>
        <ol className="connect__steps">
          <li>{t('assistant.connect.step1')}</li>
          <li>
            {t('assistant.connect.step2')}
            {name ? (
              <>
                {' '}
                {tx('assistant.connect.step2Name', {
                  name: <q data-testid="connect-ai-name">{name}</q>,
                })}
              </>
            ) : null}
          </li>
          <li>{t('assistant.connect.step3')}</li>
        </ol>
      </section>

      <section className="connect__section" aria-labelledby={`${inputId}-reads`}>
        <h3 className="connect__heading" id={`${inputId}-reads`}>
          {t('assistant.connect.reads')}
        </h3>
        <ul className="connect__list">
          {readable().map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="settings__note">{t('assistant.connect.readsNote')}</p>
        <p className="settings__note">{t('assistant.connect.privacyNote')}</p>
      </section>

      <p className="connect__manage">
        {tx('assistant.connect.manage', {
          link: (
            <Link
              to="/app/profile?tab=connected-apps#connected-apps"
              onClick={onFollow}
              data-testid="connect-ai-manage"
            >
              {t('assistant.connect.manageLink')}
            </Link>
          ),
        })}
      </p>
    </>
  )
}
