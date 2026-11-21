import { useId, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import type { ConsentToken } from '../mcp/api'
import { useI18n } from '../i18n'
import { AuthLayout } from '../components/AuthLayout'
import { ConsentDetails } from '../components/mcp/ConsentDetails'
import { ConsentForm } from '../components/mcp/ConsentForm'
import { useConnectionRequest, type Load } from '../mcp/useConnectionRequest'
import { Callout } from '../components/Callout'
import { LoadError } from '../components/LoadError'
import { LoadingNote } from '../components/LoadingNote'

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
  const [token, setToken] = useState<ConsentToken | null>(null)
  const detailsId = useId()

  useDocumentTitle(t('universe.connect.title'))

  useConnectionRequest({ params, setLoad, setToken })

  // A request to decide on, or one to turn down: either way the decision waits for the antiforgery token.
  const request =
    load.kind === 'no-access' ? (
      <Callout look="notice" tone="error" role="alert" testId="consent-no-access">
        <p>{t('universe.connect.noAccount')}</p>
        <p>{t('universe.connect.noAccountNote')}</p>
      </Callout>
    ) : load.kind === 'ready' ? (
      <ConsentDetails details={load.details} id={detailsId} />
    ) : null

  return (
    <AuthLayout
      variant="card"
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
        <Callout look="notice" tone="error" role="alert" testId="consent-invalid">
          <p>{t('universe.connect.invalid')}</p>
          <p>{t('universe.connect.invalidNote')}</p>
        </Callout>
      ) : load.kind === 'error' ? (
        // No retry: the request is read once, from the address.
        <LoadError message={t('universe.connect.checkFailed')} testId="consent-error" />
      ) : token ? (
        <ConsentForm
          params={params}
          token={token}
          ready={load.kind === 'ready'}
          detailsId={detailsId}
        >
          {request}
        </ConsentForm>
      ) : (
        request
      )}
    </AuthLayout>
  )
}
