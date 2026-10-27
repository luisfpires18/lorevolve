import { useEffect, useId, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Plug } from 'lucide-react'
import { ActionIcon } from './ActionIcon'
import { getMcpConnectInfo, READABLE } from '../mcp/api'
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
        Connect to AI
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
          <p className="drawer__eyebrow">Connect to AI</p>
          <h2 className="drawer__title" id={headingId}>
            <bdi>{universeName}</bdi>
          </h2>
          <p className="drawer__context">
            Let an AI app such as Claude or ChatGPT read this universe. It can&rsquo;t change
            anything.
          </p>
        </header>

        <div className="drawer__body connect__body">
          {load.kind === 'loading' ? (
            <p className="history__quiet" role="status">
              Getting this universe&rsquo;s address&hellip;
            </p>
          ) : load.kind === 'error' ? (
            <p className="form__message" role="alert" data-testid="connect-ai-error">
              The address couldn&rsquo;t be loaded. Close this and try again.
            </p>
          ) : load.url === null ? (
            <p className="history__quiet" data-testid="connect-ai-unavailable">
              Connecting AI apps isn&rsquo;t set up on this LorEvolve yet.
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
            Close
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
          MCP server URL
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
            Copy URL
          </button>
        </div>
        <p className="connect__hint" id={hintId}>
          This URL is only an address. Anyone who uses it still has to sign in to LorEvolve and be a
          member of this universe. It stays the same if the universe is renamed.
        </p>
        <p className="connect__status" role="status" data-testid="connect-ai-copy-status">
          {copied === 'copied'
            ? 'URL copied.'
            : copied === 'manual'
              ? 'Copying didn’t work here. The URL is selected, so you can copy it yourself.'
              : ''}
        </p>
      </div>

      <section className="connect__section" aria-labelledby={`${inputId}-how`}>
        <h3 className="connect__heading" id={`${inputId}-how`}>
          How to connect
        </h3>
        <ol className="connect__steps">
          <li>Copy the URL above.</li>
          <li>
            In your AI app, add a custom connector or MCP server and paste the URL. Claude, ChatGPT
            and other apps that support remote MCP servers with sign-in can use it.
            {name ? (
              <>
                {' '}
                Name it <q data-testid="connect-ai-name">{name}</q>, so you can tell your universes
                apart: each connection reads one universe only.
              </>
            ) : null}
          </li>
          <li>
            The app opens LorEvolve in your browser. Sign in if you&rsquo;re asked to, check which app
            is asking, and approve it.
          </li>
        </ol>
      </section>

      <section className="connect__section" aria-labelledby={`${inputId}-reads`}>
        <h3 className="connect__heading" id={`${inputId}-reads`}>
          What the app can read
        </h3>
        <ul className="connect__list">
          {READABLE.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="settings__note">
          It reads only this universe, with your access. It can&rsquo;t create, edit or delete
          anything. If you leave this universe, the app stops being able to read it.
        </p>
        <p className="settings__note">
          What the app reads is sent to the AI service behind it, under that service&rsquo;s terms.
          Long manuscripts can use up a lot of the app&rsquo;s context, so it reads prose a section
          at a time. Questions asked this way don&rsquo;t count toward LorEvolve&rsquo;s own Assistant.
        </p>
      </section>

      <p className="connect__manage">
        To disconnect an app, go to{' '}
        <Link to="/app/profile#connected-apps" onClick={onFollow} data-testid="connect-ai-manage">
          Profile, Connected apps
        </Link>
        .
      </p>
    </>
  )
}
