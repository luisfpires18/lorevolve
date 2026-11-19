import { useCallback, useEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { AuthLayout } from '../components/AuthLayout'
import { useAuth } from '../auth/useAuth'
import { ApiError } from '../lib/api'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { t, useI18n } from '../i18n'
import { roleDescription, roleLabel } from '../universes/access'
import {
  acceptClaimedInvitation,
  declineClaimedInvitation,
  getClaimedInvitation,
  INVITATION_EXPIRED,
  INVITATION_OTHER_ACCOUNT,
  type ReceivedInvitation,
} from '../universes/collaborators'
import { Button } from '../components/Button'
import { Announce } from '../components/Announce'
import { errorText } from '../lib/errorText'
import type { Load } from '../lib/useAsyncRead'

/** How the invitation ended without a read failing: declined here, or answered as for another account or expired. */
type Outcome = 'declined' | 'other-account' | 'expired'

/**
 * `/invite/:token` - the link an owner sends by hand, carrying the invitation's protected claim token (ADR 0041
 * amendment).
 *
 * The id finds an invitation; it opens nothing. Signed out, this page says only that someone was invited to collaborate
 * - no universe, owner, role or address - and offers Sign in and Create account, both of which come back here (the
 * same router-state return path every sign-in uses). Signed in, the API answers only the account whose email the
 * invitation names; anyone else is told it is for a different account, and not which.
 */
export default function InvitationPage() {
  const { tx } = useI18n()
  const { token = '' } = useParams<{ token: string }>()
  const { user, isLoading } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const heading = useRef<HTMLHeadingElement>(null)
  const [state, setState] = useState<Load<ReceivedInvitation>>({ kind: 'loading' })
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  useDocumentTitle(t('auth.invitation.title'))

  const settle = useCallback((problem: unknown) => {
    const settled = stateFor(problem)
    if (typeof settled === 'string') setOutcome(settled)
    else setState(settled)
  }, [])

  useEffect(() => {
    if (!user) return
    const controller = new AbortController()
    getClaimedInvitation(token, controller.signal)
      .then((invitation) => setState({ kind: 'ready', value: invitation }))
      .catch((problem: unknown) => {
        if (controller.signal.aborted) return
        settle(problem)
      })
    return () => {
      controller.abort()
    }
  }, [token, user, settle])

  // Each settled state replaces the heading in place, so the reader is taken to it rather than left where they were.
  useEffect(() => {
    if (outcome || state.kind !== 'loading') heading.current?.focus()
  }, [state.kind, outcome])

  async function accept() {
    setBusy(true)
    setActionError(null)
    try {
      const accepted = await acceptClaimedInvitation(token)
      await navigate(`/app/universes/${accepted.universeId}`, { replace: true })
    } catch (problem: unknown) {
      setBusy(false)
      settleOrSay(problem)
    }
  }

  async function decline() {
    setBusy(true)
    setActionError(null)
    try {
      await declineClaimedInvitation(token)
      setOutcome('declined')
    } catch (problem: unknown) {
      settleOrSay(problem)
    } finally {
      setBusy(false)
    }
  }

  function settleOrSay(problem: unknown) {
    if (problem instanceof ApiError && [403, 404, 410].includes(problem.status)) {
      settle(problem)
    } else {
      setActionError(errorText(problem, t('auth.invitation.actionFailed')))
    }
  }

  const back = (
    <Link to="/app" data-testid="invitation-workspace-link">
      {t('auth.invitation.workspace')}
    </Link>
  )

  if (isLoading) {
    return (
      <div
        className="session-pending"
        role="status"
        aria-label={t('auth.invitation.checkingSession')}
      />
    )
  }

  if (!user) {
    const from = { from: location.pathname }
    return (
      <AuthLayout
        heading={t('auth.invitation.signedOut.heading')}
        intro={t('auth.invitation.signedOut.intro')}
        footer={tx('auth.invitation.signedOut.footer', {
          link: <Link to="/">{t('auth.invitation.signedOut.explore')}</Link>,
        })}
      >
        <div className="invite__actions" data-testid="invitation-signed-out">
          <Button to="/login" state={from} data-testid="invitation-sign-in">
            {t('auth.invitation.signedOut.signIn')}
          </Button>
          <Button tone="secondary" to="/register" state={from} data-testid="invitation-register">
            {t('auth.invitation.signedOut.createAccount')}
          </Button>
        </div>
      </AuthLayout>
    )
  }

  if (outcome === 'declined') {
    return (
      <Settled
        headingRef={heading}
        heading={t('auth.invitation.declined.heading')}
        intro={t('auth.invitation.declined.intro')}
        footer={back}
        testId="invitation-declined"
      />
    )
  }

  if (outcome === 'other-account') {
    return (
      <Settled
        headingRef={heading}
        heading={t('auth.invitation.otherAccount.heading')}
        intro={t('auth.invitation.otherAccount.intro')}
        footer={back}
        testId="invitation-other-account"
      />
    )
  }

  if (outcome === 'expired') {
    return (
      <Settled
        headingRef={heading}
        heading={t('auth.invitation.expired.heading')}
        intro={t('auth.invitation.expired.intro')}
        footer={back}
        testId="invitation-expired"
      />
    )
  }

  switch (state.kind) {
    case 'loading':
      return (
        <AuthLayout
          heading={t('auth.invitation.loading.heading')}
          intro={t('auth.invitation.loading.intro')}
          footer={back}
        >
          <Announce>{t('auth.invitation.loading.status')}</Announce>
        </AuthLayout>
      )
    case 'ready': {
      const invitation = state.value
      return (
        <AuthLayout
          headingRef={heading}
          heading={invitation.universeName}
          intro={t('auth.invitation.ready.intro', { role: roleLabel(invitation.role) })}
          footer={back}
        >
          <div data-testid="invitation-ready">
            <p className="invite__role" data-testid="invitation-role">
              {roleDescription(invitation.role)}
            </p>
            {actionError ? (
              <p className="form__message" role="alert" data-testid="invitation-error">
                {actionError}
              </p>
            ) : null}
            <div className="invite__actions">
              <Button
                busy={busy}
                busyLabel={t('auth.invitation.ready.working')}
                onClick={() => void accept()}
                data-testid="invitation-accept"
              >
                {t('auth.invitation.ready.accept')}
              </Button>
              <Button
                tone="secondary"
                busy={busy}
                onClick={() => void decline()}
                data-testid="invitation-decline"
              >
                {t('auth.invitation.ready.decline')}
              </Button>
            </div>
          </div>
        </AuthLayout>
      )
    }
    case 'missing':
      return (
        <Settled
          headingRef={heading}
          heading={t('auth.invitation.gone.heading')}
          intro={t('auth.invitation.gone.intro')}
          footer={back}
          testId="invitation-gone"
        />
      )
    case 'error':
      return (
        <Settled
          headingRef={heading}
          heading={t('auth.invitation.error.heading')}
          intro={state.message}
          footer={back}
          testId="invitation-load-error"
        />
      )
  }
}

/** A state with nothing to do but read it and go back. */
function Settled({
  heading,
  intro,
  footer,
  testId,
  headingRef,
}: {
  heading: string
  intro: string
  footer: ReactNode
  testId: string
  headingRef: Ref<HTMLHeadingElement>
}) {
  return (
    <AuthLayout headingRef={headingRef} heading={heading} intro={intro} footer={footer}>
      <span data-testid={testId} hidden />
    </AuthLayout>
  )
}

function stateFor(problem: unknown): Outcome | Load<never> {
  if (problem instanceof ApiError) {
    if (problem.code === INVITATION_OTHER_ACCOUNT) return 'other-account'
    if (problem.code === INVITATION_EXPIRED) return 'expired'
    if (problem.status === 404) return { kind: 'missing' }
  }
  return {
    kind: 'error',
    message: errorText(problem, t('auth.invitation.retryLater')),
  }
}
