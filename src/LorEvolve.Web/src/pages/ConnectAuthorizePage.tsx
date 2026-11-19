import { useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import type { ConsentToken } from '../mcp/api'
import { useI18n } from '../i18n'
import { ConsentDetails } from '../components/mcp/ConsentDetails'
import { ConsentLayout } from '../components/mcp/ConsentLayout'
import { useConnectionRequest, type Load } from '../mcp/useConnectionRequest'
import { Button } from '../components/Button'
import { LoadingNote } from '../components/LoadingNote'

/** The field the decision travels in, beside the request's own parameters. Read by `OAuthEndpoints` on the server. */
const DECISION_FIELD = 'lorevolve_decision'

/**
 * The consent screen (ADR 0046). An AI app sent the browser to LorEvolve's authorization endpoint, which validated the
 * request and handed it here unchanged, in the address. This screen shows who is asking and for which universe, and
 * posts the same parameters back with the person's decision and the antiforgery token it read for this account - a
 * same-site post that carries the session, which the server validates all over again before anything is approved. A post
 * without that token, however it rides the session, is sent back here. Approve and Deny are the only ways on; nothing is ever
 * approved without one of them being pressed.
 */
export default function ConnectAuthorizePage() {
  const { t, tx } = useI18n()
  const { search } = useLocation()
  const { user } = useAuth()
  const params = useMemo(() => new URLSearchParams(search), [search])
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [deciding, setDeciding] = useState(false)
  const [token, setToken] = useState<ConsentToken | null>(null)
  const submitted = useRef(false)
  const detailsId = useId()

  useDocumentTitle(t('universe.connect.title'))

  useConnectionRequest({ params, setLoad, setToken })

  // The request exactly as it arrived, for the post back. Repeated names (more than one resource) stay repeated.
  const fields = [...params.entries()].filter(
    ([name]) => name !== DECISION_FIELD && name !== token?.fieldName,
  )

  // One decision per screen. The buttons are not disabled: a disabled submit button would leave its own value - the
  // decision - out of the post. A second press is simply not sent.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (submitted.current) {
      event.preventDefault()
      return
    }
    submitted.current = true
    setDeciding(true)
  }

  // The form holds what is being decided as well as the decision, so its buttons can stay pinned to the foot of the
  // screen while a long request scrolls past them (`.consent__actions`).
  const decide = (content: ReactNode) => (
    <form
      className="consent__form"
      method="post"
      action="/oauth/authorize"
      onSubmit={onSubmit}
      aria-busy={deciding}
      data-testid="consent-form"
    >
      {fields.map(([name, value], index) => (
        <input key={`${name}-${index}`} type="hidden" name={name} value={value} />
      ))}
      {token ? <input type="hidden" name={token.fieldName} value={token.token} /> : null}
      {content}
      <div className="form__actions consent__actions">
        {load.kind === 'ready' ? (
          <Button
            type="submit"
            name={DECISION_FIELD}
            value="approve"
            aria-describedby={detailsId}
            data-testid="consent-approve"
          >
            {deciding ? t('universe.connect.connecting') : t('universe.connect.approve')}
          </Button>
        ) : null}
        <Button
          tone="secondary"
          type="submit"
          name={DECISION_FIELD}
          value="deny"
          data-testid="consent-deny"
        >
          {load.kind === 'ready' ? t('universe.connect.deny') : t('universe.connect.goBack')}
        </Button>
      </div>
    </form>
  )

  // A request to decide on, or one to turn down: either way the decision waits for the antiforgery token.
  const request =
    load.kind === 'no-access' ? (
      <div className="notice notice--error" role="alert" data-testid="consent-no-access">
        <p>{t('universe.connect.noAccount')}</p>
        <p>{t('universe.connect.noAccountNote')}</p>
      </div>
    ) : load.kind === 'ready' ? (
      <ConsentDetails details={load.details} id={detailsId} />
    ) : null

  return (
    <ConsentLayout
      heading={t('universe.connect.heading')}
      intro={
        // The gist, above the fold even when the warnings below are long (issue 38): read-only, manuscripts included,
        // and where the content goes. The full list and notes follow unchanged.
        <>
          {tx(
            load.kind === 'ready' && load.details.proposalsRequested && load.details.canPropose
              ? 'universe.connect.introProposals'
              : 'universe.connect.intro',
            { readOnly: <strong>{t('universe.connect.introReadOnly')}</strong> },
          )}
        </>
      }
      footer={
        user ? (
          <>
            {tx('universe.connect.signedIn', {
              name: <bdi>{user.username}</bdi>,
              link: (
                <Link to="/app/profile?tab=connected-apps#connected-apps">
                  {t('universe.connect.connectedApps')}
                </Link>
              ),
            })}
          </>
        ) : null
      }
    >
      {load.kind === 'loading' ? (
        <LoadingNote>{t('universe.connect.checking')}</LoadingNote>
      ) : load.kind === 'invalid' ? (
        // An app or a return address LorEvolve does not recognise: there is nowhere trusted to send the browser back to.
        <div className="notice notice--error" role="alert" data-testid="consent-invalid">
          <p>{t('universe.connect.invalid')}</p>
          <p>{t('universe.connect.invalidNote')}</p>
        </div>
      ) : load.kind === 'error' ? (
        <div className="notice notice--error" role="alert" data-testid="consent-error">
          <p>{t('universe.connect.checkFailed')}</p>
        </div>
      ) : token ? (
        decide(request)
      ) : (
        request
      )}
    </ConsentLayout>
  )
}
