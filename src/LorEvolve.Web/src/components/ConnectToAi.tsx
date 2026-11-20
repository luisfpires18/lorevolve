import { useCallback, useId, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Plug } from 'lucide-react'
import { Drawer } from './Drawer'
import { Field } from './Field'
import { useI18n } from '../i18n'
import { getMcpConnectInfo, readable } from '../mcp/api'
import { Button } from './Button'
import { FormActions } from './FormActions'
import { QuietNote } from './QuietNote'
import { useAsyncRead } from '../lib/useAsyncRead'

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
  // Open for one address only: following the Profile link closes it.
  const [openAt, setOpenAt] = useState<string | null>(null)
  const isOpen = openAt === location.key

  return (
    <>
      <Button
        tone="secondary"
        icon={Plug}
        aria-haspopup="dialog"
        onClick={() => setOpenAt(location.key)}
        data-testid="connect-ai-trigger"
      >
        {t('ai.connect.trigger')}
      </Button>

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
  const headingId = useId()
  const read = useCallback(
    (signal: AbortSignal) =>
      getMcpConnectInfo(universeId, signal).then((info) => ({
        url: info.mcpUrl,
        name: info.suggestedName ?? null,
      })),
    [universeId],
  )
  const { load } = useAsyncRead(read)

  return (
    <Drawer
      testId="connect-ai-drawer"
      titleId={headingId}
      className="connectdrawer"
      bodyClassName="connect__body"
      eyebrow={t('ai.connect.eyebrow')}
      title={<bdi>{universeName}</bdi>}
      context={
        <QuietNote size="ui" wrap className="drawer__context">
          {t('ai.connect.context')}
        </QuietNote>
      }
      onClose={onClose}
      actions={(close) => (
        <FormActions onCancel={close} dismiss="close" cancelTestId="connect-ai-close" />
      )}
    >
      {load.kind === 'loading' ? (
        <QuietNote className="history__quiet" size="ui" role="status">
          {t('ai.connect.loading')}
        </QuietNote>
      ) : load.kind !== 'ready' ? (
        <p className="form__message" role="alert" data-testid="connect-ai-error">
          {t('ai.connect.loadFailed')}
        </p>
      ) : load.value.url === null ? (
        <QuietNote className="history__quiet" size="ui" testId="connect-ai-unavailable">
          {t('ai.connect.unavailable')}
        </QuietNote>
      ) : (
        <ConnectSteps url={load.value.url} name={load.value.name} onFollow={onClose} />
      )}
    </Drawer>
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
      <Field label={t('ai.connect.urlLabel')} id={inputId} className="connect__url">
        {() => (
          <>
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
              <Button onClick={() => void copy()} data-testid="connect-ai-copy">
                {t('ai.connect.copy')}
              </Button>
            </div>
            <p className="connect__hint" id={hintId}>
              {t('ai.connect.urlHint')}
            </p>
            <p className="connect__status" role="status" data-testid="connect-ai-copy-status">
              {copied === 'copied'
                ? t('ai.connect.copied')
                : copied === 'manual'
                  ? t('ai.connect.copyManual')
                  : ''}
            </p>
          </>
        )}
      </Field>

      <section className="connect__section" aria-labelledby={`${inputId}-how`}>
        <h3 className="connect__heading" id={`${inputId}-how`}>
          {t('ai.connect.how')}
        </h3>
        <ol className="connect__steps">
          <li>{t('ai.connect.step1')}</li>
          <li>
            {t('ai.connect.step2')}
            {name ? (
              <>
                {' '}
                {tx('ai.connect.step2Name', {
                  name: <q data-testid="connect-ai-name">{name}</q>,
                })}
              </>
            ) : null}
          </li>
          <li>{t('ai.connect.step3')}</li>
        </ol>
      </section>

      <section className="connect__section" aria-labelledby={`${inputId}-reads`}>
        <h3 className="connect__heading" id={`${inputId}-reads`}>
          {t('ai.connect.reads')}
        </h3>
        <ul className="connect__list">
          {readable().map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="settings__note">{t('ai.connect.readsNote')}</p>
        <p className="settings__note">{t('ai.connect.privacyNote')}</p>
      </section>

      <QuietNote className="connect__manage" size="ui" wrap>
        {tx('ai.connect.manage', {
          link: (
            <Link
              to="/app/profile?tab=connected-apps#connected-apps"
              onClick={onFollow}
              data-testid="connect-ai-manage"
            >
              {t('ai.connect.manageLink')}
            </Link>
          ),
        })}
      </QuietNote>
    </>
  )
}
